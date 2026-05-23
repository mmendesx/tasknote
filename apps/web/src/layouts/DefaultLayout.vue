<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { useTheme } from '@/composables/useTheme'

const { theme, toggleTheme } = useTheme()
const route = useRoute()

// Sidebar drawer state — for <600px mobile
const isDrawerOpen = ref(false)

function toggleDrawer() {
  isDrawerOpen.value = !isDrawerOpen.value
}

function closeDrawer() {
  isDrawerOpen.value = false
}

// Current route label for the topbar
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
  <div class="app-shell">
    <!-- Mobile drawer backdrop -->
    <div
      v-if="isDrawerOpen"
      class="drawer-backdrop"
      aria-hidden="true"
      @click="closeDrawer"
    />

    <!-- Sidebar -->
    <aside
      class="sidebar"
      :class="{ 'sidebar--drawer-open': isDrawerOpen }"
      aria-label="Main navigation"
    >
      <!-- Logo -->
      <div class="sidebar__logo">
        <RouterLink to="/" class="logo-link focus-ring" @click="closeDrawer">
          <!-- Inline logo mark SVG -->
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
      </div>

      <!-- Navigation -->
      <nav class="sidebar__nav">
        <!-- Boards section placeholder -->
        <div class="nav-section">
          <p class="nav-section__label">Boards</p>
          <!-- Board list populated in ICT-16/ICT-18 -->
          <RouterLink
            to="/"
            class="nav-item focus-ring"
            :class="{ 'nav-item--active': route.name === 'board-default' || route.name === 'board' }"
            @click="closeDrawer"
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" class="nav-item__icon">
              <rect x="1" y="1" width="6" height="14" rx="1" stroke="currentColor" stroke-width="1.5" />
              <rect x="9" y="1" width="6" height="9" rx="1" stroke="currentColor" stroke-width="1.5" />
            </svg>
            <span class="nav-item__label">Default board</span>
          </RouterLink>
        </div>

        <div class="nav-section">
          <RouterLink
            to="/notes"
            class="nav-item focus-ring"
            :class="{ 'nav-item--active': route.name === 'notes' || route.name === 'note-detail' }"
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

          <RouterLink
            to="/archive"
            class="nav-item focus-ring"
            :class="{ 'nav-item--active': route.name === 'archive' }"
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

      <!-- Bottom: Settings link -->
      <div class="sidebar__footer">
        <RouterLink
          to="/settings"
          class="nav-item focus-ring"
          :class="{ 'nav-item--active': route.name === 'settings' }"
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

    <!-- Main area: topbar + content -->
    <div class="main-area">
      <!-- Top bar -->
      <header class="topbar" role="banner">
        <!-- Hamburger (mobile only) -->
        <button
          class="topbar__hamburger focus-ring"
          aria-label="Open navigation"
          :aria-expanded="isDrawerOpen"
          @click="toggleDrawer"
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" width="20" height="20">
            <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>

        <!-- Route label / board name -->
        <h1 class="topbar__title">{{ routeLabel }}</h1>

        <div class="topbar__actions">
          <!-- Search trigger placeholder (ICT-21) -->
          <button class="topbar__action-btn focus-ring" aria-label="Search (Cmd+K)">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" width="16" height="16">
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.5" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
            <kbd class="topbar__kbd" aria-hidden="true">⌘K</kbd>
          </button>

          <!-- Theme toggle -->
          <button
            class="topbar__action-btn focus-ring"
            :aria-label="`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`"
            @click="toggleTheme"
          >
            <!-- Sun icon (shown in dark mode to indicate switching to light) -->
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
            <!-- Moon icon (shown in light mode to indicate switching to dark) -->
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

          <!-- Settings shortcut -->
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

      <!-- Page content -->
      <main class="main-content" id="main-content">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
/* ─── Shell grid ──────────────────────────────────────────────────── */
.app-shell {
  display: grid;
  grid-template-columns: 240px 1fr;
  grid-template-rows: 100dvh;
  height: 100dvh;
  overflow: hidden;
  background-color: var(--color-bg);
}

/* ─── Sidebar ─────────────────────────────────────────────────────── */
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
  padding: 20px 16px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
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
}

.sidebar__footer {
  padding: 8px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

/* ─── Main area ───────────────────────────────────────────────────── */
.main-area {
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
}

/* ─── Top bar ─────────────────────────────────────────────────────── */
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

/* ─── Main content ────────────────────────────────────────────────── */
.main-content {
  overflow-y: auto;
  overflow-x: hidden;
  background-color: var(--color-bg);
}

/* ─── Mobile drawer backdrop ──────────────────────────────────────── */
.drawer-backdrop {
  display: none;
}

/* ─── Responsive: icon-rail at <900px ────────────────────────────── */
@media (max-width: 899px) {
  .app-shell {
    grid-template-columns: 64px 1fr;
  }

  .logo-wordmark,
  .nav-item__label,
  .nav-section__label,
  .topbar__kbd {
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

/* ─── Responsive: drawer at <600px ───────────────────────────────── */
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

  /* Restore text labels in full drawer mode */
  .logo-wordmark,
  .nav-item__label,
  .nav-section__label {
    display: block;
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
  }
}
</style>
