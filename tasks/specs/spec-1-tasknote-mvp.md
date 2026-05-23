# Spec: TaskNote MVP — local single-user task manager

## Overview
TaskNote is a local-first, single-user task manager that runs on `localhost` with a SQLite store. It combines a Kanban board, freeform personal notes, and file references (paths to existing files on disk — no upload/storage) so the user can track work, personal reminders, and meeting context that would be too noisy for a corporate tool like Jira. Dark-first, elegant, minimalist. Vue.js + NestJS monorepo, MVC API, Anime.js for motion.

## Naming + identity

- **Product name**: **TaskNote** (matches existing repo dir `tasknote/`; fuses the two core nouns: tasks + notes).
- **Tagline**: "Your work, your way — local."
- **Logo concept**: monochrome glyph — a checkmark whose tail extends into a folded note corner. Single weight, geometric, readable at 16px. Wordmark uses a clean geometric sans (Inter or Geist) lowercase: `tasknote`. Delivered as SVG (logo-mark.svg, logo-wordmark.svg, favicon.svg).
- **Palette (dark-first)**:
  - Background `#0B0C0E` / surface `#14161A` / surface-elevated `#1B1E23`
  - Border `#262A30`
  - Text primary `#E7E9EC` / secondary `#9BA1AB` / muted `#5B616B`
  - Accent `#A3E635` (lime — single accent, used sparingly for primary action / focus ring)
  - Status: todo `#5B616B`, doing `#F5C26B`, blocked `#F87171`, done `#A3E635`
- **Typography**: Inter (UI) + JetBrains Mono (code/IDs). Sizes 12 / 14 / 16 / 20 / 28 / 40. Line-height 1.45 body, 1.2 headings.
- **Spacing scale**: 4 / 8 / 12 / 16 / 24 / 32 / 48.
- **Radius**: 8 (controls) / 12 (cards) / 16 (modals).

## Actors

- **Owner** — sole user. No accounts, no roles, no sharing. Local machine only.

## Functional requirements

### FR-1: First-run onboarding
On first launch (no rows in `settings`), show a 3-step onboarding overlay:
1. Welcome + product intro (name, tagline, what it does).
2. Display name + preferred timezone (defaults from system).
3. Seed choice: "Start empty" or "Create sample board" (sample = 1 board, 4 columns Backlog/Doing/Blocked/Done, 3 demo tasks, 1 demo note).
Completion writes `settings.onboarded_at` and a `settings.display_name`. Onboarding never shows again unless DB is reset.

### FR-2: Boards
- CRUD on boards. At least one board always exists; deleting the last board is blocked.
- Each board has an ordered list of columns. Default columns on board create: Backlog, Doing, Blocked, Done.
- Board list shown in left sidebar; switching boards is instant (no full reload).

### FR-3: Columns
- CRUD on columns within a board. Reorderable via drag.
- Each column has a name, color (from status palette), optional WIP limit (integer; soft warning when exceeded — does not block).

### FR-4: Tasks (Kanban cards)
- CRUD on tasks. Fields: `title` (required, ≤200 chars), `description` (markdown, optional), `column_id`, `position` (float for ordering), `priority` (low/medium/high/urgent), `due_date` (optional), `tags` (many-to-many), `created_at`, `updated_at`, `completed_at` (set when moved to a column marked "done-like").
- Drag-and-drop between columns and reorder within column. Position changes persist immediately.
- Task detail opens in a side-drawer (not full page) with description editor, metadata, linked notes, linked file references, comments/log.
- Quick-add: `n` keyboard shortcut focuses an inline new-task input at top of focused column.

### FR-5: Notes
- Standalone notes (not tied to a task) and task-linked notes (one note may link to zero or one task; a task may have many notes).
- Fields: `title` (optional, derived from first line if blank), `body_md` (markdown), `pinned` (bool), `created_at`, `updated_at`, optional `task_id`.
- Notes view: list on left (sorted: pinned → updated_at desc), editor on right. Markdown rendered live (split or toggle).

### FR-6: File references
- A "file reference" is a stored absolute path + display label + optional note. No bytes are uploaded or copied.
- Can be attached to a task or a note (polymorphic via `target_type` + `target_id`).
- UI shows path, basename, exists/missing indicator (backend `fs.stat` check), and an "Open in Finder/Explorer" action (uses OS `open` / `xdg-open` / `explorer` via backend endpoint).
- Adding a reference: paste path, or drag a file from OS into the drop zone (browser gives filename only on web — accept name + manual path, or use a native file picker via `<input type="file">` to retrieve `name` and prompt user to confirm/edit full path; document the limitation).

