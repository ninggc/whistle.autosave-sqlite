# whistle.autosave-sqlite
该 whistle 插件主要用于自动保存抓包数据到本地 SQLite 数据库文件。

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
2. 填写 SQLite 数据库文件路径
3. 按需填写过滤条件
4. 启用“自动保存抓包数据”

配置方法参考管理界面里面的说明。

## 存储说明

1. 在配置页填写一个 SQLite 数据库文件路径，例如 `/data/autosave/sessions.sqlite`
2. 如果数据库文件不存在，插件会自动创建
3. 数据库文件所在目录需要提前创建好

插件会自动创建 `sessions` 表，并按批次写入抓包数据。表结构包含以下字段：

- `id`: 自增主键
- `username`: whistle 用户名
- `url`: 请求 URL
- `method`: 请求方法
- `req_id`: 请求 ID
- `status_code`: 响应状态码
- `start_time`: 请求开始时间
- `end_time`: 请求结束时间
- `created_at`: 写入时间戳
- `session_json`: 完整会话 JSON 数据
