import { ref } from 'vue'

// Module-scoped ref — shared singleton across all component instances.
// Registered ONCE in router/index.ts so layout remounts do not create duplicate guards.
const isNavigating = ref(false)
const routeLabel = ref('')

export function useNavigationState() {
  return { isNavigating, routeLabel }
}
