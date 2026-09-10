'use strict';
const express = require('express');
const jwt = require('jsonwebtoken');
const { verifyPassword } = require('./passwords');

function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie;
  if (h) {
    for (const p of h.split(';')) {
      const i = p.indexOf('=');
      if (i > 0) {
        try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch { /* ignore */ }
      }
    }
  }
  return out;
}

function publicUser(u) {
  return { id: u.id || u.uid, username: u.username, role: u.role, displayName: u.display_name || u.displayName };
}

module.exports = function makeAuth(config, dal) {
  const router = express.Router();

  function sign(user) {
    return jwt.sign(
      { uid: user.id, username: user.username, role: user.role, displayName: user.display_name },
      config.jwtSecret,
      { expiresIn: config.tokenTtl }
    );
  }

  function requireAuth(req, res, next) {
    const cookies = parseCookies(req);
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const token = cookies.token || bearer;
    if (!token) return res.status(401).json({ error: '未登录或会话已过期' });
    try {
      req.user = jwt.verify(token, config.jwtSecret);
      next();
    } catch {
      return res.status(401).json({ error: '未登录或会话已过期' });
    }
  }

  // 登录
  router.post('/login', async (req, res, next) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
      const user = await dal.findUserByUsername(String(username).trim());
      if (!user || !verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ error: '用户名或密码错误' });
      }
      const token = sign(user);
      res.setHeader('Set-Cookie', `token=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800`);
      res.json({ user: publicUser(user), driver: dal.driver });
    } catch (e) { next(e); }
  });

  // 登出
  router.post('/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
    res.json({ ok: true });
  });

  // 当前登录人
  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user), driver: dal.driver });
  });

  return { router, requireAuth };
};
