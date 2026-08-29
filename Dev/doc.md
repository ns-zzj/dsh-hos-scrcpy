# Dev/ 目录说明 —— sidecar 源码 + 独立测试环境

> 本文档面向二次开发。`Dev/` 存放的是整套投屏链路中**最底层的一环**：
> Java sidecar 桥接程序（`src/Main.java`）的源码，以及**不依赖 DSH** 的独立测试页（`demo/`）。
> 注意：**DSH 插件本体（Host / Client 半区）不在这里**，分别在 `lib/index.js`（Host 半区）和 `client/client.js`（Client 半区）。

## 1. 目录总览

```
Dev/
├── doc.md              # 本文档
├── src/
│   └── Main.java       # sidecar 主程序源码（手写源码，单文件，约 800 行）
└── demo/               # 独立测试环境（浏览器直接打开，不依赖 DSH）
    ├── index.html      # 测试页：连 sidecar → 看画面 → 触控/按键/日志
    └── jmuxer.min.js   # H.264 网页解码库（MSE 封装），页面直接 <script> 引用
```

### 与仓库其他目录的关系

```
Dev/src/Main.java  ──javac 编译──▶  resources/out/                （插件运行时用）
Dev/demo/jmuxer.min.js ──复制──▶  resources/jmuxer.min.js
                                  （两处副本 MD5 一致，改一处必须同步另一处）
```

- SDK jar 位于 `resources/hosScrcpy-1.0.18-beta.jar`（编译期和运行期都要用，无需从 Dev 复制）。

## 2. Dev/src/Main.java —— sidecar 桥接程序

### 2.1 职责与数据流

sidecar 是手机与浏览器之间的桥：

```
鸿蒙手机 ◀──hdc 连接──▶ Java sidecar（Main） ◀──WebSocket(127.0.0.1)──▶ 浏览器
                          │ 广播 H.264 二进制帧（视频）
                          │ 接收 JSON 控制命令（触控/按键/shell/hilog）
                          └─ stdout 输出一行就绪信息 {"ready":true,"port":N}
```

DSH 插件（Host 半区）负责 `spawn` 拉起 sidecar，解析就绪行拿到随机端口，
再把端口交给浏览器 Client；浏览器**直接**与 sidecar 建立 WebSocket（不经 Host）。

### 2.2 命令行参数

| 参数 | 默认值 | 说明 |
|---|---|---|
| `--sn <sn\|auto>` | auto | 设备序列号；为空或 auto 时用 `hdc list targets` 自动发现唯一设备 |
| `--hdc <path>` | `hdc` | hdc 可执行文件路径 |
| `--port <n>` | `0` | WebSocket 监听端口，0 = 随机端口（DSH 插件即用随机端口） |
| `--scale <n>` | `2` | 视频缩放系数（SDK 侧降采样） |
| `--ip <ip>` | `127.0.0.1` | 设备连接地址（默认本机 hdc 回环；勿改） |
| `--selftest` | 关 | 自检模式：只启动 WS 服务、只响应 `ping`，不连设备 |

### 2.3 WebSocket 协议（RFC 6455 子集）

- **二进制帧** = 设备 H.264 视频流原始字节，广播给所有已连接客户端。
- **文本帧** = JSON 控制命令（客户端 → sidecar）：
  - `{"type":"touch","event":"down|move|up","x":<设备坐标>,"y":<设备坐标>}`
  - `{"type":"key","name":"power|back|home|volumeUp|volumeDown"}`
  - `{"type":"shell","cmd":"..."}`（受命令白名单限制）
  - `{"type":"screen","mode":"video|image|stop"}`
  - `{"type":"layout"}`（返回 UI 布局 XML）、`{"type":"log","on":true|false}`、`{"type":"size"}`、`{"type":"ping"}`
- **文本帧响应**（sidecar → 客户端，广播）：`{"ok":true,"msg":"...","data":"..."}` 或 `{"ok":false,"error":"..."}`；
  hilog 行以 `{"ok":true,"msg":"log","data":"<日志行>"}` 广播。
- **就绪协议**：设备连接成功后 stdout 输出 `{"ready":true,"port":<ws端口>,"selftest":false}`，
  DSH Host 解析这行获取端口。**连接失败会先输出错误并 `System.exit(3)`，不会输出 ready 行。**

