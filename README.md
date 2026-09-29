# dsh-hos-scrcpy

**DSH 的鸿蒙投屏 provider** —— 让 DSH 通过 `hdc` 连上鸿蒙设备：看画面、点/滑、按键、输入文字、给 AI 看。

界面、AI 工具、设备与焦点、路由、门槛**全在 core 里**；本包只负责"**这台设备怎么连、怎么点、怎么出画面**"。

## 这是什么

| | |
|---|---|
| 角色 | dsh-scrcpy 的 **provider**（鸿蒙平台） |
| 依赖 | 需要 **`dsh-scrcpy-core`**（不装它本包不激活）。本包**不声明**对 core 的包依赖 —— 两包**自由装**，互不自动拉取 |
| 传输 | `hdc`：USB 调试，或 `hdc tconn` 无线连接 |
| sidecar | 每台设备一个 **Java 进程**（`Dev/src/Main.java` 的编译产物随包发布），由本包 `spawn` 拉起：`java -cp <jar>;<out> Main --sn … --hdc … --port 0 --scale … --frame-rate … --bit-rate … --ifr … --idle-exit …` |
| 协议 | 浏览器半区**直连 sidecar 的 WebSocket**：二进制 H.264（annex-B）+ JSON 控制消息（`size` / `log` / `hid`）；触控与按键走同一条连接 |
| 不在流路径里 | provider 只负责起停 sidecar、报设备、报配置 —— 视频帧与触控**不经它**（这也是它与安卓 provider 最大的区别） |
| 没有 | 浏览器半区、AI 工具、AI 提示词、UI 注册、焦点逻辑（都归 core） |

## 特点

| 特点 | 说明 |
|---|---|
| **跨平台多设备** | 多台同时投屏，各自独立会话与独立标签页；**安卓和鸿蒙可以同时显示，互不冲突**。操作只作用于当前聚焦（面板可见）的那台，不会点错 |
| **华为零售机可用** | 走系统投屏服务那条通路，**不需要 root、不改系统分区、不需要白名单** |
| **转屏** | 转屏后画面跟着走，**不需要重连、不会黑屏**（重建只由流里的 SPS 驱动，平台无关） |
| **切页 / 暂停** | 切走时自动暂停：**不用常驻、也不用断开重连**，暂停期间**占资源很少**；切回来**立刻出画**（sidecar 侧缓存"配置 + 最近关键帧起到现在的帧"并补发）；**暂停期间转过屏，切回来也不崩** |
| **画质** | 有线 / 无线**分别**配缩放与帧率；两端都能到原画，帧率 120 封顶 |
| **AI 操作与权限** | 界面与全部 AI 工具在 core（截图识别 / 控件清单 / 点击 / 长按 / 按键 / 文字输入）；**权限四项各自"禁止使用 / 每次确认 / 无需确认"三态，后三项依赖截图**，关掉时工具直接报原因、不反复重试 |
| **自由装卸** | provider 不含界面、不含 AI、不写提示词；装 core + 装对应平台的 provider 即可，两个 provider 各装各的、互不拉依赖 |

## 安装

在 DSH 的**插件面板**里装上两个包：

| 顺序 | 装什么 | 地址 |
|---|---|---|
| 1 | **core** —— 界面与 AI 工具都在这里 | `@nszzj/dsh-scrcpy-core` |
| 2 | **本包** `@nszzj/dsh-hos-scrcpy` —— 鸿蒙 provider | `@nszzj/dsh-hos-scrcpy` |

- 两包各装一次，别只装 provider（core 缺了本包不会激活）
- 装完 **完全退出 DSH 再打开**（宿主半区改动只有重启才生效；浏览器半区刷新即可）
- 只装 provider 不装 core：本包因注入不满足而静默不激活（设计如此，不是 bug）

## 快速开始

1. 设备开启**开发者模式 + USB 调试**（或 `hdc tconn <ip:port>` 连上；`hdc list targets` 能看到它）
2. DSH 菜单里出现这台设备 → 点那行的「投屏」→ 右侧栏展开成该设备的投屏标签页（首次部署约 5~10 秒）
3. 多设备：每台一张标签页，点哪行跳哪张；某台要收工，点它那行的「断开」（只断这台）
4. 画质（缩放 / 帧率）在菜单里那组 provider 的「**连接设置**」里调；面板里的「设置」管的是 AI 权限（截图 / 控件 / 点击 / 按键 / 输入，后三项依赖"允许截图"）
5. AI 工具作用于**当前聚焦（面板可见）的那台设备**；没有聚焦设备会直接报错，不猜设备

## 环境要求

| 依赖 | 说明 |
|---|---|
| DSH | 电脑端 DeepSeek Harness（Windows / macOS / Linux） |
| **Java 8+** | sidecar 的运行环境（`JAVA_HOME` / DevEco SDK 优先，也可在「连接设置」里手动指定） |
| **hdc** | DevEco Studio 自带：`<DevEco>/sdk/default/openharmony/toolchains/hdc.exe` |
| 鸿蒙设备 | 开发者模式 + USB 调试（或 `hdc tconn` 无线连接） |

## 目录结构

```
lib/index.js                          provider 实现（起停 sidecar / 环境检测 / 连接配置 / 上报设备 + 画面四件套）
resources/hosScrcpy-1.0.18-beta.jar   HOScrcpy SDK（第三方，见 THIRD_PARTY_NOTICES.md）
resources/out/                        sidecar 编译产物（Main 及内部类），随包发布
cordis.patch.yml                      DSH 插件清单
Dev/src/Main.java                     sidecar 源码（DSH ⇄ 设备的 Java 桥）
Dev/demo/                             独立测试件（不依赖 DSH，也不进 npm 包）
Dev/doc.md                            开发资料：架构图 / 开发约定 / 各 demo 用途
Dev/doc-sidecar.md                    sidecar 协议、编译（必须 --release 8）、踩坑
```

## 已知限制

- **连接中途不能改缩放 / 帧率**：要换就断开重连（改设置只对下次连接生效）
- **不做设备日志流**（hilog）：面板里的「日志」是插件诊断日志
- `requestIDRFrame()` 在 SDK 1.0.18 里是**空方法**，不能用来"要一个关键帧"；画面重建靠 sidecar 的 **GOP 缓存补发**（暂停期间转屏 → 恢复时补发配置 + 关键帧）
- 零售设备上可用的镜像通路就是 HOScrcpy 访问的那条系统服务；root / 改系统分区 / 白名单那几类方案在零售机上不可用
- 改宿主半区后必须**完全退出 DSH 再打开**

## 二次开发

- 架构图、开发约定、每个 demo 是干嘛的 → [`Dev/doc.md`](Dev/doc.md)
- sidecar 的协议 / 编译 / 排障 → [`Dev/doc-sidecar.md`](Dev/doc-sidecar.md)
- **基于 core 开发一个 provider** → [core/Dev/doc.md](https://github.com/ns-zzj/dsh-scrcpy-core/blob/main/Dev/doc.md)

## 许可与第三方

- 本包：**MIT**（见 `LICENSE`）
- `resources/hosScrcpy-1.0.18-beta.jar`（HOScrcpy SDK）的出处、签名情况与再分发风险，见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
- `jmuxer.min.js` 只存在于 `Dev/demo/`（开发件，不随 npm 包发布）；它仍随 Git 仓库分发，所以那边单独有一份声明 → [`Dev/demo/THIRD_PARTY_NOTICES.md`](Dev/demo/THIRD_PARTY_NOTICES.md)
