/* ============================================================================
   InQ-Software backend — Google Apps Script Web App
   Stores all data in a Google Sheet. Deployed as a Web App (Execute as: Me,
   Access: Anyone). The client (app.js) talks to it with POST requests whose
   body is a JSON string sent as text/plain, so the browser never sends a
   CORS preflight (Apps Script Web Apps cannot answer OPTIONS requests).

   Sheets (created automatically by running setup() once from this editor):
     Users     [Username, PasswordHash, Salt, Role, FullName, Active, CreatedAt]
     Sessions  [Token, Username, Role, FullName, CreatedAt, ExpiresAt]
     Records   [RecordId, Ts, Stage, LotNo, Article, Substance, Colour, ColourDesc,
                Customer, Tannery, Inspector, RecordedBy, Result, Decision,
                MainDefect, MainDefectName, RejectsJSON, ValuesJSON, ComputedJSON, Note]
     Lots      [LotNo, Article, Colour, Customer, Substance, Tannery, QtySF, Pieces, UpdatedAt]
     Standards [Key, Article, Substance, Stage, ParamsJSON, UpdatedAt, UpdatedBy]
   ========================================================================= */

var SPREADSHEET_ID = "1uKTvEV_MAux40X9tT0qbF_nO7NCBkhLcIU-EfBbC1zc";
var SESSION_HOURS = 12;
var ROLES = { ADMIN: "ADMIN", USER: "USER", VIEWER: "VIEWER" };

var SHEETS = {
  USERS: "Users",
  SESSIONS: "Sessions",
  RECORDS: "Records",
  LOTS: "Lots",
  STANDARDS: "Standards",
  MASTER_ART: "MasterART",
  MASTER_WB: "MasterWB",
  MASTER_COL: "MasterCOL",
  MASTER_RJ: "MasterRJ",
  INSPECTORS: "Inspectors"
};

var HEADERS = {
  Users: ["Username", "PasswordHash", "Salt", "Role", "FullName", "Active", "CreatedAt"],
  Sessions: ["Token", "Username", "Role", "FullName", "CreatedAt", "ExpiresAt"],
  Records: ["RecordId", "Ts", "Stage", "LotNo", "Article", "Substance", "Colour", "ColourDesc",
    "Customer", "Tannery", "Inspector", "RecordedBy", "Result", "Decision",
    "MainDefect", "MainDefectName", "RejectsJSON", "ValuesJSON", "ComputedJSON", "Note"],
  Lots: ["LotNo", "Article", "Colour", "Customer", "Substance", "Tannery", "QtySF", "Pieces", "UpdatedAt"],
  Standards: ["Key", "Article", "Substance", "Stage", "ParamsJSON", "UpdatedAt", "UpdatedBy"],
  /* Master data — editable via setup.html so nobody needs to touch build_master_data.py or
     redeploy just to fix a softness target, a wet-blue spec, a colour code or a reject reason. */
  MasterART: ["Article", "Thickness", "Brand", "Neck", "Belly", "Butt"],
  MasterWB: ["Article", "Thickness", "Note", "Tannery", "Brand", "Grade",
    "Hide", "Supplier", "MaterialCode", "AltHide", "AltSupplier", "AltMaterialCode",
    "CalfHide", "CalfSupplier", "CalfMaterialCode", "NewHide", "NewSupplier", "NewMaterialCode"],
  MasterCOL: ["Article", "ColourCode", "Description", "Active"],
  MasterRJ: ["Code", "ShortCode", "NameEN", "NameTH", "GroupIdx", "Phase", "Stages"],
  Inspectors: ["Name", "Active", "CreatedAt"]
};

/* Fixed lookup enums used by RJ (GroupIdx) — same order as the old master-data.json GRP/FIN
   arrays. Rarely change, so kept as code rather than another sheet. Index 0 is always blank. */
