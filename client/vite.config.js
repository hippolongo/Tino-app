import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Frontend calls like `fetch('/api/health')` will hit Express.
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Build the SPA into the Express server's static directory.
    // This enables a single Render web service to serve both frontend + API.
    outDir: '../Server/public',
    emptyOutDir: true,
  },
})