### FR-7: Tags
- Global tag pool. CRUD tags (name, color). Assign multiple tags per task.
- Filter board by tag(s).

### FR-8: Search
- Global search (cmd/ctrl + K) across task titles/descriptions, note titles/bodies, file-reference labels. Returns grouped results, keyboard-navigable.

### FR-9: Settings
- Display name, theme (dark default, light available), accent color (preset list), default board, danger zone (export DB to JSON, import JSON, reset DB).

### FR-10: Keyboard shortcuts
- `cmd/ctrl+K` search · `n` new task in focused column · `e` edit selected · `del` archive · `1..9` jump to board · `g n` go to notes · `g b` go to boards · `?` shortcut cheatsheet.

### FR-11: Soft delete / archive
- Tasks and notes are archived, not hard-deleted. Archive view per board. Restore or permanently delete from archive.

## Technical requirements

### Architecture
- **Monorepo** using **pnpm workspaces** + **Turborepo** (lightweight, fast). Layout:
  ```
  tasknote/
    apps/
      api/         # NestJS (MVC: controllers/services/entities)
      web/         # Vue 3 + Vite
    packages/
      shared/      # TS types, DTOs, validation schemas (Zod), shared constants
      ui/          # Vue component primitives + design tokens
    tasks/         # specs + plans (this dir)
  ```
- **API** runs on `http://localhost:3001`, **web** on `http://localhost:5173`. Web proxies `/api` → API in dev.
- Single process per app, no auth middleware. CORS allowed for localhost only.

### Stack

- **Backend**: NestJS 10, TypeORM (SQLite via `better-sqlite3` driver for sync + speed), Zod for DTO validation (via `nestjs-zod`), class-based MVC: `controller → service → repository (TypeORM) → entity`.
- **Frontend**: Vue 3 (Composition API + `<script setup>`), Vite, Vue Router, Pinia (state), VueUse (utilities), **Anime.js v4** (animations — required), **Reka UI** (headless component lib — accessible, unstyled; *not* Vuetify) styled with Tailwind CSS v4. Markdown editor: **Milkdown** (`@milkdown/vue` + commonmark, gfm, listener, history, clipboard, prism plugins).
- **Tooling**: TypeScript strict, ESLint + Prettier, Vitest (unit), Playwright (e2e smoke).

### Data model (SQLite)

Tables (TypeORM entities):

- `settings` — singleton row: `id=1`, `display_name`, `theme`, `accent`, `default_board_id`, `onboarded_at`, `timezone`.
- `boards` — `id`, `name`, `position`, `created_at`, `updated_at`.
- `columns` — `id`, `board_id` (fk), `name`, `color`, `wip_limit` (nullable), `is_done` (bool), `position`.
- `tasks` — `id`, `column_id` (fk), `title`, `description_md`, `priority`, `due_date` (nullable), `position`, `archived_at` (nullable), `completed_at` (nullable), `created_at`, `updated_at`.
- `notes` — `id`, `task_id` (fk, nullable), `title`, `body_md`, `pinned` (bool), `archived_at` (nullable), `created_at`, `updated_at`.
- `tags` — `id`, `name` (unique), `color`.
- `task_tags` — `task_id`, `tag_id` (composite pk).
- `file_refs` — `id`, `target_type` ('task' | 'note'), `target_id`, `path`, `label`, `note` (nullable), `created_at`.

Indexes: `tasks(column_id, position)`, `notes(task_id)`, `notes(pinned, updated_at)`, `file_refs(target_type, target_id)`, `task_tags(tag_id)`.

DB file location: `~/.tasknote/tasknote.sqlite` (created on first boot). Migrations via TypeORM, run on startup.

### API contracts

REST under `/api`. JSON. Errors as `{ error: { code, message, details? } }`. Status codes per HTTP conventions.