var GRP = ["", "MANUFACTURING", "NATURAL DEFECTS & MATERIAL", "TRANSFER", "COLOR", "OTHER"];
var FIN = ["", "NUBUCK LIGHT", "SEMI ANILINE", "NUBUCK DARK", "PIGMENTED", "BUFFED-OIL", "EMBOSS", "CORRECTED GRAIN"];

/* ---------------------------- one-time setup ---------------------------- */
function setup() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Object.keys(HEADERS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    var headers = HEADERS[name];
    var row = sh.getRange(1, 1, 1, headers.length).getValues()[0];
    var needsHeader = headers.some(function (h, i) { return row[i] !== h; });
    if (needsHeader) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
    }
  });
  var def = ss.getSheetByName("Sheet1") || ss.getSheetByName("ชีต1");
  if (def && ss.getSheets().length > Object.keys(HEADERS).length) {
    try { ss.deleteSheet(def); } catch (e) {}
  }
  seedAdmin();
  Logger.log("Setup complete.");
}

function seedAdmin() {
  var sh = _sheet(SHEETS.USERS);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === "admin") { Logger.log("admin already exists"); return; }
  }
  var tempPassword = "ChangeMe" + Math.floor(1000 + Math.random() * 9000) + "!";
  var salt = Utilities.getUuid();
  sh.appendRow(["admin", _hash(tempPassword, salt), salt, ROLES.ADMIN, "System Admin", true, new Date()]);
  Logger.log("Created admin / " + tempPassword + "  <-- write this down, then change it after first login.");
}

/* ------------------------------- helpers -------------------------------- */
function _ss() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function _sheet(name) {
  var sh = _ss().getSheetByName(name);
  if (!sh) throw new Error("Sheet not found: " + name + " — run setup() first.");
  return sh;
}
function _rowsToObjects(sh) {
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i].every(function (v) { return v === "" || v === null; })) continue;
    var o = {};
    headers.forEach(function (h, j) { o[h] = data[i][j]; });
    o.__row = i + 1;
    out.push(o);
  }
  return out;
}
function _hash(password, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + "|" + salt);
  return bytes.map(function (b) { return ("0" + (b & 0xFF).toString(16)).slice(-2); }).join("");
}
function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function _err(msg, code) {
  return _json({ ok: false, error: msg, code: code || "ERROR" });
}
function _newToken() { return Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, ""); }

function _requireAuth(token, allowedRoles) {
  if (!token) { var e = new Error("Not logged in"); e.code = "AUTH"; throw e; }
  var sh = _sheet(SHEETS.SESSIONS);
  var rows = _rowsToObjects(sh);
  var now = new Date();
  var session = null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].Token === token) { session = rows[i]; break; }
  }
  if (!session || new Date(session.ExpiresAt) < now) {
    var e2 = new Error("Session expired"); e2.code = "AUTH"; throw e2;
  }
  if (allowedRoles && allowedRoles.indexOf(session.Role) === -1) {
    var e3 = new Error("Not permitted for role " + session.Role); e3.code = "FORBIDDEN"; throw e3;
  }
  return session;
}

/* -------------------------------- router --------------------------------- */
function doGet(e) {
  return _json({ ok: true, service: "InQ-Software API", time: new Date().toISOString() });
}

function doPost(e) {
  var payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return _err("Bad request body", "BAD_REQUEST");
  }
  var action = payload.action;
  try {
    switch (action) {
      case "login": return _login(payload);
      case "logout": return _logout(payload);
      case "getRecords": return _getRecords(payload);
      case "saveRecord": return _saveRecord(payload);
      case "pullLot": return _pullLot(payload);
      case "saveStandard": return _saveStandard(payload);
      case "getStandards": return _getStandards(payload);
      case "listUsers": return _listUsers(payload);
      case "addUser": return _addUser(payload);
      case "updateUser": return _updateUser(payload);
      case "deleteUser": return _deleteUser(payload);
      case "changePassword": return _changePassword(payload);
      case "getMasterData": return _getMasterData(payload);
      case "saveMasterRow": return _saveMasterRow(payload);
      case "deleteMasterRow": return _deleteMasterRow(payload);
      case "listInspectors": return _listInspectors(payload);
      case "addInspector": return _addInspector(payload);
      case "updateInspector": return _updateInspector(payload);
      case "deleteInspector": return _deleteInspector(payload);
      default: return _err("Unknown action: " + action, "BAD_REQUEST");
    }
  } catch (err) {
    return _err(err.message || String(err), err.code || "ERROR");
  }
}

