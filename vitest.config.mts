import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: { alias: {
    '@/lib': fileURLToPath(new URL('./lib', import.meta.url)),
    '@': fileURLToPath(new URL('./src', import.meta.url)),
  } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], clearMocks: true },
})
