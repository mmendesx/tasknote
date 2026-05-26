<script setup lang="ts">
import { ref, computed, watch, onUnmounted, onMounted, nextTick } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import { useMediaQuery } from '@vueuse/core'
import { useBoardsStore } from '@/stores/boards'
import NoteList from '@/features/notes/NoteList.vue'
import { useNavigationState } from '@/composables/useNavigationState'

const { theme, toggleTheme } = useTheme()
const route = useRoute()
const router = useRouter()
const boardsStore = useBoardsStore()

const isDrawerOpen = ref(false)
const sidebarRef = ref<HTMLElement | null>(null)

const isMobile = useMediaQuery('(max-width: 599px)')

function toggleDrawer() {
  isDrawerOpen.value = !isDrawerOpen.value
}

function closeDrawer() {
  isDrawerOpen.value = false
  // Return focus to hamburger trigger when mobile drawer closes (FR-9 / ICT-46)
  const hamburger = document.getElementById('topbar-hamburger') as HTMLButtonElement | null
  if (hamburger) hamburger.focus()
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

function trapFocus(event: KeyboardEvent) {
  if (!sidebarRef.value) return
  const focusable = Array.from(sidebarRef.value.querySelectorAll<HTMLElement>(FOCUSABLE))
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.key === 'Tab') {
    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }
  if (event.key === 'Escape') {
    closeDrawer()
  }
}

watch(
  () => isDrawerOpen.value && isMobile.value,
  (active) => {
    if (active) {
      
      const first = sidebarRef.value?.querySelector<HTMLElement>(FOCUSABLE)
      first?.focus()
      window.addEventListener('keydown', trapFocus)
    } else {
      window.removeEventListener('keydown', trapFocus)
    }
  },
)

onUnmounted(() => {
  window.removeEventListener('keydown', trapFocus)
})

onMounted(() => {
  if (boardsStore.list.length === 0) {
    boardsStore.load()
  }
})

const sortedBoards = computed(() =>
  [...boardsStore.list].sort((a, b) => a.position - b.position)
)

const isCreatingBoard = ref(false)

async function createBoard() {
  if (isCreatingBoard.value) return
  isCreatingBoard.value = true
  try {
    const name = `Board ${boardsStore.list.length + 1}`
    const board = await boardsStore.create({ name, position: boardsStore.list.length })
    router.push(`/b/${board.id}`)
    closeDrawer()
  } finally {
    isCreatingBoard.value = false
  }
}

const deletingBoardId = ref<number | null>(null)

async function deleteBoard(boardId: number): Promise<void> {
  const currentRoute = route.name as string
  const currentBoardRouteId = String(route.params.id ?? '')
  
  const wasDefault = boardId === boardsStore.defaultBoardId.value
  const nextId = boardsStore.list.find((b) => b.id !== boardId)?.id ?? null
  try {
    await boardsStore.remove(boardId)
  } catch {
    deletingBoardId.value = null
    return
  }
  deletingBoardId.value = null
  
  const wasActive =
    (currentRoute === 'board' && currentBoardRouteId === String(boardId)) ||
    (currentRoute === 'board-default' && wasDefault)
  if (wasActive) {
    router.push(nextId ? `/b/${nextId}` : '/')
  }
}

const editingBoardId = ref<number | null>(null)
const editingBoardName = ref('')

const boardNameInputRef = ref<HTMLInputElement[]>([])

async function startRenamingBoard(boardId: number, currentName: string): Promise<void> {
  editingBoardId.value = boardId
  editingBoardName.value = currentName
  await nextTick()
  const input = boardNameInputRef.value[0]
  input?.focus()
  input?.select()
}

async function saveRenameBoard(): Promise<void> {
  if (!editingBoardId.value) return
  const trimmed = editingBoardName.value.trim()
  if (trimmed) {
    try {
      await boardsStore.update(editingBoardId.value, { name: trimmed })
    } catch {
      
    }
  }
  editingBoardId.value = null
}

function cancelRenameBoard(): void {
  editingBoardId.value = null
}

function navigateToBoard(boardId: number): void {
  router.push(`/b/${boardId}`)
  closeDrawer()
}

const isSidebarCollapsed = ref(false)

function toggleSidebar() {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
}

// Consume module-scoped navigation state (guards registered once in router/index.ts)
const { isNavigating } = useNavigationState()

