package com.ytmtogether.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;

public class MusicService extends Service {
    public static final String CHANNEL_ID = "ytm_together_channel";
    public static final String ACTION_UPDATE = "ACTION_UPDATE";
    interface ControlListener { void onControl(String action, long position); }
    static volatile ControlListener controlListener;
    private MediaSession mediaSession;
    private String title = "YouTube Music Together";
    private String artist = "";
    private boolean playing;
    private boolean canNavigate;
    private long position = -1;
    private long lastProgressAt;
    private final Handler progressHandler = new Handler(Looper.getMainLooper());
    private final Runnable staleProgress = () -> {
        if (playing && mediaSession != null) {
            publishPlaybackState(true);
            getSystemService(NotificationManager.class).notify(1001, createNotification());
        }
    };
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        mediaSession = new MediaSession(this, "YTM Together");
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { dispatchControl("play", 0); }
            @Override public void onPause() { dispatchControl("pause", 0); }
            @Override public void onSkipToNext() { dispatchControl("nexttrack", 0); }
            @Override public void onSeekTo(long position) { dispatchControl("seekto", position); }
        });
        mediaSession.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || controlListener == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!ACTION_UPDATE.equals(intent.getAction())) {
            dispatchControl(intent.getAction(), 0);
            return START_NOT_STICKY;
        }
        title = intent.getStringExtra("title");
        artist = intent.getStringExtra("artist");
        playing = intent.getBooleanExtra("playing", false);
        canNavigate = intent.getBooleanExtra("canNavigate", false);
        long now = SystemClock.elapsedRealtime();
        long nextPosition = intent.getLongExtra("position", 0);
        if (position != nextPosition || !playing) lastProgressAt = now;
        position = nextPosition;
        boolean buffering = intent.getBooleanExtra("buffering", false) || now - lastProgressAt >= 3000;
        mediaSession.setMetadata(new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
            .putLong(MediaMetadata.METADATA_KEY_DURATION, intent.getLongExtra("duration", 0))
            .build());
        publishPlaybackState(buffering);
        progressHandler.removeCallbacks(staleProgress);
        if (playing) progressHandler.postDelayed(staleProgress, 3500);
        mediaSession.setActive(true);
        acquireLocks();
        Notification notification = createNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1001, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(1001, notification);
        }

        return START_NOT_STICKY;
    }

    private void publishPlaybackState(boolean buffering) {
        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE;
        if (canNavigate) actions |= PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SEEK_TO;
        int state = !playing ? PlaybackState.STATE_PAUSED
            : buffering ? PlaybackState.STATE_BUFFERING : PlaybackState.STATE_PLAYING;
        mediaSession.setPlaybackState(new PlaybackState.Builder().setActions(actions)
            .setState(state, position, state == PlaybackState.STATE_PLAYING ? 1f : 0f).build());
    }

    private void dispatchControl(String action, long position) {
        ControlListener listener = controlListener;
        if (listener == null) return;
        if (("nexttrack".equals(action) || "seekto".equals(action)) && !canNavigate) return;
        listener.onControl(action, position);
    }

    private void acquireLocks() {
        // 1. CPU WakeLock để không bị tắt CPU khi tắt màn hình
        if (wakeLock == null) {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "YTM:BackgroundWakeLock");
                wakeLock.acquire(12 * 60 * 60 * 1000L); // Max 12 hours
            }
        }

        // 2. WifiLock để không bị ngắt mạng / ngắt Socket.IO khi tắt màn hình
        if (wifiLock == null) {
            try {
                WifiManager wifiManager = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wifiManager != null) {
                    wifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "YTM:BackgroundWifiLock");
                    wifiLock.acquire();
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }

    private void releaseLocks() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
            wakeLock = null;
        }
        if (wifiLock != null && wifiLock.isHeld()) {
            wifiLock.release();
            wifiLock = null;
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Phát nhạc trong nền",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Duy trì kết nối âm thanh khi tắt màn hình hoặc chuyển ứng dụng");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification createNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
        );

        mediaSession.setSessionActivity(pendingIntent);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        builder.setContentTitle(title)
            .setContentText(artist)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentIntent(pendingIntent)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                playing ? "Tạm dừng" : "Phát", controlIntent(playing ? "pause" : "play"));
        if (canNavigate) builder.addAction(android.R.drawable.ic_media_next, "Bài tiếp theo", controlIntent("nexttrack"));
        Notification.MediaStyle style = new Notification.MediaStyle().setMediaSession(mediaSession.getSessionToken());
        style.setShowActionsInCompactView(canNavigate ? new int[]{0, 1} : new int[]{0});
        return builder.setStyle(style).build();
    }

    private PendingIntent controlIntent(String action) {
        return PendingIntent.getService(this, 0, new Intent(this, MusicService.class).setAction(action),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onDestroy() {
        progressHandler.removeCallbacks(staleProgress);
        releaseLocks();
        mediaSession.setActive(false);
        mediaSession.release();
        stopForeground(true);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
