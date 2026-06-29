
# Chargy Mobile App with additional installing notes

Chargy is a transparency software for secure and transparent e-mobility charging processes, as defined by the German "Eichrecht". The software allows you to verify the cryptographic signatures of energy measurements within charge detail records and comes with a couple of useful extentions to simplify the entire process for endusers and operators.

Chargy was inspired by [TRuDI](https://www.ptb.de/cms/ptb/fachabteilungen/abt2/fb-23/ag-234/info-center-234/trudi.html) an Open Source Software project for transparency of smart meters.


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

Chargy is developed for and tested on the following mobile operating systems and test frameworks:
 - Apple iOS
 - Google Android
 - Browser *(for testing only)*

The Chargy Mobile project has two sister projects.

1. The first is called [ChargyDesktopApp](https://github.com/OpenChargingCloud/ChargyDesktopApp) which provides the same features, but is based on [Electron](https://github.com/electron-userland/electron-forge/tree/5.x) and is available for the following operating systems:

 - Microsoft Windows 10+
 - Apple Mac OS X
 - Linux Debian/Ubuntu

2. The second is called [ChargyWebApp](https://github.com/OpenChargingCloud/ChargyWebApp) which provides the same features, but is available as node.js web app:


## Install dependencies

Use a current Node.js runtime. The project is tested with Node.js 20+ and npm 10+.

The Cordova CLI, TypeScript, Sass, Browserify, platform packages, and Cordova plugins are installed locally through npm. A global Cordova/TypeScript/Sass installation is no longer required.


## Clone and build this Apache Cordova project

The Chargy git repository can be cloned via the following command.
```
$ git clone https://github.com/OpenChargingCloud/ChargyMobileApp.git
```

Afterwards all node.js dependencies and additional Open Source Software libraries have to be downloaded.
```
$ npm install
$ npm run build
```

For a quick local verification without preparing Cordova platforms:
```
$ npm run verify
```

To check production dependency advisories:
```
$ npm run audit -- --omit=dev
```

To generate a CycloneDX Software Bill of Materials (SBOM) for the production npm dependency tree:

```
$ npm run sbom
```

For an extended SBOM including development dependencies:

```
$ npm run sbom:all
```

Both commands write reproducible JSON files into the `ChargyMobileApp` directory. These files are ignored by git and can be attached to releases or CI artifacts when needed. The extended SBOM ignores npm tree warnings because optional platform-specific development dependencies can be absent on a local machine.

## Run automated tests

The project uses [Vitest](https://vitest.dev/) for fast TypeScript unit tests. Run the current test suite with:

```
$ npm test
```

During development you can keep Vitest running in watch mode:

```
$ npm run test:watch
```

In *Visual Studio Code* you can install the official `Vitest` extension by the verified publisher `Vitest` to run tests from the Testing sidebar.

The integration tests in `ChargyMobileApp/tests/chargyCore.test.ts` pass fixture files directly to `@open-charging-cloud/chargy-core`. Add new format and validation cases there instead of implementing application-specific parsers or signature checks.


## Test the mobile application

In order to test Chargy within the local browser just type the following command and Cordova will open the application within your default web browser automatically.

```
$ npm run browser
```

When testing mobile-style navigation in the browser, click and drag with the mouse to simulate a swipe gesture.

To test Chargy on your Android smart phone please install [Android Studio](https://developer.android.com/studio), attach your smart phone via USB to your computer and run the following command. If you have installed the Android simulators and did not attach your smart phone Chary will be started within the default simulator profile.

```
$ npx cordova run android
```


## Rebuild the project from scratch

In case the cloned project does not work, you can find the REBUILD.md in the documentation. Follow these steps to build the project.

Afterwards you need to do some additional steps:
- Get __*Android Studio*__ to get the SDK.
- Create the environment variable __*ANDROID_SDK_ROOT*__ and __*ANDROID_SDK*__ (both get the same path C:/Users/HereIsYourActualUser/AppData/Local/Android/Sdk)
- Establish __*JAVA_HOME*__ according to the requirements of the installed `cordova-android` version.


## File Editing

The final steps include some additions and alterations in some Files.

The file __*build.gradle.*__ (in .../ChargyMobileApp/platforms/android/CordovaLib) needs an alteration on:

buildscript{

repositories{

__*maven { url ’https://repo.grails.org/grails/core/’} }}*__

The file __*check_reqs.js*__ (in .../ChargyMobileApp/platforms/android/cordova/lib) needs an addition in line 91
__*{shell:true}*__

To start the Chargy-Application directly on the smartphone use
```
$ cordova run android -device
```

## Final execution notes

1. The chosen Smartphone needs the developermode switched __*on*__
2. USB debugging needs to be switchen __*on*__
3. A direct installation for Chargy on your smartphone is possible with the __*app-debug.apk-file*__ 

Finally we are at the end of our adventure. Thank you for staying with us. We are working on a more confinient way to get things rolling. Recommendations for improvement are welcome!

Special thanks for the original authors to make this fork possible and the strong support from my colleague Manuel.
Take care folks!

Your Greg


## Funding

This Open Source project is partially funded by the [NGI Zero Commons Fund](https://nlnet.nl/commonsfund/) as part of our [EVQI project](https://nlnet.nl/project/EVQI/).

We also appreciate any additional funding and long-term support for the Chargy family, for example via [GitHub Sponsors](https://github.com/sponsors/GraphDefined), as it helps us keep the project sustainable, independent and useful for the entire e-mobility community.

<center>
  <img src="static/images/NGI0_tag.svg" height="30">
</center>
