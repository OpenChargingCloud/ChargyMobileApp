```
Android Studio (API28, Virtual machines)
JDK1.8 (nothing newer!)
Set JAVA_HOME environment variable
Add to PATH C:\Users\achim\AppData\Local\Android\Sdk\emulator

C:\Users\achim\AppData\Local\Android\Sdk\platform-tools\adb push chargeIT-ChargingSession02.json /sdcard/chargeIT-ChargingSession02.json
chargeIT-ChargingSession02.json: 1 file pushed. 0.1 MB/s (2872 bytes in 0.038s)
```

## Testing clipboard files

The Android clipboard plug-in accepts file items as Android `content://` URIs.
It resolves the file name and MIME type through the associated content provider,
reads the data, and passes it to ChargyCore. Text remains supported as a
separate fallback.

The Android Emulator's host clipboard synchronization is only reliable for
text. In particular, copying a PDF or image in the host operating system does
not create the Android `ClipData` content URI required for a file paste and may
replace a rich Android clipboard item with an empty text item. This is an
emulator limitation, not a ChargyCore or PDF.js failure.

Use a physical Android device, or copy the file from an Android application
which publishes a readable content URI, to test the **Record paste** flow. To
test file processing in the emulator, place the fixture in `Downloads` and use
**Record load**, for example:

```powershell
adb push .\tests\fixtures\SAFE\SAFE-Testdata-02_withXMLNamespace.pdf /sdcard/Download/
```
