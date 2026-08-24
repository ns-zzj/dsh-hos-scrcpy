// ============================================================
// dsh-hos-scrcpy — 插件 Host 半区（静态 npm 包版 · v2）
//
// v2 新功能（迁移自 PluginMain-Dynamic/host.js）：
//   - AI 截图识别（hos_scrcpy_screenshot 工具 + 允许截图开关 +
//     shot:capture 截图 RPC，deepseek-v4-flash-vision-exp 视觉识别）
//   - 截图前复用 DSH 高危操作二次确认（approval.request）
//   - systemPrompt 能力提示注入
//
// 与动态版的差异：
//   1. 不再使用动态沙箱的 harness.handle / harness.defineTool /
//      harness.registerTool 全局，改为：
//        - ctx.webServer 注册 JSON RPC 路由 POST /dsh-hos-scrcpy/rpc
//        - @deepseek-ai/dsh-tools 的 defineTool + ctx.tools.register
//   2. 资源定位：包内 resources/（import.meta.url），不再依赖工作区
//   3. 截图临时文件：os.tmpdir()（动态版拉回会话工作区，静态版无此概念）
//   4. hdc 设备选择统一用 -t <SN>（-s 是服务器 ip:port，传 SN 会报错）
//   5. 环境变量直接读 process.env，进程管理用 node:child_process
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
const VISION_MODEL = 'deepseek-v4-flash-vision-exp'    // 视觉模型
const MIN_DSH_VERSION = '0.1.0-rc8'                    // 最低支持版本
const REMOTE_SHOT_PATH = '/data/local/tmp/dsh-scrcpy-shot.jpeg'  // snapshot_display 只接受 .jpeg 后缀
const LOCAL_SHOT_NAME = 'dsh-scrcpy-shot.jpeg'

let sidecarProc = null
let sidecarPort = 0
let sidecarSn = ''

