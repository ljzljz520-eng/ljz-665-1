'use strict';
/**
 * ============================================================
 * 低代码模块元数据：实验仪器档案
 * 新增一个业务模块 = 新增一个这样的文件并在 server.js 注册，
 * 建表 DDL、CRUD API、菜单、列表页、表单、权限全部由引擎自动生成。
 * ============================================================
 */
module.exports = {
  key: 'instruments',                 // 模块标识（API 路径 /api/modules/instruments）
  menu: { title: '仪器档案', icon: '🧪', group: '实验资产管理', order: 1 },
  table: 'Instruments',               // SQL Server 表名
  attTable: 'InstrumentAttachments',  // 附件表名
  // 角色权限：admin 增删改查；user 只读
  permissions: {
    admin: ['create', 'read', 'update', 'delete'],
    user: ['read'],
  },
  fields: [
    { name: 'code',          label: '仪器编号', type: 'text',   required: true, unique: true, maxLength: 50, list: true, search: true, placeholder: '如 INS-0001' },
    { name: 'name',          label: '名称',     type: 'text',   required: true, maxLength: 100, list: true, search: true },
    { name: 'lab',           label: '实验室',   type: 'select', required: true, list: true, search: true,
      options: ['化学实验室', '物理实验室', '生物实验室', '分析测试中心', '精密仪器室'] },
    { name: 'owner',         label: '负责人',   type: 'text',   required: true, maxLength: 50, list: true, search: true },
    { name: 'purchase_date', label: '购置日期', type: 'date',   required: true, list: true },
    { name: 'status',        label: '状态',     type: 'select', required: true, list: true, default: '在用',
      options: ['在用', '维修中', '停用', '报废'],
      badge: { '在用': 'green', '维修中': 'orange', '停用': 'gray', '报废': 'red' } },
    { name: 'attachments',   label: '附件管理', type: 'attachment', list: true },
  ],
  // 首次启动且表为空时写入的演示数据
  seed: [
    { code: 'INS-0001', name: '高效液相色谱仪',     lab: '分析测试中心', owner: '张伟', purchase_date: '2022-03-15', status: '在用' },
    { code: 'INS-0002', name: '电子分析天平',       lab: '化学实验室',   owner: '李娜', purchase_date: '2021-06-20', status: '在用' },
    { code: 'INS-0003', name: '高速冷冻离心机',     lab: '生物实验室',   owner: '王强', purchase_date: '2020-11-05', status: '维修中' },
    { code: 'INS-0004', name: 'PCR扩增仪',          lab: '生物实验室',   owner: '王强', purchase_date: '2023-02-18', status: '在用' },
    { code: 'INS-0005', name: '紫外可见分光光度计', lab: '物理实验室',   owner: '陈静', purchase_date: '2019-09-01', status: '停用' },
    { code: 'INS-0006', name: '恒温恒湿培养箱',     lab: '精密仪器室',   owner: '赵敏', purchase_date: '2024-05-10', status: '在用' },
  ],
};
