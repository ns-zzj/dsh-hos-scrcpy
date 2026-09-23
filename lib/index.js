// ============================================================
// dsh-hos-scrcpy — 插件 Host 半区（静态 npm 包版 · v2.0）
//
// v2.0 新功能（迁移自 PluginMain-Dynamic/host.js v3）：
//   - AI 截图识别（hos_scrcpy_screenshot，reasoningEffort: high）
//   - UI 控件树定位（hos_scrcpy_locate，hdc uitest dumpLayout → 压缩控件清单）
//   - 点击 / 长按（hos_scrcpy_tap / hos_scrcpy_longpress，确认制 + 入队）
//   - 系统按键（hos_scrcpy_key，返回 / Home）
//   - 文本输入（hos_scrcpy_input，聚焦输入框注入）
//   - 权限改为三态：off / confirm（需确认）/ trust（无需确认）
//   - 允许控制 / 允许按键 / 允许输入 均依赖「允许截图」
//   - 落点预览（二次确认期间投屏画面叠闪烁绿点，Client 轮询 ctl:preview）
//   - 手势经现有 WebSocket 由 Client 发送（ctl:dequeue 取队列）
//
// 与动态版的差异（延续静态版约定）：
//   1. 不再使用动态沙箱的 harness.handle / harness.defineTool /
//      harness.registerTool 全局，改为：
//        - ctx.webServer 注册 JSON RPC 路由 POST /dsh-hos-scrcpy/rpc
//        - @deepseek-ai/dsh-tools 的 defineTool + ctx.tools.register
//   2. 资源定位：包内 resources/（import.meta.url），不再依赖工作区
//   3. 截图临时文件：os.tmpdir()（动态版拉回会话工作区，静态版无此概念）
//   4. hdc 设备选择统一用 -t <SN>（-s 是服务器 ip:port，传 SN 会报错）
//   5. 环境变量直接读 process.env，进程管理用 node:child_process
//   6. UI 控件树较大时用 run() 的 8MB maxBuffer 读取，无截断风险
// ============================================================

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn, execFile } from 'node:child_process'
import os from 'node:os'
import { defineTool } from '@deepseek-ai/dsh-tools'

// ---- 包内资源定位（npm 包安装后固定不变） ----
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RES = (p) => join(PKG_ROOT, 'resources', p)
const SIDECAR_OUT = RES('out')
const SDK_JAR = RES('hosScrcpy-1.0.18-beta.jar')
const JMUXER_FILE = RES('jmuxer.min.js')

// 配置文件放在 $DSH_HOME 下（随用户，不随工作区）
const CONFIG_DIR = process.env.DSH_HOME || join(os.homedir(), '.dsh')
const CONFIG_FILE = join(CONFIG_DIR, 'dsh-hos-scrcpy.json')

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
const DEFAULT_VISION_MODEL = 'deepseek-flash'          // 默认识别模型（可在设置中更改）
const MIN_DSH_VERSION = '0.1.0-rc8'                    // 最低支持版本
const REMOTE_SHOT_PATH = '/data/local/tmp/dsh-scrcpy-shot.jpeg'  // snapshot_display 只接受 .jpeg 后缀
const LOCAL_SHOT_NAME = 'dsh-scrcpy-shot.jpeg'

// 按键白名单（hos_scrcpy_key）
const ALLOWED_KEYS = ['back', 'home']

// ---- 编码参数 ----
// 实测 SDK 自身的默认是 frameRate=120 / bitRate=30Mbps，对网页软解来说离谱
// （浏览器一个核跑满、内存猛涨），所以这里主动压下来：有线 60fps、无线 30fps。
// 下面三项是**固定值**，不进设置界面、也不读配置文件（2026-09-24 起）：
//   - 无线画质固定 1/4（scale=4；有线固定 2）
//   - 码率固定不覆盖（0）：实测 SDK 会对自己收到的数值再做一次换算
//     （传 8000000，它 getParams() 里变成 536870912 ≈ 512Mbps），没弄清单位前不乱填
//   - 关键帧间隔固定 2000ms：活跃时约每 3s 一个 IDR，够用且不涨码率
const DEFAULT_FRAME_RATE_WIRED = 60
const DEFAULT_FRAME_RATE_WIRELESS = 30
const DEFAULT_IFRAME_INTERVAL = 2000
const DEFAULT_BIT_RATE = 0
const DEFAULT_WIRELESS_SCALE = 4

// ---- sidecar 进程表：多设备时每台设备一个进程 ----
// sn -> { proc, port, wireless, scale, frameRate, bitRate, iFrameInterval }
const sidecars = new Map()
// 当前“聚焦”的设备（投屏面板可见的那台）；AI 工具一律作用于它，没有就明确报错，
// 不做“猜一台”这种事——多设备下猜错的操作代价太大。
let focusedSn = ''

// ---- AI 权限状态（进程级；三态 mode: off/confirm/trust） ----
let shotModeSns = {}             // { [sn]: mode } 截图识别权限模式
let ctlModeSns = {}              // { [sn]: mode } 允许控制（locate/tap/longpress）
let keyModeSns = {}              // { [sn]: mode } 按键（返回/主页）
let inputModeSns = {}            // { [sn]: mode } 文本输入

// ---- 工具对象与注销函数 ----
let shotTool = null, shotToolDisposer = null, shotToolRegisterError = ''
let locTool = null, locToolDisposer = null
let tapTool = null, tapToolDisposer = null
let lpTool = null, lpToolDisposer = null
let keyTool = null, keyToolDisposer = null
let inputTool = null, inputToolDisposer = null

// ---- 待 Client 经现有 WS 发送的手势队列 ----
let ctlPending = []              // [{seq,kind,fx,fy,intent,holdMs?}]
let ctlSeq = 0                   // 递增手势序列号
let ctlPreview = null            // 当次手势的落点预览（二次确认期间发布，取走手势时清除）
let dshVersionPromise = null     // 版本探测结果缓存

// ---- 基础工具 ----
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function pathSep(p) { return p.indexOf('\\') >= 0 ? '\\' : '/' }
function javaCandidatesFromEnv(home) {
  const s = pathSep(home)
  return [home + s + 'bin' + s + 'java.exe', home + s + 'bin' + s + 'java']
}
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

// ---- 配置读写 ----
function emptyConfig() {
  return {
    javaPath: '', hdcPath: '', visionModel: '',
    wiredFrameRate: 0, wirelessFrameRate: 0,
  }
}

function readConfig() {
  try {
    const obj = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
    return {
      javaPath: String(obj.javaPath || ''),
      hdcPath: String(obj.hdcPath || ''),
      visionModel: String(obj.visionModel || ''),
      wiredFrameRate: Number(obj.wiredFrameRate) > 0 ? Number(obj.wiredFrameRate) : 0,
      wirelessFrameRate: Number(obj.wirelessFrameRate) > 0 ? Number(obj.wirelessFrameRate) : 0,
    }
  } catch {
    return emptyConfig()
  }
}

function writeConfig(cfg) {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
}

// ---- 子进程执行（一次性命令） ----
function run(exe, args) {
  return new Promise((resolve) => {
    execFile(exe, args, { maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        resolve({
          ok: false,
          exitCode: typeof err.code === 'number' ? err.code : -1,
          stdout: String(stdout || ''),
          stderr: String(stderr || err.message || ''),
        })
      } else {
        resolve({ ok: true, exitCode: 0, stdout: String(stdout || ''), stderr: String(stderr || '') })
      }
    })
  })
}

// ---- 路径解析 ----
function resolveJavaPath(cfg) {
  if (cfg.javaPath) return { path: cfg.javaPath, source: 'config' }
  const home = process.env.JAVA_HOME
  if (home) {
    for (const p of javaCandidatesFromEnv(home)) {
      if (existsSync(p)) return { path: p, source: 'JAVA_HOME' }
    }
  }
  for (const p of JAVA_CANDIDATES) {
    if (existsSync(p)) return { path: p, source: 'candidate' }
  }
  return { path: '', source: '' }
}

function resolveHdcPath(cfg) {
  if (cfg.hdcPath) return { path: cfg.hdcPath, source: 'config' }
  const sdk = process.env.DEVECO_SDK_HOME
  if (sdk) {
    for (const p of hdcCandidatesFromEnv(sdk)) {
      if (existsSync(p)) return { path: p, source: 'DEVECO_SDK_HOME' }
    }
  }
  for (const p of HDC_CANDIDATES) {
    if (existsSync(p)) return { path: p, source: 'candidate' }
  }
  return { path: '', source: '' }
}

async function checkJava(path) {
  if (!path) return { ok: false, version: '', error: '未配置 Java 路径' }
  const r = await run(path, ['-version'])
  if (!r.ok) {
    const detail = r.stderr || ('exit ' + r.exitCode)
    return { ok: false, version: '', error: String(detail).split(/\r?\n/)[0] || 'Java 运行失败' }
  }
  return { ok: true, version: ((r.stderr || r.stdout || '').split(/\r?\n/)[0] || '').trim(), error: '' }
}

