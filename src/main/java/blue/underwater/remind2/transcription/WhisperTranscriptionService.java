package blue.underwater.remind2.transcription;

import com.theokanning.openai.audio.CreateTranscriptionRequest;
import com.theokanning.openai.audio.TranscriptionResult;
import com.theokanning.openai.audio.TranscriptionSegment;
import com.theokanning.openai.service.OpenAiService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

/**
 * Adapted from re.mind's GPTVoice (admin/openai.admin): same Whisper call,
 * but the API key comes from an env var (the original hardcodes it) and the
 * temp file extension matches whatever the browser actually recorded
 * (webm on Chrome/Android, mp4 on Safari/iOS) instead of being fixed to
 * .ogg — Whisper needs the right extension to pick the right decoder.
 */
@Service
public class WhisperTranscriptionService {

    // Whisper alucina frases (típicamente outros de YouTube: "gracias por ver",
    // "suscribite al canal", a veces en otros idiomas) cuando el audio es
    // silencio o ruido sin voz. verbose_json expone, por segmento, no_speech_prob
    // (confianza de que NO hay voz) y average_logprob (confianza de la
    // transcripción en sí); un segmento con ambos indicadores en contra es texto
    // inventado, no una transcripción real. Umbrales estándar de la comunidad de
    // Whisper para este filtro.
    private static final double NO_SPEECH_THRESHOLD = 0.6;
    private static final double LOG_PROB_THRESHOLD = -1.0;

    private final OpenAiService service;

    public WhisperTranscriptionService(@Value("${OPENAI_API_KEY:}") String apiKey) {
        this.service = new OpenAiService(apiKey, Duration.ofSeconds(60));
    }

    public String transcribe(MultipartFile audio) throws IOException {
        String extension = extensionOf(audio.getOriginalFilename());
        File tempFile = File.createTempFile("recording-" + UUID.randomUUID(), extension);
        try {
            audio.transferTo(tempFile);

            CreateTranscriptionRequest request = CreateTranscriptionRequest.builder()
                    .model("whisper-1")
                    .responseFormat("verbose_json")
                    .build();

            TranscriptionResult result = service.createTranscription(request, tempFile);
            if (isSilence(result)) {
                return "";
            }
            return result.getText();
        } finally {
            tempFile.delete();
        }
    }

    private static boolean isSilence(TranscriptionResult result) {
        List<TranscriptionSegment> segments = result.getSegments();
        if (segments == null || segments.isEmpty()) {
            return false;
        }
        return segments.stream().allMatch(WhisperTranscriptionService::isLikelyHallucinated);
    }

    private static boolean isLikelyHallucinated(TranscriptionSegment segment) {
        Double noSpeechProb = segment.getNoSpeechProb();
        Double avgLogProb = segment.getAverageLogProb();
        return noSpeechProb != null && noSpeechProb > NO_SPEECH_THRESHOLD
                && avgLogProb != null && avgLogProb < LOG_PROB_THRESHOLD;
    }

    private static String extensionOf(String originalFilename) {
        if (originalFilename != null && originalFilename.contains(".")) {
            return originalFilename.substring(originalFilename.lastIndexOf('.'));
        }
        return ".webm";
    }
}
