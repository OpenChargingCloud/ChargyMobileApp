package cloud.charging.open.plugins.clipboard;

import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.MimeTypeMap;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

public final class ChargyClipboard extends CordovaPlugin {

    // Clipboard files cross the Cordova bridge as base64 and therefore occupy
    // substantially more memory than their source data. Transparency records
    // are normally small; reject unexpectedly large clipboard items instead of
    // risking an out-of-memory crash in either the native or WebView process.
    private static final long MAX_FILE_SIZE_BYTES = 32L * 1024L * 1024L;

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext callbackContext) {
        if (!"readText".equals(action)) {
            return false;
        }

        // Android only permits clipboard access while the app has focus. Capture
        // ClipData on the UI thread, then perform potentially slow URI I/O on the
        // Cordova worker pool.
        cordova.getActivity().runOnUiThread(() -> captureClipboard(callbackContext));
        return true;
    }

    private void captureClipboard(CallbackContext callbackContext) {
        Context context = cordova.getContext();
        ClipboardManager clipboard =
            (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);

        if (clipboard == null || !clipboard.hasPrimaryClip()) {
            callbackContext.error("The clipboard does not contain supported text or file data.");
            return;
        }

        ClipData clip = clipboard.getPrimaryClip();
        if (clip == null || clip.getItemCount() == 0) {
            callbackContext.error("The clipboard does not contain supported text or file data.");
            return;
        }

        cordova.getThreadPool().execute(() -> readClipboardContent(context, clip, callbackContext));
    }

    private void readClipboardContent(Context context,
                                      ClipData clip,
                                      CallbackContext callbackContext) {
        Exception lastFileError = null;

        // A copied Android file is represented by a content:// URI. Check URIs
        // before text so Item.coerceToText() cannot turn a PDF or image URI into
        // a misleading string which ChargyCore would then try to parse as data.
        for (int index = 0; index < clip.getItemCount(); index++) {
            ClipData.Item item = clip.getItemAt(index);
            Uri uri = item.getUri();
            if (uri == null && item.getIntent() != null) {
                uri = item.getIntent().getData();
            }

            if (uri == null) {
                continue;
            }

            try {
                callbackContext.success(readFile(context, uri, clip.getDescription()));
                return;
            }
            catch (Exception exception) {
                lastFileError = exception;
            }
        }

        for (int index = 0; index < clip.getItemCount(); index++) {
            CharSequence text = clip.getItemAt(index).getText();
            if (text != null && !text.toString().trim().isEmpty()) {
                try {
                    callbackContext.success(textResult(text.toString()));
                }
                catch (JSONException exception) {
                    callbackContext.error("Could not encode the clipboard text.");
                }
                return;
            }
        }

        if (lastFileError != null) {
            String detail = lastFileError.getMessage();
            callbackContext.error(detail == null || detail.trim().isEmpty()
                ? "The clipboard file could not be read."
                : "The clipboard file could not be read: " + detail);
            return;
        }

        callbackContext.error("The clipboard does not contain supported text or file data.");
    }

    private JSONObject readFile(Context context,
                                Uri uri,
                                ClipDescription description) throws IOException, JSONException {
        ContentResolver resolver = context.getContentResolver();
        long declaredSize = declaredSize(resolver, uri);
        if (declaredSize > MAX_FILE_SIZE_BYTES) {
            throw new IOException("The file is larger than the 32 MiB clipboard limit.");
        }

        byte[] data;
        try (InputStream input = resolver.openInputStream(uri)) {
            if (input == null) {
                throw new IOException("Android did not provide a readable data stream.");
            }
            data = readLimited(input);
        }
        catch (SecurityException exception) {
            throw new IOException("Android denied access to the copied file.", exception);
        }

        if (data.length == 0) {
            throw new IOException("The copied file is empty.");
        }

        String mimeType = resolveMimeType(resolver, uri, description);
        String fileName = resolveFileName(resolver, uri, mimeType);

        return new JSONObject()
            .put("kind", "file")
            .put("base64", Base64.encodeToString(data, Base64.NO_WRAP))
            .put("fileName", fileName)
            .put("mimeType", mimeType);
    }

    private byte[] readLimited(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        long total = 0;
        int count;

        while ((count = input.read(buffer)) != -1) {
            total += count;
            if (total > MAX_FILE_SIZE_BYTES) {
                throw new IOException("The file is larger than the 32 MiB clipboard limit.");
            }
            output.write(buffer, 0, count);
        }

        return output.toByteArray();
    }

    private long declaredSize(ContentResolver resolver, Uri uri) {
        if (!ContentResolver.SCHEME_CONTENT.equalsIgnoreCase(uri.getScheme())) {
            return -1;
        }

        try (Cursor cursor = resolver.query(
            uri,
            new String[] { OpenableColumns.SIZE },
            null,
            null,
            null
        )) {
            if (cursor == null || !cursor.moveToFirst()) {
                return -1;
            }
            int column = cursor.getColumnIndex(OpenableColumns.SIZE);
            return column >= 0 && !cursor.isNull(column) ? cursor.getLong(column) : -1;
        }
        catch (RuntimeException ignored) {
            return -1;
        }
    }

    private String resolveFileName(ContentResolver resolver, Uri uri, String mimeType) {
        String fileName = null;

        if (ContentResolver.SCHEME_CONTENT.equalsIgnoreCase(uri.getScheme())) {
            try (Cursor cursor = resolver.query(
                uri,
                new String[] { OpenableColumns.DISPLAY_NAME },
                null,
                null,
                null
            )) {
                if (cursor != null && cursor.moveToFirst()) {
                    int column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (column >= 0 && !cursor.isNull(column)) {
                        fileName = cursor.getString(column);
                    }
                }
            }
            catch (RuntimeException ignored) {
                // Fall through to the URI-derived name.
            }
        }

        if (fileName == null || fileName.trim().isEmpty()) {
            fileName = uri.getLastPathSegment();
        }
        fileName = lastPathComponent(fileName);

        String extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
        if (fileName == null || fileName.trim().isEmpty()) {
            return extension == null || extension.isEmpty()
                ? "clipboard.bin"
                : "clipboard." + extension;
        }

        if (fileName.lastIndexOf('.') < 0 && extension != null && !extension.isEmpty()) {
            return fileName + "." + extension;
        }
        return fileName;
    }

    private String resolveMimeType(ContentResolver resolver,
                                   Uri uri,
                                   ClipDescription description) {
        String mimeType = resolver.getType(uri);
        if (mimeType != null && !mimeType.trim().isEmpty()) {
            return mimeType.toLowerCase(Locale.ROOT);
        }

        String lastSegment = uri.getLastPathSegment();
        String extension = lastSegment == null
            ? null
            : MimeTypeMap.getFileExtensionFromUrl(lastSegment);
        if (extension != null && !extension.isEmpty()) {
            mimeType = MimeTypeMap.getSingleton()
                .getMimeTypeFromExtension(extension.toLowerCase(Locale.ROOT));
            if (mimeType != null && !mimeType.isEmpty()) {
                return mimeType;
            }
        }

        if (description != null) {
            for (int index = 0; index < description.getMimeTypeCount(); index++) {
                String describedType = description.getMimeType(index);
                if (describedType != null &&
                    !describedType.equalsIgnoreCase(ClipDescription.MIMETYPE_TEXT_URILIST) &&
                    !describedType.equalsIgnoreCase(ClipDescription.MIMETYPE_TEXT_PLAIN)) {
                    return describedType.toLowerCase(Locale.ROOT);
                }
            }
        }

        return "application/octet-stream";
    }

    private String lastPathComponent(String value) {
        if (value == null) {
            return null;
        }
        int slash = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
        return slash >= 0 ? value.substring(slash + 1) : value;
    }

    private JSONObject textResult(String text) throws JSONException {
        return new JSONObject()
            .put("kind", "text")
            .put("text", text);
    }
}
