// probe-pause-rotate.mjs —— 复现"暂停 → 转屏 → 恢复"，脚本自己检测方向变化并自动恢复（独立程序）
//
// 时间线（默认）：
//   0~10s   正常出画面
//   10s     发 {type:'screen', mode:'pause'}
//   10~20s  暂停窗口（这 10 秒内把平板转成竖屏，转完别动）
//   20s     发 {type:'screen', mode:'resume'} + {type:'size'}
//   20~50s  观察恢复后的编码分辨率 / IDR / 尺寸回报
//   结束    打汇总：暂停前后的分辨率、恢复后第一个 SPS 是什么、间隔多久
//
// 用法：node hos/Dev/demo/probe-pause-rotate.mjs [scale]

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
const SCALE = Number(process.argv[2] || 2)
const PAUSE_AT = 10, RESUME_AT = 170, END_AT = 180   // 10s 暂停 → 你转屏 → 脚本检测到方向变了就自动恢复，恢复后 20 秒收工

mkdirSync(HERE, { recursive: true })
const logPath = join(HERE, 'pause-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.log')
const logFile = createWriteStream(logPath, { flags: 'a' })
const T0 = Date.now()
function log(tag, msg) {
  const line = '[' + ((Date.now() - T0) / 1000).toFixed(2).padStart(7) + 's] ' + tag.padEnd(9) + msg
  console.log(line); logFile.write(line + '\n')
}
log('banner', '================ 脚本开始运行 ================')
log('banner', '正在起 sidecar（约 5~8 秒就绪；就绪时会打印「开始记录」——那一刻才是计时基准）')

function nalTypes(b) {
  const out = []; let i = 0; const st = []
  while (i < b.length - 3) {
    if (b[i] === 0 && b[i + 1] === 0 && b[i + 2] === 1) { st.push(i + 3); i += 3 }
    else if (i < b.length - 4 && b[i] === 0 && b[i + 1] === 0 && b[i + 2] === 0 && b[i + 3] === 1) { st.push(i + 4); i += 4 }
    else i++
  }
  for (let k = 0; k < st.length; k++) {
    const s = st[k]; const e = k + 1 < st.length ? st[k + 1] - 3 : b.length
    if (s < b.length) out.push({ type: b[s] & 0x1f, start: s, end: Math.max(s, e) })
  }
  return out
}
function stripEmu(b) { const o = []; for (let i = 0; i < b.length; i++) { if (i + 2 < b.length && b[i] === 0 && b[i + 1] === 0 && b[i + 2] === 3) { o.push(0, 0); i += 2 } else o.push(b[i]) } return Uint8Array.from(o) }
class BR { constructor(b) { this.b = b; this.p = 0 } u(n) { let v = 0; for (let i = 0; i < n; i++) { const by = this.b[this.p >> 3], bit = (by >> (7 - (this.p & 7))) & 1; v = (v << 1) | bit; this.p++ } return v } ue() { let z = 0; while (this.p < this.b.length * 8 && this.u(1) === 0) z++; return z === 0 ? 0 : (1 << z) - 1 + this.u(z) } se() { const k = this.ue(); return (k & 1) ? (k + 1) >> 1 : -(k >> 1) } }
function parseSPS(payload) {
  const b = stripEmu(payload).slice(1); const r = new BR(b)
  const profile = r.u(8); r.u(8); r.u(8); r.ue()
  const hi = { 100: 1, 110: 1, 122: 1, 244: 1, 44: 1, 83: 1, 86: 1, 118: 1, 128: 1, 138: 1, 139: 1, 134: 1, 135: 1 }
  let cf = 1
  if (hi[profile]) { cf = r.ue(); if (cf === 3) r.u(1); r.ue(); r.ue(); r.u(1)
    if (r.u(1)) { const n = cf !== 3 ? 8 : 12; for (let i = 0; i < n; i++) { if (r.u(1)) { const size = i < 6 ? 16 : 64; let last = 8, next = 8; for (let j = 0; j < size; j++) { if (next !== 0) next = (last + r.se() + 256) % 256; last = next === 0 ? last : next } } } } }
  r.ue(); const poc = r.ue()
  if (poc === 0) r.ue()
  else if (poc === 1) { r.u(1); r.se(); r.se(); const n = r.ue(); for (let i = 0; i < n; i++) r.se() }
  r.ue(); r.u(1)
  const wMbs = r.ue() + 1, hMap = r.ue() + 1, fmo = r.u(1)
  if (!fmo) r.u(1)
  r.u(1)
  let cl = 0, cr = 0, ct = 0, cb = 0
  if (r.u(1)) { cl = r.ue(); cr = r.ue(); ct = r.ue(); cb = r.ue() }
  const subW = cf === 3 ? 1 : 2, subH = cf === 1 ? 2 : 1
  const codedW = wMbs * 16 - (cl + cr) * subW
  const codedH = (2 - fmo) * hMap * 16 - (ct + cb) * subH
  // VUI 的第一个字段就是长宽比（SAR）—— 浏览器/MSE 会把显示尺寸算成 coded × sar
  let sar = null
  try {
    if (r.u(1)) {                       // vui_parameters_present_flag
      if (r.u(1)) {                     // aspect_ratio_info_present_flag
        const table = { 1: [1, 1], 2: [12, 11], 3: [10, 11], 4: [16, 11], 5: [40, 33], 6: [24, 11], 7: [20, 11], 8: [32, 11], 9: [80, 33], 10: [18, 11], 11: [15, 11], 12: [64, 33], 13: [160, 99], 14: [4, 3], 15: [3, 2], 16: [2, 1] }
        const idc = r.u(8)
        if (idc === 255) sar = [r.u(16), r.u(16)]
        else if (table[idc]) sar = table[idc]
      }
    }
  } catch (e) { sar = null }
  return { profile, width: codedW, height: codedH, sar }
}

