import { normalTestSuite, testAdapter } from '@better-auth/test-utils/adapter';
import { describe } from 'vitest';
import { bunSqlAdapter } from '#index.ts';
import { generateSchema } from './create-schema.ts';
import type { Engine } from './engines.ts';

/**
 * better-auth's conformance suite against a schema built by the adapter's own
 * `createSchema`. Worth running next to the migrator-driven one because it holds
 * the table prefix to the full adapter surface, proves the generated DDL is
 * executable for every option set the suite reconfigures, and is the only way
 * SQLite can run the suite at all — better-auth's migrator is Kysely + `pg`.
 *
 * `execute` registers the suite's cases, so it has to run while vitest is still
 * collecting, which rules out a `beforeAll` hook. An async `describe` callback is
 * awaited during collection, so `testAdapter` can be set up there.
 */
export function describeGeneratedSchemaConformance({
  engines,
  tablesPrefix,
}: {
  engines: Engine[];
  tablesPrefix: string;
}): void {
  describe.each(engines)(`$label with the "${tablesPrefix}" table prefix`, async (engine) => {
    let sql = await engine.open();

    const { execute } = await testAdapter({
      // Read lazily: the harness rebuilds the adapter after every migration, and
      // `runMigrations` swaps in a new connection, so this always binds to the
      // current `sql`.
      adapter: () => bunSqlAdapter({ sql, tablesPrefix }),
      runMigrations: async (betterAuthOptions) => {
        await sql.close();
        sql = await engine.reopen();
        const { code } = await generateSchema({
          config: { sql, tablesPrefix },
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
}
