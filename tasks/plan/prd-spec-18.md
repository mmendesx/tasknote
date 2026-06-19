# PRD: Today page (TodayView) UI/UX redesign

**Spec**: tasks/specs/spec-18-today-ui-redesign.md

## Summary
Full UI/UX redesign of the Today page (`apps/web/src/views/TodayView.vue`): real header with human-readable date and live task count, a single deduplicated quick-add, four explicit body states (loading skeleton / error+retry / empty / populated), calmer task rows with real priority/due/overdue/carried formatting, completion & removal announcements, plus two approved extras — Undo after Done and carried-vs-fresh visual grouping. Reuses existing design tokens and `@tasknote/ui` primitives; preserves all behaviors locked by `TodayView.spec.ts`, spec-5, and spec-9 (notably: no client-side re-sort).

## Behavior scenarios

### Feature: Header & date & count

#### Scenario: Human-readable date in header
  Given today is 2026-06-19
  When the Today page renders
  Then the header shows a heading "Today" and a human-readable date (e.g. "Friday, June 19")
  And the raw "2026-06-19" string is not shown as the date

#### Scenario: Task count summary reflects the list
  Given the Today list contains 3 tasks, 1 of which is carried over
  When the page renders
  Then a summary reads "3 tasks · 1 carried over"
  And the summary is inside a polite aria-live region

#### Scenario: Count summary pluralization and empty phrasing
  Given the Today list contains exactly 1 task with 0 carried
  Then the summary reads "1 task" (singular, no "carried over" segment)
  And given the list is empty, the summary uses an empty-specific phrasing rather than "0 tasks · 0 carried over"

### Feature: Quick-add (single, deduplicated)

#### Scenario: Quick-add stamps committed_on = today
  Given a default board with a first column exists
  When the user types "Write tests" and submits the quick-add
  Then createTask is called once with committed_on equal to localDateString() and title "Write tests"
  And the Today list is refreshed and the input is cleared

#### Scenario: New row appears after successful add
  Given the list is empty and a default board exists
  When the user adds "Deploy hotfix"
  Then a row titled "Deploy hotfix" appears in the list
  And the quick-add input value is empty

#### Scenario: Empty title is rejected
  When the user submits the quick-add with only whitespace
  Then createTask is not called
  And "Title is required" is shown

#### Scenario: No board disables quick-add with hint
  Given no default board/column exists
  Then the quick-add input and button are disabled
  And the visible hint "Create a board first to add today's tasks." is shown
  And submitting via Enter does not call createTask

#### Scenario: Single quick-add control only
  Given the page is in the populated state
  Then there is exactly one quick-add input in the DOM (id "today-quick-add") and exactly one add button
  And no duplicate add-input id exists

### Feature: Loading state

#### Scenario: Skeleton rows while loading
  Given the store loading flag is true
  Then shimmer skeleton rows are shown instead of task rows or "Loading…" text
  And a polite sr-only region announces "Loading today's tasks…"

#### Scenario: Skeleton respects reduced motion
  Given prefers-reduced-motion: reduce is active
  Then the skeleton shimmer animation is disabled

### Feature: Error state

#### Scenario: Error panel with retry
  Given store.error is "Failed to load today tasks"
  When the page renders
  Then an inline error panel shows the message styled with the blocked color
  And a Retry button is present
  When Retry is clicked
  Then loadToday(today) is invoked again

### Feature: Empty state

#### Scenario: Composed empty state
  Given the list is empty, not loading, no error
  Then a centered empty state shows an icon, the message containing "Nothing committed for today", and the quick-add control

### Feature: Task row presentation

#### Scenario: Carried badge with accessible label
  Given a task with carried_days = 3
  Then the row shows "carried 3d" with aria-label "Carried 3 days"
  And given carried_days = 1 the aria-label reads "Carried 1 day"
  And given carried_days = 0 no carried badge is rendered

#### Scenario: Priority uses configured label and color
  Given a task with priority "high"
  Then the row shows the priority as "High" in the blocked status color
  And not as the raw lowercase "high"

#### Scenario: Due date formatting with overdue
  Given a task due before today
  Then the due meta reads "Overdue" in the blocked color
  And given a task due today it reads "Due today"
  And the raw ISO timestamp is not shown verbatim

#### Scenario: Row opens the task drawer
  When the user activates a task row body
  Then the TaskDrawer opens for that task id

