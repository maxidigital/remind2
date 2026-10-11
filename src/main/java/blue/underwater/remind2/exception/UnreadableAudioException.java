package blue.underwater.remind2.exception;

/**
 * La transcripción rechazó el audio porque el archivo en sí no sirve
 * (típicamente una grabación cortada: en iOS, si la pantalla se apaga a mitad,
 * el mp4 queda sin terminar). A diferencia de UpstreamServiceException,
 * reintentar con el mismo archivo nunca va a andar.
 */
public class UnreadableAudioException extends RuntimeException {
    public UnreadableAudioException(Throwable cause) {
        super("AUDIO_UNREADABLE", cause);
    }
}