/* -------------------------------- actions --------------------------------- */
function _login(p) {
  var username = String(p.username || "").trim().toLowerCase();
  var password = String(p.password || "");
  if (!username || !password) return _err("ใส่ชื่อผู้ใช้และรหัสผ่าน", "BAD_REQUEST");
  var sh = _sheet(SHEETS.USERS);
  var rows = _rowsToObjects(sh);
  var u = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].Username).toLowerCase() === username) { u = rows[i]; break; }
  }
  if (!u || u.Active === false) return _err("ไม่พบผู้ใช้ หรือถูกระงับการใช้งาน", "AUTH");
  if (_hash(password, u.Salt) !== u.PasswordHash) return _err("รหัสผ่านไม่ถูกต้อง", "AUTH");

  var token = _newToken();
  var now = new Date();
  var expires = new Date(now.getTime() + SESSION_HOURS * 3600 * 1000);
  _sheet(SHEETS.SESSIONS).appendRow([token, u.Username, u.Role, u.FullName, now, expires]);
  return _json({ ok: true, token: token, username: u.Username, role: u.Role, fullName: u.FullName });
}

function _logout(p) {
  var sh = _sheet(SHEETS.SESSIONS);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === p.token) { sh.deleteRow(i + 1); break; }
  }
  return _json({ ok: true });
}

function _getRecords(p) {
  _requireAuth(p.token, null);
  var rows = _rowsToObjects(_sheet(SHEETS.RECORDS));
  var f = p.filters || {};
  rows = rows.filter(function (r) {
    if (f.stage && r.Stage !== f.stage) return false;
    if (f.article && r.Article !== f.article) return false;
    if (f.inspector && r.RecordedBy !== f.inspector && r.Inspector !== f.inspector) return false;
    if (f.decision && r.Decision !== f.decision) return false;
    if (f.result && r.Result !== f.result) return false;
    if (f.dateFrom && new Date(r.Ts) < new Date(f.dateFrom)) return false;
    if (f.dateTo && new Date(r.Ts) > new Date(f.dateTo)) return false;
    return true;
  });
  rows.sort(function (a, b) { return new Date(b.Ts) - new Date(a.Ts); });
  var limit = f.limit || 2000;
  rows = rows.slice(0, limit).map(function (r) {
    return {
      id: r.RecordId, ts: r.Ts, stage: r.Stage, lotNo: r.LotNo, article: r.Article,
      substance: r.Substance, colour: r.Colour, colourDesc: r.ColourDesc, customer: r.Customer,
      tannery: r.Tannery, inspector: r.Inspector, recordedBy: r.RecordedBy, result: r.Result,
      decision: r.Decision, mainDefect: r.MainDefect, mainDefectName: r.MainDefectName,
      rejectDetail: _safeParse(r.RejectsJSON, []), values: _safeParse(r.ValuesJSON, {}),
      computed: _safeParse(r.ComputedJSON, {}), note: r.Note
    };
  });
  return _json({ ok: true, records: rows });
}

function _safeParse(s, fallback) { try { return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; } }

function _saveRecord(p) {
  var session = _requireAuth(p.token, [ROLES.ADMIN, ROLES.USER]);
  var r = p.record || {};
  var sh = _sheet(SHEETS.RECORDS);
  var ts = r.ts || new Date().toISOString();
  sh.appendRow([
    r.id || (r.stage + "_" + Date.now()), ts, r.stage || "", r.lotNo || "", r.article || "",
    r.substance || "", r.colour || "", r.colourDesc || "", r.customer || "", r.tannery || "",
    r.inspector || "", session.Username, r.result || "", r.decision || "",
    r.mainDefect || "", r.mainDefectName || "", JSON.stringify(r.rejectDetail || []),
    JSON.stringify(r.values || {}), JSON.stringify(r.computed || {}), r.note || ""
  ]);
  if (r.lotNo) _upsertLot(r);
  return _json({ ok: true, recordedBy: session.Username });
}

