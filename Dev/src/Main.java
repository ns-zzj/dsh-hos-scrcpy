import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.huawei.hosscrcpy.api.HosRemoteConfig;
import com.huawei.hosscrcpy.api.HosRemoteDevice;
import com.huawei.hosscrcpy.api.ScreenCapCallback;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

/**
 * dsh-hos-scrcpy sidecar 桥接程序
 *
 * 职责：
 *  1. 通过 hosScrcpy SDK 连接 HarmonyOS 设备（仅本机 hdc：127.0.0.1:8710）
 *  2. 在 127.0.0.1 上启动极简 WebSocket 服务：
 *     - 二进制帧：设备 H.264 视频流（广播给所有已连接客户端）
 *     - 文本帧：控制命令 JSON
 *       {"type":"touch","event":"down|move|up","x":..,"y":..}
 *       {"type":"key","name":"power|back|volumeUp|volumeDown|home"}
 *       {"type":"shell","cmd":"..."}   （命令白名单）
 *       {"type":"screen","mode":"video|image|stop"}
 *       {"type":"layout"}
 *     - 文本帧响应：
 *       {"ok":true,"msg":"..."}  或  {"ok":false,"error":"..."}
 *  3. stdout 输出一行就绪信息： {"ready":true,"port":<ws端口>}
 *
 * 用法：
 *  java -cp <hosscrcpy.jar>;out Main --sn <设备SN> [--hdc <hdc路径>] [--port <ws端口>] [--scale 2]
 *  java -cp <hosscrcpy.jar>;out Main --selftest [--port 0]
 */
public class Main {

    static final Gson GSON = new Gson();
    static final AtomicBoolean STOPPED = new AtomicBoolean(false);

    // ---- 控制命令白名单：可执行的 hdc shell 命令前缀 ----
    static final String[] SHELL_ALLOW_PREFIX = {
            "hilog", "power-shell", "uinput", "uitest", "snapshot_display",
            "ls", "ps", "df", "cat /data/local/tmp", "param get", "hidumper"
    };

    static boolean shellAllowed(String cmd) {
        if (cmd == null || cmd.isEmpty()) return false;
        String t = cmd.trim();
        for (String p : SHELL_ALLOW_PREFIX) {
            if (t.startsWith(p)) return true;
        }
        return false;
    }

