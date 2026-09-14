-- =====================================================================
-- ETT In-Process Quality — relational schema
-- PostgreSQL dialect. For MySQL: jsonb -> json, timestamptz -> datetime,
-- text -> varchar(n), gen_random_uuid() -> uuid().
--
-- The prototype stores records as documents. This is the same data
-- normalised, for teams putting it on a real database.
-- =====================================================================

-- ---------- master data (loaded from the four ETT workbooks) ----------

CREATE TABLE article (
    article        text NOT NULL,              -- 'AEON V2'
    thickness      text NOT NULL,              -- '1.3-1.5'  (mm range, dot decimals)
    brand          text,                       -- customer this target belongs to
    softness_neck  numeric(4,2),
    softness_belly numeric(4,2),
    softness_butt  numeric(4,2),
    PRIMARY KEY (article, thickness, brand)
);
-- NOTE: 131 article+thickness keys in the source have several rows. 33 differ by
-- brand (a real per-customer target); the rest are conflicting duplicates that
-- should be resolved in the master. The app prefers the brand-matching row and
-- averages the remainder — keep that rule or clean the source, but don't lose it.

CREATE TABLE wetblue_standard (
    article        text NOT NULL,
    thickness      text NOT NULL,
    tannery        text NOT NULL,              -- ETT / ETI / ETX / ETH
    variant        text NOT NULL DEFAULT '',   -- '(BLACK)', '(WHITE)', '' …
    brand_desc     text,
    catalogue_grade text,                      -- EMBOSS / SEMI ANILINE / …
    option_kind    text NOT NULL,              -- MAIN / ALT / CALF / NEW
    hides          text,                       -- 'ST FS', 'EC', 'Q3' …
    supplier       text,                       -- 'TYSON', 'ANY' …
    material_code  text,                       -- 'ST-TY-4', 'EC-2' …
    PRIMARY KEY (article, thickness, tannery, variant, option_kind)
);
-- One row per option. MAIN = the catalogue choice (PASS), the others are
-- acceptable alternatives (NEAR). Anything else the operator types is FAIL.

CREATE TABLE colour_code (
    article     text NOT NULL,
    colour_code text NOT NULL,
    description text,
    is_active   boolean NOT NULL DEFAULT true,
    PRIMARY KEY (article, colour_code)
);

CREATE TABLE reject_reason (
    code_no     text PRIMARY KEY,              -- '34'
    short_code  text,                          -- 'BS'  (only 45 of 134 have one)
    name_en     text NOT NULL,                 -- 'BLACK SPOT'
    name_th     text,                          -- 'จุดดำ'
    reject_group text,                         -- MANUFACTURING / NATURAL …
    phase       text                           -- WET BLUE / CRUST/FINISHED / FINISHED
);

CREATE TABLE reject_reason_stage (             -- which stage offers which reason
    code_no text NOT NULL REFERENCES reject_reason(code_no) ON DELETE CASCADE,
    stage   text NOT NULL,                     -- WBTO / RTO / CTO / FHO / GIP
    PRIMARY KEY (code_no, stage)
);

-- ---------- per-article standard overrides (set from the form) ----------

CREATE TABLE parameter_standard (
    article    text NOT NULL,
    thickness  text NOT NULL DEFAULT 'ANY',
    stage      text NOT NULL,
    param_key  text NOT NULL,                  -- 'MOIST', 'SOFT_N', 'THK' …
    min_value  numeric(10,3),
    max_value  numeric(10,3),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text,
    PRIMARY KEY (article, thickness, stage, param_key)
);

-- ---------- transactions ----------

