import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // Tauri expects a fixed port, fail if that port is not available
  server: {
    port: 5173,
    strictPort: true,
  },
  // to make use of `TAURI_PLATFORM` and other env variables
  envPrefix: ['VITE_', 'TAURI_'],
  optimizeDeps: {
    include: [
      '@tauri-apps/api/fs', 
      '@tauri-apps/api/path', 
      '@tauri-apps/api/shell', 
      '@tauri-apps/api/dialog',
      '@tauri-apps/api/event',
      '@tauri-apps/api/window',
      '@tauri-apps/api/tauri'
    ]
  },
  build: {
    // Tauri supports es2021
    target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
    // don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
  },
})
