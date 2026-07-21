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
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private val APP_URL = "https://manutencao-drab.vercel.app"

    private val NOTIFICATION_PERMISSION_REQUEST = 1001

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Não mantém tela ligada direto - deixa o sistema entrar em proteção
        // quando o usuário não interagir. Usuário pode tocar a tela pra acender.
        // (Removido FLAG_KEEP_SCREEN_ON a pedido do William - tela 2026-07-21)

        // Pede permissão de notificação (Android 13+)
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(
                    arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),
                    NOTIFICATION_PERMISSION_REQUEST
                )
            }
        }

        // Pega o FCM token e expõe pro JavaScript (vai enviar pro Convex via httpAction)
        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().token
                .addOnCompleteListener { task ->
                    if (task.isSuccessful) {
                        val token = task.result
                        android.util.Log.d("MainActivity", "FCM token obtido: ${token.take(20)}...")
                        // Garante que o WebView já existe antes de injetar
                        if (webView != null) {
                            webView.evaluateJavascript(
                                "window.__fcmToken = " + jsString(token) + "; console.log('FCM: token injetado no window');", null
                            )
                        }
                    } else {
                        android.util.Log.e("MainActivity", "Falha ao pegar FCM token", task.exception)
                    }
                }
        } catch (e: Exception) {
            android.util.Log.e("MainActivity", "Erro FCM", e)
        }

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
            displayZoomControls = false
            cacheMode = WebSettings.LOAD_DEFAULT
            loadsImagesAutomatically = true
            blockNetworkImage = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            textZoom = 100
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = true
            allowContentAccess = true
            setGeolocationEnabled(false)

            // IMPORTANTE: User-Agent SEM o "wv" identifier
            // O Google bloqueia OAuth em WebView identificando pelo "wv" no UA.
            // Usamos um UA "real" de Chrome mobile, sem o marker de WebView.
            userAgentString = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36 PMESP-Manutencao"
        }

        // Cookies (Clerk auth)
        android.webkit.CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        // === WEB CHROME CLIENT (progresso) ===
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress < 100) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                }
            }
        }

        // === WEB VIEW CLIENT (navegação + ajustes) ===
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                // Versão simples: HTTP/HTTPS ficam dentro do WebView
                // Schemes especiais abrem em app externo
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    return false  // deixa o WebView navegar
                }
                try {
                    val intent = android.content.Intent(
                        android.content.Intent.ACTION_VIEW,
                        android.net.Uri.parse(url)
                    )
                    startActivity(intent)
                } catch (e: Exception) { }
                return true
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                progressBar.visibility = View.VISIBLE
                // Injeta JS de navegação ANTES do site rodar (sobrescreve window.open)
                view?.evaluateJavascript(NAVIGATION_OVERRIDE, null)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                progressBar.visibility = View.GONE
                swipeRefresh.isRefreshing = false

                // Injeta CSS + JS de logout (botão flutuante + item no dropdown)
                view?.evaluateJavascript(MOBILE_CSS_INJECTION, null)
                view?.evaluateJavascript(LOGOUT_INJECTION, null)
                // Salva o FCM token no Convex via httpAction (não precisa de JWT Clerk)
                view?.evaluateJavascript(FCM_TOKEN_SAVE, null)
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

    /**
     * Encoda uma string pra ser usada DENTRO de uma string JS injetada.
     * Escapa: barra invertida, aspas simples, aspas duplas, newline, carriage return.
     */
    private fun jsString(s: String): String {
        return "\"" + s
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r") + "\""
    }

    companion object {
        // JS injetado no onPageFinished pra salvar o FCM token no Convex via httpAction
        // Pega o Clerk user.id (do ClerkProvider) e o window.__fcmToken (setado pelo MainActivity
        // no callback do Firebase) e faz POST pra httpAction saveFcmToken
        //
        // Por que httpAction e não mutation?
        //   - A mutation saveFcmToken exige JWT Clerk
        //   - No MainActivity não temos o JWT (não é auth de browser)
        //   - httpAction valida via appSecret compartilhado
        private const val FCM_TOKEN_SAVE = """
            (function() {
              if (window.__pmespFcmSaving) return;
              window.__pmespFcmSaving = true;
              console.log('[FCM] Script FCM_TOKEN_SAVE injetado');

              function trySave(reason) {
                console.log('[FCM] trySave(' + reason + ') - token=' + (window.__fcmToken ? 'PRESENTE' : 'AUSENTE'));
                if (!window.__fcmToken) {
                  return false;
                }
                // Pega o Clerk user id (aguarda carregar)
                var clerkUser = null;
                if (window.Clerk && window.Clerk.user) {
                  clerkUser = window.Clerk.user;
                }
                console.log('[FCM] Clerk=' + (window.Clerk ? 'OK' : 'AUSENTE') + ', user=' + (clerkUser ? clerkUser.id : 'AUSENTE'));
                if (!clerkUser || !clerkUser.id) {
                  return false;
                }

                // Evita duplicar
                if (window.__pmespFcmSaved) {
                  console.log('[FCM] ja salvo antes, pulando');
                  return true;
                }
                window.__pmespFcmSaved = true;

                var token = window.__fcmToken;
                var clerkId = clerkUser.id;
                var appSecret = "PMESP-FCM-2026-manutencao-drab";

                console.log('[FCM] Enviando POST /saveFcmToken...');
                fetch('https://decisive-kiwi-683.convex.site/saveFcmToken', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ clerkId: clerkId, token: token, appSecret: appSecret })
                })
                .then(function(res) {
                  console.log('[FCM] HTTP status=' + res.status);
                  return res.text();
                })
                .then(function(text) {
                  console.log('[FCM] Resposta: ' + text);
                })
                .catch(function(err) {
                  console.error('[FCM] Erro: ' + err);
                  window.__pmespFcmSaved = false; // permite tentar de novo
                });
                return true;
              }

              // Tenta várias vezes (Clerk pode demorar pra carregar)
              var attempts = 0;
              var interval = setInterval(function() {
                attempts++;
                var ok = trySave('tick#' + attempts);
                if (ok || attempts > 30) { // 30 tentativas × 1s = 30s
                  clearInterval(interval);
                  console.log('[FCM] Parou de tentar (attempts=' + attempts + ', ok=' + ok + ')');
                }
              }, 1000);
            })();
        """

        // JS injetado IMEDIATAMENTE quando a página começa a carregar.
        // Sobrescreve window.open() pra chamar o JavaScript Interface (Android.navigateTo)
        // que faz a navegação no WebView principal, evitando popup externa
        private const val NAVIGATION_OVERRIDE = """
            (function() {
              if (window.__pmespNavOverride) return;
              window.__pmespNavOverride = true;

              // Sobrescreve window.open pra chamar Android.navigateTo (JS Interface)
              // Isso GARANTE que a navegação aconteça no WebView principal
              window.open = function(url, target, features) {
                if (url && window.Android && window.Android.navigateTo) {
                  window.Android.navigateTo(url);
                } else if (url) {
                  window.location.href = url;
                }
                return null;
              };

              // Força todos os links target="_blank" a abrirem na mesma janela
              document.addEventListener('click', function(e) {
                var el = e.target;
                while (el && el.tagName !== 'A') {
                  el = el.parentElement;
                }
                if (el && el.target === '_blank') {
                  el.target = '_self';
                }
              }, true);

              // Sobrescreve form target="_blank"
              document.addEventListener('submit', function(e) {
                var form = e.target;
                if (form && form.target === '_blank') {
                  form.target = '_self';
                }
              }, true);
            })();
        """

        // JS injetado DEPOIS (no onPageFinished) que adiciona o item "Sair" no dropdown
        // do app pra fazer logout via Clerk
        private const val LOGOUT_INJECTION = """
            (function() {
              function addLogoutOption() {
                if (document.getElementById('pmesp-logout-marker')) return;

                // Espera o dropdown do app estar no DOM
                var nav = document.getElementById('pmesp-app-nav-select');
                if (!nav) return false;

                // Cria um option "Sair" e adiciona no dropdown
                var sairOption = document.createElement('option');
                sairOption.id = 'pmesp-logout-marker';
                sairOption.value = '__logout__';
                sairOption.textContent = '🚪 Sair do sistema';
                nav.appendChild(sairOption);

                // Handler: quando seleciona "Sair", chama Clerk.signOut()
                nav.addEventListener('change', function() {
                  if (this.value === '__logout__') {
                    // Reseta o select pra opção anterior
                    this.value = '';
                    // Tenta usar o Clerk JS API
                    if (window.Clerk && window.Clerk.signOut) {
                      window.Clerk.signOut().then(function() {
                        window.location.reload();
                      }).catch(function(e) {
                        // Fallback: força reload + clear cookies
                        document.cookie.split(";").forEach(function(c) {
                          document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
                        });
                        window.location.href = '/';
                      });
                    } else {
                      // Fallback: vai pra raiz que mostra tela de login
                      window.location.href = '/';
                    }
                  }
                });

                return true;
              }

              // Tenta adicionar imediatamente
              if (!addLogoutOption()) {
                // Se o dropdown não tá pronto ainda, espera ele aparecer
                var observer = new MutationObserver(function() {
                  if (addLogoutOption()) {
                    observer.disconnect();
                  }
                });
                observer.observe(document.body, { childList: true, subtree: true });
              }
            })();
        """

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

                // === 1.5. Forçar que target=_blank abra na MESMA janela ===
                if (!document.getElementById('pmesp-link-override')) {
                  var cssLinks = document.createElement('style');
                  cssLinks.id = 'pmesp-link-override';
                  cssLinks.innerHTML = 'a[target="_blank"] { target: _self !important; }';
                  (document.head || document.documentElement).appendChild(cssLinks);
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
