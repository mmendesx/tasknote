import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],

  resolve: {
    // Force single instances of packages used across workspace packages
    dedupe: ['vue', 'reka-ui', '@vueuse/core'],
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  optimizeDeps: {
    // @tasknote/shared ships compiled ESM — exclude to avoid double-bundling
    // @tasknote/ui ships raw .vue/.ts source — keep out of esbuild pre-bundling
    //   but reka-ui inside it must resolve to the same instance as the app
    exclude: ['@tasknote/shared'],
  },

  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: false,
      },
    },
  },

  test: {
    environment: 'jsdom',
    globals: true,
  },
})
