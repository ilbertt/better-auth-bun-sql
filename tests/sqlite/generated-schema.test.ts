import { describe, expect, it } from 'vitest';
import { type BetterAuthOptions, makeAdapter } from '../support/adapter.ts';
import { generateSchema } from '../support/create-schema.ts';
import { describeCrudSuite } from '../support/crud-suite.ts';
import { sqliteEngine } from '../support/engines.ts';

// The table prefix stands in for the schema qualification SQLite cannot express.
const TABLES_PREFIX = 'auth_';

describeCrudSuite({
  engines: [sqliteEngine()],
  name: `against its own generated schema with the "${TABLES_PREFIX}" table prefix`,
  // `pgSchema` is set alongside the prefix to prove it is dropped: the generated
  // DDL and the emitted queries have to agree on unqualified, prefixed table
  // names, or every statement in the suite would fail.
  config: (sql) => ({ sql, pgSchema: 'app_auth', tablesPrefix: TABLES_PREFIX }),
  migrate: async ({ sql, config }) => {
    const { code } = await generateSchema({ config });
    await sql.unsafe(code, []);
  },
});

describe('generated schema round-trips every column type', () => {
  const AGE = 36;
  const options: BetterAuthOptions = {
    user: {
      additionalFields: {
        metadata: { type: 'json' },
        tags: { type: 'string[]' },
        age: { type: 'number' },
      },
    },
  };

  it('writes and reads back every generated column type', async () => {
    const sql = await sqliteEngine().open();
    const config = { sql, usePlural: true, tablesPrefix: TABLES_PREFIX };
    const { code } = await generateSchema({ config, options });
    await sql.unsafe(code, []);

    const adapter = makeAdapter({ config, options });
    const created = await adapter.create<Record<string, unknown>>({
      model: 'user',
      forceAllowId: true,
      data: {
        id: Bun.randomUUIDv7(),
        name: 'Ada',
        email: 'ada@email.com',
        emailVerified: true,
        image: null,
        metadata: { theme: 'dark' },
        tags: ['founder', 'admin'],
        age: AGE,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Reads through raw SQL: the DDL and the adapter have to agree on the name
    // `usePlural` and `tablesPrefix` produce.
    const [row] = await sql.unsafe(`SELECT count(*) AS total FROM "${TABLES_PREFIX}users"`, []);
    expect(row?.total).toBe(1);

    const found = await adapter.findOne<typeof created>({
      model: 'user',
      where: [{ field: 'id', value: created.id as string }],
    });
    expect(found?.emailVerified).toBe(true);
    expect(found?.metadata).toEqual({ theme: 'dark' });
    expect(found?.tags).toEqual(['founder', 'admin']);
    expect(found?.age).toBe(AGE);
    expect(found?.createdAt).toBeInstanceOf(Date);

    await sql.close();
  });
});