CREATE TABLE lot (
    lot_no      text PRIMARY KEY,
    article     text,
    thickness   text,
    colour_code text,
    customer    text,
    tannery     text,
    qty_sf      numeric(12,2),
    pieces      integer,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE qc_record (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_no      text NOT NULL REFERENCES lot(lot_no),
    stage       text NOT NULL,                 -- WBTO / RTO / CTO / FHO / GIP / PD-TRL
    inspector   text NOT NULL,
    checked_at  timestamptz NOT NULL,          -- operator's date/time
    created_at  timestamptz NOT NULL DEFAULT now(),
    result      text,                          -- pass / near / fail  (worst parameter)
    decision    text,                          -- ACCEPTED / ACCEPTED WO / REJECTED
    main_defect text REFERENCES reject_reason(code_no),
    note        text,
    -- GIP computed values, stored so reports never recompute them differently
    trim_sf     numeric(12,2),
    coefficient numeric(6,2),
    ftt         numeric(6,2),
    graded_total_sf numeric(12,2),
    UNIQUE (lot_no, stage, checked_at)
);
CREATE INDEX ON qc_record (stage, checked_at DESC);
CREATE INDEX ON qc_record (lot_no);
CREATE INDEX ON qc_record (result) WHERE result = 'fail';

-- Long format: one row per measured parameter. Keeps the schema stable when
-- parameters are added, and makes trend queries trivial.
CREATE TABLE qc_value (
    record_id  uuid NOT NULL REFERENCES qc_record(id) ON DELETE CASCADE,
    param_key  text NOT NULL,                  -- 'MOIST', 'SOFT_N', 'TAPE' …
    value_num  numeric(12,3),                  -- single value, or range start
    value_to   numeric(12,3),                  -- range end, null when single
    value_text text,                           -- for PASS/FAIL/ACCEPTED/codes
    std_min    numeric(12,3),                  -- standard in force AT ENTRY TIME
    std_max    numeric(12,3),
    result     text,                           -- pass / near / fail
    PRIMARY KEY (record_id, param_key)
);
-- Storing std_min/std_max per row matters: standards change, and a record must
-- stay interpretable against the standard it was judged by.

CREATE TABLE qc_record_reject (
    record_id uuid NOT NULL REFERENCES qc_record(id) ON DELETE CASCADE,
    code_no   text NOT NULL REFERENCES reject_reason(code_no),
    PRIMARY KEY (record_id, code_no)
);

CREATE TABLE qc_grade_split (                  -- GIP only
    record_id uuid NOT NULL REFERENCES qc_record(id) ON DELETE CASCADE,
    grade     text NOT NULL,                   -- 'G1'..'G8', 'REJ'
    area_sf   numeric(12,2) NOT NULL,
    PRIMARY KEY (record_id, grade)
);

CREATE TABLE qc_repair (                       -- GIP only
    record_id   uuid PRIMARY KEY REFERENCES qc_record(id) ON DELETE CASCADE,
    has_repair  boolean,
    category    text,                          -- PRODUCT / COLOUR / PROCESSING
    repaired_pcs integer
);

-- ---------- example reports ----------

-- Coefficient and FTT by article, last 30 days
-- SELECT r.stage, l.article,
--        round(avg(r.coefficient), 1) AS avg_coefficient,
--        round(avg(r.ftt), 1)         AS avg_ftt,
--        count(*)                     AS lots
--   FROM qc_record r JOIN lot l USING (lot_no)
--  WHERE r.stage = 'GIP' AND r.checked_at > now() - interval '30 days'
--  GROUP BY 1, 2 ORDER BY avg_coefficient;

-- Top defects, split manufacturing vs raw material
-- SELECT rr.reject_group, rr.name_en, rr.name_th, count(*) AS hits
--   FROM qc_record_reject x
--   JOIN reject_reason rr ON rr.code_no = x.code_no
--   JOIN qc_record r      ON r.id = x.record_id
--  WHERE r.checked_at > now() - interval '90 days'
--  GROUP BY 1, 2, 3 ORDER BY hits DESC LIMIT 20;

-- Where in the line a lot first went wrong
-- SELECT lot_no, min(stage) FILTER (WHERE result = 'fail') AS first_failing_stage
--   FROM qc_record GROUP BY lot_no HAVING bool_or(result = 'fail');
