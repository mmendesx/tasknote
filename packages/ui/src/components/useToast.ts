import { reactive, readonly } from 'vue'

export type ToastVariant = 'default' | 'success' | 'error' | 'warning'

export interface ToastItem {
  id: string
  title: string
  description?: string
  variant: ToastVariant
  duration: number
}

type ToastInput = Omit<ToastItem, 'id'>

let counter = 0

const state = reactive<{ toasts: ToastItem[] }>({ toasts: [] })

function addToast(input: Omit<ToastInput, 'variant' | 'duration'> & Partial<Pick<ToastInput, 'variant' | 'duration'>>): string {
  const id = `toast-${++counter}`
  state.toasts.push({
    id,
    variant: input.variant ?? 'default',
    duration: input.duration ?? 4000,
    title: input.title,
    description: input.description,
  })
  return id
}

function removeToast(id: string): void {
  const index = state.toasts.findIndex((t) => t.id === id)
  if (index !== -1) state.toasts.splice(index, 1)
}

export function useToast() {
  return {
    toasts: readonly(state.toasts),
    toast: addToast,
    dismiss: removeToast,
    success: (title: string, description?: string) =>
      addToast({ title, description, variant: 'success' }),
    error: (title: string, description?: string) =>
      addToast({ title, description, variant: 'error' }),
    warning: (title: string, description?: string) =>
      addToast({ title, description, variant: 'warning' }),
  }
}
