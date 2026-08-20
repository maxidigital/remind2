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
 * temp file extension matches whatever the browser actually recorded
 * (webm on Chrome/Android, mp4 on Safari/iOS) instead of being fixed to
 * .ogg — Whisper needs the right extension to pick the right decoder.
 */
@Service
public class WhisperTranscriptionService {

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
                    .build();

            TranscriptionResult result = service.createTranscription(request, tempFile);
            return result.getText();
        } finally {
            tempFile.delete();
        }
    }

    private static String extensionOf(String originalFilename) {
        if (originalFilename != null && originalFilename.contains(".")) {
            return originalFilename.substring(originalFilename.lastIndexOf('.'));
        }
        return ".webm";
    }
}
