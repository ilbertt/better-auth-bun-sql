import { SQL } from 'bun';

// Connection to the Postgres started by globalSetup. Overridable so CI or a
// developer can point the suite at a different instance.
const ADMIN_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/postgres';

export function databaseUrl(name: string): string {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

// Each test file gets its own freshly-created database, so files stay isolated
// even when vitest runs them in parallel against the shared server. Returns a
// `bun:sql` connection to the new database — the same driver users connect with,
// so query rendering, type coercion and affected-row counts are exercised for real.
export async function createDatabase(name: string): Promise<SQL> {
  const admin = new SQL(ADMIN_URL);
  await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  await admin.close();
  return new SQL(databaseUrl(name));
}

export async function dropDatabase(name: string): Promise<void> {
  const admin = new SQL(ADMIN_URL);
  await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.close();
}
