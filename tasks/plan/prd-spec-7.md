# PRD spec-7 — Board reactivity: mutations propagate without F5

Source: `tasks/specs/spec-7-board-reactivity.md`.

## BDD scenarios

### SCN-1 (FR-1) — Edit a task title reflects immediately
```
Given a board rendered with task A titled "Old"
When the user edits A's title to "New" (store.updateTask)
Then the board shows "New" without a page refresh
```

### SCN-2 (FR-1) — Create a task appears immediately
```
Given a board with column C showing 0 tasks ("No tasks" empty-state)
When the user adds task A to C (store.createTask)
Then A renders in C immediately
And the "No tasks" empty-state is gone
And no page refresh is needed
```

### SCN-3 (FR-1, FR-2) — Move a task updates both columns' empty-state
```
Given column C1 has task A (1 task), column C2 has 0 tasks ("No tasks")
When A is moved from C1 to C2 (store.moveTask)
Then C2 shows A and its "No tasks" empty-state is cleared
And C1 now shows the "No tasks" empty-state
And both update without a page refresh
```

### SCN-4 (FR-1) — Soft-delete removes the card immediately
```
Given column C shows task A
When the user archives A (store.softDeleteTask)
Then A disappears from C immediately
And if C is now empty the "No tasks" empty-state appears
```

### SCN-5 (FR-1) — Optimistic rollback restores prior render
```
Given a board rendered with task A in column C
And the move API will reject
When the user moves A and the API call fails
Then A returns to its original column/position in the rendered DOM
And an error toast is shown
```

### SCN-6 (FR-2) — Drag-and-drop still works after the fix
```
Given desktop board with columns [C1, C2, C3]
When the user drags C3 before C1 (useSortable onEnd → reorderColumns)
Then the column order updates and persists
And task drag between columns still moves tasks
```

### SCN-7 (FR-3) — Today quick-add with no default column shows feedback (no silent no-op)
```
Given the Today view and no resolvable default column (no default board)
When the user submits the quick-add
Then the quick-add is disabled or shows an inline hint to create a board first
And it does NOT silently do nothing
```

### SCN-8 (FR-3) — Today quick-add adds the task to the Today list
```
Given the Today view with a resolvable default column and today = local YYYY-MM-DD
When the user quick-adds "Standup task"
Then a task is created with committed_on = today
And it appears in the Today list immediately (same today used for reload)
And the quick-add input clears
```

---

## ICT tasks (ordered)

Estimate scale: S = ≤30 min, M = 30–90 min, L = 90+ min.

### Frontend (apps/web)

- **ICT-74 (M)** [FR-1] `stores/currentBoard.ts`: convert in-place mutations to reference-replacing ones in `createTask`, `updateTask`, `moveTask`, `softDeleteTask`, `addTag`, `removeTag`. Each affected `col.tasks` becomes a new array; `updateTask` replaces the task object via `.map`; `moveTask` builds new source/target arrays and reassigns. Preserve optimistic snapshot/rollback. Linked: SCN-1, SCN-2, SCN-3, SCN-4, SCN-5.

- **ICT-75 (M)** [FR-2] `features/board/BoardView.vue` + `features/board/KanbanColumn.vue`: ensure the rendered columns/tasks track the store after FR-1's reference swaps. Remove or correct the stale local-copy watches (`localColumns`, `localTasks`) so they re-sync on reference change; keep `useSortable` working (sortable bound to a ref that re-syncs; reconcile on `onEnd`). Verify `taskCount`/empty-state read live data. Linked: SCN-2, SCN-3, SCN-6.

- **ICT-76 (S)** [FR-3] `views/TodayView.vue` `submitQuickAdd`: replace the silent `if (!defaultColumnId.value) return` with a disabled state + visible hint when no default column; ensure success path uses the same `today` for create and reload so the new row appears. Linked: SCN-7, SCN-8.

### Tests

- **ICT-77 (M)** [NFR-4] DOM-level tests (mount the components, mutate the store, assert rendered output — the gap that let these bugs ship):
  - BoardView/KanbanColumn: after `updateTask`/`createTask`/`moveTask`/`softDeleteTask` the rendered DOM reflects the change without remount; empty-state toggles on move in/out (SCN-1..4); rollback re-renders original on API failure (SCN-5).
  - TodayView: quick-add disabled/hint when no default column (SCN-7); quick-add success adds row + clears input (SCN-8).
  - Keep/extend existing currentBoard + today store specs.
  Linked: SCN-1..5, SCN-7, SCN-8.

### Verification

- **ICT-78 (S)** [NFR-1,2,3] Full web test suite + `pnpm --filter @tasknote/web exec vite build`. Manually confirm (or test) DnD column reorder + task move still function (SCN-6). All green, no regressions. Linked: SCN-6, all NFR.

---

## Task counts

- Frontend: ICT-74..76 (3 tasks): 1 S, 2 M
- Tests: ICT-77 (1 task): 1 M
- Verification: ICT-78 (1 task): 1 S

**Total: 5 tasks** (S: 2, M: 3, L: 0)

Scenarios: 8
Requirements: 3 functional + 5 NFR = 8

## Execution order

ICT-74 (store fix, foundation) → ICT-75 (view sync, depends on 74) → ICT-76 (Today, independent of 74/75)
→ ICT-77 (tests, after 74/75/76) → ICT-78 (verify).
ICT-76 may run in parallel with ICT-74/75 (different file, independent bug).
