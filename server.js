const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

const API_KEY = process.env.API_KEY || 'CHANGE-ME'; // must match Tampermonkey script

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS odds_log (
      id BIGSERIAL PRIMARY KEY,
      platform TEXT NOT NULL,
      multiplier NUMERIC(10, 2) NOT NULL,
      collected_at TIMESTAMPTZ NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      source_url TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_odds_log_platform_time
      ON odds_log (platform, collected_at DESC);
  `);
}

function requireApiKey(req, res, next) {
  const key = req.header('X-API-Key') || req.query.key;
  if (key !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// ---------------------------------------------------------------------
// Live feed: dashboard clients connect here via Server-Sent Events and
// get pushed each round the moment it's inserted — no polling delay.
// ---------------------------------------------------------------------
const sseClients = new Set();

function broadcast(round) {
  const payload = `data: ${JSON.stringify(round)}\n\n`;
  for (const res of sseClients) {
    res.write(payload);
  }
}

app.get('/api/stream', requireApiKey, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  res.write(': connected\n\n');

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// Health check — Railway pings this
app.get('/health', (req, res) => res.send('Aviator odds collector is running'));

// Accepts either a single round or a batch: { rounds: [...] }
app.post('/api/odds', requireApiKey, async (req, res) => {
  const rounds = Array.isArray(req.body.rounds)
    ? req.body.rounds
    : [req.body];

  const clean = rounds.filter(
    (r) => r && r.platform && typeof r.multiplier === 'number'
  );

  if (clean.length === 0) {
    return res.status(400).json({ error: 'no valid rounds in payload' });
  }

  try {
    let inserted = 0;
    for (const r of clean) {
      const result = await pool.query(
        `INSERT INTO odds_log (platform, multiplier, collected_at, source_url)
         SELECT $1, $2, $3, $4
         WHERE NOT EXISTS (
           SELECT 1 FROM odds_log
           WHERE platform = $1
             AND multiplier = $2
             AND collected_at BETWEEN $3::timestamptz - INTERVAL '3 seconds'
                                  AND $3::timestamptz + INTERVAL '3 seconds'
         )`,
        [r.platform, r.multiplier, r.collected_at || new Date().toISOString(), r.url || null]
      );
      if (result.rowCount > 0) inserted++;
    }

    if (inserted > 0) clean.forEach(broadcast);

    res.json({ inserted });
  } catch (err) {
    console.error('Insert failed:', err);
    res.status(500).json({ error: 'insert failed' });
  }
});

// Lookback for the dashboard's initial load and for sanity-checking data
// e.g. GET /api/odds/recent?platform=bwanabet&limit=50
app.get('/api/odds/recent', requireApiKey, async (req, res) => {
  const platform = req.query.platform || null;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 5000);

  try {
    const { rows } = platform
      ? await pool.query(
          `SELECT platform, multiplier, collected_at
           FROM odds_log WHERE platform = $1
           ORDER BY collected_at DESC LIMIT $2`,
          [platform, limit]
        )
      : await pool.query(
          `SELECT platform, multiplier, collected_at
           FROM odds_log ORDER BY collected_at DESC LIMIT $1`,
          [limit]
        );
    res.json(rows);
  } catch (err) {
    console.error('Query failed:', err);
    res.status(500).json({ error: 'query failed' });
  }
});

app.get('/api/odds/count', requireApiKey, async (req, res) => {
  const platform = req.query.platform || null;
  try {
    const { rows } = platform
      ? await pool.query(`SELECT COUNT(*) FROM odds_log WHERE platform = $1`, [platform])
      : await pool.query(`SELECT COUNT(*) FROM odds_log`);
    res.json({ count: parseInt(rows[0].count, 10) });
  } catch (err) {
    console.error('Count query failed:', err);
    res.status(500).json({ error: 'query failed' });
  }
});

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------
// Pattern mining: for each platform, look at runs of consecutive rounds
// in the same color tier (blue < 2x, purple 2-9.99x, pink 10x+) and see
// what tends to follow. Ranked by how reliable each pattern has been.
// ---------------------------------------------------------------------
function tierOf(m) {
  if (m >= 10) return 'pink';
  if (m >= 2) return 'purple';
  return 'blue';
}

function isHit(m) {
  return m >= 3; // "3x and up" — the outcome we're hunting for
}

const MIN_OCCURRENCES = 5;
const MIN_CONFIDENCE = 0.75;

function computeTopPatterns(values) {
  const seqLens = [2, 3, 4, 5];
  const stats = {}; // sequence key -> { total, hits }

  for (let i = 0; i < values.length - 1; i++) {
    for (const len of seqLens) {
      const start = i - len + 1;
      if (start < 0) continue;

      const seq = [];
      for (let j = start; j <= i; j++) seq.push(tierOf(values[j]));
      const key = seq.join('>');

      if (!stats[key]) stats[key] = { total: 0, hits: 0 };
      stats[key].total++;
      if (isHit(values[i + 1])) stats[key].hits++;
    }
  }

  const results = [];
  for (const key in stats) {
    const { total, hits } = stats[key];
    if (total < MIN_OCCURRENCES) continue;
    const confidence = hits / total;
    if (confidence < MIN_CONFIDENCE) continue;
    results.push({ sequence: key.split('>'), count: hits, total, confidence });
  }

  results.sort((a, b) => b.confidence - a.confidence || b.total - a.total);
  return results.slice(0, 5);
}

app.get('/api/patterns', requireApiKey, async (req, res) => {
  const platform = req.query.platform;
  if (!platform) return res.status(400).json({ error: 'platform required' });

  try {
    const { rows } = await pool.query(
      `SELECT multiplier FROM odds_log WHERE platform = $1
       ORDER BY collected_at ASC LIMIT 5000`,
      [platform]
    );
    const values = rows.map((r) => Number(r.multiplier));
    res.json(computeTopPatterns(values));
  } catch (err) {
    console.error('Pattern query failed:', err);
    res.status(500).json({ error: 'query failed' });
  }
});

ensureSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`Odds collector listening on ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to set up schema:', err);
    process.exit(1);
  });
