package com.pmesp.manutencao

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Bitmap
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.LinearLayout
import android.util.TypedValue
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

/**
 * Manutenção PMESP — Mobile WebView Otimizado
 *
 * - Viewport mobile fixo (sem zoom horizontal esquisito)
 * - Pinch-to-zoom habilitado (gesto de pinça)
 * - CSS injection pra mobile-friendly
 * - Pull-to-refresh
 * - Progress bar
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private val APP_URL = "https://manutencao-drab.vercel.app"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Manter tela ligada
        window.setFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        )

        // Layout: LinearLayout vertical (progress + swipe > webview)
        val rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }

        // Barra de progresso no topo (3dp)
        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dpToPx(3)
            )
            max = 100
            progress = 0
        }
        rootLayout.addView(progressBar)

        // SwipeRefresh com WebView dentro
        swipeRefresh = SwipeRefreshLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
            setColorSchemeColors(0xFF003882.toInt(), 0xFFf6d700.toInt(), 0xFFe30613.toInt())
        }

        webView = WebView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT
            )
        }

        swipeRefresh.addView(webView)
        rootLayout.addView(swipeRefresh)

        setContentView(rootLayout)

        // === WEBVIEW SETTINGS (otimizado pra mobile) ===
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true

            // Viewport mobile (crítico pro site se ajustar à tela)
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false  // esconde os botões +/-
            // Escala inicial: 100% (caber tudo sem zoom)
            // (setado no WebViewClient abaixo)

            // User agent mobile (não desktop, pra forçar layout responsivo)
            // Mas como o site já tem @media, deixar o UA padrão

            // Cache e network
            cacheMode = WebSettings.LOAD_DEFAULT
            loadsImagesAutomatically = true
            blockNetworkImage = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW

            // Texto
            textZoom = 100  // sem zoom de texto extra

            // Outros
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = true
            allowContentAccess = true
            setGeolocationEnabled(false)
            javaScriptCanOpenWindowsAutomatically = false
        }

        // Cookies (Clerk auth)
        android.webkit.CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        // === WEB CHROME CLIENT (progresso + janelas) ===
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress < 100) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                }
            }

            // Captura window.open() (target="_blank") e abre dentro do mesmo WebView
            override fun onCreateWindow(
                view: WebView?,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: android.os.Message?
            ): Boolean {
                if (resultMsg == null) return false
                val transport = resultMsg.obj as? android.webkit.WebView.WebViewTransport ?: return false
                val newWebView = WebView(this@MainActivity)
                newWebView.settings.javaScriptEnabled = true
                newWebView.webViewClient = webView.webViewClient
                transport.webView = newWebView
                resultMsg.sendToTarget()
                return true
            }
        }

        // === WEB VIEW CLIENT (navegação + ajustes) ===
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    // Domínios do nosso sistema (Vercel, Convex, Clerk) - sempre dentro
                    val internalDomains = listOf(
                        // Vercel
                        "manutencao-drab.vercel.app",
                        "vercel.app",
                        // Convex
                        "decisive-kiwi-683.convex.cloud",
                        "convex.cloud",
                        "convex.dev",
                        // Clerk (muitos subdomínios)
                        "clerk.accounts.dev",
                        "clerk.com",
                        "clerk.dev",
                        "clerk.telemetry.dev",
                        "clerk-image-resizer.clerk.com",
                        // Google (reCAPTCHA, fonts)
                        "google.com",
                        "googleapis.com",
                        "gstatic.com",
                        "recaptcha.net"
                    )
                    val isInternal = internalDomains.any { domain ->
                        url.contains("://" + domain) || url.contains("." + domain + "/") || url.endsWith("." + domain)
                    }
                    if (isInternal) {
                        view.loadUrl(url)
                        return false
                    } else {
                        // Link externo: abre no navegador do sistema
                        try {
                            val intent = android.content.Intent(
                                android.content.Intent.ACTION_VIEW,
                                android.net.Uri.parse(url)
                            )
                            startActivity(intent)
                            return true
                        } catch (e: Exception) {
                            view.loadUrl(url)
                            return false
                        }
                    }
                }
                view.loadUrl(url)
                return false
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                progressBar.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                progressBar.visibility = View.GONE
                swipeRefresh.isRefreshing = false

                // Injeta CSS pra forçar layout mobile-friendly
                // Isso garante que mesmo se a página não tenha media query, vai se adaptar
                view?.evaluateJavascript(MOBILE_CSS_INJECTION, null)
            }
        }

        // Pull-to-refresh
        swipeRefresh.setOnRefreshListener {
            webView.reload()
        }

        // Carrega URL
        if (savedInstanceState == null) {
            webView.loadUrl(APP_URL)
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    // Botão voltar navega no histórico
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun dpToPx(dp: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            dp.toFloat(),
            resources.displayMetrics
        ).toInt()
    }

    companion object {
        // CSS + JS injetado em TODA página pra garantir layout mobile
        // + dropdown de navegação nativo do app
        // Usa MutationObserver pra reaplicar se Next.js re-renderizar
        private const val MOBILE_CSS_INJECTION = """
            (function() {
              function applyMobileFix() {
                // === 1. CSS: força layout mobile ===
                if (!document.getElementById('pmesp-mobile-fix')) {
                  var css = document.createElement('style');
                  css.id = 'pmesp-mobile-fix';
                  css.innerHTML = ''
                    + 'html, body { overflow-x: hidden !important; overflow-y: auto !important; -webkit-overflow-scrolling: touch !important; }'
                    + 'body { -webkit-text-size-adjust: 100% !important; }'
                    + 'input, select, textarea { font-size: 16px !important; }'
                    + '* { -webkit-tap-highlight-color: rgba(0, 56, 130, 0.2); }'
                    // Esconde a nav horizontal (que vira barra no topo no mobile)
                    + '.sidebar nav { display: none !important; }'
                    + '.main-content { padding-top: 80px !important; }'
                    + '.sidebar { width: 100% !important; height: 56px !important; min-height: unset !important; flex-direction: row !important; }'
                    + '.sidebar .logo-area { padding: 6px 12px !important; border-bottom: none !important; border-right: 1px solid rgba(255,255,255,0.1) !important; }'
                    + '.sidebar .logo-area img { width: 32px !important; height: 32px !important; margin-bottom: 0 !important; }'
                    + '.sidebar .logo-area .system-name { font-size: 13px !important; margin: 0 !important; }'
                    + '.sidebar .logo-area .org-name { display: none !important; }'
                    + '.sidebar .sidebar-footer { display: none !important; }';
                  (document.head || document.documentElement).appendChild(css);
                }

                // === 2. DROPDOWN DE NAVEGAÇÃO ===
                if (document.getElementById('pmesp-app-nav')) return;
                if (!document.body) return;

                var links = [
                  { url: '/gestor',          label: '📊 Dashboard',         match: /^\/gestor$|^\/gestor\/$/ },
                  { url: '/gestor/aprovar',  label: '👥 Aprovar Usuários',  match: /^\/gestor\/aprovar/ },
                  { url: '/gestor/equipes',  label: '🔧 Equipes',            match: /^\/gestor\/equipes/ },
                  { url: '/gestor/relatorios', label: '📈 Relatórios',       match: /^\/gestor\/relatorios/ },
                  { url: '/tecnico',         label: '🔧 Painel Técnico',    match: /^\/tecnico/ },
                  { url: '/solicitar',       label: '➕ Solicitar',          match: /^\/solicitar/ }
                ];

                var currentPath = window.location.pathname;
                var currentLink = links.find(function(l) { return l.match.test(currentPath); });

                var container = document.createElement('div');
                container.id = 'pmesp-app-nav';
                container.style.cssText = 'position: fixed; top: 56px; left: 0; right: 0; z-index: 9999; background: #003882; padding: 8px 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); border-bottom: 2px solid #f6d700;';

                var select = document.createElement('select');
                select.id = 'pmesp-app-nav-select';
                select.style.cssText = 'width: 100%; padding: 10px 12px; border-radius: 8px; border: none; font-size: 15px; background: #fff; color: #003882; font-weight: 600; cursor: pointer;';

                var defaultOpt = document.createElement('option');
                defaultOpt.value = '';
                defaultOpt.textContent = '— Navegar para —';
                if (!currentLink) defaultOpt.selected = true;
                select.appendChild(defaultOpt);

                links.forEach(function(link) {
                  var option = document.createElement('option');
                  option.value = link.url;
                  option.textContent = link.label;
                  if (currentLink && currentLink.url === link.url) {
                    option.selected = true;
                    defaultOpt.selected = false;
                  }
                  select.appendChild(option);
                });

                select.addEventListener('change', function() {
                  if (this.value) {
                    window.location.href = this.value;
                  }
                });

                container.appendChild(select);
                document.body.appendChild(container);
              }

              // Aplica agora
              applyMobileFix();

              // Re-aplica sempre que o DOM mudar (Next.js client-side navigation)
              var observer = new MutationObserver(function(mutations) {
                applyMobileFix();
              });
              observer.observe(document.documentElement, {
                childList: true,
                subtree: true
              });
            })();
        """
    }
}
