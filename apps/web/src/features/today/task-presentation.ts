import type { Priority } from '@tasknote/shared'
import { priorityConfig, type PriorityMeta } from '@/features/board/priorityConfig'

/**
 * Today-task presentation helpers.
 *
 * Pure functions that turn raw task fields (due dates, priority enums, carried
 * day counts) into the human-readable, theme-token-driven strings the Today
 * page renders. Kept dependency-free and side-effect-free so they're trivially
 * unit-testable and reusable across the board/today surfaces.
 */

export interface DueMeta {
  /** Human-readable label, e.g. "Overdue", "Due today", "Jun 21". */
  label: string
  /** True when the due date is strictly before `today` (past due, still open). */
  overdue: boolean
  /** True when the due date is exactly `today`. */
  dueToday: boolean
}

/** Extract the YYYY-MM-DD calendar portion of a date value (ISO string or Date). */
function toDateKey(value: string | Date): string {
  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  // Strings arrive as ISO ("2026-06-21" or "2026-06-21T00:00:00Z"); the leading
  // 10 chars are the calendar date. Comparing date keys avoids timezone drift.
  return value.slice(0, 10)
}

/** Short, locale-aware day label for a due date, e.g. "Jun 21". */
function shortDateLabel(dateKey: string): string {
  // Parse as local midnight so the displayed day matches the calendar key.
  const [y, m, d] = dateKey.split('-').map(Number)
  if (!y || !m || !d) return dateKey
  const dt = new Date(y, m - 1, d)
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(dt)
}

/**
 * Build display metadata for a task's due date relative to `today`.
 * Returns null when there is no due date (nothing to render).
 *
 * @param due    The task's due_date (ISO string / Date), or null/undefined.
 * @param today  The reference calendar day as a YYYY-MM-DD string
 *               (use `localDateString()` from the today store).
 */
export function formatDueDate(
  due: string | Date | null | undefined,
  today: string,
): DueMeta | null {
  if (due == null || due === '') return null

  const dueKey = toDateKey(due)
  const todayKey = today.slice(0, 10)

  if (dueKey < todayKey) {
    return { label: 'Overdue', overdue: true, dueToday: false }
  }
  if (dueKey === todayKey) {
    return { label: 'Due today', overdue: false, dueToday: true }
  }
  return { label: shortDateLabel(dueKey), overdue: false, dueToday: false }
}

/** Resolve a priority enum to its display label + color token. */
export function getPriorityMeta(priority: Priority): PriorityMeta {
  return priorityConfig[priority]
}

/** Carried-days badge text, e.g. "carried 3d". Empty when not carried. */
export function formatCarried(days: number): string {
  return days > 0 ? `carried ${days}d` : ''
}

/** Accessible label for the carried badge, with correct singular/plural. */
export function carriedAriaLabel(days: number): string {
  return `Carried ${days} day${days === 1 ? '' : 's'}`
}
