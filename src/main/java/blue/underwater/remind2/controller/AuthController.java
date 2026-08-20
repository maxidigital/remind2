package blue.underwater.remind2.controller;

import blue.underwater.remind2.auth.GoogleAuthService;
import blue.underwater.remind2.auth.GoogleIdentity;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
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

    private final GoogleAuthService authService;

    public AuthController(GoogleAuthService authService) {
        this.authService = authService;
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
        session.setAttribute("userId", identity.sub());
        session.setAttribute("email", identity.email());
        response.sendRedirect("/");
    }

    @GetMapping("/api/me")
    public Map<String, Object> me(HttpSession session) {
        Object userId = session.getAttribute("userId");
        Map<String, Object> result = new HashMap<>();
        if (userId == null) {
            result.put("authenticated", false);
        } else {
            result.put("authenticated", true);
            result.put("email", session.getAttribute("email"));
        }
        return result;
    }

    @PostMapping("/logout")
    public void logout(HttpSession session, HttpServletResponse response) throws IOException {
        session.invalidate();
        response.sendRedirect("/");
    }
}
