import { generateSchema } from '../support/create-schema.ts';
import { describeCrudSuite } from '../support/crud-suite.ts';
import { postgresEngines } from '../support/engines.ts';

const AUTH_SCHEMA = 'app_auth';

const TABLES_PREFIX = 'auth_';

describeCrudSuite({
  engines: postgresEngines({ database: 'better_auth_generated_schema' }),
  name: `against its own generated schema in "${AUTH_SCHEMA}" with the "${TABLES_PREFIX}" table prefix`,
  config: (sql) => ({ sql, pgSchema: AUTH_SCHEMA, tablesPrefix: TABLES_PREFIX }),
  migrate: async ({ sql, config }) => {
    const { code } = await generateSchema({ config });
    // The generated statements are schema-qualified, so the schema only has to
    // exist — no search_path needed.
    await sql.unsafe(`CREATE SCHEMA "${AUTH_SCHEMA}";\n${code}`);
  },
});
