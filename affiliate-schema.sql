CREATE TABLE IF NOT EXISTS affiliates (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  qualifying_clicks INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS affiliate_tiers (
  minimum_clicks INTEGER PRIMARY KEY,
  rate_bps INTEGER NOT NULL CHECK(rate_bps BETWEEN 1500 AND 10000)
);
INSERT OR IGNORE INTO affiliate_tiers VALUES (0, 1500);
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  code TEXT NOT NULL REFERENCES affiliates(code),
  visitor TEXT NOT NULL,
  PRIMARY KEY (code, visitor)
);
CREATE TABLE IF NOT EXISTS affiliate_orders (
  order_id TEXT PRIMARY KEY,
  code TEXT NOT NULL REFERENCES affiliates(code),
  rate_bps INTEGER NOT NULL,
  commission_cents INTEGER,
  status TEXT CHECK(status IN ('pending','paid','void'))
);
