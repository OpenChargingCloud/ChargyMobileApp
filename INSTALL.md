# Chargy Mobile App

## Install dependencies

Using node.js 11.9.0 (includes npm 6.5.0) for Microsoft Windows: https://nodejs.org/en/download/current/    

```
$ npm install -g cordova
```

```
$ npm install -g typescript@latest
C:\Users\ahzf\AppData\Roaming\npm\tsc -> C:\Users\ahzf\AppData\Roaming\npm\node_modules\typescript\bin\tsc
C:\Users\ahzf\AppData\Roaming\npm\tsserver -> C:\Users\ahzf\AppData\Roaming\npm\node_modules\typescript\bin\tsserver
+ typescript@3.3.3
```

```
$ npm install -g sass@latest
C:\Users\achim\AppData\Roaming\npm\sass -> C:\Users\achim\AppData\Roaming\npm\node_modules\sass\sass.js
+ sass@1.17.0
```


## Clone and build this Apache Cordova project
```
$ git clone https://github.com/OpenChargingCloud/ChargyMobileApp.git
$ cordova prepare
```


## Create a new Apache Cordova project

Create a new Apache Cordova project with TypeScript and SCSS support: https://www.npmjs.com/package/cordova-template-webpack-ts-scss

```
$ cordova create ChargyMobileApp cloud.charging.open.apps.mobile ChargyMobileApp --template cordova-template-webpack-ts-scss
Creating a new cordova project.
```

Note: Dashes '-' within the AppId/project name seem to be disallowed on Android, but not on iOS!    
More documentation can be found at: https://cordova.apache.org/docs/de/latest/guide/cli/


### Adding platforms

#### iOS

```
$ cordova platform add ios@latest
Using cordova-fetch for cordova-ios@latest
Adding ios project...
Creating Cordova project for the iOS platform:
        Path: platforms\ios
        Package: cloud.charging.open.apps.mobile
        Name: ChargyMobileApp
iOS project created with cordova-ios@5.0.0
Running npm install...
Starting webpack bundling and transpilation phase...
Discovered plugin "cordova-plugin-whitelist" in config.xml. Adding it to the project
Installing "cordova-plugin-whitelist" for ios
Adding cordova-plugin-whitelist to package.json
Saved plugin info for "cordova-plugin-whitelist" to config.xml
--save flag or autosave detected
Saving ios@latest into config.xml file ...
```

#### Android

```
$ cordova platform add android@latest
Using cordova-fetch for cordova-android@latest
Adding android project...
Creating Cordova project for the Android platform:
        Path: platforms\android
        Package: cloud.charging.open.apps.mobile
        Name: ChargyMobileApp
        Activity: MainActivity
        Android target: android-27
Android project created with cordova-android@7.1.4
Running npm install...
Starting webpack bundling and transpilation phase...
--save flag or autosave detected
Saving android@latest into config.xml file ...
```

#### Local browser

The browser support within the template seems to be old shit (~4.1.0). Just remove it!

```
$ cordova platform remove browser
Removing platform browser from config.xml file...
Removing browser from cordova.platforms array in package.json
```

And readd the latest version

```
$ cordova platform add browser@latest
Using cordova-fetch for cordova-browser@latest
Adding browser project...
Creating Cordova project for cordova-browser:
        Path: E:\Coding\OpenChargingCloud\ChargyMobileApp\platforms\browser
        Name: ChargyMobileApp
Installing "cordova-plugin-whitelist" for browser
Running npm install...
Starting webpack bundling and transpilation phase...
--save flag or autosave detected
Saving browser@latest into config.xml file ...
```

### Adding Cordova plugins

#### cordova-plugin-device

This plugin defines a global device object, which describes the device's hardware and software: https://cordova.apache.org/docs/en/latest/reference/cordova-plugin-device/

```
$ cordova plugin add cordova-plugin-device
Installing "cordova-plugin-device" for android
Installing "cordova-plugin-device" for browser
Installing "cordova-plugin-device" for ios
Adding cordova-plugin-device to package.json
Saved plugin info for "cordova-plugin-device" to config.xml
```

