package com.shortappstudio.assemblywar;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * 세로 게임 화면 (DEVICE_SIZE_QA.md, 개냥전쟁 MainActivity 를 가져옴).
 * - 전체 화면(몰입 모드), 카메라 구멍·시스템바 크기를 CSS 변수(--sat/--sab/--sal/--sar)로 넘긴다.
 * - 휴대폰 글꼴 크기 설정이 게임 글자를 키우지 않게 글자 배율 100% 고정 (STUDIO_LEARNINGS Capacitor Android 필수 2).
 */
public class MainActivity extends BridgeActivity {
  private int safeTop = 0, safeBottom = 0, safeLeft = 0, safeRight = 0;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      WindowManager.LayoutParams lp = getWindow().getAttributes();
      lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
      getWindow().setAttributes(lp);
    }
    hideSystemBars();
    final WebView webView = getBridge().getWebView();
    webView.getSettings().setTextZoom(100);
    final float density = getResources().getDisplayMetrics().density;
    ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
      Insets cut = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
      Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
      safeTop = Math.round(Math.max(cut.top, bars.top) / density);
      safeBottom = Math.round(Math.max(cut.bottom, bars.bottom) / density);
      safeLeft = Math.round(Math.max(cut.left, bars.left) / density);
      safeRight = Math.round(Math.max(cut.right, bars.right) / density);
      pushSafeArea(webView);
      return WindowInsetsCompat.CONSUMED;
    });
    getBridge().addWebViewListener(new WebViewListener() {
      @Override
      public void onPageLoaded(WebView view) { pushSafeArea(view); }
    });
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) hideSystemBars();
  }

  private void hideSystemBars() {
    WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    c.hide(WindowInsetsCompat.Type.systemBars());
  }

  private void pushSafeArea(final WebView webView) {
    final String js = "(function(s){s.setProperty('--sat','" + safeTop + "px');s.setProperty('--sab','" + safeBottom + "px');s.setProperty('--sal','" + safeLeft + "px');s.setProperty('--sar','" + safeRight + "px');})(document.documentElement.style);";
    webView.post(() -> webView.evaluateJavascript(js, null));
  }
}
