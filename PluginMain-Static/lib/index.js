// ============================================================
// dsh-hos-scrcpy — 插件 Host 半区（静态 npm 包版）
//
// 与动态版（PluginMain-Dynamic/host.js）的差异：
//   1. 不再使用动态沙箱的 harness.handle 全局，改在
//      ctx.webServer 上注册一条 JSON RPC 路由
//      POST /dsh-hos-scrcpy/rpc  { method, args } -> { ok, result }
//      （浏览器半区通过同源 fetch 调用）。
//   2. 资源不再按工作区相对路径解析，改为包内
//      resources/ 目录（import.meta.url 定位）。
//   3. 环境变量直接读 process.env，进程管理用 node:child_process。
// ============================================================

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn, execFile } from 'node:child_process'
import os from 'node:os'

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

let sidecarProc = null
let sidecarPort = 0
let sidecarSn = ''

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
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

// ---- 路径候选 ----
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

async function rpcHandler(req, res) {
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
    const result = await handler(parsed.args || {})
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
        handler: rpcHandler,
      }),
      'dsh-hos-scrcpy: rpc route'
    )
    ctx.on('dispose', function () {
      killSidecar()
    })
  },
}
