import { normalTestSuite, testAdapter } from '@better-auth/test-utils/adapter';
import { getMigrations } from 'better-auth/db/migration';
import { PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { describe } from 'vitest';
import { bunSqlAdapter } from '#index.ts';
import { postgresEngines } from '../support/engines.ts';

// The schema comes from better-auth's own migrator, so the adapter is tested
// against a schema it did not generate.
const DB_NAME = 'better_auth_conformance';

// `execute` registers the suite's cases, so it has to run while vitest is still
// collecting — hence the async `describe` callback rather than a `beforeAll`.
describe.each(postgresEngines({ database: DB_NAME }))('$label', async (engine) => {
  // The migrator runs through better-auth's own Kysely path; pg drives it. The
  // adapter under test uses bun:sql, so both drivers hit the same database.
  const pool = new Pool({ connectionString: engine.url });
  let sql = await engine.open();

  const { execute } = await testAdapter({
    // Read lazily: the harness rebuilds the adapter after every migration, and
    // `runMigrations` swaps in a new connection, so this always binds to the
    // current `sql`.
    adapter: () => bunSqlAdapter({ sql }),
    runMigrations: async (betterAuthOptions) => {
      await sql.close();
      sql = await engine.reopen();
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
      await engine.finish();
    },
  });

  execute();
});
