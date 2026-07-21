# Windows Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an unsigned Windows NSIS installer (x64) from the existing tag-triggered release pipeline, with auto-update support and a packaged smoke test.

**Architecture:** Extend the existing electron-builder config with a `win` target, add a `windows-latest` entry to the release matrix, and extend `scripts/smoke-packaged.sh` (runs under Git Bash on the Windows runner) with a `MINGW*` case that launches the unpacked build. All existing steps (pnpm setup, version sync, mac-gated notarization checks, publish) already work cross-platform.

**Tech Stack:** electron-builder 24.13.3 (NSIS target), GitHub Actions `windows-latest`, Git Bash.

## Global Constraints

- Windows build is UNSIGNED — no cert secrets, no signing config. electron-builder skips signing when `CSC_LINK` is empty (already the case for the Linux job).
- Target: NSIS installer, x64 only.
- Auto-update: `latest.yml` + `.exe` + `.blockmap` must land in the GitHub release (electron-updater reads `latest.yml` on Windows).
- No new dependencies.
- Conventional Commits format.
- Cannot verify Windows build locally on macOS — final verification is a CI tag release.

---

### Task 1: electron-builder win target

**Files:**
- Modify: `apps/desktop/electron-builder.yml` (add `win:` block after the `mac:` block, before `dmg:`)

**Interfaces:**
- Consumes: nothing.
- Produces: `electron-builder --win` builds `dist-electron/TaskNote Setup <version>.exe`, `dist-electron/latest.yml`, and `dist-electron/win-unpacked/TaskNote.exe`. Tasks 2 and 3 depend on these exact output paths.

- [ ] **Step 1: Add win target to electron-builder.yml**

Insert after the `mac:` section (after the `notarize:` block, before the `# electron-builder notarizes...` comment above `dmg:`):

```yaml
# Unsigned: no Authenticode cert configured, users accept one SmartScreen
# prompt. electron-builder skips signing when no cert env vars are present.
win:
  target:
    - target: nsis
      arch:
        - x64
```

- [ ] **Step 2: Validate yml parses**

Run: `node -e "console.log(require('js-yaml').load(require('fs').readFileSync('apps/desktop/electron-builder.yml','utf8')).win)"`
Expected: `{ target: [ { target: 'nsis', arch: [ 'x64' ] } ] }`
(If `js-yaml` isn't resolvable from root, skip — Step 3 in Task 3's CI run validates it for real.)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/electron-builder.yml
git commit -m "feat: add unsigned Windows NSIS x64 target"
```

### Task 2: Release workflow matrix entry

**Files:**
- Modify: `.github/workflows/release-desktop.yml` (matrix `include:` list)

**Interfaces:**
- Consumes: Task 1's artifact names (`*.exe`, `latest.yml`).
- Produces: `windows-latest` job running the same steps; `matrix.platform == 'win'` drives `electron-builder --win`.

- [ ] **Step 1: Add matrix entry**

Append to `matrix.include`:

```yaml
          - os: windows-latest
            platform: win
            artifacts: "dist-electron/*.exe dist-electron/latest.yml"
```

No other workflow changes: notarization step is gated `if: matrix.platform == 'mac'`; mac signing envs are empty on Windows so signing is skipped; `gh release upload` blockmap glob already picks up `*.exe.blockmap`.

- [ ] **Step 2: Force bash for cross-platform run steps**

The `Publish release assets` and `Packaged smoke test` steps use bash syntax (`$(ls ...)`, `${GITHUB_REF_NAME#v}` in version sync). On `windows-latest` the default shell is pwsh. Add a workflow-level default so every run step uses bash on all three platforms:

```yaml
defaults:
  run:
    shell: bash
```

Place at the top level of the workflow (same indent as `permissions:`).

- [ ] **Step 3: Lint workflow**

Run: `actionlint .github/workflows/release-desktop.yml` if installed, else `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/release-desktop.yml','utf8')); console.log('yml OK')"`
Expected: no errors / `yml OK`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release-desktop.yml
git commit -m "ci: build and publish Windows NSIS installer in release matrix"
```

### Task 3: Windows case in packaged smoke test

**Files:**
- Modify: `apps/desktop/scripts/smoke-packaged.sh` (the `case "$(uname -s)"` block)

**Interfaces:**
- Consumes: Task 1's `dist-electron/win-unpacked/TaskNote.exe`.
- Produces: green `Packaged smoke test` step on the Windows job.

- [ ] **Step 1: Add MINGW/MSYS case**

Insert before the `*)` fallback case:

```bash
  MINGW*|MSYS*)
    EXE="dist-electron/win-unpacked/TaskNote.exe"
    [ -f "$EXE" ] || { echo "No win-unpacked exe found in dist-electron/"; exit 1; }
    LAUNCH=("$EXE")
    CONFIG_DIR="$APPDATA"
    ;;
