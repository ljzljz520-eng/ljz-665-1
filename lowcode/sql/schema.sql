-- =============================================================
-- 低代码平台 元数据 + 实验仪器档案模块 DDL
-- 目标库: lowcode_platform  (环境实际为 MySQL 8.4 兼容语法)
-- =============================================================
SET NAMES utf8mb4;

-- ---------- 系统用户（admin / user 两级角色） ----------
CREATE TABLE IF NOT EXISTS sys_user (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  username      VARCHAR(64)  NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  real_name     VARCHAR(64)  NOT NULL,
  role          ENUM('admin','user') NOT NULL DEFAULT 'user',
  status        ENUM('enabled','disabled') NOT NULL DEFAULT 'enabled',
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统用户';

-- ---------- 低代码：实体（菜单）元数据 ----------
CREATE TABLE IF NOT EXISTS sys_entity (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  table_name   VARCHAR(64)  NOT NULL UNIQUE COMMENT '物理表名',
  entity_key   VARCHAR(64)  NOT NULL UNIQUE COMMENT '实体标识/路由 key',
  title        VARCHAR(100) NOT NULL COMMENT '菜单显示名',
  icon         VARCHAR(40)  NOT NULL DEFAULT 'table',
  menu_order   INT          NOT NULL DEFAULT 100,
  show_in_menu TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='低代码实体元数据';

-- ---------- 低代码：字段元数据（驱动表单/列表/校验） ----------
CREATE TABLE IF NOT EXISTS sys_field (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  entity_id    BIGINT NOT NULL,
  field_name   VARCHAR(64) NOT NULL COMMENT '物理列名',
  label        VARCHAR(100) NOT NULL COMMENT '中文标签',
  data_type    ENUM('string','text','date','datetime','int','decimal','enum','file') NOT NULL DEFAULT 'string',
  is_required  TINYINT(1) NOT NULL DEFAULT 0,
  max_length   INT NULL,
  options_json JSON NULL COMMENT '枚举可选值',
  show_in_list TINYINT(1) NOT NULL DEFAULT 1,
  show_in_form TINYINT(1) NOT NULL DEFAULT 1,
  searchable   TINYINT(1) NOT NULL DEFAULT 0,
  order_no     INT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_entity_field (entity_id, field_name),
  CONSTRAINT fk_field_entity FOREIGN KEY (entity_id) REFERENCES sys_entity(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='低代码字段元数据';

-- ---------- 低代码：角色级权限（增删改查） ----------
CREATE TABLE IF NOT EXISTS sys_role_perm (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  entity_id  BIGINT NOT NULL,
  role       ENUM('admin','user') NOT NULL,
  can_select TINYINT(1) NOT NULL DEFAULT 1 COMMENT '查',
  can_insert TINYINT(1) NOT NULL DEFAULT 0 COMMENT '增',
  can_update TINYINT(1) NOT NULL DEFAULT 0 COMMENT '改',
  can_delete TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删',
  UNIQUE KEY uk_entity_role (entity_id, role),
  CONSTRAINT fk_perm_entity FOREIGN KEY (entity_id) REFERENCES sys_entity(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='实体角色权限';

-- ---------- 业务表：实验仪器档案 ----------
CREATE TABLE IF NOT EXISTS lab_instrument (
  id             BIGINT PRIMARY KEY AUTO_INCREMENT,
  code           VARCHAR(50)  NOT NULL UNIQUE COMMENT '仪器编号',
  name           VARCHAR(150) NOT NULL COMMENT '仪器名称',
  lab            VARCHAR(100) NOT NULL COMMENT '所在实验室',
  manager        VARCHAR(50)  NOT NULL COMMENT '负责人',
  purchase_date  DATE         NOT NULL COMMENT '购置日期',
  status         ENUM('在用','闲置','维修中','报废') NOT NULL DEFAULT '在用' COMMENT '状态',
  remark         VARCHAR(500) NULL COMMENT '备注',
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_lab (lab),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='实验仪器档案';

-- ---------- 业务表：仪器附件 ----------
CREATE TABLE IF NOT EXISTS lab_instrument_file (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  instrument_id BIGINT NOT NULL,
  file_name     VARCHAR(255) NOT NULL COMMENT '原始文件名',
  stored_name   VARCHAR(255) NOT NULL COMMENT '磁盘存储名',
  mime_type     VARCHAR(150) NULL,
  file_size     BIGINT NOT NULL DEFAULT 0,
  uploaded_by   VARCHAR(64) NOT NULL,
  uploaded_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_inst (instrument_id),
  CONSTRAINT fk_file_inst FOREIGN KEY (instrument_id) REFERENCES lab_instrument(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='仪器附件';
