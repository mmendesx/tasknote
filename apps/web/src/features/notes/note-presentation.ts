import type { Note } from '@tasknote/shared'

/**
 * Strip markdown syntax from a string and return plain text.
 */
export function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^[>*-]\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim()
}

/**
 * Derive a display title from a note.
 * Uses note.title if set, otherwise extracts the first heading or first line
 * of the body, falling back to 'Untitled'.
 */
export function deriveTitle(note: Note): string {
  if (note.title) return note.title
  return deriveTitleFromBody(note.body_md ?? '')
}

/**
 * Derive a display title from raw body markdown.
 * Useful when only the body string is available (e.g. NoteEditor placeholder).
 */
export function deriveTitleFromBody(body: string): string {
  const firstHeading = body.match(/^#{1,6}\s+(.+)$/m)
  if (firstHeading?.[1]) return firstHeading[1].trim()
  const firstLine = body.split('\n').find((l) => l.trim())
  return firstLine ? stripMarkdown(firstLine).slice(0, 60) || 'Untitled' : 'Untitled'
}

/**
 * Return a short plain-text preview of a note's body (max 80 chars).
 */
export function getPreview(note: Note): string {
  return stripMarkdown(note.body_md ?? '').slice(0, 80)
}

/**
 * Format a date as a human-readable relative time string.
 * Returns an empty string when date is null or undefined.
 */
export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (date == null) return ''
  const now = Date.now()
  const then = new Date(date).getTime()
  const diffSec = Math.floor((now - then) / 1000)

  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)}d ago`
  if (diffSec < 86400 * 365) return `${Math.floor(diffSec / (86400 * 30))}mo ago`
  return `${Math.floor(diffSec / (86400 * 365))}y ago`
}
