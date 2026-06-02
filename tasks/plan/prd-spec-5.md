# PRD spec-5 — Today lens, committed_on, carry-over

Source: `tasks/specs/spec-5-today-lens.md`.

## BDD scenarios

### SCN-1 (FR-1) — Migration adds committed_on column
```
Given the tasks table without a committed_on column
When the spec-5 migration up() runs
Then tasks has a nullable committed_on datetime column
And existing rows have committed_on = null
And migration down() drops the column cleanly
```

### SCN-2 (FR-2) — Commit a task to today
```
Given an open task with committed_on = null
And today is "2026-05-28"
When POST /tasks/:id/commit { today: "2026-05-28" } runs
Then the task committed_on is stored as 2026-05-28T12:00:00.000Z
And the response task reflects committed_on
```

### SCN-3 (FR-2) — Un-commit a task
```
Given a task with committed_on = "2026-05-20"
When DELETE /tasks/:id/commit runs
Then committed_on becomes null
And the task remains on its board/column unchanged
```

### SCN-4 (FR-2) — Today endpoint returns committed + carried, excludes done/archived
```
Given tasks:
  A committed_on=2026-05-28 open
  B committed_on=2026-05-26 open       (carried)
  C committed_on=2026-05-28 completed_at set
  D committed_on=2026-05-28 archived_at set
  E committed_on=null open
  F committed_on=2026-05-30 open       (future)
And today is "2026-05-28"
When GET /tasks/today?today=2026-05-28 runs
Then the result contains exactly A and B
And B has carried_days = 2
And A has carried_days = 0
And the result excludes C, D, E, F
And B sorts before A (carried first, oldest committed_on first)
```

### SCN-5 (FR-2) — Today endpoint validates the today param
```
Given the today endpoint
When GET /tasks/today is called with a missing or malformed today param ("garbage", "2026-13-40", "")
Then it responds 400 with code INVALID_TODAY
And no query for tasks is executed
```

### SCN-6 (FR-2) — committed_on is noon-UTC normalized, DST-safe
```
Given POST /tasks/:id/commit { today: "2026-06-15" }
And the server runs in any timezone
When the value is stored and read back
Then committed_on === 2026-06-15T12:00:00.000Z
And reading it as a calendar day yields "2026-06-15" in any client timezone
```

### SCN-7 (FR-3) — Quick-add from Today auto-commits
```
Given the user is on the Today view with today "2026-05-28"
When they quick-add a task "Fix flaky test"
Then a task is created with committed_on = 2026-05-28T12:00:00.000Z
And it appears in the Today list immediately with carried_days = 0
```

### SCN-8 (FR-3) — Quick-add from board does not auto-commit
```
Given the user is on a board view
When they quick-add a task
Then the created task has committed_on = null
And it does not appear in the Today list
```

### SCN-9 (FR-4) — Today view renders carried badge and sort order
```
Given the Today store holds [A carried_days=0, B carried_days=3]
When the Today view renders
Then B renders above A
And B shows a "carried 3d" badge
And A shows no carried badge
```

### SCN-10 (FR-4) — Today empty state
```
Given GET /tasks/today returns []
When the Today view renders
Then it shows the empty-state message and a quick-add affordance
And no list rows are rendered
```

### SCN-11 (FR-4) — Toggle done from Today removes the row
```
Given the Today view shows task A (open)
When the user toggles A done
Then A's completed_at is set via the existing task update path
And A is removed from the Today list without a full reload
And the Today store reassigns its list once (no per-item thrash)
```

### SCN-12 (FR-4) — Today store isolated from board store
```
Given the board store has tasks loaded for board 1
When the Today view loads GET /tasks/today
Then the board store's task state is untouched
And the Today list lives in its own store slice
```

### SCN-13 (FR-5) — Board card committed-today marker
```
Given a board with task A committed_on=today, task B committed_on=yesterday(open), task C committed_on=null
When the board renders with today known
Then A shows a "Committed today" marker (dot + aria-label)
And B shows the muted carried marker
And C shows no marker
And no card layout shift occurs
```

---

## ICT tasks (ordered)

Estimate scale: S = ≤30 min, M = 30–90 min, L = 90+ min.

### Backend (apps/api) — must land first (frontend consumes the API)

- **ICT-57 (S)** [FR-1] Add `committedOn: Date | null` (`name: 'committed_on'`) to `TaskEntity`. Linked: SCN-1.

