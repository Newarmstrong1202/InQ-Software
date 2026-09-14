# ETT In-Process Quality — entry app

Shop-floor data entry for the five leather checkpoints (WBTO → RTO → CTO → FHO → GIP) plus a
trial/development form. Bilingual EN/TH, all entry forced to uppercase, every measured value judged
against a per-article standard as **PASS / NEAR / FAIL**.

Everything is plain HTML, CSS and JavaScript — no build step, no framework, no npm.

---

## What's in the box

```
ett-qc-entry.html            one self-contained file — open it and it runs (no server needed)
src/
  index.html                 same app, split for development
  app.css                    all styling (design tokens at the top, light + dark)
  app.js                     all behaviour
  master-data.json           the four ETT master files, parsed  (~250 KB)
tools/
  build_master_data.py       regenerate master-data.json from the .xlsx masters
docs/
  schema.sql                 relational schema for putting this on a real database
  reject_reason_stage_map.csv  the 134 reject reasons × which stage offers each (review in Excel)
```

**To just look at it:** open `ett-qc-entry.html`. It runs in local mode — everything works, records
are kept in the tab only.

**To develop:** `cd src && python3 -m http.server 8080`, then open <http://localhost:8080>.
A server is needed because `index.html` fetches `master-data.json`, which `file://` blocks.

---

## Master data

`master-data.json` is generated from four workbooks. Re-run the tool whenever they change:

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

## Wiring it to your own backend

The prototype persists through a hosted document store. There are **six** places that touch storage,
all in the `PERSISTENCE` section of `app.js` — replace their bodies and nothing else changes:

| function | does | replace with |
|---|---|---|
| `boot()` | opens the store | `DB = yourClient` |
| `subscribe()` | live list of recent records | `GET /api/records?limit=40`, poll or SSE |
| `pullLot(lot)` | look up a lot number | `GET /api/lots/:lotNo` |
| `saveRecord()` | write one checkpoint record | `POST /api/records` |
| `saveStandard()` | write per-article standards | `PUT /api/standards/:article/:stage` |
| `doExport()` | dump records to CSV | `GET /api/records.csv` |

Example replacement for `pullLot`:

```js
async function pullLot(lot){
  if(!lot || lot.length < 3) return;
  const r = await fetch("/api/lots/" + encodeURIComponent(lot));
  if(!r.ok){ $("#lotState").textContent = "NEW LOT"; return; }
  const d = await r.json();
  ["ARTICLE","COLOUR","CUSTOMER","SUBSTANCE","TANNERY","QTY_SF","PIECES"]
    .forEach(k => { if(d[k]) V[k] = d[k]; });
  $("#lotState").textContent = "LOADED FROM LOT MASTER";
  applyArticle(false);
}
```

The record object `saveRecord()` builds is the contract — see `docs/schema.sql` for the same data
normalised into tables, including why `qc_value` stores `std_min` / `std_max` per row (standards
change; a record has to stay interpretable against the standard it was judged by).

Entry keeps working without a backend: if the store is unreachable the app switches to local mode
and keeps records in the tab, and drafts are always mirrored to `localStorage` per stage so a reload
or a dropped connection never loses a half-filled form.

---

## Speed of entry

These exist because a checkpoint entry has to take under a minute on the floor:

- **ALL IN STANDARD** — fills every actual with the standard (midpoint for ranges, ACCEPTED/PASS for
  selects, decision ACCEPTED). Most lots are fine; the operator then corrects only the exceptions.
- **COPY LAST** — clones the previous record for that stage.
- **Enter** moves to the next field; number fields open the numeric keypad on mobile.
- Inspector name is remembered per device; drafts auto-save per stage.
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
