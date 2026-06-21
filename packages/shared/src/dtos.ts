// Zod schemas for all Create/Update/Move/Reorder DTOs.
// TS types are inferred from schemas via z.infer.
// Date fields over the wire use ISO 8601 strings (z.string().datetime()).
// Update schemas are derived from base schemas via .partial() — defaults live only on Create.

import { z } from 'zod';
import {
  PRIORITY_VALUES,
  THEME_VALUES,
  TARGET_TYPE_VALUES,
  SEED_VALUES,
  MAX_TITLE_LENGTH,
  FORBIDDEN_PATH_CHARS,
  ABSOLUTE_PATH_PATTERN,
} from './constants.js';

// ─── Re-usable field building blocks ─────────────────────────────────────────

const titleField = z
  .string()
  .min(1, 'Title is required')
  .max(MAX_TITLE_LENGTH, `Title must be ≤${MAX_TITLE_LENGTH} characters`);

const isoDateField = z.string().datetime({ message: 'Must be a valid ISO 8601 date-time string' });

// A YYYY-MM-DD calendar day that is also a REAL date.
// The bare regex validates shape only — "2026-13-40" passes it but is not a date,
// and "2026-02-30" silently rolls over to Mar 2 when parsed. The round-trip refine
// rejects both: the parsed day re-serialized must equal the input.
const calendarDayField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date string')
  .refine((s) => {
    const d = new Date(`${s}T12:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Must be a real calendar date');

// Accepts either YYYY-MM-DD (calendar day) or a full ISO 8601 datetime string (backward compat).
const calendarOrIsoDateField = z.union([calendarDayField, isoDateField]);

const priorityField = z.enum(PRIORITY_VALUES);
const themeField = z.enum(THEME_VALUES);
const targetTypeField = z.enum(TARGET_TYPE_VALUES);
const seedField = z.enum(SEED_VALUES);

// ─── Board DTOs ───────────────────────────────────────────────────────────────

const boardBase = z.object({
  name: z.string().min(1, 'Board name is required').max(100),
  position: z.number().int().nonnegative().optional(),
});

export const CreateBoardDtoSchema = boardBase;
export const UpdateBoardDtoSchema = boardBase.partial();

export type CreateBoardDto = z.infer<typeof CreateBoardDtoSchema>;
export type UpdateBoardDto = z.infer<typeof UpdateBoardDtoSchema>;

// ─── Column DTOs ──────────────────────────────────────────────────────────────

const columnBase = z.object({
  board_id: z.number().int().positive(),
  name: z.string().min(1, 'Column name is required').max(100),
  color: z.string().min(1),
  wip_limit: z.number().int().positive().nullable().optional(),
  is_done: z.boolean().optional(),
  position: z.number().int().nonnegative().optional(),
});

export const CreateColumnDtoSchema = columnBase;
export const UpdateColumnDtoSchema = columnBase.omit({ board_id: true }).partial();

export const ReorderColumnsDtoSchema = z.object({
  board_id: z.number().int().positive(),
  column_ids: z.array(z.number().int().positive()).min(1),
});

export type CreateColumnDto = z.infer<typeof CreateColumnDtoSchema>;
export type UpdateColumnDto = z.infer<typeof UpdateColumnDtoSchema>;
export type ReorderColumnsDto = z.infer<typeof ReorderColumnsDtoSchema>;

// ─── Task DTOs ────────────────────────────────────────────────────────────────

const taskBase = z.object({
  column_id: z.number().int().positive(),
  title: titleField,
  description_md: z.string().nullable().optional(),
  priority: priorityField,
  due_date: calendarOrIsoDateField.nullable().optional(),
  committed_on: calendarOrIsoDateField.nullable().optional(),
});

export const CreateTaskDtoSchema = taskBase.extend({
  priority: priorityField.default('medium'),
});

export const UpdateTaskDtoSchema = taskBase.partial();

export const MoveTaskDtoSchema = z.object({
  task_id: z.number().int().positive(),
  column_id: z.number().int().positive(),
  position: z.number().int().nonnegative(),
});

export type CreateTaskDto = z.infer<typeof CreateTaskDtoSchema>;
export type UpdateTaskDto = z.infer<typeof UpdateTaskDtoSchema>;
export type MoveTaskDto = z.infer<typeof MoveTaskDtoSchema>;

export const TodayQueryDtoSchema = z.object({
  today: calendarDayField,
});

export const CommitTaskDtoSchema = z.object({
  today: calendarDayField,
});

export type TodayQueryDto = z.infer<typeof TodayQueryDtoSchema>;
export type CommitTaskDto = z.infer<typeof CommitTaskDtoSchema>;

// ─── Note DTOs ────────────────────────────────────────────────────────────────

const noteBase = z.object({
  task_id: z.number().int().positive().nullable().optional(),
  title: z.string().max(MAX_TITLE_LENGTH).optional(),
  body_md: z.string(),
  pinned: z.boolean().optional(),
});

export const CreateNoteDtoSchema = noteBase;
export const UpdateNoteDtoSchema = noteBase.partial();

export type CreateNoteDto = z.infer<typeof CreateNoteDtoSchema>;
export type UpdateNoteDto = z.infer<typeof UpdateNoteDtoSchema>;

// ─── Tag DTOs ─────────────────────────────────────────────────────────────────

const tagBase = z.object({
  name: z.string().min(1, 'Tag name is required').max(50),
  color: z.string().min(1),
});

export const CreateTagDtoSchema = tagBase;
export const UpdateTagDtoSchema = tagBase.partial();

export type CreateTagDto = z.infer<typeof CreateTagDtoSchema>;
export type UpdateTagDto = z.infer<typeof UpdateTagDtoSchema>;

// ─── FileRef DTOs ─────────────────────────────────────────────────────────────

function validateAbsolutePath(path: string): boolean {
  return ABSOLUTE_PATH_PATTERN.test(path);
}

function validatePathHasNoForbiddenChars(path: string): boolean {
  return !FORBIDDEN_PATH_CHARS.test(path);
}

const fileRefBase = z.object({
  target_type: targetTypeField,
  target_id: z.number().int().positive(),
  path: z
    .string()
    .min(1, 'Path is required')
    .refine(validateAbsolutePath, {
      message: 'Path must be absolute (start with / or a Windows drive letter)',
    })
    .refine(validatePathHasNoForbiddenChars, {
      message: 'Path must not contain shell metacharacters (; & | ` $ ( ) or newline)',
    }),
  label: z.string().min(1, 'Label is required').max(200),
  note: z.string().nullable().optional(),
});

