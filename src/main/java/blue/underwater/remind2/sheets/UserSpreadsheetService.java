package blue.underwater.remind2.sheets;

import com.google.api.client.auth.oauth2.Credential;
import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.drive.Drive;
import com.google.api.services.drive.model.File;
import com.google.api.services.drive.model.FileList;
import com.google.api.services.sheets.v4.Sheets;
import com.google.api.services.sheets.v4.model.BatchUpdateSpreadsheetRequest;
import com.google.api.services.sheets.v4.model.DimensionRange;
import com.google.api.services.sheets.v4.model.MoveDimensionRequest;
import com.google.api.services.sheets.v4.model.Request;
import com.google.api.services.sheets.v4.model.ValueRange;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private static final Logger log = LoggerFactory.getLogger(UserSpreadsheetService.class);

    private static final String SPREADSHEET_NAME = "re.mind2";
    private static final List<Object> HEADER = List.of("Id", "Date", "Text", "Status", "Color");
    // Primera celda del encabezado del orden anterior (Date, Text, Status, Color, Id).
    private static final String LEGACY_FIRST_HEADER = "Date";

    private final ConcurrentHashMap<String, String> spreadsheetIdCache = new ConcurrentHashMap<>();

    public String getOrCreateSpreadsheetId(String userId, Credential credential)
            throws IOException, GeneralSecurityException {
        String existingId = findSpreadsheetId(userId, credential);
        if (existingId != null) {
            return existingId;
        }

        NetHttpTransport httpTransport = GoogleNetHttpTransport.newTrustedTransport();
        Drive drive = new Drive.Builder(httpTransport, GsonFactory.getDefaultInstance(), credential)
                .setApplicationName(SPREADSHEET_NAME)
                .build();

        File metadata = new File()
                .setName(SPREADSHEET_NAME)
                .setMimeType("application/vnd.google-apps.spreadsheet");
        File created = drive.files().create(metadata).execute();
        String spreadsheetId = created.getId();
        writeHeader(credential, httpTransport, spreadsheetId);

        spreadsheetIdCache.put(userId, spreadsheetId);
        return spreadsheetId;
    }

    /**
     * Returns the user's spreadsheet id if it already exists, without
     * creating one — used by the read path (GET /api/notes) so viewing an
     * empty note list doesn't create a spreadsheet.
     */
    public String findSpreadsheetId(String userId, Credential credential)
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

        if (existing.getFiles() == null || existing.getFiles().isEmpty()) {
            return null;
        }

        String spreadsheetId = existing.getFiles().get(0).getId();
        migrateLegacyLayout(credential, httpTransport, spreadsheetId);
        spreadsheetIdCache.put(userId, spreadsheetId);
        return spreadsheetId;
    }

    /**
     * Las planillas creadas antes de que el Id pasara a la columna A tienen el
     * orden Date, Text, Status, Color, Id. Se reconocen por el "Date" en A1 y
     * se migran moviendo la columna E al principio: una sola operación de
     * Sheets, que corre las demás columnas sin reescribir ninguna celda. Corre
     * una vez por usuario y por proceso (después el id queda en caché), y deja
     * de hacer nada apenas A1 ya no dice "Date".
     */
    private void migrateLegacyLayout(Credential credential, NetHttpTransport httpTransport, String spreadsheetId)
            throws IOException {
        Sheets sheets = new Sheets.Builder(httpTransport, GsonFactory.getDefaultInstance(), credential)
                .setApplicationName(SPREADSHEET_NAME)
                .build();

        List<List<Object>> firstCell = sheets.spreadsheets().values().get(spreadsheetId, "A1").execute().getValues();
        boolean legacy = firstCell != null && !firstCell.isEmpty() && !firstCell.get(0).isEmpty()
                && LEGACY_FIRST_HEADER.equals(String.valueOf(firstCell.get(0).get(0)));
        if (!legacy) {
            return;
        }

        Integer sheetId = sheets.spreadsheets().get(spreadsheetId)
                .setFields("sheets.properties.sheetId")
                .execute()
                .getSheets().get(0).getProperties().getSheetId();

        MoveDimensionRequest moveIdColumnFirst = new MoveDimensionRequest()
                .setSource(new DimensionRange()
                        .setSheetId(sheetId)
                        .setDimension("COLUMNS")
                        .setStartIndex(4)
                        .setEndIndex(5))
                .setDestinationIndex(0);
        sheets.spreadsheets()
                .batchUpdate(spreadsheetId, new BatchUpdateSpreadsheetRequest()
                        .setRequests(List.of(new Request().setMoveDimension(moveIdColumnFirst))))
                .execute();
        log.info("Migrated spreadsheet {} to the Id-first column layout", spreadsheetId);

        sheets.spreadsheets().values()
                .update(spreadsheetId, "A1:E1", new ValueRange().setValues(List.of(HEADER)))
                .setValueInputOption("RAW")
                .execute();
    }

    private void writeHeader(Credential credential, NetHttpTransport httpTransport, String spreadsheetId) throws IOException {
        Sheets sheets = new Sheets.Builder(httpTransport, GsonFactory.getDefaultInstance(), credential)
                .setApplicationName(SPREADSHEET_NAME)
                .build();

        ValueRange header = new ValueRange().setValues(List.of(HEADER));
        sheets.spreadsheets().values()
                .update(spreadsheetId, "A1:E1", header)
                .setValueInputOption("RAW")
                .execute();
    }
}
