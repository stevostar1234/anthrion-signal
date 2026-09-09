import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/anthrion-signal/',
  // Data is polled by the app. Watching individual JSON files prevents atomic replacement on Windows.
  server: { watch: { ignored: ['**/public/data/**'] } },
  build: { chunkSizeWarningLimit: 600 },
})
