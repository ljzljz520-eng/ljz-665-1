'use strict';
/* 低代码平台前端：菜单/列表/表单/附件全部由模块元数据驱动渲染 */
const state = {
  me: null, driver: '', modules: [], mod: null,
  page: 1, size: 10, q: '', sort: 'id', order: 'desc', total: 0,
};

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, isErr) {
  const box = $('#toast');
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

async function api(path, opts = {}) {
  const o = { credentials: 'same-origin', headers: {}, ...opts };
  if (o.body && !(o.body instanceof FormData)) {
    o.headers['Content-Type'] = 'application/json';
    o.body = JSON.stringify(o.body);
  }
  const res = await fetch(path, o);
  if (res.status === 401 && !path.startsWith('/api/auth/login')) {
    state.me = null; renderLogin();
    throw new Error('未登录');
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data && data.error) || `请求失败(${res.status})`);
  return data;
}

const canWrite = () => state.mod && (state.mod.can.includes('create') || state.mod.can.includes('update'));

/* ================= 登录 ================= */
function renderLogin() {
  document.title = '低代码平台 · 登录';
  $('#app').innerHTML = `
  <div class="login-wrap">
    <div class="login-card">
      <h1>低代码开发平台</h1>
      <div class="sub">实验仪器档案管理系统</div>
      <form id="loginForm">
        <label>用户名</label>
        <input id="loginUser" autocomplete="username" placeholder="请输入用户名" />
        <label>密码</label>
        <input id="loginPass" type="password" autocomplete="current-password" placeholder="请输入密码" />
        <div class="login-err" id="loginErr"></div>
        <button class="btn-login" type="submit">登 录</button>
      </form>
      <div class="demo">
        演示账号：<br/>
        管理员 <code>admin / admin123</code>（可增删改查）<br/>
        普通用户 <code>user / user123</code>（仅查看）
      </div>
    </div>
  </div>`;
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    $('#loginErr').textContent = '';
    try {
      const r = await api('/api/auth/login', {
        method: 'POST',
        body: { username: $('#loginUser').value.trim(), password: $('#loginPass').value },
      });
      state.me = r.user; state.driver = r.driver;
      await boot();
    } catch (err) {
      $('#loginErr').textContent = err.message;
    }
  };
}

/* ================= 主框架 ================= */
async function boot() {
  const meta = await api('/api/modules');
  state.modules = meta.modules;
  state.driver = meta.driver;
  renderLayout();
  if (state.modules.length) openModule(state.modules[0].key);
}

function renderLayout() {
  const groups = {};
  for (const m of state.modules) {
    const g = m.menu.group || '应用';
    (groups[g] = groups[g] || []).push(m);
  }
  const menuHtml = Object.entries(groups).map(([g, ms]) => `
    <div class="menu-group">${esc(g)}</div>
    ${ms.map(m => `<div class="menu-item" data-key="${m.key}">${m.menu.icon || '📄'} ${esc(m.menu.title)}</div>`).join('')}
  `).join('');
  const roleTag = state.me.role === 'admin'
    ? '<span class="badge role-admin">管理员</span>' : '<span class="badge role-user">普通用户·只读</span>';
  $('#app').innerHTML = `
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">🧩 低代码平台<small>Low-Code Platform</small></div>
      ${menuHtml}
    </aside>
    <div class="main">
      <div class="topbar">
        <div class="title" id="pageTitle"></div>
        <span class="badge driver">数据源：${state.driver === 'mssql' ? 'SQL Server' : '本地文件（演示）'}</span>
        <div class="spacer"></div>
        <span class="user-chip">👤 ${esc(state.me.displayName || state.me.username)}</span>
        ${roleTag}
        <button class="btn btn-sm" id="btnLogout">退出登录</button>
      </div>
      <div class="content" id="content"></div>
    </div>
  </div>`;
  document.querySelectorAll('.menu-item').forEach(el => {
    el.onclick = () => openModule(el.dataset.key);
  });
  $('#btnLogout').onclick = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    state.me = null; renderLogin();
  };
}

/* ================= 模块列表页（元数据驱动） ================= */
async function openModule(key) {
  state.mod = state.modules.find(m => m.key === key);
  state.page = 1; state.q = ''; state.sort = 'id'; state.order = 'desc';
  document.querySelectorAll('.menu-item').forEach(el =>
    el.classList.toggle('active', el.dataset.key === key));
  $('#pageTitle').textContent = state.mod.menu.title;
  await renderList();
}