```

Notes for the engineer:
- Runner has a desktop session; no xvfb equivalent needed.
- `CONFIG_DIR="$APPDATA"` — Electron `userData` lives at `%APPDATA%\TaskNote`, and the existing `find "$CONFIG_DIR" -maxdepth 3 -name main.log` picks up `$APPDATA/TaskNote/main.log`.
- Git Bash supports `kill`/`kill -0` on the spawned PID; the existing trap works unchanged.

- [ ] **Step 2: Shellcheck**

Run: `shellcheck apps/desktop/scripts/smoke-packaged.sh || bash -n apps/desktop/scripts/smoke-packaged.sh`
Expected: no new errors (`bash -n` exit 0 at minimum).

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/scripts/smoke-packaged.sh
git commit -m "test: packaged smoke test support for Windows runner"
```

### Task 4: Release verification (CI)

**Files:** none (tag + observe).

**Interfaces:**
- Consumes: Tasks 1–3 merged to main.
- Produces: published Windows artifacts on a real release.

- [ ] **Step 1: Merge to main and push** (per repo convention — user approves push)

- [ ] **Step 2: Tag a release**

```bash
git tag v0.3.5 && git push origin main v0.3.5
```

(Use the next patch version above the latest existing `v*` tag if v0.3.5 is taken: `git tag --list 'v*' --sort=-v:refname | head -1`.)

- [ ] **Step 3: Watch the Windows job**

Run: `gh run watch --exit-status` (or `gh run list --workflow release-desktop.yml`)
Expected: all three matrix jobs green; Windows job's Packaged smoke test prints `Packaged smoke OK`.

- [ ] **Step 4: Verify release assets**

Run: `gh release view v0.3.5 --json assets -q '.assets[].name'`
Expected: includes `TaskNote.Setup.<version>.exe` (GitHub dots the spaces), `latest.yml`, and an `.exe.blockmap`, alongside existing mac/linux assets.

### Task 5: API host binding via HOST env

**Files:**
- Modify: `apps/api/src/bootstrap.ts:17`

**Interfaces:**
- Consumes: nothing.
- Produces: server binds `0.0.0.0` when `HOST=0.0.0.0` is set. Task 6's Dockerfile sets that env; default behavior (127.0.0.1) unchanged for desktop/dev.

- [ ] **Step 1: Read HOST env in createServer**

Change line 17 of `apps/api/src/bootstrap.ts` from:

```ts
  const host = options.host ?? '127.0.0.1';
```

to:

```ts
  const host = options.host ?? process.env['HOST'] ?? '127.0.0.1';
```

- [ ] **Step 2: Typecheck + existing tests**

Run: `pnpm --filter @tasknote/api exec tsc --noEmit && pnpm --filter @tasknote/api test`
Expected: clean typecheck, all vitest suites pass (no test asserts the host literal).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/bootstrap.ts
git commit -m "feat: allow API host binding override via HOST env for containers"
```

### Task 6: Dockerfile + docker-compose.yml + README section

**Files:**
- Create: `Dockerfile` (repo root)
- Create: `.dockerignore` (repo root)
- Create: `docker-compose.yml` (repo root)
- Modify: `README.md` (add "Run with Docker" section)

**Interfaces:**
- Consumes: Task 5's `HOST` env; existing envs `PORT`, `TASKNOTE_DB_PATH`, `TASKNOTE_STATIC_DIR`; api `dist/main.js` entry; web build at `apps/web/dist`.
- Produces: image serving app on port 3001, sqlite at `/data/tasknote.sqlite`. Task 7's CI job builds/pushes this exact Dockerfile; compose references `ghcr.io/mmendesx/tasknote:latest`.

- [ ] **Step 1: Create `.dockerignore`**

```
node_modules
**/node_modules
**/dist
**/dist-electron
.git
test-results
e2e
```

- [ ] **Step 2: Create `Dockerfile`**

```dockerfile
# --- build stage ---
FROM node:20-slim AS build
# native build tools for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
# pruned, self-contained production api (prod deps only, native addons compiled for this image)
RUN pnpm --filter @tasknote/api deploy --prod /out/api

# --- runtime stage ---
FROM node:20-slim
WORKDIR /app
COPY --from=build /out/api /app
COPY --from=build /repo/apps/web/dist /app/web
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    TASKNOTE_STATIC_DIR=/app/web \
    TASKNOTE_DB_PATH=/data/tasknote.sqlite
