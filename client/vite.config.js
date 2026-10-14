import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const clientRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': 'http://localhost:4000' } },
  build: {
    rollupOptions: {
      input: {
        student: resolve(clientRoot, 'index.html'),
        vendor: resolve(clientRoot, 'vendor.html'),
        admin: resolve(clientRoot, 'admin.html'),
      },
    },
  },
})
