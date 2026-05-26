# PRD: Task, Board & Notes Enhancements
**Spec**: tasks/specs/spec-2-task-board-notes-enhancements.md
**Date**: 2026-05-24

---

## BDD Scenarios

### Feature 1 — Add Task (KanbanColumn wire-up)

**Scenario 1.1 — Footer button activates quick-add**
```
Given a board is loaded with at least one column
When the user clicks "Add task" in a column's footer
Then QuickAddTaskInput becomes visible inside that column
And the input is focused and empty
```

**Scenario 1.2 — Submit creates task**
```
Given QuickAddTaskInput is active in column "Todo"
When the user types "Fix login bug" and presses Enter
Then a new task "Fix login bug" appears at the top of column "Todo"
And QuickAddTaskInput is hidden
```

**Scenario 1.3 — Cancel hides quick-add**
```
Given QuickAddTaskInput is active
When the user presses Escape
Then QuickAddTaskInput is hidden
And no task is created
```

**Scenario 1.4 — 'n' shortcut still works**
```
Given column "Todo" is focused (user clicked inside it)
When the user presses 'n'
Then QuickAddTaskInput becomes active for column "Todo"
```

### Feature 2 — Delete Board

**Scenario 2.1 — Delete icon appears on hover**
```
Given the sidebar shows a board named "My Board"
When the user hovers over the board row
Then a trash icon appears on the right side of the row
```

**Scenario 2.2 — Confirm then delete**
```
Given the sidebar shows "My Board" with the delete icon visible
When the user clicks the trash icon
Then a confirmation prompt appears inline ("Delete?")
When the user clicks "Confirm"
Then the board is removed from the sidebar
And the user is redirected to another board or "/"
```

**Scenario 2.3 — Cancel aborts deletion**
```
Given the confirmation prompt is visible for "My Board"
When the user clicks "Cancel"
Then the board row returns to normal
And the board still exists
```

### Feature 3 — Rename Board

**Scenario 3.1 — Double-click enters edit mode**
```
Given a board "Old Name" in the sidebar
When the user double-clicks the board name
Then an input field appears in place of the name
And the input is pre-filled with "Old Name" and text is selected
```

**Scenario 3.2 — Enter saves the new name**
```
Given the inline board name input shows "Old Name"
When the user types "New Name" and presses Enter
Then the board name updates to "New Name" in the sidebar
And in the page header
```

**Scenario 3.3 — Escape cancels**
```
Given the inline board name input is active
When the user presses Escape
Then the original name is restored
And no API call is made
```

**Scenario 3.4 — Empty name rejected**
```
Given the inline board name input is active
When the user clears the input and presses Enter
Then the original name is restored
And no API call is made
```

### Feature 4 — Fix Milkdown Editor

**Scenario 4.1 — Editor renders content on mount**
```
Given a note with body "## Hello\nWorld"
When the user opens the note in NoteEditor
Then the Milkdown editor displays the formatted content
And text is visible (not blank)
```

**Scenario 4.2 — Typing emits update**
```
Given Milkdown is mounted with model-value "Hello"
When the user types " World" at the end
Then the editor emits update:modelValue with "Hello World"
```

**Scenario 4.3 — Switching notes re-initialises editor**
```
Given note A is open in the editor
When the user selects note B from the list
Then the editor remounts (key=note.id) with note B's content
And note A's content is not visible
```

### Feature 5 — Delete Icon on Notes List

**Scenario 5.1 — Trash icon appears on hover**
```
Given the notes list shows a note "Meeting notes"
When the user hovers over the note row
Then a trash icon appears on the right side
```

**Scenario 5.2 — Click deletes the note**
```
Given the trash icon is visible for "Meeting notes"
When the user clicks the trash icon
Then "Meeting notes" is removed from the list
And no confirmation dialog is shown
```

**Scenario 5.3 — Delete selected note clears editor**
```
Given "Meeting notes" is currently selected and shown in NoteEditor
When the user clicks the trash icon on the "Meeting notes" row
Then the note disappears from the list
And the NoteEditor shows the empty state
```

**Scenario 5.4 — Click does not navigate to note**
```
Given the notes list
When the user clicks the trash icon on any note row
Then the row's @click handler is NOT triggered
And the selection does not change (unless it was the selected note)
```

---

## ICT Tasks

### ICT-29 — Wire QuickAddTaskInput into KanbanColumn
**Size**: S
**Files**: `apps/web/src/features/board/KanbanColumn.vue`

**Tasks**:
1. Import `QuickAddTaskInput`, `useFocusedColumn`, `useCurrentBoardStore`.
2. Call `useFocusedColumn()` and `useCurrentBoardStore()` in `<script setup>`.
3. Add `@click="focusColumn(column.id)"` on the outermost `<section>` (not on task cards — use `.self` modifier or guard inside handler).
4. Mount `<QuickAddTaskInput :column-id="column.id" :active="quickAddActiveColumnId === column.id" @submit="onQuickAddSubmit" @cancel="clearQuickAdd" />` above the task list (inside `.kanban-column__tasks` div, before the `v-for`).
5. Wire the footer `<Button>` `@click` to `activateQuickAdd(column.id)`.
6. Implement `onQuickAddSubmit(title: string)` → `currentBoardStore.createTask(column.id, { title, priority: 'medium', column_id: column.id })` then `clearQuickAdd()`.

