<script setup lang="ts">
/**
 * TagManager — CRUD interface for the global tag pool.
 * Used in SettingsView (ICT-23). Lists all tags with inline create/edit/delete.
 */
import { ref, onMounted } from 'vue'
import { Button, Input } from '@tasknote/ui'
import { useTagsStore } from '@/stores/tags'
import type { Tag } from '@tasknote/shared'

const tagsStore = useTagsStore()

// Status-palette colors plus a few extras for tag customization
const COLOR_PRESETS = [
  '#5B616B', // muted
  '#F5C26B', // doing/yellow
  '#F87171', // blocked/red
  '#A3E635', // done/lime (accent)
  '#60A5FA', // blue
  '#C084FC', // purple
  '#34D399', // green
  '#FB923C', // orange
]

// ─── Create state ─────────────────────────────────────────────────────────────

const createName  = ref('')
const createColor = ref('#5B616B')
const createError = ref('')
const isCreating  = ref(false)

async function submitCreate(): Promise<void> {
  const name = createName.value.trim()
  if (!name) { createError.value = 'Name is required'; return }
  if (name.length > 50) { createError.value = 'Name must be ≤50 characters'; return }
  createError.value = ''
  isCreating.value = true
  try {
    await tagsStore.create({ name, color: createColor.value })
    createName.value  = ''
    createColor.value = '#5B616B'
  } catch (err) {
    createError.value = err instanceof Error ? err.message : 'Failed to create tag'
  } finally {
    isCreating.value = false
  }
}

// ─── Edit state ───────────────────────────────────────────────────────────────

const editingId    = ref<number | null>(null)
const editName     = ref('')
const editColor    = ref('')
const editError    = ref('')
const isSaving     = ref(false)

function startEdit(tag: Tag): void {
  editingId.value = tag.id
  editName.value  = tag.name
  editColor.value = tag.color
  editError.value = ''
}

function cancelEdit(): void {
  editingId.value = null
  editError.value = ''
}

async function submitEdit(): Promise<void> {
  const name = editName.value.trim()
  if (!name) { editError.value = 'Name is required'; return }
  if (name.length > 50) { editError.value = 'Name must be ≤50 characters'; return }
  editError.value = ''
  isSaving.value = true
  try {
    await tagsStore.update(editingId.value!, { name, color: editColor.value })
    editingId.value = null
  } catch (err) {
    editError.value = err instanceof Error ? err.message : 'Failed to update tag'
  } finally {
    isSaving.value = false
  }
}

// ─── Delete state ─────────────────────────────────────────────────────────────

const confirmDeleteId = ref<number | null>(null)
const isDeleting      = ref(false)

function requestDelete(id: number): void {
  confirmDeleteId.value = id
}

function cancelDelete(): void {
  confirmDeleteId.value = null
}

async function confirmDelete(): Promise<void> {
  if (!confirmDeleteId.value) return
  isDeleting.value = true
  try {
    await tagsStore.remove(confirmDeleteId.value)
    confirmDeleteId.value = null
  } catch {
    /* tagsStore sets error */
  } finally {
    isDeleting.value = false
  }
}

// ─── Load ─────────────────────────────────────────────────────────────────────

onMounted(() => {
  if (tagsStore.list.length === 0) tagsStore.load()
})
</script>

