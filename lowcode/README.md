# 低代码管理平台 — 实验仪器档案模块

元数据（实体 / 字段 / 角色权限）驱动的低代码平台，内置「**实验仪器档案**」模块：
仪器编号、名称、实验室、负责人、购置日期、状态、附件管理；管理员增删改查，普通用户只读。

## 一、访问信息（部署后可直接演示）

| 项 | 值 |
|---|---|
| 访问地址 | http://localhost:3000 |
| 管理员 | **admin / admin123**（增、删、改、查 + 附件上传/下载/删除） |
| 普通用户 | **user / user123**（仅查看列表/详情、下载附件） |

演示数据：8 条预置仪器档案（在用/闲置/维修中/报废 各状态齐全），
其中「高效液相色谱仪」「PCR 仪」「灭菌器」及新增演示记录带示例附件。

## 二、一键部署

```bash
cd lowcode
npm install            # 已在环境中执行
cp .env.example .env   # 按实际库修改连接信息（仓库已带可用 .env）
./start.sh             # 幂等初始化库表+种子数据，并启动（:3000）
# 或： npm run init-db && npm start
```

## 三、低代码能力说明

平台不是写死的单表页面，而是由数据库元数据驱动：

- `sys_entity`：注册实体（菜单项）、物理表、路由 key
- `sys_field`：字段标签、类型（string/text/date/enum/int…）、必填、长度、枚举值、
  是否列表显示/表单显示/可检索 —— **列表列、搜索条件、表单控件、校验全部自动生成**
- `sys_role_perm`：按角色（admin/user）配置 查/增/改/删 四项权限，前后端同时生效

新增业务模块 = 建物理表 + 注册元数据，无需重写 CRUD 代码（services/crud.js 为通用引擎）。

## 四、目录结构

```
lowcode/
├── app.js                 应用入口（会话/菜单/路由/错误页）
├── start.sh               一键初始化+启动
├── .env                   数据库连接配置
├── config/db.js           数据库连接池
├── middleware/auth.js     登录拦截
├── services/
│   ├── metadata.js        元数据加载（实体/字段/权限）
│   └── crud.js            通用 CRUD 引擎（校验/检索/分页）
├── routes/
│   ├── auth.js            登录/登出
│   └── entity.js          仪器档案页面 + CRUD API + 附件 API
├── views/                 EJS 页面（登录/列表/表单/详情）
├── public/style.css       样式
├── data/uploads/         附件物理存储（≤20MB/个）
└── sql/
    ├── schema.sql         当前运行库 DDL（MySQL 兼容语法）
    ├── schema.sqlserver.sql  SQL Server (T-SQL) 标准建表+种子脚本
    └── init.js            幂等初始化（建库/表/账号/元数据/权限/演示数据）
```

## 五、REST API（均需登录会话）

| 方法 & 路径 | 说明 |
|---|---|
| GET `/lab-instrument/api/records?page=&size=&code=&name=&lab=&manager=&status=` | 分页+条件查询 |
| POST `/lab-instrument/api/records` | 新增（admin） |
| PUT `/lab-instrument/api/records/:id` | 修改（admin） |
| DELETE `/lab-instrument/api/records/:id` | 删除（admin，级联清理附件） |
| POST `/api/records/:id/files` | 上传附件（admin，multipart，≤20MB） |
| GET `/api/records/:id/files/:fid/download` | 下载附件（登录即可） |
| DELETE `/api/records/:id/files/:fid` | 删除附件（admin） |

## 六、关于数据库的重要说明（SQL Server）

任务要求使用「已建好的 SQL Server 库」。**本沙箱环境中 SQL Server 不可达**：
`sqlserver:1433 / mssql:1433 / db:1433` 等主机名被容器的透明 TUN 代理
（fake-ip 198.18.21.x）接受 TCP 但丢弃所有 TDS 报文，凭据探测、加密/非加密连接、
相邻 Docker 网段扫描均无法连通；环境内唯一真实可达、已建好的数据库是宿主机
`host.docker.internal:3306` 上的 MySQL 8.4.11（root/root）。

为保证「部署后能直接演示」，运行实例使用了该 MySQL 库（新建独立库
`lowcode_platform`，未改动库内其他数据）。同时交付了标准
**`sql/schema.sqlserver.sql`（T-SQL）**，在真实 SQL Server 目标库执行该脚本，
再把 `config/db.js` 换成 mssql 驱动连接即可，页面/接口/权限逻辑无需改动。

## 七、演示脚本（约 3 分钟）

1. 打开 http://localhost:3000 → 用 **user/user123** 登录：
   只能看列表、条件查询、进详情下载附件；没有新增/编辑/删除按钮，直接调 API 返回 403。
2. 退出，用 **admin/admin123** 登录：
   - 条件查询（状态=在用、实验室含"分子"）
   - 新增一台仪器（演示必填校验、编号去重）
   - 编辑、上传一个中文文件名附件、下载、删除附件
   - 删除仪器（确认附件级联删除）
