# 安装指南

## 0. 一键安装并初始化浏览器代理（推荐）

如果目标机器已经安装 `Node.js` / `npm`，可以直接执行：

```bash
curl -fsSL 'https://oss-fx-int.nioint.com/fx/pdd-platform-front/__cdn__/public/setup-all-20260430-1901.sh' | bash -s -- --db "$HOME/whistle/data.sqlite"
```

说明：

- `--db` 用于指定 SQLite 数据库文件路径
- 如果本机缺少 `node` / `npm`，或当前 Node 版本过高，脚本会尝试通过 `brew install node@20` 自动安装并切换到兼容版本
- 脚本会自动安装/启动 `whistle`
- 脚本会自动安装 `whistle.autosave-sqlite`
- 脚本会自动下载 ZeroOmega、导入预设配置并启动受管浏览器 Profile

如果本机也没有 `brew`，请先安装 Homebrew 后再执行上面的命令。

## 1. 安装 whistle

```bash
# 检查是否已安装
w2 -V

# 如果提示 command not found，先安装 whistle
npm i -g whistle
```

> 如果没有安装 Node.js，请先前往 [nodejs.org](https://nodejs.org) 安装 LTS 版本。

## 2. 安装本插件

```bash
npm i -g git+https://github.com/ninggc/whistle.autosave-sqlite.git
```

安装完成后启动 whistle：

```bash
w2 start
```

## 3. 配置本插件

1. 浏览器打开 whistle 管理页面：[http://127.0.0.1:8899](http://127.0.0.1:8899)
2. 点击顶部 **Plugins** 标签页
3. 找到 `autosave-sqlite`，点击进入配置页面
4. 填写 SQLite 数据库文件路径（如 `/home/xxx/.whistle/data.sqlite`）
5. 按需填写过滤条件
6. 启用"自动保存抓包数据"

## 4. 配置浏览器代理（SwitchyOmega）

### 安装 SwitchyOmega

Chrome / Edge 浏览器前往应用商店搜索安装 **SwitchyOmega** 扩展：
- [Chrome 网上应用店](https://chromewebstore.google.com/detail/proxy-switchyomega/padekgcemlokbadohgkifijomclgjgif)
- [Edge 加载项](https://microsoftedge.microsoft.com/addons/detail/proxy-switchyomega/fdbloeknjhaloacmgbknmggjpghpckhc)

> 如果无法访问应用商店，可在 [SwitchyOmega Releases](https://github.com/FelisCatus/SwitchyOmega/releases) 下载 `.crx` 文件手动安装。

### 配置自动切换模式

1. 点击浏览器工具栏的 SwitchyOmega 图标，选择 **选项**

2. 新建一个代理情景模式（命名为 `whistle`）：
   - 代理协议：`HTTP`
   - 代理服务器：`127.0.0.1`
   - 代理端口：`8899`
   - 点击左侧 **应用选项** 保存

3. 切换到 `auto switch` 情景模式，配置规则：
   - **规则列表规则**：按需勾选（如 GFWList），没有外部规则也可以直接使用下面的条件规则
   - **条件规则**：添加需要走代理的域名，例如：
     - `*.example.com` → `whistle`
     - `*.test.com` → `whistle`
   - **默认规则**：设置为 `直接连接`（未匹配的域名不走代理）

4. 点击左侧 **应用选项** 保存

5. 点击 SwitchyOmega 图标，选择 `auto switch` 模式

这样只有你配置的域名会走 whistle 代理，其他网站不受影响。
