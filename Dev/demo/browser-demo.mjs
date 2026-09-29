// browser-demo.mjs —— 网页 demo：能暂停/恢复，用来体验"暂停中转屏 → 恢复时补发 GOP"（独立程序）
//
// 用法：node hos/Dev/demo/browser-demo.mjs [scale]
//   打开它打印的 http://127.0.0.1:8899/
//   1) 点「开始」→ 出画面
//   2) 点「暂停」→ 画面冻住（sidecar 不再转发；但设备端照推，sidecar 在缓存最新配置+关键帧）
//   3) 这时候转平板（横→竖）
//   4) 点「恢复」→ sidecar 先补发"配置+关键帧"，画面应该立刻以新方向出现
//
// 页面里同时带"先换后喂"规则（扫到 SPS 且尺寸变了就先重建 jmuxer 再喂），和插件将来的行为一致。

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..', '..')
const JAR = join(ROOT, 'hos', 'resources', 'hosScrcpy-1.0.18-beta.jar')
const OUT = join(ROOT, 'hos', 'resources', 'out')
const JMUXER = join(HERE, 'jmuxer.min.js')   // 同目录那份（与插件的 jmuxer 同源）
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
const HTTP_PORT = 8899

if (!existsSync(JMUXER)) { console.error('找不到 jmuxer：' + JMUXER); process.exit(1) }

