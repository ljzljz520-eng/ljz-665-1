'use strict';
/**
 * SQL Server 驱动：连接已建好的库（默认 LabAssets），
 * 按模块元数据自动生成表结构（IF NOT EXISTS），并写入种子数据。
 */
const sql = require('mssql');
const { ident } = require('../engine/validate');
const { hashPassword } = require('../passwords');

function columnSql(f) {
  const nn = f.required ? 'NOT NULL' : 'NULL';
  switch (f.type) {
    case 'text':   return `[${ident(f.name)}] NVARCHAR(${f.maxLength || 200}) ${nn}`;
    case 'select': return `[${ident(f.name)}] NVARCHAR(50) ${nn}`;
    case 'date':   return `[${ident(f.name)}] DATE ${nn}`;
    default:       return `[${ident(f.name)}] NVARCHAR(200) ${nn}`;
  }
}

function createModuleTableSql(mod) {
  const t = ident(mod.table);
  const cols = mod.fields.filter(f => f.type !== 'attachment').map(columnSql);
  const uniques = mod.fields.filter(f => f.unique)
    .map(f => `CONSTRAINT [UQ_${t}_${ident(f.name)}] UNIQUE ([${ident(f.name)}])`);
  return `
IF OBJECT_ID('dbo.${t}', 'U') IS NULL
CREATE TABLE dbo.[${t}] (
  id INT IDENTITY(1,1) PRIMARY KEY,
  ${[...cols, ...uniques].join(',\n  ')},
  created_by NVARCHAR(50) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);`;
}

function createAttTableSql(mod) {
  const t = ident(mod.table);
  const at = ident(mod.attTable);
  return `
IF OBJECT_ID('dbo.${at}', 'U') IS NULL
CREATE TABLE dbo.[${at}] (
  id INT IDENTITY(1,1) PRIMARY KEY,
  record_id INT NOT NULL REFERENCES dbo.[${t}](id) ON DELETE CASCADE,
  orig_name NVARCHAR(260) NOT NULL,
  stored_name NVARCHAR(120) NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  mime NVARCHAR(120) NULL,
  uploaded_by NVARCHAR(50) NULL,
  uploaded_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);`;
}

const USERS_DDL = `
IF OBJECT_ID('dbo.Users', 'U') IS NULL
CREATE TABLE dbo.Users (
  id INT IDENTITY(1,1) PRIMARY KEY,
  username NVARCHAR(50) NOT NULL UNIQUE,
  password_hash NVARCHAR(200) NOT NULL,
  display_name NVARCHAR(50) NULL,
  role NVARCHAR(20) NOT NULL DEFAULT 'user',
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);`;

const fmtDate = v => (v instanceof Date ? v.toISOString().slice(0, 10) : v);
const fmtTime = v => (v instanceof Date ? v.toISOString() : v);

