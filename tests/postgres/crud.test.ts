import { describeCrudSuite } from '../support/crud-suite.ts';
import { postgresEngines } from '../support/engines.ts';
import { readFixture } from '../support/fixtures.ts';

describeCrudSuite({
  engines: postgresEngines({ database: 'better_auth_postgres' }),
  name: 'against the committed fixture schema',
  migrate: async ({ sql }) => {
    await sql.unsafe(await readFixture('postgres'));
  },
});
