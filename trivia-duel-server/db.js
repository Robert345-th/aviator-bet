const { Pool } = require('pg');

// Railway automatically provides DATABASE_URL when the Postgres service
// is linked to this service (see setup instructions).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      id SERIAL PRIMARY KEY,
      player_name TEXT NOT NULL,
      score INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('Database ready: leaderboard table checked/created.');
}

async function saveScore(playerName, score) {
  await pool.query(
    'INSERT INTO leaderboard (player_name, score) VALUES ($1, $2)',
    [playerName.slice(0, 20), score]
  );
}

async function getTopScores(limit = 10) {
  const result = await pool.query(
    'SELECT player_name, score, created_at FROM leaderboard ORDER BY score DESC LIMIT $1',
    [limit]
  );
  return result.rows;
}

module.exports = { pool, initDb, saveScore, getTopScores };
