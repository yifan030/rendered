# RenderCV Web UI 简历持久化与租户隔离设计

- 日期：2026-08-27
- 状态：已确认（用户审阅通过后进入实现规划）
- 范围：`web_ui/`（FastAPI 后端 + 静态前端）

## 1. 背景与目标

当前 `web_ui` 是一个纯内存的编辑器：FastAPI 后端只提供 render / parse-yaml / serialize-yaml / themes / sample / design 接口，简历 YAML 全部保存在前端 `state.cvs` 里，**刷新即丢**。

目标：加一个轻量数据库，存储每份简历的**草稿 + 版本历史**，并做**极简租户隔离**——不设计登录，服务器用 IP 白名单（防火墙 / Nginx）兜底访问控制，面向 ≤10 人的内部团队。

## 2. 已确认的需求决策

| 问题 | 决策 |
|---|---|
| 存储内容 | **草稿 + 版本历史**：每次显式保存生成一个完整 YAML 快照，可回滚 |
| 租户识别 | **URL / 请求头带用户名**（`X-User` 头，回退 `?user=` 查询参数），服务端信任该标识 |
| 登录 | 不做。身份信任由服务器 IP 白名单保证 |
| 用户规模 | ≤10 人，低并发（每天几十次保存） |

## 3. 方案选型

**选型：SQLite（Python 标准库 `sqlite3`）**

| 方案 | 结论 |
|---|---|
| SQLite + `sqlite3` | ✅ **采用**。单文件、零运维、零配置；WAL 支持并发读 + 串行写；事务保证多语句原子提交；备份 = 复制文件（用 checkpoint 或 backup API） |
| 纯文件存储（每租户一个目录放 YAML 快照） | ❌ 更"朴素"，但原子写、并发写、版本枚举要自己实现，容易出 bug |
| PostgreSQL | ❌ 功能强但重；除非服务器已运行，否则对 10 人规模是过度设计 |

## 4. 数据模型

两张表：

```sql
CREATE TABLE resumes (
    id          TEXT PRIMARY KEY,            -- uuid hex（secrets.token_hex(16)）
    tenant      TEXT NOT NULL,               -- 用户名，来自 X-User 头
    name        TEXT NOT NULL DEFAULT '未命名简历',
    yaml        TEXT NOT NULL,               -- 当前完整 YAML（最新草稿）
    created_at  TEXT NOT NULL,               -- ISO8601 UTC
    updated_at  TEXT NOT NULL
);
CREATE INDEX idx_resumes_tenant ON resumes(tenant);

CREATE TABLE resume_versions (
    id          TEXT PRIMARY KEY,            -- uuid hex
    resume_id   TEXT NOT NULL
                REFERENCES resumes(id) ON DELETE CASCADE,
    tenant      TEXT NOT NULL,               -- 冗余一份，隔离过滤用
    yaml        TEXT NOT NULL,               -- 该版本的完整 YAML 快照
    created_at  TEXT NOT NULL,
    change_note TEXT                         -- 可选：保存时备注
);
CREATE INDEX idx_versions_resume   ON resume_versions(resume_id);
CREATE INDEX idx_versions_tenant   ON resume_versions(tenant);
```

**存完整 YAML 而非结构化字段**的原因：
- YAML 是编辑器的事实来源（`parse-yaml` / `serialize-yaml` 链路）
- schema 无关：设计块、未知字段原样保留，升级不破坏历史数据
- 渲染、解析、回滚都直接消费 YAML 文本，无需重建结构

## 5. 租户隔离（极简）

- FastAPI 依赖 `get_tenant()`：读 `X-User` 请求头，回退到 `?user=` 查询参数；缺失则 `422`。
- 所有 SQL 一律 `WHERE tenant = ?`，参数化传值，**杜绝全局查询**。
- 回滚 / 删除某版本前，必须先按 `tenant` 校验归属（通过 `resume_id` 反向关联 `resumes` 已按租户过滤）。
- 不校验密码。身份信任由服务器 IP 白名单保证，这是"不做登录"的设计前提。

## 6. API 设计

```
GET    /api/cv/list                          列出我的简历
POST   /api/cv                               新建简历 {name, yaml}
GET    /api/cv/{id}                          加载一份简历（当前草稿）
PUT    /api/cv/{id}                          保存草稿（更新 yaml，不产生版本）
POST   /api/cv/{id}/versions                 保存一个版本快照 {change_note?}
GET    /api/cv/{id}/versions                 版本历史列表
POST   /api/cv/{id}/versions/{vid}/restore   回滚到某版本
DELETE /api/cv/{id}                          删除简历（级联删版本）
```

- **快照语义**：`POST versions` 请求体不携带 yaml，快照源 = 该简历的**当前草稿**（`resumes.yaml`）。前端「保存版本」即把编辑器此刻内容固化为快照。
- 新建简历时**同时创建初始版本**（保证"每份简历至少一个版本"的业务一致性）。
- 回滚 = 把该版本 yaml 写回 `resumes.yaml`，并**插入回滚前的当前态快照**（让回滚本身可撤销）。
- 错误：非本人资源返回 `404`（不泄露存在性）；校验失败返回 `422`。

## 7. 保存策略

