# spec-10 — Remove accent border-highlight chrome

**Source**: user request to remove "border highlight behavior" from the webapp. Scope narrowed (after an inventory sweep) to **visual chrome highlights only** — accent-colored edge/divider lines, active-state border/background highlights, and hover accent borders. Focus rings (a11y), input focus glow, and functional accent (selected date, drag ghosts, spinners, active toolbar) are explicitly KEPT.

## Goal

Remove the accent-colored "highlight" decoration from layout chrome and interactive list/nav items so the UI reads calmer — no bright accent edge line, no accent border/tint on the active nav item or active tag chip, no accent border/tint on hover. Keyboard focus indicators and meaning-bearing accent usage remain untouched.

## In scope (remove)

### Group A — accent edge / divider lines
- `apps/web/src/features/notes/NoteList.vue:155` `.note-item--selected` → `border-left: 2px solid var(--color-accent)` — remove the accent left-border (keep any background distinction if present, or use a neutral indicator).
- `apps/web/src/features/notes/TaskLinkPicker.vue:168` `.task-link-picker__trigger:hover` → `border-color: var(--color-accent)` — drop accent hover border (revert to neutral border).
- `apps/web/src/layouts/DefaultLayout.vue` — if any accent edge line exists between sidebar/content beyond `--color-border`, neutralize it. (The visible bright edge in the screenshot — confirm source: `.nav-progress` at :757 is an accent navigation-progress bar; that is a loading indicator, NOT chrome — KEEP it. Verify there is no separate accent `border-right`/`border-left` on the sidebar/main; the existing `border-right: 1px solid var(--color-border)` at :623 is neutral — keep.)
- `apps/web/src/features/editor/MilkdownEditor.vue:350` blockquote `border-left: 2px solid var(--color-accent)` — this is editor content styling (blockquote bar), arguably meaningful. KEEP unless trivially in scope; default KEEP (it's markdown semantics, not app chrome).

### Group C — active-state highlights
- `apps/web/src/features/board/TaskDrawer.vue:270` tab trigger `data-[state=active]:border-accent` — remove the accent active-tab border (keep text-color/weight distinction for the active tab so it's still identifiable).
- `apps/web/src/features/tags/BoardTagFilter.vue:152-161` `.board-tag-filter__chip--active` (+ `:hover`) → accent background-tint + accent text + accent border — remove the accent border + tint; keep a neutral active indication (e.g. neutral filled background or bolder text) so active filter is still distinguishable.
- `apps/web/src/features/onboarding/onboarding-steps/StepSeed.vue:154-157` `.seed-card--selected` → accent border + accent tint — remove accent border/tint; keep a neutral selected state (neutral border or check).
- `apps/web/src/layouts/DefaultLayout.vue:1094-1095` `.nav-notes__panel .note-item--selected` accent tint — remove accent background tint; neutral selected state.
- `nav-item--active` (sidebar active nav): if it applies an accent border/background, neutralize to a subtle neutral highlight (e.g. `--color-surface-elevated` background) so the active route is still indicated without accent. (Confirm exact rule in DefaultLayout.)

### Group D — hover/selected accent borders
- `apps/web/src/features/notes/TaskLinkPicker.vue:204-205` `.task-link-picker__item:hover` accent-tint bg — replace with neutral hover (e.g. `--color-surface-elevated`).
- `apps/web/src/features/tags/TagPicker.vue:236` option hover/selected accent-tint bg — neutral hover.

## Out of scope (KEEP — do NOT touch)

- **Group B — all focus rings** (`.focus-ring`, every `:focus-visible` accent outline/ring, `ring-accent` utilities, `--color-focus-ring`). Removing these is a WCAG 2.4.7 keyboard-accessibility failure. KEEP ALL.
- **Input focus glow** (Group E inputs: accent border + box-shadow on focused inputs/textareas/selects/datepicker/milkdown `:focus-within`). KEEP.
- **Functional accent** (Group E + others): selected date-picker day, `data-today` ring, drag-drop ghost dashed borders (`.col-ghost`, `.task-ghost`), loading spinners (`border-t-accent`), active milkdown toolbar button, Select `data-highlighted`/checked, note pin-active, logo checkmark. These convey state/meaning. KEEP.

## Functional requirements

### FR-1 — Active nav/route still identifiable without accent
- The active sidebar nav item and active tag-filter chip MUST remain visually distinguishable from inactive ones, using a NEUTRAL treatment (background `--color-surface-elevated` / text weight / neutral border), not the accent color.

### FR-2 — Hover states remain but neutral
- Hover on list items / pickers MUST still give feedback, using a neutral surface change instead of an accent tint/border.

### FR-3 — Selected states remain but neutral
- Selected note item, selected seed card MUST stay identifiable via a neutral indicator (neutral border, check, or surface change), not accent.

### FR-4 — No regression to kept items
- Focus rings, input focus glow, date-picker selected day, drag ghosts, spinners, active toolbar — all UNCHANGED and still visible.

## Non-functional requirements

- **NFR-1** `pnpm --filter @tasknote/web exec vite build` passes; existing web tests pass.
- **NFR-2** No new dependencies.
- **NFR-3** Keyboard focus visibility preserved (NFR-1 a11y): tabbing through the app still shows a visible focus indicator on every interactive element.
- **NFR-4** Each removed highlight replaced with a neutral equivalent where the state still needs to be conveyed (active/selected/hover) — don't just delete and leave states indistinguishable.

## Dependencies

- Frontend-only, CSS-only changes across `apps/web/src` + possibly the active-nav rule in DefaultLayout. No `packages/ui` changes needed (those are focus-ring/functional — out of scope).

## Open questions

- Active nav-item neutral treatment: use `--color-surface-elevated` background + existing text-primary color. Confirm there's an existing neutral elevated token (there is). Decision: neutral elevated background for active states.
