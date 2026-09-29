// probe-stream.mjs —— 鸿蒙投屏试验台：起 sidecar、连它的 WS、解 SPS、打时间线（独立程序，不进任何插件包）
//
// 目的：绕开 DSH 插件那条慢链路（打包→安装→重启→复现），直接：
//   1) 用 sidecar 现成的 CLI 把它跑起来，并把它被插件吃掉的那堆 stdout 原样打出来
//   2) 连它开的 WS，发 {type:'size'} / {type:'screen',mode:'video'}
//   3) 解析 H.264：统计 SPS(7)/PPS(8)/IDR(5)，并从 SPS 里解出**真实编码分辨率**
//      —— 这是回答"2160x1440（3/4）到底哪来的"的关键（浏览器里那个 videoWidth 就是这么来的）
//
// 用法：node hos/Dev/demo/probe-stream.mjs [秒数]
//   默认跑 60 秒；期间你可以转屏、改缩放，脚本会把时间线打出来。
//   同时写一份日志到 hos/Dev/demo/run-<时间戳>.log，方便事后贴出来。

import { spawn } from 'node:child_process'
import { createWriteStream, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..', '..')
const JAR = join(ROOT, 'hos', 'resources', 'hosScrcpy-1.0.18-beta.jar')
const OUT = join(ROOT, 'hos', 'resources', 'out')
// 这三个都从环境变量取，别在脚本里写死本机路径（别人拿去也要能跑）：
//   HOS_SN   必填：`hdc list targets` 里的设备号
//   HOS_HDC  可选：hdc 可执行文件路径，默认就用 PATH 里的 `hdc`
//   HOS_JAVA 可选：java 可执行文件路径，默认就用 PATH 里的 `java`（Java 8+）
const JAVA = process.env.HOS_JAVA || 'java'
const HDC = process.env.HOS_HDC || 'hdc'
const SN = process.env.HOS_SN || ''
if (!SN) {
  console.error('请先设置设备序列号，例如：')
  console.error('  PowerShell:  $env:HOS_SN="<hdc list targets 输出里的那串>"')
  console.error('  bash/zsh:    export HOS_SN=<...>')
  process.exit(1)
}
const SECONDS = Number(process.argv[2] || 60)
const SCALE = Number(process.env.LAB_SCALE || 2)   // 2 = 1/2；设 LAB_SCALE=1 就是原画
const CP = JAR + ';' + OUT

mkdirSync(HERE, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const logPath = join(HERE, 'run-' + stamp + '.log')
const logFile = createWriteStream(logPath, { flags: 'a' })
const T0 = Date.now()
function log(tag, msg) {
  const line = '[' + ((Date.now() - T0) / 1000).toFixed(2).padStart(7) + 's] ' + tag.padEnd(9) + msg
  console.log(line)
  logFile.write(line + '\n')
}

// ---------- H.264 小工具 ----------
function nalTypes(buf) {
  // 按 Annex-B 起始码切分，返回 [{type, start, end}]
  const out = []
  let i = 0
  const starts = []
  while (i < buf.length - 3) {
    if (buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 1) { starts.push(i + 3); i += 3 }
    else if (i < buf.length - 4 && buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 0 && buf[i + 3] === 1) { starts.push(i + 4); i += 4 }
    else i++
  }
  for (let k = 0; k < starts.length; k++) {
    const s = starts[k]
    const e = k + 1 < starts.length ? starts[k + 1] - 3 : buf.length
    if (s < buf.length) out.push({ type: buf[s] & 0x1f, start: s, end: Math.max(s, e) })
  }
  return out
}
function stripEmulation(buf) {
  const out = []
  for (let i = 0; i < buf.length; i++) {
    if (i + 2 < buf.length && buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 3) { out.push(0, 0); i += 2 }
    else out.push(buf[i])
  }
  return Uint8Array.from(out)
}
class BitReader {
  constructor(b) { this.b = b; this.pos = 0 }
  u(n) { let v = 0; for (let i = 0; i < n; i++) { const byte = this.b[this.pos >> 3]; const bit = (byte >> (7 - (this.pos & 7))) & 1; v = (v << 1) | bit; this.pos++ } return v }
  ue() { let z = 0; while (this.pos < this.b.length * 8 && this.u(1) === 0) z++; if (z === 0) return 0; return (1 << z) - 1 + this.u(z) }
  se() { const k = this.ue(); return (k & 1) ? (k + 1) >> 1 : -(k >> 1) }
}
function parseSPS(payload) {
  // payload: 含 NAL 头字节的 SPS NAL
  const b = stripEmulation(payload).slice(1)
  const r = new BitReader(b)
  const profile = r.u(8); r.u(8); r.u(8)
  r.ue() // sps id
  const chromaMap = { 100: 1, 110: 1, 122: 1, 244: 1, 44: 1, 83: 1, 86: 1, 118: 1, 128: 1, 138: 1, 139: 1, 134: 1, 135: 1 }
  let chromaFormat = 1
  if (chromaMap[profile]) {
    chromaFormat = r.ue()
    if (chromaFormat === 3) r.u(1)
    r.ue(); r.ue(); r.u(1)
    if (r.u(1)) { // scaling matrix: 先跳过（罕见），跳过失败就放弃
      try { const n = chromaFormat !== 3 ? 8 : 12; for (let i = 0; i < n; i++) { if (r.u(1)) { const size = i < 6 ? 16 : 64; let last = 8, next = 8; for (let j = 0; j < size; j++) { if (next !== 0) next = (last + r.se() + 256) % 256; last = next === 0 ? last : next } } } } catch (e) { return null }
    }
  }
  r.ue() // log2_max_frame_num_minus4
  const pocType = r.ue()
  if (pocType === 0) r.ue()
  else if (pocType === 1) { r.u(1); r.se(); r.se(); const n = r.ue(); for (let i = 0; i < n; i++) r.se() }
  r.ue() // max_num_ref_frames
  r.u(1) // gaps
  const wMbs = r.ue() + 1
  const hMap = r.ue() + 1
  const frameMbsOnly = r.u(1)
  if (!frameMbsOnly) r.u(1)
  r.u(1) // direct8x8
  let cl = 0, cr = 0, ct = 0, cb = 0
  if (r.u(1)) { cl = r.ue(); cr = r.ue(); ct = r.ue(); cb = r.ue() }
  const subW = chromaFormat === 3 ? 1 : 2
  const subH = chromaFormat === 1 ? 2 : 1
  const width = wMbs * 16 - (cl + cr) * subW
  const height = (2 - frameMbsOnly) * hMap * 16 - (ct + cb) * subH
  return { profile, width, height }
}

// ---------- 起 sidecar ----------
const args = ['-cp', CP, 'Main', '--sn', SN, '--hdc', HDC, '--port', '0',
  '--scale', String(SCALE), '--frame-rate', '60', '--bit-rate', '0', '--ifr', '2000', '--idle-exit', String(SECONDS + 30)]
log('spawn', 'java ' + args.join(' ') + '   （scale=' + SCALE + '）')
const proc = spawn(JAVA, args, { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let buf = ''
let port = 0
function onOut(which, chunk) {
  buf += chunk.toString('utf8')
  let nl
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim()
    buf = buf.slice(nl + 1)
    if (line) log(which, line)
    const m = line.match(/(?:port|ws|listen)[^0-9]{0,12}(\d{4,5})/i) || line.match(/127\.0\.0\.1:(\d{4,5})/)
    if (m && !port) { port = Number(m[1]); log('port', '识别到端口 ' + port + '，连它') ; connect(port) }
  }
}
proc.stdout.on('data', (c) => onOut('sidecar', c))
proc.stderr.on('data', (c) => onOut('sidecar!', c))
proc.on('exit', (code) => log('exit', 'sidecar 退出 code=' + code))

// ---------- 连 WS ----------
let ws = null
let frames = 0, bytes = 0, spsCount = 0, idrCount = 0
const sizes = new Map()
function connect(p) {
  ws = new WebSocket('ws://127.0.0.1:' + p + '/')
  ws.binaryType = 'arraybuffer'
  ws.onopen = () => {
    log('ws', 'open')
    ws.send(JSON.stringify({ type: 'size' }))
    ws.send(JSON.stringify({ type: 'screen', mode: 'video' }))
  }
  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') { log('ws-text', ev.data); return }
    const u8 = new Uint8Array(ev.data)
    frames++; bytes += u8.length
    for (const n of nalTypes(u8)) {
      if (n.type === 7) {
        spsCount++
        const s = parseSPS(u8.slice(n.start, n.end))
        if (s) {
          const key = s.width + 'x' + s.height
          sizes.set(key, (sizes.get(key) || 0) + 1)
          log('SPS', '编码分辨率 = ' + key + '  profile=' + s.profile + '（第 ' + spsCount + ' 个 SPS）')
        } else log('SPS', '解析失败（len=' + (n.end - n.start) + '）')
      } else if (n.type === 8) log('PPS', '出现')
      else if (n.type === 5) { idrCount++; log('IDR', '出现（第 ' + idrCount + ' 个）') }
    }
    if (frames % 100 === 0) log('stat', 'frames=' + frames + ' bytes=' + bytes)
  }
  ws.onclose = (e) => log('ws', 'close code=' + e.code)
  ws.onerror = () => log('ws', 'error')
}

// ---------- 到时收摊 ----------
setTimeout(() => {
  log('summary', '==== 汇总 ====')
  log('summary', '帧数=' + frames + '  字节=' + bytes + '  SPS=' + spsCount + '  IDR=' + idrCount)
  log('summary', '出现过的编码分辨率：' + (sizes.size ? [...sizes.entries()].map(([k, v]) => k + '(' + v + '次)').join('  ') : '（一个都没解出来）'))
  log('summary', '我们请求的 scale=' + SCALE + '（2 应得 1/2，1 应得原画）')
  log('summary', '日志文件：' + logPath)
  try { if (ws) ws.close() } catch (e) {}
  try { proc.kill() } catch (e) {}
  setTimeout(() => process.exit(0), 800)
}, SECONDS * 1000)
