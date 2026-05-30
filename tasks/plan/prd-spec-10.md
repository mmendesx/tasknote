# PRD spec-10 — Remove accent border-highlight chrome

Source: `tasks/specs/spec-10-remove-border-highlights.md`.

## Summary
Remove accent-colored highlight chrome — active-state borders/tints, hover accent borders, and accent edge/selected indicators on nav/list/chip items — replacing each with a neutral equivalent so states stay distinguishable. Focus rings, input focus glow, and meaning-bearing accent (selected date, drag ghosts, spinners, active toolbar) are KEPT.

## Behavior scenarios

#### Scenario: active sidebar nav uses neutral highlight (FR-1)
  Given the user is on the active board route
  When the sidebar renders the active nav item
  Then the active item is distinguishable by a neutral surface/text treatment
  And it does NOT use the accent color for border or background

#### Scenario: active tag-filter chip is neutral (FR-1)
  Given a tag filter is active
  When the chip renders
  Then it is visibly active via a neutral treatment
  And uses no accent border or accent tint

#### Scenario: hover on a list item is neutral (FR-2)
  Given the TaskLinkPicker / TagPicker list
  When the user hovers an item
  Then the hover feedback is a neutral surface change
  And not an accent tint/border

#### Scenario: selected note/seed uses neutral indicator (FR-3)
  Given a selected note item or a selected seed card
  When it renders
  Then it is identifiable by a neutral indicator (neutral border/check/surface)
  And not by an accent border or accent tint

#### Scenario: focus rings still visible (FR-4, NFR-3)
  Given keyboard navigation
  When the user tabs to any interactive element
  Then a visible focus indicator (accent ring/outline) still appears
  And was NOT removed

#### Scenario: functional accent preserved (FR-4)
  Given the date picker, a drag operation, a loading spinner, the active editor toolbar button
  When they render
  Then the selected day, drag ghost, spinner, and active toolbar button still show accent
  And were NOT removed

## Tasks

### ICT-94: Neutralize active-state highlights
- **What**: Remove accent border/tint from active states, replace with neutral. Targets: `BoardTagFilter.vue` `.board-tag-filter__chip--active` (+`:hover`) → neutral active treatment; `TaskDrawer.vue` active tab `data-[state=active]:border-accent` → drop accent border, keep text/weight; `StepSeed.vue` `.seed-card--selected` → neutral; `DefaultLayout.vue` `.nav-notes__panel .note-item--selected` accent tint → neutral; sidebar `nav-item--active` if accent-based → neutral elevated bg. Confirm each active state stays distinguishable.
- **Where**: `apps/web/src/features/tags/BoardTagFilter.vue`, `apps/web/src/features/board/TaskDrawer.vue`, `apps/web/src/features/onboarding/onboarding-steps/StepSeed.vue`, `apps/web/src/layouts/DefaultLayout.vue`
- **Validated by**: active nav, active tag chip, selected seed scenarios
- **Estimate**: M

### ICT-95: Neutralize hover + selected accent borders/tints
- **What**: Replace accent hover/selected tints + borders with neutral surface changes. Targets: `NoteList.vue` `.note-item--selected` accent left-border → neutral indicator; `TaskLinkPicker.vue` `:trigger:hover` accent border + `:item:hover` accent tint → neutral; `TagPicker.vue` option hover/selected accent tint → neutral.
- **Where**: `apps/web/src/features/notes/NoteList.vue`, `apps/web/src/features/notes/TaskLinkPicker.vue`, `apps/web/src/features/tags/TagPicker.vue`
- **Validated by**: hover neutral, selected note neutral scenarios
- **Estimate**: S

### ICT-96: Verify kept items + build/test
- **What**: Confirm NOT removed: all focus rings (`.focus-ring`, `:focus-visible` accent, `ring-accent`), input focus glow, date-picker selected/today, drag ghosts (`.col-ghost`/`.task-ghost`), spinners, active milkdown toolbar, blockquote bar. Run web build + tests. Manual/Playwright: tab through app → focus rings visible; active nav/tag neutral; hover neutral.
- **Where**: repo-wide (verification)
- **Validated by**: focus rings visible, functional accent preserved scenarios
- **Estimate**: S

## Open questions
- Active/selected neutral treatment: `--color-surface-elevated` background + existing text color. Confirmed token exists.

## Dependencies
- Frontend CSS-only. No `packages/ui` changes (focus-ring/functional, out of scope). No new deps.

---

## Task counts
- Frontend: ICT-94..95 (2): 1 M, 1 S
- Verification: ICT-96 (1): 1 S

**Total: 3 tasks** (S: 2, M: 1, L: 0)
Scenarios: 6
Requirements: 4 functional + 4 NFR = 8

## Execution order
ICT-94 → ICT-95 → ICT-96. (94/95 independent files — could parallelize; sequential is fine given small size.)
