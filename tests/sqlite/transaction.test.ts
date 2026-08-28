import { sqliteEngine } from '../support/engines.ts';
import { readFixture } from '../support/fixtures.ts';
import { describeTransactionSuite } from '../support/transaction-suite.ts';

describeTransactionSuite({
  engines: [sqliteEngine()],
  migrate: async ({ sql }) => {
    await sql.unsafe(await readFixture('sqlite'), []);
  },
});
