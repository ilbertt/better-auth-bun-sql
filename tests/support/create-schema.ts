import type { DBAdapterSchemaCreation } from 'better-auth/adapters';
import type { BunSqlAdapterConfig } from '#index.ts';
import { type BetterAuthOptions, makeAdapter } from './adapter.ts';

/** Drives `createSchema` through the built adapter, as `@better-auth/cli generate` does. */
export function generateSchema({
  config,
  options = {},
  file,
}: {
  config: BunSqlAdapterConfig;
  options?: BetterAuthOptions;
  file?: string;
}): Promise<DBAdapterSchemaCreation> {
  const { createSchema } = makeAdapter({ config, options });
  if (!createSchema) {
    throw new Error('the adapter no longer implements createSchema');
  }
  return createSchema(options, file);
}