// FR-13: focus main content area after route changes so keyboard users land in the right place
const mainRef = ref<HTMLElement | null>(null)

watch(
  () => route.fullPath,
  () => {
    mainRef.value?.focus()
  },
)

const notesExpanded = ref(false)

const currentNoteId = computed<number | null>(() => {
  if (route.name !== 'note-detail') return null
  const raw = route.params.id
  const id = Array.isArray(raw) ? raw[0] : raw
  const parsed = id ? parseInt(String(id), 10) : NaN
  return isNaN(parsed) ? null : parsed
})

const routeLabel = computed(() => {
  const name = route.name as string | undefined
  if (!name) return 'TaskNote'
  const labels: Record<string, string> = {
    'board-default': 'Board',
    board: 'Board',
    notes: 'Notes',
    'note-detail': 'Notes',
    archive: 'Archive',
    settings: 'Settings',
  }
  return labels[name] ?? 'TaskNote'
})
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--sidebar-collapsed': isSidebarCollapsed }">
    
    <div
      v-show="isDrawerOpen"
      class="drawer-backdrop"
      aria-hidden="true"
      @click="closeDrawer"
    />

    <aside
      id="sidebar-nav"
      ref="sidebarRef"
      class="sidebar"
      :class="{ 'sidebar--drawer-open': isDrawerOpen, 'sidebar--collapsed': isSidebarCollapsed }"
      aria-label="Main navigation"
    >
      
      <div class="sidebar__logo">
        <RouterLink to="/" class="logo-link focus-ring" @click="closeDrawer">
          
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 32 32"
            fill="none"
            aria-hidden="true"
            class="logo-mark"
          >
            <path
              d="M5 3H20L27 10V29H5Z"
              stroke="currentColor"
              stroke-width="2"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
            <path
              d="M20 3V10H27"
              stroke="currentColor"
              stroke-width="2"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
            <path
              d="M9 17L13 21L22 11"
              stroke="var(--color-accent)"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span class="logo-wordmark">tasknote</span>
        </RouterLink>
        <button
          class="sidebar__collapse-btn focus-ring"
          :aria-label="isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          :title="isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          @click="toggleSidebar"
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" width="16" height="16">
            <path
              :d="isSidebarCollapsed ? 'M6 3l5 5-5 5' : 'M10 3L5 8l5 5'"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>

      <nav class="sidebar__nav">
        <div class="nav-section">
          <div class="nav-section__header">
            <p class="nav-section__label">Boards</p>
            <button
              class="nav-section__add focus-ring"
              aria-label="New board"
              title="New board"
              :disabled="isCreatingBoard"
              @click="createBoard"
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" width="14" height="14">
                <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </button>
          </div>

          <!-- FR-8b: board row uses real RouterLink; action buttons are siblings outside the link -->
          <div
            v-for="board in sortedBoards"
            :key="board.id"
            class="nav-item--board"
            :class="{ 'nav-item--active': (route.name === 'board' && String(route.params.id) === String(board.id)) || (route.name === 'board-default' && board.id === boardsStore.defaultBoardId) }"
          >
            <input
              v-if="editingBoardId === board.id"
              ref="boardNameInputRef"
              v-model="editingBoardName"
              class="nav-item__rename-input"
              type="text"
              maxlength="100"
              @keydown.enter.stop="saveRenameBoard"
              @keydown.escape.stop="cancelRenameBoard"
              @blur="saveRenameBoard"
            />
            <RouterLink
              v-else
              :to="`/b/${board.id}`"
              class="nav-item nav-item__board-link focus-ring"
              :aria-current="((route.name === 'board' && String(route.params.id) === String(board.id)) || (route.name === 'board-default' && board.id === boardsStore.defaultBoardId)) ? 'page' : undefined"
              @click="closeDrawer"
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" class="nav-item__icon" style="flex-shrink:0">
                <rect x="1" y="1" width="6" height="14" rx="1" stroke="currentColor" stroke-width="1.5" />
                <rect x="9" y="1" width="6" height="9" rx="1" stroke="currentColor" stroke-width="1.5" />
              </svg>
              <span class="nav-item__label">{{ board.name }}</span>
            </RouterLink>

            <!-- Action buttons are siblings of the link, not descendants (FR-8b) -->
            <div class="nav-item__actions">
              <template v-if="deletingBoardId === board.id">
                <button
                  class="nav-item__action-btn nav-item__action-btn--danger"
                  title="Confirm delete"
                  aria-label="Confirm delete board"
                  @click.stop="deleteBoard(board.id)"
                >
                  <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
                <button
                  class="nav-item__action-btn"
                  title="Cancel delete"
                  aria-label="Cancel delete board"
                  @click.stop="deletingBoardId = null"
                >
                  <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
                    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                  </svg>
                </button>
              </template>

              <template v-else>
                <button
                  class="nav-item__action-btn"
                  title="Rename board"
                  aria-label="Rename board"
                  @click.stop="startRenamingBoard(board.id, board.name)"
                >
                  <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
                    <path d="M8 2l2 2-6 6H2V8z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
                <button
                  class="nav-item__action-btn nav-item__del-btn"
                  title="Delete board"
                  aria-label="Delete board"
                  @click.stop="deletingBoardId = board.id"
                >
                  <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
                    <path d="M1 3h10M4 3V2h4v1M5 5.5v3M7 5.5v3M2 3l.8 7.2A.9.9 0 0 0 3.7 11h4.6a.9.9 0 0 0 .9-.8L10 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
              </template>
            </div>
          </div>

          <p v-if="boardsStore.list.length === 0" class="nav-section__empty">No boards yet</p>
        </div>

        <div class="nav-section">
          
          <div
            class="nav-notes"
            :class="{ 'nav-notes--active': route.name === 'notes' || route.name === 'note-detail' }"
          >
            <div class="nav-notes__row">
              <RouterLink
                to="/notes"
                class="nav-item nav-notes__link focus-ring"
                :aria-current="(route.name === 'notes' || route.name === 'note-detail') ? 'page' : undefined"
                @click="closeDrawer"
              >
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" class="nav-item__icon">
                  <path
                    d="M2 1H11L14 4V15H2Z"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linejoin="round"
                    stroke-linecap="round"
                  />
                  <path
                    d="M11 1V4H14"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linejoin="round"
                    stroke-linecap="round"
                  />
                  <path d="M4 7H10M4 10H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                </svg>
                <span class="nav-item__label">Notes</span>
              </RouterLink>
              <button
                class="nav-notes__toggle focus-ring"
                :aria-expanded="notesExpanded"
                aria-controls="sidebar-notes-list"
                :aria-label="notesExpanded ? 'Collapse notes list' : 'Expand notes list'"
                :title="notesExpanded ? 'Collapse notes list' : 'Expand notes list'"
                @click="notesExpanded = !notesExpanded"
              >
                
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" width="12" height="12">
                  <path
                    :d="notesExpanded ? 'M3 6l5 5 5-5' : 'M6 3l5 5-5 5'"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </div>
            <div
              v-if="notesExpanded"
              id="sidebar-notes-list"
              class="nav-notes__panel"
            >
              <NoteList
                :selected-id="currentNoteId"
                @select="(id) => { router.push({ name: 'note-detail', params: { id } }); closeDrawer() }"
                @deleted="(id) => { if (currentNoteId === id) router.push({ name: 'notes' }) }"
              />
            </div>
          </div>

          <RouterLink
            to="/archive"
            class="nav-item focus-ring"
            :class="{ 'nav-item--active': route.name === 'archive' }"
            :aria-current="route.name === 'archive' ? 'page' : undefined"
            @click="closeDrawer"
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" class="nav-item__icon">
              <rect x="1" y="4" width="14" height="11" rx="1" stroke="currentColor" stroke-width="1.5" />
              <path d="M1 4H15M5 4V2H11V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              <path d="M5.5 9.5H10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
            <span class="nav-item__label">Archive</span>
          </RouterLink>
        </div>
      </nav>

      <div class="sidebar__footer">
        <RouterLink
          to="/settings"
          class="nav-item focus-ring"
          :class="{ 'nav-item--active': route.name === 'settings' }"
          :aria-current="route.name === 'settings' ? 'page' : undefined"
          @click="closeDrawer"
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" class="nav-item__icon">
            <circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.5" />
            <path
              d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.93 2.93l1.06 1.06M12.01 12.01l1.06 1.06M2.93 13.07l1.06-1.06M12.01 3.99l1.06-1.06"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
          <span class="nav-item__label">Settings</span>
        </RouterLink>
      </div>

    </aside>

    <div class="main-area">
      
      <div v-show="isNavigating" class="nav-progress" aria-hidden="true" />

      <header class="topbar" role="banner">
        
        <button
          id="topbar-hamburger"
          class="topbar__hamburger focus-ring"
          :aria-label="isDrawerOpen ? 'Close navigation' : 'Open navigation'"
          :aria-expanded="isDrawerOpen"
          aria-controls="sidebar-nav"
          @click="toggleDrawer"
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" width="20" height="20">
            <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>

        <h1 class="topbar__title">{{ routeLabel }}</h1>

        <div id="topbar-actions-portal" class="topbar__route-actions" />

        <div class="topbar__actions">
          
          <button class="topbar__action-btn focus-ring" aria-label="Search (Cmd+K)">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" width="16" height="16">
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.5" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
            <kbd class="topbar__kbd" aria-hidden="true">⌘K</kbd>
          </button>

          <button
            class="topbar__action-btn focus-ring"
            :aria-label="`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`"
            @click="toggleTheme"
          >
            
            <svg
              v-if="theme === 'dark'"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              width="16"
              height="16"
            >
              <circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.5" />
              <path
                d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
            
            <svg
              v-else
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              width="16"
              height="16"
            >
              <path
                d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7z"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          <RouterLink
            to="/settings"
            class="topbar__action-btn focus-ring"
            aria-label="Settings"
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" width="16" height="16">
              <circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.5" />
              <path
                d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.93 2.93l1.06 1.06M12.01 12.01l1.06 1.06M2.93 13.07l1.06-1.06M12.01 3.99l1.06-1.06"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </RouterLink>
        </div>
      </header>

      <!-- FR-9: announce route label to screen readers after navigation -->
      <span aria-live="polite" aria-atomic="true" class="sr-only route-announcement">{{ isNavigating ? '' : routeLabel }}</span>

      <main class="main-content" id="main-content" tabindex="-1" ref="mainRef">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>

