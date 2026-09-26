/** 登录校验：未登录一律跳转登录页 / API 返回 401 */
function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ ok: false, msg: '未登录' });
  return res.redirect('/login');
}

module.exports = { requireLogin };
