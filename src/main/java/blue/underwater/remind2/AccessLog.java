package blue.underwater.remind2;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Registro de uso: una línea JSON por evento en {@code access-log.jsonl}, firmada con el
 * email de la sesión de Google. Portado de misnotas ({@code server/index.mjs}), salvo que
 * acá la identidad ya viene de la cookie de sesión, así que no hay pantalla que pida el
 * nombre.
 *
 * <p>El archivo vive en el volumen persistente ({@code /app/user_tokens} en prod, el mismo
 * de {@code UserCredentialsStore}); se puede mover con la env {@code ACCESS_LOG_FILE}.
 * Nunca propaga excepciones: si falla la escritura, deja un WARN y la request sigue.
 */
@Component
public class AccessLog {

    private static final Logger log = LoggerFactory.getLogger(AccessLog.class);

    private final Path file;
    private final ObjectMapper mapper;
    private final Object writeLock = new Object();

    public AccessLog(ObjectMapper mapper) {
        this.mapper = mapper;
        String explicit = System.getenv("ACCESS_LOG_FILE");
        if (explicit != null && !explicit.isBlank()) {
            this.file = Path.of(explicit);
        } else {
            String volume = System.getenv().getOrDefault("RAILWAY_VOLUME_MOUNT_PATH", "user_tokens");
            this.file = Path.of(volume, "access-log.jsonl");
        }
    }

    /** Registra un evento sin datos extra. */
    public void record(String email, String event) {
        record(email, event, null);
    }

    /**
     * Registra {@code {ts, email, event, ...extra}} como una línea JSON.
     * {@code extra} puede ser null. Cualquier fallo se traga con un WARN.
     */
    public void record(String email, String event, Map<String, Object> extra) {
        try {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("ts", Instant.now().toString());
            entry.put("email", clean(email));
            entry.put("event", clean(event));
            if (extra != null) {
                entry.putAll(extra);
            }
            String line = mapper.writeValueAsString(entry) + "\n";
            synchronized (writeLock) {
                Files.writeString(file, line, StandardCharsets.UTF_8,
                        StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            }
        } catch (IOException | RuntimeException e) {
            log.warn("No se pudo escribir el access-log ({} {}): {}", event, email, e.toString());
        }
    }

    private static String clean(String s) {
        if (s == null) {
            return "";
        }
        return s.replace('\n', ' ').replace('\r', ' ');
    }
}