.app-shell {
  display: grid;
  grid-template-columns: 240px 1fr;
  grid-template-rows: 100dvh;
  height: 100dvh;
  overflow: hidden;
  background-color: var(--color-bg);
  transition: grid-template-columns var(--motion-duration-base) var(--motion-easing);
}

.sidebar {
  display: flex;
  flex-direction: column;
  background-color: var(--color-surface);
  border-right: 1px solid var(--color-border);
  overflow: hidden;
  transition: width var(--motion-duration-base) var(--motion-easing);
  will-change: width;
}

.sidebar__logo {
  height: 52px;
  padding: 0 16px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.logo-link {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--color-text-primary);
  text-decoration: none;
  border-radius: var(--radius-control);
}

.logo-mark {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.logo-wordmark {
  font-size: var(--text-base);
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  opacity: 1;
  transition: opacity var(--motion-duration-fast) var(--motion-easing), width var(--motion-duration-fast) var(--motion-easing);
}

.sidebar__nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.nav-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-section__label {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 4px 8px;
  margin: 0 0 4px;
  white-space: nowrap;
  overflow: hidden;
  opacity: 1;
  transition: opacity var(--motion-duration-fast) var(--motion-easing), width var(--motion-duration-fast) var(--motion-easing);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border-radius: var(--radius-control);
  color: var(--color-text-secondary);
  text-decoration: none;
  font-size: var(--text-sm);
  font-weight: 500;
  transition:
    background-color var(--motion-duration-fast) var(--motion-easing),
    color var(--motion-duration-fast) var(--motion-easing);
  white-space: nowrap;
  overflow: hidden;
}

.nav-item:hover {
  background-color: var(--color-surface-elevated);
  color: var(--color-text-primary);
}

.nav-item--active {
  background-color: var(--color-surface-elevated);
  color: var(--color-text-primary);
}

.nav-item__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.nav-item__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 1;
  transition: opacity var(--motion-duration-fast) var(--motion-easing), width var(--motion-duration-fast) var(--motion-easing);
}

