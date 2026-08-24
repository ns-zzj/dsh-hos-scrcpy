// ============================================================
// dsh-hos-scrcpy — 插件 Host 半区源码（DSH 进程内 Node.js）
//
// 重新加载方法：在 DSH 会话中用 cordis_define 创建动态插件，
// code.host 填入本文件全部内容（函数体），code.client 填入
// PluginMain/client.js 的内容，然后 cordis_run 激活。
//
// v2 新增：AI 截图识别（hos_scrcpy_screenshot 工具）
//   - 设备列表「允许截图」开关（shot:set-enabled / shot:enabled RPC）
//   - 截图前复用 DSH 高危命令二次确认框（approval.request）
//   - 仅限 DSH >= 0.1.0-rc8 且内置 DeepSeek 提供方模型列表含
//     deepseek-v4-flash-vision-exp 时可用
//   - hdc snapshot_display 截图 → attachments 保存 → llm.stream 视觉识别
// ============================================================

const CONFIG_FILE = 'dsh-hos-scrcpy.json'
// 运行时资源全部在仓库根（=DSH 工作区）下；按仓库布局优先 PluginMain-Dynamic/，
// 兼容旧布局 PluginMain/（已复制资源的目录）
const RES_ROOTS = ['PluginMain-Dynamic', 'PluginMain']
const SIDECAR_OUT_REL = 'out'
const SDK_JAR_REL = 'hosScrcpy-1.0.18-beta.jar'
const JMUXER_REL = 'jmuxer.min.js'
const JAVA_CANDIDATES = [
  'C:\\Program Files\\Java\\latest\\bin\\java.exe',
  'C:\\Program Files\\Eclipse Adoptium\\jdk-17\\bin\\java.exe',
  'C:\\Program Files\\Microsoft\\jdk-17\\bin\\java.exe',
  'C:\\Program Files\\Amazon Corretto\\jdk-17\\bin\\java.exe',
  '/usr/lib/jvm/java-17-openjdk-amd64/bin/java',
  '/usr/lib/jvm/java-21-openjdk-amd64/bin/java',
  '/opt/homebrew/opt/openjdk/bin/java',
]
const HDC_CANDIDATES = [
  'C:\\Program Files\\Huawei\\DevEco Studio\\sdk\\default\\openharmony\\toolchains\\hdc.exe',
  'C:\\Program Files\\Huawei\\command-line-tools\\sdk\\default\\openharmony\\toolchains\\hdc.exe',
  '/usr/local/bin/hdc',
  '/opt/huawei/command-line-tools/sdk/default/openharmony/toolchains/hdc',
  '/opt/DevEco Studio/sdk/default/openharmony/toolchains/hdc',
]

// ---- AI 截图识别常量 ----
const VISION_PROVIDER = 'deepseek-official'            // 内置 DeepSeek 提供方路由
const VISION_MODEL = 'deepseek-v4-flash-vision-exp'    // 视觉模型
const MIN_DSH_VERSION = '0.1.0-rc8'                    // 最低支持版本
const REMOTE_SHOT_PATH = '/data/local/tmp/dsh-scrcpy-shot.jpeg'  // snapshot_display 只接受 .jpeg 后缀
const LOCAL_SHOT_NAME = 'dsh-scrcpy-shot.jpeg'

