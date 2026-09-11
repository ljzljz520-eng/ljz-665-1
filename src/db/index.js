'use strict';
/**
 * 数据源选择：优先连接已建好的 SQL Server 库；
 * 不可达且 ALLOW_FALLBACK=true 时降级为本地文件演示模式。
 */
async function createDal(config, modules) {
  try {
    const dal = await require('./mssqlDriver').connect(config.db, modules);
    console.log(`[db] 已连接 SQL Server ${config.db.server}:${config.db.port} / ${config.db.database}`);
    return dal;
  } catch (e) {
    if (!config.allowFallback) {
      console.error(`[db] SQL Server 连接失败且 ALLOW_FALLBACK=false，启动中止：${e.message}`);
      throw e;
    }
    console.warn(`[db] SQL Server 不可达（${e.message}）`);
    console.warn('[db] ALLOW_FALLBACK=true → 降级为本地文件演示模式（数据写入 ./data，功能与库模式一致）');
    console.warn('[db] 如需连接真实 SQL Server，请核对 .env 的 DB_SERVER/DB_PORT/DB_USER/DB_PASSWORD，可运行 npm run db:check 自检');
    return require('./fileDriver').connect(config, modules);
  }
}

module.exports = { createDal };
