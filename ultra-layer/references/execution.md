# 执行指南

## 依赖

使用环境已提供的 Node、Playwright、sharp 和 Chrome。若这些库不在默认模块搜索路径，可设置任务变量 `BOARD_NODE_MODULES` 指向其 node_modules；不要硬编码某台机器的用户名。先发现依赖位置再配置。`BOARD_CHROME` 可指定 Chrome 可执行文件，否则使用 Playwright 自带 Chromium。

字体检查脚本只用 Python 标准库，支持普通 TTF/OTF，不支持 TTC 字体集合。

## 项目配置

将 web-shell 的 index.html / copy.js 复制到独立输出目录。创建本次海报的 board.html、相关 CSS、素材和 fonts 文件夹。配置示例：

```json
{
  "title": "课程海报",
  "width": 750,
  "height": 1056,
  "page": "board.html",
  "selector": "#artboard",
  "copyPage": "index.html",
  "copyButton": "#copy-board",
  "fontFamily": "Alibaba PuHuiTi",
  "transparentAssets": ["assets/header-transparent.png", "assets/trophy-transparent.png"],
  "requiredTexts": ["第一课", "最终收获"],
  "expectedImageCount": 6,
  "sourceFiles": ["board.html", "board.css", "fonts.css", "assets", "fonts"]
}
```

以上数值仅演示格式。按当前海报设定；不要强制每张海报使用这两个透明素材、相同尺寸或相同节点数。fontFamily 和 expectedImageCount 可省略；requiredTexts / transparentAssets 可以为空数组。sourceFiles 必须包含 page 及页面引用的 CSS/脚本、字体、图片；目录会递归计算指纹，勿把输出目录本身加入其中。

## 获取官方捕获脚本

在项目 vendor/ 中保存官方来源：

```sh
curl -L 'https://mcp.figma.com/mcp/html-to-design/capture.js' -o vendor/capture.js
```

不从未知来源安装浏览器扩展。本技能未捆绑第三方捕获脚本或字体。官方接口行为可能改变，遇到不兼容应检查当前官方脚本与报错。

## 执行顺序

在项目目录运行本地服务器，端口用空闲值，例如：

```sh
python3 -m http.server 8134 --bind 127.0.0.1
```

在另一终端运行以下脚本，将路径替换为实际值：

```sh
node /path/to/skill/scripts/capture-board.cjs /path/to/project/board-config.json http://127.0.0.1:8134 /path/to/project/vendor/capture.js
node /path/to/skill/scripts/verify-board.cjs /path/to/project/board-config.json
python3 /path/to/skill/scripts/inspect_font.py /path/to/font.ttf
```

捕获脚本只访问 loopback 服务，在独立浏览器上下文测试剪贴板。浏览器启动、网络获取、写入技能安装目录仍须遵守当前环境权限，不能为避开审批而改换操作机制。

## 输出及判断

- `figma-clipboard.html`：供按钮写入的官方 H2D HTML 数据。
- `capture-report.json`：尺寸、文字/图片数量、字体、透明素材检查、源文件哈希。
- `board-preview.png`：捕获前的画板截图。配置 copyPage 后还会实际测试两次按钮复制并保存 web-preview.png。
- `verify-board.cjs`：验证源文件哈希、payload 哈希和内容。它不会检查 Figma 实际转换后的视觉效果。

只读 PNG Alpha 的最小/最大值仍不够：需要肉眼检查透明区域是否正确。图片全部不透明、全透明或带烘焙棋盘格都不能当作完成。

最终生成网页文件包时包含 HTML/CSS/JS、当前剪贴板、素材、配置及必要字体（确认可分发）；不包含机器绝对路径、测试浏览器数据或失效的旧版剪贴板。
