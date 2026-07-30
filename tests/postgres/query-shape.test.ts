import { describe, expect, it } from 'vitest';
import { makeAdapter } from '../support/adapter.ts';
import { fakeSql, lastCall } from '../support/fake-sql.ts';

describe('postgres query shapes', () => {
  it('builds a schema-qualified INSERT ... RETURNING with one placeholder per column', async () => {
    const { sql, calls } = fakeSql({ dialect: 'postgres', rows: [{ id: 'u1' }] });
    const adapter = makeAdapter({ config: { sql, pgSchema: 'auth' } });

    await adapter.create({
      model: 'user',
      data: { id: 'u1', email: 'a@onfabric.io', emailVerified: true },
      forceAllowId: true,
    });

    // The factory injects schema defaults (createdAt/updatedAt) before the
    // adapter sees the row, so the full column set is not asserted.
    const { text, params } = lastCall(calls);
    expect(text).toMatch(
      /^INSERT INTO "auth"\."user" \((("[^"]+", )*"[^"]+")\) VALUES \((\$\d+, )*\$\d+\) RETURNING \*$/,
    );
    const columnList = text.match(/\(([^)]*)\) VALUES/)?.[1] ?? '';
    const columns = columnList.split(', ');
    expect(columns).toContain('"id"');
    expect(columns).toContain('"email"');
    expect(columns).toContain('"emailVerified"');
    expect(params).toHaveLength(columns.length);
    expect(params[columns.indexOf('"email"')]).toBe('a@onfabric.io');
    expect(params[columns.indexOf('"emailVerified"')]).toBe(true);
  });

  it('applies tablesPrefix under the configured schema', async () => {
    const { sql, calls } = fakeSql({ dialect: 'postgres', rows: [{ id: 'u1' }] });
    const adapter = makeAdapter({
      config: { sql, pgSchema: 'app_auth', tablesPrefix: 'auth_' },
    });

    await adapter.count({ model: 'session' });

    expect(lastCall(calls).text).toBe(
      'SELECT count(*)::int AS count FROM "app_auth"."auth_session"',
    );
  });

  it('applies case-insensitive equality with lower() and a ::text cast', async () => {
    const { sql, calls } = fakeSql({ dialect: 'postgres', rows: [{ id: 'u1' }] });
    const adapter = makeAdapter({ config: { sql } });

    await adapter.findOne({
      model: 'user',
      where: [
        {
          field: 'email',
          value: 'A@OnFabric.io',
          operator: 'eq',
          connector: 'AND',
          mode: 'insensitive',
        },
      ],
    });

    const { text, params } = lastCall(calls);
    expect(text).toBe('SELECT * FROM "user" WHERE lower("email"::text) = lower($1) LIMIT 1');
    expect(params).toEqual(['A@OnFabric.io']);
  });

  it('counts rows with a count(*)::int projection', async () => {
    const expectedCount = 7;
    const { sql, calls } = fakeSql({ dialect: 'postgres', rows: [{ count: expectedCount }] });
    const adapter = makeAdapter({ config: { sql } });

    const total = await adapter.count({ model: 'user' });

    expect(lastCall(calls).text).toBe('SELECT count(*)::int AS count FROM "user"');
    expect(total).toBe(expectedCount);
  });
});
