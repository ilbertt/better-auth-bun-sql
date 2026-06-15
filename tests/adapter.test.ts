import { SQL } from 'bun';
import { describe, expect, it } from 'vitest';
import { resolveDialect } from '#dialect.ts';
import { type BunSqlAdapterConfig, bunSqlAdapter } from '#index.ts';

type Call = { text: string; params: unknown[] };

// A fake bun:sql whose `unsafe` records the rendered SQL and bound params and
// returns canned rows carrying the affected-row `count` bun:sql exposes. It has
// no `options.adapter`, so the adapter detects Postgres unless told otherwise.
function fakeSql({
  rows = [],
  count,
  adapter,
}: {
  rows?: Record<string, unknown>[];
  count?: number;
  adapter?: string;
} = {}) {
  const calls: Call[] = [];
  // biome-ignore lint/complexity/useMaxParams: mirrors bun:sql's unsafe(text, params) signature
  const unsafe = (text: string, params: unknown[]) => {
    calls.push({ text, params });
    const result = [...rows] as Record<string, unknown>[] & { count: number };
    result.count = count ?? rows.length;
    return Promise.resolve(result);
  };
  // `options.adapter` is how a real bun:sql instance reports its engine.
  const options = adapter ? { adapter } : undefined;
  return { sql: { unsafe, options } as unknown as SQL, calls };
}

// The adapter factory is generic over options; an empty object is enough for
// these query-shape assertions.
function makeAdapter(config: BunSqlAdapterConfig) {
  return bunSqlAdapter(config)({} as Parameters<ReturnType<typeof bunSqlAdapter>>[0]);
}

const last = (calls: Call[]): Call => calls[calls.length - 1] as Call;

