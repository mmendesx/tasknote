import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'

// Design tokens (CSS custom properties — dark/light palettes, typography, spacing)
import '@tasknote/ui/style.css'
// CSS animation utilities (tn-* classes driven by data-state hooks)
import '@tasknote/ui/animations.css'
// App-level styles + Tailwind directives
import './styles/main.css'

createApp(App)
  .use(router)
  .use(createPinia())
  .mount('#app')
