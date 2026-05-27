# spec-4 — Review follow-ups (non-blocking polish)

**Source**: non-blocking suggestions from `/review` of commit `2909336` (ICT-29..47 audit remediation).

Scope is minor hardening — no behavior change visible to users, but reduces risk of subtle bugs and tightens code quality.

---

## Goals

1. Make `due_date` parsing on the frontend robust to either backend format (raw `YYYY-MM-DD` or full ISO).
2. Tighten ARIA semantics on the TaskCard tags container.
3. Reduce O(N²) Map rebuilds in the notes store.
4. Batch file_refs deletes in board cascade to one query.
5. Eliminate drift between admin allowlist and admin table-delete loop.

Out of scope:
- Any new UI features.
- Any new endpoints.
- Refactors larger than each bullet implies.

---

## Functional requirements

### FR-1 — Robust due_date parsing in TaskCard

- `apps/web/src/features/board/TaskCard.vue` `formatDueDate` (and any other `new Date(props.task.due_date)` call) MUST handle both:
  - Full ISO string (`2026-06-15T12:00:00.000Z`)
  - Raw `YYYY-MM-DD` calendar day
- Implementation: take `slice(0, 10)` first, then construct `new Date(slice + 'T12:00:00Z')`. Always parses at noon UTC, dodges DST/TZ day-flip.
- Other components reading `due_date` (BoardView, TaskDrawer loader) already use `slice(0, 10)` — leave alone.

### FR-2 — TaskCard tags container role

- `apps/web/src/features/board/TaskCard.vue` `.task-card__tags` element MUST have `role="group"` in addition to the existing `aria-label="Tags: …"`.
- Dots remain `aria-hidden="true"`.
- Empty-tags case: no role/label rendered (avoid empty group announcement).

### FR-3 — Notes store: single Map rebuild per update

- `apps/web/src/stores/notes.ts` MUST NOT call `byTask.value = new Map(byTask.value)` inside loops over notes.
- Pattern: build all changes in a local Map, assign once at the end of the function.
- Applies to `update`, `softDelete`, `restore`, and any other method that mutates per-task slots.
- Reactivity preserved by single assignment (which is the only thing Pinia needs to trigger).

### FR-4 — Boards cascade: batched file_refs delete

- `apps/api/src/modules/boards/boards.service.ts` `removeBoard` MUST collect descendant task IDs and note IDs first, then call `FileRefsService.deleteAllForBatch(targetType, ids[], manager)` ONCE per type.
- Add new method `FileRefsService.deleteAllForBatch(targetType: string, targetIds: number[], manager?: EntityManager): Promise<void>` that runs a single `DELETE FROM file_refs WHERE target_type = ? AND target_id IN (?)`.
- Existing `deleteAllFor(targetType, targetId, manager?)` stays for single-id call sites.
- Reduces N round-trips to 2 (one for tasks' refs, one for notes' refs).

### FR-5 — Admin: derive table-delete list from allowlist

- `apps/api/src/modules/admin/admin.service.ts` MUST derive the table list used in the reset/delete path from the same `COLUMN_ALLOWLISTS` keys, not a separate hard-coded array.
- Order MUST respect FK dependencies (child tables first): `task_tags`, `file_refs`, `notes`, `tasks`, `tags`, `columns`, `boards`, `settings`.
- Solution: keep `COLUMN_ALLOWLISTS` as source of truth, define an explicit `DELETE_ORDER: (keyof typeof COLUMN_ALLOWLISTS)[]` constant, assert at module-load that `DELETE_ORDER` length === Object.keys(COLUMN_ALLOWLISTS).length (catches drift on new table add).

---

## Non-functional requirements

- **NFR-1** All existing tests pass. No regressions.
- **NFR-2** `pnpm --filter @tasknote/web exec vite build` + `pnpm --filter @tasknote/api build` both pass.
- **NFR-3** No new dependencies.
- **NFR-4** Each FR mapped to either a new test or an extended existing test.

---

## Dependencies

- All changes touch already-modified files from spec-3.
- No migration needed.

---

## Open questions

None.
