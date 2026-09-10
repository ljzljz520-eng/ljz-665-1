'use strict';
const fs = require('fs');
const path = require('path');

// 极简 .env 解析（避免额外依赖）
(function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2];
    const hashIdx = v.indexOf(' #');           // 去掉行内注释
    if (hashIdx >= 0) v = v.slice(0, hashIdx);
    v = v.trim().replace(/^["']|["']$/g, '');
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
})();

const bool = (v, d = false) => (v == null ? d : /^(1|true|yes|on)$/i.test(String(v)));

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  tokenTtl: process.env.TOKEN_TTL || '8h',
  uploadDir: path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads')),
  dataDir: path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data')),
  db: {
    server: process.env.DB_SERVER || 'mssql',
    port: parseInt(process.env.DB_PORT || '1433', 10),
    database: process.env.DB_NAME || 'LabAssets',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    encrypt: bool(process.env.DB_ENCRYPT, false),
  },
  allowFallback: bool(process.env.ALLOW_FALLBACK, true),
};
