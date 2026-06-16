import { normalTestSuite, testAdapter } from '@better-auth/test-utils/adapter';
import { getMigrations } from 'better-auth/db/migration';
import { SQL } from 'bun';
import { PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { bunSqlAdapter } from '#index.ts';
import { createDatabase, databaseUrl, dropDatabase } from './support/postgres.ts';

// better-auth's official adapter conformance suite, run against the real adapter
// (via bun:sql) backed by a dedicated Postgres database.
const DB_NAME = 'better_auth_conformance';

// The migrator runs through better-auth's own Kysely path; pg drives it. The
// adapter under test uses bun:sql, so both drivers hit the same database.
const pool = new Pool({ connectionString: databaseUrl(DB_NAME) });
let sql = await createDatabase(DB_NAME);

const { execute } = await testAdapter({
  // Read lazily: each `runMigrations` swaps in a fresh connection (see below),
  // and the harness rebuilds the adapter after every migration, so it always
  // binds to the current `sql`.
  adapter: () => bunSqlAdapter({ sql }),
  // The suite reconfigures better-auth per test (custom model names, plugins),
  // so the schema is regenerated from the supplied options each run via
  // better-auth's own Kysely migrator — never a static fixture. bun:sql caches
  // prepared statements per connection, and a plan cached against the previous
  // schema trips "cached plan must not change result type" after the rebuild —
  // so reconnect to start each schema with an empty statement cache.
  runMigrations: async (betterAuthOptions) => {
    await sql.close();
    sql = new SQL(databaseUrl(DB_NAME));
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const { runMigrations } = await getMigrations({
      ...betterAuthOptions,
      database: { dialect: new PostgresDialect({ pool }), type: 'postgres' },
    });
    await runMigrations();
  },
  tests: [normalTestSuite()],
  async onFinish() {
    await pool.end();
    await sql.close();
    await dropDatabase(DB_NAME);
  },
});

execute();
