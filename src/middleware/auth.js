
export function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect('/login');
}

export function ensureAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.is_admin) return next();
  return res.status(403).render('403', { title: 'Forbidden' });
}