// ---- AI 截图识别状态（进程级） ----
let shotEnabledSns = {}          // { [sn]: true }
let shotTool = null              // 惰性创建的 ToolDefinition
let shotToolDisposer = null      // ctx.tools.register 返回的注销函数
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
function readConfig() {
  try {
    const obj = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
    return {
      javaPath: String(obj.javaPath || ''),
      hdcPath: String(obj.hdcPath || ''),
    }
  } catch {
    return { javaPath: '', hdcPath: '' }
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

// ---- sidecar 生命周期 ----
function killSidecar() {
  if (!sidecarProc) return
  const proc = sidecarProc
  sidecarProc = null
  sidecarPort = 0
  sidecarSn = ''
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

function connectDevice(sn) {
  return new Promise((resolve) => {
    const cfg = readConfig()
    const j = resolveJavaPath(cfg)
    if (!j.path) return resolve({ ok: false, error: 'Java 未配置，请到设置中配置' })
    const h = resolveHdcPath(cfg)
    if (!h.path) return resolve({ ok: false, error: 'hdc 未配置，请到设置中配置' })
    if (!existsSync(SIDECAR_OUT) || !existsSync(SDK_JAR)) {
      return resolve({ ok: false, error: 'sidecar 资源缺失（resources/out 或 resources/hosScrcpy-1.0.18-beta.jar）' })
    }
    killSidecar()
    const cpSep = process.platform === 'win32' ? ';' : ':'
    let proc
    try {
      proc = spawn(j.path, ['-cp', SDK_JAR + cpSep + SIDECAR_OUT, 'Main', '--sn', sn, '--hdc', h.path, '--port', '0', '--scale', '2'], {
        cwd: process.cwd(),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    } catch (e) {
      return resolve({ ok: false, error: 'sidecar 启动失败: ' + String((e && e.message) || e) })
    }
    let buf = ''
    let settled = false
    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (chunk) => {
      buf += String(chunk)
      const m = buf.match(/\{"ready":true,"port":(\d+)[^}]*\}/)
      if (m && !settled) {
        settled = true
        sidecarProc = proc
        sidecarPort = parseInt(m[1], 10)
        sidecarSn = sn
        resolve({ ok: true, port: sidecarPort, sn: sn })
      }
    })
    proc.on('error', (err) => {
      if (!settled) {
        settled = true
        killSidecar()
        resolve({ ok: false, error: 'sidecar 启动失败: ' + String((err && err.message) || err) })
      }
    })
    proc.on('exit', () => {
      if (!settled) {
        settled = true
        killSidecar()
        resolve({ ok: false, error: 'sidecar 启动超时或失败' })
      }
    })
    setTimeout(() => {
      if (!settled) {
        settled = true
        killSidecar()
        resolve({ ok: false, error: 'sidecar 启动超时或失败' })
      }
    }, 20000)
  })
}

// ============================================================
// AI 截图识别（v2）
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

// 门禁检查：开关 → DSH 版本 → 内置提供方 → 模型列表。全部通过才返回 { ok:true, llm, approval }
async function visionGateCheck(ctx, sn) {
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
// 注意：hdc 的设备选择参数是 -t <SN>（-s 是服务器 ip:port，传 SN 会报 port-string 错误）
async function takeScreenshot(hdc, sn) {
  const r1 = await run(hdc, ['-t', sn, 'shell', 'snapshot_display', '-f', REMOTE_SHOT_PATH])
  if (!r1.ok) return { ok: false, error: 'snapshot_display 失败: ' + (r1.stderr || ('exit ' + r1.exitCode)) }
  const local = join(os.tmpdir(), LOCAL_SHOT_NAME)
  const r2 = await run(hdc, ['-t', sn, 'file', 'recv', REMOTE_SHOT_PATH, local])
  if (!r2.ok) return { ok: false, error: 'file recv 失败: ' + (r2.stderr || ('exit ' + r2.exitCode)) }
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

function buildShotTool(ctx) {
  return defineTool({
    name: 'hos_scrcpy_screenshot',
    description: '截取 hdc 在线鸿蒙手机的当前屏幕画面，并调用内置 deepseek-v4-flash-vision-exp 视觉模型进行识别回答。使用前提：目标设备已在设备列表中开启「允许截图」开关；每次截图前会弹出高危操作二次确认，用户允许后才执行。',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '你想从屏幕画面中了解什么（例如：当前页面是什么应用？界面上有哪些按钮？屏幕显示了什么错误？）。将作为视觉模型的提问内容。',
        },
        sn: {
          type: 'string',
          description: '目标设备序列号（hdc list targets 中的 SN）。省略时使用当前投屏连接的设备。',
        },
      },
      required: ['prompt'],
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
      const gate = await visionGateCheck(ctx, sn)
      if (!gate.ok) return { ok: false, error: gate.error }
      const online = await deviceOnline(sn)
      if (!online.ok) return { ok: false, error: online.error }
      // 截图前：复用 DSH 高危操作二次确认框
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
function syncShotTool(ctx) {
  const anyEnabled = Object.keys(shotEnabledSns).some(function (k) { return !!shotEnabledSns[k] })
  if (anyEnabled && !shotToolDisposer) {
    if (!shotTool) shotTool = buildShotTool(ctx)
    try {
      shotToolDisposer = ctx.tools.register(shotTool)
    } catch (e) {
      console.error('注册 hos_scrcpy_screenshot 工具失败: ' + String((e && e.message) || e))
    }
  } else if (!anyEnabled && shotToolDisposer) {
    try { shotToolDisposer() } catch (e) {}
    shotToolDisposer = null
  }
}

// ---- JSON RPC 处理器表（浏览器半区 rpc() 调用） ----
const handlers = {
  'cfg:get': async function () {
    return readConfig()
  },
  'cfg:save': async function (args) {
    const cfg = {
      javaPath: String((args && args.javaPath) || '').trim(),
      hdcPath: String((args && args.hdcPath) || '').trim(),
    }
    const res = writeConfig(cfg)
    if (!res.ok) return { ok: false, error: res.error }
    return { ok: true, config: cfg }
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
  'device:disconnect': async function () {
    killSidecar()
    return { ok: true }
  },
  'sidecar:status': async function () {
    return { running: !!sidecarProc, port: sidecarPort, sn: sidecarSn }
  },
  'jmuxer:source': async function () {
    try {
      return { ok: true, source: readFileSync(JMUXER_FILE, 'utf8') }
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) }
    }
  },
  // ---- 截图识别 RPC ----
  'shot:enabled': async function () {
    return { enabled: Object.assign({}, shotEnabledSns) }
  },
  'shot:set-enabled': async function (args, ctx) {
    const sn = String((args && args.sn) || '').trim()
    const enabled = !!(args && args.enabled)
    if (!sn) return { ok: false, error: '缺少设备 SN' }
    if (enabled) shotEnabledSns[sn] = true
    else delete shotEnabledSns[sn]
    syncShotTool(ctx)
    return { ok: true, enabled: enabled, registered: !!shotToolDisposer, count: Object.keys(shotEnabledSns).length }
  },
  // 截取屏幕并返回 base64（「添加截图至聊天框」按钮用；直接用户手势，不走二次确认/视觉模型）
  'shot:capture': async function (args) {
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
  inject: ['webServer'],
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
      if (shotToolDisposer) {
        try { shotToolDisposer() } catch (e) {}
        shotToolDisposer = null
      }
      killSidecar()
    })
  },
}
