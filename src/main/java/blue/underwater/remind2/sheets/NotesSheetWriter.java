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
import java.time.LocalDateTime;
import java.util.List;

/**
 * Adapted from re.mind's EntriesBookSheetAdmin, but using values().append()
 * instead of a manually tracked lastRow/COUNTA formula.
 */
@Component
public class NotesSheetWriter {

    public void append(String spreadsheetId, Credential credential, String text)
            throws IOException, GeneralSecurityException {
        NetHttpTransport httpTransport = GoogleNetHttpTransport.newTrustedTransport();
        Sheets sheets = new Sheets.Builder(httpTransport, GsonFactory.getDefaultInstance(), credential)
                .setApplicationName("re.mind2")
                .build();

        ValueRange row = new ValueRange().setValues(
                List.of(List.of(LocalDateTime.now().toString(), text)));

        sheets.spreadsheets().values()
                .append(spreadsheetId, "A:B", row)
                .setValueInputOption("RAW")
                .execute();
    }
}
