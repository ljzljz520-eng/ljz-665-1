'use strict';
/**
 * 本地文件演示驱动：与 SQL Server 驱动实现同一套 DAL 接口。
 * 仅当 SQL Server 不可达且 ALLOW_FALLBACK=true 时启用，保证平台可直接演示。
 */
const fs = require('fs');
const path = require('path');
const { hashPassword } = require('../passwords');

function loadJson(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return def; }
}

async function connect(cfg, modules) {
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  const files = {
    users: path.join(cfg.dataDir, 'users.json'),
    seq: path.join(cfg.dataDir, 'seq.json'),
  };
  for (const mod of modules) {
    files[mod.key] = path.join(cfg.dataDir, `${mod.key}.json`);
    files[`${mod.key}_att`] = path.join(cfg.dataDir, `${mod.key}_attachments.json`);
  }

  const db = {};
  db.users = loadJson(files.users, null);
  if (!db.users) {
    db.users = [
      { id: 1, username: 'admin', password_hash: hashPassword('admin123'), display_name: '系统管理员', role: 'admin', created_at: new Date().toISOString() },
      { id: 2, username: 'user',  password_hash: hashPassword('user123'),  display_name: '普通用户',   role: 'user',  created_at: new Date().toISOString() },
    ];
    persist('users');
  }
  const seq = loadJson(files.seq, {});
  const nextId = key => { seq[key] = (seq[key] || 0) + 1; fs.writeFileSync(files.seq, JSON.stringify(seq)); return seq[key]; };

  for (const mod of modules) {
    db[mod.key] = loadJson(files[mod.key], null);
    if (!db[mod.key]) {
      const now = new Date().toISOString();
      db[mod.key] = (mod.seed || []).map((row, i) => ({ id: i + 1, ...row, created_by: 'seed', created_at: now, updated_at: now }));
      seq[mod.key] = db[mod.key].length;
      persist(mod.key);
    }
    db[`${mod.key}_att`] = loadJson(files[`${mod.key}_att`], []);
  }
  fs.writeFileSync(files.seq, JSON.stringify(seq));

  function persist(key) {
    fs.writeFileSync(files[key], JSON.stringify(db[key], null, 2));
  }

  return {
    driver: 'file',

    async findUserByUsername(username) {
      return db.users.find(u => u.username === username) || null;
    },

    async listRecords(mod, { page = 1, size = 10, q = '', sort = 'id', order = 'desc' }) {
      const searchFields = mod.fields.filter(f => f.search && f.type !== 'attachment').map(f => f.name);
      let rows = db[mod.key].slice();
      if (q) {
        const needle = String(q).toLowerCase();
        rows = rows.filter(r => searchFields.some(n => String(r[n] ?? '').toLowerCase().includes(needle)));
      }
      const dir = /^asc$/i.test(order) ? 1 : -1;
      rows.sort((a, b) => {
        const va = a[sort], vb = b[sort];
        if (va === vb) return (b.id - a.id);
        return (va > vb ? 1 : va < vb ? -1 : 0) * dir;
      });
      const total = rows.length;
      const atts = db[`${mod.key}_att`];
      rows = rows.slice((page - 1) * size, page * size)
        .map(r => ({ ...r, att_count: atts.filter(a => a.record_id === r.id).length }));
      return { rows, total };
    },

    async getRecord(mod, id) {
      return db[mod.key].find(r => r.id === Number(id)) || null;
    },

    async fieldValueExists(mod, field, value, excludeId) {
      return db[mod.key].some(r => r[field] === value && (excludeId == null || r.id !== Number(excludeId)));
    },

    async createRecord(mod, data, username) {
      const now = new Date().toISOString();
      const row = { id: nextId(mod.key), ...data, created_by: username || null, created_at: now, updated_at: now };
      db[mod.key].push(row);
      persist(mod.key);
      return row;
    },

    async updateRecord(mod, id, data) {
      const row = db[mod.key].find(r => r.id === Number(id));
      if (!row) return null;
      Object.assign(row, data, { updated_at: new Date().toISOString() });
      persist(mod.key);
      return row;
    },

    async deleteRecord(mod, id) {
      const idx = db[mod.key].findIndex(r => r.id === Number(id));
      if (idx < 0) return { ok: false, files: [] };
      db[mod.key].splice(idx, 1);
      const attKey = `${mod.key}_att`;
      const removed = db[attKey].filter(a => a.record_id === Number(id));
      db[attKey] = db[attKey].filter(a => a.record_id !== Number(id));
      persist(mod.key); persist(attKey);
      return { ok: true, files: removed.map(a => a.stored_name) };
    },

    async listAttachments(mod, recordId) {
      return db[`${mod.key}_att`].filter(a => a.record_id === Number(recordId)).sort((a, b) => b.id - a.id);
    },

    async addAttachment(mod, recordId, meta) {
      const attKey = `${mod.key}_att`;
      const att = { id: nextId(attKey), record_id: Number(recordId), ...meta, uploaded_at: new Date().toISOString() };
      db[attKey].push(att);
      persist(attKey);
      return att;
    },

    async getAttachment(mod, attId) {
      return db[`${mod.key}_att`].find(a => a.id === Number(attId)) || null;
    },

    async deleteAttachment(mod, attId) {
      const attKey = `${mod.key}_att`;
      const idx = db[attKey].findIndex(a => a.id === Number(attId));
      if (idx < 0) return null;
      const [att] = db[attKey].splice(idx, 1);
      persist(attKey);
      return att;
    },

    async close() {},
  };
}

module.exports = { connect };
