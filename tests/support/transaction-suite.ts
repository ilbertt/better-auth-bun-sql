import type { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BunSqlAdapterConfig } from '#index.ts';
import { type Adapter, makeAdapter } from './adapter.ts';
import type { Engine } from './engines.ts';
import { newUser } from './records.ts';

const SETUP_TIMEOUT_MS = 30_000;

export function describeTransactionSuite({
  engines,
  migrate,
}: {
  engines: Engine[];
  migrate: (context: { sql: SQL; config: BunSqlAdapterConfig }) => Promise<void>;
}): void {
  describe.each(engines)('$label', (engine) => {
    let sql: SQL;
    let adapter: Adapter;

    beforeAll(async () => {
      sql = await engine.open();
      const config = { sql };
      await migrate({ sql, config });
      adapter = makeAdapter({ config });
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
      await sql.close();
      await engine.finish();
    });

    it('commits successful transactions', async () => {
      const user = newUser();

      await adapter.transaction((transaction) =>
        transaction.create({ model: 'user', data: user, forceAllowId: true }),
      );

      expect(
        await adapter.findOne({ model: 'user', where: [{ field: 'id', value: user.id }] }),
      ).toMatchObject({ id: user.id });
    });

    it('rolls back failed transactions', async () => {
      const user = newUser();

      await expect(
        adapter.transaction(async (transaction) => {
          await transaction.create({ model: 'user', data: user, forceAllowId: true });
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');

      expect(
        await adapter.findOne({ model: 'user', where: [{ field: 'id', value: user.id }] }),
      ).toBeNull();
    });
  });
}
