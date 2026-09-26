const express = require('express');
const crypto = require('crypto');
const db = require('../config/db');
const router = express.Router();

function sha256(pwd) {
  return crypto.createHash('sha256').update('lowcode::' + pwd).digest('hex');
}

function loginPage(req, res) {
  res.render('login', { error: null, username: '' });
}

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  loginPage(req, res);
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await db.query(
      'SELECT * FROM sys_user WHERE username = ? AND status = "enabled"',
      [username || '']
    );
    const u = rows[0];
    if (!u || u.password_hash !== sha256(password || '')) {
      return res.status(401).render('login', { error: '用户名或密码错误', username: username || '' });
    }
    req.session.user = { id: u.id, username: u.username, realName: u.real_name, role: u.role };
    res.redirect('/');
  } catch (e) {
    res.status(500).render('login', { error: '服务异常: ' + e.message, username: username || '' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
