import { createRouter, createWebHistory } from 'vue-router'
import BoardView from '@/features/board/BoardView.vue'
import NotesView from '@/views/NotesView.vue'
import ArchiveView from '@/views/ArchiveView.vue'
import SettingsView from '@/views/SettingsView.vue'

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

export default router
