#!/usr/bin/env bun
const version = process.argv[2];
if (!version) {
  throw new Error('usage: bun scripts/set-version.ts <version>');
}

const pkg = await Bun.file('package.json').json();
pkg.version = version;
await Bun.write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
