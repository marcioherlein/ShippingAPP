PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ncm_dataset_meta (
  id INTEGER PRIMARY KEY,
  source_file TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  source_rows INTEGER NOT NULL,
  occurrences INTEGER NOT NULL,
  record_count INTEGER NOT NULL,
  conflict_count INTEGER NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ncm_tariffs (
  code TEXT PRIMARY KEY,
  chapter TEXT NOT NULL,
  heading TEXT NOT NULL,
  subheading TEXT NOT NULL,
  section TEXT,
  aec_pct REAL,
  statistics_pct REAL,
  iva_pct REAL,
  iva_additional_ref_pct REAL,
  gains_ref_pct REAL,
  iibb_ref_pct REAL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'conflict')),
  source_row INTEGER NOT NULL,
  source_description TEXT,
  dataset_id INTEGER NOT NULL REFERENCES ncm_dataset_meta(id),
  is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1))
);

CREATE TABLE IF NOT EXISTS ncm_tariff_conflicts (
  code TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  aec_pct REAL,
  statistics_pct REAL,
  iva_pct REAL,
  iva_additional_ref_pct REAL,
  gains_ref_pct REAL,
  iibb_ref_pct REAL,
  source_description TEXT,
  PRIMARY KEY (code, source_row),
  FOREIGN KEY (code) REFERENCES ncm_tariffs(code)
);

CREATE INDEX IF NOT EXISTS idx_ncm_tariffs_chapter ON ncm_tariffs(chapter);
CREATE INDEX IF NOT EXISTS idx_ncm_tariffs_heading ON ncm_tariffs(heading);
CREATE INDEX IF NOT EXISTS idx_ncm_tariffs_subheading ON ncm_tariffs(subheading);
CREATE INDEX IF NOT EXISTS idx_ncm_tariffs_status ON ncm_tariffs(status, is_current);