async function renderList() {
  const mod = state.mod;
  const listFields = mod.fields.filter(f => f.list);
  const writable = canWrite();
  const data = await api(`/api/modules/${mod.key}/records?page=${state.page}&size=${state.size}&q=${encodeURIComponent(state.q)}&sort=${state.sort}&order=${state.order}`);
  state.total = data.total;
  const pages = Math.max(1, Math.ceil(data.total / state.size));

  $('#content').innerHTML = `
  <div class="card">
    <div class="toolbar">
      <input type="search" id="searchBox" placeholder="搜索：编号 / 名称 / 实验室 / 负责人" value="${esc(state.q)}" />
      <button class="btn" id="btnSearch">查询</button>
      <span class="desc">共 ${data.total} 条档案</span>
      <div class="spacer"></div>
      ${writable ? '<button class="btn btn-primary" id="btnAdd">＋ 新增仪器</button>' : '<span class="desc">当前为只读账号，仅可查看</span>'}
    </div>
    <div style="overflow-x:auto">
    <table class="grid">
      <thead><tr>
        ${listFields.map(f => `<th>${esc(f.label)}</th>`).join('')}
        <th style="width:150px">操作</th>
      </tr></thead>
      <tbody>
        ${data.rows.length ? data.rows.map(row => `
          <tr data-id="${row.id}">
            ${listFields.map(f => `<td>${renderCell(f, row)}</td>`).join('')}
            <td>
              ${writable
                ? `<button class="btn-link act-edit">编辑</button><button class="btn-link danger act-del">删除</button>`
                : `<button class="btn-link act-view">查看</button>`}
            </td>
          </tr>`).join('')
        : `<tr><td colspan="${listFields.length + 1}"><div class="empty">暂无数据${writable ? '，点击右上角「新增仪器」建档' : ''}</div></td></tr>`}
      </tbody>
    </table>
    </div>
    <div class="pager">
      <button class="btn btn-sm" id="pgPrev" ${state.page <= 1 ? 'disabled' : ''}>上一页</button>
      <span>第 ${state.page} / ${pages} 页</span>
      <button class="btn btn-sm" id="pgNext" ${state.page >= pages ? 'disabled' : ''}>下一页</button>
    </div>
  </div>`;

  $('#btnSearch').onclick = () => { state.q = $('#searchBox').value.trim(); state.page = 1; renderList(); };
  $('#searchBox').onkeydown = e => { if (e.key === 'Enter') $('#btnSearch').click(); };
  if (writable) $('#btnAdd').onclick = () => openForm(null);
  $('#pgPrev').onclick = () => { if (state.page > 1) { state.page--; renderList(); } };
  $('#pgNext').onclick = () => { if (state.page < pages) { state.page++; renderList(); } };

  document.querySelectorAll('tbody tr[data-id]').forEach(tr => {
    const id = Number(tr.dataset.id);
    const row = data.rows.find(r => r.id === id);
    const editBtn = tr.querySelector('.act-edit');
    const delBtn = tr.querySelector('.act-del');
    const viewBtn = tr.querySelector('.act-view');
    if (editBtn) editBtn.onclick = () => openForm(row);
    if (viewBtn) viewBtn.onclick = () => openForm(row, true);
    if (delBtn) delBtn.onclick = () => removeRecord(row);
    const attBtn = tr.querySelector('.act-att');
    if (attBtn) attBtn.onclick = () => openAttachments(row);
  });
}

function renderCell(f, row) {
  if (f.type === 'attachment') {
    const n = row.att_count || 0;
    return `<button class="btn-link act-att">📎 附件(${n})</button>`;
  }
  const v = row[f.name];
  if (f.type === 'select' && f.badge && f.badge[v]) {
    return `<span class="tag ${f.badge[v]}">${esc(v)}</span>`;
  }
  return esc(v ?? '');
}