### 2.4 关键实现要点（二次开发必读）

1. **自实现 WebSocket 服务端**（`WsServer`/`WsClient` 内部类）：
   - 只实现 RFC 6455 子集：text(0x1) / binary(0x2) / close(0x8) / ping-pong(0x9-0xA)，**不支持分片**（收到非 FIN 直接断开）。
   - 只监听 `127.0.0.1` 回环（安全边界，勿改成 0.0.0.0）。
2. **`sendFrame` 必须 `synchronized`**：视频帧线程（SDK gRPC 回调）与控制响应线程会并发写同一 socket，
   不加锁会导致帧字节交错损坏、浏览器解析失败。这是踩过的坑，改并发逻辑时不要破坏它。
3. **帧长编码用 `long` 移位**：超过 31 位用 `int` 移位会取低 5 位导致长度错误（代码中有注释）。
4. **shell 命令白名单** `SHELL_ALLOW_PREFIX`：只允许 `hilog / power-shell / uinput / uitest /
   snapshot_display / ls / ps / df / cat /data/local/tmp / param get / hidumper` 前缀；新增命令类型必须同时加白名单。
5. **按键键码**（`keyToShell`，以 DevEco SDK `oh_key_code.h` 为准，通过 `uinput -K -d <码> -u <码>` 注入）：
   `HOME=1`、`BACK=2`、`VOLUME_UP=16`、`VOLUME_DOWN=17`、`POWER=18`。文本输入未内置（系统输入法注入延迟高）。
6. **`cleanupFportRules()`**：SDK 多次部署后设备端残留大量 `fport` 转发规则（`uitest_socket` /
   `scrcpy_grpc_socket`），新随机端口会撞上残留规则导致 socket 连到错误通道（视频乱码）。
   连接后首次开流前会先 `hdc fport ls` 清一遍残留规则——这是排查"画面乱码/黑屏"的第一嫌疑点。
7. **hilog 用持续子进程**（`hdc shell hilog`）而非 SDK 同步调用，读取线程限速**每秒 60 行**防刷爆 WS。
8. **静止画面不推帧**：SDK 只在画面变化时回调 `onData`，所以"连接成功但一帧没到/长时间没更新"是正常的，
   前端提示用户滑动手机即可（这是已知行为，不是 bug）。
9. **新客户端加入不自动重启视频流**：`onClientCountChanged` 只在 0→1 时保证"流在跑"，
   不再调 `restartVideo()`（会 `stopCaptureScreen` 关闭 uitest 控制通道且拖慢体验）；
   中途加入缺 I 帧的问题由前端"请持续滑动手机更新画面"提示兜底。
10. **`--scale` 只缩小视频流**：触控坐标必须按**设备原始分辨率**（`size` 命令获取）换算，不能用视频流分辨率。
11. 诊断日志统一带 `[bridge]` / `[ws]` 前缀打到 stdout；每 2 秒打印一次帧统计（帧数/字节数/客户端数）；
    前 3 帧打印头部 12 字节十六进制（用于判断 H.264 封装格式）。

### 2.5 编译与同步

源码依赖 `com.huawei.hosscrcpy.api.*`（SDK jar）和 `com.google.gson.*`（SDK jar 自带）。改完 `Main.java` 后：

```bash
javac -encoding UTF-8 -cp "resources/hosScrcpy-1.0.18-beta.jar" -d resources/out Dev/src/Main.java
```

> ⚠️ `resources/out/` 是编译产物，改源码后必须重新编译。

## 3. Dev/demo/index.html —— 独立测试页

### 3.1 用途与启动

不依赖 DSH，浏览器直接连 sidecar，用来**快速验证 sidecar 改动**（改完先在这里验，再进 DSH 验）：

```bash
# 1. 启动 sidecar（--port 18999 与页面写死的地址一致；不指定则是随机端口）
java -cp "<SDK jar路径>;<out目录>" Main --hdc "<hdc路径>" --port 18999

# 2. 浏览器打开 Dev/demo/index.html，点「连接」
```

> 页面里 WebSocket 地址**写死** `ws://127.0.0.1:18999/`，改端口要同步改这里。

### 3.2 页面功能

