/**
 * 数据库初始化：建库 + 建表 + 种子数据 + 低代码元数据注册
 * 用法: node sql/init.js
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
require('dotenv').config();

const DB_NAME = process.env.DB_NAME || 'lowcode_platform';

function hash(pwd) {
  return crypto.createHash('sha256').update('lowcode::' + pwd).digest('hex');
}

async function main() {
  // 1. 连接到服务器（不指定库），创建数据库
  const root = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });
  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
     DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`
  );
  console.log('✓ 数据库就绪:', DB_NAME);
  await root.end();

  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: DB_NAME, multipleStatements: true,
  });

  // 2. 执行 DDL
  const ddl = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(ddl);
  console.log('✓ 表结构就绪');

  // 3. 用户（仅当为空）
  const [[{ c }]] = await db.query('SELECT COUNT(*) c FROM sys_user');
  if (+c === 0) {
    await db.query(
      `INSERT INTO sys_user (username,password_hash,real_name,role) VALUES
       ('admin', ?, '系统管理员', 'admin'),
       ('user',  ?, '普通用户',   'user')`,
      [hash('admin123'), hash('user123')]
    );
    console.log('✓ 内置用户: admin/admin123（管理员）, user/user123（普通用户）');
  }

  // 4. 注册低代码实体：实验仪器档案
  await db.query(`INSERT IGNORE INTO sys_entity
    (table_name,entity_key,title,icon,menu_order,show_in_menu)
    VALUES ('lab_instrument','lab-instrument','实验仪器档案','flask',10,1)`);
  const [[ent]] = await db.query("SELECT id FROM sys_entity WHERE entity_key='lab-instrument'");
  const eid = ent.id;

  const fields = [
    // field, label, type, required, maxlen, options, inList, inForm, searchable, order
    ['code',          '仪器编号', 'string', 1, 50,  null, 1, 1, 1, 10],
    ['name',          '仪器名称', 'string', 1, 150, null, 1, 1, 1, 20],
    ['lab',           '实验室',   'string', 1, 100, null, 1, 1, 1, 30],
    ['manager',       '负责人',   'string', 1, 50,  null, 1, 1, 1, 40],
    ['purchase_date', '购置日期', 'date',   1, null,null, 1, 1, 0, 50],
    ['status',        '状态',     'enum',   1, null,
      JSON.stringify(['在用','闲置','维修中','报废']), 1, 1, 1, 60],
    ['remark',        '备注',     'text',   0, 500, null, 0, 1, 0, 70],
  ];
  for (const f of fields) {
    await db.query(
      `INSERT INTO sys_field (entity_id,field_name,label,data_type,is_required,max_length,options_json,
                              show_in_list,show_in_form,searchable,order_no)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE label=VALUES(label),data_type=VALUES(data_type),
         is_required=VALUES(is_required),options_json=VALUES(options_json),
         show_in_list=VALUES(show_in_list),show_in_form=VALUES(show_in_form),
         searchable=VALUES(searchable),order_no=VALUES(order_no)`,
      [eid, f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7], f[8], f[9]]
    );
  }
  console.log('✓ 字段元数据注册完成（编号/名称/实验室/负责人/购置日期/状态/备注）');

  // 5. 权限：管理员全量 CRUD；普通用户只读
  await db.query(
    `INSERT INTO sys_role_perm (entity_id,role,can_select,can_insert,can_update,can_delete)
     VALUES (?,?,1,1,1,1) ON DUPLICATE KEY UPDATE
       can_select=1,can_insert=1,can_update=1,can_delete=1`,
    [eid, 'admin']
  );
  await db.query(
    `INSERT INTO sys_role_perm (entity_id,role,can_select,can_insert,can_update,can_delete)
     VALUES (?,?,1,0,0,0) ON DUPLICATE KEY UPDATE
       can_select=1,can_insert=0,can_update=0,can_delete=0`,
    [eid, 'user']
  );
  console.log('✓ 权限配置完成（admin=增删改查, user=仅查看）');

  // 6. 演示数据
  const [[{ dc }]] = await db.query('SELECT COUNT(*) dc FROM lab_instrument');
  if (+dc === 0) {
    const rows = [
      ['YQ-2023-001', '高效液相色谱仪',   '分析化学实验室一', '张伟', '2023-03-15', '在用',   '安捷伦 1260 Infinity II'],
      ['YQ-2023-002', '紫外可见分光光度计', '分析化学实验室一', '张伟', '2023-03-15', '在用',   '岛津 UV-2600i'],
      ['YQ-2022-014', '立式高压蒸汽灭菌器', '微生物实验室',     '李娜', '2022-11-02', '在用',   '致微 GI54D'],
      ['YQ-2021-007', '高速冷冻离心机',     '分子生物学实验室', '王强', '2021-06-21', '维修中', '艾本德 5810R，待更换转子'],
      ['YQ-2020-003', '电子分析天平',       '天平室',           '李娜', '2020-09-10', '闲置',   '梅特勒 ME204E'],
      ['YQ-2019-011', '电热恒温鼓风干燥箱', '材料实验室',       '陈晨', '2019-04-28', '报废',   '已达使用年限'],
      ['YQ-2024-005', '实时荧光定量PCR仪',  '分子生物学实验室', '王强', '2024-01-19', '在用',   '伯乐 CFX96'],
      ['YQ-2024-006', '超净工作台',         '微生物实验室',     '李娜', '2024-05-08', '在用',   '苏净 SW-CJ-2FD'],
    ];
    await db.query(
      `INSERT INTO lab_instrument (code,name,lab,manager,purchase_date,status,remark) VALUES ?`,
      [rows]
    );
    console.log('✓ 已写入 8 条演示仪器数据');
  }

  await db.end();
  console.log('\n初始化完成。');
}

main().catch(e => { console.error('初始化失败:', e.message); process.exit(1); });
