
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

The Chargy git repository can be cloned via the following command.
```
$ git clone https://github.com/OpenChargingCloud/ChargyMobileApp.git
```

Afterwards all node.js dependencies and additional Open Source Software libraries have to be downloaded.
```
$ cordova prepare
```


## Test the mobile application

In order to test Chargy within the local browser just type the following command and Cordova will open the application within your default web browser automatically.

```
$ cordova run browser
```

To test Chargy on your Android smart phone please install [Android Studio](https://developer.android.com/studio), attach your smart phone via USB to your computer and run the following command. If you have installed the Android simulators and did not attach your smart phone Chary will be started within the default simulator profile.

```
$ cordova run android
```

