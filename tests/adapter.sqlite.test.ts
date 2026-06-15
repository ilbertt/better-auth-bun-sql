import { fileURLToPath } from 'node:url';
import { SQL } from 'bun';
import { afterAll, beforeAll } from 'vitest';
import { bunSqlAdapter } from '#index.ts';
import { registerCrudSuite } from './support/crud-suite.ts';

const schemaFile = fileURLToPath(new URL('./fixtures/sqlite-auth-schema.sql', import.meta.url));

let sql: SQL;
let adapter: ReturnType<ReturnType<typeof bunSqlAdapter>>;

beforeAll(async () => {
  // A native in-memory bun:sql SQLite connection; the adapter detects the
  // `sqlite` engine from `sql.options.adapter` — no explicit `dialect` needed.
  sql = new SQL(':memory:');
  await sql.unsafe(await Bun.file(schemaFile).text(), []);
  adapter = bunSqlAdapter({ sql })({} as Parameters<ReturnType<typeof bunSqlAdapter>>[0]);
});

afterAll(async () => {
  await sql.close();
});

registerCrudSuite({ name: 'bun-sql adapter against in-memory sqlite', getAdapter: () => adapter });
