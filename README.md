# ETT In-Process Quality — entry app

Shop-floor data entry for the five leather checkpoints (WBTO → RTO → CTO → FHO → GIP) plus a
trial/development form. Bilingual EN/TH, all entry forced to uppercase, every measured value judged
against a per-article standard as **PASS / NEAR / FAIL**.

The production app (root of this repo) is a small multi-user web app: login with an in-app account,
three roles (Admin / User / Viewer), every record stamped with who saved it, all data stored in a
Google Sheet behind a Google Apps Script API, plus an interactive filterable dashboard for
management. Still no build step, no framework, no npm — plain HTML/CSS/JS throughout.

---

## What's in the box

```
index.html                   entry app shell — requires login, then loads app.js
login.html                   sign in
admin.html                   Admin-only: add/edit/deactivate users, reset passwords
dashboard.html                interactive, filterable executive dashboard (Chart.js)
setup.html                    Admin-only: edit the four master-data tables (ART/WB/COL/RJ) and the
                              Inspector name list, live against the Sheet — see "Master data" below
api.js                       shared client: session storage + API() wrapper around the Apps Script backend
app.js                       entry-form behaviour (checkpoints, judging, save/export)
app.css                      all styling (design tokens at the top, light + dark)
master-data.json             the four ETT master files, parsed (~250 KB) — the one-time seed for the
                              Sheet's Master* tabs (see `importMasterData()`); no longer fetched by
                              the running app, which reads the Sheet instead
google-apps-script/Code.gs   the Apps Script source deployed as the backend (reference copy — Apps
                              Script itself is not git-connected; edit and redeploy at script.google.com)

ett-qc-entry.html            older, fully self-contained single file — open it and it runs with
                              no server and no login, records kept in the tab only. Kept as a
                              no-infrastructure fallback (e.g. no internet at the site); it does not
                              talk to the Google Sheet backend and has no roles/audit trail.
src/                          original development split that ett-qc-entry.html / early index.html
                              were built from; superseded by the root-level files above
tools/
  build_master_data.py       regenerate master-data.json from the .xlsx masters
docs/
  schema.sql                 relational schema (reference; the live schema is the Google Sheet's tabs)
  reject_reason_stage_map.csv  the 134 reject reasons × which stage offers each (review in Excel)
```

**To just look at it, no login, no server:** open `ett-qc-entry.html` directly.

**To run the real app:** serve the repo root over any static file server (or the Vercel deployment)
and open `index.html` — it needs the internet to reach the Apps Script API, which is where both the
records and the master data now live (master data is cached to `localStorage` so a brief drop in
connectivity doesn't block a device that already loaded it once).

---

## Accounts & roles

Login is a custom username/password system stored in the Google Sheet's `Users` tab (not Google
Sign-In) — see `login.html` / `api.js` / the `login` action in `Code.gs`. Passwords are hashed
(SHA-256 + per-user random salt) before they ever touch the sheet. A successful login gets a session
token good for 12 hours, stored in the `Sessions` tab and kept client-side in `localStorage`.

| Role | Can do |
|---|---|
| **ADMIN** | Everything: enter/view records, manage the article standards, and (via `admin.html`) add users, change roles, activate/deactivate accounts, reset passwords |
| **USER** | Enter and view records, including saving an article's standard override |
| **VIEWER** | View only — the entry form and dashboard both load, but all inputs are disabled (see `lockViewer()` in `app.js`) |

Every saved record carries `recordedBy` (username) and a timestamp, set server-side from the session
token, not from anything the client sends — see `saveRecord` in `Code.gs`. That's the audit trail.

Default admin login after first setup: `admin` / `Admin@2025!` — change this password from
`admin.html` (or via `changePassword`) as soon as the app is live.

**Inspectors are not Users.** The `Inspector` field on the entry form is a shop-floor name, not a
login account — plenty of inspectors never sign in to the app at all. Their names live in their own
`Inspectors` sheet tab, managed from `setup.html` (Admin only), completely separate from the `Users`
tab that `admin.html` manages. If no inspector names have been added yet, the field falls back to
free text so the floor is never blocked.

---

## Backend: Google Sheet + Apps Script

