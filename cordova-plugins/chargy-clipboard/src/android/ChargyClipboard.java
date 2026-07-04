package cloud.charging.open.plugins.clipboard;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.json.JSONArray;

public final class ChargyClipboard extends CordovaPlugin {

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext callbackContext) {
        if (!"readText".equals(action)) {
            return false;
        }

        cordova.getActivity().runOnUiThread(() -> readText(callbackContext));
        return true;
    }

    private void readText(CallbackContext callbackContext) {
        Context context = cordova.getContext();
        ClipboardManager clipboard =
            (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);

        if (clipboard == null || !clipboard.hasPrimaryClip()) {
            callbackContext.error("The clipboard does not contain text.");
            return;
        }

        ClipData clip = clipboard.getPrimaryClip();
        if (clip == null || clip.getItemCount() == 0) {
            callbackContext.error("The clipboard does not contain text.");
            return;
        }

        CharSequence text = clip.getItemAt(0).coerceToText(context);
        if (text == null || text.toString().trim().isEmpty()) {
            callbackContext.error("The clipboard does not contain text.");
            return;
        }

        callbackContext.success(text.toString());
    }
}
