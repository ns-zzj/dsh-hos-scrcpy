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
| `--scale <n>` | `2` | 视频缩放系数（SDK 侧降采样：**宽高各除以 n**，上限 5） |
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
12. **开流必须互斥且只能启动一次（踩过的坑，改并发逻辑时不要破坏）**：
    浏览器一连上 WS 就有两条路同时开流——`WsServer` 的 0→1 自动开流（`onClientCountChanged`）
    与客户端显式发的 `{"type":"screen","mode":"video"}`。而 `capturing` 只能在 `startCaptureScreen()`
    返回后才置位（真机无线实测要 3~4 秒），这段时间里两个线程都会以为"没人开流"，
    于是各自 `stopCaptureScreen()` + `startCaptureScreen()` 一次，后一次会打断前一次刚起的抓屏线程。
    实测现象：stdout 连续两行 `[bridge] video capture started`，并收到
    `stream error: java.lang.InterruptedException: sleep interrupted`，随后 `stream ready (video)`
    照常回调但**永远 0 帧** → 前端一直停在"连接中……（请持续滑动手机更新画面）"。
    这也解释了"有线没问题、无线黑屏"：有线时设备端无需部署，自动开流瞬间完成，
    命令到达时 `capturing` 已为 true，只启动一次。
    修法：`capLock` + `starting` 标志（见 `startVideo()` / `startImage()` / `stop()`），
    `stop()` 在 `starting` 期间直接返回。
13. **`screen` 命令异步执行**：开流/停流是阻塞调用（真机无线实测 3~4 秒），
    不能在 WS 读取线程里同步跑，否则这段时间内的触控/按键/日志命令全部排队。
    改用 `runAsync()` 派发到 `ctl-async` 线程后再回响应。
14. **看门狗 `watchStream()`**：SDK 偶发"`stream ready` 之后 15 秒一帧都不来"
    （实测真机无线遇到过：设备端日志停在 `start startUiTestServer end` 之后短暂停滞）。
    规则只看"本次开流后一帧都没到"——画面静止时 SDK 本来就不推帧，那种情况 `frameCount` 早就不为 0，
    不会误判。最多自动重试 3 次。**重试后能否救回画面未验证**（实测中没等到它触发，进程就被脚本杀掉了）。
15. **模拟器（emulator）不支持视频流投屏**：SDK 把 `libscreen_casting.z.so` 推到 `/data/local/tmp` 后，
    会依次尝试 `libscrcpy_server_unix_6.6-20260629 / 6.6-20260418 / 6.5-20260313 / 6.4-20260113`，
    四个全部失败，回调收到 `java.lang.RuntimeException: can not find scrcpy pid`，一帧都没有。
    设备端日志里有 `check cloud device resource result :/system/lib64/libCPHMediaEngine.z.so: cannot open`
    （华为媒体引擎库在模拟器上不存在）。这是设备/ROM 限制，不是插件问题。
16. **这条流整场只有一个关键帧（实测数据，改前端渲染逻辑前必读）**：
    用 `Temp/nal.js` 统计真机抓流（12 秒 / 3.7 MB）得到 —— `SPS×1  PPS×1  IDR×1  P 帧×160`，
    且 SPS+PPS 挤在第一段 AU（32 字节）里，之后**再也不会重发参数集或关键帧**。
    后果：任何"新起的解码器"（刷新页面、切走标签页再切回来、第二个浏览器窗口）都拿不到
    SPS/PPS 与 I 帧，只能一直黑屏——**后续 P 帧再多也没用**。
    两条应对，缺一不可：
    - **前端**：投屏画面挂在常驻的 header 组件（`DevicePanel`）里，不放在标签页 body 里。
      dockkit 的 `paneBody` 只渲染活动标签的 body（见 `dsh-client-ui-dockkit` 的 `renderTab(activeTabId)`），
      切走就卸载；放在标签页里必然掉线。现在标签页只负责上报自己的矩形
      （`ScrcpyTabBody` → `sessionStore.dock`），面板用 `placement: 'overlay'` 贴上去，
      标签页不在最前时 `placement: 'hidden'`（`display:none`，**DOM 不卸载、WS 与解码器继续收流**）。
    - **sidecar（兜底）**：确有新客户端接入时重开一次编码会话（`restartVideo()`），
      新会话首帧必为 SPS/PPS+IDR。这条只在"连接真的断了重连"时兜底，正常切标签页不会触发。
