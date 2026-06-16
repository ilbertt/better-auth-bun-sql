import { fileURLToPath } from 'node:url';
import type { SQL } from 'bun';
import { afterAll, beforeAll, describe } from 'vitest';
import { bunSqlAdapter } from '#index.ts';
import { registerCrudSuite } from './support/crud-suite.ts';
import { createDatabase, dropDatabase, POSTGRES_TARGETS } from './support/postgres.ts';

const schemaFile = fileURLToPath(new URL('./fixtures/postgres-auth-schema.sql', import.meta.url));

const DB_NAME = 'better_auth_postgres';

const SETUP_TIMEOUT_MS = 30_000;

for (const target of POSTGRES_TARGETS) {
  describe(`postgres ${target.version}`, () => {
    let sql: SQL;
    let adapter: ReturnType<ReturnType<typeof bunSqlAdapter>>;

    beforeAll(async () => {
      sql = await createDatabase({ port: target.port, name: DB_NAME });
      await sql.unsafe(await Bun.file(schemaFile).text());
      adapter = bunSqlAdapter({ sql })({} as Parameters<ReturnType<typeof bunSqlAdapter>>[0]);
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
      await sql.close();
      await dropDatabase({ port: target.port, name: DB_NAME });
    });

    registerCrudSuite({ name: 'bun-sql adapter against postgres', getAdapter: () => adapter });
  });
}
