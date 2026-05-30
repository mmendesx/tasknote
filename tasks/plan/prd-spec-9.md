# PRD spec-9 — Today "Done" → Done column, + fix column-move duplicate

Source: `tasks/specs/spec-9-today-complete-moves-to-done.md`.

## Summary
Two fixes. (1) Completing a task from the Today list moves it to the board's Done column (matching board drag-to-Done), instead of only setting `completed_at` and leaving the card in its original column. (2) Moving a task between columns currently shows a duplicate that only resolves on F5 — root-cause the leaking path (board DnD revert or modal column-select) and fix it with a regression test.

## Behavior scenarios

### Feature: Today completion moves to Done column

#### Scenario: complete moves task to Done column + sets completed_at (SCN-1)
  Given a board with a Done column (isDone=true) and a task in "Doing"
  When tasks.service.complete(taskId) runs
  Then the task's column_id becomes the Done column's id
  And completed_at is set
  And the task is appended at the end of the Done column

#### Scenario: complete with no Done column falls back (SCN-2)
  Given a board whose columns are all isDone=false
  When complete(taskId) runs
  Then completed_at is set
  And the task stays in its current column
  And a warning is logged, no error thrown

#### Scenario: completing an already-done task is idempotent (SCN-3)
  Given a task already in the Done column with completed_at set
  When complete(taskId) runs again
  Then the task stays in the Done column with completed_at set
  And no duplicate position / no error

#### Scenario: uncomplete moves task out of Done (SCN-4)
  Given a completed task in the Done column
  When uncomplete(taskId) runs
  Then completed_at becomes null
  And the task moves to the lowest-position non-done column

#### Scenario: uncomplete on a non-Done task just clears completed_at (SCN-5)
  Given a task with completed_at set sitting in a non-done column
  When uncomplete(taskId) runs
  Then completed_at becomes null
  And the task does not move

#### Scenario: Today drops it, board shows it in Done (SCN-6)
  Given a task committed to today, shown in the Today list
  When the user clicks "Done"
  Then the task disappears from the Today list
  And on board load the task is in the Done column with the done mark

### Feature: column move shows one card, not a duplicate

#### Scenario: drag to another column leaves one card, no F5 (SCN-7)
  Given a board with task A in "Backlog"
  When the user drags A into "Doing"
  Then "Doing" shows exactly one A and "Backlog" shows none
  And this is true immediately, without a page refresh

#### Scenario: drag into an empty column leaves one card (SCN-8)
  Given task A in "Backlog" and an empty "Doing" column
  When A is dragged into "Doing"
  Then "Doing" shows exactly one A (not two)
  And no F5 is needed

#### Scenario: modal column-select move leaves one card (SCN-9)
  Given the task modal open on task A (in "Backlog")
  When the user selects "Done" in the modal's Column control
  Then A appears once in "Done" and is gone from "Backlog"
  And the board reflects this without a refresh

#### Scenario: regression test fails before / passes after (SCN-10)
  Given the leaking move path identified by reproduction
  When the fix is applied
  Then a test at that layer fails on the pre-fix code and passes after

## Tasks

### ICT-87: Extract Done-column resolver helper
- **What**: Private helper in `tasks.service.ts` resolving a board's Done column from a task (task → columnId → ColumnEntity.boardId → first `isDone=true` column by position; null if none). Reuse existing completedAt-on-done semantics; keep `moveTask` identical.
- **Where**: `apps/api/src/modules/tasks/tasks.service.ts`
- **Validated by**: SCN-1, SCN-2, SCN-4
- **Estimate**: S

### ICT-88: complete() moves task to Done column
- **What**: Transaction — resolve Done column; if found move task there (append position) + set completedAt; else set completedAt only + warn. Idempotent when already in Done.
- **Where**: `apps/api/src/modules/tasks/tasks.service.ts`
- **Validated by**: SCN-1, SCN-2, SCN-3
- **Estimate**: M

### ICT-89: uncomplete() moves task out of Done
- **What**: Transaction — clear completedAt; if in a Done column move to lowest-position non-done column; else just clear.
- **Where**: `apps/api/src/modules/tasks/tasks.service.ts`
- **Validated by**: SCN-4, SCN-5
- **Estimate**: M

### ICT-90: Backend completion tests
- **What**: Extend `tasks.service.spec.ts` for SCN-1..5 using the real-sqlite seed pattern.
- **Where**: `apps/api/src/modules/tasks/tasks.service.spec.ts`
- **Validated by**: SCN-1..5
- **Estimate**: M

### ICT-91: Root-cause + fix column-move duplicate
- **What**: Reproduce (count cards per column before vs after F5 — duplicate before, correct after = the bug) to identify the leaking path: board DnD revert (`KanbanColumn.vue` `onEnd` — verify revert fires for non-empty target, empty target, mid-index drop; `localTasks` resyncs from `props.column.tasks`) and/or modal move (`TaskDrawer.vue` `onColumnChange` → store `moveTask`). Fix the specific path so a moved task renders exactly once with no F5.
- **Where**: `apps/web/src/features/board/KanbanColumn.vue`, `apps/web/src/features/board/TaskDrawer.vue`, `apps/web/src/stores/currentBoard.ts`
- **Validated by**: SCN-7, SCN-8, SCN-9
- **Estimate**: M

### ICT-92: Column-move regression test
- **What**: Test at the leaking layer that fails pre-fix, passes post-fix (KanbanColumn DnD revert test like spec-7 SCN-D5 for the uncovered drop case, and/or a store/DOM test for the modal move). Mirror existing `dragDrop.spec.ts` patterns.
- **Where**: `apps/web/src/features/board/__tests__/`
- **Validated by**: SCN-10, SCN-7, SCN-8, SCN-9
- **Estimate**: S

### ICT-93: Verification
- **What**: Full API + web suites green; both builds. Manual/Playwright: Today Done → task in Done column (SCN-6); move task drag + modal → single card no F5 (SCN-7..9).
- **Where**: repo-wide
- **Validated by**: SCN-6, all NFR
- **Estimate**: S

## Open questions
- uncomplete target column: first `isDone=false` column by position (Backlog). Restoring exact prior column out of scope.
- FR-4: the exact leaking path is TBD until reproduction in ICT-91 — both board-drag and modal-move paths are in scope; fix whichever leaks (possibly both).

## Dependencies
- FR-1/2/3 backend-only; FR-4 frontend. No migration. Endpoints unchanged.

---

## Task counts
- Backend: ICT-87..90 (4): 1 S, 3 M
- Frontend: ICT-91..92 (2): 1 M, 1 S
- Verification: ICT-93 (1): 1 S

**Total: 7 tasks** (S: 3, M: 4, L: 0)
Scenarios: 10
Requirements: 4 functional + 5 NFR = 9

## Execution order
ICT-87 → ICT-88 → ICT-89 → ICT-90 (backend chain) ∥ ICT-91 → ICT-92 (frontend) → ICT-93 (verify).
Backend and frontend threads are independent — can run in parallel.
