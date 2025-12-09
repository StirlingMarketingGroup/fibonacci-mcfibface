import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { writeFileSync } from 'fs'
import { resolve } from 'path'

// Generate a unique build version based on timestamp
const BUILD_VERSION = Date.now().toString(36)

export default defineConfig({
  plugins: [
    tailwindcss(),
    {
      name: 'generate-version',
      writeBundle() {
        // Write version to a JSON file in the dist folder
        writeFileSync(
          resolve(__dirname, 'dist/version.json'),
          JSON.stringify({ version: BUILD_VERSION })
        )
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
