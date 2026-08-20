package blue.underwater.remind2.sheets;

import com.google.api.client.auth.oauth2.Credential;
import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.drive.Drive;
import com.google.api.services.drive.model.File;
import com.google.api.services.drive.model.FileList;
import com.google.api.services.sheets.v4.Sheets;
import com.google.api.services.sheets.v4.model.ValueRange;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Adapted from re.mind's SpreadsheetCreator: no template copy, no
 * settings/tags sheets, no shareSpreadsheetWithOwner. Just find-or-create,
 * keyed by userId (the Google account sub) instead of a Telegram chatId.
 *
 * The spreadsheet is created via the Drive API (not the Sheets API) so it's
 * visible to later drive.files().list() lookups under the drive.file scope.
 */
@Component
public class UserSpreadsheetService {

    private static final String SPREADSHEET_NAME = "re.mind2";

    private final ConcurrentHashMap<String, String> spreadsheetIdCache = new ConcurrentHashMap<>();

    public String getOrCreateSpreadsheetId(String userId, Credential credential)
            throws IOException, GeneralSecurityException {
        String cached = spreadsheetIdCache.get(userId);
        if (cached != null) {
            return cached;
        }

        NetHttpTransport httpTransport = GoogleNetHttpTransport.newTrustedTransport();
        Drive drive = new Drive.Builder(httpTransport, GsonFactory.getDefaultInstance(), credential)
                .setApplicationName(SPREADSHEET_NAME)
                .build();

        FileList existing = drive.files().list()
                .setQ("name='" + SPREADSHEET_NAME + "' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false")
                .setSpaces("drive")
                .execute();

        String spreadsheetId;
        if (existing.getFiles() != null && !existing.getFiles().isEmpty()) {
            spreadsheetId = existing.getFiles().get(0).getId();
        } else {
            File metadata = new File()
                    .setName(SPREADSHEET_NAME)
                    .setMimeType("application/vnd.google-apps.spreadsheet");
            File created = drive.files().create(metadata).execute();
            spreadsheetId = created.getId();
            writeHeader(credential, httpTransport, spreadsheetId);
        }

        spreadsheetIdCache.put(userId, spreadsheetId);
        return spreadsheetId;
    }

    private void writeHeader(Credential credential, NetHttpTransport httpTransport, String spreadsheetId) throws IOException {
        Sheets sheets = new Sheets.Builder(httpTransport, GsonFactory.getDefaultInstance(), credential)
                .setApplicationName(SPREADSHEET_NAME)
                .build();

        ValueRange header = new ValueRange().setValues(List.of(List.of("Date", "Text")));
        sheets.spreadsheets().values()
                .update(spreadsheetId, "A1:B1", header)
                .setValueInputOption("RAW")
                .execute();
    }
}
