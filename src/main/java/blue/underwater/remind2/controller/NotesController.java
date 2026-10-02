package blue.underwater.remind2.controller;

import blue.underwater.remind2.AccessLog;
import blue.underwater.remind2.auth.SessionCookie;
import blue.underwater.remind2.auth.UserCredentialsStore;
import blue.underwater.remind2.drive.AudioDriveService;
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
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/notes")
public class NotesController {

    private static final Logger log = LoggerFactory.getLogger(NotesController.class);

    private final SessionCookie sessionCookie;
    private final UserCredentialsStore credentialsStore;
    private final WhisperTranscriptionService transcriptionService;
    private final UserSpreadsheetService spreadsheetService;
    private final NotesSheetService sheetService;
    private final AudioDriveService audioDriveService;
    private final AccessLog accessLog;

    // userId + ":" + note id de los POST en curso. Un reintento que llega
    // mientras el original todavía transcribe recibe 409 (el cliente reintenta
    // más tarde) en vez de pasar el chequeo en la planilla y duplicar la nota.
    private final Set<String> notesInProgress = ConcurrentHashMap.newKeySet();

    public NotesController(SessionCookie sessionCookie,
                            UserCredentialsStore credentialsStore,
                            WhisperTranscriptionService transcriptionService,
                            UserSpreadsheetService spreadsheetService,
                            NotesSheetService sheetService,
                            AudioDriveService audioDriveService,
                            AccessLog accessLog) {
        this.sessionCookie = sessionCookie;
        this.credentialsStore = credentialsStore;
        this.transcriptionService = transcriptionService;
        this.spreadsheetService = spreadsheetService;
        this.sheetService = sheetService;
        this.audioDriveService = audioDriveService;
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
                                         @RequestParam(value = "id", required = false) String noteId,
                                         @CookieValue(name = SessionCookie.COOKIE_NAME, required = false) String authCookie,
                                         HttpServletResponse response) throws IOException, GeneralSecurityException {
        AuthenticatedUser user = requireUser(authCookie, response);
        if (user == null) {
            return null;
        }

        // Clientes viejos (cacheados de antes de la idempotencia) no mandan id.
        if (noteId == null || noteId.isBlank()) {
            return createNote(user, audio, "");
        }

        String progressKey = user.userId() + ":" + noteId;
        if (!notesInProgress.add(progressKey)) {
            response.sendError(HttpServletResponse.SC_CONFLICT);
            return null;
        }
        try {
            // El cliente reintenta cuando no le llega la respuesta, aunque el
            // servidor sí haya guardado la nota (iOS corta la conexión al volver
            // de background): si este id ya está en la planilla, no se duplica.
            String spreadsheetId = spreadsheetService.findSpreadsheetId(user.userId(), user.credential());
            if (spreadsheetId != null) {
                String existingText = sheetService.findTextById(spreadsheetId, user.credential(), noteId);
                if (existingText != null) {
                    log.info("Note {} already saved for user {}, skipping duplicate", noteId, user.userId());
                    return Map.of("text", existingText, "spreadsheetUrl", buildSpreadsheetUrl(spreadsheetId));
                }
            }
            return createNote(user, audio, noteId);
        } finally {
            notesInProgress.remove(progressKey);
        }
    }

    private Map<String, String> createNote(AuthenticatedUser user, MultipartFile audio, String noteId) throws IOException {
        // Leído antes de transcribir: transferTo() de Whisper puede mover el
        // archivo temporal del multipart y dejar el stream inutilizable.
        byte[] audioBytes = audio.getBytes();

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

        Instant createdAt = Instant.now();
        String spreadsheetId;
        try {
            spreadsheetId = spreadsheetService.getOrCreateSpreadsheetId(user.userId(), user.credential());
            sheetService.append(spreadsheetId, user.credential(), text, createdAt, noteId);
        } catch (Exception e) {
            log.error("Saving note to spreadsheet failed for user {}: {}", user.userId(), e.toString(), e);
            throw new UpstreamServiceException("SHEETS_FAILED", e);
        }

        // Best effort: la nota ya quedó en la planilla, así que si falla Drive
        // no devolvemos error — el cliente reintentaría y duplicaría la fila.
        try {
            audioDriveService.upload(user.userId(), user.credential(), audioBytes,
                    audio.getOriginalFilename(), audio.getContentType(), createdAt);
        } catch (Exception e) {
            log.error("Saving audio to Drive failed for user {}: {}", user.userId(), e.toString(), e);
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
