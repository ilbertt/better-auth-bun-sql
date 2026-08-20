import { describeAtomicSuite } from '../support/atomic-suite.ts';
import { sqliteEngine } from '../support/engines.ts';
import { readFixture } from '../support/fixtures.ts';

describeAtomicSuite({
  engines: [sqliteEngine()],
  migrate: async ({ sql }) => {
    await sql.unsafe(await readFixture('sqlite'), []);
  },
});
