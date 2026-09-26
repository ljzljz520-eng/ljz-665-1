const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const { loadMetadata } = require('./services/metadata');
const { requireLogin } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const entityRoutes = require('./routes/entity');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'lowcode-demo-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 8 * 3600 * 1000 },
  })
);

// 模板全局变量：菜单 + 当前用户
app.use(async (req, res, next) => {
  res.locals.currentUser = req.session ? req.session.user : null;
  try {
    const meta = await loadMetadata();
    res.locals.menuEntities = Object.values(meta);
  } catch (e) {
    res.locals.menuEntities = [];
  }
  next();
});

app.use('/', authRoutes);

app.get('/', requireLogin, async (req, res) => {
  const meta = await loadMetadata();
  const first = Object.values(meta)[0];
  res.redirect(first ? '/lab-instrument' : '/login');
});

app.use('/lab-instrument', requireLogin, entityRoutes);

app.use((req, res) => res.status(404).render('error', {
  user: req.session && req.session.user, message: '页面不存在',
}));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    user: req.session && req.session.user, message: '服务器错误: ' + err.message,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
  await loadMetadata(true);
  console.log('低代码平台已启动: http://localhost:' + PORT);
  console.log('管理员 admin/admin123  普通用户 user/user123');
});
