import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
const root = dirname(fileURLToPath(import.meta.url))
export default defineConfig({
  root,
  publicDir: false,
  build: { outDir: resolve(root, '../../../artifacts/fullstack-preview/dist'),
           emptyOutDir: true },
})