.sidebar__footer {
  padding: 8px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.main-area {
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
  position: relative;
}

.nav-progress {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--color-accent);
  animation: progress-slide var(--motion-duration-base) ease-out forwards;
  z-index: 10;
}

@keyframes progress-slide {
  from {
    transform: scaleX(0);
    transform-origin: left;
  }
  to {
    transform: scaleX(1);
    transform-origin: left;
  }
}

.topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 20px;
  height: 52px;
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.topbar__hamburger {
  display: none;
  color: var(--color-text-secondary);
  border-radius: var(--radius-control);
  padding: 4px;
  flex-shrink: 0;
}

.topbar__title {
  flex: 1;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topbar__route-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.topbar__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.topbar__action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: var(--radius-control);
  color: var(--color-text-secondary);
  text-decoration: none;
  font-size: var(--text-xs);
  transition:
    background-color var(--motion-duration-fast) var(--motion-easing),
    color var(--motion-duration-fast) var(--motion-easing);
}

.topbar__action-btn:hover {
  background-color: var(--color-surface-elevated);
  color: var(--color-text-primary);
}

.topbar__kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-text-muted);
  background-color: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  padding: 0 4px;
}

.main-content {
  overflow-y: auto;
  overflow-x: hidden;
  background-color: var(--color-bg);
}

