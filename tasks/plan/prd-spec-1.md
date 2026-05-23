# PRD: TaskNote MVP

**Spec**: tasks/specs/spec-1-tasknote-mvp.md

## Summary
Local-first single-user task manager with Kanban, notes, and file references. Vue 3 + NestJS monorepo on SQLite. Dark-first minimalist UI with Anime.js motion. Ships as `pnpm dev` from repo root, binds to `127.0.0.1`, stores DB at `~/.tasknote/tasknote.sqlite`.

## Behavior scenarios

### Feature: Onboarding (FR-1)

#### Scenario: First launch shows onboarding overlay
  Given `settings.onboarded_at` is NULL
  When the user opens the web app
  Then the onboarding overlay is visible over a dimmed app and step 1 of 3 is shown

#### Scenario: Completing onboarding with sample seed
  Given the user is on onboarding step 3
  When they enter "Matheus", select "Create sample board", and click Finish
  Then `settings.display_name` = "Matheus", `settings.onboarded_at` is set, one board with 4 columns and 3 sample tasks exists, and the overlay closes

#### Scenario: Returning user skips onboarding
  Given `settings.onboarded_at` is set
  When the user opens the web app
  Then the onboarding overlay is not shown and the default board loads

#### Scenario: Reset DB re-triggers onboarding
  Given the user clicks Reset DB in settings and confirms
  When the page reloads
  Then onboarding step 1 is shown again

### Feature: Boards (FR-2)

#### Scenario: Create a new board
  Given the user has one board
  When they create a board named "Personal"
  Then a board "Personal" appears in the sidebar with default columns Backlog, Doing, Blocked, Done

#### Scenario: Cannot delete the last board
  Given exactly one board exists
  When the user attempts to delete it
  Then deletion is blocked with the error "At least one board must exist"

#### Scenario: Switching boards is instant
  Given the user is viewing board A and board B exists
  When they click board B in the sidebar
  Then the canvas updates to board B in under 150ms without a full page reload

### Feature: Columns (FR-3)

#### Scenario: Reorder columns by drag
  Given a board has columns [Backlog, Doing, Blocked, Done]
  When the user drags Done before Blocked
  Then the board persists column order [Backlog, Doing, Done, Blocked]

#### Scenario: WIP limit soft warning
  Given a column has `wip_limit = 2` and contains 2 tasks
  When the user moves a third task into it
  Then the move succeeds and the column displays a warning indicator with count "3 / 2"

### Feature: Tasks (FR-4)

#### Scenario: Create task via quick-add
  Given the user has focused the "Doing" column
  When they press `n`, type "Review PR #42", and press Enter
  Then a task "Review PR #42" appears at the top of "Doing" with `priority = medium`

#### Scenario: Reject empty title
  Given the user is creating a task
  When they submit with an empty title
  Then a validation error "Title is required" is shown and no task is created

#### Scenario: Reject title over 200 chars
  Given the user is creating a task
  When they submit a 201-character title
  Then a validation error "Title must be ≤200 characters" is shown

#### Scenario: Move task between columns
  Given task T is in "Backlog" at position 0
  When the user drags T to "Doing" at position 1
  Then `tasks.column_id` = Doing.id and `tasks.position` orders T second in Doing

#### Scenario: Completing a task sets completed_at
  Given task T is in "Doing" and "Done" has `is_done = true`
  When the user moves T to "Done"
  Then `tasks.completed_at` is set to the current timestamp

#### Scenario: Moving a completed task back clears completed_at
  Given task T has `completed_at` set and is in "Done"
  When the user moves T to "Doing"
  Then `tasks.completed_at` is NULL

### Feature: Notes (FR-5)

#### Scenario: Create standalone note
  Given the user is on the Notes view
  When they click New Note and type a body starting with "# Standup 5/23"
  Then a note exists with derived title "Standup 5/23" and the entered body

