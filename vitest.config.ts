import { defineConfig, type TestProjectInlineConfiguration } from 'vitest/config';

type ProjectTestConfig = NonNullable<TestProjectInlineConfiguration['test']>;

// Bun builtins are provided by the runtime; vite must not try to transform them.
const server: ProjectTestConfig['server'] = { deps: { external: [/^bun(:|$)/] } };

function project(test: ProjectTestConfig): TestProjectInlineConfiguration {
  return { test: { ...test, server } };
}

// Only the Postgres project brings the containers up, so `vitest --project
// sqlite` (or `shared`) runs without Docker.
export default defineConfig({
  test: {
    projects: [
      project({ name: 'shared', include: ['tests/*.test.ts'] }),
      project({ name: 'sqlite', include: ['tests/sqlite/**/*.test.ts'] }),
      project({
        name: 'postgres',
        include: ['tests/postgres/**/*.test.ts'],
        globalSetup: ['./tests/support/global-setup.ts'],
      }),
    ],
  },
});
