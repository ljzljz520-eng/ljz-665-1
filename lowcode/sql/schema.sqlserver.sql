/* =============================================================
 * 低代码平台 + 实验仪器档案模块 —— SQL Server (T-SQL) 版本
 * 适用于"已建好的 SQL Server 库"。在目标库中直接执行本脚本即可。
 * 应用侧切换 SQL Server：npm i mssql，将 config/db.js 换为 mssql 连接池，
 * 并把 services/crud.js 中的分页/占位符改为 T-SQL 语法（OFFSET/FETCH、@p0）。
 * ============================================================= */

/* ---------- 系统用户 ---------- */
IF OBJECT_ID('dbo.sys_user', 'U') IS NULL
CREATE TABLE dbo.sys_user (
  id            BIGINT IDENTITY(1,1) PRIMARY KEY,
  username      NVARCHAR(64)  NOT NULL UNIQUE,
  password_hash VARCHAR(64)   NOT NULL,          -- sha256 hex
  real_name     NVARCHAR(64)  NOT NULL,
  role          NVARCHAR(10)  NOT NULL DEFAULT N'user'
                CHECK (role IN (N'admin', N'user')),
  status        NVARCHAR(10)  NOT NULL DEFAULT N'enabled'
                CHECK (status IN (N'enabled', N'disabled')),
  created_at    DATETIME2(3)  NOT NULL DEFAULT SYSDATETIME()
);
GO

/* ---------- 低代码：实体（菜单）元数据 ---------- */
IF OBJECT_ID('dbo.sys_entity', 'U') IS NULL
CREATE TABLE dbo.sys_entity (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  table_name   NVARCHAR(64)  NOT NULL UNIQUE,
  entity_key   NVARCHAR(64)  NOT NULL UNIQUE,
  title        NVARCHAR(100) NOT NULL,
  icon         NVARCHAR(40)  NOT NULL DEFAULT N'table',
  menu_order   INT           NOT NULL DEFAULT 100,
  show_in_menu BIT           NOT NULL DEFAULT 1,
  created_at   DATETIME2(3)  NOT NULL DEFAULT SYSDATETIME()
);
GO

/* ---------- 低代码：字段元数据 ---------- */
IF OBJECT_ID('dbo.sys_field', 'U') IS NULL
CREATE TABLE dbo.sys_field (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  entity_id    BIGINT NOT NULL REFERENCES dbo.sys_entity(id) ON DELETE CASCADE,
  field_name   NVARCHAR(64) NOT NULL,
  label        NVARCHAR(100) NOT NULL,
  data_type    NVARCHAR(20) NOT NULL DEFAULT N'string'
               CHECK (data_type IN (N'string',N'text',N'date',N'datetime',N'int',N'decimal',N'enum',N'file')),
  is_required  BIT NOT NULL DEFAULT 0,
  max_length   INT NULL,
  options_json NVARCHAR(MAX) NULL,               -- 如 ["在用","闲置","维修中","报废"]
  show_in_list BIT NOT NULL DEFAULT 1,
  show_in_form BIT NOT NULL DEFAULT 1,
  searchable   BIT NOT NULL DEFAULT 0,
  order_no     INT NOT NULL DEFAULT 0,
  CONSTRAINT uk_entity_field UNIQUE (entity_id, field_name)
);
GO

/* ---------- 低代码：角色权限（增删改查） ---------- */
IF OBJECT_ID('dbo.sys_role_perm', 'U') IS NULL
CREATE TABLE dbo.sys_role_perm (
  id         BIGINT IDENTITY(1,1) PRIMARY KEY,
  entity_id  BIGINT NOT NULL REFERENCES dbo.sys_entity(id) ON DELETE CASCADE,
  role       NVARCHAR(10) NOT NULL CHECK (role IN (N'admin',N'user')),
  can_select BIT NOT NULL DEFAULT 1,
  can_insert BIT NOT NULL DEFAULT 0,
  can_update BIT NOT NULL DEFAULT 0,
  can_delete BIT NOT NULL DEFAULT 0,
  CONSTRAINT uk_entity_role UNIQUE (entity_id, role)
);
GO