There's no separate server to host — the API is a Google Apps Script Web App reading and writing a
Google Sheet, deployed with **Execute as: Me / Access: Anyone**. `google-apps-script/Code.gs` in this
repo is a reference copy of what's deployed; because Apps Script isn't git-connected, changes have to
be made and redeployed at script.google.com by hand, then this copy updated to match.

The Sheet has ten tabs: `Users`, `Sessions`, `Records`, `Lots`, `Standards` from the original build,
plus `MasterART`, `MasterWB`, `MasterCOL`, `MasterRJ` (the four master-data tables, one row per
article/colour/reject-reason) and `Inspectors` (the standalone inspector name list — see above).
`api.js` on the client talks to it with one `fetch()` per call:

```js
await fetch(API_BASE_URL, { method: "POST", body: JSON.stringify({ action: "saveRecord", token, ...fields }) });
```

The POST deliberately omits a `Content-Type` header (so the browser sends `text/plain`) because Apps
Script Web Apps can't answer a CORS preflight `OPTIONS` request — setting `Content-Type: application/json`
would trigger one and every cross-origin call would fail.

Actions the backend supports: `login`, `logout`, `getRecords`, `saveRecord`, `pullLot`,
`saveStandard`, `getStandards`, `listUsers`, `addUser`, `updateUser`, `deleteUser`, `changePassword`,
`getMasterData`, `saveMasterRow`, `deleteMasterRow`, `listInspectors`, `addInspector`,
`updateInspector`, `deleteInspector`. Every action except `login` requires a valid session token and
is re-checked server-side against the caller's role in `_requireAuth()` — the client-side role gating
(hiding buttons, `lockViewer()`) is a convenience for the UI, not the security boundary. All of the
new master-data/inspector *write* actions (`save`/`delete`/`add`/`update`) are ADMIN-only; `listInspectors`
and `getMasterData` are readable by any logged-in role since the entry form needs them too.

If the API is unreachable, the entry form falls back to local mode (records kept in the tab,
`localStorage` draft mirroring per stage) so a flaky connection on the shop floor never loses a
half-filled form — see the `ONLINE` flag and `LOCAL` array in `app.js`.

### Deploying the master-data / inspector update

Because Apps Script isn't git-connected, rolling out `MasterART`/`MasterWB`/`MasterCOL`/`MasterRJ`/
`Inspectors` and their API actions is a one-time manual step:

