# Spec: Today page (TodayView) UI/UX redesign

## Overview
The Today page (`/today`, `TodayView.vue`) is the daily working surface where committed tasks for the day are listed, quick-added, completed, and removed. Its current UI has gaps — no real header, a raw ISO date, duplicated quick-add markup, an unrendered error state, a hardcoded non-theme button color, no loading skeleton, and raw/un-formatted task metadata. This spec defines a full redesign for a calm, comfortable daily experience, reusing the existing design tokens and `@tasknote/ui` primitives and matching the conventions established by the recently-redesigned Notes feature — while preserving every behavior locked by existing tests and prior specs (spec-5, spec-9).

## Actors
- **IC / developer (primary user):** opens Today each morning, quick-adds tasks, marks them done, removes mis-committed ones, undoes a mistaken completion.
- **Screen-reader user:** must perceive state changes (loading, errors, completion/removal) via live regions and correct labels.
- **`useTodayStore` (Pinia):** owns `list`, `loading`, `error`, and the `loadToday` / `commit` / `uncommit` / `toggleDone` actions (plus a new restore action, see FR-9).

## Functional requirements

### FR-1: Page header with heading, human-readable date, and task count
The page shows a real heading ("Today"), the current date formatted human-readably (e.g. "Friday, June 19" via `Intl.DateTimeFormat`, not the raw `YYYY-MM-DD` string), and a task-count summary that reflects the list (e.g. "3 tasks · 1 carried over", correctly singular/plural, and a distinct phrasing when the list is empty). The count summary is the page's polite live-region (`aria-live="polite"`) so the count is announced as it changes.

### FR-2: Single, deduplicated quick-add
There is exactly one quick-add control (one `<input>` + one primary button), rendered once and reused across empty and populated states (no duplicated markup or duplicate DOM ids). It must:
- Stamp `committed_on = localDateString()` and `priority: 'medium'` on the created task, into the default board's first column.
- Refresh the Today list after a successful add and clear the input.
- Reject an empty/whitespace-only title (no API call) and surface "Title is required".
- When no default board/column exists, disable the input and button and show the visible hint "Create a board first to add today's tasks."
- Support Enter to submit and Escape to clear.
- Surface failures inline with `aria-invalid` + `aria-describedby` wiring.
The quick-add input retains the DOM id `today-quick-add`.

### FR-3: Loading state with skeleton
While `loading` is true, the body shows shimmer skeleton rows (matching the Notes/NoteList skeleton pattern) rather than bare "Loading…" text, plus an always-mounted `.sr-only` `aria-live="polite"` region announcing "Loading today's tasks…". Shimmer animation is disabled under `prefers-reduced-motion: reduce`.

### FR-4: Error state with retry
When `store.error` is set, the body shows an inline error panel styled with `--color-status-blocked`, displaying the error message and a **Retry** button that re-invokes `loadToday(today)`. This replaces the current silent-failure behavior.

### FR-5: Empty state
When the list is empty and not loading and there is no error, the body shows a centered composed empty state: an icon, the message "Nothing committed for today — add something from standup." (this exact "Nothing committed for today" phrasing is preserved), and the single quick-add (FR-2), focused/ready.

### FR-6: Task row presentation
Each task renders as a row with:
- **Title** as the primary element; clicking the row opens the existing `TaskDrawer`.
- **Carried badge** when `carried_days > 0`, reading "carried Nd" with `aria-label` "Carried N day(s)" (singular/plural correct).
- **Due date** formatted via a short formatter (not raw ISO slice). When the due date is before today it renders an **overdue** variant ("Overdue") styled with `--color-status-blocked`; a due date equal to today reads "Due today". The formatter lives in a reusable `task-presentation` module.
- **Priority** rendered with its configured label and color from `priorityConfig` (e.g. "High" in the blocked color), not the raw lowercase enum string.
- **Done** action — marks the task complete and removes it from Today (existing `toggleDone`), with `aria-label` "Mark '<title>' as done", disabled while in flight.
- **Remove from today** action — uncommits the task (existing `uncommit`), with `aria-label` "Remove '<title>' from today"; revealed on row hover/focus-within, with an always-visible fallback under `@media (hover: none)`.
The list renders the API order verbatim — **no client-side re-sort**.

### FR-7: Completion / removal announcements
When a task is completed or removed, a polite `aria-live` region announces the change (e.g. "'<title>' marked done", "'<title>' removed from today"), so non-visual users perceive that the row left the list.

### FR-8: Reused UI primitives, icons, and tokens
The quick-add input/button use `@tasknote/ui` `Input` and `Button` (primary), eliminating the hardcoded `#fff` button color (the `Button` primary uses theme-correct `text-bg`). Status/meta chips reuse `Tag` and/or token-driven chip styles. Raw inline SVGs are replaced with icon components in `features/today/icons.ts` (matching the `features/notes/icons.ts` convention). All colors/spacing/radius/motion come from existing CSS custom properties — no new hardcoded values, one accent, one radius scale.

### FR-9: Undo after Done (approved extra)
After a task is marked done, the user is offered a transient **Undo** affordance (surfaced via the live-region/toast or an inline control) that restores the task to Today. This requires a new `useTodayStore` action that re-commits / un-completes the task and returns it to the list. Undo is keyboard-reachable and announced.

### FR-10: Carried-vs-fresh visual grouping (approved extra)
The list is visually grouped into "Carried over" and "Today" sections via presentational subheaders, **without changing the underlying API order**. Grouping is purely visual; it must not re-sort or drop rows, and the existing "preserves carried-first API ordering" guarantee holds.

