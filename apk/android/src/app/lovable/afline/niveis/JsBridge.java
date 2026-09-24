package app.lovable.afline.niveis;

import android.util.Base64;
import android.webkit.JavascriptInterface;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class JsBridge {
    private static final String TAG = "AflineJsBridge";
    private static final int CONNECT_TIMEOUT = 15000;
    private static final int READ_TIMEOUT = 30000;

    @JavascriptInterface
    public String ping() {
        return "pong";
    }

    @JavascriptInterface
    public String captcha(String url) {
        if (url == null || url.isEmpty()) {
            url = "https://afline-niveis.codw23.workers.dev/captcha";
        }
        try {
            HttpURLConnection c = open(url, "GET", null);
            InputStream in = c.getInputStream();
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            in.close();
            c.disconnect();
            byte[] data = bos.toByteArray();
            return "data:image/png;base64," + Base64.encodeToString(data, Base64.NO_WRAP);
        } catch (Exception e) {
            return "data:,";
        }
    }

    @JavascriptInterface
    public String httpGet(String url) {
        try {
            HttpURLConnection c = open(url, "GET", null);
            return readBody(c);
        } catch (Exception e) {
            return "";
        }
    }

    @JavascriptInterface
    public String httpPost(String url, String body) {
        try {
            HttpURLConnection c = open(url, "POST", body);
            return readBody(c);
        } catch (Exception e) {
            return "";
        }
    }

    private HttpURLConnection open(String urlStr, String method, String body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(urlStr).openConnection();
        c.setConnectTimeout(CONNECT_TIMEOUT);
        c.setReadTimeout(READ_TIMEOUT);
        c.setRequestMethod(method);
        c.setInstanceFollowRedirects(true);
        c.setUseCaches(false);
        c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36");
        c.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8");
        if ("POST".equals(method)) {
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            if (body == null) body = "";
            byte[] data = body.getBytes("UTF-8");
            c.setFixedLengthStreamingMode(data.length);
            OutputStream os = c.getOutputStream();
            os.write(data);
            os.flush();
            os.close();
        }
        return c;
    }

    private String readBody(HttpURLConnection c) throws Exception {
        InputStream in = c.getInputStream();
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
        in.close();
        c.disconnect();
        return new String(bos.toByteArray(), "UTF-8");
    }
}