# Build the project

This is the regular build guide for the Chargy Mobile App. Use it for a first
checkout and for day-to-day development. If a normal build fails because
generated dependencies or Cordova projects are inconsistent, follow the
[rebuild and recovery guide](REBUILD.md).

## Project configuration

The build is defined by:

- `package.json` for JavaScript dependency ranges, scripts, Cordova platforms,
  and Cordova plugins
- `package-lock.json` for the dependency versions reproduced by local and CI
  builds
- `config.xml` for Cordova application and platform settings
- `src/` for the application sources
- `cordova-plugins/chargy-clipboard/` for the local clipboard plugin
- `scripts/before_prepare.js` for generating the web assets before Cordova
  prepares a platform

Cordova, TypeScript, Sass, Webpack, Vitest, platform packages, and plugins are
installed locally through npm. Global installations of these tools are not
required.

## Toolchain

The dependency version ranges in `package.json` are the source of truth. The
current project uses these major version lines:

| Component | Version |
| --- | --- |
| Node.js | `>=22.13 <27` |
| npm | `>=10` |
| Cordova CLI | `13.x` |
| Cordova Android | `15.x` |
| Cordova iOS | `8.1.x` |
| Cordova Browser | `7.x` |
| TypeScript | `6.x` |
| Sass | `1.x` |
| Webpack | `5.x` |
| Vitest | `4.x` |

Check the active Node.js and npm versions before installing dependencies:

```shell
node --version
npm --version
```

## Install and verify

Clone the repository and install the locked dependency tree:

```shell
git clone https://github.com/OpenChargingCloud/ChargyMobileApp.git
cd ChargyMobileApp
npm ci
```

Run the complete platform-independent verification:

```shell
npm run verify
```

Use `npm install` instead when dependencies are intentionally added or
updated, and commit the resulting `package-lock.json` together with the
`package.json` change.

This checks the application and test TypeScript projects, compiles TypeScript
and Sass, creates the Webpack bundle, and runs the Vitest suite.

The individual development commands are:

```shell
npm run typecheck
npm run test:typecheck
npm run compile:ts
npm run compile:sass
npm run bundle
npm test
npm run test:watch
npm run lint
```

## Continuous integration

`.github/workflows/ci.yml` runs for pushes and pull requests against `master`,
and can also be started manually. It verifies Node.js 22.13 and 26 on Ubuntu
plus Node.js 24 on Windows, uploads JUnit test results, and prepares the Cordova
browser application from a fresh dependency installation.

`.github/workflows/nightly.yml` repeats that matrix every night. Additional
informational jobs test the newest versions permitted by the dependency ranges
without using the lockfile and summarize current npm advisories. The nightly
workflow can also be started manually from the GitHub Actions tab.

## Build and run in a browser

Prepare the browser platform and all web assets:

```shell
npm run build
```

The `before_prepare` hook:

1. copies static files from `src/` to `www/`;
2. compiles TypeScript to `.build/js/`;
3. compiles Sass to `www/css/chargy.css`;
4. copies Leaflet assets from `node_modules/`; and
5. creates the minimized Webpack bundles below `www/js/`.

Cordova then prepares `platforms/browser/`.

Start the application in the default browser:

```shell
npm run browser
```

The browser target is intended for development and testing. Native Cordova
APIs must also be tested on Android and iOS devices.

## Build Android

The current `cordova-android@15` toolchain requires:

- JDK 17
- Android SDK Platform 36
- Android SDK Build Tools 36.0.0
- Android SDK Command-line Tools and Platform Tools

Android Studio can install all Android SDK components. Set `JAVA_HOME` (or
`CORDOVA_JAVA_HOME`) to the JDK 17 installation and `ANDROID_HOME` to the
Android SDK directory. `ANDROID_SDK_ROOT` is deprecated by the current Cordova
Android tooling.

The SDK's `cmdline-tools/latest/bin`, `platform-tools`,
`build-tools/36.0.0`, and `emulator` directories may need to be added to
`PATH`. See the
[Cordova Android platform guide](https://cordova.apache.org/docs/en/latest/guide/platforms/android/)
for operating-system-specific setup.

Verify the environment:

```shell
npx cordova requirements android
```

Prepare and create a debug build:

```shell
npx cordova prepare android
npx cordova build android --debug
```

Run it on an attached device or an emulator:

```shell
npx cordova run android --device
npx cordova run android --emulator
```

Enable developer mode and USB debugging before deploying to a physical device.
Release builds additionally require signing configuration. Keep signing keys
outside the repository, for example below the ignored `resources/signing/`
directory.

## Build iOS

iOS builds are supported only on macOS. The current `cordova-ios@8` toolchain
requires Xcode 15 or newer, CocoaPods 1.16 or newer, and `ios-deploy` 1.12.2 or
newer for deployment to a physical device. See the
[Cordova iOS platform guide](https://cordova.apache.org/docs/en/latest/guide/platforms/ios/)
for setup and signing details.

Verify the environment and prepare the generated Xcode workspace:

```shell
npx cordova requirements ios
npx cordova prepare ios
```

Build or run the debug application:

```shell
npx cordova build ios
npx cordova run ios
```

Device builds and App Store archives require an Apple development team,
certificates, and provisioning configured in Xcode.

## Generated files

The directories `.build/`, `platforms/`, and `plugins/`, and all generated
content below `www/`, are build outputs. Keep source changes in `src/`,
`config.xml`, `package.json`, or the local plugin. Changes made directly to
generated Android, iOS, plugin, or web files can be overwritten by the next
Cordova prepare.

## Dependency maintenance

Check production dependency advisories with:

```shell
npm run audit -- --omit=dev
```

Create a reproducible CycloneDX JSON SBOM for production dependencies with:

```shell
npm run sbom
```

Use `npm run sbom:all` to include development dependencies. The generated SBOM
files are ignored by Git and can be attached to releases or CI artifacts.