**Precondition (hard):** this depends on `listToday` returning all carried tasks (`carried_days > 0`) strictly before fresh ones. FR-10 and FR-6's "no client re-sort" rule **directly conflict** if the API ever interleaves them — there is no way to both group and preserve order on interleaved data. If the order is not guaranteed carried-first, the executor must stop and escalate rather than client-re-sort. (Verify against the `listToday` server sort — see Open questions / ICT-9 precondition.)

## Technical requirements

### Architecture
Single-column centered layout retained (max-width 720px, centered, existing container padding) — **not** a two-pane master/detail. `TodayView.vue` stays the single view component; the page title continues to be provided by `DefaultLayout`'s topbar. Body renders one of four mutually-exclusive states: loading / error / empty / populated.

### Data model
No entity/schema changes. `TodayTask = Task & { carried_days: number }` (`apps/web/src/api/tasks.ts`) is unchanged. FR-9 (Undo) adds a store action only and reuses existing task APIs — **no backend work required** (the reversal endpoint already exists, see API contracts).

### API contracts
**No new HTTP endpoints.** FR-9 Undo is frontend-only: it composes two existing client functions in `apps/web/src/api/tasks.ts` — `uncompleteTask(id)` (`DELETE /tasks/{id}/complete`, reopens the task) then `commitTask(id, today)` (`POST /tasks/{id}/commit`, restores it to Today). Confirmed present (lines 44-58).

### UI structure
- `apps/web/src/views/TodayView.vue` — redesigned template + scoped styles (consume tokens only).
- New `apps/web/src/features/today/icons.ts` — icon components (check, remove/minus, sun/empty) per the notes icons convention.
- New `apps/web/src/features/today/task-presentation.ts` — small pure helpers: `formatDueDate(due, today)` (with overdue/"Due today" logic) and a thin priority accessor over `priorityConfig`; unit-tested.
- Reuse: `@tasknote/ui` (`Button`, `Input`, `Tag`); `priorityConfig` (`apps/web/src/features/board/priorityConfig.ts`); `formatRelativeTime` (`apps/web/src/features/notes/note-presentation.ts`); `localDateString` (`@/stores/today`); Notes skeleton/`.sr-only`/reduced-motion CSS conventions.
- `apps/web/src/stores/today.ts` — add a restore/undo action (FR-9) only.

### Infrastructure
None.

## Non-functional requirements

### Accessibility (WCAG AA)
- All interactive controls keyboard-reachable with visible focus rings (existing global focus-ring tokens).
- Button/label/meta text audited for AA contrast (skill: BUTTON CONTRAST CHECK). **Result:** dark theme passes throughout (primary "Add" button ≈13:1; overdue/priority OK). **Known pre-existing light-theme limitation:** the light accent token `--color-accent` (`#65A30D`, relative luminance ≈0.29) yields ≈3:1 for small (12px) accent-on-light and white-on-accent text — the primary "Add" button and the Undo button fall short of 4.5:1 in light mode. This is **app-wide and identical on the board** (same `@tasknote/ui` Button + accent token), not introduced by this redesign. Adopting the shared Button still fixed the *severe* prior bug (hardcoded `#fff` on lime accent ≈1.4:1 in the default dark theme). **Follow-up (out of scope here):** darken the light accent token to luminance ≤ ~0.18 (e.g. `#4D7C0F` or darker) to reach AA for small text; this is a shared-token change affecting the whole app and must be done globally, not per-view.
- Live regions: count summary (polite), loading (polite), completion/removal (polite), errors (assertive/alert as appropriate).
- Icon-only buttons carry descriptive `aria-label`s; decorative SVGs are `aria-hidden`.

### Motion
All shimmer/transition animation respects `prefers-reduced-motion: reduce` (disabled), per the Notes pattern.

### Compatibility / no-regression
Behaviors locked by `apps/web/src/views/__tests__/TodayView.spec.ts` and by spec-5 / spec-9 must remain green: no client re-sort; quick-add `committed_on`/refresh/empty-guard/no-board-disabled+hint (SCN-7); new-row-appears + input-clears (SCN-8); complete-moves-to-Done. Markup-changing work updates the spec file's selectors/assertions in lockstep.

## Dependencies
- `@tasknote/ui` `Button` / `Input` / `Tag` — available.
- `priorityConfig`, `formatRelativeTime`, `localDateString` — available.
- Notes feature conventions (skeleton, icons, presentation module) — available as reference.
- Task completion-reversal API for Undo (FR-9) — **status to confirm** in `apps/web/src/api/tasks.ts`.

## Constraints
- Do **not** introduce a two-pane layout; keep the single-column focused list.
- Do **not** re-sort the list client-side; render API order (FR-6, FR-10).
- Do **not** add new dependencies or hardcoded colors; reuse tokens and existing primitives.
- Preserve the `today-quick-add` input id and the "Nothing committed for today" empty copy.

## Open questions
- **FR-9 Undo — RESOLVED:** the reversal endpoint exists (`uncompleteTask` → `DELETE /tasks/{id}/complete`, `apps/web/src/api/tasks.ts:56`). Undo restores via `uncompleteTask(id)` + `commitTask(id, today)`. Frontend-only; no backend work. (One residual nuance for the executor: confirm reopen returns the task to its prior column rather than a Done column — verify when wiring ICT-8.)
- **FR-10 grouping — precondition, verify before ICT-9:** confirm `listToday` always returns carried tasks strictly before fresh ones. If not, ICT-9 is blocked (cannot group without violating FR-6's no-re-sort rule) — escalate, do not client-re-sort. (Answerable by: `listToday` server implementation.)

## Glossary
- **Committed / Today task:** a task with `committed_on` set to a given date, surfaced by `listToday`.
- **Carried (carried_days):** number of days a still-open task has been carried forward; > 0 means it rolled over from prior days.
- **Uncommit / Remove from today:** clear a task's commitment so it leaves the Today list without completing it.
