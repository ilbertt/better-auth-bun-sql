import { describeCrudSuite } from '../support/crud-suite.ts';
import { postgresEngines } from '../support/engines.ts';
import { readFixture } from '../support/fixtures.ts';

// Deliberately not `public`: a missing qualification then fails the suite.
const AUTH_SCHEMA = 'app_auth';

describeCrudSuite({
  engines: postgresEngines({ database: 'better_auth_postgres_schema' }),
  name: `against the committed fixture schema inside "${AUTH_SCHEMA}"`,
  config: (sql) => ({ sql, pgSchema: AUTH_SCHEMA }),
  migrate: async ({ sql }) => {
    // The fixture DDL is unqualified, so it runs under a matching search_path —
    // in one batch, so it lands on a single connection.
    const ddl = await readFixture('postgres');
    await sql.unsafe(
      `CREATE SCHEMA "${AUTH_SCHEMA}"; SET search_path TO "${AUTH_SCHEMA}";\n${ddl}`,
    );
  },
});
