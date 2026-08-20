import { describeAtomicSuite } from '../support/atomic-suite.ts';
import { postgresEngines } from '../support/engines.ts';
import { readFixture } from '../support/fixtures.ts';

describeAtomicSuite({
  engines: postgresEngines({ database: 'better_auth_atomic' }),
  migrate: async ({ sql }) => {
    await sql.unsafe(await readFixture('postgres'), []);
  },
});
