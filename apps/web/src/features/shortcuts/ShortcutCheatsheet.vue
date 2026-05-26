<script setup lang="ts">

import { Dialog, Kbd } from '@tasknote/ui'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

interface ShortcutEntry {
  keys: string | string[]
  description: string
}

interface ShortcutGroup {
  label: string
  shortcuts: ShortcutEntry[]
}

const groups: ShortcutGroup[] = [
  {
    label: 'Navigation',
    shortcuts: [
      { keys: ['g', 'b'], description: 'Go to boards (default board)' },
      { keys: ['g', 'n'], description: 'Go to notes' },
      { keys: ['1–9'], description: 'Jump to board by position' },
    ],
  },
  {
    label: 'Tasks',
    shortcuts: [
      { keys: 'n', description: 'Quick-add task in focused column' },
      { keys: 'e', description: 'Edit selected task' },
      { keys: ['Del', '/','Bksp'], description: 'Archive selected task' },
    ],
  },
  {
    label: 'Search',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open command palette' },
    ],
  },
  {
    label: 'App',
    shortcuts: [
      { keys: '?', description: 'Show this shortcut cheatsheet' },
    ],
  },
]
</script>

<template>
  <Dialog
    :open="open"
    title="Keyboard shortcuts"
    description="Use these shortcuts to navigate and manage tasks faster."
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-5 mt-2">
      <section
        v-for="group in groups"
        :key="group.label"
        :aria-labelledby="`shortcut-group-${group.label}`"
      >
        <h3
          :id="`shortcut-group-${group.label}`"
          class="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted"
        >
          {{ group.label }}
        </h3>

        <table class="w-full text-sm" role="table">
          <tbody>
            <tr
              v-for="shortcut in group.shortcuts"
              :key="shortcut.description"
              class="group"
            >
              <td class="py-1.5 pr-4 w-1/3 align-middle">
                <Kbd :keys="shortcut.keys" />
              </td>
              <td class="py-1.5 align-middle text-text-secondary">
                {{ shortcut.description }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <template #footer>
      <button
        class="rounded-control px-4 py-2 text-sm font-medium
               bg-surface-elevated border border-border
               text-text-secondary hover:text-text-primary
               transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        style="transition-duration: var(--motion-duration-fast)"
        @click="emit('update:open', false)"
      >
        Close
      </button>
    </template>
  </Dialog>
</template>