.drawer-backdrop {
  display: none;
  opacity: 0;
  transition: opacity var(--motion-duration-base) var(--motion-easing);
}

.nav-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 4px;
}

.nav-section__add {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 24px;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-control);
  color: var(--color-text-muted);
  flex-shrink: 0;
  transition: color var(--motion-duration-fast), background-color var(--motion-duration-fast);
}

.nav-section__add:hover:not(:disabled) {
  color: var(--color-text-primary);
  background-color: var(--color-surface-elevated);
}

.nav-section__add:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.nav-section__empty {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  padding: 4px 8px;
  margin: 0;
}

/* FR-8b: board row wrapper — flex row with link + sibling action buttons */
.nav-item--board {
  position: relative;
  display: flex;
  align-items: center;
  border-radius: var(--radius-control);
}

.nav-item--board.nav-item--active .nav-item__board-link {
  background-color: var(--color-surface-elevated);
  color: var(--color-text-primary);
}

.nav-item__board-link {
  flex: 1;
  min-width: 0;
}

.nav-item__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--motion-duration-fast);
}

/* FR-14: reveal on hover AND keyboard focus-within */
.nav-item--board:hover .nav-item__actions,
.nav-item--board:focus-within .nav-item__actions {
  opacity: 1;
}

/* FR-15: touch devices — 0.4 opacity default so actions are discoverable */
@media (hover: none) {
  .nav-item__actions {
    opacity: 0.4;
  }
}

.nav-item__action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 24px;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: color var(--motion-duration-fast), background-color var(--motion-duration-fast);
  flex-shrink: 0;
}

.nav-item__action-btn:hover {
  color: var(--color-text-primary);
  background-color: color-mix(in srgb, var(--color-text-primary) 10%, transparent);
}

.nav-item__del-btn:hover {
  color: var(--color-status-blocked);
  background-color: color-mix(in srgb, var(--color-status-blocked) 12%, transparent);
}

.nav-item__action-btn--danger {
  color: var(--color-status-blocked);
}

.nav-item__action-btn--danger:hover {
  background-color: color-mix(in srgb, var(--color-status-blocked) 12%, transparent);
}

.nav-item__rename-input {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-primary);
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-accent);
  border-radius: 4px;
  padding: 1px 6px;
  outline: none;
  line-height: 1.4;
}

.nav-notes {
  display: flex;
  flex-direction: column;
}

.nav-notes__row {
  display: flex;
  align-items: center;
  border-radius: var(--radius-control);
  transition:
    background-color var(--motion-duration-fast) var(--motion-easing),
    color var(--motion-duration-fast) var(--motion-easing);
}

.nav-notes--active .nav-notes__row {
  background-color: var(--color-surface-elevated);
}

.nav-notes__row:has(.nav-notes__link:hover),
.nav-notes__row:has(.nav-notes__toggle:hover) {
  background-color: var(--color-surface-elevated);
}

.nav-notes__link {
  flex: 1;
  border-radius: var(--radius-control);
  
  background-color: transparent !important;
}

.nav-notes__link:hover {
  background-color: transparent !important;
  color: var(--color-text-primary);
}

.nav-notes--active .nav-notes__link {
  color: var(--color-text-primary);
}

.nav-notes__toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-control);
  color: var(--color-text-muted);
  margin-right: 4px;
  transition: color var(--motion-duration-fast), background-color var(--motion-duration-fast);
}

.nav-notes__toggle:hover {
  color: var(--color-text-primary);
  background-color: color-mix(in srgb, var(--color-text-primary) 10%, transparent);
}

