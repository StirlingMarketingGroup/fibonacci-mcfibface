import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { writeFileSync, readFileSync } from 'fs'
import { resolve } from 'path'
import sharp from 'sharp'

// Generate a unique build version based on timestamp
const BUILD_VERSION = Date.now().toString(36)

export default defineConfig({
  plugins: [
    tailwindcss(),
    {
      name: 'generate-assets',
      async writeBundle() {
        // Write version to a JSON file in the dist folder
        writeFileSync(
          resolve(__dirname, 'dist/version.json'),
          JSON.stringify({ version: BUILD_VERSION })
        )

        // Generate PNG versions of images for broader compatibility
        try {
          // og-image.svg -> og-image.png (1200x630)
          const ogSvg = readFileSync(resolve(__dirname, 'public/og-image.svg'))
          await sharp(ogSvg)
            .resize(1200, 630)
            .png()
            .toFile(resolve(__dirname, 'dist/og-image.png'))

          // favicon.svg -> favicon-192.png (for Android)
          const faviconSvg = readFileSync(resolve(__dirname, 'public/favicon.svg'))
          await sharp(faviconSvg)
            .resize(192, 192)
            .png()
            .toFile(resolve(__dirname, 'dist/favicon-192.png'))

          // favicon.svg -> apple-touch-icon.png (180x180)
          await sharp(faviconSvg)
            .resize(180, 180)
            .png()
            .toFile(resolve(__dirname, 'dist/apple-touch-icon.png'))

          // favicon.svg -> favicon.ico (32x32 PNG, browsers accept PNG as .ico)
          await sharp(faviconSvg)
            .resize(32, 32)
            .png()
            .toFile(resolve(__dirname, 'dist/favicon.ico'))

          console.log('Generated PNG assets for SEO')
        } catch (err) {
          console.warn('Could not generate PNG assets:', err)
        }
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