/* ================= 表单弹窗（元数据驱动） ================= */
function openForm(row, readonly = false) {
  const mod = state.mod;
  const isEdit = !!row;
  const fields = mod.fields.filter(f => f.type !== 'attachment');
  const inputs = fields.map(f => {
    const v = isEdit ? (row[f.name] ?? '') : (f.default ?? '');
    let input;
    if (f.type === 'select') {
      input = `<select name="${f.name}" ${readonly ? 'disabled' : ''}>
        <option value="">请选择${esc(f.label)}</option>
        ${f.options.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}
      </select>`;
    } else if (f.type === 'date') {
      input = `<input type="date" name="${f.name}" value="${esc(v)}" ${readonly ? 'readonly' : ''} />`;
    } else {
      input = `<input name="${f.name}" value="${esc(v)}" placeholder="${esc(f.placeholder || '请输入' + f.label)}" ${readonly ? 'readonly' : ''} />`;
    }
    return `<div class="form-row">
      <label>${esc(f.label)}${f.required ? '<span class="req">*</span>' : ''}</label>
      ${input}
      <div class="form-err" data-err="${f.name}"></div>
    </div>`;
  }).join('');

  showModal({
    title: readonly ? `查看仪器 · ${esc(row.code)}` : (isEdit ? `编辑仪器 · ${esc(row.code)}` : '新增仪器'),
    body: `<form id="recForm">${inputs}</form>
      ${isEdit ? `<div class="form-row"><label>附件管理</label>
        <button type="button" class="btn" id="formAttBtn">📎 管理该仪器的附件</button></div>` : ''}`,
    foot: readonly
      ? `<button class="btn" data-close>关 闭</button>`
      : `<button class="btn" data-close>取 消</button><button class="btn btn-primary" id="recSave">保 存</button>`,
  });

  if (isEdit) $('#formAttBtn').onclick = () => { closeModal(); openAttachments(row); };
  if (readonly) return;

  $('#recSave').onclick = async () => {
    const form = $('#recForm');
    const body = {};
    for (const f of fields) body[f.name] = form.elements[f.name].value.trim();
    document.querySelectorAll('[data-err]').forEach(el => (el.textContent = ''));
    try {
      await api(`/api/modules/${mod.key}/records${isEdit ? '/' + row.id : ''}`, {
        method: isEdit ? 'PUT' : 'POST', body,
      });
      closeModal();
      toast(isEdit ? '仪器档案已更新' : '仪器建档成功');
      renderList();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

async function removeRecord(row) {
  if (!confirm(`确定删除仪器「${row.code} ${row.name}」吗？其附件将一并删除。`)) return;
  try {
    await api(`/api/modules/${state.mod.key}/records/${row.id}`, { method: 'DELETE' });
    toast('已删除');
    renderList();
  } catch (err) { toast(err.message, true); }
}

/* ================= 附件管理 ================= */
async function openAttachments(row) {
  const mod = state.mod;
  const writable = canWrite();
  showModal({
    title: `附件管理 · ${esc(row.code)} ${esc(row.name)}`,
    body: `
      ${writable ? `<div class="att-upload">
        <input type="file" id="attFile" style="flex:1" />
        <button class="btn btn-primary" id="attUpBtn">上传</button>
      </div>` : '<div class="desc" style="margin-bottom:10px;color:#94a3b8;font-size:12px">只读账号可查看和下载附件</div>'}
      <div class="att-list" id="attList"><div class="att-empty">加载中…</div></div>`,
    foot: `<button class="btn" data-close>关 闭</button>`,
  });

  async function reload() {
    const list = await api(`/api/modules/${mod.key}/records/${row.id}/attachments`);
    $('#attList').innerHTML = list.length ? list.map(a => `
      <div class="att-item" data-id="${a.id}">
        <span>📄</span>
        <span class="name" title="${esc(a.orig_name)}">${esc(a.orig_name)}</span>
        <span class="meta">${fmtSize(a.size)} · ${esc(a.uploaded_by || '-')} · ${fmtTime(a.uploaded_at)}</span>
        <button class="btn-link act-dl">下载</button>
        ${writable ? '<button class="btn-link danger act-rm">删除</button>' : ''}
      </div>`).join('') : '<div class="att-empty">暂无附件' + (writable ? '，可上传说明书、合格证、验收单等' : '') + '</div>';

    document.querySelectorAll('.att-item').forEach(el => {
      const id = el.dataset.id;
      el.querySelector('.act-dl').onclick = () =>
        window.open(`/api/modules/${mod.key}/attachments/${id}/download`, '_blank');
      const rm = el.querySelector('.act-rm');
      if (rm) rm.onclick = async () => {
        if (!confirm('确定删除该附件吗？')) return;
        try {
          await api(`/api/modules/${mod.key}/attachments/${id}`, { method: 'DELETE' });
          toast('附件已删除'); reload();
        } catch (err) { toast(err.message, true); }
      };
    });
  }
  await reload();

  if (writable) {
    $('#attUpBtn').onclick = async () => {
      const fi = $('#attFile');
      if (!fi.files.length) return toast('请先选择文件', true);
      const fd = new FormData();
      fd.append('file', fi.files[0]);
      try {
        await api(`/api/modules/${mod.key}/records/${row.id}/attachments`, { method: 'POST', body: fd });
        toast('上传成功'); reload();
      } catch (err) { toast(err.message, true); }
    };
  }
}

const fmtSize = n => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 1024 ? (n / 1024).toFixed(1) + ' KB' : (n || 0) + ' B');
const fmtTime = s => (s ? String(s).replace('T', ' ').slice(0, 16) : '-');

/* ================= 弹窗基础设施 ================= */
function showModal({ title, body, foot }) {
  closeModal();
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.id = 'modalMask';
  mask.innerHTML = `<div class="modal">
    <div class="modal-head"><h3>${title}</h3><button class="modal-close" data-close>×</button></div>
    <div class="modal-body">${body}</div>
    <div class="modal-foot">${foot || ''}</div>
  </div>`;
  document.body.appendChild(mask);
  mask.querySelectorAll('[data-close]').forEach(b => (b.onclick = closeModal));
  mask.addEventListener('mousedown', e => { if (e.target === mask) closeModal(); });
}
function closeModal() { const m = $('#modalMask'); if (m) m.remove(); }

/* ================= 启动 ================= */
(async function init() {
  try {
    const r = await api('/api/auth/me');
    state.me = r.user; state.driver = r.driver;
    await boot();
  } catch {
    renderLogin();
  }
})();
