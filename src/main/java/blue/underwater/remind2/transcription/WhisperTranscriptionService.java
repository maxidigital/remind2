package blue.underwater.remind2.transcription;

import com.theokanning.openai.audio.CreateTranscriptionRequest;
import com.theokanning.openai.audio.TranscriptionResult;
import com.theokanning.openai.service.OpenAiService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.time.Duration;
import java.util.UUID;

/**
 * Adapted from re.mind's GPTVoice (admin/openai.admin): same Whisper call,
 * but the API key comes from an env var (the original hardcodes it) and the
 * temp file extension is generic instead of fixed to .ogg, since the browser
 * records audio/webm.
 */
@Service
public class WhisperTranscriptionService {

    private final OpenAiService service;

    public WhisperTranscriptionService(@Value("${OPENAI_API_KEY:}") String apiKey) {
        this.service = new OpenAiService(apiKey, Duration.ofSeconds(60));
    }

    public String transcribe(MultipartFile audio) throws IOException {
        File tempFile = File.createTempFile("recording-" + UUID.randomUUID(), ".webm");
        try {
            audio.transferTo(tempFile);

            CreateTranscriptionRequest request = CreateTranscriptionRequest.builder()
                    .model("whisper-1")
                    .build();

            TranscriptionResult result = service.createTranscription(request, tempFile);
            return result.getText();
        } finally {
            tempFile.delete();
        }
    }
}
