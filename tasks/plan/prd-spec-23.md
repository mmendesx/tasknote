# PRD: Electron desktop app (Linux AppImage)

**Spec**: tasks/specs/spec-23-electron-desktop-app.md

## Summary

Package tasknote as a Linux AppImage: Electron main process hosts the existing NestJS API (better-sqlite3) on an ephemeral localhost port, serves the built web app from the same server, and adds native notifications capability plus auto-update from GitHub releases. Dev workflow stays unchanged.

## Behavior scenarios

### Feature: Static serving from API

#### Scenario: API serves web build when static dir configured
  Given the Nest app is started with TASKNOTE_STATIC_DIR pointing at a directory containing index.html
  When a GET request is made to /
  Then the response is 200 with the index.html content

#### Scenario: SPA fallback for client routes
  Given the Nest app is started with TASKNOTE_STATIC_DIR configured
  When a GET request is made to /boards/some-client-route
  Then the response is 200 with the index.html content

#### Scenario: API routes unaffected by static serving
  Given the Nest app is started with TASKNOTE_STATIC_DIR configured
  When a GET request is made to /api/boards
  Then the response is the JSON boards payload, not index.html

#### Scenario: No static serving without configuration
  Given the Nest app is started without TASKNOTE_STATIC_DIR
  When a GET request is made to /
  Then the response is a 404 (existing behavior unchanged)

### Feature: Web relative API base

#### Scenario: Production web build calls relative /api
  Given the production web build
  When the app makes any API request
  Then the request URL starts with /api (same origin), not http://localhost:3001

#### Scenario: Dev workflow unchanged
  Given pnpm dev is running
  When the web app at localhost:5173 makes API requests
  Then requests reach the API on port 3001 as before and all features work

### Feature: Desktop launch

#### Scenario: App opens from icon
  Given the packaged AppImage
  When the user double-clicks it
  Then a window opens showing the tasknote board UI with the app icon, no terminal involved

#### Scenario: Desktop uses the shared database
  Given ~/.tasknote/tasknote.sqlite contains a board named "Work"
  When the desktop app launches
  Then the "Work" board is visible in the UI

#### Scenario: API boot failure shows dialog and quits
  Given the embedded API fails to boot (e.g. corrupted DB file)
  When the desktop app launches
  Then a native error dialog appears containing the log file path, and the app quits after dismissal

#### Scenario: External links open in browser
  Given the desktop window is open
  When a link to an external origin is activated
  Then it opens in the system default browser and the app window does not navigate away

### Feature: Notifications capability

#### Scenario: Preload exposes notify
  Given the desktop app is running
  When renderer code calls window.desktop.notify('Hello', 'World')
  Then a native desktop notification with title "Hello" and body "World" is shown

#### Scenario: Browser environment lacks window.desktop
  Given the web app is running in a regular browser (pnpm dev)
  When window.desktop is accessed
  Then it is undefined and no web feature crashes because of it

### Feature: Auto-update

#### Scenario: Update check on packaged launch
  Given the app is packaged and a newer version exists on GitHub releases
  When the app launches
  Then the update downloads in the background and a notification informs it will install on quit

#### Scenario: Update failure is silent
  Given the app is packaged and the update check fails (offline)
  When the app launches
  Then the app works normally with no error dialog

#### Scenario: No update check in dev
  Given the desktop app is run unpackaged (electron .)
  When the app launches
  Then no update check is performed

### Feature: Packaging and CI

#### Scenario: Packaged smoke test
  Given the built desktop bundle
  When the smoke test boots the embedded Nest server and requests /
  Then it receives the web index.html and /api/boards returns JSON

#### Scenario: Release build on tag
  Given a tag matching v* is pushed
  When CI runs
  Then a GitHub release contains the Linux AppImage and latest-linux.yml

## Tasks

### ICT-1: Static file serving in API
- **What**: When `TASKNOTE_STATIC_DIR` is set, serve its files and SPA-fallback non-`/api` GETs to `index.html`. No behavior change when unset. Unit/integration tests.
- **Where**: `apps/api/src/main.ts` (or app.module), new test file
- **Validated by**: API serves web build when static dir configured; SPA fallback for client routes; API routes unaffected; No static serving without configuration
- **Estimate**: S

### ICT-2: Relative API base in web production build
- **What**: Verify/change web API client to use relative `/api` in production build; keep dev proxy or absolute URL for `pnpm dev`.
- **Where**: `apps/web` (API client/config, vite config)
- **Validated by**: Production web build calls relative /api; Dev workflow unchanged
- **Estimate**: S

### ICT-3: apps/desktop package with Electron main
- **What**: New workspace package `@tasknote/desktop`: main process boots Nest (from `@tasknote/api` build) on `127.0.0.1:0` with `TASKNOTE_STATIC_DIR` pointing at bundled web dist, creates BrowserWindow on the bound port. Logs to userData; boot failure → dialog with log path, quit. `contextIsolation: true`, `nodeIntegration: false`, block external navigation, `shell.openExternal` for external links.
- **Where**: `apps/desktop/` (package.json, src/main.ts, tsconfig), root pnpm-workspace
- **Validated by**: App opens from icon; Desktop uses the shared database; API boot failure shows dialog and quits; External links open in browser
- **Estimate**: M

### ICT-4: Preload notification bridge
- **What**: Preload script with `contextBridge.exposeInMainWorld('desktop', { notify(title, body) })` → IPC → main shows `Notification`. Validate inputs are strings.
- **Where**: `apps/desktop/src/preload.ts`, main IPC handler
- **Validated by**: Preload exposes notify; Browser environment lacks window.desktop
- **Estimate**: S

### ICT-5: Auto-update wiring
- **What**: electron-updater: on packaged launch, `checkForUpdatesAndNotify`; install on quit; swallow errors silently; skip when `!app.isPackaged`.
- **Where**: `apps/desktop/src/main.ts` (or updater module)
- **Validated by**: Update check on packaged launch; Update failure is silent; No update check in dev
- **Estimate**: S

### ICT-6: electron-builder config + smoke test
- **What**: electron-builder config (AppImage target, appId, icon, github publish, better-sqlite3 native rebuild, bundle api dist + web dist). Smoke test script: boot embedded server from build output, assert `/` returns index.html and `/api/boards` returns JSON.
- **Where**: `apps/desktop/electron-builder.yml`, `apps/desktop/scripts/smoke.ts`, build scripts
- **Validated by**: Packaged smoke test
- **Estimate**: M

### ICT-7: CI release workflow
- **What**: GitHub Actions workflow: on `v*` tag push, install, build web/api/desktop, run smoke test, `electron-builder --publish always` producing AppImage + latest-linux.yml on the release.
- **Where**: `.github/workflows/release-desktop.yml`
- **Validated by**: Release build on tag
- **Estimate**: S

## Open questions

None blocking. Assumption: web API base is currently absolute `http://localhost:3001` (CORS config suggests so) — ICT-2 confirms and adjusts.

## Dependencies

- electron, electron-builder, electron-updater (new devDeps, apps/desktop)
- GitHub repo release permissions for CI publish
