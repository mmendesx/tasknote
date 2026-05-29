# PRD spec-8 — Task modal + serialization casing fix + priority chips

Source: `tasks/specs/spec-8-task-modal-and-casing.md`.

## BDD scenarios

### SCN-1 (FR-1) — getTask returns snake_case
```
Given a task with column_id=2, due_date 2026-06-15, description set
When GET /api/tasks/:id resolves
Then the JSON has keys column_id, due_date, description_md, archived_at,
  completed_at, committed_on, created_at, updated_at (snake_case)
And NO camelCase keys (columnId, dueDate, …) are present
```

### SCN-2 (FR-1) — nested board response is snake_case
```
Given GET /api/boards/:id with columns and tasks
When it resolves
Then nested column and task objects use snake_case keys
And tag_ids stays tag_ids (already snake, idempotent)
```

### SCN-3 (FR-1) — interceptor maps recursively + idempotently
```
Given the SnakeCaseInterceptor
When it maps { columnId: 1, nested: { dueDate: 'x' }, list: [{ taskId: 3 }], tag_ids: [1] }
Then it yields { column_id: 1, nested: { due_date: 'x' }, list: [{ task_id: 3 }], tag_ids: [1] }
And mapping an already-snake object returns it unchanged
And arrays, null, and primitive values pass through correctly
```

### SCN-4 (FR-1) — requests still parse (response-only)
```
Given a POST /api/tasks with snake_case body { column_id, due_date }
When the interceptor is active
Then the request is still validated and created normally
And only the response is snake-cased
```

### SCN-5 (FR-2) — edit modal shows saved values
```
Given a task with priority high, due 2026-06-15, column "Doing"
When the edit modal opens
Then title/description are populated
And the priority "High" chip is active
And the DatePicker shows Jun 15, 2026
And the Column control shows "Doing" selected
```

### SCN-6 (FR-3) — column change moves the task
```
Given the edit modal open on a task in "Doing"
When the user selects "Done" in the Column control
Then boardStore.moveTask is called for that task → Done
And the board reflects the move
```

### SCN-7 (FR-4) — task surface is a centered modal
```
Given the board
When the user clicks "Add task" or a task card
Then a centered modal Dialog opens (not the side drawer)
And Escape / backdrop closes it, focus is trapped
And create shows the single form; edit shows details/notes/files tabs
```

### SCN-8 (FR-5) — priority chips select
```
Given the task form (create or edit)
When the user clicks the "Urgent" priority chip
Then "Urgent" becomes the active chip (others inactive)
And the task saves with priority urgent
And chips are keyboard-navigable with radio semantics
```

### SCN-9 (FR-5) — priority chips reflect saved value
```
Given an edit modal on a task with priority medium
When it opens
Then the "Medium" chip is rendered active and the others inactive
```

### SCN-10 (NFR-6) — board card due chip now renders
```
Given a task with due_date 2026-06-15 on the board
When the card renders (responses now snake_case)
Then the due-date chip shows (previously blank due to camelCase mismatch)
```

---

## ICT tasks (ordered)

Estimate scale: S = ≤30 min, M = 30–90 min, L = 90+ min.

### Backend (apps/api) — land first; everything else depends on snake_case responses

- **ICT-79 (M)** [FR-1] Create `apps/api/src/common/interceptors/snake-case.interceptor.ts`: a NestJS `NestInterceptor` that maps the response stream's object keys camelCase→snake_case recursively (objects + arrays; pass through null/primitives/Date-as-string; idempotent on snake keys). Register globally (APP_INTERCEPTOR in app.module or `app.useGlobalInterceptors` in main.ts). Response-only. Linked: SCN-1, SCN-2, SCN-3, SCN-4.

- **ICT-80 (S)** [FR-1] Unit test `snake-case.interceptor.spec.ts`: pure key-mapping fn — camel→snake, nested objects, arrays of objects, idempotent snake, null/primitive passthrough, tag_ids unchanged. Linked: SCN-3.

- **ICT-81 (S)** [FR-1] Integration assertion: extend tasks.controller.spec (or a small e2e-style test) to assert `getTask` output keys are snake_case and no camelCase leaks; assert board nested tasks snake_case. Linked: SCN-1, SCN-2.

### Frontend (apps/web) — after backend

- **ICT-82 (S)** [FR-5] Priority chips component/usage: build a reusable priority-chip selector (using `@tasknote/ui` Chip) — Low/Medium/High/Urgent, single-select radio semantics, color-coded by priority token, keyboard accessible. Linked: SCN-8, SCN-9.

- **ICT-83 (L)** [FR-4] Convert `TaskDrawer.vue` → centered modal using `@tasknote/ui` Dialog. Preserve: create-mode single form, edit-mode details/notes/files tabs, footers (Cancel/Save, Discard/Save). Wire priority chips (ICT-82) in both modes replacing the Select. Keep all existing save/discard/move/archive logic. Update the board "Add task" + card-open call sites if the component API changes. Linked: SCN-7, SCN-8.

- **ICT-84 (M)** [FR-2, FR-3] With snake_case responses, verify + fix field population in the modal: title/desc/priority chip/due date/column all show saved values; Column select shows current + change → moveTask. Fix any remaining read that still assumed a different shape. Linked: SCN-5, SCN-6, SCN-9.

- **ICT-85 (M)** [NFR-2] Frontend tests: priority chip select + reflects saved value (SCN-8, SCN-9); modal opens centered, edit populates date/column/priority (SCN-5); column change calls moveTask (SCN-6); board card due chip renders with snake_case task (SCN-10). Update any test asserting the old Drawer/Select selectors. Linked: SCN-5..10.

### Verification

- **ICT-86 (S)** [NFR-2,3] Full API + web suites green; both builds pass. Manual/Playwright pass: open a task → date+column+priority populated; Add task → modal; pick priority chip; save. Linked: all NFR.

---

## Task counts

- Backend: ICT-79..81 (3 tasks): 2 S, 1 M
- Frontend: ICT-82..85 (4 tasks): 1 S, 2 M, 1 L
- Verification: ICT-86 (1 task): 1 S

**Total: 8 tasks** (S: 4, M: 3, L: 1)

Scenarios: 10
Requirements: 5 functional + 6 NFR = 11

## Execution order

ICT-79 → ICT-80 → ICT-81 (backend casing chain)
→ ICT-82 (chips, independent) → ICT-83 (modal, uses 82) → ICT-84 (populate, needs 79 + 83)
→ ICT-85 (tests) → ICT-86 (verify).
ICT-82 can start in parallel with the backend chain (no dependency).
