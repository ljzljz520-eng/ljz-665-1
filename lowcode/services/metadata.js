const db = require('../config/db');

let cache = null;

function parseOptions(v) {
  if (!v) return null;
  if (Array.isArray(v)) return v; // mysql2 已自动解析 JSON 列
  try { return JSON.parse(v); } catch (e) { return null; }
}

/** 加载全部实体元数据（字段 + 权限） */
async function loadMetadata(force) {
  if (cache && !force) return cache;
  const [entities] = await db.query(
    'SELECT * FROM sys_entity WHERE show_in_menu = 1 ORDER BY menu_order, id'
  );
  const [fields] = await db.query('SELECT * FROM sys_field ORDER BY order_no, id');
  const [perms] = await db.query('SELECT * FROM sys_role_perm');

  const map = {};
  for (const e of entities) {
    e.fields = fields.filter((f) => f.entity_id === e.id).map((f) => ({
      ...f,
      options: parseOptions(f.options_json),
    }));
    e.permissions = {};
    for (const p of perms.filter((x) => x.entity_id === e.id)) {
      e.permissions[p.role] = {
        select: !!p.can_select,
        insert: !!p.can_insert,
        update: !!p.can_update,
        delete: !!p.can_delete,
      };
    }
    map[e.entity_key] = e;
  }
  cache = map;
  return map;
}

async function getEntity(key) {
  const m = await loadMetadata();
  return m[key] || null;
}

/** 某角色对实体的权限，默认全部拒绝 */
function permFor(entity, role) {
  return (
    entity.permissions[role] || {
      select: false,
      insert: false,
      update: false,
      delete: false,
    }
  );
}

module.exports = { loadMetadata, getEntity, permFor };