#### cordova-plugin-geolocation

This plugin provides information about the device's location, such as latitude and longitude: https://cordova.apache.org/docs/en/latest/reference/cordova-plugin-geolocation/

```
$ cordova plugin add cordova-plugin-geolocation
Installing "cordova-plugin-geolocation" for android
Android Studio project detected
Installing "cordova-plugin-geolocation" for browser
Installing "cordova-plugin-geolocation" for ios
Adding cordova-plugin-geolocation to package.json
Saved plugin info for "cordova-plugin-geolocation" to config.xml
```

#### cordova-plugin-dialogs

This plugin provides access to some native dialog UI elements via a global navigator.notification object: https://cordova.apache.org/docs/en/latest/reference/cordova-plugin-dialogs/index.html

This might be useful for sending defibrillator and communicator events/alerts to the user.

```
$ cordova plugin add cordova-plugin-dialogs
Installing "cordova-plugin-dialogs" for android
Android Studio project detected
Installing "cordova-plugin-dialogs" for browser
Installing "cordova-plugin-dialogs" for ios
Adding cordova-plugin-dialogs to package.json
Saved plugin info for "cordova-plugin-dialogs" to config.xml
```

#### cordova-plugin-app-version

This plugin provides access to the native app version and build number within JavaScript: https://www.npmjs.com/package/cordova-plugin-appversion

```
$ cordova plugin add cordova-plugin-app-version
Installing "cordova-plugin-app-version" for android
Android Studio project detected
Installing "cordova-plugin-app-version" for browser
Installing "cordova-plugin-app-version" for ios
Adding cordova-plugin-app-version to package.json
Saved plugin info for "cordova-plugin-app-version" to config.xml
```

#### cordova-plugin-file

This plugin implements a File API allowing read/write access to files residing on the device: https://cordova.apache.org/docs/en/latest/reference/cordova-plugin-file/

```
$ cordova plugin add cordova-plugin-file
Installing "cordova-plugin-file" for android
Android Studio project detected
Installing "cordova-plugin-file" for browser
Installing "cordova-plugin-file" for ios
Adding cordova-plugin-file to package.json
Saved plugin info for "cordova-plugin-file" to config.xml
```

#### cordova-plugin-camera

This plugin provides an API for taking pictures and for choosing images from the system's image library: https://cordova.apache.org/docs/en/latest/reference/cordova-plugin-camera/index.html

```
$ cordova plugin add cordova-plugin-camera
Installing "cordova-plugin-camera" for android
Android Studio project detected
Subproject Path: CordovaLib
Subproject Path: app
Installing "cordova-plugin-camera" for browser
Installing "cordova-plugin-camera" for ios
Adding cordova-plugin-camera to package.json
Saved plugin info for "cordova-plugin-camera" to config.xml
```


### Adding JavaScript modules

#### elliptic

Fast elliptic-curve cryptography in a plain javascript implementation: https://www.npmjs.com/package/elliptic

```
$ npm install elliptic
+ elliptic@6.4.1 
```


### Setting up the .gitignore file

Before you push the source code of your new project to a git server, make sure that the .gitignore file is set up correctly, otherwise you will push >100 MBytes instead of some 100 KBytes.

```
# Windows
Thumbs.db
Desktop.ini

# Mac
.DS_Store

# Node
npm-debug.log
/node_modules

# Cordova
/platforms
/plugins

# res
resources/signing

# The "www" directory needs to be present, otherwise "cordova prepare" after a "git clone ..." will fail!
www/*
!www/.gitkeep
```

When the "cordova prepare" fails with "Current working directory is not a Cordova-based project." this might be
caused by a missing "www" directory. Make sure that there is a ".gitkeep" file within this directory and that
this file will be pushed to your git server. Create this file via:

```
mkdir www
touch www/.gitkeep
```

## Test the app within the local browser

```
$ cordova run browser
```
