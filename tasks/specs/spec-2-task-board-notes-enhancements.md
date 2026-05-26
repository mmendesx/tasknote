# Spec: Task, Board & Notes Enhancements

## Overview
Seven incremental improvements to the existing TaskNote application. All frontend work targets the Vue 3 web app in `apps/web/`. No new API endpoints required — all backend contracts already exist.

---

## Feature 1: Wire up Add Task (KanbanColumn)

### Problem
`KanbanColumn.vue` has a dead `<Button class="add-task-btn">Add task</Button>` footer with no click handler and no integration with `QuickAddTaskInput`. The `QuickAddTaskInput` component already exists and is fully implemented. The `useFocusedColumn` composable already manages `quickAddActiveColumnId`. The `currentBoardStore.createTask()` method already exists.

### Requirements
- FR-1.1: Clicking "Add task" in a column footer activates `QuickAddTaskInput` for that column.
- FR-1.2: `QuickAddTaskInput` receives `:active="quickAddActiveColumnId === column.id"` and autofocuses.
- FR-1.3: `@submit` from `QuickAddTaskInput` calls `currentBoardStore.createTask(column.id, { title, priority: 'medium', column_id: column.id })`.
- FR-1.4: `@cancel` from `QuickAddTaskInput` calls `clearQuickAdd()`.
- FR-1.5: Clicking the column body (not a task card) sets `focusedColumnId` via `focusColumn(column.id)`.
- FR-1.6: Pressing `n` when a column is focused also activates quick-add (already wired in `useShortcuts` — must remain working).
- FR-1.7: The "Add task" button shows as a full-width ghost trigger in the column footer.

### Non-functional
- No layout changes to `KanbanColumn.vue` beyond integrating the inputs.
- Optimistic insert already handled by `currentBoardStore.createTask`.

### Files
- `apps/web/src/features/board/KanbanColumn.vue` — add imports, `useFocusedColumn`, `useCurrentBoardStore`, wire footer button and `QuickAddTaskInput`.
- No store changes needed.

---

## Feature 2: Delete Board

### Problem
No UI to delete a board. The `boardsStore.remove(id)` method already exists. After deletion the user must be redirected (the deleted board's route would 404).

### Requirements
- FR-2.1: Each board row in the sidebar shows a delete icon (trash SVG) on hover.
- FR-2.2: Clicking the delete icon on the currently-active board shows a confirmation dialog before deletion.
- FR-2.3: Clicking the delete icon on any board requires confirmation (same dialog/inline confirm).
- FR-2.4: On confirm: call `boardsStore.remove(id)`, then redirect to the next available board or `/` (root).
- FR-2.5: If only one board exists, deletion is still allowed; redirect to `/` (empty state).
- FR-2.6: The delete icon is 16×16, red on hover, accessible with `aria-label="Delete board"`.
- FR-2.7: Confirmation uses a two-step inline pattern (same as `NoteEditor.vue` delete confirm).

### Files
- `apps/web/src/layouts/DefaultLayout.vue` — add delete button per board row + confirm state.

---

## Feature 3: Rename Board

### Problem
No UI to rename a board. `boardsStore.update(id, { name })` exists.

### Requirements
- FR-3.1: Double-clicking a board name in the sidebar enters inline edit mode.
- FR-3.2: An `<input>` replaces the board name text, pre-filled with the current name, auto-selected.
- FR-3.3: `Enter` or blur saves via `boardsStore.update(id, { name: newName.trim() })`.
- FR-3.4: `Escape` cancels without saving.
- FR-3.5: Empty name on submit is rejected (reverts to prior name silently).
- FR-3.6: The column header `<h2 class="kanban-column__name">` on the board view is read-only (rename only via sidebar to keep scope small).

### Files
- `apps/web/src/layouts/DefaultLayout.vue` — add `editingBoardId` ref, inline input per board row.

---

## Feature 4: Fix Milkdown Editor

### Problem
`MilkdownEditor.vue` is fully implemented (commonmark + gfm + listener + history + clipboard + prism) but is not visually working when rendered inside `NoteEditor.vue`. Root cause candidates:
1. **`prism` plugin** — requires PrismJS CSS loaded globally; without it the editor may fail to mount silently.
2. **CSS not injected** — Milkdown requires its own theme CSS (`@milkdown/theme-nord` or similar); the component relies only on `:deep()` scoped overrides which may not be sufficient without the Milkdown prosemirror base styles.
3. **`gfm` plugin** missing peer** — `@milkdown/preset-gfm` depends on `@milkdown/plugin-math` which may not be installed.
4. **`prism` import fails** — `prism` plugin import from `@milkdown/plugin-prism` may have changed.

### Requirements
- FR-4.1: Milkdown editor renders the markdown content passed via `:model-value` on mount.
- FR-4.2: Typing in the editor emits `update:modelValue` with the current markdown string.
- FR-4.3: Switching notes (key change) re-initialises the editor with the new note's content.
- FR-4.4: Editor is not blank/invisible on first render.
- FR-4.5: Remove or isolate the `prism` plugin if it is causing mount failure; syntax highlighting is optional.
- FR-4.6: Add Milkdown's prosemirror base CSS import.

### Non-functional
- Keep the existing plugin stack; only remove `prism` if it is the confirmed blocker.
- Do not downgrade Milkdown packages without diagnosing first.

### Files
- `apps/web/src/features/editor/MilkdownEditor.vue`
- `apps/web/src/styles/main.css` or a new `milkdown.css` import
- `apps/web/package.json` — add/verify `@milkdown/theme-nord` or `@milkdown/prose` if missing

---

## Feature 5: Delete Icon on Notes List

### Problem
`NoteList.vue` shows notes in the sidebar list but has no per-row delete action. Users must open a note in the editor and use the editor's delete flow (two extra clicks). `notesStore.softDelete(id)` exists.

### Requirements
- FR-5.1: Each note row in `NoteList.vue` shows a trash icon on hover (right side).
- FR-5.2: Clicking the trash icon soft-deletes the note via `notesStore.softDelete(id)`.
- FR-5.3: No confirmation required for the list-row delete (fast delete UX; archive is reversible).
- FR-5.4: If the deleted note is currently selected, emit `select` with `null` or the next available note id.
- FR-5.5: The icon is 14×14, muted by default, red on hover, `aria-label="Delete note"`.
- FR-5.6: Click on the trash icon must not bubble to the row's `@click` (i.e. `@click.stop`).

### Files
- `apps/web/src/features/notes/NoteList.vue`
- Possibly `apps/web/src/views/NotesView.vue` — to receive the `deleted` event and clear `selectedNoteId`.

---

## Feature 6: Delete Icon on Board List (Sidebar)

Already covered in Feature 2 (FR-2.1–2.7). No separate feature needed; consolidated.

---

## Dependencies
- All API endpoints exist (`DELETE /boards/:id`, `PATCH /boards/:id`, `POST /tasks`, `DELETE /notes/:id`).
- No new packages needed except possibly Milkdown CSS.
- All stores (`boardsStore`, `currentBoardStore`, `notesStore`) have the required methods.

## Out of Scope
- Column rename (out of scope for this batch)
- Undo/redo for delete operations
- Board reorder via sidebar drag (already works via column DnD)
- Note list reorder