#### Scenario: Link a note to a task
  Given task T exists and the user is editing note N
  When they set N's linked task to T
  Then `notes.task_id` = T.id and the task drawer for T lists N under "Notes"

#### Scenario: Pinned notes appear first
  Given notes [A pinned, B unpinned (newer), C pinned (older)]
  When the user opens the Notes list
  Then the order is [A, C, B]

### Feature: File references (FR-6)

#### Scenario: Add a file reference by path
  Given the user is in a task drawer
  When they paste `/Users/me/docs/spec.pdf`, label it "Spec", and save
  Then a file reference exists with `target_type='task'`, `target_id=T.id`, `path='/Users/me/docs/spec.pdf'`, `label='Spec'`

#### Scenario: Missing file shows broken indicator
  Given a file reference points to `/tmp/gone.txt` which does not exist
  When the user views the task drawer
  Then the reference chip displays a "missing" indicator

#### Scenario: Open file in OS
  Given a file reference with a valid existing path
  When the user clicks "Open"
  Then the OS opens the file with its default application and no shell is invoked

#### Scenario: Reject path with shell metacharacters
  Given the user submits a path containing `;` or `&&`
  When the request reaches `POST /api/file-refs`
  Then the API returns 400 with code `INVALID_PATH`

### Feature: Tags (FR-7)

#### Scenario: Filter board by tag
  Given board B has 10 tasks, 3 tagged "urgent"
  When the user filters by tag "urgent"
  Then only the 3 tagged tasks remain visible across all columns

### Feature: Search (FR-8)

#### Scenario: Search finds matches across types
  Given a task titled "Onboarding deck", a note containing "onboarding", and a file ref labeled "onboarding.pdf"
  When the user opens cmd+K and types "onboard"
  Then results are grouped into Tasks, Notes, Files with the matching items

#### Scenario: Empty query returns no results
  Given the command palette is open
  When the query is empty
  Then no results section is rendered (recent items may show)

### Feature: Settings (FR-9)

#### Scenario: Switch to light theme
  Given the app is in dark mode
  When the user selects Light in Settings
  Then `settings.theme = 'light'` and the UI repaints with the light palette without reload

#### Scenario: Export DB to JSON
  Given the user has tasks and notes
  When they click Export
  Then the browser downloads a JSON file containing all tables

### Feature: Keyboard shortcuts (FR-10)

#### Scenario: Open command palette
  Given the user is on any page
  When they press cmd+K (or ctrl+K)
  Then the command palette opens with the search input focused

#### Scenario: Shortcut cheatsheet
  Given the user is on any page
  When they press `?`
  Then a modal listing all shortcuts is shown

### Feature: Archive (FR-11)

#### Scenario: Archive then restore a task
  Given task T is in "Doing"
  When the user archives T then opens Archive view and clicks Restore
  Then T returns to "Doing" with its prior position and `archived_at` is NULL

#### Scenario: Permanent delete from archive
  Given task T is archived
  When the user clicks "Delete permanently" and confirms
  Then T is removed from the DB and no longer appears in archive

### Feature: Responsiveness + a11y (NFR)

#### Scenario: Sidebar collapses on narrow viewport
  Given viewport width is 700px
  When the app renders
  Then the sidebar shows as an icon rail

#### Scenario: Drag-and-drop disabled on mobile viewport
  Given viewport width is 700px
  When the user views a board
  Then drag handles are hidden, cards are not draggable, and a banner reads "Drag-and-drop available on desktop"

#### Scenario: Reduced motion disables animations
  Given the OS reports `prefers-reduced-motion: reduce`
  When the user opens the task drawer
  Then the drawer appears without slide animation

### Feature: Data integrity (NFR)

#### Scenario: Auto-backup on startup when stale
  Given the last backup file is >24h old
  When the API process starts
  Then a new backup `~/.tasknote/backups/tasknote-YYYYMMDD.sqlite` is created and only the last 7 are kept

#### Scenario: API binds to localhost only
  Given the API has started
  When a request comes from a non-loopback interface
  Then the connection is refused

