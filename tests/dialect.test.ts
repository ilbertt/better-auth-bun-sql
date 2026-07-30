import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveDialect } from '#dialect.ts';
import { makeAdapter } from './support/adapter.ts';

// `bun:sql` resolves the engine at construction, so no server is involved here.
describe('dialect detection from bun:sql instances', () => {
  it.each([
    { label: 'postgres:// URL', make: () => new SQL('postgres://u:p@h:5432/d') },
    { label: 'postgresql:// URL', make: () => new SQL('postgresql://u:p@h/d') },
    {
      label: 'options object (no URL)',
      make: () => new SQL({ hostname: 'h', database: 'd' } as never),
    },
  ])('detects postgres from $label', ({ make }) => {
    const quirks = resolveDialect(make());
    expect(quirks.supportsDates).toBe(true);
    expect(quirks.supportsBooleans).toBe(true);
  });

  // File-based sqlite URLs open the db on construction, so keep them in the OS
  // temp dir (not the repo) and clean them up.
  const sqliteUrlDb = join(tmpdir(), 'better-auth-bun-sql-url.db');
  const sqliteFileDb = join(tmpdir(), 'better-auth-bun-sql-file.db');
  afterAll(() => {
    for (const f of [sqliteUrlDb, sqliteFileDb]) {
      for (const suffix of ['', '-shm', '-wal']) {
        rmSync(`${f}${suffix}`, { force: true });
      }
    }
  });

  it.each([
    { label: ':memory:', conn: ':memory:' },
    { label: 'sqlite:// URL', conn: `sqlite://${sqliteUrlDb}` },
    { label: 'file: URL', conn: `file:${sqliteFileDb}` },
  ])('detects sqlite from $label', async ({ conn }) => {
    const sql = new SQL(conn);
    const quirks = resolveDialect(sql);
    expect(quirks.supportsDates).toBe(false);
    expect(quirks.supportsBooleans).toBe(false);
    await sql.close();
  });

  describe.each(['mysql://u:p@h:3306/d', 'mariadb://u:p@h:3306/d'])('%s', (conn) => {
    it('is rejected by resolveDialect', () => {
      expect(() => resolveDialect(new SQL(conn))).toThrow(/only Postgres and SQLite/);
    });

    it('is rejected by the adapter factory', () => {
      expect(() => makeAdapter({ config: { sql: new SQL(conn) } })).toThrow(
        /only Postgres and SQLite/,
      );
    });
  });
});
