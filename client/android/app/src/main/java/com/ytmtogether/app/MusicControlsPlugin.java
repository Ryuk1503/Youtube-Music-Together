package com.ytmtogether.app;

import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MusicControls")
public class MusicControlsPlugin extends Plugin {
    private final MusicService.ControlListener listener = (action, position) -> {
        JSObject event = new JSObject();
        event.put("action", action);
        event.put("position", position / 1000.0);
        notifyListeners("control", event);
    };

    @Override
    public void load() {
        MusicService.controlListener = listener;
    }

    @PluginMethod
    public void update(PluginCall call) {
        Intent intent = new Intent(getContext(), MusicService.class);
        intent.setAction(MusicService.ACTION_UPDATE);
        intent.putExtra("title", call.getString("title", "YouTube Music Together"));
        intent.putExtra("artist", call.getString("artist", ""));
        intent.putExtra("playing", call.getBoolean("playing", false));
        intent.putExtra("buffering", call.getBoolean("buffering", false));
        intent.putExtra("canNavigate", call.getBoolean("canNavigate", false));
        intent.putExtra("position", Math.max(0L, (long) (call.getDouble("position", 0.0) * 1000)));
        intent.putExtra("duration", Math.max(0L, (long) (call.getDouble("duration", 0.0) * 1000)));
        try {
            ContextCompat.startForegroundService(getContext(), intent);
            setBackgroundPlayback(true);
            call.resolve();
        } catch (Exception error) {
            call.reject("Không thể hiển thị điều khiển nhạc", error);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        setBackgroundPlayback(false);
        getContext().stopService(new Intent(getContext(), MusicService.class));
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (MusicService.controlListener == listener) {
            setBackgroundPlayback(false);
            MusicService.controlListener = null;
            getContext().stopService(new Intent(getContext(), MusicService.class));
        }
    }

    private void setBackgroundPlayback(boolean enabled) {
        if (getActivity() instanceof MainActivity) {
            MainActivity activity = (MainActivity) getActivity();
            activity.runOnUiThread(() -> activity.setBackgroundPlayback(enabled));
        }
    }
}
