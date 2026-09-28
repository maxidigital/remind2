package blue.underwater.remind2.controller;

import blue.underwater.remind2.exception.UpstreamServiceException;
import com.google.api.client.auth.oauth2.TokenResponseException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, String>> handleTooLarge(MaxUploadSizeExceededException ex) {
        log.warn("Upload rejected, exceeds max size: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(Map.of("error", "UPLOAD_TOO_LARGE"));
    }

    @ExceptionHandler(UpstreamServiceException.class)
    public ResponseEntity<Map<String, String>> handleUpstream(UpstreamServiceException ex) {
        if (isGoogleGrantRevoked(ex)) {
            return authExpired(ex);
        }
        log.error("Upstream failure [{}]: {}", ex.getCode(),
                ex.getCause() != null ? ex.getCause().toString() : ex.getMessage(), ex);
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(Map.of("error", ex.getCode()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnknown(Exception ex) {
        if (isGoogleGrantRevoked(ex)) {
            return authExpired(ex);
        }
        log.error("Unhandled controller error: {}", ex.toString(), ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "INTERNAL_ERROR"));
    }

    private ResponseEntity<Map<String, String>> authExpired(Exception ex) {
        log.warn("Google refresh token expired or revoked, asking client to log in again: {}", ex.toString());
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("error", "AUTH_EXPIRED"));
    }

    // El refresh token guardado ya no sirve (vencido o revocado): no es una falla
    // transitoria de Google, reintentar nunca va a andar hasta que el usuario
    // vuelva a loguearse. Devolver 5xx hacía que el cliente reintentara para siempre.
    private static boolean isGoogleGrantRevoked(Throwable ex) {
        for (Throwable t = ex; t != null; t = t.getCause()) {
            if (t instanceof TokenResponseException tre
                    && tre.getDetails() != null
                    && "invalid_grant".equals(tre.getDetails().getError())) {
                return true;
            }
        }
        return false;
    }
}
