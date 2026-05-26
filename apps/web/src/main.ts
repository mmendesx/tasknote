import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'

import '@tasknote/ui/style.css'

import '@tasknote/ui/animations.css'

import './styles/main.css'

createApp(App)
  .use(router)
  .use(createPinia())
  .mount('#app')
