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

/* Low-level call. Sends POST as text/plain so the browser never issues a CORS
   preflight (Apps Script Web Apps cannot answer OPTIONS requests). */
async function apiRaw(action, payload) {
  var body = Object.assign({ action: action }, payload || {});
  var s = getSession();
  if (s && s.token && !body.token) body.token = s.token;
  var res;
  try {
    res = await fetch(API_BASE_URL, { method: "POST", body: JSON.stringify(body) });
  } catch (e) {
    return { ok: false, code: "OFFLINE", error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (ออฟไลน์)" };
  }
  var data;
  try { data = await res.json(); } catch (e) { return { ok: false, code: "ERROR", error: "รูปแบบข้อมูลตอบกลับผิดพลาด" }; }
  if (!data.ok && data.code === "AUTH" && action !== "login") {
    clearSession();
    location.href = "login.html";
  }
  return data;
}

var API = {
  login: function (username, password) { return apiRaw("login", { username: username, password: password }); },
  logout: function () { var s = getSession(); return apiRaw("logout", { token: s && s.token }); },
  getRecords: function (filters) { return apiRaw("getRecords", { filters: filters || {} }); },
  saveRecord: function (record) { return apiRaw("saveRecord", { record: record }); },
  pullLot: function (lot) { return apiRaw("pullLot", { lot: lot }); },
  saveStandard: function (article, substance, stage, params) { return apiRaw("saveStandard", { article: article, substance: substance, stage: stage, params: params }); },
  getStandards: function () { return apiRaw("getStandards", {}); },
  listUsers: function () { return apiRaw("listUsers", {}); },
  addUser: function (u) { return apiRaw("addUser", u); },
  updateUser: function (u) { return apiRaw("updateUser", u); },
  deleteUser: function (username) { return apiRaw("deleteUser", { username: username }); },
  changePassword: function (oldPassword, newPassword) { return apiRaw("changePassword", { oldPassword: oldPassword, newPassword: newPassword }); }
};
