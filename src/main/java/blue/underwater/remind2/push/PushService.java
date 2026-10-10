package blue.underwater.remind2.push;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Notificaciones push para la pregunta de ánimo.
 *
 * Se manda un push SIN contenido: el protocolo Web Push solo exige cifrar el
 * cuerpo, así que sin cuerpo alcanza con la firma VAPID (un JWT ES256, que
 * Java firma solo) y no hace falta ninguna librería. El texto de la
 * notificación lo pone el service worker (frontend/public/sw.js).
 *
 * Todo el estado — el par de claves VAPID, las suscripciones y cuándo se
 * preguntó/respondió por última vez — vive en un archivo del volumen
 * persistente, para sobrevivir a los deploys. Las claves se generan solas la
 * primera vez; si se perdieran, las suscripciones existentes dejan de servir
 * y hay que volver a activar las notificaciones desde el menú.
 */
@Service
public class PushService {

    private static final Logger log = LoggerFactory.getLogger(PushService.class);

    // Después de una respuesta se espera ASK_EVERY; si un aviso queda sin
    // responder, se insiste cada REMIND_EVERY hasta que haya respuesta.
    private static final Duration ASK_EVERY = Duration.ofHours(3);
    private static final Duration REMIND_EVERY = Duration.ofHours(1);
    // No se manda nada de noche: horario local del usuario, [9, 22).
    private static final int QUIET_UNTIL_HOUR = 9;
    private static final int QUIET_FROM_HOUR = 22;
    private static final String VAPID_SUBJECT = "https://remind2.up.railway.app";
    // El endpoint lo manda el navegador y el servidor le hace un POST: solo
    // se aceptan los servicios de push conocidos, para que no sirva de proxy.
    private static final List<String> PUSH_HOSTS = List.of(
            ".push.apple.com", ".googleapis.com", ".push.services.mozilla.com", ".notify.windows.com");

    public record Subscription(String endpoint, String timeZone) {
    }

    public static class UserState {
        public List<Subscription> subscriptions = new ArrayList<>();
        public long lastAnsweredAt;
        public long lastPushedAt;
    }

    public static class State {
        public String vapidPrivateKey; // PKCS#8, base64
        public String vapidPublicKey; // punto P-256 sin comprimir, base64url: lo que pide el navegador
        public Map<String, UserState> users = new HashMap<>();
    }

    private final ObjectMapper mapper;
    private final Path file;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private State state;

    public PushService(ObjectMapper mapper) throws Exception {
        this.mapper = mapper;
        String volume = System.getenv().getOrDefault("RAILWAY_VOLUME_MOUNT_PATH", "user_tokens");
        this.file = Path.of(volume, "push.json");
        this.state = load();
        if (state.vapidPrivateKey == null) {
            generateVapidKeys();
            save();
        }
    }

    // Un archivo ilegible no debe impedir que la app arranque: se empieza de
    // cero (hay que volver a activar las notificaciones) y se deja constancia.
    private State load() {
        if (!Files.exists(file)) {
            return new State();
        }
        try {
            return mapper.readValue(file.toFile(), State.class);
        } catch (IOException e) {
            log.error("Could not read push state from {}, starting empty: {}", file, e.toString());
            return new State();
        }
    }

    public synchronized String publicKey() {
        return state.vapidPublicKey;
    }

    /** Registra el dispositivo y le manda una notificación ya mismo, como confirmación. */
    public synchronized boolean subscribe(String userId, String endpoint, String timeZone) {
        if (!isPushEndpoint(endpoint)) {
            return false;
        }
        UserState user = state.users.computeIfAbsent(userId, id -> new UserState());
        user.subscriptions.removeIf(s -> s.endpoint().equals(endpoint));
        user.subscriptions.add(new Subscription(endpoint, timeZone));
        user.lastPushedAt = System.currentTimeMillis();
        save();
        send(user, endpoint);
        return true;
    }

    public synchronized void unsubscribe(String userId, String endpoint) {
        UserState user = state.users.get(userId);
        if (user != null && user.subscriptions.removeIf(s -> s.endpoint().equals(endpoint))) {
            save();
        }
    }

    /** El usuario respondió la pregunta: la próxima notificación sale recién ASK_EVERY después. */
    public synchronized void markAnswered(String userId) {
        UserState user = state.users.get(userId);
        if (user != null) {
            user.lastAnsweredAt = System.currentTimeMillis();
            save();
        }
    }

