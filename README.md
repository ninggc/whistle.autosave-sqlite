# whistle.autosave-sqlite
该 whistle 插件主要用于自动保存抓包数据到本地 SQLite 数据库文件。

### 安装
1. 该应用是 whistle 插件，需要先安装 whistle：[https://github.com/avwo/whistle](https://github.com/avwo/whistle)
    ```
    npm i -g whistle
    ```
2. 全局安装本插件：
    ```
    npm i -g whistle.autosave-sqlite
    ```
    > 推荐使用镜像：`npm i -g whistle.autosave-sqlite --registry=https://registry.npmmirror.com`
3. 启动 whistle：
    ```
    w2 start
    ```
4. 打开 whistle 管理页面，一般是 [http://127.0.0.1:8899](http://127.0.0.1:8899)
5. 在插件列表中找到 `autosave-sqlite`，进入配置页面：
    ![autosave插件管理界面](https://user-images.githubusercontent.com/11450939/51109605-a9eeb100-1830-11e9-985c-34d1e1b8ee88.gif)

### 本地源码安装到 whistle

如果你要在本地修改这个仓库并立即挂到 whistle 里调试，推荐用 `npm link`：

1. 在项目根目录执行：
    ```bash
    npm install
    npm link
    ```
2. 确保 whistle 已安装并已启动：
    ```bash
    w2 start
    ```
3. whistle 会自动加载全局 link 的 `whistle.*` 插件包；如果插件列表没有立即刷新，可执行：
    ```bash
    w2 restart
    ```
4. 打开 whistle 管理页面，在插件列表中找到 `autosave-sqlite`

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
