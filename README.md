
# Chargy Mobile App

Chargy is a transparency software for secure and transparent e-mobility charging processes, as defined by the German "Eichrecht". The software allows you to verify the cryptographic signatures of energy measurements within charge detail records and comes with a couple of useful extentions to simplify the entire process for endusers and operators.


## Benefits of Chargy

1. Chargy comes with __*meta data*__. True charging transparency is more than just signed smart meter values. Chargy allows you to group multiple signed smart meter values to entire charging sessions and to add additional meta data like EVSE information, geo coordinates, tariffs, ... within your backend in order to improve the user experience for the ev drivers.
2. Chargy is __*secure*__. Chargy implements a public key infrastructure for managing certificates of smart meters, EVSEs, charging stations, charging station operators and e-mobility providers. By this the ev driver will always retrieve the correct public key to verify a charging process automatically and without complicated manual lookups in external databases.
3. Chargy is __*platform agnostic*__. The entire software is available for desktop and smart phone operating systems and .NET. If you want ports to other platforms or programming languages, we will support your efforts.
4. Chargy is __*Open Source*__. In contrast to other vendors in e-mobility, we belief that true transparency is only trustworthy if the entire process and the required software is open and reusable under a fair copyleft license (AGPL).
5. Chargy is __*open for your contributions*__. We currently support adapters for the protocols of different charging station vendors like chargeIT mobility, ABL (OCMF), chargepoint. The certification at the Physikalisch-Technische Bundesanstalt (PTB) is provided by chargeIT mobility. If you want to add your protocol or a protocol adapter feel free to read the contributor license agreement and to send us a pull request.
6. Chargy is __*white label*__. If you are a supporter of the Chargy project you can even use the entire software project under the free Apache 2.0 license. This allows you to create proprietary forks implementing your own corporate design or to include Chargy as a library within your existing application (This limitation was introduced to avoid discussions with too many black sheeps in the e-mobility market. We are sorry...).
7. Chargy is __*accessible*__. For public sector bodies Chargy fully supports the [EU directive 2016/2102](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32016L2102) on the accessibility of websites and mobile applications and provides a context-sensitive feedback-mechanism and methods for dispute resolution.


## Compiling from source

This application is based on [Apache Cordova](https://cordova.apache.org), a cross platform Open Source framework for creating mobile applications with Java-/TypeScript, HTML, and (S)CSS.    

Chargy is developed for and tested on the following mobile operating systems:
 - Apple iOS
 - Google Android

The Chargy Mobile project has a sister project called [Chargy Desktop](https://github.com/OpenChargingCloud/ChargyDesktopApp) which provides the same features, but is based on [Electron](https://github.com/electron-userland/electron-forge/tree/5.x) and is available for the following operating systems:

 - Microsoft Windows 10+
 - Apple Mac OS X
 - Linux Debian/Ubuntu



TRuDI: https://www.ptb.de/cms/ptb/fachabteilungen/abt2/fb-23/ag-234/info-center-234/trudi.html





## Install dependencies

Using node.js 11.10.1 (includes npm 6.7.0) for Microsoft Windows: https://nodejs.org/en/download/current/    

```
$ npm install -g cordova
+ cordova@8.1.2
added 594 packages from 523 contributors in 27.026s
```

```
$ npm install -g typescript@latest
C:\Users\ahzf\AppData\Roaming\npm\tsc -> C:\Users\ahzf\AppData\Roaming\npm\node_modules\typescript\bin\tsc
C:\Users\ahzf\AppData\Roaming\npm\tsserver -> C:\Users\ahzf\AppData\Roaming\npm\node_modules\typescript\bin\tsserver
+ typescript@3.3.3333
added 1 package from 1 contributor in 1.738s
```

```
$ npm install -g sass@latest
C:\Users\ahzf\AppData\Roaming\npm\sass -> C:\Users\ahzf\AppData\Roaming\npm\node_modules\sass\sass.js
+ sass@1.17.2
added 135 packages from 106 contributors in 9.64s
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
Android project created with cordova-android@8.0.0
Running npm install...
Starting webpack bundling and transpilation phase...
--save flag or autosave detected
Saving android@latest into config.xml file ...
```

#### Local browser

```
$ cordova platform add browser@latest
Using cordova-fetch for cordova-browser@latest
Adding browser project...
Creating Cordova project for cordova-browser:
        Path: E:\Coding\OpenChargingCloud\ChargyMobileApp\platforms\browser
        Name: ChargyMobileApp
Installing "cordova-plugin-whitelist" for browser
Android project created with cordova-browser@6.0.0
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

#### cordova-plugin-network-information

This plugin provides an implementation of an old version of the Network Information API. It provides information about the device's cellular and wifi connection, and whether the device has an internet connection.

```
$ cordova plugin add cordova-plugin-network-information
Installing "cordova-plugin-network-information" for android
Android Studio project detected
Installing "cordova-plugin-network-information" for browser
Installing "cordova-plugin-network-information" for ios
Adding cordova-plugin-network-information to package.json
Saved plugin info for "cordova-plugin-network-information" to config.xml
```


### Adding JavaScript modules

Add the line '"moduleResolution": "node",' to /tsconfig.json

#### elliptic

Fast elliptic-curve cryptography in a plain javascript implementation: https://www.npmjs.com/package/elliptic

```
$ npm install elliptic
+ elliptic@6.4.1 

npm install @types/elliptic
```

#### moment.js

For displaying user-friendly time and date information we use https://momentjs.com.
It comes with its own typescript type definitions.

```
$ npm install moment --save
+ moment@2.24.0
```

#### leaflet.js

Leaflet is the leading open-source JavaScript library for mobile-friendly interactive maps: https://leafletjs.com    
**Note**: leaflet comes with additional CSS and image files for markers etc.pp. Those have to be copied into the www.src folder!

```
npm install leaflet
+ leaflet@1.4.0

npm install @types/leaflet
+ @types/leaflet@1.4.3
```

Additional markers for leaflet:

```
npm install leaflet.awesome-markers
+ leaflet.awesome-markers@2.0.5

npm install @types/leaflet.awesome-markers
+ @types/leaflet.awesome-markers@2.0.24
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
