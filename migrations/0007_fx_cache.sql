PRAGMA foreign_keys = ON;

-- Last-known-good BCRA FX rate cache.
-- Written on every successful BCRA fetch; read when BCRA is unavailable
-- so economics is not blocked for extended outages.
CREATE TABLE IF NOT EXISTS fx_snapshots (
  code TEXT NOT NULL PRIMARY KEY,
  ars_per_usd REAL NOT NULL,
  source_date TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