function _upsertLot(r) {
  var sh = _sheet(SHEETS.LOTS);
  var data = sh.getDataRange().getValues();
  var lotRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(r.lotNo)) { lotRow = i + 1; break; }
  }
  var vals = [r.lotNo, r.article || "", r.colour || "", r.customer || "", r.substance || "",
    r.tannery || "", (r.values || {}).QTY_SF || "", (r.values || {}).PIECES || "", new Date().toISOString()];
  if (lotRow === -1) sh.appendRow(vals);
  else sh.getRange(lotRow, 1, 1, vals.length).setValues([vals]);
}

function _pullLot(p) {
  _requireAuth(p.token, null);
  var rows = _rowsToObjects(_sheet(SHEETS.LOTS));
  var lot = rows.find(function (r) { return String(r.LotNo) === String(p.lot); });
  if (!lot) return _json({ ok: true, found: false });
  return _json({
    ok: true, found: true, lot: {
      ARTICLE: lot.Article, COLOUR: lot.Colour, CUSTOMER: lot.Customer,
      SUBSTANCE: lot.Substance, TANNERY: lot.Tannery, QTY_SF: lot.QtySF, PIECES: lot.Pieces
    }
  });
}

function _saveStandard(p) {
  var session = _requireAuth(p.token, [ROLES.ADMIN]);
  var key = (p.article || "") + "__" + (p.substance || "ANY") + "__" + (p.stage || "");
  var sh = _sheet(SHEETS.STANDARDS);
  var data = sh.getDataRange().getValues();
  var row = -1;
  for (var i = 1; i < data.length; i++) { if (data[i][0] === key) { row = i + 1; break; } }
  var vals = [key, p.article || "", p.substance || "", p.stage || "", JSON.stringify(p.params || {}),
    new Date().toISOString(), session.Username];
  if (row === -1) sh.appendRow(vals); else sh.getRange(row, 1, 1, vals.length).setValues([vals]);
  return _json({ ok: true });
}

function _getStandards(p) {
  _requireAuth(p.token, null);
  var rows = _rowsToObjects(_sheet(SHEETS.STANDARDS));
  var out = rows.map(function (r) {
    return { article: r.Article, substance: r.Substance, stage: r.Stage, params: _safeParse(r.ParamsJSON, {}) };
  });
  return _json({ ok: true, standards: out });
}

function _listUsers(p) {
  _requireAuth(p.token, [ROLES.ADMIN]);
  var rows = _rowsToObjects(_sheet(SHEETS.USERS));
  var out = rows.map(function (r) {
    return { username: r.Username, role: r.Role, fullName: r.FullName, active: r.Active !== false, createdAt: r.CreatedAt };
  });
  return _json({ ok: true, users: out });
}

function _addUser(p) {
  _requireAuth(p.token, [ROLES.ADMIN]);
  var username = String(p.username || "").trim().toLowerCase();
  if (!username || !p.password) return _err("ต้องระบุ username และ password", "BAD_REQUEST");
  if ([ROLES.ADMIN, ROLES.USER, ROLES.VIEWER].indexOf(p.role) === -1) return _err("role ไม่ถูกต้อง", "BAD_REQUEST");
  var sh = _sheet(SHEETS.USERS);
  var rows = _rowsToObjects(sh);
  if (rows.some(function (r) { return String(r.Username).toLowerCase() === username; })) {
    return _err("มีชื่อผู้ใช้นี้อยู่แล้ว", "CONFLICT");
  }
  var salt = Utilities.getUuid();
  sh.appendRow([username, _hash(p.password, salt), salt, p.role, p.fullName || "", true, new Date()]);
  return _json({ ok: true });
}

