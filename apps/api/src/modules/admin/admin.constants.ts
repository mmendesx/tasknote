// Per-table column allowlists — only these keys may appear in import rows.
// Derived from entity definitions; must cover every column SELECT * returns.
export const COLUMN_ALLOWLISTS: Record<string, Set<string>> = {
  boards: new Set(['id', 'name', 'position', 'created_at', 'updated_at']),
  columns: new Set(['id', 'board_id', 'name', 'color', 'wip_limit', 'is_done', 'position']),
  tasks: new Set([
    'id', 'column_id', 'title', 'description_md', 'priority', 'due_date',
    'position', 'archived_at', 'completed_at', 'created_at', 'updated_at',
  ]),
  notes: new Set([
    'id', 'task_id', 'title', 'body_md', 'pinned', 'archived_at',
    'created_at', 'updated_at',
  ]),
  tags: new Set(['id', 'name', 'color']),
  task_tags: new Set(['task_id', 'tag_id']),
  file_refs: new Set([
    'id', 'target_type', 'target_id', 'path', 'label', 'note', 'created_at',
  ]),
  settings: new Set([
    'id', 'display_name', 'theme', 'accent', 'default_board_id',
    'onboarded_at', 'timezone',
  ]),
};

// FK-safe delete order: child tables before parents.
// Must contain every key in COLUMN_ALLOWLISTS exactly once.
export const DELETE_ORDER: (keyof typeof COLUMN_ALLOWLISTS)[] = [
  'task_tags',
  'file_refs',
  'notes',
  'tasks',
  'tags',
  'columns',
  'boards',
  'settings',
];

if (DELETE_ORDER.length !== Object.keys(COLUMN_ALLOWLISTS).length) {
  throw new Error(
    `DELETE_ORDER drift: expected ${Object.keys(COLUMN_ALLOWLISTS).length} tables, got ${DELETE_ORDER.length}`,
  );
}
