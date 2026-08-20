package blue.underwater.remind2.controller;

import blue.underwater.remind2.auth.GoogleAuthService;
import blue.underwater.remind2.auth.GoogleIdentity;
import blue.underwater.remind2.auth.SessionCookie;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
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

    private static final int COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 180 days

    private final GoogleAuthService authService;
    private final SessionCookie sessionCookie;

    public AuthController(GoogleAuthService authService, SessionCookie sessionCookie) {
        this.authService = authService;
        this.sessionCookie = sessionCookie;
    }

    @GetMapping("/login")
    public void login(HttpSession session, HttpServletResponse response) throws IOException {
        String state = UUID.randomUUID().toString();
        session.setAttribute("oauthState", state);
        response.sendRedirect(authService.buildAuthorizationUrl(state));
    }

    @GetMapping("/oauth2/callback")
    public void callback(@RequestParam String code,
                          @RequestParam(required = false) String state,
                          HttpSession session,
                          HttpServletResponse response) throws IOException {
        Object expectedState = session.getAttribute("oauthState");
        if (expectedState == null || !expectedState.equals(state)) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "Invalid OAuth state");
            return;
        }
        session.removeAttribute("oauthState");

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
        }
        return result;
    }

    @PostMapping("/logout")
    public void logout(HttpServletResponse response) {
        setAuthCookie(response, "");
    }

    private void setAuthCookie(HttpServletResponse response, String value) {
        int maxAge = value.isEmpty() ? 0 : COOKIE_MAX_AGE_SECONDS;
        response.addHeader("Set-Cookie",
                SessionCookie.COOKIE_NAME + "=" + value
                        + "; Path=/; Max-Age=" + maxAge
                        + "; HttpOnly; Secure; SameSite=Lax");
    }
}
