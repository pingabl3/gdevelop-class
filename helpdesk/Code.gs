/**
 * GDevelop help inbox — a Google Apps Script web app.
 *
 * Students send their project (.zip) from the class page when they need help.
 * Each one is saved as a private file in YOUR Google Drive, in a folder called
 * "GDevelop help requests". Only someone with the teacher key (shown when you run
 * setup) can list or download them.
 *
 * Setup (once):
 *   1. Paste this whole file into a new project at https://script.google.com
 *   2. Choose the function "setup" at the top and click Run. Allow access.
 *      The execution log shows your TEACHER KEY. Keep it.
 *   3. Deploy → New deployment → type "Web app".
 *      Execute as: Me.  Who has access: Anyone.  Click Deploy and copy the Web app URL.
 *   4. On the class page, open Teacher → Help requests, paste the URL and the key.
 */

var FOLDER_NAME = 'GDevelop help requests';
var MAX_BYTES = 30 * 1024 * 1024; // 30 MB per project

function setup() {
  var props = PropertiesService.getScriptProperties();
  var folder = getFolder_();
  getDoneFolder_(folder);
  var key = props.getProperty('TEACHER_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('TEACHER_KEY', key);
  }
  Logger.log('Help requests are saved in Drive folder: ' + folder.getUrl());
  Logger.log('TEACHER KEY: ' + key);
}

/** Run this only if your key has leaked: it makes a new one. */
function newTeacherKey() {
  PropertiesService.getScriptProperties().deleteProperty('TEACHER_KEY');
  setup();
}

function doGet() {
  return json_({ ok: true, service: 'gdevelop-help-inbox' });
}

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (req.action) {
      case 'submit': return json_(submit_(req));
      case 'list': checkKey_(req.key); return json_(list_());
      case 'get': checkKey_(req.key); return json_(get_(req.id));
      case 'done': checkKey_(req.key); return json_(markDone_(req.id));
      case 'check': checkKey_(req.key); return json_({ ok: true });
      default: return json_({ ok: false, error: 'Unknown action.' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// ---------------------------------------------------------------------------

function submit_(req) {
  var name = clean_(req.name, 60);
  var message = String(req.message || '').trim().slice(0, 1000);
  var projectName = clean_(req.projectName, 100);
  if (!name) throw new Error('Please type your name.');
  if (!req.data) throw new Error('No project file was sent.');
  var bytes = Utilities.base64Decode(req.data);
  if (bytes.length > MAX_BYTES) throw new Error('This project is too big to send (over 30 MB).');
  // Zip files start with "PK".
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('That file is not a .zip.');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm');
    var fileName = stamp + ' - ' + name + ' - ' + (projectName || 'project') + '.zip';
    var file = getFolder_().createFile(Utilities.newBlob(bytes, 'application/zip', fileName));
    file.setDescription(JSON.stringify({
      name: name, message: message, projectName: projectName, sent: new Date().toISOString()
    }));
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function list_() {
  var files = getFolder_().getFiles();
  var items = [];
  while (files.hasNext()) {
    var f = files.next();
    var meta = {};
    try { meta = JSON.parse(f.getDescription() || '{}'); } catch (e) {}
    items.push({
      id: f.getId(),
      name: meta.name || '',
      message: meta.message || '',
      projectName: meta.projectName || '',
      sent: meta.sent || f.getDateCreated().toISOString(),
      size: f.getSize()
    });
  }
  items.sort(function (a, b) { return a.sent < b.sent ? 1 : -1; });
  return { ok: true, items: items };
}

function get_(id) {
  var f = fileInInbox_(id);
  return { ok: true, data: Utilities.base64Encode(f.getBlob().getBytes()), fileName: f.getName() };
}

function markDone_(id) {
  var f = fileInInbox_(id);
  f.moveTo(getDoneFolder_(getFolder_()));
  return { ok: true };
}

// ---------------------------------------------------------------------------

function fileInInbox_(id) {
  var f = DriveApp.getFileById(String(id || ''));
  var parents = f.getParents();
  var inbox = getFolder_().getId();
  while (parents.hasNext()) if (parents.next().getId() === inbox) return f;
  throw new Error('That request is no longer in the inbox.');
}

function getFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) {}
  }
  var folder = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}

function getDoneFolder_(folder) {
  var it = folder.getFoldersByName('Done');
  return it.hasNext() ? it.next() : folder.createFolder('Done');
}

function checkKey_(key) {
  var real = PropertiesService.getScriptProperties().getProperty('TEACHER_KEY');
  if (!real || String(key || '') !== real) throw new Error('Wrong teacher key.');
}

function clean_(s, max) {
  return String(s || '').replace(/[\u0000-\u001f\/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
