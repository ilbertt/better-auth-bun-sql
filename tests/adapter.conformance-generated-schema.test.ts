import { normalTestSuite, testAdapter } from '@better-auth/test-utils/adapter';
import { SQL } from 'bun';
import { describe } from 'vitest';
import { bunSqlAdapter } from '#index.ts';
import { generateSchema } from './support/create-schema.ts';
import { createDatabase, databaseUrl, dropDatabase, POSTGRES_TARGETS } from './support/postgres.ts';

// better-auth's conformance suite again, but with the schema built by the
// adapter's own `createSchema` — under a table prefix — instead of better-auth's
// Kysely migrator. Three things `adapter.conformance.test.ts` cannot show:
//
//  - the prefix survives the full adapter surface (every operator, sort, select,
//    plugin model and custom model name the suite reconfigures mid-run), not just
//    the CRUD suite's happy path;
//  - the DDL this adapter generates is executable and complete for every option
//    set the suite throws at it, not only the core models the fixtures cover;
//  - sqlite passes the conformance suite at all. The other run drives migrations
//    through `pg` + Kysely, which pins it to Postgres; generating the schema
//    ourselves lifts that restriction.
const TABLES_PREFIX = 'auth_';

const DB_NAME = 'better_auth_conformance_prefixed';

// One Postgres major is enough here: what is under test is how the adapter
// renders SQL, which does not vary across versions — the unprefixed conformance
// run already covers all three.
const target = POSTGRES_TARGETS[POSTGRES_TARGETS.length - 1] as (typeof POSTGRES_TARGETS)[number];

const url = databaseUrl({ port: target.port, name: DB_NAME });

/**
 * How each engine hands back an empty database. The suite reconfigures
 * better-auth per test, so the schema is rebuilt from scratch every time — and
 * on a new connection, because bun:sql caches prepared statements per connection
 * and a plan cached against the previous schema trips "cached plan must not
 * change result type" once the tables are rebuilt.
 */
type Engine = {
  label: string;
  open: () => Promise<SQL>;
  reopen: () => Promise<SQL>;
  finish: () => Promise<void>;
};

const ENGINES: Engine[] = [
  {
    label: `postgres ${target.version}`,
    open: () => createDatabase({ port: target.port, name: DB_NAME }),
    reopen: async () => {
      const sql = new SQL(url);
      await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      return sql;
    },
    finish: () => dropDatabase({ port: target.port, name: DB_NAME }),
  },
  {
    label: 'sqlite',
    // A new in-memory database is already empty, so it needs no teardown — which
    // is also why this half of the file needs no Docker.
    open: async () => new SQL(':memory:'),
    reopen: async () => new SQL(':memory:'),
    finish: async () => {},
  },
];

// `execute` registers the suite's cases, so it has to run while vitest is still
// collecting — which rules out a `beforeAll`/`beforeEach` hook, as those run once
// collection is over. An async `describe` callback is awaited during collection,
// so `testAdapter` can be set up there.
describe.each(ENGINES)(`$label with the "${TABLES_PREFIX}" table prefix`, async (engine) => {
  let sql = await engine.open();

  const { execute } = await testAdapter({
    adapter: () => bunSqlAdapter({ sql, tablesPrefix: TABLES_PREFIX }),
    runMigrations: async (betterAuthOptions) => {
      await sql.close();
      sql = await engine.reopen();
      const { code } = await generateSchema({
        config: { sql, tablesPrefix: TABLES_PREFIX },
        options: betterAuthOptions,
      });
      await sql.unsafe(code, []);
    },
    tests: [normalTestSuite()],
    async onFinish() {
      await sql.close();
      await engine.finish();
    },
  });

  execute();
});
