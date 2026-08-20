import type { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BunSqlAdapterConfig } from '#index.ts';
import { type Adapter, type BetterAuthOptions, makeAdapter } from './adapter.ts';
import type { Engine } from './engines.ts';
import { newUser, newVerification } from './records.ts';

const SETUP_TIMEOUT_MS = 30_000;
const CONTENDERS = 20;
const options: BetterAuthOptions = {
  user: { additionalFields: { attempts: { type: 'number' } } },
};

export function describeAtomicSuite({
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
      await sql.unsafe('ALTER TABLE "user" ADD COLUMN "attempts" integer NOT NULL DEFAULT 0', []);
      adapter = makeAdapter({ config, options });
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
      await sql.close();
      await engine.finish();
    });

    function insertVerification(identifier: string) {
      return adapter.create({
        model: 'verification',
        data: newVerification(identifier),
        forceAllowId: true,
      });
    }

    function insertUser(attempts: number) {
      return adapter.create({
        model: 'user',
        data: { ...newUser(), attempts },
        forceAllowId: true,
      });
    }

    it('consumes only one row behind a non-unique predicate', async () => {
      const identifier = Bun.randomUUIDv7();
      await insertVerification(identifier);
      await insertVerification(identifier);

      const consumed = await adapter.consumeOne<{ identifier: string }>({
        model: 'verification',
        where: [{ field: 'identifier', value: identifier }],
      });

      expect(consumed?.identifier).toBe(identifier);
      expect(
        await adapter.count({
          model: 'verification',
          where: [{ field: 'identifier', value: identifier }],
        }),
      ).toBe(1);
    });

    it('hands a single-use row to exactly one concurrent consumer', async () => {
      const verification = await insertVerification(Bun.randomUUIDv7());
      const results = await Promise.all(
        Array.from({ length: CONTENDERS }, function consumeVerification() {
          return adapter.consumeOne({
            model: 'verification',
            where: [{ field: 'id', value: verification.id }],
          });
        }),
      );

      expect(results.filter(Boolean)).toHaveLength(1);
      expect(
        await adapter.count({
          model: 'verification',
          where: [{ field: 'id', value: verification.id }],
        }),
      ).toBe(0);
    });

    it('increments and assigns in one guarded update', async () => {
      const user = await insertUser(2);

      const updated = await adapter.incrementOne<{ attempts: number; name: string }>({
        model: 'user',
        where: [
          { field: 'id', value: user.id },
          { field: 'attempts', value: 0, operator: 'gt' },
        ],
        increment: { attempts: -1 },
        set: { name: 'Retried' },
      });

      expect(updated).toMatchObject({ attempts: 1, name: 'Retried' });
    });

    it('lets exactly one concurrent caller spend the last guarded attempt', async () => {
      const user = await insertUser(1);
      const results = await Promise.all(
        Array.from({ length: CONTENDERS }, function spendAttempt() {
          return adapter.incrementOne({
            model: 'user',
            where: [
              { field: 'id', value: user.id },
              { field: 'attempts', value: 0, operator: 'gt' },
            ],
            increment: { attempts: -1 },
          });
        }),
      );
      const stored = await adapter.findOne<{ attempts: number }>({
        model: 'user',
        where: [{ field: 'id', value: user.id }],
      });

      expect(results.filter(Boolean)).toHaveLength(1);
      expect(stored?.attempts).toBe(0);
    });
  });
}
