package blue.underwater.remind2.controller;

import blue.underwater.remind2.AccessLog;
import blue.underwater.remind2.auth.GoogleAuthService;
import blue.underwater.remind2.auth.GoogleIdentity;
import blue.underwater.remind2.auth.SessionCookie;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@RestController
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private static final int COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 180 days

    // El state de OAuth viaja en una cookie corta en vez de en la HttpSession:
    // la sesión vive en la memoria del contenedor, así que un deploy en medio
    // de un login (o cualquier pérdida del JSESSIONID) lo rompía con un 400.
    private static final String STATE_COOKIE_NAME = "remind2_oauth_state";
    private static final int STATE_COOKIE_MAX_AGE_SECONDS = 60 * 10;

    private final GoogleAuthService authService;
    private final SessionCookie sessionCookie;
    private final AccessLog accessLog;

    public AuthController(GoogleAuthService authService, SessionCookie sessionCookie, AccessLog accessLog) {
        this.authService = authService;
        this.sessionCookie = sessionCookie;
        this.accessLog = accessLog;
    }

    @GetMapping("/login")
    public void login(HttpServletResponse response) throws IOException {
        String state = UUID.randomUUID().toString();
        setCookie(response, STATE_COOKIE_NAME, state, STATE_COOKIE_MAX_AGE_SECONDS);
        response.sendRedirect(authService.buildAuthorizationUrl(state));
    }

    @GetMapping("/oauth2/callback")
    public void callback(@RequestParam String code,
                          @RequestParam(required = false) String state,
                          @CookieValue(name = STATE_COOKIE_NAME, required = false) String expectedState,
                          HttpServletResponse response) throws IOException {
        if (expectedState == null || !expectedState.equals(state)) {
            // Sin cookie: el navegador no la devolvió (login empezado en otro
            // navegador/host, cookies bloqueadas, o pasaron más de 10 minutos).
            // Distinta: hubo otro /login después del que generó este callback.
            log.warn("OAuth callback rejected: {}",
                    expectedState == null ? "state cookie missing" : "state does not match cookie");
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "Invalid OAuth state");
            return;
        }
        setCookie(response, STATE_COOKIE_NAME, "", 0);

        GoogleIdentity identity = authService.handleCallback(code);
        setAuthCookie(response, sessionCookie.create(identity.sub(), identity.email()));
        response.sendRedirect("/");
    }

    @GetMapping("/api/me")
    public Map<String, Object> me(@CookieValue(name = SessionCookie.COOKIE_NAME, required = false) String authCookie) {
        SessionCookie.Identity identity = sessionCookie.verify(authCookie);
        Map<String, Object> result = new HashMap<>();
        if (identity == null) {
            result.put("authenticated", false);
        } else {
            result.put("authenticated", true);
            result.put("email", identity.email());
            accessLog.record(identity.email(), "open");
        }
        return result;
    }

    @PostMapping("/logout")
    public void logout(HttpServletResponse response) {
        setAuthCookie(response, "");
    }

    private void setAuthCookie(HttpServletResponse response, String value) {
        setCookie(response, SessionCookie.COOKIE_NAME, value, value.isEmpty() ? 0 : COOKIE_MAX_AGE_SECONDS);
    }

    // SameSite=Lax (no Strict): el callback llega como redirección desde
    // accounts.google.com y la cookie de state tiene que viajar en ese pedido.
    private void setCookie(HttpServletResponse response, String name, String value, int maxAge) {
        response.addHeader("Set-Cookie",
                name + "=" + value
                        + "; Path=/; Max-Age=" + maxAge
                        + "; HttpOnly; Secure; SameSite=Lax");
    }
}
