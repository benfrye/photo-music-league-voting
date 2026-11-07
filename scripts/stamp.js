// Stamps every code/style reference in docs/ with one version, e.g.
//   import { x } from './common.js?v=lq3k9a';   <script src="vote.js?v=lq3k9a">
//
// GitHub Pages lets browsers reuse files for 10 minutes. Without a stamp, a
// visitor right after a publish can get new HTML with old JavaScript (or the
// reverse). With it, each publish is a fresh, matching set of files.
//
// Run before committing a change to the site:  npm run stamp
import fs from 'node:fs';
import path from 'node:path';

const docs = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'docs');
const v = Date.now().toString(36);

const rules = [
  // ES module imports:  from './x.js'  /  from './x.js?v=old'
  [/(from\s+'\.\/[\w-]+\.js)(\?v=[\w]+)?'/g, `$1?v=${v}'`],
  // <script type="module" src="x.js">
  [/(<script[^>]+src="[\w-]+\.js)(\?v=[\w]+)?"/g, `$1?v=${v}"`],
  // <link rel="stylesheet" href="styles.css">
  [/(<link[^>]+href="[\w-]+\.css)(\?v=[\w]+)?"/g, `$1?v=${v}"`],
];

let changed = 0;
for (const f of fs.readdirSync(docs).filter((f) => /\.(html|js)$/.test(f))) {
  const file = path.join(docs, f);
  const before = fs.readFileSync(file, 'utf8');
  const after = rules.reduce((s, [re, rep]) => s.replace(re, rep), before);
  if (after !== before) { fs.writeFileSync(file, after); changed++; }
}
console.log(`Stamped ${changed} files with v=${v}`);
