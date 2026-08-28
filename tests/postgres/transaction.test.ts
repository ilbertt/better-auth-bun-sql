import { postgresEngines } from '../support/engines.ts';
import { readFixture } from '../support/fixtures.ts';
import { describeTransactionSuite } from '../support/transaction-suite.ts';

describeTransactionSuite({
  engines: postgresEngines({ database: 'better_auth_transaction' }),
  isolatesUncommittedWrites: true,
  migrate: async ({ sql }) => {
    await sql.unsafe(await readFixture('postgres'), []);
  },
});
