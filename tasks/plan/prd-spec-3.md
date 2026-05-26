# PRD spec-3 — Audit remediation

Source: `tasks/specs/spec-3-audit-remediation.md`.

## BDD scenarios

### SCN-1 (FR-1) — Admin import rejects unknown columns
```
Given an admin import payload containing rows for table "tasks"
And one row has a key "evil_column" not present in the tasks schema
When AdminService.insertRows runs
Then the request fails with 400 ConflictException
And the error code is "IMPORT_BAD_COLUMN"
And NO rows were inserted (transaction rolled back)
```

### SCN-2 (FR-1) — Admin import accepts well-formed payload
```
Given an admin import payload containing rows whose keys all match the entity column list
When AdminService.insertRows runs
Then every row is inserted
And foreign_keys remain ON after the operation
```

### SCN-3 (FR-2) — Permanent task delete cascades file_refs
```
Given a task with two FileRef rows (target_type='task', target_id=42)
When tasks.service.permanentDelete(42) is called
Then both file_refs rows are deleted in the same transaction
And search.service no longer returns those file_refs
```

### SCN-4 (FR-2) — Board delete cascades file_refs of all descendant tasks/notes
```
Given a board with one column, one task, and one file_ref on that task
When boards.service.removeBoard(boardId) is called
Then the file_ref row is gone
```

### SCN-5 (FR-3) — Opening a task drawer does NOT empty NotesView
```
Given NotesView has loaded the global notes list (5 notes)
And the user opens a TaskDrawer for task #1 (which has 0 notes)
When TaskDrawer's load(taskId=1) completes
Then notesStore.list still contains 5 notes
And TaskDrawer's taskNotes computed returns []
```

### SCN-6 (FR-3) — Concurrent drawer opens don't race
```
Given the user rapidly opens TaskDrawer for task #1 then task #2
When both loadFor calls resolve in arbitrary order
Then notesStore.byTask.get(1) has task-1's notes
And notesStore.byTask.get(2) has task-2's notes
```

### SCN-7 (FR-4) — Due date does not shift across timezones
```
Given a user in timezone UTC-5
And they pick "2026-06-15" in the DatePicker
When TaskDrawer.saveTask sends the payload
And the API stores it
And the page reloads
Then DatePicker displays "Jun 15, 2026"
And NOT "Jun 14, 2026"
```

### SCN-8 (FR-5) — Router guards do not multiply on layout remount
```
Given a single Vue app instance
When the layout component remounts 3 times (e.g. user navigates and route key changes)
Then the router has exactly ONE beforeEach guard registered for navigation tracking
```

### SCN-9 (FR-6) — Discard restores MilkdownEditor content
```
Given a Task with description "Hello"
And the user edits the description to "Goodbye" in TaskDrawer
When the user clicks Discard
Then the editor visibly displays "Hello"
And no API call has been made
```

### SCN-10 (FR-7) — Keyboard user moves a task via the card menu
```
Given the user has Tab-focused a TaskCard
When they press Enter on the "Move task" IconButton
Then a DropdownMenu lists every column in the current board
And selecting "Done" calls boardStore.moveTask(taskId, doneColumnId, 0)
And the card visually appears in the Done column
```

### SCN-11 (FR-8a) — TaskCard activates only via inner button
```
Given a TaskCard rendered for task #5
When a screen reader inspects the card
Then the outer <article> has no tabindex
And the inner button has aria-label="Open task: <title>" (or equivalent)
And only the button is in the tab order for opening
```

### SCN-12 (FR-8b) — Sidebar board is a real link
```
Given the sidebar with 3 boards
When the user inspects with devtools
Then each board row uses <a href="/b/{id}"> via RouterLink
And the rename + delete buttons are siblings, not descendants, of the anchor
```

### SCN-13 (FR-8c) — NoteList is a plain list
```
Given NoteList rendered with 4 notes
Then the <ul> has no role="listbox"
And the <li>s have no role="option"
And each item contains a focusable activator (button or RouterLink)
```

