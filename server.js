'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const config = require('./src/config');
const { createDal } = require('./src/db');
const makeAuth = require('./src/auth');
const { buildModuleRouter, publicMeta } = require('./src/engine/crud');

// ===== 低代码模块注册表（新增模块只需加一行）=====
const modules = [
  require('./src/modules/instrument'),
];

(async () => {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const dal = await createDal(config, modules);
  const auth = makeAuth(config, dal);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  // 认证
  app.use('/api/auth', auth.router);

  // 菜单/模块元数据（低代码平台骨架：前端据此渲染菜单、列表、表单）
  app.get('/api/modules', auth.requireAuth, (req, res) => {
    res.json({
      platform: '低代码开发平台',
      driver: dal.driver,
      modules: modules
        .slice()
        .sort((a, b) => (a.menu.order || 0) - (b.menu.order || 0))
        .map(m => publicMeta(m, req.user)),
    });
  });

  // 各模块的通用 CRUD + 附件 API
  for (const mod of modules) {
    app.use(`/api/modules/${mod.key}`, auth.requireAuth, buildModuleRouter(mod, dal, config));
  }

  // 前端静态资源
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

  // 统一错误处理
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: '文件超过 20MB 限制' });
    }
    console.error('[error]', err);
    res.status(err.status || 500).json({ error: err.expose ? err.message : '服务器内部错误' });
  });

  app.listen(config.port, () => {
    console.log(`[app] 低代码平台已启动: http://localhost:${config.port}`);
    console.log(`[app] 数据源: ${dal.driver === 'mssql' ? 'SQL Server' : '本地文件（演示模式）'}，模块: ${modules.map(m => m.menu.title).join('、')}`);
    console.log('[app] 演示账号: admin/admin123（管理员，可增删改查），user/user123（普通用户，仅查看）');
  });
})().catch(e => {
  console.error('[app] 启动失败:', e);
  process.exit(1);
});
