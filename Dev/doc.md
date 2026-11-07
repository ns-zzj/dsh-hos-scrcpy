# Dev —— Java sidecar

`Dev/src/Main.java` 是每台设备一个的 Java 进程（provider 负责 `spawn`）。它只做四件事：

- 用 `hdc` 连上设备，起投屏、取画面；
- 把 H.264 二进制帧广播给浏览器（WebSocket）；
- 收浏览器的触控 / 按键 / shell / 布局 / 尺寸命令；
- 缓存"配置 + 关键帧"，新客户端接入或暂停恢复时补发。

DSH 插件本体不在这里：宿主半区是 `lib/index.js`，浏览器半区在 core。

## 文件

```
Dev/src/Main.java                   源码
resources/out/*.class               编译产物，**随包发布**（provider 直接 java -cp 跑）
resources/hosScrcpy-1.0.18-beta.jar HOScrcpy SDK
```

`resources/out/` 是运行时真正加载的那份；只改 `src/Main.java` 不重编，等于没改。

## 编译

```
javac -encoding UTF-8 -nowarn --release 8 -cp hos/resources/hosScrcpy-1.0.18-beta.jar -d hos/resources/out hos/Dev/src/Main.java
```

**必须 `--release 8`**：当前产物是 class 版本 52（Java 8）。用 JDK 25 默认会编出 69，Java 8~16 的运行时直接 `UnsupportedClassVersionError`。

编完核对：`Main.class` 第 7~8 字节应为 `00 34`（52）。

**改了 Java 要重启用到它的进程** —— demo 和插件都是启动时加载。

## 命令行

```
java -cp <jar>;resources/out Main --sn <sn> --hdc <path> [--port 0] [--scale 2]
     [--frame-rate <fps>] [--bit-rate <bps>] [--ifr <ms>] [--idle-exit 300]
java -cp <jar>;resources/out Main --selftest [--port 0]
```

| 参数 | 默认 | 说明 |
|---|---|---|
| `--sn` | 自动发现唯一设备 | 设备号 |
| `--hdc` | `hdc` | hdc 路径 |
| `--ip` | `127.0.0.1` | hdc 回环地址，别改 |
| `--port` | `0` | WS 端口，0 = 随机 |
| `--scale` | `2` | 宽高各除以 n（上限 5） |
| `--frame-rate` | `0`（SDK 默认） | 帧率上限 |
| `--bit-rate` | `0`（SDK 默认） | 码率 |
| `--ifr` | `0` | 关键帧间隔 |
| `--idle-exit` | `300` | 空闲多久退出（秒） |
| `--selftest` | 关 | 只起 WS、只响应 ping，不连设备 |

## 协议

- **二进制帧** = H.264 原始字节，广播给所有客户端。
- **文本帧（浏览器 → sidecar）**：
  `{"type":"touch","event":"down|move|up","x":..,"y":..}`、
  `{"type":"key","name":"back|home|volumeUp|volumeDown|power"}`、
  `{"type":"shell","cmd":"..."}`（白名单）、`{"type":"screen","mode":"video|pause|resume"}`、
  `{"type":"layout"}`、`{"type":"size"}`、`{"type":"log","on":true}`、`{"type":"ping"}`。
- **文本帧（sidecar → 浏览器）**：`{"ok":true,...}` / `{"ok":false,"error":...}`，以及
  `{"msg":"size","data":"宽x高"}`、`{"msg":"log","data":"..."}`。
- **就绪行**：连上设备后 stdout 打印 `{"ready":true,"port":N,"selftest":false}`，provider 解析它拿端口。
  连不上会先报错再 `System.exit(3)`，**不会打印 ready**。

## 改之前必读

1. **`sendFrame` 必须 `synchronized`**：帧线程和控制响应线程会并发写同一个 socket，不加锁就字节交错。
2. **帧长编码用 `long` 移位**：超过 31 位用 `int` 会取低 5 位，长度直接错。
3. **shell 白名单** `SHELL_ALLOW_PREFIX`：加新命令类型必须同时加前缀。
4. **按键走 `uinput -K -d <码> -u <码>`**：HOME=1、BACK=2、VOL_UP=16、VOL_DOWN=17、POWER=18（以 SDK 的 `oh_key_code.h` 为准）。
5. **`cleanupFportRules()`**：SDK 多次部署会在设备端残留 `fport` 规则，新端口撞上就会连到错误通道（画面乱码）。画面异常先查这里。
6. **静止不推帧**：SDK 只在画面变化时回调 `onData`，"连着但没帧"是正常的，前端提示用户滑一下。
7. **新客户端加入不重启视频流**：只在 0→1 时保证流在跑，中途加入缺 I 帧由 GOP 补发兜底。
8. **开流必须互斥且只启动一次**：`onClientCountChanged` 和显式 `screen` 命令会同时开流；`capturing` 要等 `startCaptureScreen()` 返回才置位（真机无线 3~4 秒），这段窗口里两个线程都会各起一次，后一次打断前一次。现象是连续两行 `capture started` 然后永远 0 帧。用 `capLock` + `starting` 挡住。
9. **`screen` 命令异步执行**：开/停流是阻塞调用，不能在 WS 读线程里同步跑，否则触控按键全排队。
10. **整条流只有一个关键帧**：真机实测 SPS×1、PPS×1、IDR×1、P帧×160，之后不再重发。新观众能立刻解码靠的是 sidecar 缓存补发。
11. **模拟器不支持视频流**：SDK 在模拟器上找不到 `scrcpy pid`，一帧都没有。这是 ROM 限制。

## 排查顺序

画面黑 / 乱码 → 先看 `fport` 残留，再看是不是 `capture started` 出现了两次。都没有，再看设备端有没有画面变化（静止本来就不推帧）。