17. **有线/无线识别 + 无线降画质**：`isWirelessDevice()` 解析 `hdc list targets -v` 中该设备那行的
    传输类型（实测输出：`192.168.1.241:35147		TCP	Connected	localhost	hdc`），
    取不到时用 `ip:port` 形态兜底。**无线固定 `--scale 4`、有线固定 2**（2026-09-24 起：配置里的
    `wirelessScale` 已删除，不再进设置界面 —— 见 `PROGRESS.md` §10.3）。
    `scale=N` 是**宽高各除以 N**（实测：1320×2856 的设备在 `scale=2` 下 SPS 为 660×1428，两个方向都精确
    2.00 → 所以 `scale=4` 是 330×714，1/4 长宽 = **1/16 像素**）；设备端 `.so` 里写着 `Set max value 5`
    （超限被拒、非法值回落 1）。
    帧率实测（作者环境）：有线 `scale=2` 稳 60fps、无线 `scale=4` 稳 30fps、`scale=1` 原像素约 15fps。
    `device:connect` 会把 `wireless` / `scale` 返回给前端，面板头部显示「无线 · 1/4」这类标记。

### 2.5 编译与同步

源码依赖 `com.huawei.hosscrcpy.api.*`（SDK jar）和 `com.google.gson.*`（SDK jar 自带）。改完 `Main.java` 后：

```bash
javac -encoding UTF-8 -cp "resources/hosScrcpy-1.0.18-beta.jar" -d resources/out Dev/src/Main.java
```

> 实测：用 JDK-8 的 `javac` 编译，产物 `major=52`（Java 8 字节码），与 README 里写的 "Java 8+" 一致。
> ⚠️ `resources/out/` 是编译产物，改源码后必须重新编译；`GithubFiles`、`PluginMain-Dynamic`、
> `PluginMain-Static` 三处 `out/` 必须同步（改完用哈希核对一致）。

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
| 连上后一直"连接中"、0 帧 | 先看 `[bridge]` 是否出现**两次** `video capture started`（并发双启动，见 §2.4-12）；再看设备端日志是否卡在 `start startUiTestServer end`（看门狗会自动重试一次，见 §2.4-14） |
| 切走标签页再切回来黑屏 | 正常不该再出现（面板常驻 + hidden 不卸载，见 §2.4-16）；若仍黑，看 `[bridge]` 有没有 `restart video for new client`（兜底重开是否生效） |
| 无线投屏卡 | 无线固定 1/4 画质（`--scale 4`，见 §2.4-17）；**设置里已没有画质档位**（2026-09-24 删除） |
| 模拟器上永远 0 帧 | `can not find scrcpy pid` / `libCPHMediaEngine.z.so: cannot open` → 模拟器不支持视频流（见 §2.4-15），换真机 |
| 视频乱码 | fport 残留规则；重启 sidecar；看首帧 hex 是否以 `00 00 00 01`（annexb）开头 |
| 触控位置偏移 | 确认按设备原始分辨率换算（demo 3.3）；确认 `--scale` 只影响视频流 |
| hilog 不滚动 | 限速每秒 60 行（高频时丢弃）；确认 `log` 命令已发、`[bridge] hilog started` 已打印 |

## 6. 相关链接

- 根目录 `README.md`：插件安装/使用/架构总览（含 mermaid 架构图）
- 官方参考项目 [HOScrcpy](https://gitcode.com/OpenHarmonyToolkitsPlaza/HOScrcpy)（MIT 协议）
