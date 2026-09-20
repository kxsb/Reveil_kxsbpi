package io.github.kxsb.maisonsonore;

import android.view.KeyEvent;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int keyCode = event.getKeyCode();

        boolean isVolumeKey =
            keyCode == KeyEvent.KEYCODE_VOLUME_UP ||
            keyCode == KeyEvent.KEYCODE_VOLUME_DOWN;

        if (!isVolumeKey) {
            return super.dispatchKeyEvent(event);
        }

        if (
            event.getAction() == KeyEvent.ACTION_DOWN &&
            bridge != null
        ) {
            String direction =
                keyCode == KeyEvent.KEYCODE_VOLUME_UP
                    ? "up"
                    : "down";

            String data =
                "{\"direction\":\"" +
                direction +
                "\"}";

            bridge.triggerWindowJSEvent(
                "maisonVolumeKey",
                data
            );
        }

        return true;
    }
}