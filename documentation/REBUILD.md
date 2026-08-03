# Rebuild and recover the project

This runbook restores the Chargy Mobile App after a normal build has failed
because generated dependencies, web assets, Cordova platforms, or installed
plugins are inconsistent. For installation, prerequisites, and regular build
commands, use the [build guide](BUILD.md).

A rebuild does not create a new Cordova project and does not reconstruct the
application manually. The versioned sources and manifests remain intact while
generated state is discarded and recreated.

## Recovery boundary

These files and directories are authoritative and must be preserved:

- `package.json`
- `config.xml`
- `src/`
- `scripts/`
- `cordova-plugins/`
- `tests/`
- `www/.gitkeep`
- any local signing material that is intentionally stored outside Git

These files and directories contain generated or installed state and can be
recreated:

- `package-lock.json` (generated locally and ignored by this repository)
- `node_modules/`
- `.build/`
- `platforms/`
- `plugins/`
- all generated content below `www/`, except `www/.gitkeep`

Do not use broad cleanup commands such as `git clean -fdx`; they can also
remove ignored signing keys, editor files, fixtures, or other local work.

## Before rebuilding

Inspect the working tree and preserve all source changes:

```shell
git status --short
```

Commit, stash, or back up changes that must survive the recovery. In
particular, check for local changes below `cordova-plugins/` and for signing
material.

If the failure is specific to a native target, first check its external
toolchain:

```shell
npx cordova requirements android
# or, on macOS:
npx cordova requirements ios
```

Missing SDKs, an incompatible JDK or Xcode installation, signing failures, and
device configuration problems are not repaired by regenerating the project.

## Clean rebuild

Remove only the generated and installed state listed above. Retain the empty
tracked file `www/.gitkeep` so that the `www/` directory continues to exist.

Then reinstall dependencies and run the complete platform-independent
verification:

```shell
npm install
npm run verify
```

Recreate the browser assets and browser platform:

```shell
npm run build
```

Recreate the required native platform:

```shell
npx cordova prepare android
# or, on macOS:
npx cordova prepare ios
```

Finally, build the affected native target:

```shell
npx cordova build android --debug
# or, on macOS:
npx cordova build ios
```

## Validate the recovered state

A successful recovery should satisfy all applicable checks:

```shell
npm run verify
npm run build
npx cordova platform ls
npx cordova plugin ls
```

For a native target, also rerun `npx cordova requirements <target>` and its
platform build. Confirm that the platform and plugin versions reported by
Cordova match the version ranges declared in `package.json`.

## If recovery still fails

1. Confirm that `node --version` and `npm --version` satisfy the `engines`
   declaration in `package.json`.
2. Run the applicable `npx cordova requirements <target>` command.
3. Identify the first failing step in `npm run verify` by running its individual
   scripts from the [build guide](BUILD.md).
4. Check that `www/.gitkeep` exists and that the local
   `cordova-plugins/chargy-clipboard/` source is present.
5. Compare `package.json`, `config.xml`, and the prepare hook with the current
   branch before changing generated files.

Do not patch files under `platforms/`, `plugins/`, `.build/`, or generated
content under `www/`. In particular, old workarounds that modified Android
`build.gradle` or Cordova's `check_reqs.js` are obsolete and will be overwritten
by the next prepare. A required persistent change belongs in `package.json`,
`config.xml`, `scripts/`, `src/`, or the source of the affected local plugin.
