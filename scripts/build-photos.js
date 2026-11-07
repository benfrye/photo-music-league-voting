// Turns everything in ./images into web-friendly photos for the site:
//   docs/photos/<id>.jpg     (max 1600px)
//   docs/photos/<id>_t.jpg   (max 480px thumbnail)
//   docs/photos.json         (the ballot list)
//
// Usage: npm run photos            (reads ./images)
//        npm run photos -- ~/Downloads/league-pics
//
// To keep a photo off the ballot, set "hidden": true for it in docs/photos.json.
// Re-running keeps those flags.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const srcDir = path.resolve(process.argv[2] || path.join(root, 'images'));
const outDir = path.join(root, 'docs', 'photos');
const listFile = path.join(root, 'docs', 'photos.json');
const EXT = /\.(jpe?g|png|heic|heif|webp|gif|tiff?)$/i;

const hasSips = (() => { try { execFileSync('sips', ['--help'], { stdio: 'ignore' }); return true; } catch { return false; } })();

function slug(name) {
  return path.parse(name).name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'photo';
}

function convert(src, dest, maxPx) {
  if (fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= fs.statSync(src).mtimeMs) return;
  if (hasSips) {
    // Only ever shrink: sips -Z would happily blow a 200px meme up to 1600px.
    const dims = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', src], { encoding: 'utf8' });
    const longest = Math.max(...[...dims.matchAll(/pixel(?:Width|Height): (\d+)/g)].map((m) => Number(m[1])));
    const resize = longest > maxPx ? ['-Z', String(maxPx)] : [];
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', ...resize, src, '--out', dest], { stdio: 'ignore' });
  } else if (/\.(jpe?g)$/i.test(src)) {
    fs.copyFileSync(src, dest); // no resizer available; use as-is
  } else {
    throw new Error(`Can't convert ${path.basename(src)} without macOS "sips". Convert it to JPEG first.`);
  }
}

// Filenames like IMG_1234, UUIDs, or download hashes aren't worth showing as captions.
function caption(file) {
  const n = path.parse(file).name;
  if (/^(img|dsc|dscn|pxl|photo|image|screenshot)?[\s_-]*[\d_\s-]+$/i.test(n)) return '';
  if (/[0-9a-f]{8}-?[0-9a-f]{4}/i.test(n)) return ''; // UUID-ish
  if (n.split(/[\s_-]+/).some((w) => w.length >= 12 && /\d/.test(w))) return ''; // random token
  return n.replace(/[_-]+/g, ' ').trim();
}

if (!fs.existsSync(srcDir)) { console.error(`No folder at ${srcDir}`); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

const previous = fs.existsSync(listFile) ? JSON.parse(fs.readFileSync(listFile, 'utf8')) : [];
const prevById = new Map(previous.map((p) => [p.id, p]));

const files = fs.readdirSync(srcDir).filter((f) => EXT.test(f) && !f.startsWith('.')).sort();
const used = new Set();
const photos = [];
for (const file of files) {
  let id = slug(file);
  for (let i = 2; used.has(id); i++) id = `${slug(file)}-${i}`;
  used.add(id);
  const src = path.join(srcDir, file);
  try {
    convert(src, path.join(outDir, `${id}.jpg`), 1600);
    convert(src, path.join(outDir, `${id}_t.jpg`), 480);
  } catch (err) {
    console.warn(`  ⚠️  skipped ${file}: ${err.message}`);
    continue;
  }
  const prev = prevById.get(id);
  photos.push({
    id,
    src: `photos/${id}.jpg`,
    thumb: `photos/${id}_t.jpg`,
    caption: prev?.caption ?? caption(file),
    contributor: prev?.contributor ?? '',
    hidden: prev?.hidden ?? false,
  });
  process.stdout.write('.');
}

// Clean up photos whose originals were removed.
const keep = new Set(photos.flatMap((p) => [`${p.id}.jpg`, `${p.id}_t.jpg`]));
for (const f of fs.readdirSync(outDir)) if (!keep.has(f)) fs.unlinkSync(path.join(outDir, f));

fs.writeFileSync(listFile, `${JSON.stringify(photos, null, 2)}\n`);
const shown = photos.filter((p) => !p.hidden).length;
console.log(`\n🏇 ${photos.length} photos ready (${shown} on the ballot) → docs/photos.json`);
