import { SQL } from 'bun';
import { afterAll, beforeAll } from 'vitest';
import { bunSqlAdapter } from '#index.ts';
import { generateSchema } from './support/create-schema.ts';
import { registerCrudSuite } from './support/crud-suite.ts';

// The sqlite counterpart to `adapter.create-schema-postgres.test.ts`: the DDL the
// adapter generates, executed on a real (in-memory) sqlite and driven through the
// full CRUD suite — here with the table prefix that stands in for the schema
// qualification sqlite cannot express.
const TABLES_PREFIX = 'auth_';

let sql: SQL;
let adapter: ReturnType<ReturnType<typeof bunSqlAdapter>>;

beforeAll(async () => {
  sql = new SQL(':memory:');
  // `pgSchema` is set alongside the prefix to prove it is dropped on sqlite: the
  // generated DDL and the adapter's queries have to agree on unqualified,
  // prefixed table names, or every statement below would fail.
  const config = { sql, pgSchema: 'app_auth', tablesPrefix: TABLES_PREFIX };
  const { code } = await generateSchema({ config });
  await sql.unsafe(code, []);
  adapter = bunSqlAdapter(config)({} as Parameters<ReturnType<typeof bunSqlAdapter>>[0]);
});

afterAll(async () => {
  await sql.close();
});

registerCrudSuite({
  name: `bun-sql adapter against its own generated sqlite schema with the "${TABLES_PREFIX}" table prefix`,
  getAdapter: () => adapter,
});
