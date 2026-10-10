package blue.underwater.remind2.controller;

import blue.underwater.remind2.AccessLog;
import blue.underwater.remind2.auth.SessionCookie;
import blue.underwater.remind2.auth.UserCredentialsStore;
import blue.underwater.remind2.exception.UpstreamServiceException;
import blue.underwater.remind2.geo.PlaceService;
import blue.underwater.remind2.push.PushService;
import blue.underwater.remind2.sheets.MoodSheetService;
import blue.underwater.remind2.sheets.UserSpreadsheetService;
import com.google.api.client.auth.oauth2.Credential;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;

@RestController
public class MoodController {

    private static final Logger log = LoggerFactory.getLogger(MoodController.class);

    private final SessionCookie sessionCookie;
    private final UserCredentialsStore credentialsStore;
    private final UserSpreadsheetService spreadsheetService;
    private final MoodSheetService moodSheetService;
    private final PlaceService placeService;
    private final PushService pushService;
    private final AccessLog accessLog;

    public MoodController(SessionCookie sessionCookie,
                           UserCredentialsStore credentialsStore,
                           UserSpreadsheetService spreadsheetService,
                           MoodSheetService moodSheetService,
                           PlaceService placeService,
                           PushService pushService,
                           AccessLog accessLog) {
        this.sessionCookie = sessionCookie;
        this.credentialsStore = credentialsStore;
        this.spreadsheetService = spreadsheetService;
        this.moodSheetService = moodSheetService;
        this.placeService = placeService;
        this.pushService = pushService;
        this.accessLog = accessLog;
    }

    public record MoodRequest(Integer mood, Double lat, Double lng) {
    }

    @PostMapping("/api/mood")
    public void saveMood(@RequestBody MoodRequest request,
                          @CookieValue(name = SessionCookie.COOKIE_NAME, required = false) String authCookie,
                          HttpServletResponse response) throws IOException {
        SessionCookie.Identity identity = sessionCookie.verify(authCookie);
        Credential credential = identity == null ? null : credentialsStore.getCredentials(identity.userId());
        if (credential == null) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }
        if (request.mood() == null || request.mood() < 1 || request.mood() > 5) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST);
            return;
        }

        String location = placeService.locationCell(request.lat(), request.lng());
        try {
            String spreadsheetId = spreadsheetService.getOrCreateSpreadsheetId(identity.userId(), credential);
            moodSheetService.append(spreadsheetId, credential, request.mood(), Instant.now(), location);
        } catch (Exception e) {
            log.error("Saving mood to spreadsheet failed for user {}: {}", identity.userId(), e.toString(), e);
            throw new UpstreamServiceException("SHEETS_FAILED", e);
        }
        pushService.markAnswered(identity.userId());
        accessLog.record(identity.email(), "mood", Map.of("mood", request.mood()));
    }
}
