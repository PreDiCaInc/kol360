import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'prisma/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/index.ts',
      ],
      thresholds: {
        // Target coverage per spec
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
    // Timeout per spec (< 60 seconds for unit tests)
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
