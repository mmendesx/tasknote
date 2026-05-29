# spec-7 — Board reactivity: mutations propagate without F5

**Source**: 3 user-reported bugs + `/audit` root-cause analysis.

The board UI does not reflect store mutations until a manual page refresh (F5). Root cause is a single anti-pattern: `BoardView` and `KanbanColumn` keep **local shallow copies** of store state (`localColumns`, `localTasks`) synced by a `watch` on the array **reference**. The `currentBoard` store mutates tasks/columns **in place** (`splice`, `unshift`, `Object.assign`) — the reference never changes, so the watches never fire, and the rendered copies go stale. F5 triggers a full refetch that replaces the reference, masking the bug.

The store's mutation logic is correct (optimistic snapshot/rollback, temp-id swap). The fix is to make store state changes propagate to the DOM without defeating the `useSortable` drag-and-drop that motivated the local copies.

---

## Reported bugs (all one root cause except FR-3)

1. **Add / edit a task → board doesn't update** until F5. (`Object.assign(task, dto)` and create's `unshift` mutate in place; KanbanColumn's `localTasks` watch on `props.column.tasks` reference never fires.)
2. **Today view: add to-do → nothing appears on Today**, task is found on the board instead. (Separate path — `TodayView.submitQuickAdd` silent-returns when `defaultColumnId` is null, or the created task's `committed_on` does not round-trip into the reloaded list.)
3. **Move task between columns → source "No tasks" empty-state not restored, target empty-state not cleared**; layout stays wrong until F5. (Same reference-watch staleness; `taskCount` reads the stale local copy.)

---

## Goals

1. Store mutations (create, update, move, soft-delete, tag add/remove, column reorder) are reflected in the board UI immediately — no F5.
2. Column empty-state ("No tasks") appears/clears correctly the moment a task leaves/enters a column.
3. Today quick-add either adds the task to the Today list immediately or gives clear feedback when it cannot (no silent no-op); created task with `committed_on = today` reliably appears.
4. Drag-and-drop (`useSortable`) keeps working — the fix must not break column reorder or task DnD.

Out of scope:
- Backend changes (the API is correct; this is a frontend reactivity bug).
- New features. Redesign of the board.
- Real-time/multi-client sync.

---

## Functional requirements

### FR-1 — Store mutations replace collection references (reactivity fix)

- `apps/web/src/stores/currentBoard.ts`: every mutation that changes a column's task array or the board's column array MUST assign a **new array/object reference** rather than mutating in place, so reference-based watches and template bindings update.
  - `createTask`: replace `col.tasks` with a new array (e.g. `col.tasks = [tempTask, ...col.tasks]`, then swap temp→real by mapping to a new array).
  - `updateTask`: replace the task object (`col.tasks = col.tasks.map(t => t.id === id ? { ...t, ...dto } : t)`), not `Object.assign`.
  - `moveTask`: build new source and target task arrays (no in-place `splice` on the live arrays); reassign `board.value.columns` or the affected `col.tasks` to new references.
  - `softDeleteTask`, `addTag`, `removeTag`: same — produce new arrays/objects.
  - Optimistic snapshot/rollback semantics preserved.
- This is the spec-4 single-reassignment discipline applied to the board store (the `today` store already follows it).

### FR-2 — Views bind to store state, not stale local copies

- `apps/web/src/features/board/BoardView.vue`: `localColumns` and `apps/web/src/features/board/KanbanColumn.vue`: `localTasks` exist only to feed `useSortable`. Resolve the staleness without losing DnD. Options (implementer picks the cleanest that works):
  - (a) Keep the local refs but make the syncing `watch` `deep: true` so in-place changes propagate — **only acceptable if FR-1 is NOT done**; with FR-1 (reference swaps) a shallow watch already fires. Prefer relying on FR-1.
  - (b) Drive `useSortable` from a ref that is re-synced whenever the store reference changes (FR-1 makes this fire), and reconcile on `onEnd`.
  - Net behavior: after any store mutation, the rendered columns/tasks match the store with no manual refresh.
- `KanbanColumn` empty-state and `taskCount` MUST reflect the current task array immediately after a move in or out.

### FR-3 — Today quick-add gives feedback and reliably appears

- `apps/web/src/views/TodayView.vue` `submitQuickAdd`:
  - When there is no resolvable default column (`defaultColumnId` is null), MUST NOT silently return. Disable the quick-add input with a visible hint ("Create a board first to add today's tasks") or surface an inline error.
  - On success, the created task (`committed_on = today`) MUST appear in the Today list. Verify the client `today` (local `YYYY-MM-DD`) matches what `listToday(today)` filters on; if a mismatch is found, fix the date passed so the new row is included.
- After a successful add, `quickAddTitle` clears and the new row renders without manual refresh (the `today` store already reassigns `list`; confirm the reload uses the same `today`).

---

## Non-functional requirements

- **NFR-1** No backend changes. All existing API + web tests still pass.
- **NFR-2** `pnpm --filter @tasknote/web exec vite build` passes.
- **NFR-3** Drag-and-drop (column reorder + task move) still works on desktop after the fix — manually verify or cover with a test.
- **NFR-4** Each FR has a test that would FAIL before the fix and PASS after — specifically a test that mutates the store and asserts the **rendered DOM** updates (not just store state), since the existing tests assert store state and missed this entire class of bug.
- **NFR-5** No new runtime dependencies.

---

## Dependencies

- Touches only frontend: `currentBoard` store, `BoardView.vue`, `KanbanColumn.vue`, `TodayView.vue`.
- Reuses the single-reassignment pattern already in `stores/notes.ts` and `stores/today.ts`.

## Open questions

None blocking. Prefer FR-1 (reference-swapping store mutations) as the primary fix — it makes the existing shallow reference-watches in the views fire correctly and aligns with the project's established single-reassignment reactivity discipline. FR-2 then becomes verification + minimal cleanup rather than a rewrite.
