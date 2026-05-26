# spec-3 — Audit remediation: reliability + a11y

**Source**: combined findings from /audit (reliability) + /accessibility-review (UI/UX), run May 2026.

Scope is the top-impact items only. Lower-severity Minor findings deferred unless quick wins (token tweaks).

---

## Goals

1. Close the security hole in admin import.
2. Eliminate data-integrity gaps around polymorphic file_refs.
3. Fix visible data-loss / data-flicker bugs (notes store race, due-date timezone, router-guard leak, Milkdown ignoring external updates).
4. Bring the UI to WCAG 2.1 AA on the most-violated dimensions (contrast, keyboard DnD, semantic roles, focus management, target size).

Out of scope:
- Daily backup interval / backup-restore tooling (C4 reliability) — deferred.
- TaskLinkPicker context-aware empty-states (I8) — deferred.
- Full Pinia notes-store refactor beyond keying by taskId (C3 minimum-viable fix).

---

## Functional requirements

### FR-1 — Admin import column whitelist (security)
- `AdminService.insertRows` (apps/api/src/modules/admin/admin.service.ts) MUST reject any column name not in a per-table allowlist.
- Allowlist source: TypeORM entity metadata (or hard-coded per table — both acceptable; hard-coded is simpler and explicit).
- Unknown columns produce a `ConflictException` (400 with `code: "IMPORT_BAD_COLUMN"`) — DO NOT silently drop.
- Values continue to be parameterized (already correct).

### FR-2 — file_refs cascade on entity deletion
- Permanent delete of a Task (`tasks.service.permanentDelete`) MUST also delete `file_refs WHERE target_type='task' AND target_id = ?`.
- Permanent delete of a Note (`notes.service.permanentDeleteNote`) MUST cascade `target_type='note'`.
- Cascade-delete of tasks via column removal (`columns.service.removeColumn`) MUST cascade their file_refs.
- Cascade-delete of board → columns → tasks MUST cascade file_refs.
- All cascades happen INSIDE the existing transaction.
- Implementation: add helper `FileRefsService.deleteAllFor(target_type, target_id, manager)` called from delete paths.

### FR-3 — Notes store keyed by task scope
- `useNotesStore` (apps/web/src/stores/notes.ts) MUST split state into:
  - `globalList: Note[]` — all notes (used by NotesView)
  - `byTask: Map<number, Note[]>` — notes scoped to a task (used by TaskDrawer)
- `load()` (no arg) populates `globalList` only.
- `load(taskId)` populates `byTask.set(taskId, ...)` only — never mutates `globalList`.
- Getters: `forTask(taskId): Note[]` and `list: Note[]` (alias for globalList).
- TaskDrawer computed `taskNotes` MUST consume `byTask.get(props.taskId)`, not filter the global list.
- Two concurrent `load(taskId)` for different tasks MUST not race — each updates its own Map slot.

### FR-4 — Due date as calendar day (no timezone shift)
- Task `due_date` field MUST store and round-trip as `YYYY-MM-DD` (calendar day) end-to-end.
- API DTO updates to accept `string | null` matching `^\d{4}-\d{2}-\d{2}$` (Zod regex).
- Entity column stays DATETIME for backward compat BUT writes use noon-UTC (`T12:00:00Z`) to avoid DST/timezone day-flip on read. Display layer parses date-part only.
- `TaskDrawer.saveTask` and `saveNewTask` MUST send the raw `YYYY-MM-DD` string from `DatePicker`, NOT `new Date(...).toISOString()`.
- `TaskDrawer.watch(props.taskId)` loader MUST extract date part via string slice (`due_date.slice(0,10)`), not `new Date(...).toISOString().substring(0,10)`.

### FR-5 — Router guards registered at module scope
- `router.beforeEach` and `router.afterEach` that set `isNavigating` MUST be registered in `apps/web/src/router/index.ts` (or equivalent) ONCE at module init.
- The `isNavigating` state moves to a tiny module-scoped Pinia store or composable (`useNavigationState`).
- `DefaultLayout.vue` consumes the reactive ref; it does NOT register guards.

### FR-6 — MilkdownEditor reacts to external modelValue
- `MilkdownEditor.vue` MUST watch `innerProps.modelValue` and, when it changes from outside (e.g. Discard pressed), reset the ProseMirror doc.
- Detect "external" via comparing incoming value to last-emitted value; if equal, no-op.
- Use Milkdown's `replaceAll` command or low-level ProseMirror `tr.replaceWith` on the root node.
- Existing `:key` workarounds in NoteEditor remain harmless; do not change them.

