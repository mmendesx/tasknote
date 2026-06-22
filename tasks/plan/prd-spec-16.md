# PRD: Notes feature UI/UX redesign

**Spec**: tasks/specs/spec-16-notes-ui-redesign.md

## Summary
Presentation-layer redesign of the notes feature to match the diagram redesign's minimalist design language: master–detail layout, refreshed list rows, clean editor header with save-status indicator, borderless markdown surface with floating-chrome selection toolbar, chip-style task-link picker, proper empty/loading states, and archive list alignment. Store, API, routes, manual-save model, and the sidebar compact-list contract are preserved.

## Behavior scenarios

### Feature: Master–detail layout

#### Scenario: Two panes on wide viewport
  Given a viewport ≥900px and 3 notes
  When the user visits /notes/2
  Then a left list pane shows the 3 notes with note 2 selected
  And the right pane shows the editor for note 2

#### Scenario: Single pane on narrow viewport
  Given a viewport <900px
  When the user visits /notes
  Then only the list renders
  And selecting a note navigates to /notes/:id showing only the editor with a back affordance

#### Scenario: Back affordance returns to list
  Given a narrow viewport showing the editor for note 2
  When the user activates the back control
  Then the route is /notes and the list renders

#### Scenario: Sidebar embed unchanged
  Given the DefaultLayout sidebar notes panel is expanded
  When the notes list renders there
  Then compact tiles render exactly as before (note-item classes, title-only)

### Feature: Notes list

#### Scenario: Row anatomy
  Given a pinned note titled "Roadmap" updated 2 hours ago
  When the full-mode list renders
  Then the row shows "Roadmap", a one-line preview, a relative time, and a pin indicator

#### Scenario: Selected row styling
  Given note 2 is selected
  When the list renders
  Then note 2's row has elevated background and a 2px accent left rail

#### Scenario: Quiet delete preserved
  Given a note row
  When the user hovers or focuses within the row
  Then a delete button is revealed and deleting removes the note

#### Scenario: List empty state
  Given zero notes
  When the list pane renders
  Then a centered empty state shows an icon, a one-line prompt, and a create button

#### Scenario: List loading skeleton
  Given notes are loading
  When the list pane renders
  Then 2–3 skeleton rows render instead of a "Loading…" text node

### Feature: Editor header

#### Scenario: Header anatomy
  Given an open note
  When the editor renders
  Then one header row shows a borderless title input ("Untitled" placeholder) and a right cluster: pin toggle, save-status indicator, Save button, quiet discard and delete actions

#### Scenario: Pin toggle state
  Given an unpinned note
  When the user clicks the pin icon button
  Then the note is pinned and the button shows a filled accent state

#### Scenario: Save status reflects dirty state
  Given a clean note
  When the user types in the body
  Then the indicator shows "Unsaved" and the Save button enables
  And after clicking Save the indicator returns to "Saved" and the button disables

#### Scenario: Two-step delete
  Given an open note
  When the user clicks delete
  Then an inline confirm appears, and confirming soft-deletes and navigates to /notes

#### Scenario: Editor empty state
  Given a wide viewport at /notes with no selection
  When the editor pane renders
  Then a centered empty state shows an icon, a prompt, and a "New note" button

### Feature: Markdown surface

#### Scenario: Borderless writing surface
  Given an open note
  When the editor body renders
  Then the markdown surface has no boxed border and content is constrained to a readable measure (~72ch, centered)

#### Scenario: Floating toolbar restyle
  Given text selected in the editor
  When the selection toolbar appears
  Then it uses the shared floating-chrome surface (elevated bg, border, radius, shadow) — not a dark hardcoded background
  And bold/italic/strikethrough/code buttons show accent active states

#### Scenario: Toolbar disappears on collapse
  Given the floating toolbar is visible
  When the selection collapses
  Then the toolbar is removed

### Feature: Task-link picker

#### Scenario: Unlinked chip trigger
  Given a note with no linked task
  When the editor renders
  Then a quiet dashed chip with a link icon reads "Link to task…"

#### Scenario: Linked chip with unlink
  Given a note linked to task "Fix login"
  When the editor renders
  Then a chip shows "Fix login" and hovering reveals an unlink action

#### Scenario: Keyboard-navigable dropdown
  Given the picker dropdown is open with 3 matching tasks
  When the user presses ArrowDown twice and Enter
  Then the second task is linked

#### Scenario: Empty search result
  Given the dropdown is open
  When the search matches nothing
  Then a one-line "No tasks found" message renders

### Feature: Archive list

#### Scenario: Archived row anatomy
  Given an archived note
  When the archive view renders
  Then the row shows title/preview/time in the new list language with quiet restore and danger permanent-delete actions
  And restore/permanent-delete behave as before

### Feature: Regression

#### Scenario: Full behavior preservation
  Given the redesigned notes UI
  When the full web test suite runs
  Then all tests pass (store, sidebar compact contract, layout)

## Tasks

