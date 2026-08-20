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
 *
 * Column C holds a soft-delete status ("archived"/"deleted"). Archiving and
 * deleting both just set this column instead of touching row indices in the
 * sheet — physically removing a row (batchUpdate deleteDimension) would
 * shift every row after it, and two quick actions in the app could then
 * target the wrong row before the frontend refetches. Soft status avoids
 * that entirely, and as a side effect nothing the user recorded is ever
 * truly gone from their own spreadsheet.
 */
@Component
public class NotesSheetService {

    private static final String STATUS_ARCHIVED = "archived";
    private static final String STATUS_DELETED = "deleted";

    public record NoteEntry(int row, String date, String text) {
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
                .get(spreadsheetId, "A:C")
                .execute();

        List<List<Object>> rows = result.getValues();
        if (rows == null || rows.size() <= 1) {
            return List.of();
        }

        List<NoteEntry> entries = new ArrayList<>();
        for (int i = 1; i < rows.size(); i++) {
            List<Object> row = rows.get(i);
            String status = row.size() > 2 ? String.valueOf(row.get(2)) : "";
            if (STATUS_ARCHIVED.equals(status) || STATUS_DELETED.equals(status)) {
                continue;
            }

            String date = row.size() > 0 ? String.valueOf(row.get(0)) : "";
            String text = row.size() > 1 ? String.valueOf(row.get(1)) : "";
            int sheetRow = i + 1; // 1-indexed sheet row; header occupies row 1
            entries.add(new NoteEntry(sheetRow, date, text));
        }

        Collections.reverse(entries);
        return entries;
    }

    public void updateText(String spreadsheetId, Credential credential, int row, String text)
            throws IOException, GeneralSecurityException {
        Sheets sheets = buildSheetsClient(credential);

        ValueRange value = new ValueRange().setValues(List.of(List.of(text)));
        sheets.spreadsheets().values()
                .update(spreadsheetId, "B" + row, value)
                .setValueInputOption("RAW")
                .execute();
    }

    public void archive(String spreadsheetId, Credential credential, int row) throws IOException, GeneralSecurityException {
        setStatus(spreadsheetId, credential, row, STATUS_ARCHIVED);
    }

    public void delete(String spreadsheetId, Credential credential, int row) throws IOException, GeneralSecurityException {
        setStatus(spreadsheetId, credential, row, STATUS_DELETED);
    }

    private void setStatus(String spreadsheetId, Credential credential, int row, String status)
            throws IOException, GeneralSecurityException {
        Sheets sheets = buildSheetsClient(credential);

        ValueRange value = new ValueRange().setValues(List.of(List.of(status)));
        sheets.spreadsheets().values()
                .update(spreadsheetId, "C" + row, value)
                .setValueInputOption("RAW")
                .execute();
    }

    private Sheets buildSheetsClient(Credential credential) throws GeneralSecurityException, IOException {
        NetHttpTransport httpTransport = GoogleNetHttpTransport.newTrustedTransport();
        return new Sheets.Builder(httpTransport, GsonFactory.getDefaultInstance(), credential)
                .setApplicationName("re.mind2")
                .build();
    }
}
