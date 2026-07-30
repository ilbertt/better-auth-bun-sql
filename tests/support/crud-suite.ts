import type { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BunSqlAdapterConfig } from '#index.ts';
import { type Adapter, makeAdapter } from './adapter.ts';
import type { Engine } from './engines.ts';

const ONE_HOUR_MS = 3_600_000;

// Creating a database and running the DDL goes over the network to a container.
const SETUP_TIMEOUT_MS = 30_000;

function newUser() {
  const id = Bun.randomUUIDv7();
  return {
    id,
    name: `user-${id}`,
    email: `user-${id}@email.com`,
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function newSession(userId: string) {
  const id = Bun.randomUUIDv7();
  return {
    id,
    expiresAt: new Date(Date.now() + ONE_HOUR_MS),
    token: Bun.randomUUIDv7(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ipAddress: '127.0.0.1',
    userAgent: 'Some User Agent',
    userId,
  };
}

/**
 * The adapter is built from the same config `migrate` received, so a run proves
 * the DDL and the emitted queries agree on `pgSchema`/`tablesPrefix`.
 */
export function describeCrudSuite({
  engines,
  name,
  config = (sql) => ({ sql }),
  migrate,
}: {
  engines: Engine[];
  name: string;
  config?: (sql: SQL) => BunSqlAdapterConfig;
  migrate: (context: { sql: SQL; config: BunSqlAdapterConfig }) => Promise<void>;
}): void {
  describe.each(engines)('$label', (engine) => {
    let sql: SQL;
    let adapter: Adapter;

    beforeAll(async () => {
      sql = await engine.open();
      const resolved = config(sql);
      await migrate({ sql, config: resolved });
      adapter = makeAdapter({ config: resolved });
    }, SETUP_TIMEOUT_MS);

    afterAll(async () => {
      await sql.close();
      await engine.finish();
    });

    registerCrudSuite({ name, getAdapter: () => adapter });
  });
}

// `getAdapter` is read lazily so the caller's `beforeAll` has run before any
// test body executes.
function registerCrudSuite({
  name,
  getAdapter,
}: {
  name: string;
  getAdapter: () => Adapter;
}): void {
  const insertUser = () =>
    getAdapter().create({ model: 'user', data: newUser(), forceAllowId: true });
  const insertSession = async () => {
    const user = await insertUser();
    const session = await getAdapter().create({
      model: 'session',
      data: newSession(user.id),
      forceAllowId: true,
    });
    return { user, session };
  };

  describe(name, () => {
    it('creates and reads back a user with booleans and dates', async () => {
      const user = newUser();
      const created = await getAdapter().create({ model: 'user', data: user, forceAllowId: true });
      expect(created.id).toBe(user.id);
      expect(created.emailVerified).toBe(user.emailVerified);
      expect(created.createdAt).toBeInstanceOf(Date);

      const found = await getAdapter().findOne<typeof created>({
        model: 'user',
        where: [{ field: 'id', value: user.id }],
      });
      expect(found?.email).toBe(user.email);
    });

    it('matches email case-insensitively', async () => {
      const user = await insertUser();
      const found = await getAdapter().findOne<typeof user>({
        model: 'user',
        where: [
          { field: 'email', value: user.email.toUpperCase(), operator: 'eq', mode: 'insensitive' },
        ],
      });
      expect(found?.id).toBe(user.id);
    });

    it('finds many sorted and paginated', async () => {
      const a = await insertUser();
      const b = await insertUser();
      const expectedFirstId = [a.id, b.id].sort()[0];
      const page = await getAdapter().findMany<typeof a>({
        model: 'user',
        sortBy: { field: 'id', direction: 'asc' },
        limit: 1,
        offset: 0,
        where: [{ field: 'id', value: [a.id, b.id], operator: 'in' }],
      });
      expect(page).toHaveLength(1);
      expect(page[0]?.id).toBe(expectedFirstId);
    });

    it('counts rows behind a where guard', async () => {
      const user = await insertUser();
      const total = await getAdapter().count({
        model: 'user',
        where: [{ field: 'id', value: user.id }],
      });
      expect(total).toBe(1);
    });

    it('updates a single row and returns it', async () => {
      const user = await insertUser();
      const updated = await getAdapter().update<typeof user>({
        model: 'user',
        where: [{ field: 'id', value: user.id }],
        update: { name: 'Renamed' },
      });
      expect(updated?.name).toBe('Renamed');
    });

    it('reports affected-row counts from updateMany and deleteMany', async () => {
      const { user } = await insertSession();
      const renamed = await getAdapter().updateMany({
        model: 'session',
        where: [{ field: 'userId', value: user.id }],
        update: { userAgent: 'agent' },
      });
      expect(renamed).toBe(1);

      const removed = await getAdapter().deleteMany({
        model: 'session',
        where: [{ field: 'userId', value: user.id }],
      });
      expect(removed).toBe(1);
    });

    it('deletes a single row', async () => {
      const user = await insertUser();
      await getAdapter().delete({ model: 'user', where: [{ field: 'id', value: user.id }] });
      const found = await getAdapter().findOne({
        model: 'user',
        where: [{ field: 'id', value: user.id }],
      });
      expect(found).toBeNull();
    });
  });
}
