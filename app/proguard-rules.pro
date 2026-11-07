# Keep WebView interfaces
-keepclassmembers class * implements android.webkit.JavascriptInterface { *; }
-keepclassmembers class * {
    public void *(android.webkit.JavascriptInterface);
}
