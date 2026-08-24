# dsh-hos-scrcpy（静态 npm 包版 · v2）

DSH 鸿蒙投屏控制插件，以 **npm 包（tgz）** 形式安装，不再依赖会话内 `cordis_define` 动态定义，重启 DSH 后插件常驻。

v2 新功能（与动态版同步）：**AI 截图识别** —— 设备列表「允许截图」开关、`hos_scrcpy_screenshot` 模型工具（deepseek-v4-flash-vision-exp 识别 + 截图前二次确认）、「添加截图至聊天框」按钮（shot:capture RPC）。

## 包结构

```
dsh-hos-scrcpy/
├── lib/index.js          # Host 半区（Cordis 插件，ESM default export）
│                         #   在 ctx.webServer 注册 POST /dsh-hos-scrcpy/rpc
├── client/client.js      # Client 半区（window.__ModuleLoader__.load bundle）
│                         #   通过同源 fetch 调用上面的 RPC 路由
├── resources/            # sidecar 运行时资源（全部必需）
│   ├── hosScrcpy-1.0.18-beta.jar
│   ├── out/              # Main 及内部类（javac 编译产物）
│   └── jmuxer.min.js
└── cordis.patch.yml      # bundle patch：向组合树插入插件行
```

## 安装（不发布 npm 仓库，本地 tgz）

1. 打包（在包目录内）生成 `dsh-hos-scrcpy-1.0.0.tgz`：

   ```bash
   npm pack
   ```

2. 安装到 web profile（本质是转发 pnpm，装进 `$DSH_HOME/profiles/web/node_modules`）：

   ```bash
   dsh plugin --profile web add D:\path\to\dsh-hos-scrcpy-1.0.0.tgz
   ```

3. 把包加入 profile 的 bundle 列表 —— 编辑 `$DSH_HOME/profiles/web/package.json`：

   ```json
   "dsh": {
     "profile": {
       "bundles": [
         "@deepseek-ai/dsh-base",
         "@deepseek-ai/dsh-web-app",
         "dsh-hos-scrcpy"
       ]
     }
   }
   ```

4. 重启 `dsh web`。右上角出现「设备列表」按钮即成功（可先 `dsh --profile web --dump-config` 确认组合树里出现 `hos-scrcpy` 行）。

## 与动态版（PluginMain-Dynamic）的差异

| 项目 | 动态版 | 静态版 |
|---|---|---|
| 定义方式 | 会话内 cordis_define，重启失效 | npm 包常驻，重启生效 |
| Host 半区 | `harness.handle(method, fn)` | `ctx.webServer` 路由 `POST /dsh-hos-scrcpy/rpc`，`{method,args}` → `{ok,result}` |
| 工具注册 | `harness.defineTool` + `harness.registerTool` | `@deepseek-ai/dsh-tools` 的 `defineTool` + `ctx.tools.register` |
| 浏览器半区 | `host.call(method, args)` 闭包符号 | 同源 `fetch('/dsh-hos-scrcpy/rpc')`（rpc() 助手） |
| 资源路径 | 工作区相对 `PluginMain/…` | 包内 `resources/`（import.meta.url 定位） |
| 截图临时文件 | 会话工作区根 | `os.tmpdir()` |
| 配置位置 | 工作区根 `dsh-hos-scrcpy.json` | `$DSH_HOME/dsh-hos-scrcpy.json` |
| 环境变量 | cmd/sh echo 探测 | 直接读 `process.env.JAVA_HOME` / `DEVECO_SDK_HOME` |

浏览器半区注入的 client 服务：`slots`（`@deepseek-ai/dsh-client-runtime` 提供）。
Host 半区依赖：`@deepseek-ai/dsh-tools`（defineTool），webServer / llm / approval / attachments / systemPrompt 服务取自 DSH 组合。

## 安全说明

- RPC 路由只监听 DSH web 自身端口（默认 127.0.0.1），与页面同源
- sidecar 仍只监听 127.0.0.1 回环（随机端口）
- 设备端命令仍为白名单（hilog / uinput / uitest / snapshot_display 等）
