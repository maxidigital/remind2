package blue.underwater.remind2.controller;

import blue.underwater.remind2.auth.UserCredentialsStore;
import blue.underwater.remind2.sheets.NotesSheetService;
import blue.underwater.remind2.sheets.UserSpreadsheetService;
import blue.underwater.remind2.transcription.WhisperTranscriptionService;
import com.google.api.client.auth.oauth2.Credential;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
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

    private final UserCredentialsStore credentialsStore;
    private final WhisperTranscriptionService transcriptionService;
    private final UserSpreadsheetService spreadsheetService;
    private final NotesSheetService sheetService;

    public NotesController(UserCredentialsStore credentialsStore,
                            WhisperTranscriptionService transcriptionService,
                            UserSpreadsheetService spreadsheetService,
                            NotesSheetService sheetService) {
        this.credentialsStore = credentialsStore;
        this.transcriptionService = transcriptionService;
        this.spreadsheetService = spreadsheetService;
        this.sheetService = sheetService;
    }

    @GetMapping
    public Map<String, Object> listNotes(HttpSession session, HttpServletResponse response) throws IOException, GeneralSecurityException {
        Credential credential = requireCredential(session, response);
        if (credential == null) {
            return null;
        }

        String userId = (String) session.getAttribute("userId");
        String spreadsheetId = spreadsheetService.findSpreadsheetId(userId, credential);
        if (spreadsheetId == null) {
            return Map.of("notes", List.of());
        }

        return Map.of("notes", sheetService.readAll(spreadsheetId, credential));
    }

    @PostMapping
    public Map<String, String> saveNote(@RequestParam("audio") MultipartFile audio,
                                         HttpSession session,
                                         HttpServletResponse response) throws IOException, GeneralSecurityException {
        Credential credential = requireCredential(session, response);
        if (credential == null) {
            return null;
        }

        String userId = (String) session.getAttribute("userId");
        String text = transcriptionService.transcribe(audio);
        String spreadsheetId = spreadsheetService.getOrCreateSpreadsheetId(userId, credential);
        sheetService.append(spreadsheetId, credential, text);

        String spreadsheetUrl = "https://docs.google.com/spreadsheets/d/" + spreadsheetId;
        return Map.of("text", text, "spreadsheetUrl", spreadsheetUrl);
    }

    private Credential requireCredential(HttpSession session, HttpServletResponse response) throws IOException {
        String userId = (String) session.getAttribute("userId");
        if (userId == null) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
            return null;
        }

        Credential credential = credentialsStore.getCredentials(userId);
        if (credential == null) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "No Google credentials, please log in again");
            return null;
        }

        return credential;
    }
}
