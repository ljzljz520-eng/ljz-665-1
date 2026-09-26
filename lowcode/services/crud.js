const db = require('../config/db');
const { getEntity } = require('./metadata');
const { permFor } = require('./metadata');

const STATUS = {
  OK: (data) => ({ ok: true, data }),
  FAIL: (msg, code) => ({ ok: false, msg, code: code || 400 }),
};

/** 依据元数据校验并清洗请求体；返回 { values, error } */
function buildValues(entity, body) {
  const values = {};
  for (const f of entity.fields) {
    if (!f.show_in_form) continue;
    let v = body[f.field_name];
    if (v === undefined || v === null || v === '') v = null;
    if (typeof v === 'string') v = v.trim();
    if (v === null || v === '') {
      if (f.is_required) return { error: '「' + f.label + '」不能为空' };
      values[f.field_name] = null;
      continue;
    }
    if (f.data_type === 'string' && f.max_length && v.length > f.max_length) {
      return { error: '「' + f.label + '」长度不能超过 ' + f.max_length };
    }
    if (f.data_type === 'enum' && !f.options.includes(v)) {
      return { error: '「' + f.label + '」取值不合法' };
    }
    if (f.data_type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return { error: '「' + f.label + '」日期格式应为 YYYY-MM-DD' };
    }
    if (f.data_type === 'int') v = parseInt(v, 10);
    if (f.data_type === 'decimal') v = parseFloat(v);
    values[f.field_name] = v;
  }
  return { values };
}

/** 通用列表：按元数据 searchable 字段检索 + 分页 */
async function list(entityKey, role, query) {
  const entity = await getEntity(entityKey);
  if (!entity) return STATUS.FAIL('实体不存在', 404);
  if (!permFor(entity, role).select) return STATUS.FAIL('无查看权限', 403);

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const size = Math.min(100, parseInt(query.size, 10) || 10);
  const where = [];
  const params = [];
  for (const f of entity.fields) {
    if (!f.searchable || query[f.field_name] === undefined || query[f.field_name] === '') continue;
    const q = String(query[f.field_name]).trim();
    if (f.data_type === 'enum') {
      where.push('`' + f.field_name + '` = ?');
      params.push(q);
    } else {
      where.push('`' + f.field_name + '` LIKE ?');
      params.push('%' + q + '%');
    }
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const [[{ total }]] = await db.query(
    'SELECT COUNT(*) total FROM `' + entity.table_name + '` ' + whereSql,
    params
  );
  const [rows] = await db.query(
    'SELECT * FROM `' + entity.table_name + '` ' + whereSql +
      ' ORDER BY id DESC LIMIT ? OFFSET ?',
    params.concat([size, (page - 1) * size])
  );
  if (entityKey === 'lab-instrument') {
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const [cnt] = await db.query(
        'SELECT instrument_id, COUNT(*) c FROM lab_instrument_file WHERE instrument_id IN (?) GROUP BY instrument_id',
        [ids]
      );
      const m = Object.fromEntries(cnt.map((x) => [x.instrument_id, x.c]));
      rows.forEach((r) => { r.file_count = m[r.id] || 0; });
    } else {
      rows.forEach((r) => { r.file_count = 0; });
    }
  }
  return STATUS.OK({ rows, total, page, size, pages: Math.ceil(total / size) });
}

async function getOne(entityKey, role, id) {
  const entity = await getEntity(entityKey);
  if (!entity) return STATUS.FAIL('实体不存在', 404);
  if (!permFor(entity, role).select) return STATUS.FAIL('无查看权限', 403);
  const [rows] = await db.query('SELECT * FROM `' + entity.table_name + '` WHERE id = ?', [id]);
  if (!rows[0]) return STATUS.FAIL('记录不存在', 404);
  return STATUS.OK(rows[0]);
}

async function create(entityKey, role, body) {
  const entity = await getEntity(entityKey);
  if (!entity) return STATUS.FAIL('实体不存在', 404);
  if (!permFor(entity, role).insert) return STATUS.FAIL('无新增权限', 403);
  const { values, error } = buildValues(entity, body);
  if (error) return STATUS.FAIL(error);
  const cols = Object.keys(values);
  try {
    const [r] = await db.query(
      'INSERT INTO `' + entity.table_name + '` (' +
        cols.map((c) => '`' + c + '`').join(',') +
        ') VALUES (' + cols.map(() => '?').join(',') + ')',
      cols.map((c) => values[c])
    );
    return STATUS.OK({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return STATUS.FAIL('仪器编号已存在，请更换');
    return STATUS.FAIL('保存失败: ' + e.message);
  }
}

async function update(entityKey, role, id, body) {
  const entity = await getEntity(entityKey);
  if (!entity) return STATUS.FAIL('实体不存在', 404);
  if (!permFor(entity, role).update) return STATUS.FAIL('无修改权限', 403);
  const exist = await getOne(entityKey, role, id);
  if (!exist.ok) return exist;
  const { values, error } = buildValues(entity, body);
  if (error) return STATUS.FAIL(error);
  const cols = Object.keys(values);
  try {
    await db.query(
      'UPDATE `' + entity.table_name + '` SET ' +
        cols.map((c) => '`' + c + '`=?').join(',') + ' WHERE id = ?',
      cols.map((c) => values[c]).concat([id])
    );
    return STATUS.OK({ id: +id });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return STATUS.FAIL('仪器编号已存在，请更换');
    return STATUS.FAIL('保存失败: ' + e.message);
  }
}

async function remove(entityKey, role, id) {
  const entity = await getEntity(entityKey);
  if (!entity) return STATUS.FAIL('实体不存在', 404);
  if (!permFor(entity, role).delete) return STATUS.FAIL('无删除权限', 403);
  const exist = await getOne(entityKey, role, id);
  if (!exist.ok) return exist;
  await db.query('DELETE FROM `' + entity.table_name + '` WHERE id = ?', [id]);
  return STATUS.OK({ id: +id });
}

module.exports = { list, getOne, create, update, remove, permFor };
