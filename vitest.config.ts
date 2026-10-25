import { defineConfig } from 'vitest/config'

// Testes só das contas puras em lib/ (sem navegador nem banco)
export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts'],
  },
})
