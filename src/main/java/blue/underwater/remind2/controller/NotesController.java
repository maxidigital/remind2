package blue.underwater.remind2.controller;

import blue.underwater.remind2.AccessLog;
import blue.underwater.remind2.auth.SessionCookie;
import blue.underwater.remind2.auth.UserCredentialsStore;
import blue.underwater.remind2.exception.UpstreamServiceException;
import blue.underwater.remind2.sheets.NotesSheetService;
import blue.underwater.remind2.sheets.UserSpreadsheetService;
import blue.underwater.remind2.transcription.WhisperTranscriptionService;
import com.google.api.client.auth.oauth2.Credential;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notes")
public class NotesController {

    private static final Logger log = LoggerFactory.getLogger(NotesController.class);

    private final SessionCookie sessionCookie;
    private final UserCredentialsStore credentialsStore;
    private final WhisperTranscriptionService transcriptionService;
    private final UserSpreadsheetService spreadsheetService;
    private final NotesSheetService sheetService;
    private final AccessLog accessLog;

    public NotesController(SessionCookie sessionCookie,
                            UserCredentialsStore credentialsStore,
                            WhisperTranscriptionService transcriptionService,
                            UserSpreadsheetService spreadsheetService,
                            NotesSheetService sheetService,
                            AccessLog accessLog) {
        this.sessionCookie = sessionCookie;
        this.credentialsStore = credentialsStore;
        this.transcriptionService = transcriptionService;
        this.spreadsheetService = spreadsheetService;
        this.sheetService = sheetService;
        this.accessLog = accessLog;
    }

    private record AuthenticatedUser(String userId, String email, Credential credential) {
    }

    @GetMapping
    public Map<String, Object> listNotes(@CookieValue(name = SessionCookie.COOKIE_NAME, required = false) String authCookie,
                                          HttpServletResponse response) throws IOException, GeneralSecurityException {
        AuthenticatedUser user = requireUser(authCookie, response);
        if (user == null) {
            return null;
        }

        String spreadsheetId = spreadsheetService.findSpreadsheetId(user.userId(), user.credential());
        if (spreadsheetId == null) {
            return Map.of("notes", List.of());
        }

        return Map.of("notes", sheetService.readAll(spreadsheetId, user.credential()));
    }

    @PostMapping
    public Map<String, String> saveNote(@RequestParam("audio") MultipartFile audio,
                                         @CookieValue(name = SessionCookie.COOKIE_NAME, required = false) String authCookie,
                                         HttpServletResponse response) throws IOException, GeneralSecurityException {
        AuthenticatedUser user = requireUser(authCookie, response);
        if (user == null) {
            return null;
        }

        String text;
        try {
            text = transcriptionService.transcribe(audio);
        } catch (Exception e) {
            log.error("Transcription failed for user {}: {}", user.userId(), e.toString(), e);
            throw new UpstreamServiceException("TRANSCRIPTION_FAILED", e);
        }

        if (text == null || text.isBlank()) {
            return Map.of("text", "");
        }

        String spreadsheetId;
        try {
            spreadsheetId = spreadsheetService.getOrCreateSpreadsheetId(user.userId(), user.credential());
            sheetService.append(spreadsheetId, user.credential(), text);
        } catch (Exception e) {
            log.error("Saving note to spreadsheet failed for user {}: {}", user.userId(), e.toString(), e);
            throw new UpstreamServiceException("SHEETS_FAILED", e);
        }

        accessLog.record(user.email(), "note.create");
        return Map.of("text", text, "spreadsheetUrl", buildSpreadsheetUrl(spreadsheetId));
    }

