/**
 * Bloom weekly backup to Google Drive (docs/backup.md).
 *
 * Runs as you, once a week. It asks Bloom for every table of the database and files them in
 * a dated folder inside "Bloom backups" in your Drive. Nothing here is a web app and nothing
 * is published: it is a stand-alone script only you can open.
 *
 * Two values live in Project Settings > Script Properties (never in this file):
 *   BLOOM_URL             https://bloom-iota-six.vercel.app
 *   BLOOM_BACKUP_SECRET   the same value as BLOOM_BACKUP_SECRET in Vercel
 *
 * Run `setup` once. After that it looks after itself, and emails you only if a backup fails.
 */

const FOLDER_NAME = 'Bloom backups';
const KEEP = 8;              // how many weekly backups to keep (older ones go to the trash)
const DAY = ScriptApp.WeekDay.SUNDAY;
const HOUR = 2;              // 2–3 am, in the script's time zone

/** Run this once: checks the settings, schedules the weekly run, and takes a first backup. */
function setup() {
  settings_();
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'backupBloom'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('backupBloom').timeBased().onWeekDay(DAY).atHour(HOUR).create();
  backupBloom();
}

/** The weekly run. */
function backupBloom() {
  try {
    const report = run_();
    console.log(report);
  } catch (err) {
    const message = 'The Bloom backup did not finish.\n\n' + (err && err.stack ? err.stack : err) +
      '\n\nThe last good backup is still in the "' + FOLDER_NAME + '" folder in your Drive.';
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Bloom backup FAILED', message);
    throw err;
  }
}

function run_() {
  const s = settings_();
  const manifestText = fetch_(s, '').getContentText();
  const manifest = JSON.parse(manifestText);
  if (manifest.app !== 'bloom' || !manifest.tables) throw new Error('Bloom did not send a manifest.');

  const root = rootFolder_();
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm');
  // Built under a working name, renamed when complete: a half-finished folder never looks done.
  const folder = root.createFolder('INCOMPLETE Bloom backup ' + stamp);
  folder.createFile('manifest.json', manifestText, 'application/json');

  let rows = 0;
  const notes = [];
  manifest.tables.forEach(function (t) {
    const blob = fetch_(s, '?table=' + encodeURIComponent(t.name)).getBlob();
    blob.setName(t.name + '.ndjson.gz');
    blob.setContentType('application/gzip');
    folder.createFile(blob);
    rows += t.rows;
    // Count the lines of all but the largest files, to catch a file that arrived cut short.
    if (blob.getBytes().length < 15 * 1024 * 1024) {
      const text = Utilities.ungzip(blob).getDataAsString();
      const lines = text ? text.split('\n').filter(String).length : 0;
      if (lines !== t.rows) notes.push(t.name + ': ' + lines + ' rows saved, ' + t.rows + ' listed');
    }
  });

  const report = 'Bloom backup ' + stamp + '\n' + manifest.tables.length + ' tables, about ' +
    rows + ' rows.\n' + (notes.length
      ? 'Row counts that differ from the list taken at the start (rows added or removed while it ran):\n' +
        notes.join('\n')
      : 'Every table matches the list taken at the start.');
  folder.createFile('report.txt', report, 'text/plain');
  folder.setName('Bloom backup ' + stamp);
  prune_(root);
  return report;
}

/** Keep the newest KEEP finished backups; the rest go to the Drive trash (recoverable for 30 days). */
function prune_(root) {
  const done = [];
  const it = root.getFolders();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getName().indexOf('Bloom backup ') === 0) done.push(f);
  }
  done.sort(function (a, b) { return b.getName().localeCompare(a.getName()); });
  done.slice(KEEP).forEach(function (f) { f.setTrashed(true); });
}

function rootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* deleted: make a new one */ }
  }
  const folder = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}

function settings_() {
  const props = PropertiesService.getScriptProperties();
  const url = (props.getProperty('BLOOM_URL') || '').replace(/\/+$/, '');
  const secret = props.getProperty('BLOOM_BACKUP_SECRET') || '';
  if (!/^https:\/\//.test(url)) throw new Error('Set BLOOM_URL in Script Properties (it starts with https://).');
  if (secret.length < 32) throw new Error('Set BLOOM_BACKUP_SECRET in Script Properties (copy it from Vercel).');
  return { url: url, secret: secret };
}

function fetch_(s, query) {
  const res = UrlFetchApp.fetch(s.url + '/api/backup' + query, {
    headers: { 'X-Bloom-Backup-Secret': s.secret },
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code === 401) throw new Error('Bloom refused the secret. Check BLOOM_BACKUP_SECRET matches Vercel.');
  if (code === 503) throw new Error('Backups are not switched on in Bloom (BLOOM_BACKUP_SECRET is missing in Vercel, or this version is not deployed yet).');
  if (code !== 200) throw new Error('Bloom answered ' + code + ' for ' + (query || 'the manifest') + '.');
  return res;
}
