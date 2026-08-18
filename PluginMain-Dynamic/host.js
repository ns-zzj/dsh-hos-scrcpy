// ============================================================
// dsh-hos-scrcpy — 插件 Host 半区源码（DSH 进程内 Node.js）
//
// 重新加载方法：在 DSH 会话中用 cordis_define 创建动态插件，
// code.host 填入本文件全部内容（函数体），code.client 填入
// PluginMain/client.js 的内容，然后 cordis_run 激活。
// ============================================================

const CONFIG_FILE = 'dsh-hos-scrcpy.json'
// 运行时资源全部在仓库根（=DSH 工作区）的 PluginMain/ 下，用相对路径引用
const SIDECAR_OUT_REL = 'PluginMain/out'
const SDK_JAR_REL = 'PluginMain/hosScrcpy-1.0.18-beta.jar'
const JMUXER_REL = 'PluginMain/jmuxer.min.js'
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

    // 仓库根 = DSH 工作区；相对路径统一经这里解析
    async function repoRoot() {
      const t = await fs.resolve('.')
      return fs.processPath(t)
    }

    async function resPath(relPath) {
      const root = await repoRoot()
      return await fileTarget(rel(root, relPath))
    }

    // 配置文件固定放在仓库根（工作区）下
    async function configFileTarget() {
      const root = await repoRoot()
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
      const sidecarOut = await resPath(SIDECAR_OUT_REL)
      const sdkJar = await resPath(SDK_JAR_REL)
      const cpSep = (await repoRoot()).indexOf('\\') >= 0 ? ';' : ':'
      const j = await resolveJavaPath(cfg)
      if (!j.path) return { ok: false, error: 'Java 未配置，请到设置中配置' }
      const h = await resolveHdcPath(cfg)
      if (!h.path) return { ok: false, error: 'hdc 未配置，请到设置中配置' }
      if (!(await fileExists(sidecarOut)) || !(await fileExists(sdkJar))) {
        return { ok: false, error: 'sidecar 资源缺失（PluginMain/out 或 PluginMain/hosScrcpy-1.0.18-beta.jar）' }
      }
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
      try {
        const t = await resPath(JMUXER_REL)
        const text = await fs.readText(t)
        return { ok: true, source: text }
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) }
      }
    })

    ctx.on('dispose', function () {
      killSidecar()
    })
  },
}
