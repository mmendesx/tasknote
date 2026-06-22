# Spec: Notes feature UI/UX redesign

## Overview
Full presentation-layer redesign of the notes feature — list, editor, markdown toolbar, task-link picker, empty states, archive list — toward the professional, minimalist design language established by the diagram redesign (spec-15: floating chrome, token-driven surfaces, quiet hover-revealed actions, consolidated top-bar status). Behavior, store, API, and routing are preserved.

## Actors
- End user reading/writing/pinning/linking/deleting notes (desktop + mobile drawer)
- Existing test suite (store tests + layout/sidebar tests) that must keep passing

## Functional requirements

### FR-1: Master–detail notes layout
`NotesView` becomes a two-pane layout on ≥900px: left pane = in-view notes list (reusing `NoteList`, full mode), right pane = editor. Below 900px, single pane: list at `/notes`, editor at `/notes/:id` with back affordance. Selection syncs with the route as today. Sidebar embed of `NoteList` (compact mode in DefaultLayout) untouched.

### FR-2: Notes list visual refresh
Full-mode `NoteList` rows: derived title (primary), one-line preview (secondary, ellipsis), relative time (muted, right-aligned or below), pin indicator as small accent icon. Selected row = elevated background + accent left rail (2px accent, replacing muted rail). Hover-revealed quiet delete preserved. Dividers removed in favor of spacing + radius rows (cards-lite, like diagram list tiles).

### FR-3: Editor header redesign
NoteEditor toolbar becomes a single clean header row: title input (borderless, large, placeholder "Untitled"), then right cluster: pin toggle (icon button, filled accent when pinned), save-status indicator (dot + label pattern from diagrams top bar: muted "Saved" / italic→accent "Unsaved" / on explicit save "Saving…"), Save button (primary, disabled when clean), overflow or inline quiet icon buttons for Discard and Delete. Delete keeps two-step confirm, restyled as inline danger confirm matching diagram patterns.

### FR-4: Markdown surface
MilkdownEditor host: borderless writing surface (no boxed border) — editor fills the pane with comfortable measure (max-width ~72ch, centered), subtle focus treatment instead of accent box-shadow. Floating selection toolbar restyled with the shared floating-chrome surface (elevated bg, 1px border, `--radius-card`, soft shadow) replacing the hardcoded dark background; buttons get consistent 20px icons, accent active state, tooltips with shortcut hints.

### FR-5: Task-link picker
TaskLinkPicker dropdown adopts floating-chrome surface. Trigger states: unlinked = quiet dashed chip with link icon; linked = chip showing task name with hover-revealed unlink. Search input integrated at top of dropdown, keyboard navigable (arrow keys + Enter), empty result state with one-line message.

### FR-6: Empty & loading states
- Editor empty state (`/notes`, no selection on wide layout): centered icon + one-line prompt + "New note" button
- List empty state: icon + prompt + create button (mirrors diagram list empty state)
- Loading states: skeleton rows in list (2–3), subtle inline spinner in editor — no full-pane "Loading…" text

### FR-7: Archive notes list alignment
`ArchivedNoteList` restyled to match the new list language (rows with title/preview/time, quiet restore + danger permanent-delete actions). Behavior unchanged.

### FR-8: Behavior preservation
No changes to: store actions/signatures, API, routes, manual-save model, dirty tracking, soft-delete/restore flow, sidebar compact rendering (`.nav-notes__panel :deep` contract — class names `note-item`, `note-item__title`, `note-item__preview`, `note-item__time`, `note-item__pin`, `note-item--selected` must remain). Existing tests pass (markup-only assertion updates allowed).

## Technical requirements

### Architecture
Presentation-only: `apps/web/src/features/notes/*.vue`, `apps/web/src/features/editor/MilkdownEditor.vue` (styles + toolbar markup only, not editor wiring), `apps/web/src/views/NotesView.vue`, `apps/web/src/features/archive/ArchivedNoteList.vue`. Store (`stores/notes.ts`), api, router untouched.

### Data model / API contracts
None.

### UI structure
- `NotesView.vue` → two-pane grid (list pane ~300px + editor pane), responsive single-pane <900px
- `NoteList.vue` → refreshed full-mode styles; compact sidebar class contract preserved verbatim
- `NoteEditor.vue` → header row redesign, borderless title, status indicator, icon actions
- `MilkdownEditor.vue` → floating toolbar restyle (reuse `features/diagrams/diagram-chrome.css` class — promote it to a shared location `src/styles/floating-chrome.css` and keep a re-export/import so diagrams keep working)
- `TaskLinkPicker.vue` → chip trigger + floating-chrome dropdown
- Icons: extend the diagram `icons.ts` pattern with a notes-local `icons.ts` (pin, note, link, unlink, restore, trash reuse) or promote shared icons — implementer's call, no new deps
- Tokens only; dark + light verified; `prefers-reduced-motion` honored on any new transitions

## Non-functional requirements
- **Accessibility**: all controls keyboard-reachable with accessible names; focus-visible rings; aria-live preserved on status text; two-step delete announces state; dropdown ARIA (listbox/option or menu) correct
- **Performance**: no new watchers/re-render hot paths; skeletons CSS-only
- **Compatibility**: mobile drawer flow intact; sidebar compact list pixel-unchanged

## Dependencies
- `diagram-chrome.css` / floating-chrome pattern — available (spec-15)
- `@tasknote/ui` primitives (Button, Input, Tooltip, DropdownMenu) — available
- tokens.css — available

## Constraints
- No new runtime dependencies; Milkdown stays
- No autosave introduction (manual save model kept this pass)
- Sidebar `:deep` styling contract in DefaultLayout must not break (note-item class names stable)
- Keep diffs presentation-scoped; no store/composable logic changes

## Open questions
- List pane on wide layout duplicates sidebar notes panel. Assumption: keep both (sidebar panel is quick-nav; in-view list is primary). Alternative: hide sidebar notes expansion on /notes routes — deferred.
- Autosave explicitly out of scope (would change save semantics) — flag for future spec if wanted.
