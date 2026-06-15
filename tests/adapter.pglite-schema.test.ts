import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll } from 'vitest';
import { bunSqlAdapter } from '#index.ts';
import { registerCrudSuite } from './support/crud-suite.ts';
import { pgliteShim } from './support/pglite.ts';

const schemaFile = fileURLToPath(new URL('./fixtures/postgres-auth-schema.sql', import.meta.url));

// A non-default schema name to prove the adapter qualifies table names with the
// configured `schema` rather than relying on the default `public`.
const AUTH_SCHEMA = 'app_auth';

const SETUP_TIMEOUT_MS = 30_000;

let db: PGlite;
let adapter: ReturnType<ReturnType<typeof bunSqlAdapter>>;

beforeAll(async () => {
  db = new PGlite();
  // Create the canonical better-auth tables inside the dedicated schema by
  // running the unqualified DDL under a matching search_path.
  await db.exec(`CREATE SCHEMA "${AUTH_SCHEMA}"; SET search_path TO "${AUTH_SCHEMA}";`);
  await db.exec(await Bun.file(schemaFile).text());
  adapter = bunSqlAdapter({ sql: pgliteShim(db), schema: AUTH_SCHEMA })(
    {} as Parameters<ReturnType<typeof bunSqlAdapter>>[0],
  );
}, SETUP_TIMEOUT_MS);

afterAll(async () => {
  await db.close();
});

registerCrudSuite({
  name: `bun-sql adapter against pglite with a "${AUTH_SCHEMA}" schema`,
  getAdapter: () => adapter,
});
