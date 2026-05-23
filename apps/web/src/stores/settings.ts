import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/api'
import type { Settings } from '@tasknote/shared'
import type { UpdateSettingsDto, OnboardDto } from '@tasknote/shared'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // true once onboarding is complete
  const isOnboarded = computed(() => settings.value?.onboarded_at != null)

  async function load(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      settings.value = await api.settings.getSettings()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load settings'
    } finally {
      loading.value = false
    }
  }

  async function update(dto: UpdateSettingsDto): Promise<void> {
    loading.value = true
    error.value = null
    try {
      settings.value = await api.settings.patchSettings(dto)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to update settings'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function onboard(dto: OnboardDto): Promise<void> {
    loading.value = true
    error.value = null
    try {
      settings.value = await api.settings.onboard(dto)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Onboarding failed'
      throw err
    } finally {
      loading.value = false
    }
  }

  return { settings, loading, error, isOnboarded, load, update, onboard }
})
