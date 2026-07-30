import { Database } from 'bun:sqlite';
import { fileURLToPath } from 'node:url';
import { getMigrations } from 'better-auth/db/migration';
import { SQL } from 'bun';
import { afterAll, describe, expect, it } from 'vitest';
import { bunSqlAdapter } from '#index.ts';
import { generateSchema } from './support/create-schema.ts';

type BetterAuthOptions = NonNullable<Parameters<typeof generateSchema>[0]['options']>;

// `createSchema` renders DDL from the resolved better-auth schema alone, so a
// connection is needed only for the dialect the adapter detects from it.
const postgres = new SQL('postgres://user:pass@localhost:5432/db');
const sqlite = new SQL(':memory:');

afterAll(async () => {
  await sqlite.close();
});

const fixture = async (engine: 'postgres' | 'sqlite'): Promise<string> => {
  const path = fileURLToPath(new URL(`./fixtures/${engine}-auth-schema.sql`, import.meta.url));
  const text = await Bun.file(path).text();
  // Drop the generator's header comment; what remains is the canonical DDL.
  return text
    .split('\n')
    .filter((line) => !line.startsWith('--'))
    .join('\n')
    .trim();
};

// better-auth's own Kysely migrator — the code path `@better-auth/cli generate`
// takes for its first-party adapters. SQLite needs no container, so the canonical
// schema can be recomputed per option set instead of only for the core models the
// committed fixtures cover.
const canonicalSqliteDdl = async (options: BetterAuthOptions): Promise<string> => {
  const database = new Database(':memory:');
  try {
    const { compileMigrations } = await getMigrations({ ...options, database } as never);
    return (await compileMigrations()).trim();
  } finally {
    database.close();
  }
};

const OPTION_SETS: { name: string; options: BetterAuthOptions }[] = [
  { name: 'the core models', options: {} },
  {
    name: 'additional fields of every supported type',
    options: {
      user: {
        additionalFields: {
          age: { type: 'number' },
          followers: { type: 'number', bigint: true },
          metadata: { type: 'json' },
          tags: { type: 'string[]' },
          scores: { type: 'number[]' },
          role: { type: ['admin', 'member'] },
          nickname: { type: 'string', unique: true },
          bannedAt: { type: 'date', required: false },
          handle: { type: 'string', index: true },
          slug: { type: 'string', unique: true, index: true },
        },
      },
    },
  },
  {
    name: 'custom model and field names',
    options: {
      user: { modelName: 'app_user', fields: { email: 'email_address' } },
      session: { modelName: 'app_session', fields: { userId: 'user_ref' } },
    },
  },
  {
    name: 'a plugin table referencing user',
    options: {
      plugins: [
        {
          id: 'passkey',
          schema: {
            passkey: {
              fields: {
                name: { type: 'string', required: false },
                counter: { type: 'number', required: true },
                userId: {
                  type: 'string',
                  required: true,
                  references: { model: 'user', field: 'id', onDelete: 'cascade' },
                  index: true,
                },
              },
            },
          },
        },
      ],
    },
  },
  {
    name: 'database-assigned numeric ids',
    options: { advanced: { database: { generateId: 'serial' } } },
  },
];

describe('createSchema', () => {
  // The strongest guarantee this adapter can give: for the engines it supports,
  // the schema it asks for is the schema better-auth's own generator asks for.
  it.each(OPTION_SETS)('matches better-auth on sqlite for $name', async ({ options }) => {
    const { code } = await generateSchema({ config: { sql: sqlite }, options });
    expect(code.trim()).toBe(await canonicalSqliteDdl(options));
  });

  it.each([
    'postgres',
    'sqlite',
  ] as const)('reproduces the committed %s fixture for the core models', async (engine) => {
    const { code } = await generateSchema({
      config: { sql: engine === 'postgres' ? postgres : sqlite },
    });
    expect(code.trim()).toBe(await fixture(engine));
  });

  it('defaults to ./auth-schema.sql and honours an explicit output file', async () => {
    const { path } = await generateSchema({ config: { sql: postgres } });
    expect(path).toBe('./auth-schema.sql');

    const explicit = await generateSchema({ config: { sql: postgres }, file: './db/auth.sql' });
    expect(explicit.path).toBe('./db/auth.sql');
  });

  it('qualifies tables, foreign keys and indexes with the configured schema', async () => {
    const { code } = await generateSchema({ config: { sql: postgres, schema: 'app_auth' } });

    expect(code).toContain('create table "app_auth"."user" (');
    expect(code).toContain('references "app_auth"."user" ("id") on delete cascade');
    expect(code).toContain('create index "session_userId_idx" on "app_auth"."session" ("userId")');
  });

  it('pluralises table, foreign key and index names when usePlural is set', async () => {
    const { code } = await generateSchema({ config: { sql: postgres, usePlural: true } });

    expect(code).toContain('create table "users" (');
    expect(code).toContain('references "users" ("id") on delete cascade');
    expect(code).toContain('create index "sessions_userId_idx" on "sessions" ("userId")');
  });

  it('names a unique index with the uidx suffix', async () => {
    const { code } = await generateSchema({
      config: { sql: postgres },
      options: {
        user: { additionalFields: { slug: { type: 'string', unique: true, index: true } } },
      },
    });

    expect(code).toContain('create unique index "user_slug_uidx" on "user" ("slug")');
  });

  // The two places the generated DDL deliberately parts ways with better-auth's
  // Kysely output, both because this adapter declares fewer native capabilities.
  describe('postgres columns follow the capabilities the adapter declares', () => {
    it('stores json and arrays as text rather than jsonb', async () => {
      const { code } = await generateSchema({
        config: { sql: postgres },
        options: {
          user: {
            additionalFields: { metadata: { type: 'json' }, tags: { type: 'string[]' } },
          },
        },
      });

      // `supportsJSON`/`supportsArrays` are false, so better-auth hands the
      // adapter a JSON string — jsonb would read back as an already-parsed object.
      expect(code).toContain('"metadata" text not null');
      expect(code).toContain('"tags" text not null');
      expect(code).not.toContain('jsonb');
    });

    it('keeps uuid ids as text because it never sees a native uuid', async () => {
      const { code } = await generateSchema({
        config: { sql: postgres },
        options: { advanced: { database: { generateId: 'uuid' } } },
      });

      expect(code).toContain('"id" text not null primary key');
      expect(code).not.toContain('gen_random_uuid');
    });
  });

  it('reports the field it cannot map when a type is unsupported', async () => {
    await expect(
      generateSchema({
        config: { sql: postgres },
        options: {
          user: { additionalFields: { pointer: { type: 'blob' } } },
        } as unknown as BetterAuthOptions,
      }),
    ).rejects.toThrow(/field 'pointer' of type 'blob'/);
  });
});

// Textual parity proves the DDL is the right DDL; executing it proves the adapter
// can actually read and write through the schema it just generated.
describe('generated sqlite schema round-trips through the adapter', () => {
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
    const sql = new SQL(':memory:');
    const config = { sql, usePlural: true };
    const { code } = await generateSchema({ config, options });
    await sql.unsafe(code, []);

    const adapter = bunSqlAdapter(config)(options);
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

    // `usePlural` was honoured by the DDL and by the adapter, so both agree.
    const [row] = await sql.unsafe('SELECT count(*) AS total FROM "users"', []);
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