function pathSep(p) { return p.indexOf('\\') >= 0 ? '\\' : '/' }
function rel(base, p) { return base + pathSep(base) + p.replace(/\//g, pathSep(base)) }
function javaCandidatesFromEnv(home) { const s = pathSep(home); return [home + s + 'bin' + s + 'java.exe', home + s + 'bin' + s + 'java'] }
function hdcCandidatesFromEnv(sdk) {
  const s = pathSep(sdk)
  return [
    sdk + s + 'default' + s + 'openharmony' + s + 'toolchains' + s + 'hdc.exe',
    sdk + s + 'default' + s + 'openharmony' + s + 'toolchains' + s + 'hdc',
    sdk + s + 'openharmony' + s + 'toolchains' + s + 'hdc.exe',
    sdk + s + 'openharmony' + s + 'toolchains' + s + 'hdc',
    sdk + s + 'hdc.exe',
    sdk + s + 'hdc',
  ]
}

let sidecarProc = null
let sidecarPort = 0
let sidecarSn = ''

// ---- AI 截图识别状态（进程级，动态版内存即可；静态版可持久化） ----
let shotEnabledSns = {}          // { [sn]: true }
let shotTool = null              // 惰性创建的 ToolDefinition
let shotToolDisposer = null      // harness.registerTool 返回的注销函数
let dshVersionPromise = null     // 版本探测结果缓存

return {
  apply(ctx) {
    const fs = ctx.get('fs')
    const subprocess = ctx.get('subprocess')

    function sleep(ms) {
      return new Promise(function (resolve) {
        const t = ctx.get('timer')
        if (t) { t.timeout(resolve, ms) } else { resolve() }
      })
    }

    async function workspaceCwd() {
      if (!fs) return undefined
      try { const t = await fs.resolve('.'); return fs.processPath(t) } catch (e) { return undefined }
    }

    async function fileTarget(absPath) {
      if (!fs) return undefined
      try { return await fs.resolve(absPath) } catch (e) { return undefined }
    }

    async function fileExists(absPath) {
      try {
        const t = await fileTarget(absPath)
        if (!t) return false
        const info = await fs.stat(t)
        return !!info
      } catch (e) { return false }
    }

    // ---- 目录来源 ----
    // fs 服务的 cwd 默认是 dsh 启动目录（process.cwd()），不一定等于会话工作区；
    // 会话工作区在 session.header.cwd。会话工作区用于配置文件等固定位置。
    let cachedSessionRoot = null
    async function sessionRoot() {
      if (cachedSessionRoot) return cachedSessionRoot
      try {
        const agents = ctx.get('agents')
        if (agents) {
          const init = agents.currentInitiator()
          const cwd = init && init.session && init.session.header && init.session.header.cwd
          if (cwd && typeof cwd === 'string' && cwd.length > 0) { cachedSessionRoot = cwd; return cwd }
        }
      } catch (e) {}
      try {
        const sessions = ctx.get('sessions')
        if (sessions) {
          const list = sessions.list()
          for (const s of list) {
            const cwd = s && s.header && s.header.cwd
            if (cwd && typeof cwd === 'string' && cwd.length > 0) { cachedSessionRoot = cwd; return cwd }
          }
        }
      } catch (e) {}
      try {
        const sp = ctx.get('sandboxPolicy')
        if (sp) {
          let root = sp.workspaceRoot
          if (!root && sp.resolve) { try { const r = sp.resolve({}); root = r && r.workspaceRoot } catch (e2) {} }
          if (root && typeof root === 'string' && root.length > 0) { cachedSessionRoot = root; return root }
        }
      } catch (e) {}
      try {
        const t = await fs.resolve('.')
        cachedSessionRoot = fs.processPath(t)
        return cachedSessionRoot
      } catch (e) { return '' }
    }
    // repoRoot() 保留原语义：会话工作区根
    async function repoRoot() { return await sessionRoot() }

    // ---- 子进程辅助：文本读取（jmuxer 兜底用） ----
    async function shellReadText(path) {
      if (!subprocess) return ''
      const cwd = await workspaceCwd()
      if (!cwd) return ''
      try {
        const isWin = path.indexOf(':') >= 0 || path.indexOf('\\') >= 0
        const argv = isWin ? ['cmd.exe', '/c', 'type "' + path + '"'] : ['/bin/sh', '-c', 'cat "' + path + '"']
        const handle = subprocess.spawn({
          argv: argv, cwd: cwd,
          stdio: { stdin: 'ignore', stdout: { maxBytes: 262144, spill: { maxBytes: 1048576 } }, stderr: { maxBytes: 4096 } },
          graceMs: 8000,
        })
        const outcome = await handle.done
        if (outcome.exitCode !== 0) return ''
        return handle.collected.stdout ? handle.collected.stdout.readFrom(0).text : ''
      } catch (e) { return '' }
    }

    // ---- 运行时资源目录：强制指定（不再探测） ----
    // 动态版仅供本地调试：资源固定位于 <会话工作区>/PluginMain-Dynamic（兼容 PluginMain/）。
    // 仅用 fs.stat 做一次存在性确认（实测 fs.stat 可用）。
    let cachedResourceRoot = null
    async function resourceRoot() {
      if (cachedResourceRoot) return cachedResourceRoot
      const root = await sessionRoot()
      if (root) {
        for (const lay of RES_ROOTS) {
          const dir = rel(root, lay)
          try {
            const t = await fs.resolve(rel(dir, SDK_JAR_REL))
            const info = await fs.stat(t)
            if (info) { cachedResourceRoot = dir; return dir }
          } catch (e) {}
        }
      }
      cachedResourceRoot = ''
      return ''
    }

    // 资源相对 resourceRoot 解析（返回原始路径字符串，不经过 fs 校验）
    async function resPath(relPath) {
      const root = await resourceRoot()
      if (!root) return ''
      return rel(root, relPath)
    }

    // 配置文件：会话工作区下（取不到则用 dsh 启动目录兜底）
    async function configFileTarget() {
      const root = await sessionRoot()
      if (!root) return undefined
      return await fileTarget(rel(root, CONFIG_FILE))
    }

    async function readConfig() {
      try {
        const t = await configFileTarget()
        if (!t) return { javaPath: '', hdcPath: '' }
        const text = await fs.readText(t)
        const obj = JSON.parse(text)
        return {
          javaPath: String(obj.javaPath || ''),
          hdcPath: String(obj.hdcPath || ''),
        }
      } catch (e) {
        return { javaPath: '', hdcPath: '' }
      }
    }

    async function writeConfig(cfg) {
      try {
        const t = await configFileTarget()
        if (!t) return { ok: false, error: '无法定位配置文件' }
        await fs.writeText(t, JSON.stringify(cfg, null, 2))
        return { ok: true }
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) }
      }
    }

    async function exec(exe, args) {
      if (!subprocess) return { ok: false, error: 'subprocess 服务不可用' }
      const cwd = await workspaceCwd()
      if (!cwd) return { ok: false, error: '无法解析工作目录' }
      try {
        const handle = subprocess.spawn({
          argv: [exe].concat(args), cwd: cwd,
          stdio: { stdin: 'ignore', stdout: { maxBytes: 65536, spill: { maxBytes: 1048576 } }, stderr: { maxBytes: 65536 } },
          graceMs: 3000,
        })
        const outcome = await handle.done
        const out = handle.collected.stdout ? handle.collected.stdout.readFrom(0).text : ''
        const err = handle.collected.stderr ? handle.collected.stderr.readFrom(0).text : ''
        return { ok: outcome.exitCode === 0, exitCode: outcome.exitCode, stdout: out, stderr: err }
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) }
      }
    }

    async function tryReadEnv(argv, cwd, name) {
      try {
        const handle = subprocess.spawn({
          argv: argv, cwd: cwd,
          stdio: { stdin: 'ignore', stdout: { maxBytes: 8192 }, stderr: { maxBytes: 4096 } },
          graceMs: 3000,
        })
        const outcome = await handle.done
        if (outcome.exitCode !== 0) return ''
        const text = handle.collected.stdout ? handle.collected.stdout.readFrom(0).text : ''
        const v = text.trim()
        if (!v || v === '%' + name + '%') return ''
        return v
      } catch (e) { return '' }
    }

    async function readEnvVar(name) {
      if (!subprocess) return ''
      const cwd = await workspaceCwd()
      if (!cwd) return ''
      let v = await tryReadEnv(['cmd.exe', '/c', 'echo %' + name + '%'], cwd, name)
      if (v) return v
      v = await tryReadEnv(['/bin/sh', '-c', 'echo "$' + name + '"'], cwd, name)
      return v
    }

    async function pickFirst(candidates) {
      for (const p of candidates) { if (await fileExists(p)) return p }
      return ''
    }

    async function resolveJavaPath(cfg) {
      if (cfg.javaPath) return { path: cfg.javaPath, source: 'config' }
      const home = await readEnvVar('JAVA_HOME')
      if (home) { for (const p of javaCandidatesFromEnv(home)) { if (await fileExists(p)) return { path: p, source: 'JAVA_HOME' } } }
      const p = await pickFirst(JAVA_CANDIDATES)
      return { path: p, source: p ? 'candidate' : '' }
    }

    async function resolveHdcPath(cfg) {
      if (cfg.hdcPath) return { path: cfg.hdcPath, source: 'config' }
      const sdk = await readEnvVar('DEVECO_SDK_HOME')
      if (sdk) { for (const p of hdcCandidatesFromEnv(sdk)) { if (await fileExists(p)) return { path: p, source: 'DEVECO_SDK_HOME' } } }
      const p = await pickFirst(HDC_CANDIDATES)
      return { path: p, source: p ? 'candidate' : '' }
    }

    async function checkJava(path) {
      if (!path) return { ok: false, version: '', error: '未配置 Java 路径' }
      const r = await exec(path, ['-version'])
      if (!r.ok) { const detail = r.error || r.stderr || ('exit ' + r.exitCode); return { ok: false, version: '', error: String(detail).split(/\r?\n/)[0] || 'Java 运行失败' } }
      return { ok: true, version: ((r.stderr || r.stdout || '').split(/\r?\n/)[0] || '').trim(), error: '' }
    }

    async function checkHdc(path) {
      if (!path) return { ok: false, version: '', error: '未配置 hdc 路径' }
      const r = await exec(path, ['version'])
      if (!r.ok) { const detail = r.error || r.stderr || ('exit ' + r.exitCode); return { ok: false, version: '', error: String(detail).split(/\r?\n/)[0] || 'hdc 运行失败' } }
      return { ok: true, version: ((r.stdout || r.stderr || '').split(/\r?\n/)[0] || '').trim(), error: '' }
    }

    async function detectEnv() {
      const cfg = await readConfig()
      const j = await resolveJavaPath(cfg)
      const h = await resolveHdcPath(cfg)
      return { javaPath: j.path, hdcPath: h.path, javaSource: j.source, hdcSource: h.source, java: await checkJava(j.path), hdc: await checkHdc(h.path) }
    }

    async function killSidecar() {
      if (sidecarProc) {
        try { sidecarProc.terminate() } catch (e) {}
        try { await sidecarProc.done } catch (e) {}
        sidecarProc = null
        sidecarPort = 0
        sidecarSn = ''
      }
    }

    async function connectDevice(sn) {
      const cfg = await readConfig()
      const resDir = await resourceRoot()
      if (!resDir) return { ok: false, error: '找不到 sidecar 资源目录（工作区下的 PluginMain-Dynamic/ 或 PluginMain/）' }
      const sidecarOut = rel(resDir, SIDECAR_OUT_REL)
      const sdkJar = rel(resDir, SDK_JAR_REL)
      const cpSep = (await repoRoot()).indexOf('\\') >= 0 ? ';' : ':'
      const j = await resolveJavaPath(cfg)
      if (!j.path) return { ok: false, error: 'Java 未配置，请到设置中配置' }
      const h = await resolveHdcPath(cfg)
      if (!h.path) return { ok: false, error: 'hdc 未配置，请到设置中配置' }
      await killSidecar()
      const cwd = await workspaceCwd()
      if (!cwd) return { ok: false, error: '无法解析工作目录' }
      let handle
      try {
        handle = subprocess.spawn({
          argv: [j.path, '-cp', sdkJar + cpSep + sidecarOut, 'Main', '--sn', sn, '--hdc', h.path, '--port', '0', '--scale', '2'],
          cwd: cwd,
          stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' },
          graceMs: 3000,
        })
      } catch (e) {
        return { ok: false, error: 'sidecar 启动失败: ' + String((e && e.message) || e) }
      }
      let buf = ''
      let port = 0
      const done = new Promise(function (resolve) {
        try { handle.stdout.setEncoding('utf8') } catch (e) {}
        handle.stdout.on('data', function (chunk) {
          buf += String(chunk)
          const m = buf.match(/\{"ready":true,"port":(\d+)[^}]*\}/)
          if (m) { port = parseInt(m[1], 10); resolve(true) }
        })
        handle.done.then(function () { resolve(false) }).catch(function () { resolve(false) })
      })
      const ok = await Promise.race([done, sleep(20000).then(function () { return false }) ])
      if (!ok || !port) {
        await killSidecar()
        return { ok: false, error: 'sidecar 启动超时或失败' }
      }
      sidecarProc = handle
      sidecarPort = port
      sidecarSn = sn
      return { ok: true, port: port, sn: sn }
    }

    // ============================================================
    // AI 截图识别
    // ============================================================

    // 简易 semver 比较（含预发布标识），返回 -1/0/1
    function parseVersion(v) {
      const m = String(v || '').trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/)
      if (!m) return null
      return { major: parseInt(m[1], 10), minor: parseInt(m[2], 10), patch: parseInt(m[3], 10), pre: m[4] ? m[4].split('.') : [] }
    }
    function cmpPreId(a, b) {
      const an = /^\d+$/.test(a), bn = /^\d+$/.test(b)
      if (an && bn) { const d = parseInt(a, 10) - parseInt(b, 10); return d < 0 ? -1 : d > 0 ? 1 : 0 }
      if (an) return -1
      if (bn) return 1
      return a < b ? -1 : a > b ? 1 : 0
    }
    function compareVersion(a, b) {
      const A = parseVersion(a), B = parseVersion(b)
      if (!A || !B) return 0
      if (A.major !== B.major) return A.major - B.major
      if (A.minor !== B.minor) return A.minor - B.minor
      if (A.patch !== B.patch) return A.patch - B.patch
      if (A.pre.length === 0 && B.pre.length === 0) return 0
      if (A.pre.length === 0) return 1
      if (B.pre.length === 0) return -1
      const n = Math.min(A.pre.length, B.pre.length)
      for (let i = 0; i < n; i++) { const d = cmpPreId(A.pre[i], B.pre[i]); if (d) return d }
      return A.pre.length - B.pre.length
    }

    // 读取 DSH 版本：优先 dsh --version，失败则读安装包 package.json（均缓存）
    function readDshVersion() {
      if (dshVersionPromise) return dshVersionPromise
      dshVersionPromise = (async function () {
        try {
          const cwd = await workspaceCwd()
          if (subprocess && cwd) {
            const isWin = (await repoRoot()).indexOf('\\') >= 0
            const argv = isWin ? ['cmd.exe', '/c', 'dsh --version'] : ['/bin/sh', '-c', 'dsh --version']
            const handle = subprocess.spawn({
              argv: argv, cwd: cwd,
              stdio: { stdin: 'ignore', stdout: { maxBytes: 8192 }, stderr: { maxBytes: 4096 } },
              graceMs: 8000,
            })
            const outcome = await handle.done
            if (outcome.exitCode === 0) {
              const text = handle.collected.stdout ? handle.collected.stdout.readFrom(0).text : ''
              const m = String(text).match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)
              if (m) return m[0]
            }
          }
        } catch (e) {}
        try {
          const home = (await readEnvVar('DSH_HOME')) || ''
          let base = home
          if (!base) {
            const up = await readEnvVar('USERPROFILE')
            const hp = await readEnvVar('HOME')
            base = up ? (up + '\\.dsh') : (hp ? (hp + '/.dsh') : '')
          }
          if (base) {
            const pkgPath = rel(base, 'profiles/node_modules/@deepseek-ai/dsh/package.json')
            const t = await fileTarget(pkgPath)
            if (t) {
              const text = await fs.readText(t)
              const obj = JSON.parse(text)
              if (obj && obj.version) return String(obj.version)
            }
          }
        } catch (e) {}
        return ''
      })()
      return dshVersionPromise
    }

    // 门禁检查：开关 → DSH 版本 → 内置提供方 → 模型列表。全部通过才返回 { ok:true, llm, approval }
    async function visionGateCheck(sn) {
      const llm = ctx.get('llm')
      if (!llm) return { ok: false, error: 'llm 服务不可用，无法调用视觉模型' }
      const approval = ctx.get('approval')
      if (!approval) return { ok: false, error: 'approval 服务不可用，无法发起二次确认' }
      if (!shotEnabledSns[sn]) return { ok: false, error: '设备 ' + sn + ' 未开启「允许截图」开关（请在设备列表中开启后重试）' }
      const ver = await readDshVersion()
      if (!ver) return { ok: false, error: '无法读取 DSH 版本；截图识别仅支持 DSH ' + MIN_DSH_VERSION + ' 及以上版本' }
      if (compareVersion(ver, MIN_DSH_VERSION) < 0) return { ok: false, error: '当前 DSH 版本 ' + ver + ' 低于 ' + MIN_DSH_VERSION + '，截图识别不可用' }
      let providers = []
      try { providers = llm.listProviders() || [] } catch (e) { providers = [] }
      if (!providers.some(function (p) { return p && p.id === VISION_PROVIDER })) {
        return { ok: false, error: '未检测到内置 DeepSeek 提供方（' + VISION_PROVIDER + '），截图识别不可用' }
      }
      let models = []
      try { models = (await llm.listModels(VISION_PROVIDER)) || [] } catch (e) { models = [] }
      if (!models.some(function (m) { return m && m.id === VISION_MODEL })) {
        return { ok: false, error: '模型列表中没有 ' + VISION_MODEL + '，截图识别不可用' }
      }
      return { ok: true, llm: llm, approval: approval, version: ver }
    }

    // 确认设备在 hdc 在线列表，返回 { ok, hdc }
    async function deviceOnline(sn) {
      const cfg = await readConfig()
      const h = await resolveHdcPath(cfg)
      if (!h.path) return { ok: false, error: 'hdc 未配置，请到设置中填写 hdc 路径或设置 DEVECO_SDK_HOME 环境变量' }
      const hdcCheck = await checkHdc(h.path)
      if (!hdcCheck.ok) return { ok: false, error: 'hdc 不可用: ' + hdcCheck.error }
      const r = await exec(h.path, ['list', 'targets'])
      if (!r.ok) return { ok: false, error: r.error || r.stderr || 'hdc list targets 失败' }
      const lines = (r.stdout || '').split(/\r?\n/).map(function (s) { return s.trim() }).filter(function (s) { return s && s !== 'Empty' && s.toLowerCase() !== '[empty]' && !/^\[empty\]$/i.test(s) })
      if (lines.indexOf(sn) < 0) return { ok: false, error: '设备 ' + sn + ' 不在 hdc 在线列表（请检查 USB 调试/无线连接）' }
      return { ok: true, hdc: h.path }
    }

    // hdc snapshot_display 截图并拉回工作区，返回 { ok, bytes }
    // 注意：hdc 的设备选择参数是 -t <SN>（-s 是服务器 ip:port，传 SN 会报 port-string 错误）
    async function takeScreenshot(hdc, sn) {
      const r1 = await exec(hdc, ['-t', sn, 'shell', 'snapshot_display', '-f', REMOTE_SHOT_PATH])
      if (!r1.ok) return { ok: false, error: 'snapshot_display 失败: ' + (r1.error || r1.stderr || ('exit ' + r1.exitCode)) }
      const root = await repoRoot()
      const local = rel(root, LOCAL_SHOT_NAME)
      const r2 = await exec(hdc, ['-t', sn, 'file', 'recv', REMOTE_SHOT_PATH, local])
      if (!r2.ok) return { ok: false, error: 'file recv 失败: ' + (r2.error || r2.stderr || ('exit ' + r2.exitCode)) }
      exec(hdc, ['-t', sn, 'shell', 'rm', REMOTE_SHOT_PATH]).catch(function () {})
      const target = await fileTarget(local)
      if (!target) return { ok: false, error: '无法定位截图文件' }
      let bytes
      try { bytes = await fs.readBytes(target, undefined, 8 * 1024 * 1024) } catch (e) {
        return { ok: false, error: '读取截图失败: ' + String((e && e.message) || e) }
      }
      return { ok: true, bytes: bytes }
    }

    function sniffMediaType(bytes) {
      if (!bytes || bytes.length < 4) return ''
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png'
      if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg'
      return ''
    }

    // 二进制→base64（沙箱 btoa 是 UTF-8 语义，不能用于二进制）
    function bytesToBase64(bytes) {
      const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      let out = ''
      for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i]
        const b1 = bytes[i + 1]
        const b2 = bytes[i + 2]
        out += CH[b0 >> 2]
        out += CH[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)]
        out += b1 === undefined ? '=' : CH[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)]
        out += b2 === undefined ? '=' : CH[b2 & 63]
      }
      return out
    }

    // 保存图片并调用内置 deepseek-v4-flash-vision-exp 识别
    async function runVision(llm, attachments, bytes, mediaType, prompt, signal) {
      let refs
      try {
        refs = await attachments.saveImages([{ data: bytes, mediaType: mediaType, name: 'scrcpy-shot' }])
      } catch (e) {
        return { ok: false, error: '图片保存失败: ' + String((e && e.message) || e) }
      }
      if (!refs || !refs[0]) return { ok: false, error: '图片保存失败：未返回图片引用' }
      const ref = refs[0]
      let text = ''
      try {
        const stream = llm.stream({
          provider: VISION_PROVIDER,
          model: VISION_MODEL,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: String(prompt || '请描述当前手机屏幕的内容。') },
              { type: 'image', attachment: ref },
            ],
          }],
          signal: signal,
        })
        for await (const chunk of stream) {
          if (!chunk) continue
          if (chunk.type === 'text-delta') text += chunk.text
          else if (chunk.type === 'finish' && chunk.reason && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
            const msg = (chunk.reason.failure && chunk.reason.failure.message) || String(chunk.reason.kind)
            return { ok: false, error: '视觉模型调用失败: ' + msg }
          }
        }
      } catch (e) {
        return { ok: false, error: '视觉模型调用异常: ' + String((e && e.message) || e) }
      }
      if (!text) return { ok: false, error: '视觉模型未返回内容' }
      return { ok: true, text: text }
    }

    function buildShotTool() {
      return harness.defineTool({
        name: 'hos_scrcpy_screenshot',
        description: '截取 hdc 在线鸿蒙手机的当前屏幕画面，并调用内置 deepseek-v4-flash-vision-exp 视觉模型进行识别回答。使用前提：目标设备已在设备列表中开启「允许截图」开关；每次截图前会弹出高危操作二次确认，用户允许后才执行。',
        parameters: {
          prompt: {
            type: 'string',
            required: true,
            description: '你想从屏幕画面中了解什么（例如：当前页面是什么应用？界面上有哪些按钮？屏幕显示了什么错误？）。将作为视觉模型的提问内容。',
          },
          sn: {
            type: 'string',
            description: '目标设备序列号（hdc list targets 中的 SN）。省略时使用当前投屏连接的设备。',
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              ok: { type: 'boolean', required: true },
              sn: { type: 'string' },
              model: { type: 'string' },
              prompt: { type: 'string' },
              text: { type: 'string' },
              error: { type: 'string' },
            },
          },
          render(args, value) {
            if (!value || value.ok !== true) {
              return [{ type: 'text', text: '截图识别失败：' + ((value && value.error) || '未知错误') }]
            }
            return [{ type: 'text', text: '【截图识别 · ' + value.sn + ' · ' + value.model + '】\n' + (value.text || '（无内容）') }]
          },
        },
        timeoutMs: 120000,
        async execute(args, exec) {
          const prompt = String((args && args.prompt) || '').trim() || '请描述当前手机屏幕的内容。'
          let sn = String((args && args.sn) || '').trim()
          if (!sn) sn = sidecarSn
          if (!sn) return { ok: false, error: '缺少设备 SN：请传入 sn 参数，或先连接投屏后再调用' }
          const gate = await visionGateCheck(sn)
          if (!gate.ok) return { ok: false, error: gate.error }
          const online = await deviceOnline(sn)
          if (!online.ok) return { ok: false, error: online.error }
          // 截图前：复用 DSH 高危命令二次确认框
          if (!exec.agent) return { ok: false, error: '缺少调用代理身份，无法发起确认' }
          let outcome
          try {
            outcome = await gate.approval.request({
              agent: exec.agent,
              toolName: 'hos_scrcpy_screenshot',
              reason: '允许截取设备 ' + sn + ' 的当前屏幕画面，并发送给 ' + VISION_MODEL + ' 视觉模型识别？',
              signal: exec.signal,
            })
          } catch (e) {
            return { ok: false, error: '二次确认失败: ' + String((e && e.message) || e) }
          }
          if (outcome !== 'allowed-once') return { ok: false, error: '用户未允许截图（' + String(outcome) + '）' }
          const shot = await takeScreenshot(online.hdc, sn)
          if (!shot.ok) return { ok: false, error: shot.error }
          const mediaType = sniffMediaType(shot.bytes)
          if (!mediaType) return { ok: false, error: '无法识别的截图格式（仅支持 PNG/JPEG）' }
          const attachments = ctx.get('attachments')
          if (!attachments) return { ok: false, error: 'attachments 服务不可用' }
          const vision = await runVision(gate.llm, attachments, shot.bytes, mediaType, prompt, exec.signal)
          if (!vision.ok) return { ok: false, error: vision.error }
          return { ok: true, sn: sn, model: VISION_MODEL, prompt: prompt, text: vision.text }
        },
      })
    }

    // 至少一个设备开启时注册工具，全部关闭时注销
    function syncShotTool() {
      const anyEnabled = Object.keys(shotEnabledSns).some(function (k) { return !!shotEnabledSns[k] })
      if (anyEnabled && !shotToolDisposer) {
        if (!shotTool) shotTool = buildShotTool()
        try { shotToolDisposer = harness.registerTool(ctx, shotTool) } catch (e) {
          console.error('注册 hos_scrcpy_screenshot 工具失败: ' + String((e && e.message) || e))
        }
      } else if (!anyEnabled && shotToolDisposer) {
        try { shotToolDisposer() } catch (e) {}
        shotToolDisposer = null
      }
    }

    harness.handle('cfg:get', async function () { return await readConfig() })
    harness.handle('cfg:save', async function (args) {
      const cfg = {
        javaPath: String((args && args.javaPath) || '').trim(),
        hdcPath: String((args && args.hdcPath) || '').trim(),
      }
      const res = await writeConfig(cfg)
      if (!res.ok) return { ok: false, error: res.error }
      return { ok: true, config: cfg }
    })
    harness.handle('env:detect', async function () { return await detectEnv() })
    harness.handle('devices:list', async function () {
      const cfg = await readConfig()
      const h = await resolveHdcPath(cfg)
      if (!h.path) return { ok: false, error: 'hdc 未配置，请先到设置中填写 hdc 路径或设置 DEVECO_SDK_HOME 环境变量', config: cfg }
      const hdcCheck = await checkHdc(h.path)
      if (!hdcCheck.ok) return { ok: false, error: 'hdc 不可用: ' + hdcCheck.error, config: cfg, hdc: hdcCheck }
      const r = await exec(h.path, ['list', 'targets'])
      if (!r.ok) return { ok: false, error: r.error || r.stderr || 'hdc list targets 失败', config: cfg, hdc: hdcCheck }
      const text = (r.stdout || '').trim()
      const lines = text.split(/\r?\n/).map(function (s) { return s.trim() }).filter(function (s) { return s && s !== 'Empty' && s.toLowerCase() !== '[empty]' && !/^\[empty\]$/i.test(s) })
      return { ok: true, config: cfg, hdc: hdcCheck, devices: lines.map(function (sn) { return { sn: sn } }) }
    })
    harness.handle('device:connect', async function (args) {
      const sn = String((args && args.sn) || '').trim()
      if (!sn) return { ok: false, error: '缺少设备 SN' }
      return await connectDevice(sn)
    })
    harness.handle('device:disconnect', async function () {
      await killSidecar()
      return { ok: true }
    })
    harness.handle('sidecar:status', async function () {
      return { running: !!sidecarProc, port: sidecarPort, sn: sidecarSn }
    })
    harness.handle('jmuxer:source', async function () {
      const p = await resPath(JMUXER_REL)
      if (!p) return { ok: false, error: '找不到 jmuxer.min.js（资源目录未定位）' }
      try {
        const t = await fileTarget(p)
        if (t) {
          const text = await fs.readText(t)
          return { ok: true, source: text }
        }
      } catch (e) {}
      const text = await shellReadText(p)
      if (text) return { ok: true, source: text }
      return { ok: false, error: '读取 jmuxer.min.js 失败' }
    })
    // ---- 截图识别 RPC ----
    harness.handle('shot:enabled', async function () {
      return { enabled: Object.assign({}, shotEnabledSns) }
    })
    harness.handle('shot:set-enabled', async function (args) {
      const sn = String((args && args.sn) || '').trim()
      const enabled = !!(args && args.enabled)
      if (!sn) return { ok: false, error: '缺少设备 SN' }
      if (enabled) shotEnabledSns[sn] = true
      else delete shotEnabledSns[sn]
      syncShotTool()
      return { ok: true, enabled: enabled, registered: !!shotToolDisposer, count: Object.keys(shotEnabledSns).length }
    })
    // 截取屏幕并返回 base64（「添加截图至聊天框」按钮用；直接用户手势，不走二次确认/视觉模型）
    harness.handle('shot:capture', async function (args) {
      let sn = String((args && args.sn) || '').trim()
      if (!sn) sn = sidecarSn
      if (!sn) return { ok: false, error: '缺少设备 SN：请先连接投屏' }
      const online = await deviceOnline(sn)
      if (!online.ok) return { ok: false, error: online.error }
      const shot = await takeScreenshot(online.hdc, sn)
      if (!shot.ok) return { ok: false, error: shot.error }
      const mediaType = sniffMediaType(shot.bytes)
      if (!mediaType) return { ok: false, error: '无法识别的截图格式（仅支持 PNG/JPEG）' }
      return { ok: true, sn: sn, mediaType: mediaType, base64: bytesToBase64(shot.bytes), bytes: shot.bytes.length }
    })

    // ---- 提示词追加（只增不改，避免与其他修改提示词的软件冲突）----
    // 仅当「已投屏且该设备允许截图」时，向模型注入一段能力提示；否则返回空串（渲染时自动省略）。
    const sysPrompt = ctx.get('systemPrompt')
    if (sysPrompt) {
      sysPrompt.section({
        name: 'dsh-hos-scrcpy-screenshot',
        order: 9500,
        text: function () {
          if (sidecarSn && shotEnabledSns[sidecarSn]) {
            return '当前用户正在投屏手机且允许截图。可使用hos_scrcpy_screenshot工具申请识别当前手机屏幕内容。'
          }
          return ''
        },
      })
    }

    ctx.on('dispose', function () {
      if (shotToolDisposer) { try { shotToolDisposer() } catch (e) {} shotToolDisposer = null }
      shotToolDisposer = null
      killSidecar()
    })
  },
}