1. Open the Apps Script project at script.google.com and paste in the updated `Code.gs` from this
   repo (replacing the old contents), then **Deploy → Manage deployments → edit the existing
   deployment → New version** so `/exec` picks up the new code (the URL itself doesn't change).
2. Run `setup()` once from the Apps Script editor's function dropdown — it creates the five new sheet
   tabs (existing tabs are untouched).
3. Run `importMasterData()` once — it fetches `master-data.json` straight from this GitHub repo over
   Google's network and seeds the four Master* tabs (~2,700 rows total). Check **View → Logs**
   afterwards for the row counts it reports. Safe to re-run, but re-running **overwrites** whatever is
   currently in those tabs, so only do this again for a full re-seed (see "Master data" above).
4. Upload the new/changed front-end files (`setup.html`, `api.js`, `app.js`, `index.html`,
   `dashboard.html`, `admin.html`) to the GitHub repo / Vercel deployment as usual.

After that, any Admin can open `setup.html` from the top bar to manage the four master tables and the
inspector list — no further Apps Script changes needed for routine edits.

---

## Dashboard

`dashboard.html` is open to any logged-in role. It fetches up to 5,000 records once
(`API.getRecords({limit:5000})`) and does all filtering/redrawing client-side — no extra server
round-trip per filter change. Filters: date range, stage, article, inspector, result. It shows KPI
tiles (total records, PASS/NEAR/FAIL rate, top defect) and five Chart.js charts: results over time,
results by stage, top-10 defects, inspector leaderboard, and article performance.

---

## Master data

**Day-to-day fixes** (a softness target is wrong, a colour code needs adding, a reject reason's
wording changed) go through `setup.html` now — an Admin-only page with a tab per table (ART / WB /
COL / RJ) plus a fifth tab for Inspectors. Each tab has search, paged tables with inline edit/delete,
and an add-row form; every change calls straight through to the `MasterART` / `MasterWB` /
`MasterCOL` / `MasterRJ` sheet tabs (`saveMasterRow` / `deleteMasterRow` in `Code.gs`) and is live for
every device immediately — no redeploy, no regenerating `master-data.json`, no touching this repo.

`master-data.json` itself is now only the **one-time seed**: it was the source for
`importMasterData()` in `Code.gs`, which pulled it straight from GitHub into the four Sheet tabs
during initial setup (see the Deploying section below). If the four source workbooks get a large,
structural overhaul (hundreds of new articles at once, say) it's still fastest to regenerate the JSON
and re-run `importMasterData()` — that function clears and re-writes each Master* tab from scratch,
so it will **discard any edits made through `setup.html`** since the JSON was last generated. Treat
it as a full re-seed, not an incremental sync. For everything smaller, edit in `setup.html` directly.

Re-run the tool whenever the workbooks change and a full re-seed is what's wanted:

```bash
pip install openpyxl
python3 tools/build_master_data.py  /path/to/folder/with/the/4/xlsx  -o src/master-data.json \
        --csv docs/reject_reason_stage_map.csv
```

| Key | Rows | From | Used for |
|---|---|---|---|
| `ART` | 805 | `SOFTNESS.xlsx` | softness target per article + thickness + brand, three zones (neck / belly / butt) |
| `WB` | 745 | `Wet blue standard.xlsx` | hide type, supplier, material code per article + thickness + tannery, with ALT / CALF / NEW alternatives |
| `COL` | 982 | `COLOUR CODE.xlsx` | valid colour codes per article, Active vs Cancelled |
| `RJ` | 134 | `REJECT REASON.xlsx` | reject reasons, EN + TH, group, phase, and the stages that offer each |

Join key throughout is `ARTICLE|THICKNESS`, thickness written `1.3-1.5` (the source uses comma
decimals — the tool normalises them).

### Two data-quality issues the tool does not silently fix

1. **Duplicate softness rows.** 131 of 509 article+thickness keys have more than one row. 33 differ
   by brand, which is legitimate — the same article can carry a different softness target per
   customer. The remaining ~98 are the same brand with different numbers, i.e. conflicting entries.
   The app picks the row whose brand matches the lot's customer, and if several still match it
   **averages them and says "avg of N rows"** in the standard strip. Cleaning the master removes the
   averaging; nothing in the code needs to change.
2. **Reject reasons have no per-stage column.** The workbook's Phase column has three values
   (`WET BLUE`, `CRUST/FINISHED`, `FINISHED`). The per-stage list is derived by rules in
   `stages_for()` in `build_master_data.py` — edit the rules there, never the JSON. Current result:
   WBTO 39 · RTO 54 · CTO 69 · FHO 129 · GIP 134. `docs/reject_reason_stage_map.csv` is that mapping
   as a spreadsheet for review.

---

## How it works

### Lot header drives everything
Typing an article (autocomplete over 628 names) narrows the thickness dropdown to that article's
real thicknesses, loads its colour codes, fills the customer, and loads the softness and wet-blue
standards. The strip under the header shows exactly which standard was loaded, so the operator can
see it is the right one before entering anything.

### Judgement
```
numeric:      PASS  min ≤ v ≤ max
              NEAR  within 5 % of the band width outside the band
              FAIL  beyond that
min-only      shrinkage temp ≥ 95 °C
max-only      break / loose grain ≤ 2
selects       ACCEPTED = pass · ACCEPTED WO = near · REJECTED = fail; PASS/FAIL direct
wet-blue spec exact match = pass · a listed ALT/CALF/NEW option = near · anything else = fail
record result = the worst parameter, combined with the stage decision
```
`judgeNum()` and `rowResult()` in `app.js` are the whole of it — about 30 lines.

### GIP formulas
```
TRIM SF     = KG ÷ (THICKNESS_MM × DENSITY × 0.092903)     density default 0.90 g/cm³, editable
COEFFICIENT = OUTPUT SF ÷ INPUT SF × 100                    PASS ≥ 83 %, NEAR 81–83 %
FTT         = (PCS_OK − REPAIRED) ÷ TOTAL_PCS × 100         PASS ≥ 95 %, NEAR ≥ 90 %
```
Grade 1–8 + Reject areas show share %, a distribution bar, and a balance check against output SF
(flagged when the gap exceeds 0.5 %). The density figure is an estimate until enough real
weight-vs-area data is collected to replace it with ETT's own number — that is the intended path.

### Adding or changing a checkpoint
Everything on screen is generated from the `STAGES` array near the top of `app.js`. A parameter is
one object:

```js
{k:"MOIST", en:"Moisture", th:"ความชื้น", t:"meas", u:"%", std:[12,16]}
```

| `t` | renders as |
|---|---|
| `meas` | std min/max + actual **from – to** (both ends judged) |
| `num` | std min/max + one actual value |
| `minonly` | `≥ min` (add `maxOnly:true` for `≤ max`) |
| `sel3` | ACCEPTED / ACCEPTED WO / REJECTED |
| `pf` | PASS / FAIL |
| `pick` | your `opts:[]`, with `good:[]` listing the passing ones |
| `auto` | standard read from the wet-blue master via `src:["h","ah",…]` |
| `txt` | free text vs a typed standard |

Extras: `fromSub:true` takes the standard from the lot's thickness range; `soft:0|1|2` takes it from
the softness master (neck / belly / butt).

---

## Wiring a different backend

The root app already talks to the Google Sheet backend described above via `api.js` / `Code.gs` —
this section is for anyone who wants to swap that out (e.g. wiring the standalone
`ett-qc-entry.html` to a real backend, or replacing Apps Script with something else). The touch
points are the same six functions, now living in `api.js` + the top of `app.js` instead of a
`PERSISTENCE` block:

| function | does | replace with |
|---|---|---|
| `apiRaw()` / `API.*` (`api.js`) | opens the connection, wraps every call | point `API_BASE_URL` elsewhere, or swap `apiRaw()` for your own client |
| `refreshRecent()` (`app.js`) | polling list of recent records | `GET /api/records?limit=40`, or push via SSE/websocket |
| `pullLot(lot)` (`app.js`) | look up a lot number | `GET /api/lots/:lotNo` |
| `saveRecord()` (`app.js`) | write one checkpoint record | `POST /api/records` |
| `saveStandard()` (`app.js`) | write per-article standards | `PUT /api/standards/:article/:stage` |
| `doExport()` (`app.js`) | dump records to CSV | `GET /api/records.csv`, or keep the current client-side Blob export over `getRecords` |

The record object `saveRecord()` builds is the contract — see `docs/schema.sql` for the same data
normalised into tables, including why `qc_value` stores `std_min` / `std_max` per row (standards
change; a record has to stay interpretable against the standard it was judged by). Note the live
schema is now the Google Sheet's tabs (`Users` / `Sessions` / `Records` / `Standards`), not this SQL
file — `schema.sql` is kept as a normalised reference, e.g. for eventually moving off Sheets to a
real database.

Entry keeps working without a backend: if the API is unreachable the app switches to local mode and
keeps records in the tab, and drafts are always mirrored to `localStorage` per stage so a reload or a
dropped connection never loses a half-filled form.

---

## Speed of entry

These exist because a checkpoint entry has to take under a minute on the floor:

- **ALL IN STANDARD** — fills every actual with the standard (midpoint for ranges, ACCEPTED/PASS for
  selects, decision ACCEPTED). Most lots are fine; the operator then corrects only the exceptions.
- **COPY LAST** — clones the previous record for that stage.
- **Enter** moves to the next field; number fields open the numeric keypad on mobile.
- Inspector is a dropdown sourced from the `Inspectors` sheet (managed in `setup.html`); the device
  remembers the last one picked. Falls back to a free-text field if no inspectors are set up yet.
- Filled fields tint green, so what is still empty is obvious at a glance.
- Reject picker searches by code number, 2-letter code, English or Thai, filtered to the stage.

---

## Browser support & conventions

Modern evergreen browsers (ES2020: optional chaining, spread, `Object.fromEntries`). No IE.
Fonts come from Google Fonts — self-host `IBM Plex Sans` / `Sans Thai` / `Mono` if the plant
network blocks it, and the fallback stack keeps the layout intact either way.

Light and dark themes are driven by CSS custom properties in the `:root` blocks at the top of
`app.css` — change the palette there and it propagates. `--accent` is wet-blue; PASS / NEAR / FAIL
are separate semantic colours and are deliberately not the accent.
