import { describe, it, expect } from 'vitest'
import {
  formatDueDate,
  getPriorityMeta,
  formatCarried,
  carriedAriaLabel,
} from '../task-presentation'

describe('formatDueDate', () => {
  const today = '2026-06-19'

  it('returns null when due date is null/undefined/empty', () => {
    expect(formatDueDate(null, today)).toBeNull()
    expect(formatDueDate(undefined, today)).toBeNull()
    expect(formatDueDate('', today)).toBeNull()
  })

  it('flags a past due date as overdue', () => {
    const meta = formatDueDate('2026-06-18', today)
    expect(meta).toEqual({ label: 'Overdue', overdue: true, dueToday: false })
  })

  it('flags a due date equal to today as dueToday', () => {
    const meta = formatDueDate('2026-06-19', today)
    expect(meta).toEqual({ label: 'Due today', overdue: false, dueToday: true })
  })

  it('returns a short date label for a future due date (not raw ISO)', () => {
    const meta = formatDueDate('2026-06-21', today)
    expect(meta?.overdue).toBe(false)
    expect(meta?.dueToday).toBe(false)
    expect(meta?.label).not.toBe('2026-06-21')
    expect(meta?.label).toMatch(/21/)
  })

  it('ignores the time portion of an ISO timestamp (date-key comparison)', () => {
    // Due today at a time — must still read "Due today", not overdue/future.
    const meta = formatDueDate('2026-06-19T23:59:00Z', today)
    expect(meta?.dueToday).toBe(true)
  })

  it('accepts a Date object', () => {
    const meta = formatDueDate(new Date(2026, 5, 18), today) // Jun 18 local
    expect(meta?.overdue).toBe(true)
  })
})

describe('getPriorityMeta', () => {
  it('maps priority to label and color token', () => {
    expect(getPriorityMeta('high')).toEqual({
      label: 'High',
      color: 'var(--color-status-blocked)',
    })
    expect(getPriorityMeta('urgent').label).toBe('Urgent')
    expect(getPriorityMeta('low').label).toBe('Low')
  })
})

describe('formatCarried / carriedAriaLabel', () => {
  it('formats carried badge text only when carried', () => {
    expect(formatCarried(0)).toBe('')
    expect(formatCarried(3)).toBe('carried 3d')
  })

  it('uses singular "day" for 1 and plural otherwise', () => {
    expect(carriedAriaLabel(1)).toBe('Carried 1 day')
    expect(carriedAriaLabel(2)).toBe('Carried 2 days')
    expect(carriedAriaLabel(0)).toBe('Carried 0 days')
  })
})