<template>
  <section class="tag-manager" aria-labelledby="tag-manager-heading">
    <h2 id="tag-manager-heading" class="tag-manager__heading">Tags</h2>

    <!-- Error banner -->
    <p v-if="tagsStore.error" role="alert" class="tag-manager__error">
      {{ tagsStore.error }}
    </p>

    <!-- Tag list -->
    <ul v-if="tagsStore.list.length" class="tag-manager__list" aria-label="All tags">
      <li
        v-for="tag in tagsStore.list"
        :key="tag.id"
        class="tag-manager__item"
      >
        <!-- View mode -->
        <template v-if="editingId !== tag.id && confirmDeleteId !== tag.id">
          <span
            class="tag-dot"
            :style="{ backgroundColor: tag.color }"
            aria-hidden="true"
          />
          <span class="tag-manager__name">{{ tag.name }}</span>
          <div class="tag-manager__actions">
            <Button variant="ghost" size="sm" @click="startEdit(tag)">Edit</Button>
            <Button variant="ghost" size="sm" @click="requestDelete(tag.id)">Delete</Button>
          </div>
        </template>

        <!-- Edit mode -->
        <template v-else-if="editingId === tag.id">
          <div class="tag-manager__edit-form">
            <div class="tag-manager__color-row">
              <span class="text-xs text-text-secondary">Color</span>
              <div class="tag-manager__color-swatches" role="group" aria-label="Color picker">
                <button
                  v-for="color in COLOR_PRESETS"
                  :key="color"
                  type="button"
                  class="tag-manager__swatch"
                  :class="editColor === color && 'tag-manager__swatch--active'"
                  :style="{ backgroundColor: color }"
                  :aria-label="`Color ${color}`"
                  :aria-pressed="editColor === color"
                  @click="editColor = color"
                />
              </div>
            </div>
            <Input
              v-model="editName"
              label="Name"
              placeholder="Tag name"
              :error="editError"
              @keyup.enter="submitEdit"
              @keyup.escape="cancelEdit"
            />
            <div class="flex gap-2">
              <Button variant="primary" size="sm" :loading="isSaving" @click="submitEdit">Save</Button>
              <Button variant="ghost" size="sm" @click="cancelEdit">Cancel</Button>
            </div>
          </div>
        </template>

        <!-- Delete confirm mode -->
        <template v-else-if="confirmDeleteId === tag.id">
          <span
            class="tag-dot"
            :style="{ backgroundColor: tag.color }"
            aria-hidden="true"
          />
          <span class="tag-manager__name text-text-secondary">Delete "{{ tag.name }}"?</span>
          <div class="flex gap-2">
            <Button variant="danger" size="sm" :loading="isDeleting" @click="confirmDelete">Delete</Button>
            <Button variant="ghost" size="sm" @click="cancelDelete">Cancel</Button>
          </div>
        </template>
      </li>
    </ul>

    <p v-else-if="!tagsStore.loading" class="tag-manager__empty">
      No tags yet. Create your first tag below.
    </p>

    <!-- Create form -->
    <div class="tag-manager__create-form" aria-label="Create new tag">
      <p class="text-sm font-medium text-text-primary mb-3">New tag</p>

      <div class="tag-manager__color-row mb-3">
        <span class="text-xs text-text-secondary">Color</span>
        <div class="tag-manager__color-swatches" role="group" aria-label="Color picker">
          <button
            v-for="color in COLOR_PRESETS"
            :key="color"
            type="button"
            class="tag-manager__swatch"
            :class="createColor === color && 'tag-manager__swatch--active'"
            :style="{ backgroundColor: color }"
            :aria-label="`Color ${color}`"
            :aria-pressed="createColor === color"
            @click="createColor = color"
          />
        </div>
      </div>

      <div class="flex gap-2 items-end">
        <div class="flex-1">
          <Input
            v-model="createName"
            label="Name"
            placeholder="e.g. urgent, bug, feature"
            :error="createError"
            @keyup.enter="submitCreate"
          />
        </div>
        <Button variant="primary" size="sm" :loading="isCreating" @click="submitCreate">
          Add tag
        </Button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tag-manager { display: flex; flex-direction: column; gap: 0; }
.tag-manager__heading { font-size: var(--text-base); font-weight: 600; color: var(--color-text-primary); margin-bottom: 16px; }
.tag-manager__error {
  padding: 8px 12px; border-radius: var(--radius-control); margin-bottom: 12px;
  background-color: color-mix(in srgb, var(--color-status-blocked) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-status-blocked) 30%, transparent);
  color: var(--color-status-blocked); font-size: var(--text-sm);
}
.tag-manager__list {
  list-style: none; padding: 0; margin: 0 0 16px; display: flex; flex-direction: column;
  border: 1px solid var(--color-border); border-radius: var(--radius-card); overflow: hidden;
}
.tag-manager__item {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  border-bottom: 1px solid var(--color-border); background-color: var(--color-surface); min-height: 44px;
}
.tag-manager__item:last-child { border-bottom: none; }
.tag-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.tag-manager__name { flex: 1; font-size: var(--text-sm); color: var(--color-text-primary); min-width: 0; }
.tag-manager__actions { display: flex; gap: 4px; flex-shrink: 0; }
.tag-manager__edit-form { display: flex; flex-direction: column; gap: 10px; flex: 1; padding: 4px 0; }
.tag-manager__color-row { display: flex; align-items: center; gap: 10px; }
.tag-manager__color-swatches { display: flex; gap: 6px; flex-wrap: wrap; }
.tag-manager__swatch {
  width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent;
  cursor: pointer; transition: transform 0.1s, border-color 0.1s;
}
.tag-manager__swatch:hover { transform: scale(1.15); }
.tag-manager__swatch--active { border-color: var(--color-text-primary); transform: scale(1.15); }
.tag-manager__swatch:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
.tag-manager__empty { font-size: var(--text-sm); color: var(--color-text-muted); padding: 12px 0; }
.tag-manager__create-form {
  padding: 16px; border: 1px solid var(--color-border);
  border-radius: var(--radius-card); background-color: var(--color-surface);
}
</style>
