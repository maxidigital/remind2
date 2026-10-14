package blue.underwater.remind2.sheets;

import com.google.api.client.auth.oauth2.Credential;
import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.sheets.v4.Sheets;
import com.google.api.services.sheets.v4.model.AddSheetRequest;
import com.google.api.services.sheets.v4.model.BatchUpdateSpreadsheetRequest;
import com.google.api.services.sheets.v4.model.Request;
import com.google.api.services.sheets.v4.model.SheetProperties;
import com.google.api.services.sheets.v4.model.Spreadsheet;
import com.google.api.services.sheets.v4.model.ValueRange;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Registro de "¿cómo estás?" (1 a 5) en una hoja aparte de la misma planilla,
 * para no mezclarlo con las notas. Columnas: A = Date, B = Mood, C = Location,
 * D = Comment (lo que se escribió o dictó junto con la carita; puede ir vacío).
 *
 * La hoja se agrega al final: las notas se leen y escriben con rangos sin
 * nombre de hoja ("A:F"), que Sheets resuelve contra la primera, así que la
 * de notas tiene que seguir siendo la primera.
 */
@Component
public class MoodSheetService {

    private static final String SHEET_TITLE = "Ánimo";
    private static final String RANGE = "'" + SHEET_TITLE + "'!A:D";
    private static final String HEADER_RANGE = "'" + SHEET_TITLE + "'!A1:D1";

    private final Set<String> spreadsheetsWithMoodSheet = ConcurrentHashMap.newKeySet();

    public void append(String spreadsheetId, Credential credential, int mood, Instant at, String location,
                       String comment)
            throws IOException, GeneralSecurityException {
        Sheets sheets = new Sheets.Builder(GoogleNetHttpTransport.newTrustedTransport(),
                GsonFactory.getDefaultInstance(), credential)
                .setApplicationName("re.mind2")
                .build();
        ensureSheet(sheets, spreadsheetId);

        ValueRange row = new ValueRange().setValues(List.of(List.<Object>of(at.toString(), mood, location, comment)));
        sheets.spreadsheets().values()
                .append(spreadsheetId, RANGE, row)
                .setValueInputOption("RAW")
                .execute();
    }

    // synchronized: dos respuestas simultáneas no deben intentar crear la hoja a la vez.
    private synchronized void ensureSheet(Sheets sheets, String spreadsheetId) throws IOException {
        if (spreadsheetsWithMoodSheet.contains(spreadsheetId)) {
            return;
        }

        Spreadsheet spreadsheet = sheets.spreadsheets().get(spreadsheetId)
                .setFields("sheets.properties.title")
                .execute();
        boolean exists = spreadsheet.getSheets().stream()
                .anyMatch(sheet -> SHEET_TITLE.equals(sheet.getProperties().getTitle()));
        if (!exists) {
            AddSheetRequest addSheet = new AddSheetRequest()
                    .setProperties(new SheetProperties().setTitle(SHEET_TITLE));
            sheets.spreadsheets()
                    .batchUpdate(spreadsheetId, new BatchUpdateSpreadsheetRequest()
                            .setRequests(List.of(new Request().setAddSheet(addSheet))))
                    .execute();
        }
        // También en hojas ya existentes: las creadas antes del comentario no
        // tienen el título de la columna D.
        sheets.spreadsheets().values()
                .update(spreadsheetId, HEADER_RANGE,
                        new ValueRange().setValues(List.of(List.<Object>of("Date", "Mood", "Location", "Comment"))))
                .setValueInputOption("RAW")
                .execute();
        spreadsheetsWithMoodSheet.add(spreadsheetId);
    }
}
