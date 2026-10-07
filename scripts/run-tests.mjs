import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Expand files here so npm test also works on Node 20 and Windows cmd.exe.
const root = fileURLToPath(new URL('../', import.meta.url));
const files = readdirSync(new URL('../tests/', import.meta.url))
  .filter(name => name.endsWith('.test.mjs')).sort().map(name => `tests/${name}`);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=4', ...files], {cwd:root, stdio:'inherit'});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
