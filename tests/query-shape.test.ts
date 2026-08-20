import { describe, expect, it } from 'vitest';
import type { BunSqlDialect } from '#dialect.ts';
import { makeAdapter } from './support/adapter.ts';
import { fakeSql, lastCall } from './support/fake-sql.ts';

const DIALECTS: BunSqlDialect[] = ['postgres', 'sqlite'];

describe.each(DIALECTS)('query shapes on %s', (dialect) => {
  it('emits unqualified table names when no schema is configured', async () => {
    const { sql, calls } = fakeSql({ dialect, rows: [{ id: 'u1' }] });
    const adapter = makeAdapter({ config: { sql } });

    await adapter.create({
      model: 'user',
      data: { id: 'u1', email: 'a@onfabric.io' },
      forceAllowId: true,
    });

    expect(lastCall(calls).text.startsWith('INSERT INTO "user" (')).toBe(true);
  });

  it('prefixes table names with tablesPrefix', async () => {
    const { sql, calls } = fakeSql({ dialect, rows: [{ id: 'u1' }] });
    const adapter = makeAdapter({ config: { sql, tablesPrefix: 'auth_' } });

    await adapter.findOne({ model: 'user', where: [{ field: 'id', value: 'u1' }] });

    expect(lastCall(calls).text).toBe('SELECT * FROM "auth_user" WHERE "id" = $1 LIMIT 1');
  });

  // A dotted prefix names a table containing a dot; it is not a way to spell a
  // schema.
  it('quotes the prefix as part of the table identifier', async () => {
    const { sql, calls } = fakeSql({ dialect });
    const adapter = makeAdapter({ config: { sql, tablesPrefix: 'auth."' } });

    await adapter.findOne({ model: 'user', where: [] });

    expect(lastCall(calls).text).toBe('SELECT * FROM "auth.""user" LIMIT 1');
  });

  it('renders eq/null/AND in findOne and selects requested columns', async () => {
    const { sql, calls } = fakeSql({ dialect, rows: [{ id: 'u1' }] });
    const adapter = makeAdapter({ config: { sql } });

    await adapter.findOne({
      model: 'session',
      select: ['id', 'token'],
      where: [
        { field: 'userId', value: 'u1', operator: 'eq', connector: 'AND', mode: 'sensitive' },
        { field: 'ipAddress', value: null, operator: 'eq', connector: 'AND', mode: 'sensitive' },
      ],
    });

    const { text, params } = lastCall(calls);
    expect(text).toBe(
      'SELECT "id", "token" FROM "session" WHERE "userId" = $1 AND "ipAddress" IS NULL LIMIT 1',
    );
    expect(params).toEqual(['u1']);
  });

  it('expands an in-list into a placeholder set', async () => {
    const { sql, calls } = fakeSql({ dialect });
    const adapter = makeAdapter({ config: { sql } });
    const limit = 50;
    const offset = 10;

    await adapter.findMany({
      model: 'user',
      limit,
      offset,
      sortBy: { field: 'createdAt', direction: 'desc' },
      where: [
        { field: 'id', value: ['a', 'b'], operator: 'in', connector: 'AND', mode: 'sensitive' },
      ],
    });

    const { text, params } = lastCall(calls);
    expect(text).toBe(
      'SELECT * FROM "user" WHERE "id" IN ($1, $2) ORDER BY "createdAt" DESC LIMIT $3 OFFSET $4',
    );
    expect(params).toEqual(['a', 'b', limit, offset]);
  });

  it('degrades an empty in-list to a constant false', async () => {
    const { sql, calls } = fakeSql({ dialect });
    const adapter = makeAdapter({ config: { sql } });
    const limit = 100;

    await adapter.findMany({
      model: 'user',
      limit,
      where: [{ field: 'id', value: [], operator: 'in', connector: 'AND', mode: 'sensitive' }],
    });

    expect(lastCall(calls).text).toBe('SELECT * FROM "user" WHERE FALSE LIMIT $1');
  });

  it('builds an UPDATE ... RETURNING and returns the row', async () => {
    const { sql, calls } = fakeSql({ dialect, rows: [{ id: 'u1', name: 'New' }] });
    const adapter = makeAdapter({ config: { sql } });

    const row = await adapter.update({
      model: 'user',
      update: { name: 'New' },
      where: [{ field: 'id', value: 'u1', operator: 'eq', connector: 'AND', mode: 'sensitive' }],
    });

    // The factory adds an `updatedAt` touch to the SET clause, so the exact
    // column list is not asserted.
    const { text, params } = lastCall(calls);
    expect(text.startsWith('UPDATE "user" SET ')).toBe(true);
    expect(text).toContain('"name" = $1');
    expect(text).toMatch(/WHERE "id" = \$\d+ RETURNING \*$/);
    expect(params[0]).toBe('New');
    expect(params).toContain('u1');
    expect(row).toEqual({ id: 'u1', name: 'New' });
  });

  it('returns the affected-row count from updateMany and deleteMany', async () => {
    const updatedRows = 3;
    const updated = fakeSql({ dialect, count: updatedRows });
    const updateAdapter = makeAdapter({ config: { sql: updated.sql } });
    const count = await updateAdapter.updateMany({
      model: 'session',
      update: { token: 'x' },
      where: [
        { field: 'userId', value: 'u1', operator: 'eq', connector: 'AND', mode: 'sensitive' },
      ],
    });
    expect(updated.calls[0]?.text?.startsWith('UPDATE "session" SET ')).toBe(true);
    expect(updated.calls[0]?.text).toContain('"token" = $1');
    expect(count).toBe(updatedRows);

    const deletedRows = 2;
    const deleted = fakeSql({ dialect, count: deletedRows });
    const deleteAdapter = makeAdapter({ config: { sql: deleted.sql } });
    const removed = await deleteAdapter.deleteMany({
      model: 'session',
      where: [
        { field: 'userId', value: 'u1', operator: 'eq', connector: 'AND', mode: 'sensitive' },
      ],
    });
    expect(deleted.calls[0]?.text).toBe('DELETE FROM "session" WHERE "userId" = $1');
    expect(removed).toBe(deletedRows);
  });

  it('atomically deletes and returns at most one matching row', async () => {
    const consumed = { id: 'verification-1', identifier: 'owner-setup' };
    const { sql, calls } = fakeSql({ dialect, rows: [consumed] });
    const adapter = makeAdapter({ config: { sql } });

    const row = await adapter.consumeOne<typeof consumed>({
      model: 'verification',
      where: [{ field: 'identifier', value: consumed.identifier }],
    });

    expect(lastCall(calls)).toEqual({
      text: 'DELETE FROM "verification" WHERE "id" IN (SELECT "id" FROM "verification" WHERE "identifier" = $1 LIMIT 1) RETURNING *',
      params: [consumed.identifier],
    });
    expect(row).toEqual(consumed);
  });

  it('atomically updates one guarded counter and returns the row', async () => {
    const updated = { id: 'user-1', age: 1, name: 'Retried' };
    const { sql, calls } = fakeSql({ dialect, rows: [updated] });
    const adapter = makeAdapter({
      config: { sql },
      options: { user: { additionalFields: { age: { type: 'number' } } } },
    });

    const row = await adapter.incrementOne<typeof updated>({
      model: 'user',
      where: [
        { field: 'id', value: updated.id },
        { field: 'age', value: 0, operator: 'gt' },
      ],
      increment: { age: -1 },
      set: { name: updated.name },
    });

    expect(lastCall(calls)).toEqual({
      text: 'UPDATE "user" SET "name" = $1, "updatedAt" = $2, "age" = "age" + $3 WHERE "id" = $4 AND "age" > $5 AND "id" IN (SELECT "id" FROM "user" WHERE "id" = $6 AND "age" > $7 LIMIT 1) RETURNING *',
      params: [updated.name, expect.anything(), -1, updated.id, 0, updated.id, 0],
    });
    expect(row).toEqual(updated);
  });
});
