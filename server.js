const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

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
    const values = [];
    const placeholders = clean
      .map((r, i) => {
        const base = i * 4;
        values.push(
          r.platform,
          r.multiplier,
          r.collected_at || new Date().toISOString(),
          r.url || null
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
      })
      .join(', ');

    await pool.query(
      `INSERT INTO odds_log (platform, multiplier, collected_at, source_url)
       VALUES ${placeholders}`,
      values
    );

    clean.forEach(broadcast);

    res.json({ inserted: clean.length });
  } catch (err) {
    console.error('Insert failed:', err);
    res.status(500).json({ error: 'insert failed' });
  }
});

// Lookback for the dashboard's initial load and for sanity-checking data
// e.g. GET /api/odds/recent?platform=bwanabet&limit=50
app.get('/api/odds/recent', requireApiKey, async (req, res) => {
  const platform = req.query.platform || null;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);

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

const PORT = process.env.PORT || 3000;

ensureSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`Odds collector listening on ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to set up schema:', err);
    process.exit(1);
  });