const proc = spawn(JAVA, ['-cp', JAR + ';' + OUT, 'Main', '--sn', SN, '--hdc', HDC, '--port', '0',
  '--scale', String(SCALE), '--frame-rate', '60', '--bit-rate', '0', '--ifr', '2000', '--idle-exit', String(END_AT + 30)],
  { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
log('spawn', 'scale=' + SCALE + '（2 = 1/2）')
let outbuf = '', port = 0, ws = null
let frames = 0, lastFrameAt = 0, firstFrameAfterResume = 0
const before = [], after = []
let phase = 'before'
let spsCount = 0

proc.stdout.on('data', (c) => onOut('sidecar', c))
proc.stderr.on('data', (c) => onOut('sidecar!', c))
function onOut(which, chunk) {
  outbuf += chunk.toString('utf8'); let nl
  while ((nl = outbuf.indexOf('\n')) >= 0) {
    const line = outbuf.slice(0, nl).trim(); outbuf = outbuf.slice(nl + 1)
    if (!line) continue
    if (/bridge|HosRemoteDevice|Forward|error|fail/i.test(line)) log(which, line)
    const m = line.match(/127\.0\.0\.1:(\d{4,5})/) || line.match(/(?:port|Forwardport)[^0-9]{0,20}(\d{4,5})/i)
    if (m && !port) { port = Number(m[1]); log('port', '端口 ' + port); connect(port) }
  }
}
function connect(p) {
  ws = new WebSocket('ws://127.0.0.1:' + p + '/')
  ws.binaryType = 'arraybuffer'
  ws.onopen = () => {
    log('ws', 'open')
    log('banner', '=========== 开始记录（计时基准 = 现在）===========')
    log('banner', '>>> 现在请把平板转成竖屏（随便什么时候都行，转完别动）')
    ws.send(JSON.stringify({ type: 'size' })); ws.send(JSON.stringify({ type: 'screen', mode: 'video' }))
  }
  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      log('ws-text', ev.data)
      try {
        const o = JSON.parse(ev.data)
        if (o.msg === 'size' && o.data) {
          const d = String(o.data).split('x').map(Number)
          const land = d[0] > d[1]
          if (prePauseLandscape === null) prePauseLandscape = land
          else if (pausedAuto && !autoResumed && land !== prePauseLandscape) {
            autoResumed = true
            log('banner', '★ 检测到设备方向变了（' + o.data + '）→ 1 秒后自动 resume（你不用管时间）')
            setTimeout(() => { phase = 'after-resume'; resumeAt = Date.now(); log('phase', '>>> resume（自动）'); send({ type: 'screen', mode: 'resume' }); setTimeout(finish, 20000) }, 1000)
          }
        }
      } catch (e) {}
      return
    }
    const u8 = new Uint8Array(ev.data)
    frames++; const now = Date.now()
    if (phase === 'after-resume' && !firstFrameAfterResume) { firstFrameAfterResume = now; log('frame', '恢复后第一帧（距 resume ' + ((now - resumeAt) / 1000).toFixed(2) + 's）') }
    lastFrameAt = now
    for (const n of nalTypes(u8)) {
      if (n.type === 7) {
        spsCount++
        const s = parseSPS(u8.slice(n.start, n.end))
        const desc = s ? (s.width + 'x' + s.height
          + '  编码尺寸；SAR=' + (s.sar ? s.sar[0] + ':' + s.sar[1] : '无')
          + '  显示尺寸=' + (s.sar ? Math.round(s.width * s.sar[0] / s.sar[1]) + 'x' + Math.round(s.height * s.sar[1] / s.sar[0]) : s.width + 'x' + s.height)) : '解析失败'
        log('SPS', '分辨率 = ' + desc + '（第 ' + spsCount + ' 个）  phase=' + phase)
        if (spsCount >= 2) log('banner', '===== 检测到新 SPS：设备端此刻换了配置（时间点对齐用）=====')
        if (s) (phase === 'before' ? before : after).push(desc)
      } else if (n.type === 5) log('IDR', 'phase=' + phase)
    }
  }
  ws.onclose = (e) => log('ws', 'close ' + e.code)
}
function send(obj) { try { ws.send(JSON.stringify(obj)); log('send', JSON.stringify(obj)) } catch (e) { log('send', '失败 ' + e.message) } }

