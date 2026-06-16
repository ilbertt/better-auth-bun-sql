import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/support/global-setup.ts'],
    server: {
      deps: {
        external: [/^bun(:|$)/],
      },
    },
  },
});