    @Scheduled(fixedDelay = 5 * 60 * 1000, initialDelay = 60 * 1000)
    public synchronized void sendDue() {
        long now = System.currentTimeMillis();
        boolean changed = false;
        for (UserState user : state.users.values()) {
            if (user.subscriptions.isEmpty()
                    || now - user.lastAnsweredAt < ASK_EVERY.toMillis()
                    || now - user.lastPushedAt < REMIND_EVERY.toMillis()
                    || isQuietHour(user.subscriptions.get(0).timeZone())) {
                continue;
            }
            for (Subscription subscription : List.copyOf(user.subscriptions)) {
                send(user, subscription.endpoint());
            }
            user.lastPushedAt = now;
            changed = true;
        }
        if (changed) {
            save();
        }
    }

    private static boolean isQuietHour(String timeZone) {
        ZoneId zone;
        try {
            zone = ZoneId.of(timeZone);
        } catch (Exception e) {
            zone = ZoneId.of("UTC");
        }
        int hour = ZonedDateTime.now(zone).getHour();
        return hour < QUIET_UNTIL_HOUR || hour >= QUIET_FROM_HOUR;
    }

    private static boolean isPushEndpoint(String endpoint) {
        try {
            URI uri = URI.create(endpoint);
            String host = uri.getHost();
            return "https".equals(uri.getScheme()) && host != null
                    && PUSH_HOSTS.stream().anyMatch(suffix -> ("." + host).endsWith(suffix));
        } catch (Exception e) {
            return false;
        }
    }

    private void send(UserState user, String endpoint) {
        try {
            URI uri = URI.create(endpoint);
            HttpRequest request = HttpRequest.newBuilder(uri)
                    .timeout(Duration.ofSeconds(15))
                    // Si el teléfono está apagado más de una hora, la pregunta ya no viene al caso.
                    .header("TTL", "3600")
                    .header("Urgency", "normal")
                    .header("Authorization", "vapid t=" + vapidToken(uri) + ", k=" + state.vapidPublicKey)
                    .POST(HttpRequest.BodyPublishers.noBody())
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            int status = response.statusCode();
            if (status == 404 || status == 410) {
                // El navegador dio de baja la suscripción (app desinstalada, permiso revocado).
                user.subscriptions.removeIf(s -> s.endpoint().equals(endpoint));
                save();
                log.info("Push subscription expired, removed ({})", uri.getHost());
            } else if (status >= 300) {
                log.warn("Push to {} failed: HTTP {} {}", uri.getHost(), status, response.body());
            } else {
                log.info("Push sent to {} (HTTP {})", uri.getHost(), status);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.warn("Push failed: {}", e.toString());
        }
    }

    // VAPID (RFC 8292): un JWT firmado con la clave privada, con el origen del
    // servicio de push como audiencia. Vale 12 horas (el máximo permitido es 24).
    private String vapidToken(URI endpoint) throws Exception {
        String audience = endpoint.getScheme() + "://" + endpoint.getHost();
        String header = base64Url("{\"typ\":\"JWT\",\"alg\":\"ES256\"}".getBytes(StandardCharsets.UTF_8));
        String claims = base64Url(mapper.writeValueAsBytes(Map.of(
                "aud", audience,
                "exp", Instant.now().plus(Duration.ofHours(12)).getEpochSecond(),
                "sub", VAPID_SUBJECT)));
        String signingInput = header + "." + claims;

        PrivateKey privateKey = KeyFactory.getInstance("EC")
                .generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(state.vapidPrivateKey)));
        // P1363 = r||s crudo, que es el formato de firma que usa JWT (no el DER por defecto de Java).
        Signature signature = Signature.getInstance("SHA256withECDSAinP1363Format");
        signature.initSign(privateKey);
        signature.update(signingInput.getBytes(StandardCharsets.UTF_8));
        return signingInput + "." + base64Url(signature.sign());
    }

    private void generateVapidKeys() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair pair = generator.generateKeyPair();

        ECPublicKey publicKey = (ECPublicKey) pair.getPublic();
        byte[] point = new byte[65];
        point[0] = 0x04; // punto sin comprimir: 0x04 || X || Y
        copyCoordinate(publicKey.getW().getAffineX().toByteArray(), point, 1);
        copyCoordinate(publicKey.getW().getAffineY().toByteArray(), point, 33);

        state.vapidPublicKey = base64Url(point);
        state.vapidPrivateKey = Base64.getEncoder().encodeToString(pair.getPrivate().getEncoded());
        log.info("Generated a new VAPID key pair for push notifications");
    }

    // BigInteger.toByteArray() puede traer un 0 de signo adelante o venir más corto que 32 bytes.
    private static void copyCoordinate(byte[] value, byte[] target, int offset) {
        int length = Math.min(value.length, 32);
        System.arraycopy(value, value.length - length, target, offset + 32 - length, length);
    }

    private static String base64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private void save() {
        try {
            Files.createDirectories(file.toAbsolutePath().getParent());
            mapper.writeValue(file.toFile(), state);
        } catch (IOException e) {
            log.error("Could not persist push state to {}: {}", file, e.toString());
        }
    }
}
