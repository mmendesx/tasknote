<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
} from 'reka-ui'
import { useSearchStore } from '@/stores/search'
import * as api from '@/api'
import type { Task, Note, FileRef } from '@tasknote/shared'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const searchStore = useSearchStore()
const router = useRouter()

const localQuery = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

const tasks = computed<Task[]>(() => searchStore.results?.tasks ?? [])
const notes = computed<Note[]>(() => searchStore.results?.notes ?? [])
const files = computed<FileRef[]>(() => searchStore.results?.files ?? [])

type FlatResult =
  | { kind: 'task'; item: Task }
  | { kind: 'note'; item: Note }
  | { kind: 'file'; item: FileRef }

const flatResults = computed<FlatResult[]>(() => [
  ...tasks.value.map((item): FlatResult => ({ kind: 'task', item })),
  ...notes.value.map((item): FlatResult => ({ kind: 'note', item })),
  ...files.value.map((item): FlatResult => ({ kind: 'file', item })),
])

const hasResults = computed(() => flatResults.value.length > 0)

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      localQuery.value = ''
      searchStore.clear()
      selectedIndex.value = 0
      nextTick(() => {
        inputRef.value?.focus()
      })
    }
  },
)

function handleInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  localQuery.value = value
  selectedIndex.value = 0
  searchStore.setQuery(value)
}

function isSelected(kind: FlatResult['kind'], id: number): boolean {
  const idx = flatResults.value.findIndex(
    (r) => r.kind === kind && r.item.id === id,
  )
  return idx === selectedIndex.value
}

function handleKeydown(event: KeyboardEvent): void {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      if (flatResults.value.length > 0) {
        selectedIndex.value = (selectedIndex.value + 1) % flatResults.value.length
      }
      break
    case 'ArrowUp':
      event.preventDefault()
      if (flatResults.value.length > 0) {
        selectedIndex.value =
          (selectedIndex.value - 1 + flatResults.value.length) %
          flatResults.value.length
      }
      break
    case 'Enter':
      event.preventDefault()
      if (flatResults.value[selectedIndex.value]) {
        openResult(flatResults.value[selectedIndex.value])
      }
      break
    case 'Escape':
      close()
      break
  }
}

function close(): void {
  emit('update:open', false)
}

