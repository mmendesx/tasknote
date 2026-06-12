# PRD: Notes redesign review fixes

**Spec**: tasks/specs/spec-17-notes-redesign-review-fixes.md

## Summary
Fix the two blocking review findings (broken `@import` depth breaking `npm run build`; unwired `create` emits making empty-state CTAs dead) and apply the non-blocking findings: shared presentation helpers, title-input semantics, TaskLinkPicker combobox ARIA, HTML validity, misc a11y.

## Behavior scenarios

### Feature: Build integrity

#### Scenario: Production build succeeds
  Given the repo at HEAD
  When `npm run build` runs for apps/web
  Then the build completes without CSS resolution errors

### Feature: Empty-state creation

#### Scenario: List empty-state CTA creates note
  Given zero notes at /notes
  When the user clicks "New note" in the list empty state
  Then a note is created and the route navigates to the new note

#### Scenario: Editor empty-state CTA creates note
  Given a wide viewport at /notes with no selection
  When the user clicks "New note" in the editor empty state
  Then a note is created and the route navigates to it

### Feature: Title input

#### Scenario: Derived title shows as placeholder only
  Given a note with empty title and body "# Hello"
  When the editor renders
  Then the title input value is empty and its placeholder shows "Hello"
  And typing one character does not commit "Hello" into the title

### Feature: Task-link picker ARIA

#### Scenario: Combobox pattern
  Given the dropdown is open
  When markup renders
  Then the search input has role="combobox", aria-expanded, aria-controls, and aria-activedescendant pointing to the active option
  And the listbox contains only role="option" children

#### Scenario: Off-board linked task
  Given a note linked to a task not in the current store list
  When the picker renders
  Then a linked chip with a fallback label renders (not the unlinked state)

### Feature: Regression

#### Scenario: Full suite green
  Given all fixes applied
  When vitest runs
  Then 0 failures

## Tasks

### ICT-1: Fix diagram-chrome.css @import depth (blocking)
- **What**: `../../../styles/floating-chrome.css` → `../../styles/floating-chrome.css`; fix comment path
- **Where**: `apps/web/src/features/diagrams/diagram-chrome.css`
- **Validated by**: Production build succeeds
- **Estimate**: S

### ICT-2: Wire create emits in NotesView (blocking)
- **What**: `@create="createNote"` on `<NoteList>` and `<NoteEditor>` usages; add NotesView test asserting empty-state create flow
- **Where**: `apps/web/src/views/NotesView.vue`, new `apps/web/src/views/__tests__/NotesView.spec.ts`
- **Validated by**: List empty-state CTA creates note; Editor empty-state CTA creates note
- **Estimate**: S

### ICT-3: Extract shared note presentation helpers
- **What**: New `note-presentation.ts` with `stripMarkdown`, `deriveTitle`, `getPreview`, `formatRelativeTime`; dedupe in NoteList, ArchivedNoteList, NoteEditor
- **Where**: `apps/web/src/features/notes/note-presentation.ts` (new), the three components
- **Validated by**: Full suite green
- **Estimate**: M

### ICT-4: Title input semantics
- **What**: `:value="title"` + `:placeholder="derivedTitle || 'Untitled'"`
- **Where**: `apps/web/src/features/notes/NoteEditor.vue`
- **Validated by**: Derived title shows as placeholder only
- **Estimate**: S

### ICT-5: TaskLinkPicker combobox ARIA + off-board chip
- **What**: Combobox pattern (input role/aria-controls/aria-activedescendant; pure listbox children; "No tasks found" not an option); resolve dead `searchInputRef`; off-board linked task → linked chip with fallback label; `prefers-reduced-motion` on transitions
- **Where**: `apps/web/src/features/notes/TaskLinkPicker.vue`, `__tests__/TaskLinkPicker.spec.ts`
- **Validated by**: Combobox pattern; Off-board linked task
- **Estimate**: M

### ICT-6: HTML validity + misc
- **What**: Move `aria-live` regions out of `<ul>` (keep mounted, toggle text) in NoteList + ArchivedNoteList; `Number(id)` NaN-guarded parsing in NotesView
- **Where**: `apps/web/src/features/notes/NoteList.vue`, `apps/web/src/features/archive/ArchivedNoteList.vue`, `apps/web/src/views/NotesView.vue`
- **Validated by**: Full suite green
- **Estimate**: S

### ICT-7: Regression pass
- **What**: Full vitest suite + `npm run build`; fix breaks
- **Where**: apps/web
- **Validated by**: Production build succeeds; Full suite green
- **Estimate**: S

## Open questions
None.

## Dependencies
- spec-16 implementation committed (ccc78c2..75bc624)
- No backend/store changes
