import { describe, expect, it } from 'vitest';
import { makeAdapter } from '../support/adapter.ts';
import { fakeSql, lastCall } from '../support/fake-sql.ts';

describe('sqlite query shapes', () => {
  it('drops the ::int cast from the count projection', async () => {
    const expectedCount = 4;
    const { sql, calls } = fakeSql({ dialect: 'sqlite', rows: [{ count: expectedCount }] });
    const adapter = makeAdapter({ config: { sql } });

    const total = await adapter.count({ model: 'user' });

    expect(lastCall(calls).text).toBe('SELECT count(*) AS count FROM "user"');
    expect(total).toBe(expectedCount);
  });

  // A qualified name on SQLite would address an ATTACHed database, so `pgSchema`
  // is dropped and `tablesPrefix` takes its place.
  it('ignores pgSchema but still applies tablesPrefix', async () => {
    const { sql, calls } = fakeSql({ dialect: 'sqlite', rows: [{ count: 0 }] });
    const adapter = makeAdapter({ config: { sql, pgSchema: 'app_auth', tablesPrefix: 'auth_' } });

    await adapter.count({ model: 'user' });

    expect(lastCall(calls).text).toBe('SELECT count(*) AS count FROM "auth_user"');
  });

  it('drops the ::text cast from case-insensitive comparisons', async () => {
    const { sql, calls } = fakeSql({ dialect: 'sqlite', rows: [{ id: 'u1' }] });
    const adapter = makeAdapter({ config: { sql } });

    await adapter.findOne({
      model: 'user',
      where: [{ field: 'email', value: 'A@B.io', operator: 'eq', mode: 'insensitive' }],
    });

    expect(lastCall(calls).text).toBe(
      'SELECT * FROM "user" WHERE lower("email") = lower($1) LIMIT 1',
    );
  });
});
