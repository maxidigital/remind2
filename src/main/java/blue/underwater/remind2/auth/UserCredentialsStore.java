package blue.underwater.remind2.auth;

import com.google.api.client.auth.oauth2.Credential;
import com.google.api.client.googleapis.auth.oauth2.GoogleAuthorizationCodeFlow;
import com.google.api.client.googleapis.auth.oauth2.GoogleClientSecrets;
import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.JsonFactory;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.client.util.store.FileDataStoreFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.File;
import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Adapted from re.mind's CredentialsAdmin: same OAuth2 flow + on-disk token
 * store, but keyed by a Google account id (sub) instead of a Telegram chatId.
 */
@Component
public class UserCredentialsStore {

    private static final Logger log = LoggerFactory.getLogger(UserCredentialsStore.class);
    private static final String TOKENS_DIRECTORY_PATH = "user_tokens";
    private static final JsonFactory JSON_FACTORY = GsonFactory.getDefaultInstance();
    private static final List<String> SCOPES = Arrays.asList(
            "openid",
            "email",
            "https://www.googleapis.com/auth/drive.file"
    );

    private final GoogleAuthorizationCodeFlow flow;
    private final ConcurrentHashMap<String, Credential> cache = new ConcurrentHashMap<>();

    public UserCredentialsStore(
            @Value("${GOOGLE_CLIENT_ID:}") String clientId,
            @Value("${GOOGLE_CLIENT_SECRET:}") String clientSecret) throws GeneralSecurityException, IOException {
        NetHttpTransport httpTransport = GoogleNetHttpTransport.newTrustedTransport();

        GoogleClientSecrets.Details details = new GoogleClientSecrets.Details()
                .setClientId(clientId)
                .setClientSecret(clientSecret);
        GoogleClientSecrets clientSecrets = new GoogleClientSecrets().setWeb(details);

        this.flow = new GoogleAuthorizationCodeFlow.Builder(
                httpTransport, JSON_FACTORY, clientSecrets, SCOPES)
                .setDataStoreFactory(new FileDataStoreFactory(new File(TOKENS_DIRECTORY_PATH)))
                .setAccessType("offline")
                .build();
    }

    public GoogleAuthorizationCodeFlow getFlow() {
        return flow;
    }

    public Credential getCredentials(String userId) {
        Credential cached = cache.get(userId);
        if (cached != null) {
            return cached;
        }
        try {
            Credential loaded = flow.loadCredential(userId);
            if (loaded != null) {
                cache.put(userId, loaded);
            }
            return loaded;
        } catch (IOException e) {
            log.warn("Failed to load credentials for userId {}: {}", userId, e.getMessage());
            return null;
        }
    }

    public void storeCredentials(String userId, Credential credential) {
        cache.put(userId, credential);
    }

    public void removeCredentials(String userId) {
        cache.remove(userId);
        try {
            flow.getCredentialDataStore().delete(userId);
        } catch (IOException e) {
            log.warn("Failed to delete credentials for userId {}: {}", userId, e.getMessage());
        }
    }
}