console.log('[demo] 起 sidecar（scale=' + SCALE + '）…')
const proc = spawn(JAVA, ['-cp', JAR + ';' + OUT, 'Main', '--sn', SN, '--hdc', HDC, '--port', '0',
  '--scale', String(SCALE), '--frame-rate', '60', '--bit-rate', '0', '--ifr', '2000', '--idle-exit', '1800'],
  { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let sidecarPort = 0, acc = ''
function eat(which, chunk) {
  acc += chunk.toString('utf8'); let nl
  while ((nl = acc.indexOf('\n')) >= 0) {
    const line = acc.slice(0, nl).trim(); acc = acc.slice(nl + 1)
    if (!line) continue
    if (/bridge|forward|error|fail/i.test(line)) console.log('[' + which + '] ' + line)
    const m = line.match(/127\.0\.0\.1:(\d{4,5})/) || line.match(/(?:port|Forwardport)[^0-9]{0,20}(\d{4,5})/i)
    if (m && !sidecarPort) { sidecarPort = Number(m[1]); console.log('[demo] sidecar 端口 = ' + sidecarPort) }
  }
}
proc.stdout.on('data', (c) => eat('sidecar', c))
proc.stderr.on('data', (c) => eat('sidecar', c))

const PAGE = `<!doctype html><html lang="zh"><meta charset="utf-8">
<title>鸿蒙投屏 demo：暂停/恢复 + 动态分辨率</title>
<style>
 html,body{margin:0;background:#111;color:#ddd;font:13px/1.6 ui-monospace,Consolas,monospace}
 #bar{padding:8px 12px;background:#1b1b1b;border-bottom:1px solid #333;position:sticky;top:0}
 button{background:#2d5;color:#051;border:0;padding:6px 14px;font:inherit;cursor:pointer;margin-right:8px}
 button.off{background:#555;color:#bbb}
 button.warn{background:#e83;color:#210}
 #stat{padding:6px 12px;color:#9ad;white-space:pre-wrap}
 #wrap{display:flex;gap:12px;align-items:flex-start;padding:0 12px 12px}
 /* 画面限制在屏幕内：宽度不超过 48%，高度不超过 52vh，整幅都能看见 */
 video{flex:0 0 auto;max-width:48vw;max-height:52vh;background:#000;border:1px solid #333}
 #log{flex:1 1 auto;white-space:pre-wrap;max-height:60vh;overflow:auto;color:#999}
</style>
<div id="bar">
  <button id="go">开始</button>
  <button id="pause" class="off" disabled>暂停</button>
  <button id="resume" class="off" disabled>恢复</button>
  <span id="title">未连接</span>
</div>
<div id="stat"></div>
<div id="wrap"><video id="v" muted playsinline autoplay></video><div id="log"></div></div>
<script src="/jmuxer.min.js"></script>
<script>
const $ = (id) => document.getElementById(id)
let ws = null, jmuxer = null, frames = 0, bytes = 0, t0 = 0, pausedByUs = false, framesAtResume = 0
let trackDims = ''        // 当前 jmuxer 轨道认的编码尺寸（由流里的 SPS 决定，不用 videoWidth）
function log(s){ const d=$('log'); d.textContent = '[' + ((performance.now()-t0)/1000).toFixed(2) + 's] ' + s + '\\n' + d.textContent }
function stat(){
  const v = $('v')
  $('stat').textContent = '帧=' + frames + '  ' + (bytes/1048576).toFixed(1) + 'MB'
    + '   轨道尺寸=' + (trackDims || '?')
    + '   videoWidth/Height=' + (v.videoWidth||0) + 'x' + (v.videoHeight||0)
    + '   readyState=' + v.readyState + '  paused=' + v.paused
    + '   currentTime=' + (v.currentTime||0).toFixed(2)
    + '   buffered=' + (v.buffered.length ? (v.buffered.end(v.buffered.length-1)).toFixed(2) : '-')
}
function newMuxer(why){
  if (jmuxer) { try { jmuxer.destroy() } catch(e){} }
  jmuxer = new JMuxer({ node: $('v'), mode: 'video', flushingTime: 0, fps: 60,
    onError: (e) => log('jmuxer onError: ' + (e && (e.message||e))) })
  log('jmuxer 重建（' + why + '）')
}
function nalList(b){ const out=[]; let i=0; const st=[]
  while(i<b.length-3){ if(b[i]===0&&b[i+1]===0&&b[i+2]===1){st.push(i+3);i+=3}
    else if(i<b.length-4&&b[i]===0&&b[i+1]===0&&b[i+2]===0&&b[i+3]===1){st.push(i+4);i+=4} else i++ }
  for(let k=0;k<st.length;k++){ const s=st[k]; const e=k+1<st.length?st[k+1]-3:b.length
    if(s<b.length) out.push({ type:b[s]&31, start:s, end:Math.max(s,e) }) }
  return out }
function stripEmu(b){ const o=[]; for(let i=0;i<b.length;i++){ if(i+2<b.length&&b[i]===0&&b[i+1]===0&&b[i+2]===3){o.push(0,0);i+=2} else o.push(b[i]) } return Uint8Array.from(o) }
class BR{ constructor(b){this.b=b;this.p=0} u(n){let v=0;for(let i=0;i<n;i++){const by=this.b[this.p>>3],bit=(by>>(7-(this.p&7)))&1;v=(v<<1)|bit;this.p++}return v}
  ue(){let z=0;while(this.p<this.b.length*8&&this.u(1)===0)z++;return z===0?0:(1<<z)-1+this.u(z)} se(){const k=this.ue();return (k&1)?(k+1)>>1:-(k>>1)} }
function spsDims(payload){
  try{
    const b=stripEmu(payload).slice(1); const r=new BR(b)
    const profile=r.u(8); r.u(8); r.u(8); r.ue()
    const hi={100:1,110:1,122:1,244:1,44:1,83:1,86:1,118:1,128:1,138:1,139:1,134:1,135:1}
    let cf=1
    if(hi[profile]){ cf=r.ue(); if(cf===3)r.u(1); r.ue(); r.ue(); r.u(1)
      if(r.u(1)){ const n=cf!==3?8:12; for(let i=0;i<n;i++){ if(r.u(1)){ const size=i<6?16:64; let last=8,next=8
        for(let j=0;j<size;j++){ if(next!==0) next=(last+r.se()+256)%256; last=next===0?last:next } } } } }
    r.ue(); const poc=r.ue()
    if(poc===0) r.ue(); else if(poc===1){ r.u(1); r.se(); r.se(); const n=r.ue(); for(let i=0;i<n;i++) r.se() }
    r.ue(); r.u(1)
    const wMbs=r.ue()+1, hMap=r.ue()+1, fmo=r.u(1)
    if(!fmo) r.u(1)
    r.u(1)
    let cl=0,cr=0,ct=0,cb=0
    if(r.u(1)){ cl=r.ue(); cr=r.ue(); ct=r.ue(); cb=r.ue() }
    return (wMbs*16-(cl+cr)*2) + 'x' + ((2-fmo)*hMap*16-(ct+cb)*2)
  }catch(e){ return null }
}
function send(o){ try { ws.send(JSON.stringify(o)); log('发送: ' + JSON.stringify(o)) } catch(e){ log('发送失败: ' + e.message) } }
$('go').onclick = async () => {
  const j = await (await fetch('/api/port')).json()
  if (!j.port) { log('sidecar 端口还没出来，等一下再点'); return }
  $('go').disabled = true; $('go').className='off'; $('title').textContent='连 ws://127.0.0.1:'+j.port
  $('pause').disabled = false; $('pause').className='warn'
  $('resume').disabled = false; $('resume').className='off'
  t0 = performance.now(); newMuxer('初始化')
  ws = new WebSocket('ws://127.0.0.1:'+j.port+'/'); ws.binaryType='arraybuffer'
  ws.onopen = () => { log('WS open'); send({type:'size'}); send({type:'screen',mode:'video'}) }
  ws.onclose = (e) => log('WS close '+e.code)
  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      const o = JSON.parse(ev.data)
      log('WS text: ' + ev.data)
      if (o.msg === 'size') log('sidecar 报的坐标空间 = ' + o.data)
      if (o.msg === 'broadcast paused') log('—— 已暂停：现在可以转平板（横→竖）——')
      if (o.msg === 'broadcast resumed') { framesAtResume = frames; log('—— 已恢复：如果补发生效，下面应立刻出现 SPS/PPS/IDR ——') }
      return
    }
    const u8 = new Uint8Array(ev.data); frames++; bytes += u8.length
    const nals = nalList(u8)
    const v = $('v'); const vwBefore = (v.videoWidth||0)+'x'+(v.videoHeight||0)
    let sps = null
    for (const n of nals) if (n.type === 7) { sps = spsDims(u8.slice(n.start, n.end)); log('收到 SPS：编码尺寸 = ' + sps); break }
    if (sps && sps !== trackDims) {
      log('★ 尺寸与轨道不同（轨道=' + (trackDims||'空') + ' SPS=' + sps + '）→ 先重建 jmuxer，再喂这一帧')
      newMuxer('SPS 换分辨率 ' + (trackDims||'空') + ' → ' + sps)
      trackDims = sps
      send({type:'size'})
    } else if (sps && !trackDims) { trackDims = sps }
    for (const n of nals) if (n.type === 8) log('收到 PPS')
    for (const n of nals) if (n.type === 5) log('收到 IDR（关键帧）')
    try { jmuxer.feed({ video: u8 }) } catch (e) { log('feed 错误: ' + e.message) }
    setTimeout(() => {
      const vwAfter = (v.videoWidth||0)+'x'+(v.videoHeight||0)
      if (vwAfter !== vwBefore) log('★ video 尺寸：' + vwBefore + ' → ' + vwAfter)
    }, 250)
  }
}
$('pause').onclick = () => { pausedByUs = true; $('pause').className='off'; $('resume').className='warn'; send({type:'screen',mode:'pause'}) }
$('resume').onclick = () => { $('resume').className='off'; $('pause').className='warn'; send({type:'screen',mode:'resume'}); send({type:'size'}) }
setInterval(stat, 500)
</script></html>`

const server = createServer((req, res) => {
  if (req.url === '/api/port') { res.setHeader('content-type','application/json'); res.end(JSON.stringify({ port: sidecarPort })); return }
  if (req.url === '/jmuxer.min.js') { res.setHeader('content-type','text/javascript'); res.end(readFileSync(JMUXER)); return }
  res.setHeader('content-type','text/html; charset=utf-8'); res.end(PAGE)
})
server.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log('[demo] 用浏览器打开： http://127.0.0.1:' + HTTP_PORT + '/')
  console.log('[demo] 步骤：开始 → 暂停 → 转平板 → 恢复 → 看画面是否立刻以新方向出现')
})
function bye(){ try{ proc.kill() }catch(e){} ; process.exit(0) }
process.on('SIGINT', bye); process.on('SIGTERM', bye)
