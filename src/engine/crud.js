'use strict';
/**
 * 低代码引擎核心：读取模块元数据，自动生成
 * 列表/详情/新增/修改/删除 + 附件上传下载删除 的 REST API，
 * 并按模块 permissions 做角色鉴权（admin 增删改查，user 只读）。
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { validateRecord } = require('./validate');

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** 菜单/表单元数据下发给前端（含当前用户在该模块上的权限） */
function publicMeta(mod, user) {
  return {
    key: mod.key,
    menu: mod.menu,
    fields: mod.fields,
    can: (mod.permissions[user.role] || ['read']),
  };
}

function buildModuleRouter(mod, dal, config) {
  const r = express.Router();

  const can = (req, action) => (mod.permissions[req.user.role] || []).includes(action);
  const need = action => (req, res, next) =>
    can(req, action) ? next()
      : res.status(403).json({ error: '权限不足：普通用户仅可查看，无法执行增删改操作' });

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, config.uploadDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').slice(0, 20);
        cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
      },
    }),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  });

  // 列表（分页/搜索/排序）
  r.get('/records', wrap(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(req.query.size, 10) || 10));
    const { q = '', sort = 'id', order = 'desc' } = req.query;
    res.json(await dal.listRecords(mod, { page, size, q: String(q).trim(), sort, order }));
  }));

  // 详情
  r.get('/records/:id', wrap(async (req, res) => {
    const row = await dal.getRecord(mod, req.params.id);
    if (!row) return res.status(404).json({ error: '记录不存在' });
    res.json(row);
  }));

  // 新增
  r.post('/records', need('create'), wrap(async (req, res) => {
    const { data, errors } = validateRecord(mod, req.body);
    if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0], fields: errors });
    for (const f of mod.fields.filter(f => f.unique)) {
      if (data[f.name] && await dal.fieldValueExists(mod, f.name, data[f.name], null)) {
        return res.status(409).json({ error: `${f.label}「${data[f.name]}」已存在，不能重复` });
      }
    }
    const row = await dal.createRecord(mod, data, req.user.username);
    res.status(201).json(row);
  }));

  // 修改
  r.put('/records/:id', need('update'), wrap(async (req, res) => {
    const exist = await dal.getRecord(mod, req.params.id);
    if (!exist) return res.status(404).json({ error: '记录不存在' });
    const { data, errors } = validateRecord(mod, req.body);
    if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0], fields: errors });
    for (const f of mod.fields.filter(f => f.unique)) {
      if (data[f.name] && await dal.fieldValueExists(mod, f.name, data[f.name], exist.id)) {
        return res.status(409).json({ error: `${f.label}「${data[f.name]}」已存在，不能重复` });
      }
    }
    res.json(await dal.updateRecord(mod, exist.id, data));
  }));

  // 删除（连带删除附件文件）
  r.delete('/records/:id', need('delete'), wrap(async (req, res) => {
    const { ok, files } = await dal.deleteRecord(mod, req.params.id);
    if (!ok) return res.status(404).json({ error: '记录不存在' });
    for (const f of files || []) fs.promises.unlink(path.join(config.uploadDir, f)).catch(() => {});
    res.json({ ok: true });
  }));

  // 附件列表
  r.get('/records/:id/attachments', wrap(async (req, res) => {
    const row = await dal.getRecord(mod, req.params.id);
    if (!row) return res.status(404).json({ error: '记录不存在' });
    res.json(await dal.listAttachments(mod, row.id));
  }));

  // 附件上传
  r.post('/records/:id/attachments', need('update'), upload.single('file'), wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '未接收到文件' });
    const row = await dal.getRecord(mod, req.params.id);
    if (!row) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(404).json({ error: '记录不存在' });
    }
    let orig = req.file.originalname || req.file.filename;
    try { orig = Buffer.from(orig, 'latin1').toString('utf8'); } catch { /* 保持原名 */ }
    const att = await dal.addAttachment(mod, row.id, {
      orig_name: orig,
      stored_name: req.file.filename,
      size: req.file.size,
      mime: req.file.mimetype || null,
      uploaded_by: req.user.username,
    });
    res.status(201).json(att);
  }));

  // 附件下载（登录即可）
  r.get('/attachments/:attId/download', wrap(async (req, res) => {
    const att = await dal.getAttachment(mod, req.params.attId);
    if (!att) return res.status(404).json({ error: '附件不存在' });
    const file = path.join(config.uploadDir, path.basename(att.stored_name));
    if (!fs.existsSync(file)) return res.status(404).json({ error: '附件文件已丢失' });
    res.download(file, att.orig_name);
  }));

  // 附件删除
  r.delete('/attachments/:attId', need('update'), wrap(async (req, res) => {
    const att = await dal.deleteAttachment(mod, req.params.attId);
    if (!att) return res.status(404).json({ error: '附件不存在' });
    fs.promises.unlink(path.join(config.uploadDir, path.basename(att.stored_name))).catch(() => {});
    res.json({ ok: true });
  }));

  return r;
}

module.exports = { buildModuleRouter, publicMeta };