#### Scenario: Done and Remove actions are labeled and functional
  Given a task titled "My Task"
  Then the Done control has aria-label "Mark 'My Task' as done" and the Remove control has aria-label "Remove 'My Task' from today"
  When Done is clicked, toggleDone(id) is called and the control is disabled while in flight
  When Remove is clicked, uncommit(id) is called

#### Scenario: API order preserved (no client re-sort)
  Given the API returns tasks in order [carried 5d, carried 2d, fresh]
  Then the rows render in exactly that order

### Feature: Announcements

#### Scenario: Completion announced
  When a task "My Task" is marked done
  Then a polite live region announces "'My Task' marked done"

#### Scenario: Removal announced
  When a task "My Task" is removed from today
  Then a polite live region announces "'My Task' removed from today"

### Feature: Undo after Done (extra)

#### Scenario: Undo restores a completed task
  Given the user just marked "My Task" as done
  Then an Undo affordance is offered
  When the user activates Undo
  Then a store restore action is called for that task and "My Task" returns to the Today list

#### Scenario: Undo is keyboard reachable
  Then the Undo affordance is focusable and operable by keyboard and is announced

### Feature: Carried-vs-fresh grouping (extra)

#### Scenario: Visual groups without reordering
  Given the API returns [carried 5d, carried 2d, fresh A, fresh B]
  Then a "Carried over" subheader precedes the two carried rows and a "Today" subheader precedes the fresh rows
  And the row order is unchanged from the API order
  And no rows are dropped or duplicated

#### Scenario: No group headers when one side is empty
  Given all tasks are fresh (carried_days = 0)
  Then no "Carried over" subheader is shown and the list renders as a single group

## Tasks

### ICT-1: Task presentation helpers + tests
- **What**: Create `task-presentation.ts` with `formatDueDate(due, today)` (overdue / "Due today" / short date) and a priority accessor over `priorityConfig`. Pure functions, fully unit-tested. Reuse `priorityConfig` and consider `formatRelativeTime` for any relative phrasing.
- **Where**: `apps/web/src/features/today/task-presentation.ts`, `apps/web/src/features/today/__tests__/task-presentation.spec.ts`
- **Validated by**: Due date formatting with overdue; Priority uses configured label and color
- **Estimate**: S

### ICT-2: Today icon components
- **What**: Add icon components (check/done, remove/minus, sun/empty) following the `features/notes/icons.ts` convention (functional `h()` components, currentColor, stroke 1.5, `aria-hidden` at call sites). Replace raw inline SVGs.
- **Where**: `apps/web/src/features/today/icons.ts`
- **Validated by**: Done and Remove actions are labeled and functional (icon-bearing buttons render)
- **Estimate**: S

### ICT-3: Header — heading, human-readable date, live count
- **What**: Replace the raw ISO date with a heading + `Intl.DateTimeFormat` date and a pluralized task-count summary in a polite aria-live region (empty-specific phrasing).
- **Where**: `apps/web/src/views/TodayView.vue` (+ update/extend `__tests__/TodayView.spec.ts`)
- **Validated by**: Human-readable date in header; Task count summary reflects the list; Count summary pluralization and empty phrasing
- **Estimate**: S

### ICT-4: Deduplicate quick-add into a single reused control
- **What**: Extract the quick-add into one block (one input id `today-quick-add` + one button) reused by empty and populated states; remove the duplicate `#today-bottom-add` markup and duplicated error/hint logic. Adopt `@tasknote/ui` `Input` + primary `Button` (removes hardcoded `#fff`). Preserve Enter/Escape, empty guard, no-board disable+hint, `committed_on`/refresh/clear, and `aria-invalid`/`aria-describedby`.
- **Where**: `apps/web/src/views/TodayView.vue` (+ update `__tests__/TodayView.spec.ts` SCN-7/SCN-8 selectors that referenced `.today-view__quick-btn` and `#today-bottom-add`)
- **Validated by**: Quick-add stamps committed_on = today; New row appears after successful add; Empty title is rejected; No board disables quick-add with hint; Single quick-add control only
- **Estimate**: M

### ICT-5: Loading skeleton + error/retry states
- **What**: Add shimmer skeleton rows (Notes pattern) with sr-only polite loading announcement; add an inline error panel bound to `store.error` with a Retry button calling `loadToday(today)`. Reduced-motion disables shimmer.
- **Where**: `apps/web/src/views/TodayView.vue` (+ tests)
- **Validated by**: Skeleton rows while loading; Skeleton respects reduced motion; Error panel with retry
- **Estimate**: M