- `GET /api/settings` · `PATCH /api/settings` · `POST /api/settings/onboard`
- `GET /api/boards` · `POST /api/boards` · `PATCH /api/boards/:id` · `DELETE /api/boards/:id`
- `GET /api/boards/:id` — returns board + columns + tasks (nested, single round-trip)
- `POST /api/columns` · `PATCH /api/columns/:id` · `DELETE /api/columns/:id` · `POST /api/columns/reorder`
- `GET /api/tasks/:id` · `POST /api/tasks` · `PATCH /api/tasks/:id` · `DELETE /api/tasks/:id` (soft) · `POST /api/tasks/:id/restore` · `POST /api/tasks/move` (column_id + position)
- `GET /api/notes` · `GET /api/notes/:id` · `POST /api/notes` · `PATCH /api/notes/:id` · `DELETE /api/notes/:id`
- `GET /api/tags` · `POST /api/tags` · `PATCH /api/tags/:id` · `DELETE /api/tags/:id`
- `POST /api/tasks/:id/tags` · `DELETE /api/tasks/:id/tags/:tagId`
- `GET /api/file-refs?target_type=&target_id=` · `POST /api/file-refs` · `DELETE /api/file-refs/:id` · `GET /api/file-refs/:id/exists` · `POST /api/file-refs/:id/open` (OS-level open via spawn)
- `GET /api/search?q=` — returns `{ tasks: [...], notes: [...], files: [...] }`
- `GET /api/export` (full JSON dump) · `POST /api/import` · `POST /api/reset`

All write endpoints validate with Zod DTOs from `packages/shared`.

### UI structure

- **Layout**: left sidebar (boards + Notes link + Settings) · top bar (board name, search trigger, theme toggle) · main canvas (board, notes, or settings).
- **Pages**: `/` (default board) · `/b/:id` (board) · `/notes` · `/notes/:id` · `/archive` · `/settings`.
- **Key components**: `BoardView`, `KanbanColumn`, `TaskCard`, `TaskDrawer`, `NoteList`, `NoteEditor`, `FileRefChip`, `TagPicker`, `CommandPalette`, `OnboardingOverlay`, `ShortcutCheatsheet`.
- **Animations (Anime.js v4)**: card lift on drag start, column WIP-limit pulse, drawer slide-in (200ms ease-out), onboarding step transitions, command palette fade+scale, success toast bounce, theme-toggle accent ripple. All animations honor `prefers-reduced-motion`.

### Infrastructure
- None beyond Node + the two local processes. No Docker required (optional `docker-compose.yml` for parity is out of scope for MVP).
- Single dev command at root: `pnpm dev` (Turborepo runs `api` + `web` in parallel).

## Non-functional requirements

- **Performance**: board load <150ms for ≤500 tasks; search <100ms for ≤5k records (SQLite FTS5 optional in v1.1, plain LIKE in MVP).
- **Responsiveness**: works ≥360px width. Sidebar collapses to icon rail <900px, becomes drawer <600px. Board scrolls horizontally on mobile; cards stack readably.
- **Accessibility**: WCAG 2.1 AA — keyboard reachable for all actions, visible focus ring (accent color), `aria-*` on drag handles and modals, color is never sole signal (status uses icon + color), `prefers-reduced-motion` disables non-essential animation.
- **Compatibility**: latest 2 versions of Chrome, Firefox, Safari. Node ≥20 LTS.
- **Security**: bind API to `127.0.0.1` only. No remote exposure. File-open endpoint validates path is absolute, exists, and refuses paths containing shell metacharacters; uses `spawn` (no shell). Import/reset require typed confirmation in UI.
- **Data integrity**: SQLite in WAL mode. Daily auto-backup of DB file to `~/.tasknote/backups/tasknote-YYYYMMDD.sqlite` (keep last 7). Triggered on startup if last backup >24h old.

## Dependencies

- Node ≥20, pnpm ≥9 — **user-installed, available**.
- `better-sqlite3` native module — builds on user's machine (Python + build tools). **Available** on macOS/Linux/Windows with standard dev tooling.
- `anime.js` v4 — **available** on npm.
- Reka UI + Tailwind CSS v4 — **available**.
- No external network services.

## Constraints

- No authentication, no multi-user, no cloud sync (MVP).
- File uploads are **out of scope** — only path references.
- No mobile-native app (responsive web only).
- Vuetify is explicitly disallowed.
- Must remain a single-machine, single-process-per-app experience.

## Decisions (resolved)

1. **DB location override** — `TASKNOTE_DB_PATH` env var supported, no UI in MVP.
2. **Markdown editor** — **Milkdown** (WYSIWYG markdown, plugin-based, lightweight). Used in note editor and task description.
3. **Mobile DnD** — desktop-only Kanban. On viewports <900px, board is read-only (view + open task drawer); task create/edit still works, but column/task drag is disabled. Banner suggests desktop for full editing.

## Glossary

- **Board** — a Kanban surface containing ordered columns.
- **Column** — a status lane within a board; may be marked `is_done`.
- **Task** — a card within a column; the unit of work.
- **Note** — freeform markdown content; may stand alone or link to a task.
- **File reference** — a stored pointer (path + label) to a file on the user's disk; bytes are never copied.
