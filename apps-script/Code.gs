/**
 * Photo League: the Google Sheet is the database and the control panel.
 *
 * Tabs (created by the "🏇 Photo League > Set up the sheet" menu):
 *   Settings : League name, Rounds, Voting (Not yet / Open / Closed), Album link
 *   Voters   : Name, Phone, Voted   <- you fill in Name + Phone
 *   Ballots  : written by the site, one row per voter
 *
 * Deploy as a Web app: Execute as "Me", Who has access "Anyone".
 */

var SETTINGS = [
  ['League name', 'Photo Music League', 'Shown at the top of every page'],
  ['Rounds', 5, 'How many Music League rounds need a photo'],
  ['Voting', 'Not yet', 'Not yet / Open / Closed. Closes on its own once everyone on Voters has voted.'],
  ['Tiebreak seed', '', 'Filled in automatically. Leave it alone.'],
  ['Album link', '', 'Public iCloud shared album link (Public Website must be on). This is where the ballot photos come from.'],
];
var HEADERS = {
  Voters: ['Name', 'Phone', 'Voted'],
  Ballots: ['Phone', 'Name', 'Ranking', 'Submitted'],
};

// ---------------------------------------------------------------- menu

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🏇 Photo League')
    .addItem('Set up the sheet', 'setupSheet')
    .addItem('Close voting now', 'closeVoting')
    .addItem('Start over (clear all ballots)', 'startOver')
    .addSeparator()
    .addItem('Refresh album photos now', 'refreshAlbumNow')
    .addItem('Keep album photos fresh (run once)', 'installAlbumRefresh')
    .addToUi();
}

function setupSheet() {
  var ss = SpreadsheetApp.getActive();
  var s = ss.getSheetByName('Settings') || ss.insertSheet('Settings');
  if (s.getLastRow() === 0) {
    s.getRange(1, 1, 1, 3).setValues([['Setting', 'Value', 'Notes']]);
    s.getRange(2, 1, SETTINGS.length, 3).setValues(SETTINGS);
    s.setFrozenRows(1);
  }
  var have = rows_('Settings').map(function (r) { return String(r.Setting).trim(); });
  SETTINGS.forEach(function (row) { if (have.indexOf(row[0]) < 0) s.appendRow(row); });
  if (!getSetting_('Tiebreak seed')) setSetting_('Tiebreak seed', Utilities.getUuid().slice(0, 8));
  Object.keys(HEADERS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]);
      sh.setFrozenRows(1);
    }
  });
  if (typeof SpreadsheetApp.getActive().toast === 'function') ss.toast('Sheet is ready. Fill in Settings and Voters.');
}

function closeVoting() { setSetting_('Voting', 'Closed'); }

function startOver() {
  var b = sheet_('Ballots');
  if (b.getLastRow() > 1) b.deleteRows(2, b.getLastRow() - 1);
  var v = sheet_('Voters');
  var col = colIndex_(v, 'Voted');
  for (var r = 2; r <= v.getLastRow(); r++) v.getRange(r, col).setValue('');
  setSetting_('Voting', 'Not yet');
  setSetting_('Tiebreak seed', Utilities.getUuid().slice(0, 8));
}