### SCN-14 (FR-9) — Skip-to-content + focus on route change
```
Given the user Tabs from the URL bar into the app
Then the first focusable element is "Skip to content"
And activating it moves focus to <main id="main-content">

Given the user navigates from /board to /notes
Then <main> receives focus
And an aria-live region announces "Notes"
```

### SCN-15 (FR-10) — Text contrast passes AA
```
Given the light theme is active
When --color-text-muted is rendered on --color-bg
Then the WCAG contrast ratio is >= 4.5:1
```

### SCN-16 (FR-11) — Tag names announced
```
Given a TaskCard with tags ["urgent", "frontend"]
When a screen reader reads the card
Then it announces "Tags: urgent, frontend"
And the colored dots are aria-hidden
```

### SCN-17 (FR-12) — Error toast is assertive
```
Given useToast.error("Save failed", "...") is called
Then the rendered ToastRoot has type="foreground"
And screen readers announce it immediately, interrupting other speech
```

### SCN-18 (FR-13) — Drawer has accessible description
```
Given a Drawer is opened without a description prop
Then the rendered DialogContent has an aria-describedby pointing at a hidden DialogDescription
And no Reka console warning about missing description appears
```

### SCN-19 (FR-14) — Hover-only actions revealed by keyboard focus
```
Given a sidebar board row in DefaultLayout
When the user Tabs into the row
Then the rename + delete action buttons become visible (opacity 1)
```

### SCN-20 (FR-15) — Touch targets ≥ 24×24
```
Given any icon-only button covered by FR-15
When inspected
Then its computed bounding-box width AND height are >= 24px
```

---

## ICT tasks (ordered)

Estimate scale: S = ≤30 min, M = 30–90 min, L = 90+ min.

### Backend (apps/api)

- **ICT-29 (S)** [FR-1] AdminService.insertRows: hard-code per-table allowlists for `boards`, `columns`, `tasks`, `notes`, `tags`, `task_tags`, `file_refs`, `settings`. Throw `ConflictException` with `IMPORT_BAD_COLUMN` on unknown key. Linked: SCN-1, SCN-2.

- **ICT-30 (M)** [FR-2] Add `FileRefsService.deleteAllFor(targetType, targetId, manager?)`. Call from `tasks.service.permanentDelete`, `notes.service.permanentDeleteNote`, `columns.service.removeColumn` (loop tasks), `boards.service.removeBoard` (recursive). All inside existing transactions. Linked: SCN-3, SCN-4.

- **ICT-31 (S)** [FR-1, FR-2] Backend tests: extend `admin.service.spec.ts` with malicious column case; extend `tasks.service.spec.ts` + `boards.service.spec.ts` with file_refs cascade case.

- **ICT-32 (S)** [FR-4] Update Zod DTOs in `packages/shared/src/dtos.ts` — `due_date` accepts `string | null` with regex `^\d{4}-\d{2}-\d{2}$` OR full ISO (for backward compat). Backend service normalizes to `${YYYY-MM-DD}T12:00:00.000Z` when writing.

### Frontend stores (apps/web)

- **ICT-33 (M)** [FR-3] Refactor `apps/web/src/stores/notes.ts`: introduce `byTask: Map<number, Note[]>` and `globalList`. Update `load(taskId?)` semantics — taskId branch mutates Map only. Add `forTask(id)` getter. Update `TaskDrawer.vue` taskNotes computed to consume `notesStore.forTask(props.taskId)`. Linked: SCN-5, SCN-6.

- **ICT-34 (S)** [FR-5] Move `isNavigating` to `apps/web/src/composables/useNavigationState.ts` (module-scoped ref). Register `router.beforeEach/afterEach` in `apps/web/src/router/index.ts` ONCE. Remove guard registration + ref from `DefaultLayout.vue`. Linked: SCN-8.

### Frontend components — bugfix

- **ICT-35 (M)** [FR-4] TaskDrawer.vue:
  - `saveTask`: send `due_date: dueDate.value || null` (raw string, no ISO conversion).
  - `saveNewTask`: same.
  - Loader: `dueDate.value = t.due_date ? t.due_date.slice(0, 10) : ''`.
  - `isDirty`: compare raw strings, not ISO. Linked: SCN-7.

