"use strict";
/* ============================================================================
   InQ-Software — shared API client & session helpers.
   Loaded by every page (login.html, index.html, admin.html, dashboard.html)
   BEFORE that page's own script. Talks to the Google Apps Script backend.
   ============================================================================ */
var API_BASE_URL = "https://script.google.com/macros/s/AKfycbx0xVhEdwuPUUiTG5n7TRt9vsbMVJXJm5YqK84d1OmEqu-3_153IJG9ikFCez87dBRI/exec";
var ROLES = { ADMIN: "ADMIN", USER: "USER", VIEWER: "VIEWER" };
var SESSION_KEY = "ett_session";

function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (e) { return null; }
}
function setSession(s) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {} }
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }
function hasRole() {
  var s = getSession(); if (!s) return false;
  for (var i = 0; i < arguments.length; i++) if (arguments[i] === s.role) return true;
  return false;
}
/* Call at the top of a protected page. allowedRoles omitted = any logged-in user. */
function requireLogin(allowedRoles) {
  var s = getSession();
  if (!s || !s.token) { location.href = "login.html?next=" + encodeURIComponent(location.pathname.split("/").pop()); return null; }
  if (allowedRoles && allowedRoles.indexOf(s.role) === -1) {
    location.href = "index.html";
    return null;
  }
  return s;
}

function _sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* Global "the app is talking to the server" indicator. Every apiRaw() call
   goes through _beginCall()/_endCall() below. A round trip to the Apps
   Script backend normally takes a second or more (Google's own execution
   overhead, not something the frontend controls), and with no visual
   feedback a click can look like it did nothing — people click again,
   assume the app is stuck, etc. This shows a thin progress bar at the top
   of the page (and switches the cursor to a wait cursor) for any call that
   takes longer than ~250ms, on every page that loads api.js. */
var _pendingCalls = 0, _loadingShowTimer = null;
function _ensureLoadingEl() {
  var el = document.getElementById("__apiLoading");
  if (!el) {
    el = document.createElement("div");
    el.id = "__apiLoading";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<div class="__apiLoadingBar"></div>';
    document.body.appendChild(el);
  }
  return el;
}
function _beginCall() {
  _pendingCalls++;
  if (_pendingCalls === 1) {
    _loadingShowTimer = setTimeout(function () {
      _ensureLoadingEl().classList.add("show");
      document.documentElement.classList.add("__apiBusy");
    }, 250);
  }
}
function _endCall() {
  _pendingCalls = Math.max(0, _pendingCalls - 1);
  if (_pendingCalls === 0) {
    clearTimeout(_loadingShowTimer);
    var el = document.getElementById("__apiLoading");
    if (el) el.classList.remove("show");
    document.documentElement.classList.remove("__apiBusy");
  }
}

/* Low-level call. Sends POST as text/plain so the browser never issues a CORS
   preflight (Apps Script Web Apps cannot answer OPTIONS requests).
   Google Sheets occasionally throttles a request under load (returns an HTML
   error page instead of JSON, or the connection just fails) — retrying once
   after a short pause clears almost all of those without the caller ever
   seeing it, instead of the UI getting stuck showing "Connecting...". */
async function apiRaw(action, payload, _isRetry) {
  var body = Object.assign({ action: action }, payload || {});
  var s = getSession();
  if (s && s.token && !body.token) body.token = s.token;
  if (!_isRetry) _beginCall();
  try {
    var res;
    try {
      res = await fetch(API_BASE_URL, { method: "POST", body: JSON.stringify(body) });
    } catch (e) {
      if (!_isRetry) { await _sleep(1000); return await apiRaw(action, payload, true); }
      return { ok: false, code: "OFFLINE", error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (ออฟไลน์)" };
    }
    var data;
    try { data = await res.json(); } catch (e) {
      if (!_isRetry) { await _sleep(1000); return await apiRaw(action, payload, true); }
      return { ok: false, code: "ERROR", error: "รูปแบบข้อมูลตอบกลับผิดพลาด" };
    }
    if (!data.ok && data.code === "AUTH" && action !== "login") {
      clearSession();
      location.href = "login.html";
    }
    return data;
  } finally {
    if (!_isRetry) _endCall();
  }
}

var API = {
  login: function (username, password) { return apiRaw("login", { username: username, password: password }); },
  logout: function () { var s = getSession(); return apiRaw("logout", { token: s && s.token }); },
  getRecords: function (filters) { return apiRaw("getRecords", { filters: filters || {} }); },
  getRecordById: async function (id) { var r = await apiRaw("getRecords", { filters: { id: id, limit: 5 } }); if (r.ok) r.record = r.records[0] || null; return r; },
  saveRecord: function (record) { return apiRaw("saveRecord", { record: record }); },
  editRecord: function (id, changes) { return apiRaw("editRecord", { id: id, changes: changes }); },
  getAuditLog: function (recordId) { return apiRaw("getAuditLog", { recordId: recordId }); },
  getEditedRecordIds: function () { return apiRaw("getEditedRecordIds", {}); },
  pullLot: function (lot) { return apiRaw("pullLot", { lot: lot }); },
  saveStandard: function (article, substance, stage, params) { return apiRaw("saveStandard", { article: article, substance: substance, stage: stage, params: params }); },
  getStandards: function () { return apiRaw("getStandards", {}); },
  listUsers: function () { return apiRaw("listUsers", {}); },
  addUser: function (u) { return apiRaw("addUser", u); },
  updateUser: function (u) { return apiRaw("updateUser", u); },
  deleteUser: function (username) { return apiRaw("deleteUser", { username: username }); },
  changePassword: function (oldPassword, newPassword) { return apiRaw("changePassword", { oldPassword: oldPassword, newPassword: newPassword }); },
  getMasterData: function () { return apiRaw("getMasterData", {}); },
  saveMasterRow: function (type, rowNum, row) { return apiRaw("saveMasterRow", { type: type, rowNum: rowNum, row: row }); },
  deleteMasterRow: function (type, rowNum) { return apiRaw("deleteMasterRow", { type: type, rowNum: rowNum }); },
  listInspectors: function () { return apiRaw("listInspectors", {}); },
  addInspector: function (name) { return apiRaw("addInspector", { name: name }); },
  updateInspector: function (u) { return apiRaw("updateInspector", u); },
  deleteInspector: function (name) { return apiRaw("deleteInspector", { name: name }); }
};
