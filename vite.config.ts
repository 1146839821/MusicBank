import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // Electron loads the production renderer through file://, so asset URLs
  // must remain relative to dist/ instead of resolving from the filesystem root.
  base: './',
  plugins: [vue()],
})
