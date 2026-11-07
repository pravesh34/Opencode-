package com.opengateway.app

import android.annotation.SuppressLint
import android.Manifest
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.text.InputType
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.webkit.*
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.Toolbar
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.android.material.snackbar.Snackbar
import java.io.File
import java.io.IOException

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipe: SwipeRefreshLayout
    private lateinit var progress: View
    private lateinit var progressFill: View
    private lateinit var errorView: View
    private lateinit var errorTitle: TextView
    private lateinit var errorSubtitle: TextView
    private lateinit var splash: View
    private lateinit var toolbar: Toolbar
    private lateinit var offlineBanner: View
    private lateinit var offlineLabel: TextView

    private var hasFinishedFirstLoad = false
    private var currentUrl: String = ""
    private var lastErrorDescription: String? = null
    private var lastErrorUrl: String? = null

    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private val fileChooserLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val cb = filePathCallback; filePathCallback = null
        if (result.resultCode != RESULT_OK) { cb?.onReceiveValue(null); return@registerForActivityResult }
        val data = result.data
        var uris: Array<Uri>? = null
        if (data?.data != null) uris = arrayOf(data.data!!)
        else {
            // camera capture fallback
            cameraImageUri?.let { uris = arrayOf(it) }
        }
        cb?.onReceiveValue(uris)
        cameraImageUri = null
        invalidateFileChooserMenu()
    }
    private var cameraImageUri: Uri? = null

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            runOnUiThread {
                offlineBanner.visibility = View.GONE
                Snackbar.make(webView, R.string.online, Snackbar.LENGTH_SHORT).show()
                if (hasFinishedFirstLoad && lastErrorDescription != null) {
                    // auto-retry once when back online
                    webView.reload()
                }
            }
        }
        override fun onLost(network: Network) {
            runOnUiThread {
                offlineBanner.visibility = View.VISIBLE
                Snackbar.make(webView, R.string.offline, Snackbar.LENGTH_LONG).show()
            }
        }
        override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
            val hasNet = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                    caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            runOnUiThread { offlineBanner.visibility = if (hasNet) View.GONE else View.VISIBLE }
        }
    }

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)
        swipe = findViewById(R.id.swipe)
        progress = findViewById(R.id.progress)
        progressFill = findViewById(R.id.progress_fill)
        errorView = findViewById(R.id.error_view)
        errorTitle = findViewById(R.id.error_title)
        errorSubtitle = findViewById(R.id.error_subtitle)
        splash = findViewById(R.id.splash)
        toolbar = findViewById(R.id.toolbar)
        offlineBanner = findViewById(R.id.offline_banner)
        offlineLabel = findViewById(R.id.offline_label)

        setSupportActionBar(toolbar)
        supportActionBar?.title = getString(R.string.app_name)
        progressFill.pivotX = 0f
        progressFill.scaleX = 0f
        progressFill.visibility = View.GONE

        // Edge-to-edge insets: keep content below toolbar / bars
        ViewCompat.setOnApplyWindowInsetsListener(swipe) { v, insets ->
            val sys = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(v.paddingLeft, sys.top, v.paddingRight, sys.bottom)
            insets
        }

        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val savedUrl = prefs.getString(KEY_URL, null)
        currentUrl = (savedUrl?.takeIf { it.isNotBlank() } ?: BuildConfig.GATEWAY_URL).trim()
        // First launch: persist the zero-config default (127.0.0.1) so the
        // user never has to set a Gateway URL manually.
        if (savedUrl.isNullOrBlank()) {
            prefs.edit().putString(KEY_URL, currentUrl).apply()
        }

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            useWideViewPort = true
            loadWithOverviewMode = true
            builtInZoomControls = true
            displayZoomControls = false
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = false
            allowContentAccess = true
            loadsImagesAutomatically = true
            userAgentString = "$userAgentString OpenGatewayKotlin/2.0"
            @Suppress("DEPRECATION")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                safeBrowsingEnabled = true
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                if (url != null) { currentUrl = url; lastErrorDescription = null }
                progressFill.visibility = View.VISIBLE
                progressFill.setScaleX(0f)
                hideError()
            }
            override fun onPageFinished(view: WebView?, url: String?) {
                progressFill.visibility = View.GONE
                progressFill.setScaleX(0f)
                swipe.isRefreshing = false
                if (!hasFinishedFirstLoad) {
                    hasFinishedFirstLoad = true
                    fadeOutSplash()
                }
                updateNavMenu()
                refreshOfflineBanner()
            }
            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (request?.isForMainFrame != true) return
                showError(error?.description?.toString() ?: getString(R.string.error_title), request?.url?.toString() ?: currentUrl)
            }
            @Deprecated("Deprecated in Java")
            override fun onReceivedError(view: WebView?, errorCode: Int, description: String?, failingUrl: String?) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) return // handled above
                showError(description ?: getString(R.string.error_title), failingUrl ?: currentUrl)
            }
            override fun onReceivedHttpError(view: WebView?, request: WebResourceRequest?, errorResponse: WebResourceResponse?) {
                if (request?.isForMainFrame != true) return
                val code = errorResponse?.statusCode ?: 0
                if (code >= 400) {
                    showError(getString(R.string.error_http, code), request?.url?.toString() ?: currentUrl)
                }
            }
            override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler?, error: SslError?) {
                AlertDialog.Builder(this@MainActivity)
                    .setTitle(R.string.ssl_title)
                    .setMessage(getString(R.string.ssl_msg, error?.url ?: ""))
                    .setPositiveButton(R.string.continue_label) { _, _ -> handler?.proceed() }
                    .setNegativeButton(R.string.cancel_label) { _, _ -> handler?.cancel() }
                    .setNeutralButton(R.string.view_cert) { _, _ ->
                        try {
                            val cert = error?.certificate
                            AlertDialog.Builder(this@MainActivity)
                                .setTitle(R.string.view_cert)
                                .setMessage(cert?.issuedTo?.toString() ?: getString(R.string.cert_unknown))
                                .setPositiveButton(android.R.string.ok, null)
                                .show()
                            handler?.cancel()
                        } catch (_: Exception) { handler?.cancel() }
                    }
                    .show()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress in 1..99) {
                    progressFill.visibility = View.VISIBLE
                    progressFill.setScaleX(newProgress / 100f)
                } else if (newProgress == 100) {
                    progressFill.visibility = View.GONE
                    progressFill.setScaleX(0f)
                }
            }
            override fun onShowFileChooser(
                view: WebView?, filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                filePathCallback?.let { this@MainActivity.filePathCallback = it }
                val takePhotoIntent: Intent? = try {
                    val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                    if (intent.resolveActivity(packageManager) != null) {
                        val photo = File.createTempFile("IMG_", ".jpg", cacheDir)
                        val uri = FileProvider.getUriForFile(this@MainActivity, "${BuildConfig.APPLICATION_ID}.fileprovider", photo)
                        cameraImageUri = uri
                        intent.putExtra(MediaStore.EXTRA_OUTPUT, uri)
                        intent
                    } else null
                } catch (_: IOException) { null }
                val contentIntent = try {
                    val intent = Intent(Intent.ACTION_GET_CONTENT)
                    intent.addCategory(Intent.CATEGORY_OPENABLE)
                    intent.type = "*/*"
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    if (fileChooserParams != null) {
                        try {
                            val types = fileChooserParams.acceptTypes
                            if (!types.isNullOrEmpty()) intent.putExtra(Intent.EXTRA_MIME_TYPES, types)
                        } catch (_: Exception) {}
                    }
                    intent
                } catch (_: Exception) { null }
                if (contentIntent == null) { this@MainActivity.filePathCallback?.onReceiveValue(null); this@MainActivity.filePathCallback = null; return false }
                val chooser = Intent.createChooser(contentIntent, getString(R.string.choose_file))
                if (takePhotoIntent != null) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(takePhotoIntent))
                try { fileChooserLauncher.launch(chooser); return true }
                catch (_: Exception) { this@MainActivity.filePathCallback?.onReceiveValue(null); this@MainActivity.filePathCallback = null; return false }
            }
            override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: GeolocationPermissions.Callback?) {
                callback?.invoke(origin, true, false)
            }
            override fun onPermissionRequest(request: android.webkit.PermissionRequest?) {
                request?.grant(request.resources)
            }
        }

        webView.setDownloadListener { url, userAgent, contentDisposition, mimetype, _ ->
            try {
                val req = DownloadManager.Request(Uri.parse(url))
                req.setMimeType(mimetype)
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, URLUtil.guessFileName(url, contentDisposition, mimetype))
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                req.setAllowedOverMetered(true)
                @Suppress("DEPRECATION")
                req.setAllowedOverRoaming(true)
                (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
                Toast.makeText(this, getString(R.string.download_started), Toast.LENGTH_SHORT).show()
            } catch (_: Exception) {
                openInBrowser(url)
            }
        }

        // long-press: link / image / text actions
        webView.setOnLongClickListener {
            val result = webView.hitTestResult
            when (result.type) {
                WebView.HitTestResult.SRC_ANCHOR_TYPE, WebView.HitTestResult.IMAGE_TYPE, WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE -> {
                    showLinkMenu(result.extra)
                    true
                }
                WebView.HitTestResult.EMAIL_TYPE -> { result.extra?.let { openInBrowser("mailto:$it") }; true }
                WebView.HitTestResult.PHONE_TYPE -> { result.extra?.let { openInBrowser("tel:$it") }; true }
                WebView.HitTestResult.GEO_TYPE -> { result.extra?.let { openInBrowser(it) }; true }
                else -> false // let WebView handle text selection
            }
        }

        swipe.setOnRefreshListener { webView.reload() }
        swipe.setColorSchemeColors(getColor(R.color.accent))
        swipe.setDistanceToTriggerSync(80)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    errorView.visibility == View.VISIBLE -> webView.reload()
                    webView.canGoBack() -> webView.goBack()
                    else -> finish()
                }
            }
        })

        findViewById<View>(R.id.error_retry).setOnClickListener { webView.reload() }
        findViewById<View>(R.id.error_settings).setOnClickListener { showSettingsDialog() }
        findViewById<View>(R.id.offline_retry).setOnClickListener { webView.reload() }

        // connectivity
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        try { cm.registerDefaultNetworkCallback(networkCallback) } catch (_: Exception) {}
        if (!isOnline()) offlineBanner.visibility = View.VISIBLE

        // external intent: ACTION_VIEW or SEND
        val data = intent?.data
        val initialUrl = when {
            intent?.action == Intent.ACTION_VIEW && data != null -> data.toString()
            intent?.action == Intent.ACTION_SEND && intent.getStringExtra(Intent.EXTRA_TEXT) != null -> intent.getStringExtra(Intent.EXTRA_TEXT)!!
            else -> null
        }
        if (initialUrl != null && initialUrl.isNotBlank()) {
            if (isUrlLike(initialUrl)) {
                currentUrl = initialUrl
                webView.loadUrl(initialUrl)
            } else {
                webView.loadUrl(buildSearchUrl(initialUrl))
            }
        } else if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(currentUrl)
        }

        updateNavMenu()
        ensureNotificationPermission()
        // Option 1: if the user points at localhost, try to start the in-app
        // gateway service so the UI just works without Termux typing.
        if (isLocalGatewayUrl(currentUrl) && !GatewayRuntime.isGatewayRunning()) {
            GatewayService.start(this)
        }
    }

    private fun isLocalGatewayUrl(url: String): Boolean {
        val u = url.lowercase()
        return u.contains("127.0.0.1") || u.contains("localhost") || u.contains("10.0.2.2")
    }

    private fun ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this, Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                ActivityCompat.requestPermissions(
                    this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 42
                )
            }
        }
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.menu_main, menu)
        return true
    }

    override fun onPrepareOptionsMenu(menu: Menu): Boolean {
        val back = menu.findItem(R.id.menu_back)
        val fwd = menu.findItem(R.id.menu_forward)
        back?.isEnabled = webView.canGoBack()
        fwd?.isEnabled = webView.canGoForward()
        fwd?.icon?.setAlpha(if (fwd.isEnabled) 255 else 80)
        back?.icon?.setAlpha(if (back.isEnabled) 255 else 80)
        return super.onPrepareOptionsMenu(menu)
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.menu_reload -> { webView.reload(); true }
            R.id.menu_home -> { webView.loadUrl(currentUrl); true }
            R.id.menu_back -> { if (webView.canGoBack()) webView.goBack(); true }
            R.id.menu_forward -> { if (webView.canGoForward()) webView.goForward(); true }
            R.id.menu_share -> { shareCurrent(); true }
            R.id.menu_copy_url -> { copyUrl(webView.url ?: currentUrl); true }
            R.id.menu_open_browser -> { openInBrowser(webView.url ?: currentUrl); true }
            R.id.menu_native_terminal -> { startActivity(Intent(this, NativeTerminalActivity::class.java)); true }
            R.id.menu_opencode_setup -> { startActivity(Intent(this, OpenCodeSetupActivity::class.java)); true }
            R.id.menu_gateway_start -> { GatewayService.start(this); Toast.makeText(this, getString(R.string.gateway_starting), Toast.LENGTH_SHORT).show(); true }
            R.id.menu_gateway_stop -> { GatewayService.stop(this); Toast.makeText(this, getString(R.string.gateway_stopping), Toast.LENGTH_SHORT).show(); true }
            R.id.menu_termux -> { openTermuxApp(); true }
            R.id.menu_opencode -> { openOpencodeTab(); true }
            R.id.menu_settings -> { showSettingsDialog(); true }
            else -> super.onOptionsItemSelected(item)
        }
    }

    private fun openTermuxApp() {
        val intent = try {
            val pkg = packageManager.getLaunchIntentForPackage("com.termux")
            if (pkg != null) {
                pkg.addCategory(Intent.CATEGORY_LAUNCHER)
                pkg.setPackage("com.termux")
                pkg.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                pkg
            } else null
        } catch (_: Exception) { null }
        if (intent != null) {
            try { startActivity(intent) }
            catch (_: Exception) { Toast.makeText(this, getString(R.string.termux_missing), Toast.LENGTH_SHORT).show() }
        } else {
            Toast.makeText(this, getString(R.string.termux_missing), Toast.LENGTH_SHORT).show()
            // fallback: open the Termux tab inside the web app
            webView.loadUrl("$currentUrl#terminal")
        }
    }

    private fun openOpencodeTab() {
        val base = currentUrl.trimEnd('/')
        webView.loadUrl("$base#opencode")
    }

    private fun showSettingsDialog() {
        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val current = prefs.getString(KEY_URL, null)?.takeIf { it.isNotBlank() } ?: BuildConfig.GATEWAY_URL
        val input = EditText(this).apply {
            setText(current); hint = "https://…"; inputType = InputType.TYPE_TEXT_VARIATION_URI; isSingleLine = true
        }
        val dialog = AlertDialog.Builder(this)
            .setTitle(R.string.settings_title)
            .setView(input)
            .setPositiveButton(R.string.save_reload) { _, _ ->
                val v = input.text.toString().trim()
                if (v.isBlank()) { Toast.makeText(this, getString(R.string.enter_url), Toast.LENGTH_SHORT).show(); showSettingsDialog(); return@setPositiveButton }
                prefs.edit().putString(KEY_URL, v).apply()
                currentUrl = v
                Toast.makeText(this, getString(R.string.saved), Toast.LENGTH_SHORT).show()
                webView.loadUrl(v)
            }
            .setNegativeButton(R.string.cancel_label, null)
            .setNeutralButton(R.string.clear_cache) { _, _ ->
                webView.clearCache(true); webView.clearHistory()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    CookieManager.getInstance().removeAllCookies(null)
                } else {
                    @Suppress("DEPRECATION")
                    CookieManager.getInstance().removeAllCookie()
                }
                Toast.makeText(this, getString(R.string.cache_cleared), Toast.LENGTH_SHORT).show()
            }
            .show()
        input.requestFocus()
        input.setSelection(input.text.length)
    }

    private fun showLinkMenu(url: String?) {
        val link = url ?: return
        AlertDialog.Builder(this)
            .setTitle(link)
            .setItems(arrayOf(getString(R.string.open_link), getString(R.string.share), getString(R.string.copy_url), getString(R.string.download), getString(R.string.cancel_label))) { _, which ->
                when (which) {
                    0 -> openInBrowser(link)
                    1 -> shareText(link)
                    2 -> copyText(link)
                    3 -> { shareText(link) } // downloads handled by DownloadListener for direct files
                    4 -> {}
                }
            }
            .show()
    }

    private fun shareCurrent() = shareText(webView.url ?: currentUrl)
    private fun shareText(text: String) {
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text)
        }, getString(R.string.share)))
    }
    private fun copyUrl(url: String) = copyText(url)
    private fun copyText(text: String) {
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as? android.content.ClipboardManager ?: return
        cm.setPrimaryClip(android.content.ClipData.newPlainText("url", text))
        Toast.makeText(this, getString(R.string.copied), Toast.LENGTH_SHORT).show()
    }
    private fun openInBrowser(url: String) {
        if (url.isBlank()) return
        try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
        catch (_: Exception) { Toast.makeText(this, getString(R.string.error_title), Toast.LENGTH_SHORT).show() }
    }

    private fun showError(title: String, url: String) {
        lastErrorDescription = title
        lastErrorUrl = url
        errorTitle.text = title
        errorSubtitle.text = url
        errorView.visibility = View.VISIBLE
        progressFill.visibility = View.GONE
        swipe.isRefreshing = false
        if (!hasFinishedFirstLoad) {
            hasFinishedFirstLoad = true
            fadeOutSplash()
        }
        // If we point at localhost, the server may just not be running yet —
        // start the in-app gateway service and retry shortly.
        if (isLocalGatewayUrl(url) && !GatewayRuntime.isGatewayRunning()) {
            GatewayService.start(this)
            webView.postDelayed({ if (errorView.visibility == View.VISIBLE) webView.reload() }, 3000)
        }
    }
    private fun hideError() { errorView.visibility = View.GONE }
    private fun fadeOutSplash() {
        splash.animate().alpha(0f).setDuration(300).withEndAction { splash.visibility = View.GONE }
    }

    private fun updateNavMenu() {
        invalidateOptionsMenu()
    }
    private fun invalidateFileChooserMenu() { /* chooser flow only; nothing global */ }

    private fun isOnline(): Boolean {
        return try {
            val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val caps = cm.getNetworkCapabilities(cm.activeNetwork)
            caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        } catch (_: Exception) { true }
    }
    private fun refreshOfflineBanner() {
        offlineBanner.visibility = if (isOnline()) View.GONE else View.VISIBLE
    }

    private fun isUrlLike(s: String): Boolean {
        return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("www.")
    }
    private fun buildSearchUrl(q: String): String {
        val enc = Uri.encode(q)
        return "https://www.google.com/search?q=$enc"
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
        outState.putString("current_url", currentUrl)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val data = intent.data
        if (intent.action == Intent.ACTION_VIEW && data != null) {
            val u = data.toString()
            if (isUrlLike(u)) webView.loadUrl(u) else webView.loadUrl(buildSearchUrl(u))
        } else if (intent.action == Intent.ACTION_SEND) {
            val t = intent.getStringExtra(Intent.EXTRA_TEXT)
            if (!t.isNullOrBlank()) {
                if (isUrlLike(t)) webView.loadUrl(t) else webView.loadUrl(buildSearchUrl(t))
            }
        }
    }

    override fun onPause() { super.onPause(); webView.onPause() }
    override fun onResume() { super.onResume(); webView.onResume() }
    override fun onDestroy() {
        try { (getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).unregisterNetworkCallback(networkCallback) } catch (_: Exception) {}
        try { webView.destroy() } catch (_: Exception) {}
        super.onDestroy()
    }

    companion object {
        private const val PREFS = "gateway"
        private const val KEY_URL = "url"
    }
}