function _updateUser(p) {
  _requireAuth(p.token, [ROLES.ADMIN]);
  var username = String(p.username || "").trim().toLowerCase();
  var sh = _sheet(SHEETS.USERS);
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var col = {}; headers.forEach(function (h, i) { col[h] = i; });
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][col.Username]).toLowerCase() === username) {
      if (p.role) sh.getRange(i + 1, col.Role + 1).setValue(p.role);
      if (p.fullName != null) sh.getRange(i + 1, col.FullName + 1).setValue(p.fullName);
      if (p.active != null) sh.getRange(i + 1, col.Active + 1).setValue(!!p.active);
      if (p.password) {
        var salt = Utilities.getUuid();
        sh.getRange(i + 1, col.Salt + 1).setValue(salt);
        sh.getRange(i + 1, col.PasswordHash + 1).setValue(_hash(p.password, salt));
      }
      return _json({ ok: true });
    }
  }
  return _err("ไม่พบผู้ใช้", "NOT_FOUND");
}

function _deleteUser(p) {
  _requireAuth(p.token, [ROLES.ADMIN]);
  var username = String(p.username || "").trim().toLowerCase();
  if (username === "admin") return _err("ไม่สามารถลบบัญชี admin หลักได้", "FORBIDDEN");
  var sh = _sheet(SHEETS.USERS);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === username) { sh.getRange(i + 1, 6).setValue(false); return _json({ ok: true }); }
  }
  return _err("ไม่พบผู้ใช้", "NOT_FOUND");
}

function _changePassword(p) {
  var session = _requireAuth(p.token, null);
  var sh = _sheet(SHEETS.USERS);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === session.Username) {
      if (_hash(p.oldPassword, data[i][2]) !== data[i][1]) return _err("รหัสผ่านเดิมไม่ถูกต้อง", "AUTH");
      var salt = Utilities.getUuid();
      sh.getRange(i + 1, 3).setValue(salt);
      sh.getRange(i + 1, 2).setValue(_hash(p.newPassword, salt));
      return _json({ ok: true });
    }
  }
  return _err("ไม่พบผู้ใช้", "NOT_FOUND");
}

/* ---------------------------- master data (ART/WB/COL/RJ) ---------------------------- */
/* Field-name maps: the sheet's HEADERS columns, in order, as the client sends/receives them
   in `row` for saveMasterRow. Keeping this centralized means one switch, not four near-duplicate
   functions. */
var MASTER_TYPES = {
  ART: { sheet: SHEETS.MASTER_ART, headers: HEADERS.MasterART },
  WB: { sheet: SHEETS.MASTER_WB, headers: HEADERS.MasterWB },
  COL: { sheet: SHEETS.MASTER_COL, headers: HEADERS.MasterCOL },
  RJ: { sheet: SHEETS.MASTER_RJ, headers: HEADERS.MasterRJ }
};

