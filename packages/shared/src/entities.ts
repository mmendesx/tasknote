// Domain entity types — plain TS interfaces representing in-memory/ORM-hydrated shapes.
// These are NOT Zod-validated; they describe the data after it leaves the DB.

import type { PRIORITY_VALUES, THEME_VALUES, TARGET_TYPE_VALUES } from './constants.js';
import type { DiagramScene } from './dtos.js';

export type Priority = (typeof PRIORITY_VALUES)[number];
export type Theme = (typeof THEME_VALUES)[number];
export type TargetType = (typeof TARGET_TYPE_VALUES)[number];

export interface Settings {
  id: 1;
  display_name: string | null;
  theme: Theme;
  accent: string;
  default_board_id: number | null;
  onboarded_at: string | null;
  timezone: string;
}

export interface Board {
  id: number;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Column {
  id: number;
  board_id: number;
  name: string;
  color: string;
  wip_limit: number | null;
  is_done: boolean;
  position: number;
}

export interface Task {
  id: number;
  column_id: number;
  title: string;
  description_md: string | null;
  priority: Priority;
  due_date: string | null;
  committed_on?: string | null;
  position: number;
  archived_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  tag_ids?: number[];
}

export interface Note {
  id: number;
  task_id: number | null;
  title: string;
  body_md: string;
  pinned: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface TaskTag {
  task_id: number;
  tag_id: number;
}

export interface FileRef {
  id: number;
  target_type: TargetType;
  target_id: number;
  path: string;
  label: string;
  note: string | null;
  created_at: string;
}

export interface Diagram {
  id: number;
  title: string;
  scene_json: DiagramScene;
  created_at: string;
  updated_at: string;
}

// ─── Nested / aggregate types ────────────────────────────────────────────────

export interface ColumnWithTasks extends Column {
  tasks: Task[];
}

export interface BoardWithColumns extends Board {
  columns: ColumnWithTasks[];
}

// ─── Response envelopes ───────────────────────────────────────────────────────

export interface SearchResponse {
  tasks: Task[];
  notes: Note[];
  files: FileRef[];
}