async function checkHdc(path) {
  if (!path) return { ok: false, version: '', error: '未配置 hdc 路径' }
  const r = await run(path, ['version'])
  if (!r.ok) {
    const detail = r.stderr || ('exit ' + r.exitCode)
    return { ok: false, version: '', error: String(detail).split(/\r?\n/)[0] || 'hdc 运行失败' }
  }
  return { ok: true, version: ((r.stdout || r.stderr || '').split(/\r?\n/)[0] || '').trim(), error: '' }
}

async function detectEnv() {
  const cfg = readConfig()
  const j = resolveJavaPath(cfg)
  const h = resolveHdcPath(cfg)
  return {
    javaPath: j.path,
    hdcPath: h.path,
    javaSource: j.source,
    hdcSource: h.source,
    java: await checkJava(j.path),
    hdc: await checkHdc(h.path),
  }
}

// ---- sidecar 生命周期（多设备：每台一个进程） ----
function killProc(proc) {
  if (!proc) return
  try {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      killer.on('error', () => { try { proc.kill() } catch {} })
      setTimeout(() => { try { proc.kill() } catch {} }, 1500)
    } else {
      try { proc.kill() } catch {}
    }
  } catch {
    try { proc.kill() } catch {}
  }
}

function killSidecarFor(sn) {
  const entry = sidecars.get(sn)
  if (!entry) return
  sidecars.delete(sn)
  if (focusedSn === sn) focusedSn = ''
  killProc(entry.proc)
}

function killAllSidecars() {
  for (const sn of Array.from(sidecars.keys())) killSidecarFor(sn)
}

function sidecarList() {
  return Array.from(sidecars.entries()).map(function (kv) {
    const v = kv[1]
    return { sn: kv[0], port: v.port, wireless: v.wireless, scale: v.scale, frameRate: v.frameRate }
  })
}

/** AI 工具的目标设备：必须是当前聚焦（面板可见）的那台。 */
function requireFocusedSn() {
  if (!focusedSn) {
    return { ok: false, error: '当前没有聚焦的投屏设备：先在某台设备的投屏面板里打开画面，再让我操作它' }
  }
  if (!sidecars.has(focusedSn)) {
    return { ok: false, error: '聚焦的设备 ' + focusedSn + ' 已断开，请重新投屏后再操作' }
  }
  return { ok: true, sn: focusedSn }
}

/**
 * 判断设备是有线(USB)还是无线(TCP)。
 * 依据 `hdc list targets -v` 里该设备那行的传输类型列（实测输出形如：
 * `192.168.1.241:35147		TCP	Connected	localhost	hdc`）；取不到时用地址形态兜底
 * （ip:port 视作无线——模拟器/网络设备都长这样）。
 * @returns {Promise<boolean>} true = 无线
 */
async function isWirelessDevice(hdc, sn) {
  try {
    const r = await run(hdc, ['list', 'targets', '-v'])
    if (r.ok && r.stdout) {
      const line = String(r.stdout).split(/\r?\n/).find((l) => l.trim().indexOf(sn) === 0)
      if (line) {
        if (/\bUSB\b/i.test(line)) return false
        if (/\bTCP\b/i.test(line)) return true
      }
    }
  } catch (e) { /* 拿不到 -v 输出就走兜底判断 */ }
  return /^[\d.]+:\d+$/.test(String(sn))
}