function _getMasterData(p) {
  _requireAuth(p.token, null);

  var artRows = _rowsToObjects(_sheet(SHEETS.MASTER_ART));
  var art = artRows.map(function (r) {
    return { __row: r.__row, a: r.Article, t: r.Thickness, b: r.Brand, s: [Number(r.Neck) || 0, Number(r.Belly) || 0, Number(r.Butt) || 0] };
  });

  var wbRows = _rowsToObjects(_sheet(SHEETS.MASTER_WB));
  var wb = wbRows.map(function (r) {
    return {
      __row: r.__row, a: r.Article, t: r.Thickness, n: r.Note || "", ty: r.Tannery || "", bd: r.Brand || "",
      g: r.Grade || "", h: r.Hide || "", sp: r.Supplier || "", mc: r.MaterialCode || "",
      ah: r.AltHide || "", asp: r.AltSupplier || "", amc: r.AltMaterialCode || "",
      ch: r.CalfHide || "", csp: r.CalfSupplier || "", cmc: r.CalfMaterialCode || "",
      nh: r.NewHide || "", nsp: r.NewSupplier || "", nmc: r.NewMaterialCode || ""
    };
  });

  var colRows = _rowsToObjects(_sheet(SHEETS.MASTER_COL));
  var col = {}; // grouped shape app.js expects: { ARTICLE: [[code,desc,activeFlag], ...] }
  var colFlat = colRows.map(function (r) {
    var active = r.Active === true || r.Active === "TRUE" || r.Active === 1 ? 1 : 0;
    (col[r.Article] = col[r.Article] || []).push([String(r.ColourCode), r.Description || "", active]);
    return { __row: r.__row, article: r.Article, colourCode: r.ColourCode, description: r.Description || "", active: active };
  });

  var rjRows = _rowsToObjects(_sheet(SHEETS.MASTER_RJ));
  var rj = []; // bare-array shape app.js expects: [code, shortCode, en, th, groupIdx, phase, [stages]]
  var rjFlat = rjRows.map(function (r) {
    var stages = String(r.Stages || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    rj.push([String(r.Code), r.ShortCode || "", r.NameEN || "", r.NameTH || "", Number(r.GroupIdx) || 0, r.Phase || "", stages]);
    return { __row: r.__row, code: r.Code, shortCode: r.ShortCode || "", nameEN: r.NameEN || "", nameTH: r.NameTH || "", groupIdx: Number(r.GroupIdx) || 0, phase: r.Phase || "", stages: stages };
  });

  return _json({ ok: true, art: art, wb: wb, col: col, colRows: colFlat, rj: rj, rjRows: rjFlat, grp: GRP, fin: FIN });
}

function _saveMasterRow(p) {
  _requireAuth(p.token, [ROLES.ADMIN]);
  var def = MASTER_TYPES[p.type];
  if (!def) return _err("ชนิดข้อมูลไม่ถูกต้อง", "BAD_REQUEST");
  var row = p.row || {};
  var sh = _sheet(def.sheet);
  var vals = def.headers.map(function (h) {
    var v = row[h];
    return v == null ? "" : v;
  });
  var rowNum = Number(p.rowNum) || 0;
  if (rowNum > 1) {
    sh.getRange(rowNum, 1, 1, vals.length).setValues([vals]);
  } else {
    sh.appendRow(vals);
  }
  return _json({ ok: true });
}

function _deleteMasterRow(p) {
  _requireAuth(p.token, [ROLES.ADMIN]);
  var def = MASTER_TYPES[p.type];
  if (!def) return _err("ชนิดข้อมูลไม่ถูกต้อง", "BAD_REQUEST");
  var rowNum = Number(p.rowNum) || 0;
  if (rowNum < 2) return _err("แถวไม่ถูกต้อง", "BAD_REQUEST");
  _sheet(def.sheet).deleteRow(rowNum);
  return _json({ ok: true });
}

/* ---------------------------- inspectors ---------------------------- */
function _listInspectors(p) {
  _requireAuth(p.token, null);
  var rows = _rowsToObjects(_sheet(SHEETS.INSPECTORS));
  var out = rows.map(function (r) { return { name: r.Name, active: r.Active !== false }; });
  out.sort(function (a, b) { return a.name.localeCompare(b.name); });
  return _json({ ok: true, inspectors: out });
}

function _addInspector(p) {
  _requireAuth(p.token, [ROLES.ADMIN]);
  var name = String(p.name || "").trim().toUpperCase();
  if (!name) return _err("ใส่ชื่อผู้ตรวจ", "BAD_REQUEST");
  var sh = _sheet(SHEETS.INSPECTORS);
  var rows = _rowsToObjects(sh);
  if (rows.some(function (r) { return String(r.Name).toUpperCase() === name; })) {
    return _err("มีชื่อนี้อยู่แล้ว", "CONFLICT");
  }
  sh.appendRow([name, true, new Date()]);
  return _json({ ok: true });
}

function _updateInspector(p) {
  _requireAuth(p.token, [ROLES.ADMIN]);
  var name = String(p.name || "").trim().toUpperCase();
  var sh = _sheet(SHEETS.INSPECTORS);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toUpperCase() === name) {
      if (p.active != null) sh.getRange(i + 1, 2).setValue(!!p.active);
      if (p.newName) sh.getRange(i + 1, 1).setValue(String(p.newName).trim().toUpperCase());
      return _json({ ok: true });
    }
  }
  return _err("ไม่พบชื่อผู้ตรวจ", "NOT_FOUND");
}

