package blue.underwater.remind2.auth;

import com.google.api.client.auth.oauth2.Credential;
import com.google.api.client.googleapis.auth.oauth2.GoogleAuthorizationCodeFlow;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;

@Service
public class GoogleAuthService {

    private final UserCredentialsStore credentialsStore;
    private final String redirectUri;

    public GoogleAuthService(UserCredentialsStore credentialsStore,
                              @Value("${GOOGLE_REDIRECT_URI:}") String redirectUri) {
        this.credentialsStore = credentialsStore;
        this.redirectUri = redirectUri;
    }

    public String buildAuthorizationUrl(String state) {
        return credentialsStore.getFlow().newAuthorizationUrl()
                .setRedirectUri(redirectUri)
                .setState(state)
                .set("prompt", "consent")
                .build();
    }

    public GoogleIdentity handleCallback(String code) throws IOException {
        GoogleAuthorizationCodeFlow flow = credentialsStore.getFlow();

        GoogleTokenResponse tokenResponse = (GoogleTokenResponse) flow.newTokenRequest(code)
                .setRedirectUri(redirectUri)
                .execute();

        GoogleIdToken idToken = GoogleIdToken.parse(flow.getJsonFactory(), tokenResponse.getIdToken());
        String sub = idToken.getPayload().getSubject();
        String email = (String) idToken.getPayload().get("email");

        Credential credential = flow.createAndStoreCredential(tokenResponse, sub);
        credentialsStore.storeCredentials(sub, credential);

        return new GoogleIdentity(sub, email);
    }
}
