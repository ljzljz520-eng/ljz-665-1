const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../config/db');
const { getEntity, permFor } = require('../services/metadata');
const crud = require('../services/crud');

const router = express.Router();
const ENTITY_KEY = 'lab-instrument';

const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 10) + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

/* ---------- 页面 ---------- */

// 列表页
router.get('/', async (req, res, next) => {
  try {
    const entity = await getEntity(ENTITY_KEY);
    const role = req.session.user.role;
    const perm = permFor(entity, role);
    const result = await crud.list(ENTITY_KEY, role, req.query);
    if (!result.ok) return res.status(result.code).send(result.msg);
    res.render('instrument/list', {
      entity, perm, user: req.session.user,
      data: result.data, query: req.query,
      activeMenu: ENTITY_KEY,
    });
  } catch (e) { next(e); }
});

// 新增/编辑表单页
router.get('/form/:id?', async (req, res, next) => {
  try {
    const entity = await getEntity(ENTITY_KEY);
    const role = req.session.user.role;
    const perm = permFor(entity, role);
    const id = req.params.id;
    let record = null;
    if (id) {
      const r = await crud.getOne(ENTITY_KEY, role, id);
      if (!r.ok) return res.status(r.code).send(r.msg);
      record = r.data;
      if (!perm.update) return res.redirect('/lab-instrument/view/' + id);
    } else if (!perm.insert) {
      return res.status(403).send('无新增权限');
    }
    res.render('instrument/form', {
      entity, perm, user: req.session.user,
      record, error: null, activeMenu: ENTITY_KEY,
    });
  } catch (e) { next(e); }
});

// 详情页（含附件管理）
router.get('/view/:id', async (req, res, next) => {
  try {
    const entity = await getEntity(ENTITY_KEY);
    const role = req.session.user.role;
    const perm = permFor(entity, role);
    const r = await crud.getOne(ENTITY_KEY, role, req.params.id);
    if (!r.ok) return res.status(r.code).send(r.msg);
    const [files] = await db.query(
      'SELECT * FROM lab_instrument_file WHERE instrument_id = ? ORDER BY uploaded_at DESC, id DESC',
      [req.params.id]
    );
    res.render('instrument/view', {
      entity, perm, user: req.session.user,
      record: r.data, files, activeMenu: ENTITY_KEY,
    });
  } catch (e) { next(e); }
});

/* ---------- 通用 CRUD API ---------- */

router.get('/api/records', async (req, res) => {
  const r = await crud.list(ENTITY_KEY, req.session.user.role, req.query);
  res.status(r.ok ? 200 : r.code).json(r);
});

router.post('/api/records', async (req, res) => {
  const r = await crud.create(ENTITY_KEY, req.session.user.role, req.body);
  res.status(r.ok ? 200 : r.code).json(r);
});

router.put('/api/records/:id', async (req, res) => {
  const r = await crud.update(ENTITY_KEY, req.session.user.role, req.params.id, req.body);
  res.status(r.ok ? 200 : r.code).json(r);
});

router.delete('/api/records/:id', async (req, res) => {
  const id = req.params.id;
  // 先校验删除权限（与 crud.remove 相同的权限判定）
  const entity = await getEntity(ENTITY_KEY);
  if (!entity) return res.status(404).json({ ok: false, msg: '实体不存在' });
  if (!permFor(entity, req.session.user.role).delete) {
    return res.status(403).json({ ok: false, msg: '无删除权限' });
  }
  // 删除磁盘上的附件物理文件（DB 记录由外键 ON DELETE CASCADE 级联清理）
  const [files] = await db.query('SELECT stored_name FROM lab_instrument_file WHERE instrument_id = ?', [id]);
  const r = await crud.remove(ENTITY_KEY, req.session.user.role, id);
  if (r.ok) {
    for (const f of files) {
      const fp = path.join(UPLOAD_DIR, f.stored_name);
      if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch (e) { /* ignore */ } }
    }
  }
  res.status(r.ok ? 200 : r.code).json(r);
});

/* ---------- 附件管理 API ---------- */

async function loadInstrumentForWrite(req, res) {
  const entity = await getEntity(ENTITY_KEY);
  const perm = permFor(entity, req.session.user.role);
  if (!perm.update && !perm.insert) {
    res.status(403).json({ ok: false, msg: '无附件管理权限（仅管理员可上传/删除）' });
    return null;
  }
  const [rows] = await db.query('SELECT id FROM lab_instrument WHERE id = ?', [req.params.id]);
  if (!rows[0]) { res.status(404).json({ ok: false, msg: '仪器不存在' }); return null; }
  return rows[0];
}

// 上传附件
router.post('/api/records/:id/files', upload.single('file'), async (req, res) => {
  try {
    const inst = await loadInstrumentForWrite(req, res);
    if (!inst) return;
    if (!req.file) return res.status(400).json({ ok: false, msg: '未收到文件' });
    // multer 以 latin1 解析 multipart 文件名，需转回 utf8 以支持中文文件名
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    await db.query(
      `INSERT INTO lab_instrument_file
       (instrument_id,file_name,stored_name,mime_type,file_size,uploaded_by)
       VALUES (?,?,?,?,?,?)`,
      [inst.id, originalName, req.file.filename,
       req.file.mimetype, req.file.size, req.session.user.username]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, msg: '上传失败: ' + e.message });
  }
});

// 下载附件（有查看权限即可）
router.get('/api/records/:id/files/:fid/download', async (req, res) => {
  try {
    const entity = await getEntity(ENTITY_KEY);
    if (!permFor(entity, req.session.user.role).select) return res.status(403).send('无权限');
    const [rows] = await db.query(
      'SELECT * FROM lab_instrument_file WHERE id = ? AND instrument_id = ?',
      [req.params.fid, req.params.id]
    );
    const f = rows[0];
    if (!f) return res.status(404).send('附件不存在');
    const fp = path.join(UPLOAD_DIR, f.stored_name);
    if (!fs.existsSync(fp)) return res.status(404).send('文件已丢失');
    res.download(fp, f.file_name);
  } catch (e) { res.status(500).send(e.message); }
});

// 删除附件（仅管理员）
router.delete('/api/records/:id/files/:fid', async (req, res) => {
  try {
    const inst = await loadInstrumentForWrite(req, res);
    if (!inst) return;
    const [rows] = await db.query(
      'SELECT * FROM lab_instrument_file WHERE id = ? AND instrument_id = ?',
      [req.params.fid, inst.id]
    );
    const f = rows[0];
    if (!f) return res.status(404).json({ ok: false, msg: '附件不存在' });
    await db.query('DELETE FROM lab_instrument_file WHERE id = ?', [f.id]);
    const fp = path.join(UPLOAD_DIR, f.stored_name);
    fs.existsSync(fp) && fs.unlinkSync(fp);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, msg: '删除失败: ' + e.message });
  }
});

module.exports = router;
