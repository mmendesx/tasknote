# Spec: Electron desktop app (Linux AppImage)

## Overview

Package tasknote as a clickable Linux desktop app so the user never runs `pnpm dev`/`pnpm install` to use it. Electron hosts the existing NestJS API (with better-sqlite3) in its main process, serves the built web app over localhost, and provides native window, notifications, and auto-update from GitHub releases.

## Actors

- Single local user (launches app from desktop icon)
- GitHub Releases (auto-update feed)
- CI (builds and publishes AppImage on tag push)

## Functional requirements

### FR-1: Launch from desktop icon
Double-clicking the AppImage (or its installed `.desktop` entry) opens the tasknote UI in its own window with app icon. No terminal, no dev tooling required.

### FR-2: Embedded API and web app
The Nest API boots inside the Electron main process on `127.0.0.1` on an ephemeral port. The production web build is served as static files by the same Nest server. The BrowserWindow loads `http://127.0.0.1:<port>`. All existing app features work identically to the dev setup.

### FR-3: Shared local database
The app uses the existing default DB path `~/.tasknote/tasknote.sqlite` (already the API default via `resolveDbPath`). Desktop and dev environments read the same data. No migration step needed.

### FR-4: Auto-update
On launch, the app checks GitHub releases via electron-updater. If a newer version exists it downloads in the background and installs on quit. Update failures are silent; retry happens on next launch. User sees a non-blocking notification when an update has been downloaded.

### FR-5: Native notification capability
Preload exposes `window.desktop.notify(title: string, body: string)` which shows a native desktop notification via Electron's `Notification`. No app-side triggers are added in this spec (capability only). `window.desktop` is absent in the browser/dev environment; web code must not assume it exists.

### FR-6: Startup failure handling
If the embedded API fails to boot, the app shows a native error dialog including the path to a log file (main-process logs written to `app.getPath('logs')` or `userData`), then quits.

## Technical requirements

### Architecture
- New workspace package `apps/desktop` (`@tasknote/desktop`).
- Electron main process: bootstraps Nest via `NestFactory` from `@tasknote/api` compiled output on port 0 (ephemeral), then creates BrowserWindow pointing at the bound address.
- Nest change: serve web static files (`apps/web/dist`) when a `TASKNOTE_STATIC_DIR` env/option is provided; SPA fallback to `index.html` for non-`/api` routes. CORS unnecessary same-origin but existing config left intact.
- Preload script with `contextBridge` exposing only `notify`. `nodeIntegration: false`, `contextIsolation: true`.
- electron-builder config: Linux AppImage target, app id, icon, `publish: github`.
- electron-updater wired in main; skipped when app is not packaged (dev run).

### Data model
No changes. DB path resolution unchanged (`TASKNOTE_DB_PATH` override or `~/.tasknote/tasknote.sqlite`).

### API contracts
No endpoint changes. Static-file serving added for non-`/api` paths in packaged mode only.

### UI structure
No web UI changes required. Web build must use relative API base (`/api`) — verify; if it hardcodes `http://localhost:3001`, switch to relative in production build.

### Infrastructure
- CI workflow (GitHub Actions): on tag push `v*`, build web + api + desktop, run `electron-builder --publish always`, producing AppImage + `latest-linux.yml` on the GitHub release.

## Non-functional requirements

- **Security**: `contextIsolation: true`, `nodeIntegration: false`, navigation restricted to the local origin; external links open in default browser.
- **Compatibility**: Linux x64 AppImage; Node/Electron version compatible with better-sqlite3 prebuilds (rebuild for Electron ABI via electron-builder's native rebuild).
- **Performance**: cold start to interactive window under ~5s on typical hardware.

## Dependencies

- `electron`, `electron-builder`, `electron-updater` (new devDeps in `apps/desktop`) — available.
- GitHub repo with release permissions for CI publish — available.

## Constraints

- No changes to existing API behavior or web features.
- Dev workflow (`pnpm dev`) must keep working unchanged.
- No tray icon (explicitly descoped). No notification trigger logic (capability only).

## Open questions

None blocking. Assumption stated for correction: web API base is relative or will be made relative in production build (ICT task verifies).
