import { describeCrudSuite } from '../support/crud-suite.ts';
import { sqliteEngine } from '../support/engines.ts';
import { readFixture } from '../support/fixtures.ts';

describeCrudSuite({
  engines: [sqliteEngine()],
  name: 'against the committed fixture schema',
  migrate: async ({ sql }) => {
    await sql.unsafe(await readFixture('sqlite'), []);
  },
});
