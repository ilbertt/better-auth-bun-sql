import { normalTestSuite, testAdapter } from '@better-auth/test-utils/adapter';
import { PGlite } from '@electric-sql/pglite';
import { getMigrations } from 'better-auth/db/migration';
import { bunSqlAdapter } from '#index.ts';
import { pgliteKyselyDialect, pgliteShim } from './support/pglite.ts';

// better-auth's official adapter conformance suite, run against the adapter
// backed by in-memory Postgres (PGlite).
const db = new PGlite();

const { execute } = await testAdapter({
  adapter: () => bunSqlAdapter({ sql: pgliteShim(db) }),
  // The suite reconfigures better-auth per test (custom model names, plugins),
  // so the schema is regenerated from the supplied options each run via
  // better-auth's own Kysely migrator — never a static fixture.
  runMigrations: async (betterAuthOptions) => {
    await db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const { runMigrations } = await getMigrations({
      ...betterAuthOptions,
      database: { dialect: pgliteKyselyDialect(db), type: 'postgres' },
    });
    await runMigrations();
  },
  tests: [normalTestSuite()],
  async onFinish() {
    await db.close();
  },
});

execute();