async function connectDevice(sn) {
  // 同一台设备已经在跑：直接复用（不断开重连，避免打断正在看的画面）
  const existing = sidecars.get(sn)
  if (existing) {
    return {
      ok: true, port: existing.port, sn: sn, wireless: existing.wireless, scale: existing.scale,
      frameRate: existing.frameRate, bitRate: existing.bitRate, iFrameInterval: existing.iFrameInterval, reused: true,
    }
  }
  const cfg = readConfig()
  const j = resolveJavaPath(cfg)
  if (!j.path) return { ok: false, error: 'Java 未配置，请到设置中配置' }
  const h = resolveHdcPath(cfg)
  if (!h.path) return { ok: false, error: 'hdc 未配置，请到设置中配置' }
  if (!existsSync(SIDECAR_OUT) || !existsSync(SDK_JAR)) {
    return { ok: false, error: 'sidecar 资源缺失（resources/out 或 resources/hosScrcpy-1.0.18-beta.jar）' }
  }
  const cpSep = process.platform === 'win32' ? ';' : ':'
  // 无线比有线卡得多：无线固定把视频流缩到 1/4（scale 数越大画面越小越省流），有线固定 2
  const wireless = await isWirelessDevice(h.path, sn)
  const scale = wireless ? DEFAULT_WIRELESS_SCALE : 2
  const frameRate = wireless
    ? (Number(cfg.wirelessFrameRate) > 0 ? Number(cfg.wirelessFrameRate) : DEFAULT_FRAME_RATE_WIRELESS)
    : (Number(cfg.wiredFrameRate) > 0 ? Number(cfg.wiredFrameRate) : DEFAULT_FRAME_RATE_WIRED)
  const bitRate = DEFAULT_BIT_RATE
  const iFrameInterval = DEFAULT_IFRAME_INTERVAL
  let proc
  try {
    proc = spawn(j.path, ['-cp', SDK_JAR + cpSep + SIDECAR_OUT, 'Main', '--sn', sn, '--hdc', h.path, '--port', '0',
      '--scale', String(scale), '--frame-rate', String(frameRate), '--bit-rate', String(bitRate),
      '--ifr', String(iFrameInterval), '--idle-exit', '300'], {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch (e) {
    return { ok: false, error: 'sidecar 启动失败: ' + String((e && e.message) || e) }
  }
  let spawnError = ''
  const port = await new Promise((resolve) => {
    let buf = ''
    let settled = false
    const onData = (chunk) => {
      buf += String(chunk)
      const m = buf.match(/\{"ready":true,"port":(\d+)[^}]*\}/)
      if (m && !settled) {
        settled = true
        // 就绪后摘掉监听器，避免 sidecar 持续打印帧统计导致 buf 无限增长
        try { proc.stdout.removeListener('data', onData) } catch (e) {}
        resolve(parseInt(m[1], 10))
      }
    }
    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', onData)
    proc.on('error', (err) => {
      if (!settled) { settled = true; spawnError = String((err && err.message) || err); killProc(proc); resolve(0) }
    })
    proc.on('exit', () => {
      if (!settled) { settled = true; killProc(proc); resolve(0) }
    })
    setTimeout(() => {
      if (!settled) { settled = true; killProc(proc); resolve(0) }
    }, 20000)
  })
  if (!port) {
    return { ok: false, error: spawnError ? ('sidecar 启动失败: ' + spawnError) : 'sidecar 启动超时或失败' }
  }
  sidecars.set(sn, {
    proc: proc, port: port, wireless: wireless, scale: scale,
    frameRate: frameRate, bitRate: bitRate, iFrameInterval: iFrameInterval,
  })
  return { ok: true, port: port, sn: sn, wireless: wireless, scale: scale, frameRate: frameRate, bitRate: bitRate, iFrameInterval: iFrameInterval }
}

// ============================================================
// 截图识别
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

// 读取 DSH 版本：优先解析安装包 package.json（静态版直接用 node:fs，无 shell 依赖）
function readDshVersion() {
  if (dshVersionPromise) return dshVersionPromise
  dshVersionPromise = (async function () {
    const home = process.env.DSH_HOME || join(os.homedir(), '.dsh')
    const candidates = [
      join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
      join(home, 'profiles', 'web', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
    ]
    try {
      const req = createRequire(import.meta.url)
      candidates.push(req.resolve('@deepseek-ai/dsh/package.json'))
    } catch (e) {}
    for (const p of candidates) {
      try {
        const obj = JSON.parse(readFileSync(p, 'utf8'))
        if (obj && obj.version) return String(obj.version)
      } catch (e) {}
    }
    return ''
  })()
  return dshVersionPromise
}

// 支持图片输入的模型（DSH 的模型对象带 inputModalities，含 'image' 表示可收图）
async function listVisionModels(llm) {
  let models = []
  try { models = (await llm.listModels(VISION_PROVIDER)) || [] } catch (e) { models = [] }
  return models.filter(function (m) {
    if (!m || !m.id) return false
    const mods = Array.isArray(m.inputModalities) ? m.inputModalities : []
    return mods.indexOf('image') >= 0
  })
}

// 解析生效的识别模型：设置值 → 默认值 → provider 里第一个支持图片的
// fallback=true 表示设置里的模型已不可用、已自动回退
async function resolveVisionModel(llm) {
  const vision = await listVisionModels(llm)
  if (!vision.length) {
    return { ok: false, error: '未在内置 DeepSeek 提供方找到支持图片输入的模型，截图识别不可用', models: [] }
  }
  const wanted = String(readConfig().visionModel || DEFAULT_VISION_MODEL)
  let hit = null
  for (const m of vision) if (m.id === wanted) hit = m
  if (!hit) hit = vision[0]
  return { ok: true, model: hit.id, models: vision, fallback: hit.id !== wanted, wanted: wanted }
}

// 门禁检查：权限模式 → DSH 版本 → 内置提供方 → 识别模型。全部通过才返回 { ok:true, llm, approval, mode, model }
async function visionGateCheck(ctx, sn) {
  const llm = ctx.get('llm')
  if (!llm) return { ok: false, error: 'llm 服务不可用，无法调用视觉模型' }
  const approval = ctx.get('approval')
  if (!approval) return { ok: false, error: 'approval 服务不可用，无法发起二次确认' }
  const shotMode = shotModeSns[sn]
  if (!shotMode || shotMode === 'off') return { ok: false, error: '设备 ' + sn + ' 的「允许截图」为禁止使用（请在设置中选择需要确认/无需确认）' }
  const ver = await readDshVersion()
  if (!ver) return { ok: false, error: '无法读取 DSH 版本；截图识别仅支持 DSH ' + MIN_DSH_VERSION + ' 及以上版本' }
  if (compareVersion(ver, MIN_DSH_VERSION) < 0) return { ok: false, error: '当前 DSH 版本 ' + ver + ' 低于 ' + MIN_DSH_VERSION + '，截图识别不可用' }
  let providers = []
  try { providers = llm.listProviders() || [] } catch (e) { providers = [] }
  if (!providers.some(function (p) { return p && p.id === VISION_PROVIDER })) {
    return { ok: false, error: '未检测到内置 DeepSeek 提供方（' + VISION_PROVIDER + '），截图识别不可用' }
  }
  const resolved = await resolveVisionModel(llm)
  if (!resolved.ok) return { ok: false, error: resolved.error }
  return { ok: true, llm: llm, approval: approval, version: ver, mode: shotMode, model: resolved.model, models: resolved.models, modelFallback: resolved.fallback, modelWanted: resolved.wanted }
}

// 确认设备在 hdc 在线列表，返回 { ok, hdc }
async function deviceOnline(sn) {
  const cfg = readConfig()
  const h = resolveHdcPath(cfg)
  if (!h.path) return { ok: false, error: 'hdc 未配置，请到设置中填写 hdc 路径或设置 DEVECO_SDK_HOME 环境变量' }
  const hdcCheck = await checkHdc(h.path)
  if (!hdcCheck.ok) return { ok: false, error: 'hdc 不可用: ' + hdcCheck.error }
  const r = await run(h.path, ['list', 'targets'])
  if (!r.ok) return { ok: false, error: r.stderr || 'hdc list targets 失败' }
  const lines = (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && s !== 'Empty' && s.toLowerCase() !== '[empty]' && !/^\[empty\]$/i.test(s))
  if (lines.indexOf(sn) < 0) return { ok: false, error: '设备 ' + sn + ' 不在 hdc 在线列表（请检查 USB 调试/无线连接）' }
  return { ok: true, hdc: h.path }
}

// hdc snapshot_display 截图并拉回系统临时目录，返回 { ok, bytes }
async function takeScreenshot(hdc, sn) {
  const r1 = await run(hdc, ['-t', sn, 'shell', 'snapshot_display', '-f', REMOTE_SHOT_PATH])
  if (!r1.ok) return { ok: false, error: 'snapshot_display 失败: ' + (r1.stderr || r1.stdout || ('exit ' + r1.exitCode)) }
  const local = join(os.tmpdir(), LOCAL_SHOT_NAME)
  const r2 = await run(hdc, ['-t', sn, 'file', 'recv', REMOTE_SHOT_PATH, local])
  if (!r2.ok) return { ok: false, error: 'file recv 失败: ' + (r2.stderr || r2.stdout || ('exit ' + r2.exitCode)) }
  run(hdc, ['-t', sn, 'shell', 'rm', REMOTE_SHOT_PATH]).catch(function () {})
  try {
    const bytes = readFileSync(local)
    return { ok: true, bytes: new Uint8Array(bytes) }
  } catch (e) {
    return { ok: false, error: '读取截图失败: ' + String((e && e.message) || e) }
  }
}

function sniffMediaType(bytes) {
  if (!bytes || bytes.length < 4) return ''
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png'
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg'
  return ''
}

// 二进制→base64（btoa 是 UTF-8 语义，不能用于二进制）
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

// 保存图片并调用指定的内置视觉模型识别（reasoningEffort: high）
async function runVision(llm, attachments, bytes, mediaType, prompt, signal, model) {
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
      model: model,
      reasoningEffort: 'high',
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

function buildShotTool(ctx) {
  return defineTool({
    name: 'hos_scrcpy_screenshot',
    description: '截取 hdc 在线鸿蒙手机的当前屏幕画面，并调用内置视觉模型进行识别回答（用于确认当前页面内容、找目标控件的大致文字/描述）。识别模型可在设置中更改，默认 ' + DEFAULT_VISION_MODEL + '。使用前提：目标设备已在设备列表中开启「允许截图」开关（confirm 模式每次截图前二次确认，trust 模式直接执行）；作用于当前投屏连接的设备。',
    parameters: {
      prompt: {
        type: 'string',
        required: true,
        description: '你想从屏幕画面中了解什么（例如：当前页面是什么应用？界面上有哪些按钮和文字？）。将作为视觉模型的提问内容。',
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
    timeoutMs: 180000,
    async execute(args, exec) {
      const prompt = String((args && args.prompt) || '').trim() || '请描述当前手机屏幕的内容。'
      const focused = requireFocusedSn()
      if (!focused.ok) return { ok: false, error: focused.error }
      const sn = focused.sn
      const gate = await visionGateCheck(ctx, sn)
      if (!gate.ok) return { ok: false, error: gate.error }
      const online = await deviceOnline(sn)
      if (!online.ok) return { ok: false, error: online.error }
      // 「无需确认」模式直接放行，不弹二次确认
      if (gate.mode !== 'trust') {
        if (!exec.agent) return { ok: false, error: '缺少调用代理身份，无法发起确认' }
        let outcome
        try {
          outcome = await gate.approval.request({
            agent: exec.agent,
            toolName: 'hos_scrcpy_screenshot',
            reason: '允许截取设备 ' + sn + ' 的当前屏幕画面，并发送给 ' + gate.model + ' 视觉模型识别？',
            signal: exec.signal,
          })
        } catch (e) {
          return { ok: false, error: '二次确认失败: ' + String((e && e.message) || e) }
        }
        if (outcome !== 'allowed-once') return { ok: false, error: '用户未允许截图（' + String(outcome) + '）' }
      }
      const shot = await takeScreenshot(online.hdc, sn)
      if (!shot.ok) return { ok: false, error: shot.error }
      const mediaType = sniffMediaType(shot.bytes)
      if (!mediaType) return { ok: false, error: '无法识别的截图格式（仅支持 PNG/JPEG）' }
      const attachments = ctx.get('attachments')
      if (!attachments) return { ok: false, error: 'attachments 服务不可用' }
      const vision = await runVision(gate.llm, attachments, shot.bytes, mediaType, prompt, exec.signal, gate.model)
      if (!vision.ok) return { ok: false, error: vision.error }
      return { ok: true, sn: sn, model: gate.model, prompt: prompt, text: vision.text }
    },
  })
}

// ============================================================
// UI 控件树定位（hdc uitest dumpLayout）
// ============================================================
// 读设备端文件（布局 JSON 可能上百 KB，run() 用 8MB maxBuffer，无截断）
async function catRemoteFile(hdc, sn, path) {
  const r = await run(hdc, ['-t', sn, 'shell', 'cat', path])
  if (!r.ok) return { ok: false, error: 'cat 退出码 ' + r.exitCode + (r.stderr ? (' · ' + r.stderr) : '') }
  const text = String(r.stdout || '')
  if (text && text.trim()) return { ok: true, text: text }
  return { ok: false, error: 'cat 返回空内容' }
}

// 实测：uitest dumpLayout 无参执行时输出 "DumpLayout saved to:<路径>"，结果存为 JSON 文件。
// 先无参执行提取路径，cat 回来；失败再退回 -p 固定路径。
async function dumpUiLayout(hdc, sn) {
  let path = ''
  const r0 = await run(hdc, ['-t', sn, 'shell', 'uitest', 'dumpLayout'])
  if (r0.ok) {
    const m = String(r0.stdout || '').match(/DumpLayout saved to:\s*(\S+)/i)
    if (m) path = m[1]
  }
  if (path) {
    const c = await catRemoteFile(hdc, sn, path)
    run(hdc, ['-t', sn, 'shell', 'rm', path]).catch(function () {})
    if (c.ok) return { ok: true, json: c.text }
    return { ok: false, error: '读取布局文件失败: ' + c.error }
  }
  // 兜底：-p 写固定文件
  const p = '/data/local/tmp/dsh-ui-layout.json'
  const r = await run(hdc, ['-t', sn, 'shell', 'uitest', 'dumpLayout', '-p', p])
  if (!r.ok) return { ok: false, error: 'uitest dumpLayout 失败: ' + (r.stderr || r.stdout || ('exit ' + r.exitCode)) }
  const c = await catRemoteFile(hdc, sn, p)
  run(hdc, ['-t', sn, 'shell', 'rm', p]).catch(function () {})
  if (c.ok) return { ok: true, json: c.text }
  return { ok: false, error: '读取布局文件失败: ' + c.error }
}

// 解析 uitest dumpLayout 的 JSON 文本为控件列表。
// 整树 JSON.parse 在深层嵌套（本设备实测 3 万+ 层）会爆栈，改为逐节点机械扫描：
// 正则定位每个 "attributes":{...} 扁平对象，只解析该对象，深度无关。
function parseUiControls(jsonText) {
  const out = []
  const s = String(jsonText || '')
  const re = /"attributes":\s*\{/g
  let m
  while ((m = re.exec(s)) !== null) {
    let i = m.index + m[0].length - 1   // 指向 '{'
    let depth = 1, inStr = false, j = i + 1
    for (; j < s.length && depth > 0; j++) {
      const c = s[j]
      if (inStr) {
        if (c === '\\') j++
        else if (c === '"') inStr = false
      } else {
        if (c === '"') inStr = true
        else if (c === '{') depth++
        else if (c === '}') depth--
      }
    }
    if (depth > 0) break
    let a = null
    try { a = JSON.parse(s.slice(i, j)) } catch (e) { continue }
    if (!a) continue
    const text = String(a.text || '')
    const desc = String(a.description || a['content-desc'] || '')
    const id = String(a.id || '')
    const key = String(a.key || '')
    const type = String(a.type || '')
    const visible = a.visible !== 'false'
    const enabled = a.enabled !== 'false'
    const opacity = parseFloat(a.opacity)
    const clickable = a.clickable === 'true'
    const b = String(a.bounds || '')
    const m2 = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(b)
    if (!m2) continue
    const x1 = parseInt(m2[1], 10), y1 = parseInt(m2[2], 10), x2 = parseInt(m2[3], 10), y2 = parseInt(m2[4], 10)
    if (x2 <= x1 || y2 <= y1) continue
    if (!visible || !enabled || opacity === 0) continue
    // 只保留「有点东西」的节点：文字/描述/可点击，或带组件名(id/key)——组件名是中文目标匹配的依据
    if (!text && !desc && !clickable && !id && !key) continue
    out.push({
      text: text, desc: desc, id: id, key: key, type: type, clickable: clickable,
      x1: x1, y1: y1, x2: x2, y2: y2,
      cx: Math.round((x1 + x2) / 2), cy: Math.round((y1 + y2) / 2),
      area: (x2 - x1) * (y2 - y1),
    })
  }
  return out
}

function clamp01(v) { v = Number(v); return v < 0 ? 0 : v > 1 ? 1 : v }

// 去掉 undefined 字段（返回给 RPC/工具的值必须是纯 JSON，运行时明确拒绝 undefined）
function cleanJson(obj) {
  const out = {}
  for (const k of Object.keys(obj || {})) if (obj[k] !== undefined) out[k] = obj[k]
  return out
}

// 机械筛选：布局树几百个节点压成「有用控件」清单（有文字/描述，或小而可点击的非容器节点）
function compressControls(controls, sw, sh) {
  const screenArea = sw * sh
  const containerTypes = ['Row', 'Column', 'Stack', '__Common__', 'ListItem', 'List', 'Swiper', 'Tabs', 'RelativeContainer', 'Scroll', 'NodeContainer', 'BuilderProxyNode', 'CustomFrameNode', 'RenderNode', 'Navigation', 'NavigationContent', 'NavDestination', 'NavDestinationContent', 'WindowScene', 'Flex']
  const useful = []
  for (const c of controls) {
    const hasText = !!(c.text || c.desc)
    // 组件名只在「小控件」上才算数：占满整屏的命名容器（feed/view_holder 等）是布局脚手架，不是点击目标
    const hasName = !!(c.id || c.key) && /[A-Za-z_]{3,}/.test(String(c.id || c.key)) && c.area < screenArea * 0.3
    const smallClickable = c.clickable && c.area < screenArea * 0.3 && containerTypes.indexOf(c.type) < 0
    // 状态栏区域(fy<0.06)里无文字、不可点的纯 id/key 噪声节点（电量/WiFi/信号图标等）直接丢弃
    if (!hasText && !c.clickable && (c.cy / sh) < 0.06) continue
    if (!hasText && !smallClickable && !hasName) continue
    useful.push({
      type: c.type, text: String(c.text || '').slice(0, 60), desc: String(c.desc || '').slice(0, 60),
      clickable: c.clickable, id: c.id, key: c.key,
      fx: clamp01(c.cx / sw), fy: clamp01(c.cy / sh),
      w: c.x2 - c.x1, h: c.y2 - c.y1,
    })
  }
  // 去重后按 上→下、左→右 排序
  const seen = {}
  const dedup = []
  for (const u of useful) {
    const k = (u.text || u.key || u.id) + '|' + u.type + '|' + Math.round(u.fx * 100) + '|' + Math.round(u.fy * 100)
    if (seen[k]) continue
    seen[k] = true
    dedup.push(u)
  }
  dedup.sort(function (a, b) { return a.fy - b.fy || a.fx - b.fx })
  return dedup.slice(0, 100)
}

function buildLocateTool(ctx) {
  return defineTool({
    name: 'hos_scrcpy_locate',
    description: '机械读取鸿蒙手机当前屏幕的 hdc uitest 布局树，筛选压缩成【可操作控件清单】返回（秒级，只保留有文字/描述/组件名或可点击的控件，杜绝无用节点）。每项含：type 控件类型、text 控件文字、id/key 组件名、clickable 是否可点击、fx/fy 中心比例坐标(0..1)、w/h 尺寸。调用后由你（主代理）根据目标在清单中挑选合适的控件，直接用其 fx/fy 调 hos_scrcpy_tap 点击（若目标是数字等不可点文字，选包含它的可点击控件）。若目标不是原生控件（H5/游戏/自绘），布局树可能匹配不到，可先用 hos_scrcpy_screenshot 确认页面内容。只读取、不操作。用前提：目标设备已开启「允许控制」且当前已连接投屏。',
    parameters: {
      target: {
        type: 'string',
        description: '（可选，仅作上下文提示）你想定位的目标，例如：点赞、登录按钮。返回的清单由你自行匹配。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          sn: { type: 'string' },
          target: { type: 'string' },
          count: { type: 'number' },
          realW: { type: 'number' },
          realH: { type: 'number' },
          controls: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                type: { type: 'string' },
                text: { type: 'string' },
                desc: { type: 'string' },
                id: { type: 'string' },
                key: { type: 'string' },
                clickable: { type: 'boolean' },
                fx: { type: 'number' },
                fy: { type: 'number' },
                w: { type: 'number' },
                h: { type: 'number' },
              },
            },
          },
          error: { type: 'string' },
        },
      },
      render(args, value) {
        if (!value || value.ok !== true) {
          return [{ type: 'text', text: '控件清单获取失败：' + ((value && value.error) || '未知错误') }]
        }
        const lines = ['【控件清单 · ' + value.sn + ' · ' + value.count + ' 项 · 屏幕 ' + (value.realW || '?') + 'x' + (value.realH || '?') + '】']
        for (const c of (value.controls || [])) {
          const label = c.text || c.desc || c.key || c.id || c.type
          lines.push('- ' + label + (c.clickable ? ' [可点]' : '') + ' @(' + c.fx.toFixed(3) + ', ' + c.fy.toFixed(3) + ') ' + c.w + 'x' + c.h)
        }
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    timeoutMs: 30000,
    async execute(args, exec) {
      const focused = requireFocusedSn()
      if (!focused.ok) return { ok: false, error: focused.error }
      const sn = focused.sn
      const gate = await ctlEnabledCheck(sn)
      if (!gate.ok) return { ok: false, error: gate.error }
      const online = await deviceOnline(sn)
      if (!online.ok) return { ok: false, error: online.error }
      const dl = await dumpUiLayout(online.hdc, sn)
      if (!dl.ok) return { ok: false, error: dl.error }
      const controls = parseUiControls(dl.json)
      let sw = 1, sh = 1
      for (const c of controls) { if (c.x2 > sw) sw = c.x2; if (c.y2 > sh) sh = c.y2 }
      const list = compressControls(controls, sw, sh)
      if (!list.length) return { ok: false, error: '未解析到任何可用控件（布局为空或全部不可见）' }
      return cleanJson({
        ok: true, sn: sn, target: String((args && args.target) || '').trim() || undefined,
        count: list.length, realW: sw, realH: sh, controls: list,
      })
    },
  })
}

// 权限门禁：设备对应权限非禁止才放行（返回模式供调用方判断是否弹确认）
async function modeEnabledCheck(sns, permName, sn) {
  const mode = sns[sn]
  if (!mode || mode === 'off') {
    return { ok: false, error: '设备 ' + sn + ' 的「' + permName + '」为禁止使用（请在设置中选择需要确认/无需确认，且需先开启「允许截图」）' }
  }
  return { ok: true, mode: mode }
}

// 允许控制门禁（locate/tap/longpress）
async function ctlEnabledCheck(sn) { return await modeEnabledCheck(ctlModeSns, '允许控制', sn) }
// 按键门禁（返回/Home）
async function keyEnabledCheck(sn) { return await modeEnabledCheck(keyModeSns, '允许按键', sn) }
// 输入门禁（文本输入）
async function inputEnabledCheck(sn) { return await modeEnabledCheck(inputModeSns, '允许输入', sn) }

// 通用手势门禁+确认+入队：kind='tap' 单击 / kind='longpress' 长按(holdMs)
async function queueGesture(ctx, args, exec, kind) {
  const fxn = Number(args && args.fx)
  const fyn = Number(args && args.fy)
  if (fxn === undefined || fyn === undefined || Number.isNaN(fxn) || Number.isNaN(fyn)) {
    return { ok: false, error: '缺少 fx/fy：请传入目标中心的比例坐标(0..1)' }
  }
  const fx = clamp01(fxn)
  const fy = clamp01(fyn)
  let hold = undefined
  if (kind === 'longpress') {
    hold = Number(args && args.holdMs)
    if (hold === undefined || Number.isNaN(hold) || hold <= 0) hold = 2000
    hold = Math.min(hold, 10000)
  }
  const verb = kind === 'longpress' ? '长按' : '点击'
  const intent = String((args && args.intent) || (kind === 'longpress' ? '长按手机屏幕' : '点击手机屏幕')).trim()
  const focused = requireFocusedSn()
  if (!focused.ok) return { ok: false, error: focused.error }
  const sn = focused.sn
  const gate = await ctlEnabledCheck(sn)
  if (!gate.ok) return { ok: false, error: gate.error }
  // 必须落在「当前已投屏连接」的设备上（手势经其 WS 发送；未投屏时入队会永远发不出去）
  if (!sidecars.has(sn)) return { ok: false, error: '设备 ' + sn + ' 未在投屏连接中：请先投屏连接该设备后再执行' + verb }
  const seq = ++ctlSeq
  // 二次确认（显示 AI 意图）；确认期间发布落点预览，Client 在投屏画面上叠闪烁绿点（长按=慢闪）。
  // 「无需确认」模式直接放行，不弹确认也不发预览。
  let outcome = 'allowed-once'
  if (gate.mode !== 'trust') {
    if (!exec.agent) return { ok: false, error: '缺少调用代理身份，无法发起确认' }
    const approval = ctx.get('approval')
    if (!approval) return { ok: false, error: 'approval 服务不可用，无法发起二次确认' }
    const preview = { seq: seq, kind: kind, sn: sn, fx: fx, fy: fy, intent: intent }
    if (kind === 'longpress') preview.holdMs = hold
    ctlPreview = preview
    try {
      outcome = await approval.request({
        agent: exec.agent,
        toolName: kind === 'longpress' ? 'hos_scrcpy_longpress' : 'hos_scrcpy_tap',
        reason: 'AI 想执行：' + verb + '「' + intent + '」（' + (kind === 'longpress' ? '按住 ' + hold + 'ms 后松开，' : '') + '设备屏幕比例坐标 x=' + fx.toFixed(3) + ', y=' + fy.toFixed(3) + '）——是否允许？',
        signal: exec.signal,
      })
    } catch (e) {
      ctlPreview = null
      return { ok: false, error: '二次确认失败: ' + String((e && e.message) || e) }
    }
    if (outcome !== 'allowed-once') {
      ctlPreview = null
      return { ok: false, error: '用户未允许' + verb + '（' + String(outcome) + '）' }
    }
  }
  const g = { seq: seq, kind: kind, sn: sn, fx: fx, fy: fy, intent: intent }
  if (kind === 'longpress') g.holdMs = hold
  ctlPending.push(g)
  const out = { ok: true, seq: seq, fx: fx, fy: fy, intent: intent }
  if (kind === 'longpress') out.holdMs = hold
  return out
}

// 通用按键门禁+确认+入队：kind='key'（back/home，经 WS 发送；无坐标，预览不显示绿点）
async function queueKey(ctx, args, exec) {
  const key = String((args && args.key) || '').trim().toLowerCase()
  if (ALLOWED_KEYS.indexOf(key) < 0) {
    return { ok: false, error: '不支持的按键：' + key + '（支持 back / home）' }
  }
  const intent = String((args && args.intent) || (key === 'home' ? '按 Home 键回到桌面' : '按返回键返回上一页')).trim()
  const focused = requireFocusedSn()
  if (!focused.ok) return { ok: false, error: focused.error }
  const sn = focused.sn
  const gate = await keyEnabledCheck(sn)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!sidecars.has(sn)) return { ok: false, error: '设备 ' + sn + ' 未在投屏连接中：请先投屏连接该设备后再按键' }
  const seq = ++ctlSeq
  let outcome = 'allowed-once'
  // 「无需确认」模式直接放行，不弹确认
  if (gate.mode !== 'trust') {
    if (!exec.agent) return { ok: false, error: '缺少调用代理身份，无法发起确认' }
    const approval = ctx.get('approval')
    if (!approval) return { ok: false, error: 'approval 服务不可用，无法发起二次确认' }
    ctlPreview = cleanJson({ seq: seq, kind: 'key', sn: sn, key: key, intent: intent })
    try {
      outcome = await approval.request({
        agent: exec.agent,
        toolName: 'hos_scrcpy_key',
        reason: 'AI 想执行：' + (key === 'home' ? '按 Home 键' : '按返回键') + '「' + intent + '」——是否允许？',
        signal: exec.signal,
      })
    } catch (e) {
      ctlPreview = null
      return { ok: false, error: '二次确认失败: ' + String((e && e.message) || e) }
    }
    if (outcome !== 'allowed-once') {
      ctlPreview = null
      return { ok: false, error: '用户未允许按键（' + String(outcome) + '）' }
    }
  }
  ctlPending.push(cleanJson({ seq: seq, kind: 'key', sn: sn, key: key, intent: intent }))
  return cleanJson({ ok: true, seq: seq, key: key, intent: intent })
}

// 通过 hdc 向设备当前聚焦的输入框注入文本（uitest uiInput text，失败回退 uinput -T）
async function injectText(hdc, sn, text) {
  const escaped = String(text).replace(/'/g, "'\\''")
  const r = await run(hdc, ['-t', sn, 'shell', 'uitest', 'uiInput', 'text', "'" + escaped + "'"])
  if (r.ok) return { ok: true, text: String(text) }
  const r2 = await run(hdc, ['-t', sn, 'shell', 'uinput', '-T', String(text)])
  if (r2.ok) return { ok: true, text: String(text) }
  return { ok: false, error: '文本注入失败: ' + (r.stderr || r2.stderr || r.stdout || r2.stdout || ('exit ' + r.exitCode)) }
}

// 文本输入工具：门禁+确认+注入（「无需确认」模式直接注入）
async function queueInput(ctx, args, exec) {
  const text = String((args && args.text) || '').trim()
  if (!text) return { ok: false, error: '缺少 text：请填写要输入的内容' }
  const intent = String((args && args.intent) || ('输入「' + text + '」')).trim()
  const focused = requireFocusedSn()
  if (!focused.ok) return { ok: false, error: focused.error }
  const sn = focused.sn
  const gate = await inputEnabledCheck(sn)
  if (!gate.ok) return { ok: false, error: gate.error }
  let outcome = 'allowed-once'
  if (gate.mode !== 'trust') {
    if (!exec.agent) return { ok: false, error: '缺少调用代理身份，无法发起确认' }
    const approval = ctx.get('approval')
    if (!approval) return { ok: false, error: 'approval 服务不可用，无法发起二次确认' }
    try {
      outcome = await approval.request({
        agent: exec.agent,
        toolName: 'hos_scrcpy_input',
        reason: 'AI 想向当前聚焦的输入框输入：「' + text + '」——是否允许？',
        signal: exec.signal,
      })
    } catch (e) {
      return { ok: false, error: '二次确认失败: ' + String((e && e.message) || e) }
    }
    if (outcome !== 'allowed-once') return { ok: false, error: '用户未允许输入（' + String(outcome) + '）' }
  }
  const online = await deviceOnline(sn)
  if (!online.ok) return { ok: false, error: online.error }
  const r = await injectText(online.hdc, sn, text)
  if (!r.ok) return { ok: false, error: r.error }
  return { ok: true, text: text, intent: intent }
}

function buildInputTool(ctx) {
  return defineTool({
    name: 'hos_scrcpy_input',
    description: '在 hdc 在线鸿蒙手机上向【当前聚焦的输入框】注入一段文本（模拟键盘输入，支持中文）。使用前需先点击目标输入框使其获得焦点（如搜索框、聊天输入框），再调用本工具。执行前弹出高危二次确认（「无需确认」模式除外）。作用于当前投屏连接的设备。用前提：目标设备已开启「允许输入」且当前已连接投屏。',
    parameters: {
      text: {
        type: 'string',
        required: true,
        description: '要输入的文本内容，例如：蜜雪冰城、你好、川湘厨。',
      },
      intent: {
        type: 'string',
        description: '本次输入想做什么（会显示在二次确认框里）。例如：在搜索框输入"川湘厨"。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          text: { type: 'string' },
          intent: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render(args, value) {
        if (!value || value.ok !== true) {
          return [{ type: 'text', text: '输入失败：' + ((value && value.error) || '未知错误') }]
        }
        return [{ type: 'text', text: '【输入 · ' + value.text + '】已注入到当前聚焦的输入框' + (value.intent ? ' · ' + value.intent : '') }]
      },
    },
    timeoutMs: 30000,
    async execute(args, exec) {
      return await queueInput(ctx, args, exec)
    },
  })
}

function buildTapTool(ctx) {
  return defineTool({
    name: 'hos_scrcpy_tap',
    description: '在 hdc 在线鸿蒙手机当前屏幕上执行一次「点」操作。坐标用【当前画面】的比例(0-1)传入（先用 hos_scrcpy_locate 拿到目标比例坐标）。执行前弹出高危二次确认，确认框会显示你填写的 intent（本次想做什么）。用前提：目标设备已开启「允许控制」且当前已连接投屏。',
    parameters: {
      fx: { type: 'number', required: true, description: '目标中心水平比例坐标，0..1（hos_scrcpy_locate 返回的 fx）。' },
      fy: { type: 'number', required: true, description: '目标中心垂直比例坐标，0..1（hos_scrcpy_locate 返回的 fy）。' },
      intent: {
        type: 'string',
        description: '本次点击想做什么（会显示在二次确认框里，请写清楚）。例如：点击"登录"按钮、点击右上角关闭×。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          seq: { type: 'number' },
          fx: { type: 'number' },
          fy: { type: 'number' },
          intent: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render(args, value) {
        if (!value || value.ok !== true) {
          return [{ type: 'text', text: '点击失败：' + ((value && value.error) || '未知错误') }]
        }
        return [{ type: 'text', text: '【点击 · ' + value.intent + '】\n已排队执行（比例坐标 ' + value.fx + ', ' + value.fy + '）' }]
      },
    },
    timeoutMs: 60000,
    async execute(args, exec) {
      return await queueGesture(ctx, args, exec, 'tap')
    },
  })
}

function buildLongPressTool(ctx) {
  return defineTool({
    name: 'hos_scrcpy_longpress',
    description: '在 hdc 在线鸿蒙手机当前屏幕上执行一次「长按」操作：在目标位置按住指定时长后松开。坐标用【当前画面】的比例(0-1)传入（先用 hos_scrcpy_locate 拿到目标比例坐标）。执行前弹出高危二次确认，确认框会显示你填写的 intent（本次想做什么）。用前提：目标设备已开启「允许控制」且当前已连接投屏。',
    parameters: {
      fx: { type: 'number', required: true, description: '目标中心水平比例坐标，0..1（hos_scrcpy_locate 返回的 fx）。' },
      fy: { type: 'number', required: true, description: '目标中心垂直比例坐标，0..1（hos_scrcpy_locate 返回的 fy）。' },
      holdMs: {
        type: 'number',
        description: '按住时长（毫秒），默认 2000（2 秒）。长按常用于弹出菜单、多选、拖动图标等。',
      },
      intent: {
        type: 'string',
        description: '本次长按想做什么（会显示在二次确认框里，请写清楚）。例如：长按图片弹出操作菜单。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          seq: { type: 'number' },
          fx: { type: 'number' },
          fy: { type: 'number' },
          holdMs: { type: 'number' },
          intent: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render(args, value) {
        if (!value || value.ok !== true) {
          return [{ type: 'text', text: '长按失败：' + ((value && value.error) || '未知错误') }]
        }
        return [{ type: 'text', text: '【长按 · ' + value.intent + '】\n已排队执行（比例坐标 ' + value.fx + ', ' + value.fy + ' · 按住 ' + (value.holdMs || 2000) + 'ms）' }]
      },
    },
    timeoutMs: 60000,
    async execute(args, exec) {
      return await queueGesture(ctx, args, exec, 'longpress')
    },
  })
}

function buildKeyTool(ctx) {
  return defineTool({
    name: 'hos_scrcpy_key',
    description: '在 hdc 在线鸿蒙手机当前屏幕上发送一次系统按键：返回键(back) 或 Home 键(home)。常用于返回上一页或回到桌面。执行前弹出高危二次确认，确认框会显示 intent。用前提：目标设备已开启「允许按键」且当前已连接投屏。',
    parameters: {
      key: {
        type: 'string',
        required: true,
        enum: ['back', 'home'],
        description: '要按的键：back（返回上一页）/ home（回到桌面）。',
      },
      intent: {
        type: 'string',
        description: '这次按键想做什么（会显示在二次确认框里）。例如：返回上一页。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          seq: { type: 'number' },
          key: { type: 'string' },
          intent: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render(args, value) {
        if (!value || value.ok !== true) {
          return [{ type: 'text', text: '按键失败：' + ((value && value.error) || '未知错误') }]
        }
        return [{ type: 'text', text: '【按键 · ' + (value.key === 'home' ? 'Home' : '返回') + '】\n已排队执行' + (value.intent ? ' · ' + value.intent : '') }]
      },
    },
    timeoutMs: 60000,
    async execute(args, exec) {
      return await queueKey(ctx, args, exec)
    },
  })
}

// 按「允许截图」与「允许控制」「允许按键」「允许输入」状态注册/注销工具
function hasMode(sns) {
  return Object.keys(sns).some(function (k) { return sns[k] && sns[k] !== 'off' })
}
function syncTools(ctx) {
  // 截图识别
  if (hasMode(shotModeSns) && !shotToolDisposer) {
    if (!shotTool) shotTool = buildShotTool(ctx)
    try {
      shotToolDisposer = ctx.tools.register(shotTool)
      shotToolRegisterError = ''
    } catch (e) {
      shotToolRegisterError = String((e && e.message) || e)
      console.error('注册 hos_scrcpy_screenshot 工具失败: ' + shotToolRegisterError)
    }
  } else if (!hasMode(shotModeSns) && shotToolDisposer) {
    try { shotToolDisposer() } catch (e) {}
    shotToolDisposer = null
  }
  // 允许控制（locate/tap/longpress）
  if (hasMode(ctlModeSns) && !locToolDisposer) {
    if (!locTool) locTool = buildLocateTool(ctx)
    try { locToolDisposer = ctx.tools.register(locTool) } catch (e) { console.error('注册 hos_scrcpy_locate 工具失败: ' + String((e && e.message) || e)) }
  } else if (!hasMode(ctlModeSns) && locToolDisposer) {
    try { locToolDisposer() } catch (e) {}
    locToolDisposer = null
  }
  if (hasMode(ctlModeSns) && !tapToolDisposer) {
    if (!tapTool) tapTool = buildTapTool(ctx)
    try { tapToolDisposer = ctx.tools.register(tapTool) } catch (e) { console.error('注册 hos_scrcpy_tap 工具失败: ' + String((e && e.message) || e)) }
  } else if (!hasMode(ctlModeSns) && tapToolDisposer) {
    try { tapToolDisposer() } catch (e) {}
    tapToolDisposer = null
  }
  if (hasMode(ctlModeSns) && !lpToolDisposer) {
    if (!lpTool) lpTool = buildLongPressTool(ctx)
    try { lpToolDisposer = ctx.tools.register(lpTool) } catch (e) { console.error('注册 hos_scrcpy_longpress 工具失败: ' + String((e && e.message) || e)) }
  } else if (!hasMode(ctlModeSns) && lpToolDisposer) {
    try { lpToolDisposer() } catch (e) {}
    lpToolDisposer = null
  }
  // 允许按键
  if (hasMode(keyModeSns) && !keyToolDisposer) {
    if (!keyTool) keyTool = buildKeyTool(ctx)
    try { keyToolDisposer = ctx.tools.register(keyTool) } catch (e) { console.error('注册 hos_scrcpy_key 工具失败: ' + String((e && e.message) || e)) }
  } else if (!hasMode(keyModeSns) && keyToolDisposer) {
    try { keyToolDisposer() } catch (e) {}
    keyToolDisposer = null
  }
  // 允许输入
  if (hasMode(inputModeSns) && !inputToolDisposer) {
    if (!inputTool) inputTool = buildInputTool(ctx)
    try { inputToolDisposer = ctx.tools.register(inputTool) } catch (e) { console.error('注册 hos_scrcpy_input 工具失败: ' + String((e && e.message) || e)) }
  } else if (!hasMode(inputModeSns) && inputToolDisposer) {
    try { inputToolDisposer() } catch (e) {}
    inputToolDisposer = null
  }
}

// ---- JSON RPC 处理器表（浏览器半区 rpc() 调用） ----
const handlers = {
  'cfg:get': async function () {
    return readConfig()
  },
  'cfg:save': async function (args) {
    // 保留已有的识别模型设置，避免保存环境配置时被冲掉
    const prev = readConfig()
    const num = function (v, fallback) { return (v !== undefined && Number(v) > 0) ? Number(v) : fallback }
    const cfg = {
      javaPath: String((args && args.javaPath) || '').trim(),
      hdcPath: String((args && args.hdcPath) || '').trim(),
      visionModel: (args && args.visionModel !== undefined) ? String(args.visionModel || '').trim() : prev.visionModel,
      wiredFrameRate: num(args && args.wiredFrameRate, prev.wiredFrameRate),
      wirelessFrameRate: num(args && args.wirelessFrameRate, prev.wirelessFrameRate),
    }
    const res = writeConfig(cfg)
    if (!res.ok) return { ok: false, error: res.error }
    return { ok: true, config: cfg }
  },
  // ---- 识别模型设置（只列支持图片输入的模型） ----
  'model:list': async function (args, ctx) {
    const llm = ctx.get('llm')
    if (!llm) return { ok: false, error: 'llm 服务不可用' }
    const models = await listVisionModels(llm)
    const cfg = readConfig()
    return {
      ok: true,
      configured: cfg.visionModel || '',
      default: DEFAULT_VISION_MODEL,
      models: models.map(function (m) { return { id: m.id, name: m.name || m.id } }),
    }
  },
  'model:get': async function (args, ctx) {
    const llm = ctx.get('llm')
    if (!llm) return { ok: false, error: 'llm 服务不可用' }
    const resolved = await resolveVisionModel(llm)
    const cfg = readConfig()
    return {
      ok: true,
      configured: cfg.visionModel || '',
      default: DEFAULT_VISION_MODEL,
      effective: resolved.ok ? resolved.model : '',
      fallback: resolved.ok ? resolved.fallback : false,
      error: resolved.ok ? '' : resolved.error,
      models: resolved.ok ? resolved.models.map(function (m) { return { id: m.id, name: m.name || m.id } }) : [],
    }
  },
  'model:set': async function (args, ctx) {
    const id = String((args && args.model) || '').trim()
    const llm = ctx.get('llm')
    if (!llm) return { ok: false, error: 'llm 服务不可用' }
    if (id) {
      const models = await listVisionModels(llm)
      if (!models.some(function (m) { return m.id === id })) {
        return { ok: false, error: '模型 ' + id + ' 不存在或不支持图片输入' }
      }
    }
    const cfg = readConfig()
    cfg.visionModel = id
    const res = writeConfig(cfg)
    if (!res.ok) return { ok: false, error: res.error }
    return { ok: true, configured: id }
  },
  'env:detect': async function () {
    return await detectEnv()
  },
  'devices:list': async function () {
    const cfg = readConfig()
    const h = resolveHdcPath(cfg)
    if (!h.path) {
      return { ok: false, error: 'hdc 未配置，请先到设置中填写 hdc 路径或设置 DEVECO_SDK_HOME 环境变量', config: cfg }
    }
    const hdcCheck = await checkHdc(h.path)
    if (!hdcCheck.ok) return { ok: false, error: 'hdc 不可用: ' + hdcCheck.error, config: cfg, hdc: hdcCheck }
    const r = await run(h.path, ['list', 'targets'])
    if (!r.ok) return { ok: false, error: r.stderr || 'hdc list targets 失败', config: cfg, hdc: hdcCheck }
    const text = (r.stdout || '').trim()
    const lines = text.split(/\r?\n/).map((s) => s.trim()).filter((s) => s && s !== 'Empty' && s.toLowerCase() !== '[empty]' && !/^\[empty\]$/i.test(s))
    return { ok: true, config: cfg, hdc: hdcCheck, devices: lines.map((sn) => ({ sn: sn })) }
  },
  'device:connect': async function (args) {
    const sn = String((args && args.sn) || '').trim()
    if (!sn) return { ok: false, error: '缺少设备 SN' }
    return await connectDevice(sn)
  },
  'device:disconnect': async function (args) {
    const sn = String((args && args.sn) || '').trim()
    if (sn) killSidecarFor(sn)
    else killAllSidecars() // 没给 sn 就全断（兼容老客户端）
    return { ok: true, devices: sidecarList(), focused: focusedSn }
  },
  // 客户端报告“当前聚焦（面板可见）的设备”：AI 工具据此选目标，空串 = 没有聚焦
  'device:focus': async function (args) {
    const sn = String((args && args.sn) || '').trim()
    focusedSn = (sn && sidecars.has(sn)) ? sn : ''
    return { ok: true, focused: focusedSn }
  },
  'sidecar:status': async function () {
    const list = sidecarList()
    const hit = list.filter(function (d) { return d.sn === focusedSn })[0]
    return {
      running: list.length > 0, devices: list, focused: focusedSn,
      // 兼容旧字段（单设备时代的客户端）
      port: hit ? hit.port : 0, sn: hit ? hit.sn : '',
    }
  },
  'jmuxer:source': async function () {
    try {
      return { ok: true, source: readFileSync(JMUXER_FILE, 'utf8') }
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) }
    }
  },
  // ---- 截图识别 RPC（权限模式：off/confirm/trust）----
  'shot:mode': async function () {
    return { modes: Object.assign({}, shotModeSns) }
  },
  'shot:set-mode': async function (args, ctx) {
    const sn = String((args && args.sn) || '').trim()
    const mode = String((args && args.mode) || 'off')
    if (!sn) return { ok: false, error: '缺少设备 SN' }
    if (['off', 'confirm', 'trust'].indexOf(mode) < 0) return { ok: false, error: '无效模式：' + mode }
    if (mode === 'off') {
      delete shotModeSns[sn]
      // 允许截图禁止 -> 该设备允许控制/允许按键/允许输入 强制禁止（依赖关系）
      if (ctlModeSns[sn]) delete ctlModeSns[sn]
      if (keyModeSns[sn]) delete keyModeSns[sn]
      if (inputModeSns[sn]) delete inputModeSns[sn]
    } else {
      shotModeSns[sn] = mode
    }
    syncTools(ctx)
    return { ok: true, mode: mode, registered: !!shotToolDisposer, count: Object.keys(shotModeSns).length, registerError: shotToolRegisterError }
  },
  // ---- 允许控制状态 RPC（权限模式：off/confirm/trust）----
  'ctl:mode': async function () {
    return { modes: Object.assign({}, ctlModeSns) }
  },
  'ctl:set-mode': async function (args, ctx) {
    const sn = String((args && args.sn) || '').trim()
    const mode = String((args && args.mode) || 'off')
    if (!sn) return { ok: false, error: '缺少设备 SN' }
    if (['off', 'confirm', 'trust'].indexOf(mode) < 0) return { ok: false, error: '无效模式：' + mode }
    if (mode !== 'off' && (!shotModeSns[sn] || shotModeSns[sn] === 'off')) {
      return { ok: false, error: '请先开启「允许截图」再开启「允许控制」' }
    }
    if (mode === 'off') delete ctlModeSns[sn]
    else ctlModeSns[sn] = mode
    syncTools(ctx)
    return { ok: true, mode: mode, registered: !!locToolDisposer || !!tapToolDisposer, count: Object.keys(ctlModeSns).length }
  },
  // ---- 允许按键状态 RPC（权限模式：off/confirm/trust；依赖允许截图）----
  'key:mode': async function () {
    return { modes: Object.assign({}, keyModeSns) }
  },
  'key:set-mode': async function (args, ctx) {
    const sn = String((args && args.sn) || '').trim()
    const mode = String((args && args.mode) || 'off')
    if (!sn) return { ok: false, error: '缺少设备 SN' }
    if (['off', 'confirm', 'trust'].indexOf(mode) < 0) return { ok: false, error: '无效模式：' + mode }
    if (mode !== 'off' && (!shotModeSns[sn] || shotModeSns[sn] === 'off')) {
      return { ok: false, error: '请先开启「允许截图」再开启「允许按键」' }
    }
    if (mode === 'off') delete keyModeSns[sn]
    else keyModeSns[sn] = mode
    syncTools(ctx)
    return { ok: true, mode: mode, registered: !!keyToolDisposer, count: Object.keys(keyModeSns).length }
  },
  // ---- 允许输入状态 RPC（权限模式：off/confirm/trust；依赖允许截图）----
  'input:mode': async function () {
    return { modes: Object.assign({}, inputModeSns) }
  },
  'input:set-mode': async function (args, ctx) {
    const sn = String((args && args.sn) || '').trim()
    const mode = String((args && args.mode) || 'off')
    if (!sn) return { ok: false, error: '缺少设备 SN' }
    if (['off', 'confirm', 'trust'].indexOf(mode) < 0) return { ok: false, error: '无效模式：' + mode }
    if (mode !== 'off' && (!shotModeSns[sn] || shotModeSns[sn] === 'off')) {
      return { ok: false, error: '请先开启「允许截图」再开启「允许输入」' }
    }
    if (mode === 'off') delete inputModeSns[sn]
    else inputModeSns[sn] = mode
    syncTools(ctx)
    return { ok: true, mode: mode, registered: !!inputToolDisposer, count: Object.keys(inputModeSns).length }
  },
  // 取走一个待 Client 经其现有 WS 发送的手势（Client 轮询；返回 null 表示暂无）
  'ctl:dequeue': async function () {
    if (ctlPending.length === 0) return { ok: true, gesture: null }
    const g = ctlPending.shift()
    // 手势被取走 = 即将执行，落点预览使命完成
    if (ctlPreview && ctlPreview.seq === g.seq) ctlPreview = null
    return { ok: true, gesture: g }
  },
  // 落点预览：二次确认期间返回 {seq,kind,sn,...}，供 Client 叠闪烁绿点（无预览返回 null）
  'ctl:preview': async function () {
    return { preview: ctlPreview ? cleanJson(ctlPreview) : null }
  },
  'ctl:pending': async function () {
    return { count: ctlPending.length }
  },
  // 面板「输入」按钮：用户手动向当前聚焦输入框注入文本（直接用户手势，不走 AI 门禁/确认）
  // 多设备下由客户端带上它自己的 sn；没带就退回“当前聚焦”的那台
  'ctl:input': async function (args) {
    const text = String((args && args.text) || '').trim()
    if (!text) return { ok: false, error: '缺少输入内容' }
    const sn = String((args && args.sn) || '').trim() || focusedSn
    if (!sn) return { ok: false, error: '缺少设备 SN：请先连接投屏' }
    const online = await deviceOnline(sn)
    if (!online.ok) return { ok: false, error: online.error }
    return await injectText(online.hdc, sn, text)
  },
  // 截取屏幕并返回 base64（「添加截图至聊天框」按钮用；直接用户手势，不走二次确认/视觉模型）
  'shot:capture': async function (args) {
    const sn = String((args && args.sn) || '').trim() || focusedSn
    if (!sn) return { ok: false, error: '缺少设备 SN：请先连接投屏' }
    const online = await deviceOnline(sn)
    if (!online.ok) return { ok: false, error: online.error }
    const shot = await takeScreenshot(online.hdc, sn)
    if (!shot.ok) return { ok: false, error: shot.error }
    const mediaType = sniffMediaType(shot.bytes)
    if (!mediaType) return { ok: false, error: '无法识别的截图格式（仅支持 PNG/JPEG）' }
    return { ok: true, sn: sn, mediaType: mediaType, base64: bytesToBase64(shot.bytes), bytes: shot.bytes.length }
  },
}

// ---- HTTP 路由 ----
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 1024 * 1024) {
        req.destroy()
        reject(new Error('request body too large'))
      }
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function json(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

async function rpcHandler(req, res, ctx) {
  try {
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    let parsed
    try {
      parsed = JSON.parse((await readBody(req)) || '{}')
    } catch {
      json(res, 400, { ok: false, error: 'invalid json body' })
      return
    }
    const method = String(parsed.method || '')
    const handler = handlers[method]
    if (!handler) {
      json(res, 404, { ok: false, error: 'unknown method: ' + method })
      return
    }
    const result = await handler(parsed.args || {}, ctx)
    json(res, 200, { ok: true, result: result })
  } catch (e) {
    json(res, 500, { ok: false, error: String((e && e.message) || e) })
  }
}

export default {
  inject: ['webServer', 'tools'],
  apply(ctx) {
    ctx.effect(
      () => ctx.webServer.register({
        kind: 'exact',
        path: '/dsh-hos-scrcpy/rpc',
        handler: (req, res) => rpcHandler(req, res, ctx),
      }),
      'dsh-hos-scrcpy: rpc route'
    )

    // ---- 提示词追加（只增不改，避免与其他修改提示词的软件冲突）----
    // 三态提示：① 连接且权限开 ② 已连接但权限未开 ③ 未连接
    const sysPrompt = ctx.get('systemPrompt')
    if (sysPrompt) {
      sysPrompt.section({
        name: 'dsh-hos-scrcpy-status',
        order: 9500,
        text: function () {
          const intro = '用户已安装「dsh-hos-scrcpy」插件：鸿蒙手机投屏 + AI 辅助操作，提供屏幕截图识别（hos_scrcpy_screenshot）、UI 控件清单（hos_scrcpy_locate）、点击/长按/返回·Home键（hos_scrcpy_tap/longpress/key）、文本输入（hos_scrcpy_input）。'
          if (!focusedSn) {
            return intro + '当前用户未连接手机投屏（或没有聚焦的投屏设备），手机截图与屏幕操作工具均不可用。'
          }
          // 已连接：按每个开关状态拼接工具可用性（confirm/trust 均视为可使用）
          // 注意：多设备下这里看的是"当前聚焦（面板可见）的那台"，AI 工具也只作用于它。
          const shotMode = shotModeSns[focusedSn] || 'off'
          const ctlMode = ctlModeSns[focusedSn] || 'off'
          const keyMode = keyModeSns[focusedSn] || 'off'
          const inputMode = inputModeSns[focusedSn] || 'off'
          const usable = function (mode) { return mode && mode !== 'off' }
          const tag = function (mode) { return mode === 'trust' ? '（无需确认）' : '（需确认）' }
          const parts = []
          parts.push('hos_scrcpy_screenshot截图识别：' + (usable(shotMode) ? '可使用' + tag(shotMode) : '不可使用'))
          parts.push('hos_scrcpy_locate控件清单：' + (usable(ctlMode) ? '可使用' + tag(ctlMode) : '不可使用'))
          parts.push('hos_scrcpy_tap/longpress点击长按：' + (usable(ctlMode) ? '可使用' + tag(ctlMode) : '不可使用'))
          parts.push('hos_scrcpy_key返回/Home按键：' + (usable(keyMode) ? '可使用' + tag(keyMode) : '不可使用'))
          parts.push('hos_scrcpy_input文本输入：' + (usable(inputMode) ? '可使用' + tag(inputMode) : '不可使用'))
          return intro + '当前用户已连接手机投屏，工具使用权限情况：' + parts.join('；') + '。操作流程：1) 先使用hos_scrcpy_screenshot描述当前画面并大体定位目标位置；2) 再用hos_scrcpy_locate获取当前屏幕控件清单（含 type/text/id/key/clickable/fx/fy/w/h），从清单中精确定位目标控件（若目标是数字等不可点文字，选包含它的可点击控件），取其 fx/fy；3) 最后用hos_scrcpy_tap(fx,fy,intent=动作描述)点击、hos_scrcpy_longpress(fx,fy,holdMs=2000,intent=动作描述)长按、hos_scrcpy_key(key=back|home)按返回/Home键、hos_scrcpy_input(text=内容)向聚焦输入框输入文本。坐标一律用0..1比例。'
        },
      })
    }

    ctx.on('dispose', function () {
      if (shotToolDisposer) { try { shotToolDisposer() } catch (e) {} shotToolDisposer = null }
      if (locToolDisposer) { try { locToolDisposer() } catch (e) {} locToolDisposer = null }
      if (tapToolDisposer) { try { tapToolDisposer() } catch (e) {} tapToolDisposer = null }
      if (lpToolDisposer) { try { lpToolDisposer() } catch (e) {} lpToolDisposer = null }
      if (keyToolDisposer) { try { keyToolDisposer() } catch (e) {} keyToolDisposer = null }
      if (inputToolDisposer) { try { inputToolDisposer() } catch (e) {} inputToolDisposer = null }
      ctlPending = []
      ctlPreview = null
      killAllSidecars()
    })
  },
}
