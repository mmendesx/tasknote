import { createRouter, createWebHistory } from 'vue-router'
import BoardView from '@/features/board/BoardView.vue'
import NotesView from '@/views/NotesView.vue'
import ArchiveView from '@/views/ArchiveView.vue'
import SettingsView from '@/views/SettingsView.vue'
import { useNavigationState } from '@/composables/useNavigationState'

const { isNavigating, routeLabel } = useNavigationState()

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'board-default',
      component: BoardView,
    },
    {
      path: '/b/:id',
      name: 'board',
      component: BoardView,
    },
    {
      path: '/notes',
      name: 'notes',
      component: NotesView,
    },
    {
      path: '/notes/:id',
      name: 'note-detail',
      component: NotesView,
    },
    {
      path: '/archive',
      name: 'archive',
      component: ArchiveView,
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
    },
  ],
})

// Register navigation-state guards ONCE at module scope (FR-5 / SCN-8).
// DefaultLayout must NOT register its own guards to avoid duplicates on remount.
router.beforeEach(() => {
  isNavigating.value = true
})

router.afterEach((to) => {
  isNavigating.value = false
  // Route label for aria-live announcement (FR-9)
  routeLabel.value = typeof to.name === 'string' ? to.name : ''
})

export default router
