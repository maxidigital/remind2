package blue.underwater.remind2.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Base64;

/**
 * Identity is carried in a signed cookie instead of a server-side
 * HttpSession, so a login survives redeploys: a new container starts with
 * no memory of old sessions, but a signed cookie proves identity on its
 * own, without needing any server-side state to check it against.
 */
@Component
public class SessionCookie {

    public static final String COOKIE_NAME = "remind2_user";

    private static final String ALGORITHM = "HmacSHA256";

    private final byte[] secret;

    public SessionCookie(@Value("${SESSION_SECRET:}") String secret) {
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }

    public record Identity(String userId, String email) {
    }

    public String create(String userId, String email) {
        String payload = encode(userId) + "." + encode(email);
        return payload + "." + sign(payload);
    }

    public Identity verify(String cookieValue) {
        if (cookieValue == null) {
            return null;
        }
        String[] parts = cookieValue.split("\\.");
        if (parts.length != 3) {
            return null;
        }
        String payload = parts[0] + "." + parts[1];
        if (!sign(payload).equals(parts[2])) {
            return null;
        }
        return new Identity(decode(parts[0]), decode(parts[1]));
    }

    private String sign(String payload) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(secret, ALGORITHM));
            byte[] raw = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String encode(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String decode(String value) {
        return new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
    }
}
