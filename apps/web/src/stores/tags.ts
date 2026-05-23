import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/api'
import type { Tag } from '@tasknote/shared'
import type { CreateTagDto, UpdateTagDto } from '@tasknote/shared'

export const useTagsStore = defineStore('tags', () => {
  const list = ref<Tag[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      list.value = await api.tags.listTags()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load tags'
    } finally {
      loading.value = false
    }
  }

  async function create(dto: CreateTagDto): Promise<Tag> {
    loading.value = true
    error.value = null
    try {
      const tag = await api.tags.createTag(dto)
      list.value.push(tag)
      return tag
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to create tag'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function update(id: number, dto: UpdateTagDto): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const updated = await api.tags.updateTag(id, dto)
      const index = list.value.findIndex((t) => t.id === id)
      if (index !== -1) list.value[index] = updated
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to update tag'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function remove(id: number): Promise<void> {
    loading.value = true
    error.value = null
    try {
      await api.tags.deleteTag(id)
      list.value = list.value.filter((t) => t.id !== id)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete tag'
      throw err
    } finally {
      loading.value = false
    }
  }

  return { list, loading, error, load, create, update, remove }
})
