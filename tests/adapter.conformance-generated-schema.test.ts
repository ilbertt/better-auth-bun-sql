import { normalTestSuite, testAdapter } from '@better-auth/test-utils/adapter';
import { SQL } from 'bun';
import { describe } from 'vitest';
import { bunSqlAdapter } from '#index.ts';
import { generateSchema } from './support/create-schema.ts';
import { createDatabase, databaseUrl, dropDatabase, POSTGRES_TARGETS } from './support/postgres.ts';

// better-auth's conformance suite again, but with the schema built by the
// adapter's own `createSchema` — under a table prefix — instead of better-auth's
// Kysely migrator. Two things `adapter.conformance.test.ts` cannot show:
//
//  - the prefix survives the full adapter surface (every operator, sort, select,
//    plugin model and custom model name the suite reconfigures mid-run), not just
//    the CRUD suite's happy path;
//  - the DDL this adapter generates is executable and complete for every option
//    set the suite throws at it, not only the core models the fixtures cover.
//
// One major is enough: what is under test is how the adapter renders SQL, which
// does not vary across Postgres versions — the unprefixed conformance run
// already covers all three.
const target = POSTGRES_TARGETS[POSTGRES_TARGETS.length - 1] as (typeof POSTGRES_TARGETS)[number];

const DB_NAME = 'better_auth_conformance_prefixed';

const TABLES_PREFIX = 'auth_';

const url = databaseUrl({ port: target.port, name: DB_NAME });

let sql = await createDatabase({ port: target.port, name: DB_NAME });

const { execute } = await testAdapter({
  adapter: () => bunSqlAdapter({ sql, tablesPrefix: TABLES_PREFIX }),
  // The suite reconfigures better-auth per test, so the schema is regenerated
  // from the supplied options each time. Reconnect first for the same reason the
  // unprefixed run does: bun:sql caches prepared statements per connection, and a
  // plan cached against the previous schema trips "cached plan must not change
  // result type" after the rebuild.
  runMigrations: async (betterAuthOptions) => {
    await sql.close();
    sql = new SQL(url);
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const { code } = await generateSchema({
      config: { sql, tablesPrefix: TABLES_PREFIX },
      options: betterAuthOptions,
    });
    await sql.unsafe(code);
  },
  tests: [normalTestSuite()],
  async onFinish() {
    await sql.close();
    await dropDatabase({ port: target.port, name: DB_NAME });
  },
});

describe(`postgres ${target.version} with the "${TABLES_PREFIX}" table prefix`, () => {
  execute();
});
