# macOS Hidden Title Bar + WorkArea Initial Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On macOS, hide the Electron title bar (hiddenInset) and open the window sized to the full screen work area so the whole board is visible.

**Architecture:** Main process sets `titleBarStyle: 'hiddenInset'` and sizes the window from `screen.getPrimaryDisplay().workAreaSize`. Preload tags `<html>` with a `desktop-mac` class on macOS. The Vue layout adds CSS for that class: draggable top bar, non-draggable interactive controls, and left padding in the sidebar logo row so traffic lights don't overlap.

**Tech Stack:** Electron 31 (TypeScript main/preload), Vue 3 SFC (DefaultLayout.vue).

## Global Constraints

- macOS-only behavior must be guarded (`process.platform === 'darwin'` / `.desktop-mac` CSS class); no visual change on Windows/Linux or plain web.
- No new dependencies.
- Conventional Commits format.

---

### Task 1: Main process — hiddenInset title bar + workArea sizing

**Files:**
- Modify: `apps/desktop/src/main.ts:3` (import) and `:86-96` (`createWindow`)

**Interfaces:**
- Consumes: nothing new.
- Produces: window with `titleBarStyle: 'hiddenInset'` on darwin; Task 3 CSS relies on this (content extends under the removed title bar).

- [ ] **Step 1: Add `screen` to the electron import**

```ts
import { app, BrowserWindow, dialog, ipcMain, Notification, screen, shell } from 'electron';
```

- [ ] **Step 2: Replace fixed size with workArea size and add titleBarStyle**

Replace the `new BrowserWindow({...})` options in `createWindow`:

```ts
function createWindow(apiUrl: string): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
```

(Note: `screen` must only be used after `app.whenReady()`; `createWindow` is already called post-ready, so no change needed there.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @tasknote/desktop typecheck`
Expected: exit 0, no errors.

- [ ] **Step 4: Smoke test**

Run: `pnpm --filter @tasknote/desktop build && pnpm --filter @tasknote/desktop smoke`
Expected: smoke passes as before (window opens, app loads).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main.ts
git commit -m "feat: hidden inset title bar and workArea-sized window on macOS"
```

### Task 2: Preload — tag document with desktop-mac class

**Files:**
- Modify: `apps/desktop/src/preload.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `<html class="desktop-mac">` when running in Electron on macOS. Task 3 CSS selectors depend on this exact class name.

- [ ] **Step 1: Add class injection to preload**

Append to `apps/desktop/src/preload.ts`:

```ts
if (process.platform === 'darwin') {
  window.addEventListener('DOMContentLoaded', () => {
    document.documentElement.classList.add('desktop-mac');
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @tasknote/desktop typecheck`
Expected: exit 0.

- [ ] **Step 3: Verify class present**

Run: `pnpm --filter @tasknote/desktop build && pnpm --filter @tasknote/desktop dev` (manually, or via smoke if it evaluates DOM). In DevTools console: `document.documentElement.className` includes `desktop-mac`.
Expected: class present on macOS.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/preload.ts
git commit -m "feat: expose desktop-mac class for platform-specific styling"
```

### Task 3: Layout CSS — drag region + traffic-light clearance

**Files:**
- Modify: `apps/web/src/layouts/DefaultLayout.vue` (style block, after `.topbar` rules ~line 858)

**Interfaces:**
- Consumes: `.desktop-mac` class from Task 2; hiddenInset window from Task 1.
- Produces: draggable window chrome; no UI overlap with traffic lights.

- [ ] **Step 1: Add CSS to DefaultLayout.vue style block**

```css
/* Electron macOS: hiddenInset title bar — topbar doubles as window drag region */
html.desktop-mac .topbar {
  -webkit-app-region: drag;
}
html.desktop-mac .topbar button,
html.desktop-mac .topbar__route-actions,
html.desktop-mac .topbar__actions {
  -webkit-app-region: no-drag;
}
/* clear the traffic lights (~70px inset) over the sidebar logo row */
html.desktop-mac .sidebar__logo {
  padding-left: 80px;
  -webkit-app-region: drag;
}
```

The `<style>` block at line 685 is `scoped`; Vue scoped CSS appends the data attribute only to the last selector (`.topbar` etc.), so the `html.desktop-mac` ancestor works as-is — no `:global()` needed.

- [ ] **Step 2: Lint/typecheck web**

Run: `pnpm --filter @tasknote/web build` (or the repo's web typecheck script if present)
Expected: builds clean.

- [ ] **Step 3: Visual verify in Electron**

Run: `pnpm --filter @tasknote/desktop dev`
Expected on macOS: no title bar; traffic lights sit left of the sidebar logo without overlap; dragging the topbar moves the window; topbar buttons still clickable; window opens filling the screen work area.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/layouts/DefaultLayout.vue
git commit -m "feat: drag region and traffic-light clearance for macOS hidden title bar"
```

## Self-Review

- Spec coverage: hidden bar (T1), init size (T1), drag/clearance (T3), platform gating (all) — covered.
- No placeholders; class name `desktop-mac` consistent across T2/T3.
- Visual steps are manual by necessity (Electron chrome not unit-testable); typecheck + smoke cover regressions.
