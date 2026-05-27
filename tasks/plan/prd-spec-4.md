# PRD spec-4 — Review follow-ups

Source: `tasks/specs/spec-4-review-followups.md`.

## BDD scenarios

### SCN-1 (FR-1) — TaskCard formats raw YYYY-MM-DD without day-flip
```
Given a Task with due_date "2026-06-15" (raw calendar day, no time component)
And the user's local timezone is UTC-5
When TaskCard formatDueDate renders the value
Then the displayed text is "Jun 15"
And NOT "Jun 14"
```

### SCN-2 (FR-1) — TaskCard formats full-ISO due_date without day-flip
```
Given a Task with due_date "2026-06-15T12:00:00.000Z"
And the user's local timezone is UTC-5
When TaskCard formatDueDate renders the value
Then the displayed text is "Jun 15"
```

### SCN-3 (FR-2) — TaskCard tags container has role=group + aria-label
```
Given a TaskCard rendered with tags ["urgent", "frontend"]
When a screen reader inspects the .task-card__tags element
Then it has role="group"
And aria-label="Tags: urgent, frontend"
And each tag-dot span has aria-hidden="true"
```

### SCN-4 (FR-2) — TaskCard with zero tags renders no group
```
Given a TaskCard rendered with tags []
When the DOM is inspected
Then no element with role="group" + tags aria-label is rendered
```

### SCN-5 (FR-3) — Notes store update assigns Map once
```
Given notes store with byTask = Map { 1: [n1, n2], 2: [n3] }
And n1.task_id = 1, n3.task_id = 2
When notesStore.update(n1.id, { title: 'X' }) resolves
Then byTask has been reassigned to a new Map instance exactly once
And byTask.get(1) reflects the updated n1
And byTask.get(2) is untouched
```

### SCN-6 (FR-4) — Board removal issues 2 batched file_refs deletes
```
Given a board with 1 column, 3 tasks (each with a file_ref), and 2 notes (each with a file_ref)
When boards.service.removeBoard(boardId) runs
Then exactly TWO file_refs DELETE statements are executed:
  - DELETE FROM file_refs WHERE target_type='task' AND target_id IN (id1, id2, id3)
  - DELETE FROM file_refs WHERE target_type='note' AND target_id IN (id4, id5)
And the file_refs table is empty for those targets after commit
```

### SCN-7 (FR-4) — Board removal with zero descendants no-ops batch delete
```
Given a board with zero columns
When boards.service.removeBoard(boardId) runs
Then FileRefsService.deleteAllForBatch is not called (no-op on empty id list)
And no SQL DELETE is issued for file_refs
```

### SCN-8 (FR-5) — Admin table-delete order derived from allowlist
```
Given COLUMN_ALLOWLISTS keys = [boards, columns, tasks, notes, tags, task_tags, file_refs, settings]
When admin.service module loads
Then DELETE_ORDER length equals COLUMN_ALLOWLISTS key count
And every key in COLUMN_ALLOWLISTS appears in DELETE_ORDER exactly once
```

### SCN-9 (FR-5) — Admin reset deletes child tables before parents
```
Given a populated DB
When admin.service.resetAll() runs
Then DELETE statements fire in DELETE_ORDER:
  task_tags → file_refs → notes → tasks → tags → columns → boards → settings
And no FK constraint violation occurs
```

---

## ICT tasks (ordered)

Estimate scale: S = ≤30 min, M = 30–90 min, L = 90+ min.

### Frontend (apps/web)

- **ICT-49 (S)** [FR-1] `TaskCard.vue`: rewrite `formatDueDate` to use `slice(0, 10) + 'T12:00:00Z'`. Add unit test (or component test) covering raw YYYY-MM-DD and ISO inputs across a fake UTC-5 environment. Linked: SCN-1, SCN-2.

- **ICT-50 (S)** [FR-2] `TaskCard.vue`: add `role="group"` to `.task-card__tags`. Add `v-if` guard so the wrapper element only renders when tags exist. Linked: SCN-3, SCN-4.

- **ICT-51 (M)** [FR-3] `apps/web/src/stores/notes.ts`: in `update`, `softDelete`, `restore`, and any per-slot loop, accumulate changes in a local Map and assign `byTask.value = newMap` once at end. Add a Pinia unit test that spies on Map identity reassignment count. Linked: SCN-5.

### Backend (apps/api)

- **ICT-52 (M)** [FR-4] `FileRefsService`: add `deleteAllForBatch(targetType, targetIds, manager?)` using `IN (...)` with parameterized array. No-op when array empty. Linked: SCN-6, SCN-7.

- **ICT-53 (M)** [FR-4] `boards.service.ts` `removeBoard`: collect descendant task IDs and note IDs upfront, call `deleteAllForBatch` twice (once for tasks, once for notes). Replace per-entity `deleteAllFor` loops. Tests: extend `boards.service.spec.ts` to assert batch delete + zero-descendants no-op. Linked: SCN-6, SCN-7.

- **ICT-54 (S)** [FR-5] `admin.service.ts`: introduce `DELETE_ORDER` constant referencing `COLUMN_ALLOWLISTS` keys; add module-load assertion (`if (DELETE_ORDER.length !== Object.keys(COLUMN_ALLOWLISTS).length) throw ...`); replace any hard-coded delete-loop with `for (const tbl of DELETE_ORDER) ...`. Linked: SCN-8, SCN-9.

- **ICT-55 (S)** [FR-5] Extend `admin.service.spec.ts`: assert delete order matches DELETE_ORDER; assert allowlist drift (add fake key, expect module assert to fire). Linked: SCN-8, SCN-9.

### Verification

- **ICT-56 (S)** Run `pnpm --filter @tasknote/api build`, `pnpm --filter @tasknote/web exec vite build`, full test suite. All pass.

---

## Task counts

- Frontend: ICT-49..51 (3 tasks): 2 S, 1 M
- Backend: ICT-52..55 (4 tasks): 2 S, 2 M
- Verification: ICT-56 (1 task): 1 S

**Total: 8 tasks** (S: 5, M: 3, L: 0)

Scenarios: 9
Requirements: 5 functional + 4 NFR = 9
