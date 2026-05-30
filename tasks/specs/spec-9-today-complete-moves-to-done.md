# spec-9 — Today "Done" moves the task to the board's Done column

**Source**: `/audit` finding — completing a task from the Today list sets `completed_at` but leaves the card in its original column, so the board status looks unchanged. Board-drag-to-Done, by contrast, both sets `completed_at` AND moves the card to the Done column. The two completion paths disagree.

## Goal

Make `complete()` (the endpoint Today's "Done" button calls) consistent with the board's drag-to-Done behavior: completing a task moves it to its board's Done column (`isDone: true`) and sets `completed_at`. After this, a task completed from Today appears in the board's Done column with the done mark — matching the user's mental model.

## Background (verified)

- `complete(id)` (`apps/api/src/modules/tasks/tasks.service.ts:282`) currently only sets `task.completedAt = new Date()` — no column move.
- The board renders tasks **by column**. There is a real Done column per board (`DEFAULT_COLUMNS` seeds `{ name: 'Done', isDone: true, position: 3 }`).
- `moveTask` already does the right thing on a cross-column move into an `isDone` column: sets `completedAt`, positions the card. The chain to resolve the Done column: task → `columnId` → `ColumnEntity.boardId` → the board's column where `isDone = true`.
- `uncomplete(id)` clears `completedAt`. For symmetry it should move the task back OUT of the Done column to a sensible non-done column (e.g. the first non-done column, or its prior column if tracked — see open question).

## Functional requirements

### FR-1 — `complete()` moves the task to the board's Done column

- `complete(id)` MUST, in a transaction:
  1. Load the task; resolve its column's `boardId`.
  2. Find that board's Done column (`isDone = true`). If multiple, the lowest-position one. If none exists, fall back to current behavior (set `completedAt` only) and log a warning.
  3. Move the task to the Done column: set `columnId = doneColumn.id`, assign a position (append to end of the Done column, like `createTask`/`moveTask` positioning), set `completedAt = new Date()`.
- Idempotent: completing an already-completed task (already in Done) just keeps it there / refreshes nothing harmful — do not double-append or error.
- Returns the updated task (now snake_case via the interceptor).

### FR-2 — `uncomplete()` moves the task out of the Done column

- `uncomplete(id)` MUST clear `completedAt` AND, if the task is currently in a Done column, move it to a non-done column on the same board (the lowest-position `isDone = false` column, typically Backlog). If the task is not in a Done column, just clear `completedAt`.
- Keeps the two states coherent: a task with `completed_at = null` should not sit in the Done column.

### FR-3 — Today list + board both reflect the move

- After completing from Today: the task drops from the Today list (already does — `completed_at IS NULL` filter) AND, on next board load/refresh, appears in the Done column with the done mark.
- No frontend change strictly required for correctness (board re-fetches on navigation), but if the board is mounted and the store holds the task, ensure no stale-position artifact. (Board reactivity already reassigns on store mutations from spec-7; a plain re-fetch is acceptable here since Today and Board are separate views.)

## Functional requirements (cont.)

### FR-4 — Moving a task between columns shows one card, not a duplicate

- Symptom: moving a task to another column shows it **duplicated** in the new column; the old-column copy only disappears after a page refresh (F5).
- This is the same class as the spec-7 DnD-duplicate bug (SortableJS physically transplants the `<li>` while the store re-renders the card) — but a path still leaks. Candidates to investigate and fix:
  - **Board drag** (`KanbanColumn.vue` `onEnd`): the spec-7 revert (`evt.to !== evt.from` → `insertBefore` to undo SortableJS's DOM move) may not cover every drop target. Verify the revert fires for: drop into a NON-empty column, drop into an EMPTY column, and drop at a specific index (not just append). The `KanbanColumn` `localTasks` watch must resync from `props.column.tasks` after the store ref-swap.
  - **Modal column-select** (`TaskDrawer.vue` `onColumnChange` → `boardStore.moveTask(taskId, colId, 0)`): pure store path, no DnD. The store `moveTask` cross-column branch already filters source + inserts target (correct in isolation) — confirm the modal-triggered move re-renders the board without a duplicate and without needing F5.
- Root-cause the ACTUAL leaking path first (reproduce: move a task, count cards per column before vs after F5 — duplicate before, correct after = the bug). Then fix the specific path. Add a regression test that fails before / passes after, at the layer where the leak occurs (KanbanColumn DnD revert test like spec-7 SCN-D5, and/or a store/DOM test for the modal move).
- Required outcome: after ANY column move (drag or modal), the task appears exactly once, in the target column, with no F5.

## Non-functional requirements

- **NFR-1** All existing API + web tests pass; new behavior covered by tests (complete → task in Done column + completedAt set; complete with no Done column → fallback; uncomplete → out of Done + completedAt null; column move shows no duplicate).
- **NFR-2** `pnpm --filter @tasknote/api build` + web build pass.
- **NFR-3** No new runtime dependencies.
- **NFR-4** Reuse the existing Done-column detection + completedAt semantics from `moveTask` — do not duplicate divergent logic (extract a shared helper if cleaner).
- **NFR-5** Transactional: column move + completedAt set atomically.

## Dependencies

- FR-1/2/3: backend-only (tasks.service `complete`/`uncomplete`). No migration. No DTO change (endpoints unchanged: `POST/DELETE /tasks/:id/complete`).
- FR-4: frontend (`KanbanColumn.vue` DnD revert and/or `TaskDrawer.vue` modal move + `stores/currentBoard.ts`). Root-cause the leaking path before fixing.
- Board + Today already consume the result.

## Open questions

- **uncomplete target column**: move to the first non-done column (Backlog) — simplest, no extra state. Restoring the exact prior column would need tracking it (out of scope). Decision: first `isDone = false` column by position.