/* ---------- 业务表：实验仪器档案 ---------- */
IF OBJECT_ID('dbo.lab_instrument', 'U') IS NULL
CREATE TABLE dbo.lab_instrument (
  id             BIGINT IDENTITY(1,1) PRIMARY KEY,
  code           NVARCHAR(50)  NOT NULL UNIQUE,    -- 仪器编号
  name           NVARCHAR(150) NOT NULL,          -- 仪器名称
  lab            NVARCHAR(100) NOT NULL,          -- 所在实验室
  manager        NVARCHAR(50)  NOT NULL,          -- 负责人
  purchase_date  DATE           NOT NULL,         -- 购置日期
  status         NVARCHAR(10)   NOT NULL DEFAULT N'在用'
                 CHECK (status IN (N'在用',N'闲置',N'维修中',N'报废')),
  remark         NVARCHAR(500) NULL,
  created_at     DATETIME2(3)   NOT NULL DEFAULT SYSDATETIME(),
  updated_at     DATETIME2(3)   NOT NULL DEFAULT SYSDATETIME()
);
CREATE INDEX IX_lab_instrument_lab     ON dbo.lab_instrument(lab);
CREATE INDEX IX_lab_instrument_status  ON dbo.lab_instrument(status);
GO

/* ---------- 业务表：仪器附件（元数据；文件体可换成 VARBINARY(MAX) 或对象存储） ---------- */
IF OBJECT_ID('dbo.lab_instrument_file', 'U') IS NULL
CREATE TABLE dbo.lab_instrument_file (
  id            BIGINT IDENTITY(1,1) PRIMARY KEY,
  instrument_id BIGINT NOT NULL REFERENCES dbo.lab_instrument(id) ON DELETE CASCADE,
  file_name     NVARCHAR(255) NOT NULL,
  stored_name   NVARCHAR(255) NOT NULL,
  mime_type     NVARCHAR(150) NULL,
  file_size     BIGINT NOT NULL DEFAULT 0,
  uploaded_by   NVARCHAR(64) NOT NULL,
  uploaded_at   DATETIME2(3) NOT NULL DEFAULT SYSDATETIME()
);
CREATE INDEX IX_lab_file_inst ON dbo.lab_instrument_file(instrument_id);
GO

/* =============================================================
 * 初始化数据（密码哈希：sha256('lowcode::' + 明文)）
 *   admin / admin123 、 user / user123
 * ============================================================= */
IF NOT EXISTS (SELECT 1 FROM dbo.sys_user WHERE username = N'admin')
INSERT dbo.sys_user (username,password_hash,real_name,role) VALUES
 (N'admin', CONVERT(VARCHAR(64), HASHBYTES('SHA2_256','lowcode::admin123'),2), N'系统管理员', N'admin'),
 (N'user',  CONVERT(VARCHAR(64), HASHBYTES('SHA2_256','lowcode::user123'), 2), N'普通用户',   N'user');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.sys_entity WHERE entity_key = N'lab-instrument')
INSERT dbo.sys_entity (table_name,entity_key,title,icon,menu_order,show_in_menu)
VALUES (N'lab_instrument',N'lab-instrument',N'实验仪器档案',N'flask',10,1);
GO

DECLARE @eid BIGINT = (SELECT id FROM dbo.sys_entity WHERE entity_key = N'lab-instrument');

MERGE dbo.sys_field AS t USING (VALUES
 (N'code',          N'仪器编号', N'string',1,50,  NULL,                                      1,1,1,10),
 (N'name',          N'仪器名称', N'string',1,150, NULL,                                      1,1,1,20),
 (N'lab',           N'实验室',   N'string',1,100, NULL,                                      1,1,1,30),
 (N'manager',       N'负责人',   N'string',1,50,  NULL,                                      1,1,1,40),
 (N'purchase_date', N'购置日期', N'date',  1,NULL,NULL,                                      1,1,0,50),
 (N'status',        N'状态',     N'enum',  1,NULL, N'["在用","闲置","维修中","报废"]',        1,1,1,60),
 (N'remark',        N'备注',     N'text',  0,500, NULL,                                      0,1,0,70)
) AS s(field_name,label,data_type,is_required,max_length,options_json,show_in_list,show_in_form,searchable,order_no)
ON t.entity_id = @eid AND t.field_name = s.field_name
WHEN NOT MATCHED THEN
 INSERT (entity_id,field_name,label,data_type,is_required,max_length,options_json,show_in_list,show_in_form,searchable,order_no)
 VALUES (@eid,s.field_name,s.label,s.data_type,s.is_required,s.max_length,s.options_json,s.show_in_list,s.show_in_form,s.searchable,s.order_no);
GO

/* 权限：管理员全量 CRUD；普通用户只读 */
DECLARE @eid2 BIGINT = (SELECT id FROM dbo.sys_entity WHERE entity_key = N'lab-instrument');
MERGE dbo.sys_role_perm AS t USING (VALUES
 (N'admin',1,1,1,1),
 (N'user', 1,0,0,0)
) AS s(role,can_select,can_insert,can_update,can_delete)
ON t.entity_id = @eid2 AND t.role = s.role
WHEN NOT MATCHED THEN
 INSERT (entity_id,role,can_select,can_insert,can_update,can_delete)
 VALUES (@eid2,s.role,s.can_select,s.can_insert,s.can_update,s.can_delete);
GO
