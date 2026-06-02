# spec-5 — Today lens, committed_on, carry-over

**Source**: product brainstorm. Job-to-be-done: *"When dailies/standup throw action items at me, I want to capture them fast outside Jira and have them resurface until done, so I don't forget the small stuff that isn't worth a Jira card."*

The board stays the primary mental model. This feature adds a **Today lens** — a flat, day-shaped view over existing board tasks — plus a `committed_on` date that drives what shows up, and **carry-over** so unfinished commitments follow the user forward instead of being buried.

---

## Goals

1. Add a `committed_on` calendar-day field to tasks (distinct from `due_date`).
2. Mark a task "committed today" with one action; tasks created via quick-add during the day auto-commit to today.
3. A **Today view** listing all tasks committed for today (or earlier and still open) across every board/column, with carried-over items badged.
4. Carry-over: an open task whose `committed_on` is before today still appears in Today, flagged as carried, with a day-count.
5. Board view surfaces a subtle "committed today" marker on cards (read-only bleed-through; board layout unchanged).

Out of scope:
- Notifications / OS-level nudges (local app; deferred).
- Recurring tasks / templates.
- Team sharing, multi-user.
- Changing the Kanban board paradigm.
- Notes feature changes — note↔task linking already exists and is reused as-is.

---

## Domain model

### `committed_on` semantics

- Type: calendar day (`YYYY-MM-DD`), nullable. Stored noon-UTC normalized (`${day}T12:00:00.000Z`) to match existing `due_date` DST-safe convention (spec-4 FR-1).
- `committed_on = null` → task not on any day's list (pure backlog).
- `committed_on = today` → shows in Today as a fresh commitment.
- `committed_on < today` AND task open (`completed_at IS NULL AND archived_at IS NULL`) → shows in Today as **carried over**, badge `carried Nd` where N = whole days between `committed_on` and today.
- `committed_on` is independent of `due_date`. Due = deadline. Committed = "I said I'd work on this on this day." A task can have either, both, or neither.

### "Open" definition

A task is open when `completed_at IS NULL AND archived_at IS NULL`. Completed or archived tasks never appear in Today regardless of `committed_on`.

### Carry-over mechanism

**Lazy, query-time** — no cron, no midnight job (local app may be closed at midnight).
- Today view query: `committed_on IS NOT NULL AND committed_on <= :today AND completed_at IS NULL AND archived_at IS NULL`.
- "Today" boundary computed from the client's local calendar day, passed to the API as a `YYYY-MM-DD` query param (`?today=2026-05-28`), so the server does not guess timezone. Server validates the param shape.
- Carried items are simply those with `committed_on < today`. No data mutation happens on read.

---

## Functional requirements

### FR-1 — `committed_on` column + migration

- Add `committed_on` (`datetime`, nullable, default null) to `tasks` table via a **new TypeORM migration** (project uses `migrationsRun: true`, `synchronize: false` — a migration is mandatory; do not rely on synchronize).
- Add `committedOn: Date | null` to `TaskEntity` (`name: 'committed_on'`).
- Migration must be additive and reversible (`up` adds column, `down` drops it). Existing rows get `null`.

### FR-2 — DTO + API surface

- `UpdateTaskDto` accepts optional `committed_on` using the existing `calendarOrIsoDateField` union (raw `YYYY-MM-DD` or full ISO), normalized to noon-UTC server-side exactly like `due_date`. `null` clears it.
- `CreateTaskDto` accepts optional `committed_on` (same field) so quick-add can stamp it at creation.
- New endpoint: `GET /tasks/today?today=YYYY-MM-DD` → returns open tasks where `committed_on <= today`, ordered by `committed_on ASC, position ASC`. Each item includes the existing task shape plus a derived `carried_days: number` (0 when committed today, >0 when carried). The `today` param is required and validated (`400 INVALID_TODAY` on bad/missing).
- New convenience endpoint: `POST /tasks/:id/commit` body `{ today: 'YYYY-MM-DD' }` → sets `committed_on = today` (noon-UTC). `DELETE /tasks/:id/commit` → sets `committed_on = null`. Both return the updated task. (Could be folded into PATCH, but a dedicated route keeps the quick-toggle intent explicit and is cheaper to call from a button.)

### FR-3 — Quick-add auto-commit

- Existing quick-add (ICT-20) gains an opt-in: when the quick-add is opened from the **Today view**, the created task is stamped `committed_on = today` automatically.
- When quick-add is opened from a board, behavior unchanged (`committed_on` stays null) unless the user explicitly toggles "commit to today".

### FR-4 — Today view (frontend)

- New route `/today`, name `today`, sidebar entry above Boards (it is the daily landing surface).
- Lists open committed tasks as a flat, scannable list (not Kanban). Each row: title, source column/board label, priority dot, due-date chip if set, tag dots, and a **carried badge** (`carried 2d`) when `carried_days > 0`.
- Empty state: friendly "Nothing committed for today — add something from standup." with a quick-add affordance.
- Each row supports: toggle done (sets `completed_at`, drops it from the list), open task drawer (reuse existing TaskDrawer), un-commit (removes from today, keeps task on its board).
- Carried items sort to the top (oldest `committed_on` first) so stale commitments are confronted, not hidden.
- A Pinia `today` store (or a scoped slice) holds the Today list independently of the board store, mirroring the `notes` store's `byTask`-vs-`globalList` split so loading Today does not clobber board state.

### FR-5 — Board "committed today" marker

- On the board, a task card whose `committed_on === today` shows a small, accessible marker (dot + `aria-label="Committed today"`). Read-only; no layout shift, no new interaction. Carried (`< today`) cards may use a distinct muted marker. Empty/no-commit cards show nothing.

---

## Non-functional requirements

- **NFR-1** All existing tests pass; no regressions. New behavior is covered by tests (backend service + endpoint, frontend store + Today view, migration up/down).
- **NFR-2** `pnpm --filter @tasknote/api build` + `pnpm --filter @tasknote/web exec vite build` both pass.
- **NFR-3** No new runtime dependencies.
- **NFR-4** All date handling reuses the noon-UTC normalization helper from spec-4; no new date-parsing logic that could reintroduce DST day-flip.
- **NFR-5** Today query is a single indexed scan. Add an index on `committed_on` (partial/plain) to keep it cheap as task count grows.
- **NFR-6** Carry-over is read-time only — no background mutation, safe when the app is closed across midnight.

---

## Dependencies

- Reuses `calendarOrIsoDateField` (spec-4), noon-UTC normalization, TaskDrawer, quick-add (ICT-20), notes↔task link, sidebar + router patterns.
- New DB migration appended to the migrations array in `app.module.ts` (alongside `Initial1700000000000`).

---

## Open questions

None blocking. Defaults chosen:
- Trigger model = **standup-capture driven** (quick-add from Today auto-commits) + manual toggle on cards. Due-date is NOT auto-treated as commitment (a deadline next week is not "today's work").
- Carry-over is lazy/query-time, not a scheduled job.