    @GetMapping("/spreadsheet")
    public Map<String, String> getSpreadsheet(@CookieValue(name = SessionCookie.COOKIE_NAME, required = false) String authCookie,
                                               HttpServletResponse response) throws IOException, GeneralSecurityException {
        AuthenticatedUser user = requireUser(authCookie, response);
        if (user == null) {
            return null;
        }

        String spreadsheetId;
        try {
            spreadsheetId = spreadsheetService.getOrCreateSpreadsheetId(user.userId(), user.credential());
        } catch (Exception e) {
            log.error("Getting spreadsheet failed for user {}: {}", user.userId(), e.toString(), e);
            throw new UpstreamServiceException("SHEETS_FAILED", e);
        }

        return Map.of("url", buildSpreadsheetUrl(spreadsheetId));
    }

    private String buildSpreadsheetUrl(String spreadsheetId) {
        return "https://docs.google.com/spreadsheets/d/" + spreadsheetId;
    }

    @PutMapping("/{row}")
    public void updateNote(@PathVariable int row,
                            @RequestBody Map<String, String> body,
                            @CookieValue(name = SessionCookie.COOKIE_NAME, required = false) String authCookie,
                            HttpServletResponse response) throws IOException, GeneralSecurityException {
        AuthenticatedUser user = requireUser(authCookie, response);
        if (user == null) {
            return;
        }
        String text = body.get("text");
        if (text == null || text.isBlank()) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST);
            return;
        }
        String spreadsheetId = spreadsheetService.findSpreadsheetId(user.userId(), user.credential());
        if (spreadsheetId == null) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }
        sheetService.updateText(spreadsheetId, user.credential(), row, text);
        accessLog.record(user.email(), "note.update", Map.of("row", row));
    }

    @PutMapping("/{row}/color")
    public void updateColor(@PathVariable int row,
                             @RequestBody Map<String, String> body,
                             @CookieValue(name = SessionCookie.COOKIE_NAME, required = false) String authCookie,
                             HttpServletResponse response) throws IOException, GeneralSecurityException {
        AuthenticatedUser user = requireUser(authCookie, response);
        if (user == null) {
            return;
        }
        String color = body.getOrDefault("color", "");
        String spreadsheetId = spreadsheetService.findSpreadsheetId(user.userId(), user.credential());
        if (spreadsheetId == null) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }
        sheetService.updateColor(spreadsheetId, user.credential(), row, color);
        accessLog.record(user.email(), "note.color", Map.of("row", row));
    }

    @PostMapping("/{row}/archive")
    public void archiveNote(@PathVariable int row,
                             @CookieValue(name = SessionCookie.COOKIE_NAME, required = false) String authCookie,
                             HttpServletResponse response) throws IOException, GeneralSecurityException {
        AuthenticatedUser user = requireUser(authCookie, response);
        if (user == null) {
            return;
        }
        String spreadsheetId = spreadsheetService.findSpreadsheetId(user.userId(), user.credential());
        if (spreadsheetId == null) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }
        sheetService.archive(spreadsheetId, user.credential(), row);
        accessLog.record(user.email(), "note.archive", Map.of("row", row));
    }

    @DeleteMapping("/{row}")
    public void deleteNote(@PathVariable int row,
                            @CookieValue(name = SessionCookie.COOKIE_NAME, required = false) String authCookie,
                            HttpServletResponse response) throws IOException, GeneralSecurityException {
        AuthenticatedUser user = requireUser(authCookie, response);
        if (user == null) {
            return;
        }
        String spreadsheetId = spreadsheetService.findSpreadsheetId(user.userId(), user.credential());
        if (spreadsheetId == null) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }
        sheetService.delete(spreadsheetId, user.credential(), row);
        accessLog.record(user.email(), "note.delete", Map.of("row", row));
    }

    private AuthenticatedUser requireUser(String authCookie, HttpServletResponse response) throws IOException {
        SessionCookie.Identity identity = sessionCookie.verify(authCookie);
        if (identity == null) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
            return null;
        }

        Credential credential = credentialsStore.getCredentials(identity.userId());
        if (credential == null) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "No Google credentials, please log in again");
            return null;
        }

        return new AuthenticatedUser(identity.userId(), identity.email(), credential);
    }
}
