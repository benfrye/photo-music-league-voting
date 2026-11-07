// Local preview: serves docs/ and runs apps-script/Code.gs against a fake,
// in-memory Google Sheet, so you can try everything before deploying.
//
//   npm run dev            -> http://localhost:8080
//   Fake sheet editor:        http://localhost:8080/dev-sheet  (JSON)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const docs = path.join(root, 'docs');
const PORT = Number(process.env.PORT || 8080);

// ---------- a tiny fake of the SpreadsheetApp API, enough for Code.gs ----------
class FakeRange {
  constructor(sheet, r, c, nr = 1, nc = 1) { Object.assign(this, { sheet, r, c, nr, nc }); }
  getValues() {
    return Array.from({ length: this.nr }, (_, i) => Array.from({ length: this.nc }, (_, j) => this.sheet.cell(this.r + i, this.c + j)));
  }
  setValues(v) { v.forEach((row, i) => row.forEach((x, j) => this.sheet.set(this.r + i, this.c + j, x))); return this; }
  setValue(x) { this.sheet.set(this.r, this.c, x); return this; }
}
class FakeSheet {
  constructor(name) { this.name = name; this.data = []; }
  cell(r, c) { return this.data[r - 1]?.[c - 1] ?? ''; }
  set(r, c, x) { while (this.data.length < r) this.data.push([]); const row = this.data[r - 1]; while (row.length < c) row.push(''); row[c - 1] = x instanceof Date ? x.toISOString() : x; }
  getLastRow() { return this.data.length; }
  getLastColumn() { return Math.max(0, ...this.data.map((r) => r.length)); }
  getRange(r, c, nr, nc) { return new FakeRange(this, r, c, nr, nc); }
  getDataRange() { return new FakeRange(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
  appendRow(row) { this.data.push(row.map((x) => (x instanceof Date ? x.toISOString() : x))); }
  deleteRows(start, n) { this.data.splice(start - 1, n); }
  setFrozenRows() {}
}
const sheets = new Map();
const ss = {
  getSheetByName: (n) => sheets.get(n) || null,
  insertSheet: (n) => { const s = new FakeSheet(n); sheets.set(n, s); return s; },
  toast: () => {},
};
// UrlFetchApp is synchronous in Apps Script, so use curl to match.
const UrlFetchApp = {
  fetch(url, opt = {}) {
    const args = ['-s', '-w', '\n%{http_code}', '-X', (opt.method || 'get').toUpperCase()];
    if (opt.contentType) args.push('-H', `Content-Type: ${opt.contentType}`);
    if (opt.payload != null) args.push('--data-binary', String(opt.payload));
    const out = execFileSync('curl', [...args, url], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    const cut = out.lastIndexOf('\n');
    const body = out.slice(0, cut), code = Number(out.slice(cut + 1));
    return { getResponseCode: () => code, getContentText: () => body };
  },
};
// CacheService with expiry, like the real one.
const store = new Map();
const scriptCache = {
  get(k) { const e = store.get(k); if (!e || e.exp < Date.now()) { store.delete(k); return null; } return e.v; },
  put(k, v, ttl = 600) { store.set(k, { v, exp: Date.now() + ttl * 1000 }); },
  getAll(keys) { const o = {}; for (const k of keys) { const v = scriptCache.get(k); if (v != null) o[k] = v; } return o; },
  putAll(obj, ttl) { for (const [k, v] of Object.entries(obj)) scriptCache.put(k, v, ttl); },
};

const ctx = vm.createContext({
  UrlFetchApp,
  CacheService: { getScriptCache: () => scriptCache },
  ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {} }) }) }) },
  SpreadsheetApp: { getActive: () => ss, getUi: () => ({ createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: { getUuid: () => crypto.randomUUID() },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ text: s, setMimeType() { return this; } }) },
});
vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', 'Code.gs'), 'utf8'), ctx);
ctx.setupSheet();

// Seed demo data so the pages have something to show.
const settings = sheets.get('Settings');
settings.set(2, 2, 'Photo Music League (local test)');
settings.set(3, 2, 3);
settings.set(4, 2, 'Open');
// The iCloud album the ballot photos come from (override with ALBUM_LINK=...).
const ALBUM_LINK = process.env.ALBUM_LINK ?? 'https://www.icloud.com/sharedalbum/#D26v3Zx8SZ7Ar7GvcFTVhziaa-gCAEQARogdzo6VXDw0rKF_Ae1d77BuoNta5rjz9d0xO88wChbyRM';
ctx.setSetting_('Album link', ALBUM_LINK);
const voters = sheets.get('Voters');
[['Ben', '(555) 010-0001'], ['Jess', '555-010-0002'], ['Sam', '+1 555 010 0003'], ['Alex', '5550100004']]
  .forEach((v) => voters.appendRow([...v, '']));

// ---------- http ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const t0 = Date.now();
      const out = req.method === 'POST'
        ? ctx.doPost({ postData: { contents: body } })
        : ctx.doGet({ parameter: Object.fromEntries(url.searchParams) });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(out.text);
      console.log(`  api ${req.method} ${url.searchParams.get('action') || 'post'} ${Date.now() - t0}ms`);
    });
    return;
  }
  if (url.pathname === '/dev-sheet') {
    if (url.searchParams.get('run')) ctx[url.searchParams.get('run')]();
    if (url.searchParams.get('set')) { const [r, c, v] = url.searchParams.get('set').split(','); settings.set(+r, +c, v); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(Object.fromEntries([...sheets].map(([k, s]) => [k, s.data])), null, 2));
    return;
  }
  let file = path.join(docs, decodeURIComponent(url.pathname));
  if (!file.startsWith(docs)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  if (ALBUM_LINK) {
    const warm = () => {
      const t0 = Date.now();
      try { ctx.refreshAlbum(); console.log(`  📸  Album cache warmed in ${((Date.now() - t0) / 1000).toFixed(1)}s`); }
      catch (err) { console.log(`  ⚠️  Album refresh failed: ${err.message}`); }
    };
    setTimeout(warm, 50);
    setInterval(warm, 5 * 60 * 1000);
  }
  console.log(`\n  🏇  Local preview: http://localhost:${PORT}`);
  console.log('  Fake sheet has 4 voters: phones 5550100001 to 5550100004');
  console.log(`  Inspect the fake sheet: http://localhost:${PORT}/dev-sheet\n`);
});
