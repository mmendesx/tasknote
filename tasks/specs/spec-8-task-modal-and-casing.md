# spec-8 — Task modal + serialization casing fix + priority chips

**Source**: user bug report on the task create/edit surface, plus a systemic root cause found while reproducing.

Three threads:
1. **Bug (systemic)** — API serializes tasks in camelCase; the shared `Task` contract + all frontend reads use snake_case. Saved `due_date` / `column_id` silently read as `undefined` in the edit drawer (DatePicker blank, Column select empty). `priority` happens to work only because the key is identical in both casings.
2. **Feature** — convert the task create/edit surface from a side Drawer to a centered modal Dialog.
3. **Feature** — replace the priority `<Select>` dropdown with clickable, color-coded priority chips.

---

## Root cause (verified live)

- `TaskEntity` uses TS property names `columnId`, `dueDate`, `committedOn`, `descriptionMd`, `archivedAt`, `completedAt`, `createdAt`, `updatedAt` (DB columns are snake via `name:`). NestJS returns the **raw entity** — no `ClassSerializerInterceptor`, no DTO mapping — so every task endpoint emits **camelCase** JSON.
- `packages/shared/src/entities.ts` `Task` declares **snake_case** (`column_id`, `due_date`, …). All frontend code reads snake_case.
- Result: `GET /api/tasks/:id` returns `{ columnId, dueDate, … }`; the drawer reads `t.due_date` / `t.column_id` → `undefined`. Confirmed: a task with `due=2026-06-15`, `column=2` shows "Pick a date" and an empty Column select. `priority: 'high'` shows correctly (same key both ways).
- Board task cards have the same latent bug (`TaskCard` reads `props.task.due_date` → undefined → due chip never renders) — masked because it just looks like "no due date".
- `boards.service` already bolts `tag_ids` (snake) onto the camelCase task objects — proof the contract is already inconsistent.

**Fix layer decision**: normalize at the **API boundary** so the shared snake_case `Task` stays the single contract and every consumer (drawer, cards, today, search) is fixed at once. A global response interceptor that recursively converts object keys camelCase → snake_case is the smallest, most complete fix. (Per-endpoint DTO mapping is more code and easy to miss a field — the interceptor cannot drift.) Requests already arrive snake_case and are validated by Zod DTOs; only responses need normalizing.

---

## Functional requirements

### FR-1 — API responses are snake_case (systemic casing fix)

- Add a global NestJS response interceptor (e.g. `SnakeCaseInterceptor`) registered app-wide that recursively maps response object keys from camelCase to snake_case before send.
- After this, `GET /tasks/:id`, `GET /boards/:id` (nested tasks/columns), `GET /tasks/today`, search, etc. all emit snake_case matching the shared `Task`/`Note`/etc. contracts.
- Keys already snake (`tag_ids`) stay snake (idempotent). Nested arrays/objects handled recursively. Dates remain ISO strings.
- MUST NOT alter request parsing (Zod DTOs already snake_case) — interceptor is response-only.
- Verify no double-mapping or key collision (e.g. an all-lowercase key maps to itself).

### FR-2 — Edit form shows saved values

- After FR-1, opening an existing task populates: title, description, **priority**, **due date** (DatePicker shows the saved day), **current column** (Column select shows the task's column and is changeable).
- `TaskDrawer`/details watcher reads `t.due_date` / `t.column_id` — now defined. Keep the noon-UTC `.slice(0,10)` convention for the date.

### FR-3 — Column select works

- The Column control shows the task's current column as selected and, on change, moves the task (existing `moveTask` path). Driven by the now-populated `column_id`.

### FR-4 — Task surface is a centered modal Dialog

- Replace the side `Drawer` with the existing `Dialog` (`packages/ui/src/components/Dialog.vue`) for both create and edit.
- Create mode: single form (title, description, priority chips, column, due date) + Cancel / Save footer.
- Edit mode: keep the details / notes / files tabs and the Discard / Save footer.
- Centered, focus-trapped, Escape-to-close, backdrop. Same fields and behavior as today — only the container changes.
- Board "Add task" and task-card open both target the modal.

### FR-5 — Priority chips

- Replace the priority `<Select>` with a row of clickable chips (`packages/ui/src/components/Chip.vue`) for Low / Medium / High / Urgent, in both create and edit.
- Selected chip is visually active; click selects (single-select, radio semantics, keyboard accessible).
- Color-code by priority (reuse existing priority color tokens used on cards).

---

## Non-functional requirements

- **NFR-1** No new runtime dependencies (Dialog + Chip already in `@tasknote/ui`).
- **NFR-2** All existing API + web tests pass; new behavior covered by tests. Add an interceptor unit test (camel→snake, nested, idempotent, arrays).
- **NFR-3** `pnpm --filter @tasknote/api build` + `pnpm --filter @tasknote/web exec vite build` pass.
- **NFR-4** Noon-UTC date convention preserved end to end.
- **NFR-5** Accessibility: modal focus trap + Escape; priority chips are a keyboard-navigable radio group; Column select labeled.
- **NFR-6** No regression to board cards, today view, search — they consume the same now-snake_case responses (in fact FR-1 fixes their latent due-date bug too).

---

## Dependencies

- `Dialog.vue`, `Chip.vue` already exist in `@tasknote/ui`.
- FR-2/3 depend on FR-1 (casing) landing first.
- Touch: `apps/api` (interceptor + registration), `apps/web` TaskDrawer→modal, TaskDetailsTab (chips + column), create form (chips).

## Open questions

None blocking. Interceptor (global, response-only) chosen over per-DTO mapping for completeness and drift-resistance.