function _deleteInspector(p) {
  _requireAuth(p.token, [ROLES.ADMIN]);
  var name = String(p.name || "").trim().toUpperCase();
  var sh = _sheet(SHEETS.INSPECTORS);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toUpperCase() === name) { sh.getRange(i + 1, 2).setValue(false); return _json({ ok: true }); }
  }
  return _err("ไม่พบชื่อผู้ตรวจ", "NOT_FOUND");
}

/* ------------------ one-time migration: pull master-data.json into the sheets ------------------
   Run this manually from the Apps Script editor ONCE after deploying the sheets/columns above.
   It fetches the already-published master-data.json straight from GitHub (Apps Script's own
   network, not restricted the way a sandboxed dev environment's might be) so nobody has to
   hand-copy ~2,700 rows. Safe to re-run: it clears each sheet's data rows first. */
function importMasterData() {
  var url = "https://raw.githubusercontent.com/Newarmstrong1202/InQ-Software/main/master-data.json";
  var m = JSON.parse(UrlFetchApp.fetch(url).getContentText());

  function clearAndWrite(sheetName, values) {
    var sh = _sheet(sheetName);
    var last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, sh.getLastColumn()).clearContent();
    if (values.length) sh.getRange(2, 1, values.length, values[0].length).setValues(values);
  }

  clearAndWrite(SHEETS.MASTER_ART, m.ART.map(function (x) {
    return [x.a, x.t, x.b || "", (x.s && x.s[0]) || 0, (x.s && x.s[1]) || 0, (x.s && x.s[2]) || 0];
  }));

  clearAndWrite(SHEETS.MASTER_WB, m.WB.map(function (x) {
    return [x.a, x.t, x.n || "", x.ty || "", x.bd || "", x.g || "", x.h || "", x.sp || "", x.mc || "",
      x.ah || "", x.asp || "", x.amc || "", x.ch || "", x.csp || "", x.cmc || "", x.nh || "", x.nsp || "", x.nmc || ""];
  }));

  var colValues = [];
  Object.keys(m.COL).forEach(function (article) {
    m.COL[article].forEach(function (entry) { colValues.push([article, entry[0], entry[1] || "", !!entry[2]]); });
  });
  clearAndWrite(SHEETS.MASTER_COL, colValues);

  clearAndWrite(SHEETS.MASTER_RJ, m.RJ.map(function (r) {
    return [r[0], r[1] || "", r[2] || "", r[3] || "", r[4] || 0, r[5] || "", (r[6] || []).join(",")];
  }));

  Logger.log("Master data import complete: ART " + m.ART.length + ", WB " + m.WB.length +
    ", COL " + colValues.length + ", RJ " + m.RJ.length);
}

function resetAdminPassword() {
  var sh = _sheet(SHEETS.USERS);
  var data = sh.getDataRange().getValues();
  var newPass = "Admin@2025!";
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === "admin") {
      var salt = Utilities.getUuid();
      sh.getRange(i + 1, 3).setValue(salt);
      sh.getRange(i + 1, 2).setValue(_hash(newPass, salt));
      Logger.log("Admin password reset to: " + newPass);
      return;
    }
  }
  Logger.log("admin not found");
}

/* ------------------------- maintenance (manual) --------------------------- */
function purgeExpiredSessions() {
  var sh = _sheet(SHEETS.SESSIONS);
  var data = sh.getDataRange().getValues();
  var now = new Date();
  for (var i = data.length - 1; i >= 1; i--) {
    if (new Date(data[i][5]) < now) sh.deleteRow(i + 1);
  }
}
