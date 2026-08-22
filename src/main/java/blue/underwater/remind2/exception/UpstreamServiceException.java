package blue.underwater.remind2.exception;

/** Thrown when a downstream call (Whisper, Sheets, Drive) fails inside saveNote(). */
public class UpstreamServiceException extends RuntimeException {
    private final String code;

    public UpstreamServiceException(String code, Throwable cause) {
        super(code, cause);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
