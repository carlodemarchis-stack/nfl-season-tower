import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the built site works both from a GitHub Pages sub-path
// (user.github.io/<repo>/) and from any static host (Railway `serve -s dist`).
// Paths are root-relative — Vite resolves rollup inputs against the project root.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      input: {
        // index.html = React Season Tower · film.html = vanilla-JS Season Film deck
        main: 'index.html',
        film: 'film.html',
      },
    },
  },
})
