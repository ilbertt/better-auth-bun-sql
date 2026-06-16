import { $ } from 'bun';

await $`bun run generate:fixtures`;

const { exitCode } = await $`git diff --exit-code -- tests/fixtures`.nothrow();
if (exitCode !== 0) {
  console.error(
    '\n✖ Schema fixtures are stale. Run `bun run generate:fixtures` and commit the result.',
  );
  process.exit(1);
}

console.log('✅ Schema fixtures are up to date');
