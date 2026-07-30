import { type BunSqlAdapterConfig, bunSqlAdapter } from '#index.ts';

type AdapterFactory = ReturnType<typeof bunSqlAdapter>;

export type BetterAuthOptions = Parameters<AdapterFactory>[0];

export type Adapter = ReturnType<AdapterFactory>;

/**
 * Goes through the factory rather than building an adapter by hand, so tests see
 * the same model/field-name mapping better-auth applies at runtime.
 */
export function makeAdapter({
  config,
  options = {},
}: {
  config: BunSqlAdapterConfig;
  options?: BetterAuthOptions;
}): Adapter {
  return bunSqlAdapter(config)(options);
}
