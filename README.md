# whistle.autosave-sqlite
该 whistle 插件主要用于自动保存抓包数据到本地 SQLite 数据库文件，并支持为测试流量标记场景与描述，方便后续分析。

### 前置依赖

该应用是 whistle 插件，需要先安装 whistle：

```bash
# 检查是否已安装
w2 -V

# 如果提示 command not found，先安装 whistle
npm i -g whistle
```

### 安装方式

#### 方式 1：从 npm 安装（推荐，已发布到 npm 时使用）

```bash
npm i -g whistle.autosave-sqlite
```
> 国内推荐使用镜像：`npm i -g whistle.autosave-sqlite --registry=https://registry.npmmirror.com`

#### 方式 2：从 Git 仓库安装

```bash
npm i -g git+https://github.com/<用户名>/whistle.autosave-sqlite.git
```

#### 方式 3：离线 tarball 安装

先在已构建好的机器上打包：
```bash
npm pack
# 生成 whistle.autosave-sqlite-0.1.0.tgz
```
将 `.tgz` 文件发送到目标机器，然后安装：
```bash
npm i -g ./whistle.autosave-sqlite-0.1.0.tgz
```

#### 方式 4：复制源码 + npm link（开发协作）

将项目文件夹复制到目标机器，然后：
```bash
cd whistle.autosave-sqlite
npm install
npm link
```

### 启动插件

1. 启动 whistle：
    ```bash
    w2 start
    ```
2. 打开 whistle 管理页面，一般是 [http://127.0.0.1:8899](http://127.0.0.1:8899)
3. 在插件列表中找到 `autosave-sqlite`，进入配置页面：
    ![autosave插件管理界面](https://user-images.githubusercontent.com/11450939/51109605-a9eeb100-1830-11e9-985c-34d1e1b8ee88.gif)

> 如果 whistle 已运行，安装插件后执行 `w2 restart` 刷新插件列表。

### 使用方式

安装完成后：

1. 进入插件配置页
2. 在页面最上方使用“快速切换场景”工具条，按需切换当前测试场景
3. 按需填写当前测试场景和场景描述
4. 填写 SQLite 数据库文件路径
5. 按需设置自动备份阈值（MB）
6. 如需频繁切换场景，可在场景 JSON 配置中维护常用场景列表
7. 按需填写过滤条件
8. 启用“自动保存抓包数据”

配置方法参考管理界面里面的说明。

### 场景配置说明

页面支持直接填写当前生效的场景与描述：

- `当前测试场景`：例如“登录”、“创建”、“编辑”、“删除”
- `当前场景描述`：例如“短信验证码登录”、“创建一条新记录”

如果需要维护多个常用测试场景，可以使用场景 JSON 配置，格式如下：

```json
[
  {"登录": "短信验证码登录"},
  {"创建": "创建一条新记录"},
  {"编辑": "编辑已有记录"},
  {"删除": "删除指定记录"}
]
```

保存后可以在页面最上方的“快速切换场景”工具条中直接选择，并自动回填到“当前测试场景 / 当前场景描述”。切换后会立即自动应用并保存，不需要再单独点击“更新配置”。如果不想手动录入，还可以直接点击页面上的“填充默认示例”按钮快速生成这组默认 JSON。

## 存储说明

1. 在配置页填写一个 SQLite 数据库文件路径，例如 `/data/autosave/sessions.sqlite`
2. 如果数据库文件不存在，插件会自动创建
3. 数据库文件所在目录需要提前创建好
4. 已存在的旧库会在插件启动后自动补齐新增字段
5. 当 SQLite 文件超过“自动备份阈值（MB）”配置时，插件会先把当前文件重命名备份，再自动创建新的同名数据库继续写入
6. 自动备份阈值默认是 `100MB`，可在页面中按需修改

插件会自动创建 `sessions` 主表和 `capture_contexts` 场景上下文表，并按批次写入抓包数据。页面上保存的场景/描述等配置会先落到 `capture_contexts`，`sessions` 再通过 `context_id` 进行关联。

`sessions` 表包含以下字段：

- `id`: 自增主键
- `username`: whistle 用户名
- `scene`: 当前测试场景
- `description`: 当前场景描述
- `context_id`: 关联的场景上下文 ID
- `url`: 请求 URL
- `method`: 请求方法
- `req_id`: 请求 ID
- `status_code`: 响应状态码
- `start_time`: 请求开始时间
- `end_time`: 请求结束时间
- `created_at`: 写入时间戳
- `session_json`: 完整会话 JSON 数据

另外，`capture_contexts` 会保存页面上的场景信息快照，包含 `scene`、`description`、`scene_mappings_json`、`filter_text`、`database_path`、`max_db_size_mb` 等字段。

当数据库触发备份时，原文件会被重命名为类似 `sessions.20260430-153000.bak.sqlite` 的文件名，新的抓包数据会继续写入原始配置路径对应的新 SQLite 文件；备份文件中的 `sessions` 与 `capture_contexts` 关联关系会完整保留，新文件也会自动补写当前正在使用的场景上下文。
