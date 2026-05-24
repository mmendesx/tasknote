<script setup lang="ts">
/**
 * TagPicker — multi-select combobox for assigning tags to a task.
 * Props: modelValue (number[] — selected tag ids), taskId (number)
 * Emits: update:modelValue
 * On toggle: calls currentBoardStore.addTag / removeTag for optimistic update + API.
 */
import { ref, computed } from 'vue'
import { useTagsStore } from '@/stores/tags'
import { useCurrentBoardStore } from '@/stores/currentBoard'
import type { Tag } from '@tasknote/shared'

const props = defineProps<{
  modelValue: number[]
  taskId: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number[]]
}>()

const tagsStore = useTagsStore()
const boardStore = useCurrentBoardStore()

const searchQuery = ref('')
const isOpen = ref(false)

const filteredTags = computed<Tag[]>(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return tagsStore.list
  return tagsStore.list.filter((t) => t.name.toLowerCase().includes(q))
})

const selectedTags = computed<Tag[]>(() =>
  tagsStore.list.filter((t) => props.modelValue.includes(t.id))
)

function isSelected(tagId: number): boolean {
  return props.modelValue.includes(tagId)
}

async function toggleTag(tag: Tag): Promise<void> {
  if (isSelected(tag.id)) {
    const next = props.modelValue.filter((id) => id !== tag.id)
    emit('update:modelValue', next)
    await boardStore.removeTag(props.taskId, tag.id)
  } else {
    const next = [...props.modelValue, tag.id]
    emit('update:modelValue', next)
    await boardStore.addTag(props.taskId, tag.id)
  }
}

async function removeTag(tagId: number): Promise<void> {
  const next = props.modelValue.filter((id) => id !== tagId)
  emit('update:modelValue', next)
  await boardStore.removeTag(props.taskId, tagId)
}

function openPicker(): void {
  isOpen.value = true
  searchQuery.value = ''
}

function closePicker(): void {
  isOpen.value = false
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closePicker()
}
</script>

<template>
  <div class="tag-picker" @keydown="handleKeydown">
    <label class="tag-picker__label" id="tag-picker-label">Tags</label>

    <!-- Selected tag chips -->
    <div
      class="tag-picker__chips"
      role="group"
      aria-labelledby="tag-picker-label"
    >
      <span
        v-for="tag in selectedTags"
        :key="tag.id"
        class="tag-chip"
      >
        <span
          class="tag-chip__dot"
          :style="{ backgroundColor: tag.color }"
          aria-hidden="true"
        />
        <span>{{ tag.name }}</span>
        <button
          type="button"
          class="tag-chip__remove"
          :aria-label="`Remove tag ${tag.name}`"
          @click="removeTag(tag.id)"
        >
          <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </span>

      <button
        v-if="!isOpen"
        type="button"
        class="tag-picker__add-btn"
        aria-haspopup="listbox"
        :aria-expanded="isOpen"
        aria-controls="tag-picker-listbox"
        @click="openPicker"
      >
        <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden="true">
          <path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        Add tag
      </button>
    </div>

    <!-- Dropdown listbox -->
    <div v-if="isOpen" class="tag-picker__dropdown">
      <input
        v-model="searchQuery"
        type="search"
        class="tag-picker__search"
        placeholder="Search tags…"
        aria-label="Search tags"
        aria-controls="tag-picker-listbox"
        autocomplete="off"
        autofocus
      />

      <ul
        id="tag-picker-listbox"
        role="listbox"
        aria-multiselectable="true"
        aria-label="Available tags"
        class="tag-picker__list"
      >
        <li
          v-for="tag in filteredTags"
          :key="tag.id"
          role="option"
          :aria-selected="isSelected(tag.id)"
          class="tag-picker__option"
          :class="isSelected(tag.id) && 'tag-picker__option--selected'"
          @click="toggleTag(tag)"
          @keydown.enter.prevent="toggleTag(tag)"
          @keydown.space.prevent="toggleTag(tag)"
          tabindex="0"
        >
          <span
            class="tag-chip__dot"
            :style="{ backgroundColor: tag.color }"
            aria-hidden="true"
          />
          <span class="flex-1 text-sm">{{ tag.name }}</span>
          <svg
            v-if="isSelected(tag.id)"
            viewBox="0 0 12 12"
            width="12"
            height="12"
            fill="none"
            aria-hidden="true"
            class="text-accent"
          >
            <path d="M1.5 6l3 3L10.5 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </li>

        <li
          v-if="filteredTags.length === 0"
          class="tag-picker__empty"
          role="option"
          aria-disabled="true"
        >
          No tags match "{{ searchQuery }}"
        </li>
      </ul>

      <button
        type="button"
        class="tag-picker__close"
        aria-label="Close tag picker"
        @click="closePicker"
      >
        Done
      </button>
    </div>
  </div>
</template>

<style scoped>
.tag-picker { display: flex; flex-direction: column; gap: 6px; position: relative; }
.tag-picker__label { font-size: var(--text-xs); font-weight: 500; color: var(--color-text-secondary); }
.tag-picker__chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-height: 32px; }

.tag-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 8px 2px 6px; border-radius: var(--radius-control);
  border: 1px solid var(--color-border); background-color: var(--color-surface-elevated);
  font-size: var(--text-xs); color: var(--color-text-primary);
}
.tag-chip__dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.tag-chip__remove {
  display: inline-flex; align-items: center; color: var(--color-text-muted);
  border-radius: 2px; transition: color 0.1s;
}
.tag-chip__remove:hover { color: var(--color-text-primary); }
.tag-chip__remove:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }

.tag-picker__add-btn {
  display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px;
  border-radius: var(--radius-control); border: 1px dashed var(--color-border);
  background: transparent; font-size: var(--text-xs); color: var(--color-text-muted);
  cursor: pointer; transition: color 0.1s, border-color 0.1s;
}
.tag-picker__add-btn:hover { color: var(--color-text-primary); border-color: var(--color-text-muted); }
.tag-picker__add-btn:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }

.tag-picker__dropdown {
  position: absolute; top: calc(100% + 4px); left: 0; z-index: 50; width: 240px;
  background-color: var(--color-surface-elevated); border: 1px solid var(--color-border);
  border-radius: var(--radius-card); box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  display: flex; flex-direction: column; overflow: hidden;
}
.tag-picker__search {
  padding: 8px 12px; border: none; border-bottom: 1px solid var(--color-border);
  background: transparent; font-size: var(--text-sm); color: var(--color-text-primary); outline: none;
}
.tag-picker__search::placeholder { color: var(--color-text-muted); }
.tag-picker__list { list-style: none; padding: 4px 0; margin: 0; max-height: 200px; overflow-y: auto; }
.tag-picker__option {
  display: flex; align-items: center; gap: 8px; padding: 7px 12px;
  cursor: pointer; color: var(--color-text-primary); transition: background-color 0.1s;
}
.tag-picker__option:hover,
.tag-picker__option:focus-visible,
.tag-picker__option--selected {
  background-color: color-mix(in srgb, var(--color-accent) 8%, transparent);
  outline: none;
}
.tag-picker__empty { padding: 10px 12px; font-size: var(--text-sm); color: var(--color-text-muted); text-align: center; }
.tag-picker__close {
  padding: 8px 12px; border-top: 1px solid var(--color-border); background: transparent;
  font-size: var(--text-xs); color: var(--color-text-secondary); text-align: right; cursor: pointer; transition: color 0.1s;
}
.tag-picker__close:hover { color: var(--color-text-primary); }
.tag-picker__close:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
.text-accent { color: var(--color-accent); }
</style>
