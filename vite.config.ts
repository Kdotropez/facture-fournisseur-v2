import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@parsers': path.resolve(__dirname, './parsers'),
    },
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
  server: {
    fs: {
      // Permettre l'accès aux fichiers en dehors de la racine
      allow: ['..'],
    },
  },
})

