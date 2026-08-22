PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ncm_dataset_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name TEXT NOT NULL,
  source_file TEXT NOT NULL,
  source_date TEXT,
  schema_version INTEGER NOT NULL,
  record_count INTEGER NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS ncm_codes (
  version_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  code_digits TEXT NOT NULL,
  section TEXT NOT NULL,
  chapter TEXT NOT NULL,
  heading TEXT NOT NULL,
  subheading TEXT NOT NULL,
  official_label TEXT NOT NULL,
  search_text TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  PRIMARY KEY (version_id, code),
  FOREIGN KEY (version_id) REFERENCES ncm_dataset_versions(id)
);

CREATE TABLE IF NOT EXISTS ncm_tariffs (
  version_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  aec_pct REAL,
  statistics_rate_pct REAL,
  iva_pct REAL,
  iva_additional_pct REAL,
  source_group_description TEXT,
  source_rows TEXT NOT NULL,
  validation_status TEXT NOT NULL CHECK (validation_status IN ('validated', 'blocked_conflict')),
  PRIMARY KEY (version_id, code),
  FOREIGN KEY (version_id, code) REFERENCES ncm_codes(version_id, code)
);

CREATE TABLE IF NOT EXISTS ncm_aliases (
  version_id INTEGER NOT NULL,
  alias TEXT NOT NULL,
  code TEXT NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (version_id, alias, code),
  FOREIGN KEY (version_id, code) REFERENCES ncm_codes(version_id, code)
);

CREATE INDEX IF NOT EXISTS idx_ncm_codes_digits ON ncm_codes(version_id, code_digits);
CREATE INDEX IF NOT EXISTS idx_ncm_codes_heading ON ncm_codes(version_id, heading);
CREATE INDEX IF NOT EXISTS idx_ncm_codes_chapter ON ncm_codes(version_id, chapter);
CREATE INDEX IF NOT EXISTS idx_ncm_tariffs_code ON ncm_tariffs(version_id, code);
CREATE INDEX IF NOT EXISTS idx_ncm_aliases_alias ON ncm_aliases(version_id, alias);

CREATE VIRTUAL TABLE IF NOT EXISTS ncm_codes_fts USING fts5(
  version_id UNINDEXED,
  code UNINDEXED,
  official_label,
  search_text,
  tokenize='unicode61 remove_diacritics 2'
);
