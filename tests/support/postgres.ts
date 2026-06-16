import { SQL } from 'bun';

export type PostgresTarget = { version: number; port: number };

// The Postgres versions the suite runs against, one container each (see
// compose.yaml). Ports are hardcoded — we own the containers, so there's no
// need for a DATABASE_URL env var — and deliberately unusual (543 + version) to
// avoid clashing with anything a developer already runs locally.
export const POSTGRES_TARGETS: PostgresTarget[] = [
  { version: 16, port: 54316 },
  { version: 17, port: 54317 },
  { version: 18, port: 54318 },
];

const connectionString = ({ port, name }: { port: number; name: string }): string =>
  `postgres://postgres:postgres@localhost:${port}/${name}`;

export function databaseUrl(target: { port: number; name: string }): string {
  return connectionString(target);
}

// Each test file gets its own freshly-created database on each target server, so
// files stay isolated even when vitest runs them in parallel. Returns a `bun:sql`
// connection — the same driver users connect with, so query rendering, type
// coercion and affected-row counts are exercised for real.
export async function createDatabase({ port, name }: { port: number; name: string }): Promise<SQL> {
  const admin = new SQL(connectionString({ port, name: 'postgres' }));
  await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  await admin.close();
  return new SQL(connectionString({ port, name }));
}

export async function dropDatabase({ port, name }: { port: number; name: string }): Promise<void> {
  const admin = new SQL(connectionString({ port, name: 'postgres' }));
  await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.close();
}
