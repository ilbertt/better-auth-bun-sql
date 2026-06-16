import { fileURLToPath } from 'node:url';
import type { SQL } from 'bun';
import { afterAll, beforeAll, describe } from 'vitest';
import { bunSqlAdapter } from '#index.ts';
import { registerCrudSuite } from './support/crud-suite.ts';
import { createDatabase, dropDatabase, POSTGRES_TARGETS } from './support/postgres.ts';

const schemaFile = fileURLToPath(new URL('./fixtures/postgres-auth-schema.sql', import.meta.url));

const DB_NAME = 'better_auth_postgres_schema';

// A non-default schema name to prove the adapter qualifies table names with the
// configured `schema` rather than relying on the default `public`.
const AUTH_SCHEMA = 'app_auth';

const SETUP_TIMEOUT_MS = 30_000;

for (const target of POSTGRES_TARGETS) {
  describe(`postgres ${target.version}`, () => {
    let sql: SQL;
    let adapter: ReturnType<ReturnType<typeof bunSqlAdapter>>;

    beforeAll(async () => {
      sql = await createDatabase({ port: target.port, name: DB_NAME });
      // Create the canonical better-auth tables inside the dedicated schema by
      // running the unqualified DDL under a matching search_path, all in one
      // batch so it lands on a single connection.
      const ddl = await Bun.file(schemaFile).text();
      await sql.unsafe(
        `CREATE SCHEMA "${AUTH_SCHEMA}"; SET search_path TO "${AUTH_SCHEMA}";\n${ddl}`,
      );
      adapter = bunSqlAdapter({ sql, schema: AUTH_SCHEMA })(
        {} as Parameters<ReturnType<typeof bunSqlAdapter>>[0],
      );
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
      await sql.close();
      await dropDatabase({ port: target.port, name: DB_NAME });
    });

    registerCrudSuite({
      name: `bun-sql adapter against postgres with a "${AUTH_SCHEMA}" schema`,
      getAdapter: () => adapter,
    });
  });
}