async function openResult(result: FlatResult): Promise<void> {
  close()
  await nextTick()

  if (result.kind === 'task') {
    
    router.push('/')
  } else if (result.kind === 'note') {
    router.push(`/notes/${result.item.id}`)
  } else if (result.kind === 'file') {
    try {
      await api.fileRefs.openFile(result.item.id)
    } catch {
      
    }
  }
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  const isK = event.key === 'k' || event.key === 'K'
  const hasModifier = event.metaKey || event.ctrlKey
  if (isK && hasModifier && !event.shiftKey && !event.altKey) {
    event.preventDefault()
    if (!props.open) {
      emit('update:open', true)
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})

function noteExcerpt(note: Note): string {
  const text = note.body_md.replace(/[#*_`>-]/g, '').trim()
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

function fileBasename(path: string): string {
  return path.split('/').pop() ?? path
}

function priorityLabel(task: Task): string {
  return task.priority.charAt(0).toUpperCase() + task.priority.slice(1)
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      
      <DialogOverlay
        class="tn-overlay fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        @click="close"
      />

      <DialogContent
        as="div"
        role="dialog"
        aria-label="Command palette"
        aria-modal="true"
        class="tn-dialog fixed left-1/2 z-50 w-full max-w-[640px] -translate-x-1/2
               rounded-modal border border-border bg-surface-elevated shadow-xl
               focus:outline-none overflow-hidden"
        style="top: 15vh"
        @keydown="handleKeydown"
      >
        
        <div class="flex items-center gap-3 border-b border-border px-4 py-3">
          
          <svg
            viewBox="0 0 16 16"
            width="16"
            height="16"
            fill="none"
            aria-hidden="true"
            class="shrink-0 text-text-muted"
          >
            <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" stroke-width="1.5" />
            <path d="M11 11l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>

          <input
            ref="inputRef"
            :value="localQuery"
            type="search"
            placeholder="Search tasks, notes, files…"
            autocomplete="off"
            spellcheck="false"
            class="flex-1 bg-transparent font-sans text-sm text-text-primary
                   placeholder:text-text-muted outline-none"
            role="combobox"
            aria-label="Global search"
            aria-autocomplete="list"
            aria-controls="command-palette-results"
            aria-expanded="true"
            :aria-activedescendant="
              flatResults[selectedIndex]
                ? `cp-result-${flatResults[selectedIndex].kind}-${flatResults[selectedIndex].item.id}`
                : undefined
            "
            @input="handleInput"
          />

          <span
            v-if="searchStore.loading"
            aria-label="Searching…"
            class="shrink-0 h-3.5 w-3.5 rounded-full border-2 border-accent border-t-transparent
                   animate-spin text-text-muted"
          />

          <kbd
            class="hidden shrink-0 rounded border border-border px-1.5 py-0.5
                   font-mono text-xs text-text-muted sm:block"
          >
            esc
          </kbd>
        </div>

        <div
          id="command-palette-results"
          role="listbox"
          aria-label="Search results"
          class="max-h-[400px] overflow-y-auto"
        >
          
          <div
            v-if="!localQuery"
            class="px-4 py-8 text-center text-sm text-text-muted"
          >
            Type to search…
          </div>

          <div
            v-else-if="localQuery && !searchStore.loading && !hasResults"
            class="px-4 py-8 text-center text-sm text-text-muted"
          >
            No results for "{{ localQuery }}"
          </div>

          <template v-else-if="hasResults">
            
            <section v-if="tasks.length > 0" aria-label="Tasks">
              <header
                class="sticky top-0 bg-surface-elevated px-4 py-1.5
                       text-[11px] font-semibold uppercase tracking-widest text-text-muted"
              >
                Tasks
              </header>
              <ul role="group" aria-label="Tasks">
                <li
                  v-for="task in tasks"
                  :id="`cp-result-task-${task.id}`"
                  :key="task.id"
                  role="option"
                  :aria-selected="isSelected('task', task.id)"
                  class="flex cursor-pointer items-center gap-3 px-4 py-2.5
                         transition-colors"
                  :class="isSelected('task', task.id)
                    ? 'bg-accent/15 text-text-primary'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary'"
                  @click="openResult({ kind: 'task', item: task })"
                  @mouseenter="selectedIndex = flatResults.findIndex(r => r.kind === 'task' && r.item.id === task.id)"
                >
                  
                  <svg
                    viewBox="0 0 16 16"
                    width="14"
                    height="14"
                    fill="none"
                    aria-hidden="true"
                    class="shrink-0 text-text-muted"
                  >
                    <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.5" />
                    <path d="M5 8h6M5 5.5h6M5 10.5h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                  </svg>

                  <span class="flex-1 truncate text-sm font-medium">{{ task.title }}</span>

                  <span class="shrink-0 text-xs text-text-muted">{{ priorityLabel(task) }}</span>
                </li>
              </ul>
            </section>

            <section v-if="notes.length > 0" aria-label="Notes">
              <header
                class="sticky top-0 bg-surface-elevated px-4 py-1.5
                       text-[11px] font-semibold uppercase tracking-widest text-text-muted"
              >
                Notes
              </header>
              <ul role="group" aria-label="Notes">
                <li
                  v-for="note in notes"
                  :id="`cp-result-note-${note.id}`"
                  :key="note.id"
                  role="option"
                  :aria-selected="isSelected('note', note.id)"
                  class="flex cursor-pointer items-center gap-3 px-4 py-2.5
                         transition-colors"
                  :class="isSelected('note', note.id)
                    ? 'bg-accent/15 text-text-primary'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary'"
                  @click="openResult({ kind: 'note', item: note })"
                  @mouseenter="selectedIndex = flatResults.findIndex(r => r.kind === 'note' && r.item.id === note.id)"
                >
                  
                  <svg
                    viewBox="0 0 16 16"
                    width="14"
                    height="14"
                    fill="none"
                    aria-hidden="true"
                    class="shrink-0 text-text-muted"
                  >
                    <path
                      d="M3 2h10a1 1 0 0 1 1 1v8l-3 3H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"
                      stroke="currentColor"
                      stroke-width="1.5"
                    />
                    <path d="M11 11v3l3-3h-3z" stroke="currentColor" stroke-width="1.2" />
                    <path d="M5 6h6M5 9h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                  </svg>

                  <span class="flex-1 truncate text-sm font-medium">{{ note.title }}</span>

                  <span class="ml-2 hidden shrink-0 max-w-[180px] truncate text-xs text-text-muted sm:block">
                    {{ noteExcerpt(note) }}
                  </span>
                </li>
              </ul>
            </section>

            <section v-if="files.length > 0" aria-label="Files">
              <header
                class="sticky top-0 bg-surface-elevated px-4 py-1.5
                       text-[11px] font-semibold uppercase tracking-widest text-text-muted"
              >
                Files
              </header>
              <ul role="group" aria-label="Files">
                <li
                  v-for="file in files"
                  :id="`cp-result-file-${file.id}`"
                  :key="file.id"
                  role="option"
                  :aria-selected="isSelected('file', file.id)"
                  class="flex cursor-pointer items-center gap-3 px-4 py-2.5
                         transition-colors"
                  :class="isSelected('file', file.id)
                    ? 'bg-accent/15 text-text-primary'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary'"
                  @click="openResult({ kind: 'file', item: file })"
                  @mouseenter="selectedIndex = flatResults.findIndex(r => r.kind === 'file' && r.item.id === file.id)"
                >
                  
                  <svg
                    viewBox="0 0 16 16"
                    width="14"
                    height="14"
                    fill="none"
                    aria-hidden="true"
                    class="shrink-0 text-text-muted"
                  >
                    <path
                      d="M4 2h6l4 4v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"
                      stroke="currentColor"
                      stroke-width="1.5"
                    />
                    <path d="M10 2v4h4" stroke="currentColor" stroke-width="1.2" />
                  </svg>

                  <span class="flex-1 truncate text-sm font-medium">{{ file.label }}</span>

                  <span class="ml-2 hidden shrink-0 max-w-[180px] truncate text-xs text-text-muted sm:block">
                    {{ fileBasename(file.path) }}
                  </span>
                </li>
              </ul>
            </section>
          </template>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