## Tasks

### ICT-1: Monorepo scaffold
- **What**: Initialize pnpm workspace + Turborepo. Create `apps/api`, `apps/web`, `packages/shared`, `packages/ui`. Root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, ESLint + Prettier, `.gitignore`, `.editorconfig`. Single root command `pnpm dev` runs both apps.
- **Where**: repo root, `apps/*`, `packages/*`
- **Validated by**: implicit (enables all other tasks)
- **Estimate**: M

### ICT-2: Shared types + DTO package
- **What**: `packages/shared` exports TypeScript types and Zod schemas for Board, Column, Task, Note, Tag, FileRef, Settings + DTOs (Create/Update/Move). Re-export from a single entry point.
- **Where**: `packages/shared/src/{entities,dtos,index.ts}`
- **Validated by**: ICT-4, ICT-5 (consumed by both api and web)
- **Estimate**: M

### ICT-3: Design tokens + UI primitives
- **What**: `packages/ui` exports Tailwind v4 config + CSS variables for dark/light palettes (per spec hex values), typography scale, spacing, radius. Logo SVGs (mark, wordmark, favicon). Primitive Vue components wrapping Reka UI: Button, Input, Textarea, Dialog, Drawer, DropdownMenu, Tooltip, Toast, IconButton, Tag, Chip, Kbd.
- **Where**: `packages/ui/src/{tokens,components,assets}`
- **Validated by**: "Switch to light theme", "Sidebar collapses on narrow viewport"
- **Estimate**: L

### ICT-4: NestJS API skeleton + SQLite + migrations
- **What**: NestJS app on port 3001 bound to `127.0.0.1`. TypeORM with `better-sqlite3`, DB path `~/.tasknote/tasknote.sqlite` (override `TASKNOTE_DB_PATH`). Enable WAL. Define entities for all tables in spec. Initial migration runs on startup. Global Zod validation pipe. Error filter mapping to `{error:{code,message,details?}}`. CORS allowlist `http://localhost:5173`.
- **Where**: `apps/api/src/{main.ts,app.module.ts,common/{filters,pipes},database/{data-source.ts,migrations},modules/*/entities}`
- **Validated by**: "API binds to localhost only", "Reject path with shell metacharacters"
- **Estimate**: L

### ICT-5: Backup-on-startup job
- **What**: On API boot, check `~/.tasknote/backups/` newest mtime; if >24h or missing, copy DB file to `tasknote-YYYYMMDD.sqlite`; prune to 7 newest.
- **Where**: `apps/api/src/modules/maintenance/backup.service.ts` + boot hook
- **Validated by**: "Auto-backup on startup when stale"
- **Estimate**: S

### ICT-6: Settings module (controller/service/entity) + onboarding endpoint
- **What**: MVC slice for `settings` singleton. `GET /api/settings`, `PATCH /api/settings`, `POST /api/settings/onboard` (accepts display_name, timezone, seed: 'empty'|'sample'; when 'sample', also creates default board + columns + sample tasks/notes via SeedService).
- **Where**: `apps/api/src/modules/settings/*`, `apps/api/src/modules/seed/seed.service.ts`
- **Validated by**: "First launch shows onboarding overlay", "Completing onboarding with sample seed", "Reset DB re-triggers onboarding"
- **Estimate**: M

### ICT-7: Boards module
- **What**: MVC for boards. Endpoints per spec including `GET /api/boards/:id` returning nested columns + tasks (single query with joins or N+1-safe loader). Block deletion when only one board remains (409 `LAST_BOARD`). Auto-create default columns on board create.
- **Where**: `apps/api/src/modules/boards/*`
- **Validated by**: "Create a new board", "Cannot delete the last board"
- **Estimate**: M