.nav-notes__panel {
  max-height: 300px;
  overflow-y: auto;
  margin-top: 2px;
  padding-left: 22px;
  background: transparent;
}

.nav-notes__panel :deep(.note-list) {
  padding-left: 0;
}

.nav-notes__panel :deep(.note-item) {
  padding: 3px 8px;
  border-bottom: none;
  border-radius: var(--radius-control);
  position: relative;
}

.nav-notes__panel :deep(.note-item)::before {
  content: '–';
  position: absolute;
  left: -12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  color: var(--color-text-muted);
  opacity: 0.4;
  transition: opacity var(--motion-duration-fast);
  pointer-events: none;
  line-height: 1;
}

.nav-notes__panel :deep(.note-item:hover)::before,
.nav-notes__panel :deep(.note-item--selected)::before {
  opacity: 1;
}

.nav-notes__panel :deep(.note-item__title) {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  transition: color var(--motion-duration-fast);
}

.nav-notes__panel :deep(.note-item:hover .note-item__title) {
  color: var(--color-text-primary);
}

.nav-notes__panel :deep(.note-item--selected .note-item__title) {
  color: var(--color-text-primary);
}

.nav-notes__panel :deep(.note-item--selected) {
  background: color-mix(in srgb, var(--color-accent) 8%, transparent);
  border-left: none;
}

.nav-notes__panel :deep(.note-item__preview),
.nav-notes__panel :deep(.note-item__time),
.nav-notes__panel :deep(.note-item__pin) {
  display: none;
}

.sidebar__collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-control);
  color: var(--color-text-muted);
  transition: color var(--motion-duration-fast), background-color var(--motion-duration-fast);
  flex-shrink: 0;
}

.sidebar__collapse-btn:hover {
  color: var(--color-text-primary);
  background-color: var(--color-surface-elevated);
}

@media (min-width: 600px) {
  .app-shell--sidebar-collapsed {
    grid-template-columns: 64px 1fr;
  }

  .sidebar--collapsed {
    width: 64px !important;
  }

  .sidebar--collapsed .logo-wordmark,
  .sidebar--collapsed .nav-item__label,
  .sidebar--collapsed .nav-section__label {
    opacity: 0;
    width: 0;
    pointer-events: none;
  }

  .sidebar--collapsed .nav-section__header p,
  .sidebar--collapsed .nav-section__add,
  .sidebar--collapsed .nav-section__empty,
  .sidebar--collapsed .nav-item__actions,
  .sidebar--collapsed .nav-item__rename-input,
  .sidebar--collapsed .nav-notes__toggle,
  .sidebar--collapsed .nav-notes__panel {
    display: none;
  }

  .sidebar--collapsed .sidebar__logo {
    justify-content: center;
    padding: 0 8px;
  }

  .sidebar--collapsed .sidebar__logo .logo-link {
    display: none;
  }

  .sidebar--collapsed .nav-item {
    justify-content: center;
    padding: 8px;
  }
}

@media (max-width: 899px) {
  .app-shell {
    grid-template-columns: 64px 1fr;
  }

  .logo-wordmark,
  .nav-item__label,
  .nav-section__label,
  .topbar__kbd,
  .nav-notes__toggle,
  .nav-notes__panel {
    display: none;
  }

  .logo-link {
    justify-content: center;
  }

  .nav-item {
    justify-content: center;
    padding: 8px;
  }

  .topbar__hamburger {
    display: none;
  }
}

@media (max-width: 599px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: 240px;
    z-index: 50;
    transform: translateX(-100%);
    transition:
      transform var(--motion-duration-base) var(--motion-easing),
      box-shadow var(--motion-duration-base) var(--motion-easing);
  }

  .sidebar--drawer-open {
    transform: translateX(0);
    box-shadow: 8px 0 32px rgba(0, 0, 0, 0.4);
  }

  .logo-wordmark,
  .nav-item__label,
  .nav-section__label {
    display: block;
    opacity: 1;
    width: auto;
    pointer-events: auto;
  }

  .nav-notes__toggle {
    display: flex;
  }

  .logo-link {
    justify-content: flex-start;
  }

  .nav-item {
    justify-content: flex-start;
    padding: 7px 8px;
  }

  .topbar__hamburger {
    display: flex;
  }

  .drawer-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 49;
    opacity: 1;
  }
}
</style>
