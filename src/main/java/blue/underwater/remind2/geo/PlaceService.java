package blue.underwater.remind2.geo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Pasa de coordenadas a un nombre de lugar legible ("Ebertstraße, Mitte,
 * Berlín") con Nominatim, el geocodificador de OpenStreetMap: gratis y sin
 * API key, a cambio de mandar un User-Agent que identifique a la app y no
 * pasar de un pedido por segundo — de sobra para una nota a la vez.
 *
 * Nunca falla hacia afuera: el lugar es un extra de la nota, así que ante
 * cualquier error o demora se devuelve null y la nota se guarda igual, solo
 * con las coordenadas.
 */
@Service
public class PlaceService {

    private static final Logger log = LoggerFactory.getLogger(PlaceService.class);

    private static final String USER_AGENT = "re.mind2 (https://remind2.up.railway.app)";
    private static final Duration TIMEOUT = Duration.ofSeconds(4);
    // De lo más puntual a lo más general; se toma el primero que venga de cada grupo.
    private static final String[] LOCAL_AREA_KEYS = {"suburb", "neighbourhood", "quarter", "city_district", "hamlet"};
    private static final String[] TOWN_KEYS = {"city", "town", "village", "municipality", "county"};

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();
    private final ObjectMapper json = new ObjectMapper();

    /**
     * Contenido de una celda Location de la planilla: el nombre del lugar
     * seguido de las coordenadas entre paréntesis, solo las coordenadas si no
     * se pudo averiguar el lugar, o vacío si no hay ubicación (opción apagada
     * en el menú, permiso denegado o GPS sin señal).
     */
    public String locationCell(Double lat, Double lng) {
        if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
            return "";
        }
        String coordinates = String.format(Locale.ROOT, "(%.5f, %.5f)", lat, lng);
        String place = describe(lat, lng);
        return place == null ? coordinates : place + " " + coordinates;
    }

    /** Nombre del lugar, o null si no se pudo averiguar. */
    public String describe(double lat, double lng) {
        try {
            URI uri = URI.create(String.format(Locale.ROOT,
                    "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=%.6f&lon=%.6f"
                            + "&zoom=16&addressdetails=1&accept-language=es", lat, lng));
            HttpRequest request = HttpRequest.newBuilder(uri)
                    .header("User-Agent", USER_AGENT)
                    .timeout(TIMEOUT)
                    .GET()
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("Reverse geocoding returned HTTP {}", response.statusCode());
                return null;
            }

            JsonNode address = json.readTree(response.body()).path("address");
            // Set: en pueblos chicos el mismo nombre viene en más de un campo.
            Set<String> parts = new LinkedHashSet<>();
            addFirst(parts, address, "road");
            addFirst(parts, address, LOCAL_AREA_KEYS);
            addFirst(parts, address, TOWN_KEYS);
            return parts.isEmpty() ? null : String.join(", ", parts);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        } catch (Exception e) {
            log.warn("Reverse geocoding failed: {}", e.toString());
            return null;
        }
    }

    private static void addFirst(Set<String> parts, JsonNode address, String... keys) {
        for (String key : keys) {
            String value = address.path(key).asText("");
            if (!value.isBlank()) {
                parts.add(value);
                return;
            }
        }
    }
}
