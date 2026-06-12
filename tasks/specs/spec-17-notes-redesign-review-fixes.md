# Spec: Notes redesign review fixes

## Overview
Apply all findings from the code review of the notes UI redesign (commits ccc78c2..75bc624). Two blocking issues (broken production build via wrong `@import` depth; dead empty-state "New note" CTAs) plus the actionable non-blocking findings (helper dedup, title-input semantics, combobox ARIA, HTML validity, misc).

## Actors
- End user (empty-state note creation, screen-reader users)
- Build pipeline (`npm run build` must succeed)
- Existing test suite (507 tests must keep passing)

## Functional requirements

### FR-1: Production build restored (blocking)
`apps/web/src/features/diagrams/diagram-chrome.css` `@import` resolves correctly (`../../styles/floating-chrome.css`, not `../../../`). `npm run build` succeeds.

### FR-2: Empty-state create CTAs functional (blocking)
NotesView binds `@create` on both `NoteList` and `NoteEditor` to the existing `createNote` handler. Clicking "New note" in either empty state creates a note and navigates to it.

### FR-3: Shared presentation helpers
`stripMarkdown`, `deriveTitle`, `getPreview`, `formatRelativeTime` extracted to `apps/web/src/features/notes/note-presentation.ts`; NoteList, ArchivedNoteList, NoteEditor consume the shared module (reconcile NoteEditor's `deriveTitleClient` variant).

### FR-4: Title input semantics
NoteEditor title input binds the actual `title` value (not the derived title); placeholder shows derived title or "Untitled". Typing never silently materializes derived text into the stored title.

### FR-5: TaskLinkPicker combobox ARIA
Combobox pattern: search input gets `role="combobox"`, `aria-controls`, `aria-expanded`, and `aria-activedescendant`; listbox contains only `role="option"` items; "No tasks found" row is not an option. Dead `searchInputRef` resolved (used or removed). Off-board linked task renders linked chip with fallback label instead of unlinked state.

### FR-6: HTML validity + misc a11y
- `aria-live` regions are not direct children of `<ul>`; stay mounted, text toggles
- `NotesView` id parsing uses `Number(id)` with NaN guard
- `prefers-reduced-motion` covers TaskLinkPicker transitions

## Technical requirements
Presentation-only; no store/API/route changes; no new deps. Tokens only.

## Non-functional requirements
- a11y: combobox pattern per WAI-ARIA; live regions reliable
- Regression: full vitest suite + `npm run build` green

## Dependencies
- Review findings (this session) — available
- spec-16 implementation — committed

## Constraints
- Sidebar compact contract (`note-item*`) untouched
- No behavior changes beyond the fixes listed

## Open questions
None.
