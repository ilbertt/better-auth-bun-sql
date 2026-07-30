import type { SQL } from 'bun';
import { afterAll, beforeAll, describe } from 'vitest';
import { bunSqlAdapter } from '#index.ts';
import { generateSchema } from './support/create-schema.ts';
import { registerCrudSuite } from './support/crud-suite.ts';
import { createDatabase, dropDatabase, POSTGRES_TARGETS } from './support/postgres.ts';

// The generated DDL, executed on a real Postgres and then driven through the full
// CRUD suite. `adapter.postgres-schema.test.ts` does the same against the
// committed fixture; this proves the schema the adapter *generates* is one it can
// also use — including the schema qualification and table prefix no fixture can
// express.
const DB_NAME = 'better_auth_generated_schema';

const AUTH_SCHEMA = 'app_auth';

const TABLES_PREFIX = 'auth_';

const SETUP_TIMEOUT_MS = 30_000;

for (const target of POSTGRES_TARGETS) {
  describe(`postgres ${target.version}`, () => {
    let sql: SQL;
    let adapter: ReturnType<ReturnType<typeof bunSqlAdapter>>;

    beforeAll(async () => {
      sql = await createDatabase({ port: target.port, name: DB_NAME });
      const config = { sql, pgSchema: AUTH_SCHEMA, tablesPrefix: TABLES_PREFIX };
      const { code } = await generateSchema({ config });
      // The generated statements are schema-qualified, so the schema only has to
      // exist — no search_path juggling.
      await sql.unsafe(`CREATE SCHEMA "${AUTH_SCHEMA}";\n${code}`);
      adapter = bunSqlAdapter(config)({});
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
      await sql.close();
      await dropDatabase({ port: target.port, name: DB_NAME });
    });

    registerCrudSuite({
      name: `bun-sql adapter against its own generated schema in "${AUTH_SCHEMA}" with the "${TABLES_PREFIX}" table prefix`,
      getAdapter: () => adapter,
    });
  });
}
