package blue.underwater.remind2.sheets;

import com.google.api.client.auth.oauth2.Credential;
import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.sheets.v4.Sheets;
import com.google.api.services.sheets.v4.model.ValueRange;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Adapted from re.mind's EntriesBookSheetAdmin, but using values().append()
 * instead of a manually tracked lastRow/COUNTA formula, and with a read
 * path (readAll) for the notes list.
 */
@Component
public class NotesSheetService {

    public record NoteEntry(String date, String text) {
    }

    public void append(String spreadsheetId, Credential credential, String text)
            throws IOException, GeneralSecurityException {
        Sheets sheets = buildSheetsClient(credential);

        // Instant (with trailing "Z") instead of LocalDateTime — the frontend's
        // `new Date(...)` needs an explicit UTC marker or it misreads the
        // string as browser-local time and shows the wrong hour.
        ValueRange row = new ValueRange().setValues(
                List.of(List.of(Instant.now().toString(), text)));

        sheets.spreadsheets().values()
                .append(spreadsheetId, "A:B", row)
                .setValueInputOption("RAW")
                .execute();
    }

    public List<NoteEntry> readAll(String spreadsheetId, Credential credential)
            throws IOException, GeneralSecurityException {
        Sheets sheets = buildSheetsClient(credential);

        ValueRange result = sheets.spreadsheets().values()
                .get(spreadsheetId, "A:B")
                .execute();

        List<List<Object>> rows = result.getValues();
        if (rows == null || rows.size() <= 1) {
            return List.of();
        }

        List<NoteEntry> entries = new ArrayList<>();
        for (List<Object> row : rows.subList(1, rows.size())) {
            String date = row.size() > 0 ? String.valueOf(row.get(0)) : "";
            String text = row.size() > 1 ? String.valueOf(row.get(1)) : "";
            entries.add(new NoteEntry(date, text));
        }

        Collections.reverse(entries);
        return entries;
    }

    private Sheets buildSheetsClient(Credential credential) throws GeneralSecurityException, IOException {
        NetHttpTransport httpTransport = GoogleNetHttpTransport.newTrustedTransport();
        return new Sheets.Builder(httpTransport, GsonFactory.getDefaultInstance(), credential)
                .setApplicationName("re.mind2")
                .build();
    }
}
