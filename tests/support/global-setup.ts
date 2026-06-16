import { $ } from 'bun';

// Bring the test Postgres up once before the whole suite and tear it down after.
// `--wait` blocks until the healthcheck passes, so test files can connect
// immediately. Doing this here (rather than per-file `beforeAll`) means a single
// container start instead of one per test file, while keeping local runs and CI
// on the exact same environment.
export async function setup() {
  await $`docker compose up -d --wait`;
}

export async function teardown() {
  await $`docker compose down -v`;
}
