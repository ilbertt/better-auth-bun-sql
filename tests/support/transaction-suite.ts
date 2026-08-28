import type { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BunSqlAdapterConfig } from '#index.ts';
import { type Adapter, makeAdapter } from './adapter.ts';
import type { Engine } from './engines.ts';
import { newUser } from './records.ts';

const SETUP_TIMEOUT_MS = 30_000;
const CONTENDERS = 20;

export function describeTransactionSuite({
  engines,
  isolatesUncommittedWrites,
  migrate,
}: {
  engines: Engine[];
  /**
   * Whether the adapter outside the transaction is blind to its uncommitted
   * writes. Postgres runs the transaction on its own pooled connection, so it
   * is; SQLite has the one connection, so the outer adapter is itself inside
   * the open transaction and reads right through it.
   */
  isolatesUncommittedWrites: boolean;
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

    function findUser(id: string) {
      return adapter.findOne({ model: 'user', where: [{ field: 'id', value: id }] });
    }

    it('commits successful transactions', async () => {
      const user = newUser();

      await adapter.transaction(async (transaction) => {
        await transaction.create({ model: 'user', data: user, forceAllowId: true });
        // A `transaction` that never opened one would leave the row committed
        // here, so this is what separates the real implementation from a
        // passthrough that runs the callback against the plain adapter.
        expect((await findUser(user.id)) === null).toBe(isolatesUncommittedWrites);
      });

      expect(await findUser(user.id)).toMatchObject({ id: user.id });
    });

    it('rolls back failed transactions', async () => {
      const user = newUser();

      await expect(
        adapter.transaction(async (transaction) => {
          await transaction.create({ model: 'user', data: user, forceAllowId: true });
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');

      expect(await findUser(user.id)).toBeNull();
    });

    // better-auth's `runWithTransaction` returns whatever the callback resolved
    // to, so every flow it wraps depends on `sql.begin` forwarding it.
    it('resolves to the callback result', async () => {
      await expect(adapter.transaction(() => Promise.resolve('committed'))).resolves.toBe(
        'committed',
      );
    });

    it('runs overlapping transactions without dropping any', async () => {
      const users = Array.from({ length: CONTENDERS }, () => newUser());

      await Promise.all(
        users.map((user) =>
          adapter.transaction((transaction) =>
            transaction.create({ model: 'user', data: user, forceAllowId: true }),
          ),
        ),
      );

      expect(await Promise.all(users.map((user) => findUser(user.id)))).not.toContain(null);
    });

    // better-auth's `DBTransactionAdapter` type drops `transaction`, but the
    // adapter it hands the callback still answers one — as-is, on the open
    // transaction, with no savepoint of its own. There is nothing to roll back
    // to, so a nested failure takes the whole transaction with it.
    it('runs a nested transaction on the open one', async () => {
      const outer = newUser();
      const nested = newUser();

      await expect(
        adapter.transaction(async (transaction) => {
          await transaction.create({ model: 'user', data: outer, forceAllowId: true });
          await (transaction as Adapter).transaction(async (inner) => {
            await inner.create({ model: 'user', data: nested, forceAllowId: true });
            throw new Error('rollback');
          });
        }),
      ).rejects.toThrow('rollback');

      expect(await findUser(outer.id)).toBeNull();
      expect(await findUser(nested.id)).toBeNull();
    });
  });
}
