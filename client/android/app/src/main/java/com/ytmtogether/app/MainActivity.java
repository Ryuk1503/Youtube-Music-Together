package com.ytmtogether.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.view.ViewGroup;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapacitorWebView;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQ_NOTIFICATIONS = 1001;
    private PlaybackWebView playbackWebView;

    @Override
    protected void load() {
        // Install before Capacitor creates its bridge so its clients/plugins use this WebView.
        WebView original = findViewById(com.getcapacitor.android.R.id.webview);
        ViewGroup parent = (ViewGroup) original.getParent();
        int index = parent.indexOfChild(original);
        playbackWebView = new PlaybackWebView(this);
        playbackWebView.setId(original.getId());
        ViewGroup.LayoutParams layout = original.getLayoutParams();
        parent.removeView(original);
        parent.addView(playbackWebView, index, layout);
        original.destroy();
        super.load();
    }

    void setBackgroundPlayback(boolean enabled) {
        if (playbackWebView != null) playbackWebView.setBackgroundPlayback(enabled);
    }

    private static class PlaybackWebView extends CapacitorWebView {
        private boolean backgroundPlayback;
        private int actualWindowVisibility = VISIBLE;

        PlaybackWebView(Context context) { super(context, null); }

        void setBackgroundPlayback(boolean enabled) {
            if (backgroundPlayback == enabled) return;
            backgroundPlayback = enabled;
            super.onWindowVisibilityChanged(enabled ? VISIBLE : actualWindowVisibility);
            if (enabled) { onResume(); resumeTimers(); }
        }

        @Override
        protected void onWindowVisibilityChanged(int visibility) {
            actualWindowVisibility = visibility;
            // Resuming timers alone does not prevent Chromium from hiding the player iframe.
            super.onWindowVisibilityChanged(backgroundPlayback ? VISIBLE : visibility);
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdatePlugin.class);
        registerPlugin(MusicControlsPlugin.class);
        super.onCreate(savedInstanceState);

        // 1. Yêu cầu quyền thông báo trên Android 13+ (Bắt buộc để hiện thanh phát nhạc và giữ Foreground Service)
        requestNotificationPermission();

        // 2. Yêu cầu quyền Bỏ qua tối ưu hoá pin (Cực kỳ quan trọng với Xiaomi / MIUI để không đóng băng app khi tắt màn hình)
        requestBatteryOptimizationExemption();

        // 4. Tùy biến WebView để phát nhạc mượt mà không cần tương tác từng bài
        setupWebView();
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                    this,
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    PERMISSION_REQ_NOTIFICATIONS
                );
            }
        }
    }

    private void requestBatteryOptimizationExemption() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                String packageName = getPackageName();
                if (pm != null && !pm.isIgnoringBatteryOptimizations(packageName)) {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + packageName));
                    startActivity(intent);
                }
            }
        } catch (Exception e) {
            // Thiết bị không hỗ trợ intent này hoặc bị hạn chế bởi bảo mật của hãng (MIUI)
            e.printStackTrace();
        }
    }

    private void setupWebView() {
        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebView webView = this.bridge.getWebView();
            WebSettings settings = webView.getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
        }
    }

    private void keepWebViewAlive() {
        if (playbackWebView != null && playbackWebView.backgroundPlayback && this.bridge != null) {
            WebView wv = this.bridge.getWebView();
            wv.onResume();
            wv.resumeTimers();
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        keepWebViewAlive();
    }

    @Override
    public void onStop() {
        super.onStop();
        keepWebViewAlive();
    }

    @Override
    public void onResume() {
        super.onResume();
        keepWebViewAlive();
    }
}
