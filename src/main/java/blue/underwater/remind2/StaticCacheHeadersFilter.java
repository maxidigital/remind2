package blue.underwater.remind2;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Vite hashes every asset filename on build (index-XXXX.js), so /assets/** can be cached
 * forever. index.html references those hashes and is NOT hashed itself, so it must always
 * be revalidated — otherwise a browser/WebView that caches it aggressively (notably iOS
 * Safari standalone home-screen apps) keeps pointing at a previous build's asset filenames
 * indefinitely, surviving even a force-quit/relaunch.
 */
@Component
public class StaticCacheHeadersFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        if (path.startsWith("/assets/")) {
            response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (path.equals("/") || path.equals("/index.html")) {
            response.setHeader("Cache-Control", "no-cache");
        }
        chain.doFilter(request, response);
    }
}