describe('bun sql adapter', () => {
  it('emits unqualified table names when no schema is configured', async () => {
    const { sql, calls } = fakeSql({ rows: [{ id: 'u1' }] });
    const adapter = makeAdapter({ sql });

    await adapter.create({
      model: 'user',
      data: { id: 'u1', email: 'a@onfabric.io' },
      forceAllowId: true,
    });

    expect(last(calls).text.startsWith('INSERT INTO "user" (')).toBe(true);
  });

  it('builds a schema-qualified INSERT ... RETURNING with one placeholder per column', async () => {
    const { sql, calls } = fakeSql({ rows: [{ id: 'u1' }] });
    const adapter = makeAdapter({ sql, schema: 'auth' });

    await adapter.create({
      model: 'user',
      data: { id: 'u1', email: 'a@onfabric.io', emailVerified: true },
      forceAllowId: true,
    });

    // The factory injects schema defaults (createdAt/updatedAt) before the
    // adapter sees the row, so assert the shape and that the supplied columns
    // and their bound values line up, not the full column set.
    const { text, params } = last(calls);
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

  it('renders eq/null/AND in findOne and selects requested columns', async () => {
    const { sql, calls } = fakeSql({ rows: [{ id: 'u1' }] });
    const adapter = makeAdapter({ sql });

    await adapter.findOne({
      model: 'session',
      select: ['id', 'token'],
      where: [
        { field: 'userId', value: 'u1', operator: 'eq', connector: 'AND', mode: 'sensitive' },
        { field: 'ipAddress', value: null, operator: 'eq', connector: 'AND', mode: 'sensitive' },
      ],
    });

    const { text, params } = last(calls);
    expect(text).toBe(
      'SELECT "id", "token" FROM "session" WHERE "userId" = $1 AND "ipAddress" IS NULL LIMIT 1',
    );
    expect(params).toEqual(['u1']);
  });

  it('expands an in-list into a placeholder set', async () => {
    const { sql, calls } = fakeSql();
    const adapter = makeAdapter({ sql });
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

    const { text, params } = last(calls);
    expect(text).toBe(
      'SELECT * FROM "user" WHERE "id" IN ($1, $2) ORDER BY "createdAt" DESC LIMIT $3 OFFSET $4',
    );
    expect(params).toEqual(['a', 'b', limit, offset]);
  });

  it('degrades an empty in-list to a constant false', async () => {
    const { sql, calls } = fakeSql();
    const adapter = makeAdapter({ sql });
    const limit = 100;

    await adapter.findMany({
      model: 'user',
      limit,
      where: [{ field: 'id', value: [], operator: 'in', connector: 'AND', mode: 'sensitive' }],
    });

    expect(last(calls).text).toBe('SELECT * FROM "user" WHERE FALSE LIMIT $1');
  });

  it('applies case-insensitive equality with lower() and a ::text cast on Postgres', async () => {
    const { sql, calls } = fakeSql({ rows: [{ id: 'u1' }] });
    const adapter = makeAdapter({ sql });

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

    const { text, params } = last(calls);
    expect(text).toBe('SELECT * FROM "user" WHERE lower("email"::text) = lower($1) LIMIT 1');
    expect(params).toEqual(['A@OnFabric.io']);
  });

  it('builds an UPDATE ... RETURNING and returns the row', async () => {
    const { sql, calls } = fakeSql({ rows: [{ id: 'u1', name: 'New' }] });
    const adapter = makeAdapter({ sql });

    const row = await adapter.update({
      model: 'user',
      update: { name: 'New' },
      where: [{ field: 'id', value: 'u1', operator: 'eq', connector: 'AND', mode: 'sensitive' }],
    });

    // The factory adds an `updatedAt` touch to the SET clause; assert the
    // statement targets the right table and carries the `name` assignment and
    // the where guard rather than the exact column list.
    const { text, params } = last(calls);
    expect(text.startsWith('UPDATE "user" SET ')).toBe(true);
    expect(text).toContain('"name" = $1');
    expect(text).toMatch(/WHERE "id" = \$\d+ RETURNING \*$/);
    expect(params[0]).toBe('New');
    expect(params).toContain('u1');
    expect(row).toEqual({ id: 'u1', name: 'New' });
  });

  it('returns the affected-row count from updateMany and deleteMany', async () => {
    const updatedRows = 3;
    const updated = fakeSql({ count: updatedRows });
    const updateAdapter = makeAdapter({ sql: updated.sql });
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
    const deleted = fakeSql({ count: deletedRows });
    const deleteAdapter = makeAdapter({ sql: deleted.sql });
    const removed = await deleteAdapter.deleteMany({
      model: 'session',
      where: [
        { field: 'userId', value: 'u1', operator: 'eq', connector: 'AND', mode: 'sensitive' },
      ],
    });
    expect(deleted.calls[0]?.text).toBe('DELETE FROM "session" WHERE "userId" = $1');
    expect(removed).toBe(deletedRows);
  });

  it('counts rows with a count(*)::int projection on Postgres', async () => {
    const expectedCount = 7;
    const { sql, calls } = fakeSql({ rows: [{ count: expectedCount }] });
    const adapter = makeAdapter({ sql });

    const total = await adapter.count({ model: 'user' });

    expect(last(calls).text).toBe('SELECT count(*)::int AS count FROM "user"');
    expect(total).toBe(expectedCount);
  });

  describe('sqlite dialect', () => {
    it('drops the ::int cast from the count projection', async () => {
      const expectedCount = 4;
      const { sql, calls } = fakeSql({ rows: [{ count: expectedCount }] });
      const adapter = makeAdapter({ sql, dialect: 'sqlite' });

      await adapter.count({ model: 'user' });

      expect(last(calls).text).toBe('SELECT count(*) AS count FROM "user"');
    });

    it('drops the ::text cast from case-insensitive comparisons', async () => {
      const { sql, calls } = fakeSql({ rows: [{ id: 'u1' }] });
      const adapter = makeAdapter({ sql, dialect: 'sqlite' });

      await adapter.findOne({
        model: 'user',
        where: [{ field: 'email', value: 'A@B.io', operator: 'eq', mode: 'insensitive' }],
      });

      expect(last(calls).text).toBe(
        'SELECT * FROM "user" WHERE lower("email") = lower($1) LIMIT 1',
      );
    });
  });

  describe('dialect detection', () => {
    it('detects sqlite from sql.options.adapter', async () => {
      const { sql, calls } = fakeSql({ rows: [{ count: 0 }], adapter: 'sqlite' });
      const adapter = makeAdapter({ sql });

      await adapter.count({ model: 'user' });

      expect(last(calls).text).toBe('SELECT count(*) AS count FROM "user"');
    });

    it('throws on an unsupported engine', () => {
      const { sql } = fakeSql({ adapter: 'mysql' });
      expect(() => makeAdapter({ sql })).toThrow(/only Postgres and SQLite/);
    });
  });
});

// `bun:sql` resolves the engine at construction (no connection needed), so this
// asserts detection works for every form a user might instantiate, including
// when no explicit adapter/options are given.
describe('dialect detection from bun:sql instances', () => {
  it.each([
    { label: 'postgres:// URL', make: () => new SQL('postgres://u:p@h:5432/d') },
    { label: 'postgresql:// URL', make: () => new SQL('postgresql://u:p@h/d') },
    {
      label: 'options object (no URL)',
      make: () => new SQL({ hostname: 'h', database: 'd' } as never),
    },
  ])('detects postgres from $label', ({ make }) => {
    const quirks = resolveDialect({ sql: make() });
    expect(quirks.supportsDates).toBe(true);
    expect(quirks.supportsBooleans).toBe(true);
  });

  it.each([':memory:', 'sqlite://my.db', 'file:my.db'])('detects sqlite from %s', (conn) => {
    const quirks = resolveDialect({ sql: new SQL(conn) });
    expect(quirks.supportsDates).toBe(false);
    expect(quirks.supportsBooleans).toBe(false);
  });

  it.each(['mysql://u:p@h:3306/d', 'mariadb://u:p@h:3306/d'])('throws on %s', (conn) => {
    expect(() => resolveDialect({ sql: new SQL(conn) })).toThrow(/only Postgres and SQLite/);
  });
});
