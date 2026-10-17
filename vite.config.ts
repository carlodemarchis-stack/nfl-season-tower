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
        // index.html = React Season Tower · players.html + clubs.html = the two vanilla-JS
        // card films (one script, src/film/) · film.html = forwards the old address
        main: 'index.html',
        players: 'players.html',
        clubs: 'clubs.html',
        film: 'film.html',
      },
    },
  },
})