// ---------------------------------------------------------------- web app

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'results';
    if (action === 'results') return json_(results_());
    if (action === 'album') return json_(album_());
    if (action === 'photoUrls') return json_(photoUrls_(String(e.parameter.ids || ''), e.parameter.fresh === '1'));
    return json_({ error: 'Unknown action.' });
  } catch (err) {
    return json_({ error: String(err.message || err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'me') return json_(me_(body.phone));
    if (body.action === 'vote') return json_(vote_(body.phone, body.ranking));
    return json_({ error: 'Unknown action.' });
  } catch (err) {
    return json_({ error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function league_() {
  return {
    title: String(getSetting_('League name') || 'Photo Music League'),
    rounds: Math.max(1, parseInt(getSetting_('Rounds'), 10) || 1),
    status: status_(),
    seed: String(getSetting_('Tiebreak seed') || 'seed'),
  };
}

function me_(phone) {
  var v = findVoter_(phone);
  var voters = voters_();
  var ballot = ballotFor_(v.phone);
  return {
    league: league_(),
    voter: { name: v.name, voted: !!v.voted },
    ranking: ballot ? ballot.ranking : [],
    progress: { voted: voters.filter(function (x) { return x.voted; }).length, total: voters.length },
  };
}

function vote_(phone, ranking) {
  var v = findVoter_(phone);
  var status = status_();
  if (status !== 'open') throw new Error(status === 'closed' ? 'Voting already closed!' : "Voting isn't open yet.");
  if (!Array.isArray(ranking) || !ranking.length) throw new Error('Rank at least one photo.');
  var clean = [];
  ranking.forEach(function (id) { id = String(id).slice(0, 80); if (clean.indexOf(id) < 0) clean.push(id); });
  clean = clean.slice(0, 500);

  var now = new Date();
  var b = sheet_('Ballots');
  var row = [v.phone, v.name, clean.join(','), now];
  var existing = ballotFor_(v.phone);
  if (existing) b.getRange(existing.row, 1, 1, 4).setValues([row]);
  else b.appendRow(row);
  sheet_('Voters').getRange(v.row, colIndex_(sheet_('Voters'), 'Voted')).setValue(now);

  var all = voters_();
  var closed = all.length > 0 && all.every(function (x) { return x.voted; });
  if (closed) setSetting_('Voting', 'Closed');
  return { ok: true, closed: closed };
}

function results_() {
  var league = league_();
  var voters = voters_();
  var out = {
    league: league,
    voters: voters.map(function (v) { return { name: v.name, voted: !!v.voted }; }),
  };
  if (league.status !== 'closed') return out;
  // Ballots are only revealed once voting closes, and without names.
  var current = {};
  voters.forEach(function (v) { if (v.voted) current[v.phone] = true; });
  out.ballots = ballots_()
    .filter(function (b) { return current[b.phone]; })
    .map(function (b) { return b.ranking; });
  return out;
}

// ---------------------------------------------------------------- sheet helpers

function sheet_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('The sheet is missing the "' + name + '" tab. Run 🏇 Photo League > Set up the sheet.');
  return sh;
}

function rows_(name) {
  var sh = sheet_(name);
  var values = sh.getDataRange().getValues();
  var head = values.shift() || [];
  return values.map(function (r, i) {
    var o = { row: i + 2 };
    head.forEach(function (h, j) { o[String(h).trim()] = r[j]; });
    return o;
  });
}

function colIndex_(sh, header) {
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var i = head.map(function (h) { return String(h).trim(); }).indexOf(header);
  if (i < 0) throw new Error('Column "' + header + '" is missing.');
  return i + 1;
}

function getSetting_(key) {
  var r = rows_('Settings').filter(function (x) { return String(x.Setting).trim() === key; })[0];
  return r ? r.Value : '';
}

function setSetting_(key, value) {
  var r = rows_('Settings').filter(function (x) { return String(x.Setting).trim() === key; })[0];
  var sh = sheet_('Settings');
  if (r) sh.getRange(r.row, 2).setValue(value);
  else sh.appendRow([key, value, '']);
}

function status_() {
  var s = String(getSetting_('Voting')).trim().toLowerCase();
  if (s.indexOf('open') === 0) return 'open';
  if (s.indexOf('close') === 0) return 'closed';
  return 'setup';
}

// Keep the last 10 digits so "+1 (555) 123-4567" and "5551234567" match.
function normPhone_(p) {
  var d = String(p == null ? '' : p).replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
}

function voters_() {
  return rows_('Voters')
    .map(function (r) { return { row: r.row, name: String(r.Name || '').trim(), phone: normPhone_(r.Phone), voted: r.Voted }; })
    .filter(function (v) { return v.phone.length >= 7; })
    .map(function (v) { v.name = v.name || 'Mystery rider'; return v; });
}

function findVoter_(phone) {
  var p = normPhone_(phone);
  if (p.length < 7) throw new Error('Type your whole phone number.');
  var v = voters_().filter(function (x) { return x.phone === p; })[0];
  if (!v) throw new Error("That number isn't on the guest list. Ask whoever runs the league to add you.");
  return v;
}

function ballots_() {
  return rows_('Ballots').map(function (r) {
    return {
      row: r.row,
      phone: normPhone_(r.Phone),
      ranking: String(r.Ranking || '').split(',').map(function (s) { return s.trim(); }).filter(String),
    };
  });
}

function ballotFor_(phone) {
  return ballots_().filter(function (b) { return b.phone === phone; })[0] || null;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- live iCloud album
//
// Apple's album listing takes ~9 seconds, so we cache it, and a timer
// (installAlbumRefresh) keeps the cache warm. Image links expire after
// ~20 minutes, so they're cached for 10 and refreshed every 5.

var LIST_TTL = 6 * 60 * 60;       // seconds; max CacheService allows
var LIST_STALE_MS = 30 * 60 * 1000; // timer re-reads the album list this often
var URL_TTL = 10 * 60;            // seconds
var B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function albumToken_() {
  var link = String(getSetting_('Album link') || '').trim();
  if (!link) return '';
  var after = link.indexOf('#') >= 0 ? link.split('#')[1] : link;
  var m = after.match(/^[A-Za-z0-9_-]+/);
  return m ? m[0] : '';
}

function albumHost_(token) {
  var chars = token.charAt(0) === 'A' ? token.substr(1, 1) : token.substr(1, 2);
  var n = 0;
  for (var i = 0; i < chars.length; i++) n = n * 62 + B62.indexOf(chars.charAt(i));
  return 'p' + (n < 10 ? '0' : '') + n + '-sharedstreams.icloud.com';
}

function icloudPost_(host, token, endpoint, body) {
  var res = UrlFetchApp.fetch('https://' + host + '/' + token + '/sharedstreams/' + endpoint, {
    method: 'post', contentType: 'text/plain', payload: JSON.stringify(body),
    muteHttpExceptions: true, followRedirects: false,
  });
  var json = null;
  try { json = JSON.parse(res.getContentText()); } catch (e) { /* not json */ }
  return { code: res.getResponseCode(), json: json };
}

function pickDerivatives_(p) {
  var ders = Object.keys(p.derivatives || {}).map(function (k) {
    var d = p.derivatives[k];
    return { checksum: d.checksum, size: Math.max(Number(d.width) || 0, Number(d.height) || 0) };
  }).filter(function (d) { return d.checksum; }).sort(function (a, b) { return a.size - b.size; });
  if (!ders.length) return null;
  var thumb = ders.filter(function (d) { return d.size >= 300; })[0] || ders[ders.length - 1];
  var fit = ders.filter(function (d) { return d.size <= 2100; });
  var full = fit.length ? fit[fit.length - 1] : ders[ders.length - 1];
  return { t: thumb.checksum, f: full.checksum };
}

// Videos: the still frame is the "photo"; the clip plays on top of it.
function pickVideo_(p) {
  var ders = p.derivatives || {};
  var poster = ders.PosterFrame;
  var clip = ders['720p'] || ders['360p'];
  if (!clip) Object.keys(ders).forEach(function (k) { if (k !== 'PosterFrame' && !clip) clip = ders[k]; });
  if (!poster || !poster.checksum) return null;
  return { t: poster.checksum, f: poster.checksum, v: clip && clip.checksum ? clip.checksum : null };
}

function fetchAlbumList_(token) {
  var host = albumHost_(token);
  var r = icloudPost_(host, token, 'webstream', { streamCtag: null });
  if (r.code === 330 && r.json && r.json['X-Apple-MMe-Host']) {
    host = r.json['X-Apple-MMe-Host'];
    r = icloudPost_(host, token, 'webstream', { streamCtag: null });
  }
  if (r.code !== 200 || !r.json) throw new Error("Couldn't read the iCloud album (" + r.code + '). Is Public Website still turned on?');
  var photos = [];
  (r.json.photos || []).forEach(function (p) {
    if (p.mediaAssetType === 'video') {
      var vd = pickVideo_(p);
      if (vd) photos.push({
        id: p.photoGuid, w: Number(p.width) || 0, h: Number(p.height) || 0,
        caption: p.caption || '', contributor: p.contributorFullName || '', t: vd.t, f: vd.f, v: vd.v, kind: 'video',
      });
      return;
    }
    // GIFs come through with no image versions at all (Apple doesn't serve
    // them on public links). Keep them in the list so the site can supply the
    // picture from its own gifs/ folder.
    var d = pickDerivatives_(p) || { t: null, f: null };
    photos.push({
      id: p.photoGuid, w: Number(p.width) || 0, h: Number(p.height) || 0,
      caption: p.caption || '', contributor: p.contributorFullName || '', t: d.t, f: d.f,
    });
  });
  return { at: Date.now(), token: token, host: host, name: r.json.streamName || '', photos: photos };
}

// The album list, from cache when possible. maxAgeMs forces a re-read when older.
function getAlbum_(maxAgeMs) {
  var token = albumToken_();
  if (!token) return null;
  var cache = CacheService.getScriptCache();
  var key = 'album:' + token;
  var hit = cache.get(key);
  if (hit) {
    var a = JSON.parse(hit);
    if (!maxAgeMs || Date.now() - a.at < maxAgeMs) return a;
  }
  var fresh = fetchAlbumList_(token);
  cache.put(key, JSON.stringify(fresh), LIST_TTL);
  return fresh;
}

// GET ?action=album  ->  the photo list, plus any image links already in the
// cache (the 5-minute timer keeps them there), so one request usually does it.
function album_() {
  var a = getAlbum_();
  if (!a) throw new Error("No photo album is set up yet. Add the iCloud link to \"Album link\" in the sheet's Settings tab.");
  var cached = CacheService.getScriptCache().getAll(a.photos.map(function (p) { return 'u:' + p.id; }));
  var urls = {};
  a.photos.forEach(function (p) { var c = cached['u:' + p.id]; if (c) urls[p.id] = JSON.parse(c); });
  return {
    source: 'icloud', name: a.name, count: a.photos.length,
    photos: a.photos.map(function (p) { return { id: p.id, w: p.w, h: p.h, caption: p.caption, contributor: p.contributor, img: !!p.t, kind: p.kind || 'photo' }; }),
    urls: urls,
  };
}

// Fetch fresh links for these photos from Apple and cache them.
function fetchUrls_(a, list) {
  var cache = CacheService.getScriptCache();
  var out = {};
  for (var i = 0; i < list.length; i += 25) {
    var batch = list.slice(i, i + 25);
    var r = icloudPost_(a.host, a.token, 'webasseturls', { photoGuids: batch.map(function (p) { return p.id; }) });
    if (r.code !== 200 || !r.json) throw new Error('iCloud image links failed (' + r.code + ').');
    var items = r.json.items || {};
    var put = {};
    batch.forEach(function (p) {
      var t = items[p.t], f = items[p.f], v = p.v ? items[p.v] : null;
      if (!t && !f) return;
      var u = {
        thumb: t ? 'https://' + t.url_location + t.url_path : null,
        src: f ? 'https://' + f.url_location + f.url_path : null,
      };
      if (v) u.video = 'https://' + v.url_location + v.url_path;
      u.thumb = u.thumb || u.src;
      u.src = u.src || u.thumb;
      out[p.id] = u;
      put['u:' + p.id] = JSON.stringify(u);
    });
    cache.putAll(put, URL_TTL);
  }
  return out;
}

// GET ?action=photoUrls&ids=a,b,c  ->  { urls: { id: { thumb, src } } }
function photoUrls_(idList, fresh) {
  var a = getAlbum_();
  if (!a) return { urls: {} };
  var ids = idList.split(',').map(function (x) { return x.trim(); }).filter(String).slice(0, 60);
  var byId = {};
  a.photos.forEach(function (p) { byId[p.id] = p; });
  var urls = {};
  var missing = [];
  var cached = fresh ? {} : CacheService.getScriptCache().getAll(ids.map(function (id) { return 'u:' + id; }));
  ids.forEach(function (id) {
    var c = cached['u:' + id];
    if (c) urls[id] = JSON.parse(c);
    else if (byId[id] && byId[id].t) missing.push(byId[id]); // GIFs have nothing to fetch
  });
  if (missing.length) {
    var got = fetchUrls_(a, missing);
    Object.keys(got).forEach(function (id) { urls[id] = got[id]; });
  }
  return { urls: urls };
}

// Timer job: keep the list and every image link warm so visitors never wait on Apple.
function refreshAlbum() {
  var a = getAlbum_(LIST_STALE_MS);
  if (a) fetchUrls_(a, a.photos.filter(function (p) { return p.t; }));
}

// Menu: re-read the album from Apple right away (e.g. after adding photos).
function refreshAlbumNow() {
  var a = getAlbum_(1);
  if (a) fetchUrls_(a, a.photos.filter(function (p) { return p.t; }));
  var ss = SpreadsheetApp.getActive();
  if (a && typeof ss.toast === 'function') ss.toast('Album refreshed: ' + a.photos.length + ' photos.');
}

function installAlbumRefresh() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'refreshAlbum') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('refreshAlbum').timeBased().everyMinutes(5).create();
  refreshAlbum();
  var ss = SpreadsheetApp.getActive();
  if (typeof ss.toast === 'function') ss.toast('Album photos will stay fresh (refreshes every 5 minutes).');
}