let resumeAt = 0
let prePauseLandscape = null, pausedAuto = false, autoResumed = false
setInterval(() => { if (ws && ws.readyState === 1) send({ type: 'size' }) }, 2000)
setTimeout(() => { pausedAuto = true; log('phase', '>>> 已暂停：现在请把平板转成竖屏（随便什么时候，脚本检测到就会自动恢复）'); send({ type: 'screen', mode: 'pause' }) }, PAUSE_AT * 1000)
setTimeout(() => { phase = 'after-resume'; resumeAt = Date.now(); log('phase', '>>> resume'); send({ type: 'screen', mode: 'resume' }); send({ type: 'size' }) }, RESUME_AT * 1000)
function finish() {
  log('summary', '==== 汇总 ====')
  log('summary', '暂停前出现的分辨率：' + (before.join(' ') || '（无）'))
  log('summary', '恢复后出现的分辨率：' + (after.join(' ') || '（无）'))
  log('summary', '恢复后首帧延迟：' + (firstFrameAfterResume ? ((firstFrameAfterResume - resumeAt) / 1000).toFixed(2) + 's' : '没等到'))
  log('summary', '总帧数=' + frames + '（暂停期间应当没有帧到达）')
  log('summary', '日志：' + logPath)
  try { ws.close() } catch (e) {}
  try { proc.kill() } catch (e) {}
  setTimeout(() => process.exit(0), 800)
}
setTimeout(finish, END_AT * 1000)