VOLUME /data
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
```

Note: if `pnpm deploy` fails under `node-linker=hoisted` (root `.npmrc`), add `--legacy` flag (`pnpm deploy --legacy --prod /out/api`) — pnpm ≥9.5 requires it for non-injected workspaces.

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
# End-user compose: run TaskNote without installing the desktop app.
# Usage: docker compose up -d  →  http://localhost:3001
services:
  tasknote:
    image: ghcr.io/mmendesx/tasknote:latest
    ports:
      - "3001:3001"
    volumes:
      - tasknote-data:/data
    restart: unless-stopped

volumes:
  tasknote-data:
```

- [ ] **Step 4: Local build + smoke**

Run:
```bash
docker build -t tasknote-local .
docker run -d --rm -p 3001:3001 --name tasknote-smoke tasknote-local
sleep 10
curl -fsS http://localhost:3001/api/health && curl -fsS http://localhost:3001/ | grep -q '<div id=' && echo SMOKE OK
docker stop tasknote-smoke
```
Expected: `SMOKE OK`.

- [ ] **Step 5: Add README section**

Append to `README.md`:

```markdown
## Run with Docker

Don't want to install the desktop app? Run TaskNote in a browser:

```bash
docker compose up -d
```

Open http://localhost:3001. Data persists in the `tasknote-data` volume.
```

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore docker-compose.yml README.md
git commit -m "feat: dockerized web deployment via docker compose"
```

### Task 7: CI job to publish GHCR image on release

**Files:**
- Modify: `.github/workflows/release-desktop.yml` (add `docker` job + `packages: write` permission)

**Interfaces:**
- Consumes: Task 6's `Dockerfile`.
- Produces: `ghcr.io/mmendesx/tasknote:<version>` and `:latest` on every `v*` tag.

- [ ] **Step 1: Extend permissions**

Change:

```yaml
permissions:
  contents: write
```

to:

```yaml
permissions:
  contents: write
  packages: write
```

- [ ] **Step 2: Add docker job**

Append under `jobs:` (sibling of `release:`):

```yaml
  docker:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build image
        run: docker build -t "ghcr.io/mmendesx/tasknote:${GITHUB_REF_NAME#v}" -t ghcr.io/mmendesx/tasknote:latest .

      - name: Container smoke test
        run: |
          docker run -d --rm -p 3001:3001 --name smoke "ghcr.io/mmendesx/tasknote:${GITHUB_REF_NAME#v}"
          for i in $(seq 1 30); do
            curl -fsS http://localhost:3001/api/health && break
            sleep 1
          done
          curl -fsS http://localhost:3001/api/health
          curl -fsS http://localhost:3001/ | grep -q '<div id='
          docker stop smoke

      - name: Push image
        run: |
          docker push "ghcr.io/mmendesx/tasknote:${GITHUB_REF_NAME#v}"
          docker push ghcr.io/mmendesx/tasknote:latest
```

- [ ] **Step 3: Validate yml**

Run: `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/release-desktop.yml','utf8')); console.log('yml OK')"`
Expected: `yml OK`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release-desktop.yml
git commit -m "ci: build, smoke test, and publish GHCR image on release tags"
```

### Task 8: Release verification (CI) — supersedes Task 4

**Files:** none (tag + observe). Runs once, after Tasks 1–7 are merged.

- [ ] **Step 1: Merge to main and push** (user approves push)

- [ ] **Step 2: Tag next patch release**

```bash
NEXT=$(git tag --list 'v*' --sort=-v:refname | head -1)   # bump patch above this
git tag v0.3.5 && git push origin main v0.3.5
```

- [ ] **Step 3: Watch all jobs**

Run: `gh run watch --exit-status`
Expected: linux, mac, win matrix jobs + docker job all green; Windows job prints `Packaged smoke OK`; docker job smoke passes before push.

- [ ] **Step 4: Verify deliverables**

```bash
gh release view v0.3.5 --json assets -q '.assets[].name'   # expect *.exe, latest.yml, *.exe.blockmap + mac/linux assets
docker run -d --rm -p 3001:3001 ghcr.io/mmendesx/tasknote:0.3.5 && sleep 10 && curl -fsS http://localhost:3001/api/health
```

## Self-Review

- Spec coverage: win target (T1), CI matrix (T2), bash shell default (T2), packaged smoke (T3), unsigned constraint (T1), auto-update assets (T2), HOST env (T5), Dockerfile/compose/README (T6), GHCR publish + container smoke (T7), CI verification (T8). Covered.
- No placeholders; artifact paths consistent (`win-unpacked/TaskNote.exe`; image `ghcr.io/mmendesx/tasknote` in T6 compose and T7 push).
- Windows job runs `Sync version from tag` fine under bash default (`npm version` is cross-platform).
- Compose intentionally has no traefik labels: end-user distribution on their own machine, not a VPS deploy.
