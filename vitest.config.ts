import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/tests/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/lib/**', '.upstream/**'],
  },
})
