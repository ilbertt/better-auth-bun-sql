import { rm } from 'node:fs/promises';
import { $ } from 'bun';

console.log('🧹 Cleaning dist directory...');
await rm('dist', { recursive: true, force: true });

console.log('📝 Generating type declarations...');
await $`bun --bun tsc --project tsconfig.build.json`;

console.log('✅ Done');
