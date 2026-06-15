import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// The whole suite runs under vitest via `bun --bun vitest`, which uses the Bun
// runtime so `bun:sql`, `Bun.*` and the `bun` builtin are available. The `bun`
// module is externalized so it resolves to the runtime rather than being bundled.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    server: {
      deps: {
        external: [/^bun(:|$)/],
      },
    },
  },
  resolve: {
    alias: {
      '#index.ts': resolve(import.meta.dirname, 'src/index.ts'),
    },
  },
});
