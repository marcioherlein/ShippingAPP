-- Preserve ordering without temporary sorts; supports the bounded latest-two lookup.
CREATE INDEX IF NOT EXISTS idx_watchlist_user_active_updated
  ON watchlist_items(user_id, active, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_watchlist_snapshot_item_time_id
  ON watchlist_snapshots(watchlist_item_id, observed_at DESC, id DESC);