### FR-7 — Keyboard alternative for moving tasks
- TaskDrawer Details tab already has a Column `<Select>` — keep it; this is the primary keyboard path.
- TaskCard MUST expose a "Move to column" affordance keyboard-only users can reach without opening the drawer:
  - Add an IconButton inside `task-card__actions` labeled "Move task" that opens a DropdownMenu of column names.
  - Visible on hover + focus-within of the card.
  - Selecting a column calls the same `boardStore.moveTask(taskId, columnId, 0)` used by drag-drop.
- Within-column reordering via keyboard is OUT of scope for this iteration — log as future work.

### FR-8 — Semantic roles + focus correctness
- **FR-8a** TaskCard: replace `<article tabindex="0">` with `<article>` containing `<button class="task-card__open" :aria-label="task.title">` that triggers open. Drag handle stays a sibling, not nested in the button.
- **FR-8b** Sidebar board items in `DefaultLayout.vue`: replace `<div role="link" tabindex="0">` with `<RouterLink>`. Rename + delete buttons move OUTSIDE the link as siblings within a `.nav-item--board` wrapper.
- **FR-8c** NoteList: drop `role="listbox"` + `role="option"`. Use plain semantic `<ul><li>` with `<RouterLink>` (or `<button>` if click-to-select stays). No fake-listbox.

### FR-9 — Focus + route announcement
- Add a skip-to-content link as the first focusable element in `App.vue`: `<a href="#main-content" class="sr-only focus:not-sr-only">Skip to content</a>`.
- On router `afterEach`, focus must move to `<main id="main-content" tabindex="-1">` and an `aria-live="polite"` element announces the new route name (`routeLabel`).
- DefaultLayout's mobile drawer close MUST return focus to the hamburger trigger that opened it.

### FR-10 — Color token contrast fix
- Update `--color-text-muted` LIGHT theme value from `#A1A1AA` to `#71717A` (≥ 4.5:1 on `#FAFAFA`).
- Verify no regressions on dark theme (existing value already passes).
- Single token in `packages/ui/src/tokens/tokens.css` (or equivalent).

### FR-11 — Tag names exposed to AT
- TaskCard `.task-card__tags`: each tag dot becomes `<span class="task-card__tag-dot" :aria-label="tag.name" role="img">` or container gets `:aria-label="`Tags: ${tagNames.join(', ')}`"` with dots aria-hidden. Pick one (container label is simpler).

### FR-12 — Toast severity → assertive when needed
- `useToast.error(...)` MUST render the underlying Reka `ToastRoot` with `type="foreground"` (assertive announcement).
- `success`/`info` stay `background` (polite).

### FR-13 — Drawer sr-only description fallback
- `packages/ui/src/components/Drawer.vue`: mirror `Dialog.vue`'s pattern — render a visually-hidden `DialogDescription` when no `description` prop provided, to satisfy Reka's `aria-describedby` contract and silence the console warning.

### FR-14 — Hover-only actions revealed on focus
- `.nav-item__actions` in DefaultLayout AND `.note-item__del` in NoteList AND any `opacity: 0` action group MUST also become visible when the row receives keyboard focus.
- Mechanism: rows must be focusable (already true for board items via RouterLink after FR-8b) and `:focus-within` reveals actions.
- Touch users: actions visible at 0.4 opacity by default on `(hover: none)` media query.

### FR-15 — Touch target size ≥ 24×24 (WCAG 2.2 AA)
- Audit & bump these to min 24×24 hit-area (padding inside is fine):
  - `.nav-item__action-btn` (DefaultLayout)
  - `.note-item__del` (NoteList)
  - `.dp-clear` (DatePicker)
  - `.nav-section__add` (DefaultLayout)

---

## Non-functional requirements

- **NFR-1** All existing tests MUST pass after the changes. No regressions.
- **NFR-2** Build MUST pass (`pnpm --filter @tasknote/web exec vite build` and `pnpm --filter @tasknote/api build`).
- **NFR-3** No new dependencies added unless strictly required.
- **NFR-4** Each FR maps to either a unit test or an integration test where reasonable.

---

## Dependencies

- All work touches existing files; no new packages.
- `RouterLink` is already used (Vue Router 4).
- Reka-UI `DropdownMenu` already wrapped as `packages/ui/src/components/DropdownMenu.vue`.
- Migration NOT needed for FR-2 (we use service-layer cascade, not DB CASCADE).
- Migration NOT needed for FR-4 (column stays DATETIME, just storage convention changes).

---

## Open questions

None blocking. (Could discuss whether to migrate `due_date` column type to `DATE`, but storage compat retained for now.)
