# 低代码平台 · 实验仪器档案模块

元数据驱动的轻量低代码平台：业务模块用一份「模块定义文件」描述，建表 DDL、CRUD API、
菜单、列表页、表单、附件管理、角色权限全部由引擎自动生成。

## 快速开始

```bash
cp .env.example .env   # 按需修改 SQL Server 连接
npm start              # http://localhost:3000
```

演示账号：

| 账号 | 密码 | 角色 | 权限 |
|------|------|------|------|
| `admin` | `admin123` | 管理员 | 仪器档案增删改查 + 附件上传/删除 |
| `user`  | `user123`  | 普通用户 | 仅查看、检索、下载附件 |

## 数据库（已建好的 SQL Server 库）

`.env` 中配置（默认连接 `mssql:1433` 的 `LabAssets` 库）：

```
DB_SERVER=mssql        # SQL Server 主机
DB_PORT=1433
DB_NAME=LabAssets      # 已建好的库；账号有权限且库不存在时会自动创建
DB_USER=sa
DB_PASSWORD=***
ALLOW_FALLBACK=true    # 库不可达时降级本地文件演示模式；生产强制用库设 false
```

启动时平台自动完成：`Users` / `Instruments` / `InstrumentAttachments` 建表、
账号与示例仪器种子数据写入。**SQL Server 不可达且 `ALLOW_FALLBACK=true` 时**，
自动降级为本地文件存储（`./data`），接口与功能完全一致，保证随时可演示；
库恢复可达后重启即自动切回 SQL Server。

## 功能清单（仪器档案）

- 菜单「实验资产管理 → 仪器档案」
- 字段：仪器编号（唯一）、名称、实验室（下拉）、负责人、购置日期、状态（在用/维修中/停用/报废，彩色标签）、附件管理
- 列表分页 / 关键字搜索（编号、名称、实验室、负责人）
- 管理员：新增、编辑、删除档案；附件上传（≤20MB）、下载、删除
- 普通用户：只读列表与详情、附件查看下载；所有写操作前端隐藏 + 服务端 403 拦截

## 低代码引擎：如何新增一个模块

复制 `src/modules/instrument.js` 改字段定义（类型支持 `text/select/date/attachment`，
声明 `required/unique/options/search/list/badge/permissions`），
在 `server.js` 的模块注册表加一行即可——无需写任何 API 或页面代码。

## API 一览（均需登录，写操作需 admin）

```
POST /api/auth/login | POST /api/auth/logout | GET /api/auth/me
GET  /api/modules                                  菜单与模块元数据
GET  /api/modules/instruments/records?page=&size=&q=&sort=&order=
GET/POST /api/modules/instruments/records
PUT/DELETE /api/modules/instruments/records/:id
GET/POST /api/modules/instruments/records/:id/attachments
GET/DELETE /api/modules/instruments/attachments/:attId(/download)
```

## 目录结构

```
server.js                 入口：装配数据源、鉴权、模块引擎
src/config.js             .env 加载与配置
src/auth.js               JWT 登录/登出/会话
src/modules/instrument.js 仪器档案模块元数据（低代码核心）
src/engine/crud.js        元数据 → CRUD/附件 REST API
src/engine/validate.js    元数据 → 服务端校验
src/db/mssqlDriver.js     SQL Server 驱动（自动建表+种子数据）
src/db/fileDriver.js      本地文件演示驱动（同一 DAL 接口）
public/                   元数据驱动的前端 SPA
uploads/                  附件存储
data/                     降级模式数据（演示用）
```
