'use strict';
/**
 * SQL Server 连接自检：DNS 解析 → TCP 端口 → TDS 登录，逐步定位。
 * 用法：npm run db:check
 */
const dns = require('dns');
const net = require('net');
const config = require('../src/config');

const { server, port, user, database } = config.db;
const FAKE_IP = /^(198\.1[89]\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

const step = (ok, msg) => console.log(`${ok ? '✔' : '✘'} ${msg}`);

(async () => {
  console.log(`[db:check] 目标: ${server}:${port}  库: ${database}  账号: ${user}`);

  // 1) DNS
  let addr;
  try {
    addr = await dns.promises.lookup(server).then(r => r.address);
    step(true, `DNS 解析 ${server} → ${addr}`);
    if (FAKE_IP.test(addr)) {
      step(false, `${addr} 位于保留/代理 fake-ip 网段：该主机名并非真实 SQL Server，请把 .env 的 DB_SERVER 改为实际 IP/主机名`);
    }
  } catch (e) {
    step(false, `DNS 解析失败（${e.code || e.message}）：主机名不存在，请修改 .env 的 DB_SERVER`);
    process.exit(1);
  }

  // 2) TCP
  const tcpOk = await new Promise(resolve => {
    const s = net.connect({ host: server, port, timeout: 4000 });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.once('error', () => resolve(false));
  });
  if (!tcpOk) {
    step(false, `TCP ${server}:${port} 不可达：检查 SQL Server 是否启动、TCP/IP 协议是否启用、防火墙/安全组是否放行 1433`);
    process.exit(1);
  }
  step(true, `TCP ${server}:${port} 可连接`);

  // 3) TDS 登录
  try {
    const sql = require('mssql');
    const pool = await new sql.ConnectionPool({
      server, port, user, password: config.db.password, database: 'master',
      options: { encrypt: config.db.encrypt, trustServerCertificate: true, connectTimeout: 6000 },
    }).connect();
    const r = await pool.request().query('SELECT @@VERSION v');
    await pool.close();
    step(true, `TDS 登录成功：${String(r.recordset[0].v).split('\n')[0]}`);
    console.log('[db:check] 连接正常，重启应用即可使用 SQL Server（启动日志应显示「已连接 SQL Server」）');
  } catch (e) {
    step(false, `TDS 握手/登录失败：${e.message}`);
    if (/timeout|Failed to connect/i.test(e.message)) {
      console.log('  → 端口通但握手超时：通常是该地址并非真正的 SQL Server（如代理 fake-ip 劫持），或服务器强制加密。核对 DB_SERVER，或将 DB_ENCRYPT 设为 true 再试');
    } else if (/Login failed/i.test(e.message)) {
      console.log('  → 账号密码错误：核对 .env 的 DB_USER / DB_PASSWORD（当前密码是否仍为占位符 Your_password？）');
    }
    process.exit(1);
  }
})();
