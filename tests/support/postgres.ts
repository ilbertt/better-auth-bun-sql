import { SQL } from 'bun';

export type PostgresTarget = { version: number; port: number };

// The Postgres versions the suite runs against, one container each (see
// compose.yaml). Ports are hardcoded — we own the containers, so there's no
// need for a DATABASE_URL env var — and deliberately unusual (154 + version) to
// stay below Linux's ephemeral port range while avoiding the Postgres default.
export const POSTGRES_TARGETS: PostgresTarget[] = [
  { version: 16, port: 15416 },
  { version: 17, port: 15417 },
  { version: 18, port: 15418 },
];

export function databaseUrl({ port, name }: { port: number; name: string }): string {
  return `postgres://postgres:postgres@localhost:${port}/${name}`;
}

// One database per test file per target, so files stay isolated even when vitest
// runs them in parallel.
export async function createDatabase({ port, name }: { port: number; name: string }): Promise<SQL> {
  const admin = new SQL(databaseUrl({ port, name: 'postgres' }));
  await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  await admin.close();
  return new SQL(databaseUrl({ port, name }));
}

export async function dropDatabase({ port, name }: { port: number; name: string }): Promise<void> {
  const admin = new SQL(databaseUrl({ port, name: 'postgres' }));
  await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.close();
}
