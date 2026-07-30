import type { BetterAuthDBSchema, DBFieldAttribute } from 'better-auth/db';
import type { DialectQuirks } from './dialect';
import { prefixed, qualified, quoteId } from './sql-builder';

/** Column types spelled the same way on Postgres and SQLite. */
const TEXT = 'text';
const INTEGER = 'integer';
const BIGINT = 'bigint';

/** Where `@better-auth/cli generate` writes the schema when given no `--output`. */
export const DEFAULT_SCHEMA_FILE = './auth-schema.sql';

/**
 * Where primary keys come from, derived from better-auth's
 * `advanced.database.generateId`. `serial` hands generation to the database;
 * every other setting — including `uuid` — has better-auth generate a string in
 * JS, which this adapter stores as text because it doesn't declare
 * `supportsUUIDs` and so never sees a native uuid value.
 */
export type IdStrategy = 'text' | 'serial';

/** Maps a better-auth model name to its table name (`usePlural`, `modelName`). */
type GetTable = (model: string) => string;

/** Maps a model field name to its column name. */
type GetColumn = (props: { model: string; field: string }) => string;

type DdlContext = {
  quirks: DialectQuirks;
  idStrategy: IdStrategy;
  pgSchema: string | undefined;
  /** Resolves a model to its final, already-prefixed table name. */
  getTable: GetTable;
  getColumn: GetColumn;
};

type TableDefinition = {
  table: string;
  order: number;
  columns: string[];
  indexes: string[];
};

function columnType({
  column,
  field,
  context,
}: {
  column: string;
  field: DBFieldAttribute;
  context: DdlContext;
}): string {
  // A foreign key has to match the type of the primary key it points at.
  if (field.references?.field === 'id') {
    return context.idStrategy === 'serial' ? INTEGER : TEXT;
  }
  // A field typed as an array of literals is an enum; its values are stored as text.
  if (Array.isArray(field.type)) {
    return TEXT;
  }
  switch (field.type) {
    case 'string':
      return TEXT;
    case 'boolean':
      return context.quirks.ddl.boolean;
    case 'number':
      return field.bigint ? BIGINT : INTEGER;
    case 'date':
      return context.quirks.ddl.date;
    // The adapter declares neither `supportsJSON` nor `supportsArrays`, so
    // better-auth hands these over already JSON-stringified — a native `jsonb`
    // column would hand back a parsed object the adapter would fail to re-parse.
    case 'json':
    case 'string[]':
    case 'number[]':
      return TEXT;
    default:
      throw new Error(
        `@ilbertt/better-auth-bun-sql cannot generate a column for field '${column}' of type '${String(field.type)}'. Supported types are: string, number, boolean, date, json, string[], number[].`,
      );
  }
}

// Modifier order mirrors the DDL better-auth's own Kysely migrator compiles, so
// the generated schema is byte-identical to `@better-auth/cli generate` output
// for the engines this adapter supports.
function columnDefinition({
  column,
  field,
  context,
}: {
  column: string;
  field: DBFieldAttribute;
  context: DdlContext;
}): string {
  const parts = [quoteId(column), columnType({ column, field, context })];
  if (
    field.type === 'date' &&
    typeof field.defaultValue === 'function' &&
    context.quirks.ddl.defaultCurrentTimestamp
  ) {
    parts.push('default CURRENT_TIMESTAMP');
  }
  if (field.required !== false) {
    parts.push('not null');
  }
  if (field.unique) {
    parts.push('unique');
  }
  const { references } = field;
  if (references) {
    const target = qualified({
      pgSchema: context.pgSchema,
      table: context.getTable(references.model),
    });
    const targetColumn = context.getColumn({
      model: references.model,
      field: references.field,
    });
    parts.push(
      `references ${target} (${quoteId(targetColumn)}) on delete ${references.onDelete ?? 'cascade'}`,
    );
  }
  return parts.join(' ');
}

function idColumnDefinition(context: DdlContext): string {
  const type = context.idStrategy === 'serial' ? context.quirks.ddl.serialId : TEXT;
  return `${quoteId('id')} ${type} not null primary key`;
}

function createIndexStatement({
  table,
  column,
  context,
}: {
  table: string;
  column: string;
  context: DdlContext;
}): string {
  const name = quoteId(`${table}_${column}_idx`);
  const on = qualified({ pgSchema: context.pgSchema, table });
  return `create index ${name} on ${on} (${quoteId(column)})`;
}

/**
 * Renders the full `CREATE TABLE`/`CREATE INDEX` DDL for a better-auth schema.
 *
 * Every table is emitted unconditionally — the statements describe the schema
 * better-auth expects rather than a diff against a live database, so generating
 * needs no connection and the output is deterministic and diffable.
 */
export function buildSchemaDdl({
  tables,
  pgSchema,
  tablesPrefix,
  quirks,
  idStrategy,
  getTable,
  getColumn,
}: {
  tables: BetterAuthDBSchema;
  pgSchema: string | undefined;
  tablesPrefix: string | undefined;
  quirks: DialectQuirks;
  idStrategy: IdStrategy;
  getTable: GetTable;
  getColumn: GetColumn;
}): string {
  // Applied once here rather than at every reference so index names carry the
  // prefix too — on SQLite they share one namespace with every other table.
  function prefixedTable(model: string): string {
    return prefixed({ tablesPrefix, table: getTable(model) });
  }

  const context: DdlContext = {
    quirks,
    idStrategy,
    pgSchema,
    getTable: prefixedTable,
    getColumn,
  };
  // Models keyed separately can resolve to one table — a plugin extending `user`
  // declares `modelName: 'user'` — so definitions are merged by table name.
  const definitions = new Map<string, TableDefinition>();

  // `disableMigrations` is deliberately not honoured: better-auth declares the
  // flag but reads it nowhere, so skipping those tables would omit tables its own
  // generator emits — a user who owns a table can drop the statement instead.
  for (const [model, { fields, order }] of Object.entries(tables)) {
    const table = context.getTable(model);
    let definition = definitions.get(table);
    if (!definition) {
      definition = {
        table,
        order: order ?? Number.POSITIVE_INFINITY,
        columns: [idColumnDefinition(context)],
        indexes: [],
      };
      definitions.set(table, definition);
    }
    for (const [field, attributes] of Object.entries(fields)) {
      const column = getColumn({ model, field });
      definition.columns.push(columnDefinition({ column, field: attributes, context }));
      // A `unique` column constraint already carries an index, so better-auth
      // emits a separate one only for indexed fields that are not unique.
      if (attributes.index && attributes.unique !== true) {
        definition.indexes.push(createIndexStatement({ table, column, context }));
      }
    }
  }

  // Referenced tables have to exist before the tables referencing them, which
  // better-auth encodes as an ascending `order`. Indexes come last so they never
  // land before the table they cover.
  // biome-ignore lint/complexity/useMaxParams: Array#sort's comparator signature
  const ordered = [...definitions.values()].sort((a, b) => {
    if (a.order === b.order) {
      return 0;
    }
    return a.order < b.order ? -1 : 1;
  });

  const statements = [
    ...ordered.map(
      ({ table, columns }) =>
        `create table ${qualified({ pgSchema, table })} (${columns.join(', ')})`,
    ),
    ...ordered.flatMap(({ indexes }) => indexes),
  ];
  return `${statements.join(';\n\n')};`;
}