### ICT-1: Promote floating-chrome to shared style + notes icons
- **What**: Move `features/diagrams/diagram-chrome.css` to `src/styles/floating-chrome.css` (keep class name; update diagram import or leave a re-exporting stub so diagrams unaffected). Create notes-local `icons.ts` (pin, note/empty-state, link, unlink, restore, back/chevron, plus; reuse IconTrash from diagrams or duplicate) following the diagram icon factory pattern.
- **Where**: `apps/web/src/styles/floating-chrome.css` (new), `apps/web/src/features/diagrams/diagram-chrome.css`, `apps/web/src/features/notes/icons.ts` (new)
- **Validated by**: Floating toolbar restyle (foundation)
- **Estimate**: S

### ICT-2: Master–detail NotesView layout
- **What**: Two-pane grid ≥900px (list pane ~300px + editor pane); single-pane routing behavior <900px with back affordance in editor; route/selection sync unchanged; "New note" topbar teleport kept.
- **Where**: `apps/web/src/views/NotesView.vue`
- **Validated by**: Two panes on wide viewport; Single pane on narrow viewport; Back affordance returns to list
- **Estimate**: M

### ICT-3: NoteList full-mode refresh + empty/loading states
- **What**: Refresh full-mode rows (title/preview/time/pin, spaced radius rows, accent selected rail, quiet delete kept); CSS-only skeleton rows for loading; empty state with icon + prompt + create button (emit `create`). MUST preserve compact-contract class names (`note-item`, `note-item__title`, `note-item__preview`, `note-item__time`, `note-item__pin`, `note-item--selected`) so DefaultLayout `:deep` overrides keep working — verify sidebar rendering.
- **Where**: `apps/web/src/features/notes/NoteList.vue`, layout sidebar verification
- **Validated by**: Row anatomy; Selected row styling; Quiet delete preserved; List empty state; List loading skeleton; Sidebar embed unchanged
- **Estimate**: M

### ICT-4: NoteEditor header redesign + empty state
- **What**: Single header row: borderless large title input, right cluster (pin icon toggle with accent filled state, save-status dot+label, primary Save disabled-when-clean, quiet discard/delete icons, two-step inline delete confirm). Editor-pane empty state (icon, prompt, New note button). Preserve dirty tracking, aria-live, all store calls.
- **Where**: `apps/web/src/features/notes/NoteEditor.vue`
- **Validated by**: Header anatomy; Pin toggle state; Save status reflects dirty state; Two-step delete; Editor empty state
- **Estimate**: M

### ICT-5: Markdown surface + floating toolbar restyle
- **What**: Borderless writing surface, ~72ch centered measure, subtle focus treatment; selection toolbar adopts floating-chrome class, consistent icons, accent active states, tooltips with shortcut hints; toolbar positioning/show-hide logic untouched.
- **Where**: `apps/web/src/features/editor/MilkdownEditor.vue`
- **Validated by**: Borderless writing surface; Floating toolbar restyle; Toolbar disappears on collapse
- **Estimate**: M

### ICT-6: TaskLinkPicker chip + dropdown redesign
- **What**: Dashed quiet chip (unlinked) / task-name chip with hover-revealed unlink (linked); dropdown on floating-chrome surface with integrated search, ArrowUp/Down + Enter keyboard navigation, empty-result message; correct listbox/option ARIA.
- **Where**: `apps/web/src/features/notes/TaskLinkPicker.vue`
- **Validated by**: Unlinked chip trigger; Linked chip with unlink; Keyboard-navigable dropdown; Empty search result
- **Estimate**: M

### ICT-7: ArchivedNoteList alignment
- **What**: Restyle archived rows to the new list language (title/preview/time, quiet restore, danger permanent-delete); behavior unchanged.
- **Where**: `apps/web/src/features/archive/ArchivedNoteList.vue`
- **Validated by**: Archived row anatomy
- **Estimate**: S

### ICT-8: Tests + regression + a11y/theme pass
- **What**: Add component tests for NoteList (rows, selected, empty, skeleton, compact contract classes), NoteEditor header (pin, dirty/save states, two-step delete), TaskLinkPicker (keyboard nav, empty result) — none existed before. Run full apps/web suite; fix markup-only breaks. Static a11y audit (names, focus-visible, aria-live, reduced motion); dark+light token check; verify sidebar compact pixel-unchanged.
- **Where**: `apps/web/src/features/notes/__tests__/` (new), full suite
- **Validated by**: Full behavior preservation (+ all scenarios above)
- **Estimate**: M

## Open questions
- Wide layout: in-view list pane coexists with sidebar notes panel (assumed both kept; sidebar = quick-nav).
- Autosave out of scope this pass (manual save kept).

## Dependencies
- spec-15 floating-chrome pattern (`diagram-chrome.css`) — available
- `@tasknote/ui` Button/Input/Tooltip/DropdownMenu — available
- tokens.css — available
- No backend/API/store changes
