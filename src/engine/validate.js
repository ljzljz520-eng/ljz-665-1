'use strict';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 依据模块元数据做服务端校验，返回 { data, errors } */
function validateRecord(mod, body) {
  const data = {};
  const errors = {};
  for (const f of mod.fields) {
    if (f.type === 'attachment') continue; // 附件走独立接口
    let v = body ? body[f.name] : undefined;
    if (typeof v === 'string') v = v.trim();
    if ((v === undefined || v === null || v === '') && f.default != null) v = f.default;

    if (v === undefined || v === null || v === '') {
      if (f.required) errors[f.name] = `${f.label}不能为空`;
      else data[f.name] = null;
      continue;
    }
    switch (f.type) {
      case 'text':
        v = String(v);
        if (f.maxLength && v.length > f.maxLength) { errors[f.name] = `${f.label}长度不能超过 ${f.maxLength}`; continue; }
        data[f.name] = v;
        break;
      case 'select':
        if (!f.options.includes(v)) { errors[f.name] = `${f.label}取值无效`; continue; }
        data[f.name] = v;
        break;
      case 'date': {
        const s = String(v).slice(0, 10);
        if (!DATE_RE.test(s) || isNaN(Date.parse(s))) { errors[f.name] = `${f.label}格式应为 YYYY-MM-DD`; continue; }
        data[f.name] = s;
        break;
      }
      default:
        data[f.name] = v;
    }
  }
  return { data, errors };
}

/** SQL 标识符白名单（表名/列名只来自模块元数据，仍兜底校验防注入） */
function ident(s) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) throw new Error(`非法标识符: ${s}`);
  return s;
}

module.exports = { validateRecord, ident };
