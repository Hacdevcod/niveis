package app.lovable.afline.niveis;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final String TAG = "AflineNiveis";
    private static final String START_URL = "file:///android_asset/index.html";

    private WebView webView;
    private TextView fallbackView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                WindowManager.LayoutParams lp = getWindow().getAttributes();
                lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                getWindow().setAttributes(lp);
            }

            webView = new WebView(this);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                WebView.setWebContentsDebuggingEnabled(true);
            }

            CookieManager cm = CookieManager.getInstance();
            cm.setAcceptCookie(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                cm.setAcceptThirdPartyCookies(webView, true);
            }

            WebSettings s = webView.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setDatabaseEnabled(true);
            s.setAllowFileAccess(true);
            s.setAllowContentAccess(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
                s.setAllowUniversalAccessFromFileURLs(true);
                s.setAllowFileAccessFromFileURLs(true);
            }
            s.setUseWideViewPort(true);
            s.setLoadWithOverviewMode(true);
            s.setSupportZoom(true);
            s.setBuiltInZoomControls(false);
            s.setDisplayZoomControls(false);
            s.setCacheMode(WebSettings.LOAD_DEFAULT);

            webView.setBackgroundColor(Color.parseColor("#0F172A"));

            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onConsoleMessage(ConsoleMessage cm) {
                    Log.d(TAG, "[JS " + cm.messageLevel() + "] " + cm.message() + " @ " + cm.sourceId() + ":" + cm.lineNumber());
                    return true;
                }
            });

            webView.setWebViewClient(new WebViewClient() {
                @Override
                public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                    Log.e(TAG, "onReceivedError " + errorCode + " " + description + " -> " + failingUrl);
                    if (START_URL.equals(failingUrl) || failingUrl == null || failingUrl.startsWith("file://")) {
                        showFallback("Não foi possível carregar o app\n\n" + description);
                    }
                }
            });

            setContentView(webView);

            // Ponte Java<->JS : resolve rede direto do Java (envia os cookies da sessao
            // e contorna bloqueio de CORS/origem que o WebView aplica em pagina file://).
            webView.addJavascriptInterface(new JsBridge(), "Afline");

            webView.loadUrl(START_URL);

        } catch (Throwable t) {
            Log.e(TAG, "falha ao montar tela", t);
            showFallback("Falha ao iniciar o app\n\n" + t);
        }
    }

    private void showFallback(String msg) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (fallbackView == null) {
                    fallbackView = new TextView(MainActivity.this);
                    fallbackView.setTextSize(15f);
                    fallbackView.setTextColor(Color.WHITE);
                    fallbackView.setBackgroundColor(Color.parseColor("#7F1D1D"));
                    fallbackView.setPadding(24, 24, 24, 24);
                    fallbackView.setText(msg);
                    setContentView(fallbackView);
                }
            }
        });
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        finish();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
        }
        super.onDestroy();
    }
}