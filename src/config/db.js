
// src/config/db.js
import sqlite3 from 'sqlite3';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


// --- BEGIN: ensurePointsLedgerSchema helper ---
async function ensurePointsLedgerSchema(db) {
  // Check current columns
  const cols = await db.all(`PRAGMA table_info(points_ledger);`);
  const names = cols.map(c => c.name);
  const hasSeriesId = names.includes('series_id');
  const hasMatchId  = names.includes('match_id');

  // Add missing columns
  if (!hasSeriesId) {
    await db.run(`ALTER TABLE points_ledger ADD COLUMN series_id INTEGER;`);
    console.log('[Migration] Added points_ledger.series_id');
  }
  if (!hasMatchId) {
    await db.run(`ALTER TABLE points_ledger ADD COLUMN match_id INTEGER;`);
    console.log('[Migration] Added points_ledger.match_id');
  }

  // Backfill series_id from matches if match_id is present
  // (Safe even if some rows already have series_id)
  await db.run(`
    UPDATE points_ledger
       SET series_id = (
         SELECT m.series_id
         FROM matches m
         WHERE m.id = points_ledger.match_id
       )
     WHERE (series_id IS NULL OR series_id = '')
       AND match_id IS NOT NULL;
  `);

  // Helpful indexes for fast leaderboard filtering
  await db.run(`CREATE INDEX IF NOT EXISTS idx_points_ledger_series_user ON points_ledger(series_id, user_id);`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_points_ledger_match      ON points_ledger(match_id);`);

  console.log('[Migration] points_ledger schema ensured and backfilled.');
}
// --- END: ensurePointsLedgerSchema helper ---

dotenv.config();
sqlite3.verbose();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default DB file at project-root/data/db.sqlite (override with SQLITE_DB_PATH)
const defaultDbPath = path.resolve(__dirname, '../../data/db.sqlite');
const dbPath = process.env.SQLITE_DB_PATH
  ? path.resolve(process.env.SQLITE_DB_PATH)
  : defaultDbPath;

// Ensure the folder exists
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

let dbInstance = null;

// Minimal promise-based wrapper to mimic sqlite's API (run/get/all/exec)
function wrapDb(db) {
  return {
    run(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
          if (err) return reject(err);
          resolve({ changes: this.changes, lastID: this.lastID });
        });
      });
    },
    get(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
      });
    },
    all(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
      });
    },
    exec(sql) {
      return new Promise((resolve, reject) => {
        db.exec(sql, (err) => (err ? reject(err) : resolve()));
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        db.close((err) => (err ? reject(err) : resolve()));
      });
    },
    // Expose underlying instance if you need advanced options
    raw: db,
    file: dbPath,
  };
}

export async function getDb() {
  if (!dbInstance) {
    const native = new sqlite3.Database(dbPath);
    // Enforce foreign keys on this connection too
    native.exec('PRAGMA foreign_keys = ON;');
    dbInstance = wrapDb(native);
  }
  return dbInstance;
}

export async function initDb() {
  const db = await getDb();
  await db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS series (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      start_date_utc TEXT NOT NULL,
      end_date_utc TEXT,
      is_locked INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS series_members (
      series_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      joined_at TEXT NOT NULL,
      PRIMARY KEY(series_id, user_id),
      FOREIGN KEY(series_id) REFERENCES series(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sport TEXT NOT NULL,
      team_a TEXT NOT NULL,
      team_b TEXT NOT NULL,
      start_time_utc TEXT NOT NULL,
      cutoff_minutes_before INTEGER NOT NULL DEFAULT 30,
      entry_points REAL NOT NULL DEFAULT 50,
      status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled|started|completed|washed_out
      winner TEXT, -- 'A' or 'B'
      admin_declared_at TEXT,
      FOREIGN KEY(series_id) REFERENCES series(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS predictions (
      match_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      predicted_team TEXT NOT NULL, -- 'A' or 'B'
      predicted_at_utc TEXT NOT NULL,
      locked INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(match_id, user_id),
      FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS points_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      match_id INTEGER NOT NULL,
      series_id INTEGER NOT NULL,
      points REAL NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(match_id) REFERENCES matches(id),
      FOREIGN KEY(series_id) REFERENCES series(id)
    );
  `);

  // Bootstrap admin if no users exist
  const count = await db.get('SELECT COUNT(*) as c FROM users');
  if (!count || count.c === 0) {
    const username = process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin';
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Admin@123';
    const displayName = process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME || 'Admin';
    const hash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    await db.run(
      'INSERT INTO users (username, password_hash, display_name, is_admin, created_at) VALUES (?,?,?,?,?)',
      [username, hash, displayName, 1, now]
    );
    console.log(`Bootstrapped admin user: ${username}`);
  }
  await ensurePointsLedgerSchema(db);
}

export const dbFilePath = dbPath;