### ICT-8: Columns module + reorder
- **What**: MVC for columns. CRUD + `POST /api/columns/reorder` (accepts ordered ids, updates `position` atomically in a transaction). WIP-limit field stored; enforcement is UI-side warning only.
- **Where**: `apps/api/src/modules/columns/*`
- **Validated by**: "Reorder columns by drag", "WIP limit soft warning"
- **Estimate**: M

### ICT-9: Tasks module + move endpoint
- **What**: MVC for tasks with soft-delete (`archived_at`). `POST /api/tasks/move` updates `column_id` + `position` in a transaction. When moved into a column with `is_done = true`, set `completed_at`; when moved out, clear it. Validate `title` (1..200), `priority` enum, `due_date` ISO.
- **Where**: `apps/api/src/modules/tasks/*`
- **Validated by**: "Create task via quick-add", "Reject empty title", "Reject title over 200 chars", "Move task between columns", "Completing a task sets completed_at", "Moving a completed task back clears completed_at", "Archive then restore a task", "Permanent delete from archive"
- **Estimate**: L

### ICT-10: Notes module
- **What**: MVC for notes. Derive title from first non-empty line of `body_md` when title is blank. Pinned-first ordering query. Link/unlink to task by setting `task_id`.
- **Where**: `apps/api/src/modules/notes/*`
- **Validated by**: "Create standalone note", "Link a note to a task", "Pinned notes appear first"
- **Estimate**: M

### ICT-11: Tags module
- **What**: MVC for tags + many-to-many endpoints on tasks. Unique name constraint with friendly 409 on conflict.
- **Where**: `apps/api/src/modules/tags/*`
- **Validated by**: "Filter board by tag"
- **Estimate**: S

### ICT-12: File references module + safe open
- **What**: MVC for `file_refs`. Validate path is absolute and free of shell metacharacters (`;`, `&`, `|`, backticks, `$(`, newline). `GET /:id/exists` runs `fs.stat`. `POST /:id/open` invokes `spawn` with platform binary (`open` macOS, `xdg-open` Linux, `explorer.exe` Windows) and the path as a single arg — no shell.
- **Where**: `apps/api/src/modules/file-refs/*`
- **Validated by**: "Add a file reference by path", "Missing file shows broken indicator", "Open file in OS", "Reject path with shell metacharacters"
- **Estimate**: M

### ICT-13: Search endpoint
- **What**: `GET /api/search?q=` runs LIKE queries across task titles/descriptions, note titles/bodies, file-ref labels. Returns grouped results, capped at 20 per group. Empty `q` returns empty groups.
- **Where**: `apps/api/src/modules/search/*`
- **Validated by**: "Search finds matches across types", "Empty query returns no results"
- **Estimate**: S

### ICT-14: Export / import / reset endpoints
- **What**: `GET /api/export` streams JSON of all tables. `POST /api/import` validates shape and replaces DB contents in a transaction. `POST /api/reset` wipes user data and `settings.onboarded_at` so onboarding re-triggers; preserves DB file location.
- **Where**: `apps/api/src/modules/admin/*`
- **Validated by**: "Reset DB re-triggers onboarding", "Export DB to JSON"
- **Estimate**: M

### ICT-15: Web app scaffold (Vue 3 + Vite + Pinia + Router + Tailwind v4 + Reka UI + Anime.js)
- **What**: Vite Vue app on 5173 with proxy `/api` → `http://localhost:3001`. Install Pinia, Vue Router, VueUse, Reka UI, Tailwind v4, anime.js v4, markdown-it, shiki. Wire `packages/ui` and `packages/shared`. Base layout with sidebar + topbar + main outlet. Theme provider reads `settings.theme` and toggles `data-theme` on `<html>`. Global `prefers-reduced-motion` flag used by animation helpers.
- **Where**: `apps/web/src/{main.ts,App.vue,router,stores,layouts,composables/useAnime.ts,composables/useTheme.ts}`
- **Validated by**: "Switching boards is instant", "Switch to light theme", "Reduced motion disables animations"
- **Estimate**: L

