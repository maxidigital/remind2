package blue.underwater.remind2;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class ReMind2Application {

    public static void main(String[] args) {
        SpringApplication.run(ReMind2Application.class, args);
    }
}