    /** 通过 hdc list targets 自动发现在线设备，返回 SN 列表 */
    static List<String> listTargets(String hdcPath) {
        List<String> sns = new ArrayList<>();
        try {
            Process p = new ProcessBuilder(hdcPath, "list", "targets").redirectErrorStream(true).start();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) {
                    line = line.trim();
                    if (line.isEmpty()) continue;
                    if (line.equalsIgnoreCase("Empty") || line.startsWith("[Empty]")) continue;
                    sns.add(line);
                }
            }
            p.waitFor(5, TimeUnit.SECONDS);
        } catch (Exception e) {
            System.err.println("[bridge] list targets failed: " + e);
        }
        return sns;
    }

    /** 解析 --sn：为空或 auto 时自动发现唯一设备 */
    static String resolveSn(String sn, String hdcPath) {
        if (sn != null && !sn.isEmpty() && !"auto".equalsIgnoreCase(sn)) return sn;
        List<String> targets = listTargets(hdcPath);
        if (targets.isEmpty()) {
            System.err.println("[bridge] no device found via hdc list targets (hdc=" + hdcPath + ")");
            return null;
        }
        if (targets.size() > 1) {
            System.err.println("[bridge] multiple devices found: " + targets + " — please specify --sn");
            return null;
        }
        System.out.println("[bridge] auto-selected device: " + targets.get(0));
        return targets.get(0);
    }

    // ================================================================
    // 极简 WebSocket 服务端（RFC 6455 子集：text + binary，无扩展/分片）
    // ================================================================
    static final class WsServer {
        final int port;
        final ServerSocket server;
        final List<WsClient> clients = new CopyOnWriteArrayList<>();
        volatile Consumer<byte[]> onBinary = null;
        volatile Consumer<String> onText = null;
        volatile Runnable onClientCountChanged = null;
        final AtomicInteger nextId = new AtomicInteger(1);
        volatile boolean closed = false;

        WsServer(int port) throws IOException {
            this.server = new ServerSocket(port, 50, java.net.InetAddress.getByName("127.0.0.1"));
            this.port = server.getLocalPort();
        }

        void start() {
            Thread t = new Thread(() -> {
                while (!closed) {
                    try {
                        Socket s = server.accept();
                        WsClient c = new WsClient(this, s, nextId.getAndIncrement());
                        clients.add(c);
                        if (onClientCountChanged != null) onClientCountChanged.run();
                        c.start();
                    } catch (Exception e) {
                        if (!closed) System.err.println("[ws] accept error: " + e);
                    }
                }
            }, "ws-accept");
            t.setDaemon(true);
            t.start();
        }

        void remove(WsClient c) {
            clients.remove(c);
            if (onClientCountChanged != null) onClientCountChanged.run();
        }

        void broadcastBinary(byte[] data) {
            for (WsClient c : clients) c.sendBinary(data);
        }

        void broadcastText(String text) {
            for (WsClient c : clients) c.sendText(text);
        }

        int clientCount() {
            return clients.size();
        }

        void close() {
            closed = true;
            try { server.close(); } catch (Exception ignored) {}
            for (WsClient c : clients) c.close();
            clients.clear();
        }
    }

    static final class WsClient extends Thread {
        final WsServer owner;
        final Socket socket;
        final int id;
        volatile boolean alive = true;

        WsClient(WsServer owner, Socket socket, int id) {
            super("ws-client-" + id);
            this.owner = owner;
            this.socket = socket;
            this.id = id;
            setDaemon(true);
        }

        @Override
        public void run() {
            try {
                socket.setTcpNoDelay(true);
                InputStream in = socket.getInputStream();
                OutputStream out = socket.getOutputStream();

                // 1. HTTP 升级握手
                String key = handshake(in, out);
                if (key == null) return;

                // 2. 帧循环
                while (alive) {
                    int b0 = in.read();
                    if (b0 < 0) break;
                    int b1 = in.read();
                    if (b1 < 0) break;

                    boolean fin = (b0 & 0x80) != 0;
                    int opcode = b0 & 0x0F;
                    boolean masked = (b1 & 0x80) != 0;
                    long len = b1 & 0x7F;

                    if (len == 126) {
                        len = ((long) readByte(in) << 8) | readByte(in);
                    } else if (len == 127) {
                        len = 0;
                        for (int i = 0; i < 8; i++) len = (len << 8) | readByte(in);
                    }
                    if (len < 0 || len > 64 * 1024 * 1024) break;

                    byte[] mask = null;
                    if (masked) {
                        mask = new byte[4];
                        readFully(in, mask);
                    }
                    byte[] payload = new byte[(int) len];
                    readFully(in, payload);
                    if (masked) {
                        for (int i = 0; i < payload.length; i++) {
                            payload[i] = (byte) (payload[i] ^ mask[i & 3]);
                        }
                    }
                    if (!fin) break; // 不支持分片，直接断开

                    if (opcode == 0x1) { // text
                        String text = new String(payload, StandardCharsets.UTF_8);
                        if (owner.onText != null) {
                            try { owner.onText.accept(text); } catch (Exception ignored) {}
                        }
                    } else if (opcode == 0x8) { // close -> 回 close 帧
                        sendFrame(0x8, payload);
                        break;
                    } else if (opcode == 0x9) { // ping -> pong
                        sendFrame(0xA, payload);
                    }
                    // 忽略 binary 上行（客户端不应上传视频）
                }
            } catch (SocketException e) {
                if (alive) System.err.println("[ws#" + id + "] socket closed: " + e.getMessage());
            } catch (Exception e) {
                if (alive) System.err.println("[ws#" + id + "] error: " + e);
            } finally {
                System.out.println("[ws#" + id + "] client gone (alive=" + alive + ")");
                close();
            }
        }

        int readByte(InputStream in) throws IOException {
            int b = in.read();
            if (b < 0) throw new SocketException("eof");
            return b;
        }

        void readFully(InputStream in, byte[] buf) throws IOException {
            int off = 0;
            while (off < buf.length) {
                int n = in.read(buf, off, buf.length - off);
                if (n < 0) throw new SocketException("eof");
                off += n;
            }
        }

        String handshake(InputStream in, OutputStream out) throws IOException {
            // 读请求头（以 \r\n\r\n 或 \n\n 结束）
            StringBuilder head = new StringBuilder();
            while (head.length() < 16384) {
                int c = in.read();
                if (c < 0) return null;
                head.append((char) c);
                int len = head.length();
                if (len >= 4 && head.substring(len - 4).equals("\r\n\r\n")) break;
                if (len >= 2 && head.substring(len - 2).equals("\n\n")) break;
            }
            String req = head.toString();
            if (!req.startsWith("GET ")) return null;

            String key = null;
            for (String line : req.split("\r?\n")) {
                if (line.toLowerCase().startsWith("sec-websocket-key:")) {
                    key = line.substring(line.indexOf(':') + 1).trim();
                }
            }
            if (key == null) return null;

            String accept = Base64.getEncoder().encodeToString(
                    sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").getBytes(StandardCharsets.ISO_8859_1)));

            String resp = "HTTP/1.1 101 Switching Protocols\r\n" +
                    "Upgrade: websocket\r\n" +
                    "Connection: Upgrade\r\n" +
                    "Sec-WebSocket-Accept: " + accept + "\r\n" +
                    "\r\n";
            out.write(resp.getBytes(StandardCharsets.ISO_8859_1));
            out.flush();
            return key;
        }

        static byte[] sha1(byte[] data) {
            try {
                MessageDigest md = MessageDigest.getInstance("SHA-1");
                return md.digest(data);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }

        // 必须同步：视频帧线程（gRPC 回调）与控制响应线程会并发写同一 socket，
        // 不加锁会导致 WebSocket 帧字节交错损坏，浏览器解析失败后关闭连接
        synchronized void sendFrame(int opcode, byte[] payload) {
            try {
                OutputStream out = socket.getOutputStream();
                int len = payload.length;
                out.write(0x80 | opcode);
                if (len < 126) {
                    out.write(len);
                } else if (len < 65536) {
                    out.write(126);
                    out.write((len >> 8) & 0xFF);
                    out.write(len & 0xFF);
                } else {
                    // 注意：必须用 long 移位，int 移位超过 31 位会取低 5 位导致长度错误
                    out.write(127);
                    long l = len;
                    for (int i = 7; i >= 0; i--) out.write((int) ((l >> (8 * i)) & 0xFF));
                }
                out.write(payload);
                out.flush();
            } catch (Exception ignored) {
            }
        }

        void sendText(String text) {
            if (!alive) return;
            sendFrame(0x1, text.getBytes(StandardCharsets.UTF_8));
        }

        void sendBinary(byte[] data) {
            if (!alive) return;
            sendFrame(0x2, data);
        }

        void close() {
            if (!alive) return;
            alive = false;
            try { socket.close(); } catch (Exception ignored) {}
            owner.remove(this);
        }
    }

    // ================================================================
    // sidecar 主体
    // ================================================================
    static final class DeviceBridge {
        final String sn;
        final String ip;
        final String hdcPath;
        final int scale;
        final WsServer ws;
        HosRemoteDevice device = null;
        volatile boolean capturing = false;
        volatile long lastStopTime = 0;
        // 诊断：帧统计
        final AtomicLong frameCount = new AtomicLong(0);
        final AtomicLong frameBytes = new AtomicLong(0);
        final AtomicLong lastStatTime = new AtomicLong(System.currentTimeMillis());
        // hilog 流（持续进程，非 SDK executeShellCommand 同步调用）
        volatile Process hilogProc = null;
        final AtomicLong logSecond = new AtomicLong(0);
        final AtomicInteger logCount = new AtomicInteger(0);
        volatile boolean fportCleaned = false;

        /**
         * 清理设备端残留的 fport 转发规则。
         * SDK 多次部署后会残留大量规则（uitest_socket / scrcpy_grpc_socket），
         * 新随机端口会撞上残留规则导致 socket 连到错误的通道（读到视频流乱码）。
         */
        void cleanupFportRules() {
            try {
                String hp = (device != null && device.getHdcPort() != null) ? device.getHdcPort() : "8710";
                String out = execHdc(new String[]{hdcPath, "-s", ip + ":" + hp, "-t", sn, "fport", "ls"});
                if (out == null || out.isEmpty() || out.startsWith("ERROR")) return;
                for (String line : out.split("\n")) {
                    String t = line.trim();
                    int idx = t.indexOf("tcp:");
                    if (idx < 0) continue;
                    String[] parts = t.substring(idx).split("\\s+");
                    if (parts.length >= 2 && (parts[1].contains("uitest_socket") || parts[1].contains("scrcpy_grpc_socket"))) {
                        String res = execHdc(new String[]{hdcPath, "-s", ip + ":" + hp, "-t", sn,
                                "fport", "rm", parts[0], parts[1]});
                        System.out.println("[bridge] cleanup fport " + parts[0] + " " + parts[1] + " -> " + res);
                    }
                }
            } catch (Exception e) {
                System.err.println("[bridge] cleanup fport failed: " + e);
            }
        }

        DeviceBridge(String sn, String ip, String hdcPath, int scale, WsServer ws) {
            this.sn = sn;
            this.ip = ip;
            this.hdcPath = hdcPath;
            this.scale = scale;
            this.ws = ws;
        }

        synchronized boolean connect() {
            try {
                HosRemoteConfig cfg = new HosRemoteConfig(sn);
                cfg.setIp(ip);
                cfg.setHdcPath(hdcPath);
                cfg.setScale(scale);
                device = new HosRemoteDevice(cfg);
                boolean online = device.isOnline();
                if (!online) {
                    System.err.println("[bridge] device offline: " + sn);
                    return false;
                }
                System.out.println("[bridge] device online: " + sn);
                return true;
            } catch (Exception e) {
                System.err.println("[bridge] connect failed: " + e);
                return false;
            }
        }

        ScreenCapCallback makeCallback(String mode) {
            return new ScreenCapCallback() {
                @Override
                public void onData(ByteBuffer byteBuffer) {
                    byte[] buf = new byte[byteBuffer.remaining()];
                    byteBuffer.get(buf);
                    // 诊断：打印前几帧的头部字节，判断 H.264 封装格式
                    if (frameCount.get() < 3) {
                        StringBuilder hex = new StringBuilder();
                        int n = Math.min(buf.length, 12);
                        for (int i = 0; i < n; i++) hex.append(String.format("%02X ", buf[i]));
                        System.out.println("[bridge] frame#" + frameCount.get() + " len=" + buf.length + " head=" + hex.toString().trim());
                    }
                    frameCount.incrementAndGet();
                    frameBytes.addAndGet(buf.length);
                    long now = System.currentTimeMillis();
                    long last = lastStatTime.get();
                    if (now - last >= 2000) {
                        if (lastStatTime.compareAndSet(last, now)) {
                            System.out.println("[bridge] frames=" + frameCount.get()
                                    + " bytes=" + frameBytes.get() + " clients=" + ws.clientCount());
                        }
                    }
                    ws.broadcastBinary(buf);
                }

                @Override
                public void onException(Throwable throwable) {
                    System.err.println("[bridge] stream error (" + mode + "): " + throwable);
                    capturing = false; // 流异常退出，允许下次重新启动
                    ws.broadcastText(json(false, "stream error: " + throwable, null));
                }

                @Override
                public void onReady() {
                    System.out.println("[bridge] stream ready (" + mode + ")");
                    ws.broadcastText(json(true, "stream ready: " + mode, null));
                }
            };
        }

        void startVideo() {
            if (device == null) return;
            if (capturing) {
                System.out.println("[bridge] video already capturing, skip");
                return; // 去重：避免连接自动开流与显式命令双触发
            }
            if (!fportCleaned) {
                cleanupFportRules(); // 先清残留转发规则，防止随机端口撞上旧规则串到视频通道
                fportCleaned = true;
            }
            try {
                device.stopCaptureScreen();
                device.startCaptureScreen(makeCallback("video"));
                capturing = true;
                System.out.println("[bridge] video capture started");
            } catch (Exception e) {
                capturing = false;
                System.err.println("[bridge] start video failed: " + e);
            }
        }

        void startImage() {
            if (device == null) return;
            if (capturing) return;
            try {
                device.stopImageScreenCapture();
                device.startImageScreenCapture(makeCallback("image"));
                capturing = true;
            } catch (Exception e) {
                capturing = false;
                System.err.println("[bridge] start image failed: " + e);
            }
        }

        void stop() {
            if (device == null) return;
            capturing = false;
            lastStopTime = System.currentTimeMillis();
            try {
                device.stopCaptureScreen();
                device.stopImageScreenCapture();
            } catch (Exception e) {
                System.err.println("[bridge] stop failed: " + e);
            }
            System.out.println("[bridge] capture stopped");
        }

        /** 启动 hilog 实时日志流（hdc shell hilog → WebSocket 文本广播，带限速） */
        synchronized void startHilog() {
            if (hilogProc != null) {
                System.out.println("[bridge] hilog already running");
                return;
            }
            try {
                String hp = (device != null && device.getHdcPort() != null) ? device.getHdcPort() : "8710";
                ProcessBuilder pb = new ProcessBuilder(
                        hdcPath, "-s", ip + ":" + hp, "-t", sn, "shell", "hilog");
                pb.redirectErrorStream(true);
                Process p = pb.start();
                hilogProc = p;
                System.out.println("[bridge] hilog started");
                Thread t = new Thread(() -> {
                    try (BufferedReader r = new BufferedReader(
                            new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                        String line;
                        while ((line = r.readLine()) != null) {
                            // 限速：每秒最多 60 行，超出丢弃（hilog 高频时防刷爆 WS）
                            long sec = System.currentTimeMillis() / 1000;
                            if (logSecond.get() != sec) {
                                logSecond.set(sec);
                                logCount.set(0);
                            }
                            if (logCount.incrementAndGet() > 60) continue;
                            ws.broadcastText(json(true, "log", line));
                        }
                    } catch (Exception ignored) {
                    } finally {
                        System.out.println("[bridge] hilog ended");
                        hilogProc = null;
                    }
                }, "hilog-reader");
                t.setDaemon(true);
                t.start();
            } catch (Exception e) {
                System.err.println("[bridge] hilog start failed: " + e);
            }
        }

        synchronized void stopHilog() {
            Process p = hilogProc;
            hilogProc = null;
            if (p != null) {
                try { p.destroyForcibly(); } catch (Exception ignored) {}
                System.out.println("[bridge] hilog stopped");
            }
        }

        /** 执行 hdc 命令（数组形式，无 shell 解释） */
        String execHdc(String[] argv) {
            try {
                ProcessBuilder pb = new ProcessBuilder(argv);
                pb.redirectErrorStream(true);
                Process p = pb.start();
                StringBuilder sb = new StringBuilder();
                try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = r.readLine()) != null) sb.append(line).append('\n');
                }
                p.waitFor(5, TimeUnit.SECONDS);
                return sb.toString().trim();
            } catch (Exception e) {
                return "ERROR: " + e;
            }
        }

        static String truncate(String s, int max) {
            if (s == null) return "null";
            String t = s.replace("\n", "\\n");
            return t.length() > max ? t.substring(0, max) + "..." : t;
        }

        /**
         * 客户端 0→1 时重启视频流：H.264 新编码会话首帧必为 I 帧，
         * 保证中途加入的客户端立即能解码出画面（否则静止画面下永远等不到关键帧）。
         * 带防抖：避免快速刷新/多客户端抖动导致 stop/start 交错中断。
         */
        void restartVideo() {
            if (device == null) return;
            long now = System.currentTimeMillis();
            if (now - lastStopTime < 1000) {
                System.out.println("[bridge] restart throttled (recently stopped)");
                return;
            }
            System.out.println("[bridge] restart video for new client (fresh I-frame)");
            stop();
            try {
                Thread.sleep(400); // 等旧流线程退出，避免与新流交错
            } catch (InterruptedException ignored) {}
            startVideo();
        }

        String handleControl(String text) {
            System.out.println("[bridge] recv: " + truncate(text, 300));
            if (device == null) {
                return json(false, "device not ready, retry in a moment", null);
            }
            try {
                JsonObject o = JsonParser.parseString(text).getAsJsonObject();
                String type = o.has("type") ? o.get("type").getAsString() : "";
                switch (type) {
                    case "touch": {
                        String event = o.get("event").getAsString();
                        int x = o.get("x").getAsInt();
                        int y = o.get("y").getAsInt();
                        System.out.println("[bridge] touch " + event + " @" + x + "," + y);
                        if ("down".equals(event)) device.onTouchDown(x, y);
                        else if ("up".equals(event)) device.onTouchUp(x, y);
                        else device.onTouchMove(x, y);
                        return json(true, "touch " + event + " @" + x + "," + y, null);
                    }
                    case "key": {
                        // 仅预定义按键（返回/主页/音量，供控制区按钮使用）
                        String name = o.get("name").getAsString();
                        String cmd = keyToShell(name);
                        if (cmd == null) return json(false, "unsupported key: " + name, null);
                        String r = device.executeShellCommand(cmd, 3);
                        return json(true, "key " + name, r);
                    }
                    case "shell": {
                        String cmd = o.get("cmd").getAsString();
                        if (!shellAllowed(cmd)) return json(false, "command not allowed: " + cmd, null);
                        String r = device.executeShellCommand(cmd, 8);
                        return json(true, "shell ok", r);
                    }
                    case "screen": {
                        String mode = o.get("mode").getAsString();
                        if ("stop".equals(mode)) {
                            stop();
                            return json(true, "capture stopped", null);
                        } else if ("video".equals(mode)) {
                            startVideo();
                            return json(true, "starting video", null);
                        } else if ("image".equals(mode)) {
                            startImage();
                            return json(true, "starting image", null);
                        }
                        return json(false, "unknown mode: " + mode, null);
                    }
                    case "layout": {
                        String layout = device.getLayout();
                        return json(true, "layout", layout);
                    }
                    case "log": {
                        boolean on = o.has("on") && o.get("on").getAsBoolean();
                        if (on) startHilog();
                        else stopHilog();
                        return json(true, "log " + (on ? "on" : "off"), null);
                    }
                    case "size": {
                        com.huawei.hosscrcpy.api.Size s = device.getScreenSize(true);
                        return json(true, "size", s.width + "x" + s.height);
                    }
                    case "ping":
                        return json(true, "pong", null);
                    default:
                        return json(false, "unknown type: " + type, null);
                }
            } catch (Exception e) {
                return json(false, "control error: " + e.getMessage(), null);
            }
        }

        static String keyToShell(String name) {
            // 键码以 DevEco SDK 的 oh_key_code.h 为准：KEYCODE_HOME=1, KEYCODE_BACK=2,
            // KEYCODE_VOLUME_UP=16, KEYCODE_VOLUME_DOWN=17, KEYCODE_POWER=18
            switch (name == null ? "" : name) {
                case "power":      return "uinput -K -d 18 -u 18";
                case "back":       return "uinput -K -d 2 -u 2";
                case "home":       return "uinput -K -d 1 -u 1";
                case "volumeUp":   return "uinput -K -d 16 -u 16";
                case "volumeDown": return "uinput -K -d 17 -u 17";
                default:           return null;
            }
        }

        static String json(boolean ok, String msg, String data) {
            Map<String, Object> m = new HashMap<>();
            m.put("ok", ok);
            m.put("msg", msg == null ? "" : msg);
            if (data != null) m.put("data", data);
            return GSON.toJson(m);
        }
    }

    public static void main(String[] args) throws Exception {
        Map<String, String> opts = new HashMap<>();
        for (int i = 0; i < args.length; i++) {
            if (!args[i].startsWith("--")) continue;
            String key = args[i].substring(2);
            if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
                opts.put(key, args[i + 1]);
                i++;
            } else {
                opts.put(key, "true"); // 布尔开关
            }
        }

        boolean selftest = opts.containsKey("selftest");
        String sn = opts.getOrDefault("sn", "");
        String ip = opts.getOrDefault("ip", "127.0.0.1");
        String hdc = opts.getOrDefault("hdc", "hdc");
        int scale;
        try { scale = Integer.parseInt(opts.getOrDefault("scale", "2")); } catch (Exception e) { scale = 2; }
        int port;
        try { port = Integer.parseInt(opts.getOrDefault("port", "0")); } catch (Exception e) { port = 0; }

        if (!selftest) {
            sn = resolveSn(sn, hdc);
            if (sn == null) {
                System.err.println("usage: Main [--sn <sn|auto>] [--hdc <path>] [--port <ws>] [--scale <n>] | Main --selftest");
                System.exit(2);
            }
        }

        WsServer ws = new WsServer(port);
        ws.start();

        DeviceBridge bridge = selftest ? null : new DeviceBridge(sn, ip, hdc, scale, ws);

        // WebSocket 事件绑定
        ws.onText = text -> {
            if (bridge == null) {
                // selftest 模式：仅响应 ping，设备相关命令报 no device
                try {
                    JsonObject o = JsonParser.parseString(text).getAsJsonObject();
                    String type = o.has("type") ? o.get("type").getAsString() : "";
                    if ("ping".equals(type)) {
                        ws.broadcastText(DeviceBridge.json(true, "pong", null));
                        return;
                    }
                } catch (Exception ignored) {}
                ws.broadcastText(DeviceBridge.json(false, "selftest mode: no device", null));
                return;
            }
            String resp = bridge.handleControl(text);
            ws.broadcastText(resp);
        };
        ws.onBinary = data -> { /* 客户端上行二进制忽略 */ };
        ws.onClientCountChanged = () -> {
            System.out.println("[ws] clients: " + ws.clientCount());
            if (bridge == null) return;
            // 0→1 时确保流在跑即可；不自动重启视频流——
            // 重启会 stopCaptureScreen 关闭 uitest 控制通道（Hypium 输入通道）且拖慢体验，
            // 新客户端缺 I 帧的情况由“请持续滑动手机更新画面”提示解决。
            if (ws.clientCount() > 0 && !bridge.capturing) bridge.startVideo();
        };

        // 先连接设备，成功后才广播 ready（否则客户端会在 device 就绪前连接并发命令）
        if (bridge != null) {
            if (!bridge.connect()) {
                System.err.println("{\"error\":\"device offline\"}");
                System.exit(3);
            }
        }

        // 就绪信息（供 DSH Host 解析）
        System.out.println("{\"ready\":true,\"port\":" + ws.port + ",\"selftest\":" + selftest + "}");
        System.out.flush();

        if (selftest) {
            System.out.println("[selftest] ws listening on 127.0.0.1:" + ws.port);
        }

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            STOPPED.set(true);
            if (bridge != null) bridge.stop();
            ws.close();
        }));

        // 保持进程存活
        while (!STOPPED.get()) {
            Thread.sleep(500);
        }
    }
}