### ICT-16: API client + Pinia stores
- **What**: Typed fetch client in `apps/web/src/api/*` per resource, using shared DTOs. Pinia stores: `settings`, `boards`, `currentBoard`, `notes`, `tags`, `fileRefs`, `search`. Optimistic updates for moves/reorders with rollback on failure.
- **Where**: `apps/web/src/{api,stores}`
- **Validated by**: indirectly all UI scenarios; explicitly "Move task between columns" (optimistic), "Switching boards is instant"
- **Estimate**: M

### ICT-17: Onboarding overlay
- **What**: 3-step overlay (Welcome → Profile → Seed choice). Anime.js step transitions (fade + 8px Y, 200ms). Calls `POST /api/settings/onboard`. Shows only when `settings.onboarded_at` is null. Respects reduced motion.
- **Where**: `apps/web/src/features/onboarding/*`
- **Validated by**: "First launch shows onboarding overlay", "Completing onboarding with sample seed", "Returning user skips onboarding"
- **Estimate**: M

### ICT-18: Board view + Kanban DnD (desktop only)
- **What**: `BoardView` renders columns from `currentBoard` store. Drag-and-drop via `@vueuse/integrations/useSortable` (SortableJS) for column reorder and intra/inter-column task moves. On drop, optimistic update + call `tasks/move` or `columns/reorder`. Anime.js lift on drag start. **Below 900px viewport**: DnD disabled, drag handles hidden, banner shown ("Drag-and-drop available on desktop"). Tap a card to open drawer; column/position edits available via drawer field on mobile.
- **Where**: `apps/web/src/features/board/{BoardView.vue,KanbanColumn.vue,TaskCard.vue}`
- **Validated by**: "Reorder columns by drag", "Move task between columns", "WIP limit soft warning", "Sidebar collapses on narrow viewport"
- **Estimate**: L

### ICT-19: Task drawer (detail + edit + tags + file refs + notes)
- **What**: Side drawer (Reka UI Dialog as drawer) showing task fields editable inline. Tabs: Details, Notes (list of linked notes + "Link note"), Files (list of FileRefChip + add form). Anime.js slide-in 200ms ease-out, honors reduced motion.
- **Where**: `apps/web/src/features/board/TaskDrawer.vue`, `apps/web/src/features/files/FileRefChip.vue`
- **Validated by**: "Create task via quick-add", "Reject empty title", "Reject title over 200 chars", "Completing a task sets completed_at", "Moving a completed task back clears completed_at", "Add a file reference by path", "Missing file shows broken indicator", "Open file in OS"
- **Estimate**: L

### ICT-20: Quick-add + keyboard shortcuts + cheatsheet
- **What**: Global shortcut layer (VueUse `useMagicKeys`): `n`, `cmd/ctrl+K`, `?`, `e`, `del`, `1..9`, `g n`, `g b`. Inline new-task input mounted into focused column. Cheatsheet modal lists all shortcuts.
- **Where**: `apps/web/src/composables/useShortcuts.ts`, `apps/web/src/features/shortcuts/ShortcutCheatsheet.vue`
- **Validated by**: "Create task via quick-add", "Open command palette", "Shortcut cheatsheet"
- **Estimate**: M

### ICT-21: Command palette (search)
- **What**: cmd+K overlay with input, debounced calls to `/api/search`, grouped result list (Tasks / Notes / Files), arrow-key navigation, Enter to open. Anime.js fade+scale enter.
- **Where**: `apps/web/src/features/search/CommandPalette.vue`
- **Validated by**: "Search finds matches across types", "Empty query returns no results", "Open command palette"
- **Estimate**: M