### ICT-6: Task row redesign with real meta + reused primitives
- **What**: Rebuild the row as a dedicated `TodayRow.vue` child (consumed by the flat + grouped lists): title-led layout opening `TaskDrawer`; carried badge (label + `aria-label` singular/plural preserved); due via `formatDueDate` with overdue variant; priority via `priorityConfig` (label+color, pill treatment matching the board's `TaskCard`); Done + Remove actions (labels preserved, reveal-on-hover with `hover:none` fallback) using the new icons. Render API order verbatim (no re-sort).
- **Where**: `apps/web/src/features/today/TodayRow.vue` (new), `apps/web/src/views/TodayView.vue` (+ update `__tests__/TodayView.spec.ts` row selectors/assertions)
- **Validated by**: Carried badge with accessible label; Priority uses configured label and color; Due date formatting with overdue; Row opens the task drawer; Done and Remove actions are labeled and functional; API order preserved (no client re-sort)
- **Estimate**: M

### ICT-7: Completion & removal aria-live announcements
- **What**: Add a polite live region; on `toggleDone`/`uncommit` success, announce "'<title>' marked done" / "'<title>' removed from today".
- **Where**: `apps/web/src/views/TodayView.vue` (+ tests)
- **Validated by**: Completion announced; Removal announced
- **Estimate**: S

### ICT-8: Undo after Done (extra) — frontend-only
- **What**: Add a `useTodayStore` restore action that composes existing client APIs — `uncompleteTask(id)` (`DELETE /tasks/{id}/complete`) then `commitTask(id, today)` — to reopen the task and return it to Today. **No backend work** (endpoints confirmed in `api/tasks.ts:44-58`). Surface a transient, keyboard-reachable, announced Undo affordance after Done. When wiring, verify reopen lands the task back in its prior column, not a Done column.
- **Where**: `apps/web/src/stores/today.ts`, `apps/web/src/views/TodayView.vue`, store/view tests
- **Validated by**: Undo restores a completed task; Undo is keyboard reachable
- **Estimate**: M

### ICT-9: Carried-vs-fresh visual grouping (extra)
- **Precondition (hard)**: `listToday` returns carried tasks strictly before fresh ones. If interleaved, this conflicts with ICT-6's no-re-sort guarantee — **stop and escalate, do not client-re-sort**. Verify before implementing.
- **What**: Partition the (already carried-first) list into "Carried over" and "Today" presentational groups with subheaders, without reordering or dropping rows; hide a subheader when its group is empty.
- **Where**: `apps/web/src/views/TodayView.vue` (+ tests)
- **Validated by**: Visual groups without reordering; No group headers when one side is empty
- **Estimate**: S

### ICT-10: Reduced-motion + a11y/contrast audit pass
- **What**: Final sweep — `prefers-reduced-motion` disables all shimmer/transitions; copy self-audit; confirm all live regions and labels; run full suite + lint/types. **Contrast audit result:** dark theme passes; **light theme has a known pre-existing ~3:1 limitation** on small accent text (Add/Undo buttons) from the shared `--color-accent` token — app-wide, identical on the board, recommended fix is a global accent-token darkening (out of scope for this view). Do **not** claim "both themes pass."
- **Where**: `apps/web/src/views/TodayView.vue`, `apps/web/src/features/today/*`
- **Validated by**: Skeleton respects reduced motion; (cross-cutting a11y across all scenarios)
- **Estimate**: S

## Open questions
- **Undo (ICT-8) — RESOLVED:** reversal endpoint exists (`uncompleteTask` + `commitTask`); frontend-only. Residual: confirm reopen returns the task to its prior column (verify during ICT-8).
- **Grouping (ICT-9) — precondition:** confirm `listToday` returns carried tasks strictly before fresh ones; if interleaved, ICT-9 is blocked (escalate, no client re-sort).

## Dependencies
- `@tasknote/ui` (`Button`, `Input`, `Tag`); `priorityConfig`; `formatRelativeTime`; `localDateString` — available.
- Notes feature conventions (skeleton, icons, presentation module) — reference.
- Task completion-reversal API for Undo — **confirmed available** (`uncompleteTask`, `api/tasks.ts:56`).