- **ICT-36 (M)** [FR-6] MilkdownEditor.vue: watch `innerProps.modelValue`. Track `lastEmitted` ref. If incoming !== lastEmitted, call `editor.action(ctx => { const view = ctx.get(editorViewCtx); /* replace doc using schema.node('doc', null, parseMarkdown(val)) or call commands.call(replaceAllCommand.key, val) */ })`. Use `@milkdown/utils` `replaceAll` if available. Linked: SCN-9.

### Frontend components — a11y

- **ICT-37 (M)** [FR-8a] TaskCard.vue: convert to `<article>` + inner `<button class="task-card__open">`. Drag-handle remains separate. Update CSS for new button. Linked: SCN-11.

- **ICT-38 (M)** [FR-8b] DefaultLayout.vue: replace `<div role="link">` board row with `<RouterLink :to="`/b/${board.id}`">` wrapping label + icon. Action buttons (rename/delete) become siblings within `.nav-item--board` flex wrapper, not nested inside link. Update keyboard handlers. Linked: SCN-12.

- **ICT-39 (S)** [FR-8c] NoteList.vue: remove `role="listbox"`, `role="option"`. Each `<li>` contains a `<button>` activator. Linked: SCN-13.

- **ICT-40 (M)** [FR-7] TaskCard.vue: add `.task-card__menu` IconButton wrapping `DropdownMenu`. Items list `boardStore.board.columns` and call `boardStore.moveTask(task.id, col.id, 0)` on select. Visible on hover + focus-within. Linked: SCN-10.

- **ICT-41 (S)** [FR-9, FR-13] App.vue: prepend skip-to-content link. DefaultLayout `<main>` adds `tabindex="-1"`. Router-state composable triggers `main.focus()` + sets a live-region message on `afterEach`. Drawer.vue: add hidden DialogDescription fallback. Linked: SCN-14, SCN-18.

- **ICT-42 (S)** [FR-10] Update `--color-text-muted` light value to `#71717A` in `packages/ui/src/tokens/tokens.css` (or equivalent). Verify dark unchanged. Linked: SCN-15.

- **ICT-43 (S)** [FR-11] TaskCard.vue: add `:aria-label="tagsLabel"` to `.task-card__tags` container where `tagsLabel = 'Tags: ' + tagNames.join(', ')`. Dots remain `aria-hidden="true"`. Linked: SCN-16.

- **ICT-44 (S)** [FR-12] `packages/ui/src/components/useToast.ts` + Toast.vue: include `severity: 'error' | 'success' | 'info'` on ToastItem; map error → `type="foreground"` on ToastRoot. Linked: SCN-17.

- **ICT-45 (S)** [FR-14, FR-15] DefaultLayout.vue + NoteList.vue + DatePicker.vue CSS adjustments:
  - `:focus-within` reveals action groups (opacity 1).
  - `@media (hover: none)`: default opacity 0.4 for action groups.
  - Buttons bumped to min 24×24 (use min-width/min-height). Linked: SCN-19, SCN-20.

- **ICT-46 (S)** [FR-9] Mobile drawer: on `closeDrawer()`, refocus the hamburger button (`document.getElementById('topbar-hamburger')?.focus()` or via template ref).

### Verification

- **ICT-47 (S)** Run `pnpm --filter @tasknote/web exec vite build`. Run `pnpm --filter @tasknote/api build`. Run all tests.

- **ICT-48 (S)** Manual smoke via Playwright (use existing playwright-skill harness): open task drawer, edit description, click Discard → editor reverts. Pick a date, save, reload → date unchanged. Tab from URL bar → first stop is "Skip to content".

---

## Task counts

- Backend: ICT-29..32 (4 tasks): 2 S, 1 M, 1 S
- Frontend stores: ICT-33..34 (2 tasks): 1 M, 1 S
- Frontend bugfix: ICT-35..36 (2 tasks): 2 M
- Frontend a11y: ICT-37..46 (10 tasks): 4 M, 6 S
- Verification: ICT-47..48 (2 tasks): 2 S

**Total: 20 tasks** (S: 11, M: 9, L: 0)

Scenarios: 20
Requirements: 15 functional + 4 NFR = 19