| 功能 | 说明 |
|---|---|
| 连接 / 停止 | 连接时自动发 `size`（取设备分辨率）和 `screen video`（开流） |
| 视频播放 | `JMuxer`（`mode:'video'`，`flushingTime:0`，`fps:60`，`debug:true`）把 H.264 帧喂给 MSE |
| 鼠标触控 | 点击/拖动 = 手机触摸；**坐标换算**：先去掉黑边（letterbox），再用设备原始分辨率换算（见下） |
| 触屏支持 | `touchstart/touchmove/touchend` 同样走换算 |
| 键盘按键 | `Backspace`=返回、`Home`=主页、`F1`=电源、`F2`=音量+、`F3`=音量- |
| 日志面板 | 文本帧（含 hilog、响应）全部上屏；右侧滚动查看 |
| 状态轮询 | 每 2 秒：无帧→"请持续滑动手机更新画面"；静止 ≥5 秒→"画面静止"提示；正常→帧数/MB 统计 |
| 诊断 | video 各事件（loadedmetadata/error 等）、首帧长度与头 12 字节 hex、readyState/paused/videoWidth |

### 3.3 坐标换算逻辑（改触控必看）

```
设备原始分辨率 d（size 命令返回） ≠ 视频流分辨率（被 --scale 缩小） ≠ 页面显示尺寸
换算步骤：
1. sx = 鼠标x - 视频元素left；sy = 鼠标y - 视频元素top
2. scale = min(元素宽/视频宽, 元素高/视频高)，得到实际绘制区 drawW/drawH 与黑边偏移 offX/offY
3. px = floor((sx - offX) * d.w / drawW)；py 同理
4. clamp 到 [0, d.w-1] / [0, d.h-1] —— 保证越界拖动时的 up 也能送达（否则手机一直处于触摸状态）
```

### 3.4 常见调试手段

- 连接后无画面：看日志面板里 sidecar 的 `[bridge]` 输出（帧统计/首帧 hex）；
- 视频乱码/黑屏：`hdc -s <ip:8710> -t <sn> fport ls` 查残留转发规则，重启 sidecar 触发清理；
- 只验证 WS 服务本身：`java ... Main --selftest`，页面连接后发 `ping` 应收到 `pong`。

## 4. Dev/demo/jmuxer.min.js

- H.264 → 浏览器 MSE 的解码封装库（第三方，**勿手改**）。
- 两处副本同源（`Dev/demo/jmuxer.min.js`、`resources/jmuxer.min.js`，MD5 一致），
  升级库时两处一起替换。
- 插件内传递路径：Host 半区读副本内容 → `jmuxer:source` RPC 返回源码 → Client 半区注入页面执行。

## 5. 二次开发工作流（按改动类型）

| 要改什么 | 位置 | 流程 |
|---|---|---|
| sidecar 行为（协议/命令/流控制） | `Dev/src/Main.java` | 改源码 → 编译同步到 `resources/out/` → 用 demo 页独立验证 → 再在 DSH 里验证 → 重新 `npm pack` |
| 协议格式 | `Main.java` + `demo/index.html` + 插件 `client.js` | 三处协议必须同步改（sidecar 收发、测试页收发、插件 Client 收发） |
| 前端交互/UI | 插件 `client/client.js` | 只改插件，不用动 Dev |
| 测试页本身 | `Dev/demo/index.html` | 直接改，浏览器刷新即生效 |

### 排查速查表

| 现象 | 排查方向 |
|---|---|
| sidecar 起不来 | Host 日志看 Java/hdc 路径；手动跑 `java -cp ... Main --sn <sn> --hdc <path>` 看 stderr |
| 连上但无帧 | 静止画面正常；请滑动手机；看 `[bridge]` 是否打印 `stream ready` |
| 视频乱码 | fport 残留规则；重启 sidecar；看首帧 hex 是否以 `00 00 00 01`（annexb）开头 |
| 触控位置偏移 | 确认按设备原始分辨率换算（demo 3.3）；确认 `--scale` 只影响视频流 |
| hilog 不滚动 | 限速每秒 60 行（高频时丢弃）；确认 `log` 命令已发、`[bridge] hilog started` 已打印 |

## 6. 相关链接

- 根目录 `README.md`：插件安装/使用/架构总览（含 mermaid 架构图）
- 官方参考项目 [HOScrcpy](https://gitcode.com/OpenHarmonyToolkitsPlaza/HOScrcpy)（MIT 协议）
