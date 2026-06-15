import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll } from 'vitest';
import { bunSqlAdapter } from '#index.ts';
import { registerCrudSuite } from './support/crud-suite.ts';
import { pgliteShim } from './support/pglite.ts';

const schemaFile = fileURLToPath(new URL('./fixtures/postgres-auth-schema.sql', import.meta.url));

// PGlite spins up a WASM Postgres before the schema runs; that cold start can
// exceed bun's default 5s hook timeout on slower CI runners.
const SETUP_TIMEOUT_MS = 30_000;

let db: PGlite;
let adapter: ReturnType<ReturnType<typeof bunSqlAdapter>>;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(await Bun.file(schemaFile).text());
  adapter = bunSqlAdapter({ sql: pgliteShim(db) })(
    {} as Parameters<ReturnType<typeof bunSqlAdapter>>[0],
  );
}, SETUP_TIMEOUT_MS);

afterAll(async () => {
  await db.close();
});

registerCrudSuite({ name: 'bun-sql adapter against pglite (postgres)', getAdapter: () => adapter });
