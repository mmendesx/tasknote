import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/api'
import type { FileRef, TargetType } from '@tasknote/shared'
import type { CreateFileRefDto, UpdateFileRefDto } from '@tasknote/shared'

type CacheKey = `${TargetType}-${number}`

function cacheKey(target_type: TargetType, target_id: number): CacheKey {
  return `${target_type}-${target_id}`
}

export const useFileRefsStore = defineStore('fileRefs', () => {
  // Map from `${target_type}-${target_id}` → FileRef[]
  const cache = ref<Map<string, FileRef[]>>(new Map())
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function loadFor(target_type: TargetType, target_id: number): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const refs = await api.fileRefs.listFileRefs(target_type, target_id)
      cache.value.set(cacheKey(target_type, target_id), refs)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load file references'
    } finally {
      loading.value = false
    }
  }

  async function create(dto: CreateFileRefDto): Promise<FileRef> {
    loading.value = true
    error.value = null
    try {
      const ref_ = await api.fileRefs.createFileRef(dto)
      const key = cacheKey(dto.target_type, dto.target_id)
      const existing = cache.value.get(key) ?? []
      cache.value.set(key, [...existing, ref_])
      return ref_
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to create file reference'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function update(id: number, dto: UpdateFileRefDto): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const updated = await api.fileRefs.updateFileRef(id, dto)
      // Update in whichever cache bucket contains this id
      for (const [key, refs] of cache.value.entries()) {
        const idx = refs.findIndex((r) => r.id === id)
        if (idx !== -1) {
          const next = [...refs]
          next[idx] = updated
          cache.value.set(key, next)
          break
        }
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to update file reference'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function remove(id: number): Promise<void> {
    loading.value = true
    error.value = null
    try {
      await api.fileRefs.deleteFileRef(id)
      // Remove from whichever bucket contains this id
      for (const [key, refs] of cache.value.entries()) {
        const idx = refs.findIndex((r) => r.id === id)
        if (idx !== -1) {
          cache.value.set(key, refs.filter((r) => r.id !== id))
          break
        }
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete file reference'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function checkExists(id: number): Promise<boolean> {
    try {
      const result = await api.fileRefs.checkExists(id)
      return result.exists
    } catch {
      return false
    }
  }

  async function openFile(id: number): Promise<void> {
    try {
      await api.fileRefs.openFile(id)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to open file'
      throw err
    }
  }

  function getFor(target_type: TargetType, target_id: number): FileRef[] {
    return cache.value.get(cacheKey(target_type, target_id)) ?? []
  }

  return { cache, loading, error, loadFor, create, update, remove, checkExists, openFile, getFor }
})
