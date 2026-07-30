import type { DBAdapterSchemaCreation } from 'better-auth/adapters';
import { type BunSqlAdapterConfig, bunSqlAdapter } from '#index.ts';

type BetterAuthOptions = Parameters<ReturnType<typeof bunSqlAdapter>>[0];

/**
 * Drives `createSchema` the way `@better-auth/cli generate` does — through the
 * built adapter, so the factory resolves the better-auth schema from `options`
 * and applies the adapter's own model/field-name mapping.
 */
export function generateSchema({
  config,
  options = {},
  file,
}: {
  config: BunSqlAdapterConfig;
  options?: BetterAuthOptions;
  file?: string;
}): Promise<DBAdapterSchemaCreation> {
  const { createSchema } = bunSqlAdapter(config)(options);
  if (!createSchema) {
    throw new Error('the adapter no longer implements createSchema');
  }
  return createSchema(options, file);
}