**Acceptance**: Scenario 1.1, 1.2, 1.3, 1.4 pass.

---

### ICT-30 — Delete Board from Sidebar
**Size**: S
**Files**: `apps/web/src/layouts/DefaultLayout.vue`

**Tasks**:
1. Add `deletingBoardId = ref<number | null>(null)` state.
2. Per board row: add trash icon button (right side, visible on row hover).
3. First click on trash: set `deletingBoardId = board.id` (shows inline "Delete? Confirm / Cancel").
4. Confirm: call `boardsStore.remove(board.id)`, then redirect — if current route is `/b/${board.id}`, push to next board or `/`.
5. Cancel: set `deletingBoardId = null`.
6. Add row-level hover CSS to show the trash button.

**Acceptance**: Scenarios 2.1, 2.2, 2.3 pass.

---

### ICT-31 — Rename Board from Sidebar
**Size**: S
**Files**: `apps/web/src/layouts/DefaultLayout.vue`

**Tasks**:
1. Add `editingBoardId = ref<number | null>(null)`, `editingBoardName = ref('')`.
2. Per board row: on `@dblclick` of the name element, set `editingBoardId = board.id`, `editingBoardName = board.name`; `nextTick` → focus the input.
3. Render: when `editingBoardId === board.id`, show `<input>` instead of `<span>`.
4. `@keydown.enter`: if `editingBoardName.trim()` is non-empty, call `boardsStore.update(board.id, { name: editingBoardName.trim() })`, then clear edit state.
5. `@keydown.escape` and `@blur`: clear edit state without saving.
6. Empty name guard: revert.

**Acceptance**: Scenarios 3.1, 3.2, 3.3, 3.4 pass.

---

### ICT-32 — Fix Milkdown Editor
**Size**: M
**Files**: `apps/web/src/features/editor/MilkdownEditor.vue`, `apps/web/src/styles/main.css`, `apps/web/package.json`

**Tasks**:
1. Diagnose: check browser console for Milkdown mount errors. Likely causes: missing base CSS or `prism` import error.
2. Add Milkdown's base CSS. Check if `@milkdown/theme-nord` or `@milkdown/prose` is installed:
   ```bash
   ls apps/web/node_modules/@milkdown/
   ```
   Import the prose base: `import '@milkdown/prose/style/index.css'` in `MilkdownEditor.vue` or `main.css`.
3. Remove the `prism` plugin temporarily — it's optional syntax highlighting. If removing it fixes the editor, leave it out and add back only if PrismJS CSS is also imported.
4. Verify `@milkdown/vue`, `@milkdown/core`, `@milkdown/preset-commonmark`, `@milkdown/preset-gfm`, `@milkdown/plugin-listener`, `@milkdown/plugin-history`, `@milkdown/plugin-clipboard` are all installed and version-compatible.
5. If `gfm` causes issues (requires `@milkdown/plugin-math`), make it optional or install the peer dep.
6. Test: open a note with markdown content; verify text renders.

**Acceptance**: Scenarios 4.1, 4.2, 4.3 pass.

---

### ICT-33 — Delete Icon on Notes List
**Size**: S
**Files**: `apps/web/src/features/notes/NoteList.vue`, `apps/web/src/views/NotesView.vue`

**Tasks**:
1. In `NoteList.vue`:
   - Import `useNotesStore`.
   - Call `const notesStore = useNotesStore()`.
   - Add new emit: `deleted: [id: number]`.
   - Per note row, add a trash icon `<button>` (right side of `.note-item__header`).
   - `@click.stop="handleDelete(note.id)"`.
   - `handleDelete(id)`: call `notesStore.softDelete(id)`, emit `'deleted', id`.
   - CSS: `.note-item__del` hidden by default, visible on `.note-item:hover`, red on own hover.

2. In `NotesView.vue`:
   - Handle `@deleted="onNoteDeleted"` on `<NoteList>`.
   - `onNoteDeleted(id)`: if `selectedNoteId === id`, set `selectedNoteId = null`.

**Acceptance**: Scenarios 5.1, 5.2, 5.3, 5.4 pass.

---

## Task Order

```
ICT-32 (fix Milkdown — independent, unblocks notes editing UX)
ICT-29 (wire add task — independent)
ICT-30 (delete board)
ICT-31 (rename board)   ← ICT-30 + ICT-31 share DefaultLayout, do sequentially
ICT-33 (delete note icon — independent)
```

ICT-32 first because it unblocks the core editing experience. ICT-29 and ICT-33 are fully independent. ICT-30 and ICT-31 both edit `DefaultLayout.vue` — do them sequentially to avoid merge conflicts.

---

## Summary

| ICT | Feature | Size | Files |
|-----|---------|------|-------|
| ICT-29 | Wire QuickAddTaskInput | S | KanbanColumn.vue |
| ICT-30 | Delete board from sidebar | S | DefaultLayout.vue |
| ICT-31 | Rename board inline | S | DefaultLayout.vue |
| ICT-32 | Fix Milkdown editor | M | MilkdownEditor.vue, main.css |
| ICT-33 | Delete icon on notes list | S | NoteList.vue, NotesView.vue |

**5 tasks** (4S + 1M). All backend already in place.