### ICT-22: Notes view (list + Milkdown editor + pinning + task linking)
- **What**: Two-pane view at `/notes`. Left list ordered pinned → updated_at desc. Right pane: **Milkdown** WYSIWYG markdown editor (`@milkdown/vue` with commonmark + gfm + listener + history + clipboard + prism plugins). Save persists `body_md`. Same Milkdown component reused inside task drawer for `description_md`. Pin toggle, link-to-task picker (combobox over tasks).
- **Where**: `apps/web/src/features/notes/{NotesView.vue,NoteList.vue,NoteEditor.vue}`
- **Validated by**: "Create standalone note", "Link a note to a task", "Pinned notes appear first"
- **Estimate**: L

### ICT-23: Tags UI + board filter
- **What**: Tag manager in settings. Tag picker on task drawer (multi-select combobox). Board filter bar with active-tag chips; URL query `?tag=` syncs.
- **Where**: `apps/web/src/features/tags/*`, integration in `BoardView.vue`
- **Validated by**: "Filter board by tag"
- **Estimate**: M

### ICT-24: Archive view
- **What**: `/archive` per board listing archived tasks and notes. Restore + permanent delete actions with typed confirmation for permanent delete.
- **Where**: `apps/web/src/features/archive/ArchiveView.vue`
- **Validated by**: "Archive then restore a task", "Permanent delete from archive"
- **Estimate**: M

### ICT-25: Settings view + theme toggle + export/import/reset
- **What**: `/settings` page with display name, theme (dark/light), accent preset, default board, danger zone. Theme toggle triggers Anime.js accent ripple. Export downloads JSON. Import accepts file with typed confirmation. Reset triggers confirmation, then `POST /api/reset`, then full reload.
- **Where**: `apps/web/src/features/settings/SettingsView.vue`
- **Validated by**: "Switch to light theme", "Export DB to JSON", "Reset DB re-triggers onboarding"
- **Estimate**: M

### ICT-26: Responsiveness + accessibility pass
- **What**: Sidebar icon-rail <900px, drawer <600px. Horizontal board scroll on mobile. Visible focus ring (accent). `aria-*` on drag handles, drawer, dialogs, palette. Verify all flows keyboard-only. Wire `prefers-reduced-motion` through animation helpers.
- **Where**: cross-cutting across `apps/web/src`
- **Validated by**: "Sidebar collapses on narrow viewport", "Reduced motion disables animations"
- **Estimate**: M

### ICT-27: Tests
- **What**: Vitest unit tests for services (tasks move logic incl. completed_at toggle, last-board guard, path validation, backup pruning, derived note title, pinned ordering). Playwright e2e smoke: onboarding → create board → create task → move to Done → archive → restore → search finds it.
- **Where**: `apps/api/test/*.spec.ts`, `apps/web/test/*.spec.ts`, `e2e/*.spec.ts`
- **Validated by**: all scenarios (test coverage)
- **Estimate**: L

### ICT-28: Dev DX + README
- **What**: Root `README.md` with setup, scripts, DB location, env vars (`TASKNOTE_DB_PATH`), troubleshooting `better-sqlite3` builds. `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint` wired through Turborepo.
- **Where**: `README.md`, `turbo.json`, root `package.json` scripts
- **Estimate**: S

## Decisions (resolved)

1. **DB location override** — `TASKNOTE_DB_PATH` env var, no UI (ICT-4).
2. **Markdown editor** — **Milkdown** in note editor + task description (ICT-19, ICT-22).
3. **Mobile DnD** — desktop-only; <900px hides drag handles, shows banner (ICT-18).

## Dependencies

- Node ≥20, pnpm ≥9 — available.
- `better-sqlite3` native build toolchain on user machine — available.
- npm packages: `anime.js@^4`, `reka-ui`, `tailwindcss@^4`, `@vueuse/core`, `@vueuse/integrations`, `sortablejs`, `@milkdown/vue`, `@milkdown/preset-commonmark`, `@milkdown/preset-gfm`, `@milkdown/plugin-listener`, `@milkdown/plugin-history`, `@milkdown/plugin-clipboard`, `@milkdown/plugin-prism`, `nestjs-zod`, `typeorm`, `better-sqlite3` — available.
- No external network services.
