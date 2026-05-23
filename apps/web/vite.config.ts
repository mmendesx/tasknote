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
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  optimizeDeps: {
    // Workspace packages ship raw .vue/.ts source — exclude from esbuild pre-bundling
    exclude: ['@tasknote/ui', '@tasknote/shared'],
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
