
import express from 'express';
import { getDb } from '../config/db.js';

const router = express.Router();

// compute streaks from an array of 'W'/'L' values
function computeStreaks(seq) {
  let current = 0, currentType = null;
  let longestWin = 0, longestLoss = 0;

  for (const v of seq) {
    if (v === 'W') {
      if (currentType === 'W') current += 1;
      else { current = 1; currentType = 'W'; }
      if (current > longestWin) longestWin = current;
    } else if (v === 'L') {
      if (currentType === 'L') current += 1;
      else { current = 1; currentType = 'L'; }
      if (current > longestLoss) longestLoss = current;
    }
  }
  const currentStreak = current ? (String(current) + currentType) : '—';
  return { currentStreak, longestWin, longestLoss };
}


router.get('/', async (req, res) => {
  const db = await getDb();
  const uid = req.session.user.id;

  // Helper: detect if points_ledger has a given column
  async function tableHasColumn(table, column) {
    const cols = await db.all(`PRAGMA table_info(${table});`);
    return cols.some(c => c.name === column);
  }

  // Read optional series filter from query string (e.g., /dashboard?seriesId=4)
  const rawSid = (req.query.seriesId || '').trim();
  const selectedSeriesId = rawSid ? parseInt(rawSid, 10) : NaN;
  const hasSeriesFilter = !Number.isNaN(selectedSeriesId);

  // ----- Total points (all-time for the logged-in user) -----
  const totalRow = await db.get(
    'SELECT COALESCE(SUM(points),0) as total_points FROM points_ledger WHERE user_id = ?',
    [uid]
  );
  const totalPoints = (totalRow && typeof totalRow.total_points === 'number')
    ? totalRow.total_points
    : 0;

  // ----- Per-series stats for the user (for the table and for the dropdown) -----
  const seriesStats = await db.all(`
    SELECT s.id as series_id, s.name,
           COALESCE(SUM(CASE WHEN p.predicted_team = m.winner THEN 1 ELSE 0 END),0) as wins,
           COALESCE(SUM(CASE WHEN m.status = 'completed' THEN 1 ELSE 0 END),0) as completed,
           COALESCE(SUM(CASE WHEN p.predicted_team != m.winner THEN 1 ELSE 0 END),0) as losses
    FROM series s
    LEFT JOIN matches m ON m.series_id = s.id
    LEFT JOIN predictions p ON p.match_id = m.id AND p.user_id = ?
    LEFT JOIN series_members sm ON sm.series_id = s.id AND sm.user_id = ?
    WHERE sm.user_id IS NOT NULL
    GROUP BY s.id, s.name
    ORDER BY s.start_date_utc DESC
  `, [uid, uid]);

  // For heading when filtering
  const selectedSeriesName = hasSeriesFilter
    ? ((seriesStats.find(s => s.series_id === selectedSeriesId) || {}).name || null)
    : null;

  // ----- Leaderboard (global or series-wise) -----
  let leaderboard = [];
  let seriesUnsupported = false;

  if (!hasSeriesFilter) {
    // Global leaderboard (existing behavior)
    leaderboard = await db.all(`
      SELECT u.display_name, COALESCE(SUM(pl.points),0) as points
      FROM users u
      LEFT JOIN points_ledger pl ON pl.user_id = u.id
      GROUP BY u.id
      ORDER BY points DESC
    `);
  } else {
    // Series-wise leaderboard: try to filter by series_id or match_id if available
    const hasSeriesIdCol = await tableHasColumn('points_ledger', 'series_id');
    const hasMatchIdCol  = await tableHasColumn('points_ledger', 'match_id');

    if (hasSeriesIdCol) {
      leaderboard = await db.all(`
        SELECT u.display_name, COALESCE(SUM(pl.points),0) as points
        FROM users u
        LEFT JOIN points_ledger pl
          ON pl.user_id = u.id AND pl.series_id = ?
        GROUP BY u.id
        ORDER BY points DESC
      `, [selectedSeriesId]);
    } else if (hasMatchIdCol) {
      leaderboard = await db.all(`
        SELECT u.display_name, COALESCE(SUM(pl.points),0) as points
        FROM users u
        LEFT JOIN points_ledger pl ON pl.user_id = u.id
        LEFT JOIN matches m        ON m.id = pl.match_id
        WHERE m.series_id = ?
        GROUP BY u.id
        ORDER BY points DESC
      `, [selectedSeriesId]);
    } else {
      // No way to filter the ledger by series -> fall back to global
      seriesUnsupported = true;
      leaderboard = await db.all(`
        SELECT u.display_name, COALESCE(SUM(pl.points),0) as points
        FROM users u
        LEFT JOIN points_ledger pl ON pl.user_id = u.id
        GROUP BY u.id
        ORDER BY points DESC
      `);
    }
  }

  // ----- W/L streaks for the current user (unchanged) -----
  const wlRows = await db.all(`
    SELECT m.start_time_utc, m.status, m.winner, p.predicted_team
    FROM matches m
    JOIN predictions p ON p.match_id = m.id AND p.user_id = ?
    WHERE m.status = 'completed'
    ORDER BY m.start_time_utc ASC
  `, [uid]);

  const seq = wlRows.map(r => (r.predicted_team === r.winner ? 'W' : 'L'));
  const { currentStreak, longestWin, longestLoss } = computeStreaks(seq);

  // Render with extra locals for the new filter
  res.render('dashboard/index', {
    title: 'Dashboard',
    totalPoints,
    seriesStats,
    leaderboard,
    streaks: { currentStreak, longestWin, longestLoss },

    // New locals for the series-wise leaderboard
    selectedSeriesId: hasSeriesFilter ? selectedSeriesId : null,
    selectedSeriesName,
    seriesUnsupported
  });
});


export default router;