- **ICT-58 (M)** [FR-1] New migration `<ts>-AddCommittedOn`: `up` runs `ALTER TABLE "tasks" ADD COLUMN "committed_on" DATETIME`; `down` drops it (SQLite: rebuild-table or guard). Add index on `committed_on`. Register in `app.module.ts` migrations array. Test up/down. Linked: SCN-1, NFR-5.

- **ICT-59 (S)** [FR-2] `packages/shared/src/dtos.ts`: add `committed_on: calendarOrIsoDateField.nullable().optional()` to both `CreateTaskDtoSchema` and `UpdateTaskDtoSchema`. Add `TodayQueryDtoSchema` ( `{ today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }` ) and `CommitTaskDtoSchema` ( `{ today: same regex }` ). Export types. Linked: SCN-2, SCN-5.

- **ICT-60 (M)** [FR-2] `tasks.service.ts`: in `createTask`/`updateTask` normalize `committed_on` via existing `normalizeDueDate` (rename mentally to a shared `normalizeCalendarDay` if cleaner — keep one helper). Add `commit(id, today)`, `uncommit(id)`, and `listToday(today)`. `listToday` query: `committed_on IS NOT NULL AND committed_on <= noon(today) AND completed_at IS NULL AND archived_at IS NULL`, order `committed_on ASC, position ASC`, map each row to include derived `carried_days` (whole days between `committed_on` and `today`). Linked: SCN-2, SCN-3, SCN-4, SCN-6.

- **ICT-61 (S)** [FR-2] `tasks.controller.ts`: add `GET /tasks/today` (validate `today` query → 400 `INVALID_TODAY`), `POST /tasks/:id/commit`, `DELETE /tasks/:id/commit`. Wire to service. Linked: SCN-4, SCN-5.

- **ICT-62 (M)** [FR-2] `tasks.service.spec.ts` + controller spec: cover SCN-2..6 — commit/uncommit, today filter (carried/done/archived/future/null exclusions), carried_days math, noon-UTC normalization, 400 on bad `today`. Linked: SCN-2..6.

### Frontend (apps/web) — after backend

- **ICT-63 (M)** [FR-4] New Pinia store slice `stores/today.ts`: `list` ref, `loadToday(today)`, `commit(id, today)`, `uncommit(id)`, `toggleDone(id)`. Single list reassignment on mutation (mirror notes store pattern, spec-4 FR-3). API client methods for the three new endpoints. Linked: SCN-11, SCN-12.

- **ICT-64 (M)** [FR-4] `views/TodayView.vue` + route `/today` (name `today`) + sidebar entry above Boards. Flat list rows (title, board/column label, priority dot, due chip, tag dots, carried badge). Carried-first sort. Empty state with quick-add affordance. Row actions: toggle done, open TaskDrawer, un-commit. Compute `today` from client local calendar day. Linked: SCN-9, SCN-10, SCN-11.

- **ICT-65 (S)** [FR-3] Quick-add: when invoked from Today view, pass `committed_on = today` to create. From board, leave null (add optional "commit to today" toggle). Linked: SCN-7, SCN-8.

- **ICT-66 (S)** [FR-5] `TaskCard.vue`: add committed-today marker (dot + `aria-label="Committed today"`) when `committed_on === today`; muted marker when `committed_on < today` and open; nothing otherwise. Board passes `today` down. No layout shift. Linked: SCN-13.

- **ICT-67 (M)** [FR-4] Frontend tests: today store (load, commit/uncommit, toggle-done single-reassign, isolation from board store) + TodayView (carried badge, sort, empty state) + TaskCard marker. Linked: SCN-9..13.

### Verification

- **ICT-68 (S)** [NFR-1,2] Run migration up on a fresh DB, full API + web test suites, both builds. All pass; no regressions. Linked: all NFR.

---

## Task counts

- Backend: ICT-57..62 (6 tasks): 3 S, 3 M
- Frontend: ICT-63..67 (5 tasks): 2 S, 3 M
- Verification: ICT-68 (1 task): 1 S

**Total: 12 tasks** (S: 6, M: 6, L: 0)

Scenarios: 13
Requirements: 5 functional + 6 NFR = 11

## Execution order

ICT-57 → ICT-58 → ICT-59 → ICT-60 → ICT-61 → ICT-62 (backend chain)
then ICT-63 → ICT-64 → ICT-65 → ICT-66 → ICT-67 (frontend; 63 before 64; 65/66 parallel after 64)
then ICT-68 (verify).
