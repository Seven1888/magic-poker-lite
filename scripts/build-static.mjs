import {copyFile, mkdir, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Package the public game only: no Git metadata, local QA, credentials or tools.
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.resolve(root, 'dist');
if (path.dirname(destination) !== path.resolve(root) || path.basename(destination) !== 'dist') {
  throw new Error('Build output must be the project dist directory.');
}
await rm(destination, {recursive: true, force: true});
const files = new Set(['index.html', 'probability.html', 'docs/04-game-flow-and-math.html',
  'docs/04-game-flow-and-math.md', 'docs/05-art-and-pot.md', 'API-CONTRACT.md', 'output/math-validation.json', 'output/math-v35-validation.json', 'output/math-v41-range-validation.json', 'output/math-v42-range-validation.json', 'output/math-v43-holdem-validation.json']);
for (const directory of ['src', 'styles']) {
  for (const entry of await readdir(path.join(root, directory))) {
    if (/\.(?:mjs|css)$/.test(entry) && entry !== 'fantasy.css') files.add(`${directory}/${entry}`);
  }
}
// Include static asset references and the two dynamic card/rank families.
for (const file of files) {
  if (!/^(?:index\.html|probability\.html|(?:src|styles)\/.*\.(?:mjs|css))$/.test(file)) continue;
  const source = await readFile(path.join(root, file), 'utf8');
  for (const match of source.matchAll(/(?:\.\.\/)?(assets\/[a-zA-Z0-9_./-]+\.(?:png|svg|webp|jpg))/g)) files.add(match[1]);
}
for (const suit of ['s', 'h', 'd', 'f']) {
  for (let rank = 1; rank <= 13; rank++) files.add(`assets/cards/${suit}${rank}.png`);
}
files.add('assets/cards/back-blue.png');
for (let rank = 1; rank <= 10; rank++) files.add(`assets/legacy/type${rank}-base.png`);
let bytes = 0;
for (const file of files) {
  const from = path.resolve(root, file), to = path.resolve(destination, file);
  if (!from.startsWith(root) || !to.startsWith(destination + path.sep)) throw new Error(`Invalid public path: ${file}`);
  await mkdir(path.dirname(to), {recursive: true});
  await copyFile(from, to);
  bytes += (await stat(from)).size;
}
console.log(JSON.stringify({directory: 'dist', files: files.size, bytes}));

// Development evidence stays local. Do not publish dead links in the public rule book.
const rulebook = 'docs/04-game-flow-and-math.html';
let html = await readFile(path.join(destination, rulebook), 'utf8');
html = html.replace(/<a\b([^>]*?)href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g, (anchor, before, href, after, label) => {
  if (/^(?:[a-z]+:|#|\/\/)/i.test(href)) return anchor;
  const target = path.posix.normalize(path.posix.join('docs', href.split(/[?#]/)[0]));
  return files.has(target) ? anchor : `<span title="本機歷史或開發檔案；公開 Demo 未收錄">${label}（本機檔案）</span>`;
});
await writeFile(path.join(destination, rulebook), html);
