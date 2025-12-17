import express from 'express';
import session from 'express-session';
import SQLiteStoreFactory from 'connect-sqlite3';
import dotenv from 'dotenv';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { initDb } from './src/config/db.js';
import { sessionConfig } from './src/config/session.js';
import authRoutes from './src/routes/auth.js';
import adminRoutes from './src/routes/admin.js';
import seriesRoutes from './src/routes/series.js';
import dashboardRoutes from './src/routes/dashboard.js';
import { ensureAuthenticated } from './src/middleware/auth.js';

// find your current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read labels.json manually
const labelsPath = path.join(__dirname, 'src/config/labels.json');
const labels = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));

dotenv.config();

const app = express();
app.use(helmet());

// Views (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 🆕 Make labels available to all EJS templates
app.locals.labels = labels || {};

// Static
app.use('/public', express.static(path.join(__dirname, 'public')));

// Body parsing
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));

// Capture previous URL (same-origin only) for Back link
app.use((req, res, next) => {
  const ref = req.get('Referer') || '';
  let sameOriginRef = '';
  try {
    const r = new URL(ref);
    if (r.origin === `${req.protocol}://${req.get('host')}`) {
      sameOriginRef = r.pathname + r.search + r.hash;
    }
  } catch (e) { /* ignore */ }
  res.locals.prevUrl = sameOriginRef;
  next();
});

// --- BEGIN: Session + No-Cache Setup (AFTER) ---
const SQLiteStore = SQLiteStoreFactory(session);

// Create a persistent SQLite session store
const sessionStore = new SQLiteStore({
  dir: path.join(__dirname, 'data'),
  db: 'sessions.sqlite',
  table: 'sessions'
});

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false
  }
}));

// Clear all sessions on start if requested
if ((process.env.RESET_SESSIONS_ON_START || 'true').toLowerCase() === 'true') {
  sessionStore.clear(err => {
    if (err) console.error('Failed to clear sessions:', err);
    else console.log('All sessions cleared on server start.');
  });
}

// DB init
await initDb();

// No-cache headers
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

// Inject user into views
app.use((req, res, next) => {
  res.locals.currentUser = (req.session && req.session.user) ? req.session.user : null;
  next();
});

// Simple request logger
app.use((req, res, next) => {
  console.log('[REQ]', req.method, req.path);
  next();
});

// Routes
app.get('/', (req, res) => res.redirect('/login'));
app.use('/', authRoutes);
app.use('/admin', ensureAuthenticated, adminRoutes);
app.use('/series', ensureAuthenticated, seriesRoutes);
app.use('/dashboard', ensureAuthenticated, dashboardRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { title: 'Not Found' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`TRAVEL PLAN app running on http://localhost:${PORT}`);
});
