import { PRIORITY_VALUES } from '@tasknote/shared'
import type { Priority } from '@tasknote/shared'

export interface PriorityMeta {
  label: string
  color: string
}

export const priorityConfig: Record<Priority, PriorityMeta> = {
  low:    { label: 'Low',    color: 'var(--color-status-todo)' },
  medium: { label: 'Medium', color: 'var(--color-status-doing)' },
  high:   { label: 'High',   color: 'var(--color-status-blocked)' },
  urgent: { label: 'Urgent', color: 'var(--color-accent)' },
}

// Ordered list of priority values for consistent iteration
export const PRIORITY_ORDER = PRIORITY_VALUES as readonly Priority[]
