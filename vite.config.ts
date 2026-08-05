import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the built site works both from a GitHub Pages sub-path
// (user.github.io/<repo>/) and from any static host (Railway `serve -s dist`).
export default defineConfig({
  plugins: [react()],
  base: './',
})
