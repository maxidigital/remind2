package blue.underwater.remind2.drive;

import com.google.api.client.auth.oauth2.Credential;
import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.http.ByteArrayContent;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.drive.Drive;
import com.google.api.services.drive.model.File;
import com.google.api.services.drive.model.FileList;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Guarda el audio original de cada nota en una carpeta de Drive del usuario.
 * Igual que la planilla, la carpeta se crea con la Drive API bajo el scope
 * drive.file, así que solo vemos (y encontramos) la carpeta que creó la app.
 */
@Component
public class AudioDriveService {

    private static final String APPLICATION_NAME = "re.mind2";
    private static final String FOLDER_NAME = "re.mind2 audios";
    private static final String FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

    private final ConcurrentHashMap<String, String> folderIdCache = new ConcurrentHashMap<>();

    public void upload(String userId, Credential credential, byte[] audio, String originalFilename,
                       String contentType, Instant recordedAt, String nameSuffix)
            throws IOException, GeneralSecurityException {
        Drive drive = buildDriveClient(credential);
        String folderId = getOrCreateFolderId(userId, drive);

        // Mismo instante que la columna Date de la planilla, para poder cruzar
        // audio y nota. Sin ":" porque varios sistemas de archivos no los aceptan
        // al descargar.
        String name = recordedAt.toString().replace(':', '-') + nameSuffix + extensionOf(originalFilename);
        String mimeType = contentType != null ? contentType : "audio/webm";

        File metadata = new File()
                .setName(name)
                .setParents(List.of(folderId));
        drive.files().create(metadata, new ByteArrayContent(mimeType, audio))
                .setFields("id")
                .execute();
    }

    private String getOrCreateFolderId(String userId, Drive drive) throws IOException {
        String cached = folderIdCache.get(userId);
        if (cached != null) {
            return cached;
        }

        FileList existing = drive.files().list()
                .setQ("name='" + FOLDER_NAME + "' and mimeType='" + FOLDER_MIME_TYPE + "' and trashed=false")
                .setSpaces("drive")
                .execute();

        String folderId;
        if (existing.getFiles() != null && !existing.getFiles().isEmpty()) {
            folderId = existing.getFiles().get(0).getId();
        } else {
            File metadata = new File()
                    .setName(FOLDER_NAME)
                    .setMimeType(FOLDER_MIME_TYPE);
            folderId = drive.files().create(metadata).setFields("id").execute().getId();
        }

        folderIdCache.put(userId, folderId);
        return folderId;
    }

    private Drive buildDriveClient(Credential credential) throws IOException, GeneralSecurityException {
        return new Drive.Builder(GoogleNetHttpTransport.newTrustedTransport(), GsonFactory.getDefaultInstance(), credential)
                .setApplicationName(APPLICATION_NAME)
                .build();
    }

    private static String extensionOf(String originalFilename) {
        if (originalFilename != null && originalFilename.contains(".")) {
            return originalFilename.substring(originalFilename.lastIndexOf('.'));
        }
        return ".webm";
    }
}
