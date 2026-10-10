package blue.underwater.remind2.controller;

import blue.underwater.remind2.AccessLog;
import blue.underwater.remind2.auth.SessionCookie;
import blue.underwater.remind2.push.PushService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.Map;

@RestController
@RequestMapping("/api/push")
public class PushController {

    private final SessionCookie sessionCookie;
    private final PushService pushService;
    private final AccessLog accessLog;

    public PushController(SessionCookie sessionCookie, PushService pushService, AccessLog accessLog) {
        this.sessionCookie = sessionCookie;
        this.pushService = pushService;
        this.accessLog = accessLog;
    }

    public record SubscriptionRequest(String endpoint, String timeZone) {
    }

    /** Clave pública que el navegador necesita para suscribirse. */
    @GetMapping("/key")
    public Map<String, String> key() {
        return Map.of("key", pushService.publicKey());
    }

    @PostMapping("/subscribe")
    public void subscribe(@RequestBody SubscriptionRequest request,
                           @CookieValue(name = SessionCookie.COOKIE_NAME, required = false) String authCookie,
                           HttpServletResponse response) throws IOException {
        SessionCookie.Identity identity = sessionCookie.verify(authCookie);
        if (identity == null) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }
        if (request.endpoint() == null
                || !pushService.subscribe(identity.userId(), request.endpoint(), request.timeZone())) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST);
            return;
        }
        accessLog.record(identity.email(), "push.subscribe");
    }

    @PostMapping("/unsubscribe")
    public void unsubscribe(@RequestBody SubscriptionRequest request,
                             @CookieValue(name = SessionCookie.COOKIE_NAME, required = false) String authCookie,
                             HttpServletResponse response) throws IOException {
        SessionCookie.Identity identity = sessionCookie.verify(authCookie);
        if (identity == null) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }
        if (request.endpoint() != null) {
            pushService.unsubscribe(identity.userId(), request.endpoint());
        }
        accessLog.record(identity.email(), "push.unsubscribe");
    }
}
