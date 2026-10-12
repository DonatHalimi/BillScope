import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    testTimeout: 10000,
    restoreMocks: true,
    clearMocks: true
  }
});