async function connect(cfg, modules) {
  const base = {
    server: cfg.server, port: cfg.port, user: cfg.user, password: cfg.password,
    options: { encrypt: cfg.encrypt, trustServerCertificate: true, connectTimeout: 6000 },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  };
  // 1) 确保数据库存在（账号无权限创建时要求库已建好，直接报错进入降级）
  const master = await new sql.ConnectionPool({ ...base, database: 'master' }).connect();
  await master.request().input('db', sql.NVarChar(128), cfg.database)
    .query(`IF DB_ID(@db) IS NULL CREATE DATABASE [${ident(cfg.database)}]`);
  await master.close();

  // 2) 连接业务库，自动建表 + 种子数据
  const pool = await new sql.ConnectionPool({ ...base, database: cfg.database }).connect();
  await pool.request().query(USERS_DDL);
  for (const mod of modules) {
    await pool.request().query(createModuleTableSql(mod));
    await pool.request().query(createAttTableSql(mod));
  }

  // 用户种子：admin（可增删改查）/ user（只读）
  const ucnt = await pool.request().query('SELECT COUNT(*) n FROM dbo.Users');
  if (ucnt.recordset[0].n === 0) {
    const seedUsers = [
      ['admin', 'admin123', '系统管理员', 'admin'],
      ['user',  'user123',  '普通用户',   'user'],
    ];
    for (const [username, pwd, name, role] of seedUsers) {
      await pool.request()
        .input('u', sql.NVarChar(50), username)
        .input('p', sql.NVarChar(200), hashPassword(pwd))
        .input('n', sql.NVarChar(50), name)
        .input('r', sql.NVarChar(20), role)
        .query('INSERT INTO dbo.Users (username, password_hash, display_name, role) VALUES (@u, @p, @n, @r)');
    }
  }
  // 模块演示数据
  for (const mod of modules) {
    if (!Array.isArray(mod.seed) || !mod.seed.length) continue;
    const t = ident(mod.table);
    const c = await pool.request().query(`SELECT COUNT(*) n FROM dbo.[${t}]`);
    if (c.recordset[0].n > 0) continue;
    const fields = mod.fields.filter(f => f.type !== 'attachment');
    for (const row of mod.seed) {
      const req = pool.request();
      for (const f of fields) {
        const val = f.type === 'date' ? new Date(`${row[f.name]}T00:00:00Z`) : row[f.name];
        req.input(f.name, f.type === 'date' ? sql.Date : sql.NVarChar(f.maxLength || 200), val);
      }
      await req.query(`INSERT INTO dbo.[${t}] (${fields.map(f => `[${ident(f.name)}]`).join(',')}, created_by)
                       VALUES (${fields.map(f => `@${f.name}`).join(',')}, 'seed')`);
    }
  }

  const dateFields = mod => mod.fields.filter(f => f.type === 'date').map(f => f.name);
  const mapRow = (mod, r) => {
    const o = { ...r };
    for (const n of dateFields(mod)) o[n] = fmtDate(o[n]);
    return o;
  };

  return {
    driver: 'mssql',

    async findUserByUsername(username) {
      const r = await pool.request().input('u', sql.NVarChar(50), username)
        .query('SELECT TOP 1 * FROM dbo.Users WHERE username = @u');
      return r.recordset[0] || null;
    },

    async listRecords(mod, { page = 1, size = 10, q = '', sort = 'id', order = 'desc' }) {
      const t = ident(mod.table), at = ident(mod.attTable);
      const searchFields = mod.fields.filter(f => f.search && f.type !== 'attachment');
      const where = q ? `WHERE (${searchFields.map(f => `CAST(i.[${ident(f.name)}] AS NVARCHAR(200)) LIKE @q`).join(' OR ')})` : '';
      const sortField = mod.fields.some(f => f.name === sort) || sort === 'id' ? ident(sort) : 'id';
      const dir = /^asc$/i.test(order) ? 'ASC' : 'DESC';
      const req = pool.request()
        .input('off', sql.Int, (page - 1) * size)
        .input('size', sql.Int, size);
      if (q) req.input('q', sql.NVarChar(200), `%${q}%`);
      const total = (await req.query(`SELECT COUNT(*) n FROM dbo.[${t}] i ${where}`)).recordset[0].n;
      const rows = (await req.query(`
        SELECT i.*, (SELECT COUNT(*) FROM dbo.[${at}] a WHERE a.record_id = i.id) AS att_count
        FROM dbo.[${t}] i ${where}
        ORDER BY i.[${sortField}] ${dir}, i.id DESC
        OFFSET @off ROWS FETCH NEXT @size ROWS ONLY`)).recordset;
      return { rows: rows.map(r => mapRow(mod, r)), total };
    },

    async getRecord(mod, id) {
      const t = ident(mod.table);
      const r = await pool.request().input('id', sql.Int, id)
        .query(`SELECT * FROM dbo.[${t}] WHERE id = @id`);
      return r.recordset[0] ? mapRow(mod, r.recordset[0]) : null;
    },

    async fieldValueExists(mod, field, value, excludeId) {
      const t = ident(mod.table);
      const req = pool.request().input('v', sql.NVarChar(200), value);
      let q = `SELECT COUNT(*) n FROM dbo.[${t}] WHERE [${ident(field)}] = @v`;
      if (excludeId != null) { req.input('eid', sql.Int, excludeId); q += ' AND id <> @eid'; }
      return (await req.query(q)).recordset[0].n > 0;
    },

    async createRecord(mod, data, username) {
      const t = ident(mod.table);
      const fields = mod.fields.filter(f => f.type !== 'attachment');
      const req = pool.request().input('cb', sql.NVarChar(50), username || null);
      for (const f of fields) {
        const val = data[f.name] == null ? null : (f.type === 'date' ? new Date(`${data[f.name]}T00:00:00Z`) : data[f.name]);
        req.input(f.name, f.type === 'date' ? sql.Date : sql.NVarChar(f.maxLength || 200), val);
      }
      const r = await req.query(`
        INSERT INTO dbo.[${t}] (${fields.map(f => `[${ident(f.name)}]`).join(',')}, created_by)
        OUTPUT INSERTED.id
        VALUES (${fields.map(f => `@${f.name}`).join(',')}, @cb)`);
      return this.getRecord(mod, r.recordset[0].id);
    },

    async updateRecord(mod, id, data) {
      const t = ident(mod.table);
      const fields = mod.fields.filter(f => f.type !== 'attachment');
      const req = pool.request().input('id', sql.Int, id);
      for (const f of fields) {
        const val = data[f.name] == null ? null : (f.type === 'date' ? new Date(`${data[f.name]}T00:00:00Z`) : data[f.name]);
        req.input(f.name, f.type === 'date' ? sql.Date : sql.NVarChar(f.maxLength || 200), val);
      }
      await req.query(`UPDATE dbo.[${t}] SET ${fields.map(f => `[${ident(f.name)}] = @${f.name}`).join(', ')},
                       updated_at = SYSUTCDATETIME() WHERE id = @id`);
      return this.getRecord(mod, id);
    },

    async deleteRecord(mod, id) {
      const t = ident(mod.table), at = ident(mod.attTable);
      const files = (await pool.request().input('id', sql.Int, id)
        .query(`SELECT stored_name FROM dbo.[${at}] WHERE record_id = @id`)).recordset.map(r => r.stored_name);
      const r = await pool.request().input('id', sql.Int, id).query(`DELETE FROM dbo.[${t}] WHERE id = @id`);
      return { ok: r.rowsAffected[0] > 0, files };
    },

    async listAttachments(mod, recordId) {
      const at = ident(mod.attTable);
      const r = await pool.request().input('id', sql.Int, recordId)
        .query(`SELECT * FROM dbo.[${at}] WHERE record_id = @id ORDER BY id DESC`);
      return r.recordset.map(a => ({ ...a, uploaded_at: fmtTime(a.uploaded_at) }));
    },

    async addAttachment(mod, recordId, meta) {
      const at = ident(mod.attTable);
      const r = await pool.request()
        .input('rid', sql.Int, recordId)
        .input('on', sql.NVarChar(260), meta.orig_name)
        .input('sn', sql.NVarChar(120), meta.stored_name)
        .input('sz', sql.BigInt, meta.size)
        .input('mi', sql.NVarChar(120), meta.mime || null)
        .input('ub', sql.NVarChar(50), meta.uploaded_by || null)
        .query(`INSERT INTO dbo.[${at}] (record_id, orig_name, stored_name, size, mime, uploaded_by)
                OUTPUT INSERTED.id VALUES (@rid, @on, @sn, @sz, @mi, @ub)`);
      return this.getAttachment(mod, r.recordset[0].id);
    },

    async getAttachment(mod, attId) {
      const at = ident(mod.attTable);
      const r = await pool.request().input('id', sql.Int, attId)
        .query(`SELECT * FROM dbo.[${at}] WHERE id = @id`);
      const a = r.recordset[0];
      return a ? { ...a, uploaded_at: fmtTime(a.uploaded_at) } : null;
    },

    async deleteAttachment(mod, attId) {
      const a = await this.getAttachment(mod, attId);
      if (!a) return null;
      const at = ident(mod.attTable);
      await pool.request().input('id', sql.Int, attId).query(`DELETE FROM dbo.[${at}] WHERE id = @id`);
      return a;
    },

    async close() { await pool.close(); },
  };
}

module.exports = { connect };
