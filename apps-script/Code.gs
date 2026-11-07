/**
 * Photo League: the Google Sheet is the database and the control panel.
 *
 * Tabs (created by the "🏇 Photo League > Set up the sheet" menu):
 *   Settings : League name, Rounds, Voting (Not yet / Open / Closed)
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