export const CreateFileRefDtoSchema = fileRefBase;
export const UpdateFileRefDtoSchema = fileRefBase.omit({ target_type: true, target_id: true }).partial();

export type CreateFileRefDto = z.infer<typeof CreateFileRefDtoSchema>;
export type UpdateFileRefDto = z.infer<typeof UpdateFileRefDtoSchema>;

// ─── Diagram DTOs ────────────────────────────────────────────────────────────

const DiagramBindingSchema = z.object({ elementId: z.string() });

export type DiagramBinding = z.infer<typeof DiagramBindingSchema>;

export const DiagramViewportSchema = z.object({
  scrollX: z.number(),
  scrollY: z.number(),
  zoom: z.number().positive(),
});

export const DiagramElementSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('rectangle'),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    stroke: z.string(),
    fill: z.string().nullable().optional(),
    strokeWidth: z.number(),
    label: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('ellipse'),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    stroke: z.string(),
    fill: z.string().nullable().optional(),
    strokeWidth: z.number(),
    label: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('line'),
    points: z.tuple([z.tuple([z.number(), z.number()]), z.tuple([z.number(), z.number()])]),
    stroke: z.string(),
    strokeWidth: z.number(),
    startBinding: DiagramBindingSchema.nullable().optional(),
    endBinding: DiagramBindingSchema.nullable().optional(),
    waypoints: z.array(z.tuple([z.number(), z.number()])).max(50, 'A connector must not exceed 50 waypoints').optional(),
    routeMode: z.enum(['auto', 'manual']).optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('arrow'),
    points: z.tuple([z.tuple([z.number(), z.number()]), z.tuple([z.number(), z.number()])]),
    stroke: z.string(),
    strokeWidth: z.number(),
    startBinding: DiagramBindingSchema.nullable().optional(),
    endBinding: DiagramBindingSchema.nullable().optional(),
    waypoints: z.array(z.tuple([z.number(), z.number()])).max(50, 'A connector must not exceed 50 waypoints').optional(),
    routeMode: z.enum(['auto', 'manual']).optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('text'),
    x: z.number(),
    y: z.number(),
    text: z.string().max(1000, 'Text element content must not exceed 1,000 characters'),
    fontSize: z.number(),
    color: z.string(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('pen'),
    points: z
      .array(z.tuple([z.number(), z.number()]))
      .max(2000, 'Pen element must not exceed 2,000 points'),
    stroke: z.string(),
    strokeWidth: z.number(),
  }),
]);

export const DiagramSceneSchema = z.object({
  version: z.number(),
  elements: z
    .array(DiagramElementSchema)
    .max(1000, 'A diagram scene must not exceed 1,000 elements'),
  appState: z.object({
    viewport: DiagramViewportSchema,
  }),
});

export const CreateDiagramDtoSchema = z.object({
  title: z.string().max(MAX_TITLE_LENGTH).optional(),
  scene_json: DiagramSceneSchema.optional(),
});

// `viewport` is a delta-save shortcut: pan/zoom-only changes PATCH just the
// viewport (~80 bytes) instead of the full scene_json. Ignored when scene_json
// is also present (the full scene already carries its own viewport).
export const UpdateDiagramDtoSchema = CreateDiagramDtoSchema.partial().extend({
  viewport: DiagramViewportSchema.optional(),
});

export type DiagramViewport = z.infer<typeof DiagramViewportSchema>;
export type DiagramElement = z.infer<typeof DiagramElementSchema>;
export type DiagramScene = z.infer<typeof DiagramSceneSchema>;
export type CreateDiagramDto = z.infer<typeof CreateDiagramDtoSchema>;
export type UpdateDiagramDto = z.infer<typeof UpdateDiagramDtoSchema>;

// ─── Settings DTOs ────────────────────────────────────────────────────────────

const settingsBase = z.object({
  display_name: z.string().min(1).max(100),
  theme: themeField,
  accent: z.string().min(1),
  default_board_id: z.number().int().positive().nullable(),
  timezone: z.string().min(1),
});

export const UpdateSettingsDtoSchema = settingsBase.partial();

export const OnboardDtoSchema = z.object({
  display_name: z.string().min(1, 'Display name is required').max(100),
  timezone: z.string().min(1, 'Timezone is required'),
  seed: seedField,
});

export type UpdateSettingsDto = z.infer<typeof UpdateSettingsDtoSchema>;
export type OnboardDto = z.infer<typeof OnboardDtoSchema>;