- **自动保存**：编辑后防抖 ~3 秒 → 只更新 `resumes.yaml`（`PUT /api/cv/{id}`），**不产生版本**。防止刷新丢工作，又不刷屏历史。
- **显式保存版本**：「保存版本」按钮 / Ctrl+S → `POST /api/cv/{id}/versions` 生成快照，可写备注。
- **去重兜底**：快照内容与上一版本完全相同则不写入。

## 8. ACID 事务保证

SQLite 免费提供单事务层面的原子性、隔离性、持久性；一致性的一半与全部"业务规则"由应用层守。要点：

### 原子性 (Atomicity)
- SQLite 用回滚日志 / WAL 保证"要么全写、要么全不写"，崩溃后日志回放恢复旧状态。
- 多语句写必须包进同一事务。两个事务化点：
  - **保存版本**：插入版本快照 + 更新 `resumes.updated_at`
  - **回滚**：写回 `resumes.yaml` + 插入回滚前快照
- 代码写法：`with conn:`（正常→COMMIT，异常→ROLLBACK）。

### 一致性 (Consistency)
- **结构一致性（数据库保证）**：`FOREIGN KEY`、`NOT NULL`、主键；约束违反 → 事务整体中止。
  - ⚠️ **SQLite 外键默认不生效**：必须每个连接执行 `PRAGMA foreign_keys = ON`，否则 `ON DELETE CASCADE` 不生效。
- **业务一致性（应用层保证）**：数据库不懂业务规则。端点负责守住："每份简历至少一个初始版本""回滚前留快照""连续相同内容去重"。

### 隔离性 (Isolation)
- SQLite 单写者模型：写事务天然串行 → 等效 **SERIALIZABLE**，并发写互不可见脏数据。
- `PRAGMA busy_timeout = 5000`：并发写是"等待后重试"而非报错。
- WAL 下读不阻塞写、写不阻塞读。
- 取舍诚实说明：以吞吐换简单，10 人场景完全无感；真到上千并发写才需换库。

### 持久性 (Durability)
- `COMMIT` 返回即已刷日志盘。
- `PRAGMA synchronous`：`NORMAL`（WAL 推荐，快，OS 崩溃可能丢最近几次提交但不损坏文件）vs `FULL`（每次提交 fsync，最稳）。
- 简历场景选 `NORMAL` 可接受（丢一次最近保存可容忍）；想更稳用 `FULL`。
- ⚠️ **备份坑**：WAL 下直接复制 `.db` 文件可能丢未 checkpoint 的最近提交。正确做法：`PRAGMA wal_checkpoint(TRUNCATE)` 后再拷，或使用 Python `conn.backup()` 在线备份。

## 9. 前端接入

- 首次打开弹「你是谁？」输入框 → 存 `localStorage` → 之后所有请求带 `X-User` 头。
- 侧边栏新增：
  - 简历列表（加载 / 新建 / 删除）
  - 「保存版本」按钮（可填备注）
  - 版本历史面板（列表 / 预览 / 回滚）
- `state.cvs`（已支持多份简历）与后端 `/api/cv/list` 双向同步。
- 已有 `API` 常量对象扩展新端点；`fetch` 统一加 `X-User` 头。

## 10. 技术细节

- `web_ui/db.py`：
  - 连接辅助：`PRAGMA journal_mode=WAL`、`PRAGMA foreign_keys=ON`、`PRAGMA busy_timeout=5000`、`synchronous=NORMAL`。
  - 每个请求开/关连接（文件 SQLite 连接很便宜，10 人规模无压力）；写操作走 `with conn:` 事务。
  - 启动时用 `PRAGMA user_version` 做极简迁移（`CREATE TABLE IF NOT EXISTS` + 版本号）。
- 数据文件：`web_ui/data/rendercv.db`（目录启动时自动创建）。
- 时间戳：ISO8601 UTC 字符串，无第三方时间库。

## 11. 文件结构与测试

```
web_ui/
  db.py           # 连接 + 全部 SQL（按租户隔离的参数化查询）
  main.py         # 新增 8 个端点 + get_tenant 依赖
  static/         # app.js / index.html / style.css 前端改动
tests/web_ui/
  test_db.py      # :memory: 库：CRUD / 租户隔离 / 版本 / 回滚 / 级联删除
  test_api.py     # FastAPI TestClient 带 X-User 头测端点
```

测试覆盖与 ACID 对应（可证明保证而非断言）：
- **原子性**：事务中途人为抛异常，断言无半截写入。
- **隔离性**：两线程并发保存，断言最终状态等于两者之一且无异常。
- **约束**：删简历后断言 `resume_versions` 该租户行全部消失（证明 `foreign_keys=ON` 生效）。
- **租户隔离**：租户 A 无法读 / 改 / 删租户 B 的任何简历与版本。

## 12. 非目标

- 不做登录 / 密码 / session / JWT。
- 不做跨租户协作编辑或共享。
- 不做结构化 diff（版本间对比可在前端按需后做）。
- 不引入 ORM / 第三方 DB 依赖（只用标准库 `sqlite3`）。

## 13. 部署说明

- 服务器侧按 IP 白名单放行（防火墙 / Nginx `allow` 列表），Web 应用本身不做身份校验。
- 部署目录需持久化，并定期备份 `web_ui/data/rendercv.db`（用 checkpoint 或 backup API）。
- 若 uvicorn 多 worker，SQLite WAL + busy_timeout 仍可工作，写串行化；10 人规模无需改架构。
