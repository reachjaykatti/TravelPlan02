
import express from 'express';
import bcrypt from 'bcrypt';
import { getDb } from '../config/db.js';
import { ensureAuthenticated } from '../middleware/auth.js';

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('auth/login', { title: 'Login' });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const db = await getDb();
  const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
  if (!user) return res.render('auth/login', { title: 'Login', error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.render('auth/login', { title: 'Login', error: 'Invalid credentials' });
  req.session.user = { id: user.id, username: user.username, display_name: user.display_name, is_admin: !!user.is_admin };
  res.redirect('/dashboard');
});

router.post('/logout', ensureAuthenticated, (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

export default router;
