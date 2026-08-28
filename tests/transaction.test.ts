import { describe, expect, it } from 'vitest';
import type { BunSqlDialect } from '#dialect.ts';
import { bunSqlAdapter } from '#index.ts';
import { fakeSql, lastCall } from './support/fake-sql.ts';

const DIALECTS: BunSqlDialect[] = ['postgres', 'sqlite'];

describe.each(DIALECTS)('transaction scope on %s', (dialect) => {
  // One `bunSqlAdapter` value can back more than one better-auth instance, and
  // each carries its own schema — so the adapter a transaction runs on has to
  // come from the instance the transaction was started on, not from whichever
  // instance was built last.
  it('inherits the better-auth options of the instance it was started on', async () => {
    const { sql, calls } = fakeSql({ dialect, rows: [{ id: 'u1' }] });
    const factory = bunSqlAdapter({ sql });
    const withoutAttempts = factory({});
    const withAttempts = factory({ user: { additionalFields: { attempts: { type: 'number' } } } });

    async function createInTransaction(adapter: typeof withAttempts) {
      await adapter.transaction((transaction) =>
        transaction.create({ model: 'user', data: { id: 'u1', attempts: 3 }, forceAllowId: true }),
      );
      return lastCall(calls).text;
    }

    expect(await createInTransaction(withAttempts)).toContain('attempts');
    expect(await createInTransaction(withoutAttempts)).not.toContain('attempts');
  });

  it('keeps the configured table naming inside the transaction', async () => {
    const { sql, calls } = fakeSql({ dialect, rows: [{ id: 'u1' }] });
    const adapter = bunSqlAdapter({ sql, tablesPrefix: 'auth_' })({});

    await adapter.transaction((transaction) =>
      transaction.findOne({ model: 'user', where: [{ field: 'id', value: 'u1' }] }),
    );

    expect(lastCall(calls).text).toBe('SELECT * FROM "auth_user" WHERE "id" = $1 LIMIT 1');
  });
});
