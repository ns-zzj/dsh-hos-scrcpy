// ============================================================
// dsh-hos-scrcpy - Client half (static npm package browser bundle)
// Generated from PluginMain-Dynamic/client.js (v2):
//   host.call -> rpc() (same-origin fetch POST /dsh-hos-scrcpy/rpc)
//   styles.insert -> insertStyles()
//   ctx.timer.interval -> window.setInterval
//   inject: ['timer'] -> exports.inject = ['slots']
// Format follows the window.__ModuleLoader__.load convention.
// ============================================================

window.__ModuleLoader__.load({
  id: 'dsh-hos-scrcpy',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    let React = require('react')
const CSS = `
.dshhos-trigger { position: relative; display: inline-flex; }
.dshhos-btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 28px; padding: 3px 8px; border-radius: 6px; cursor: pointer;
  color: var(--dsw-alias-label-tertiary, #81858c);
  border: 0; background: transparent;
  font-size: 12px; line-height: 18px; gap: 4px;
  transition: background .15s ease, color .15s ease;
}
.dshhos-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(38,49,72,.06)); color: var(--dsw-alias-label-secondary, #61666b); }
.dshhos-btn svg { width: 13px; height: 13px; display: block; }
.dshhos-mask { position: fixed; inset: 0; z-index: 9980; background: transparent; }
.dshhos-panel {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 9981;
  width: 336px; max-width: min(400px, calc(100vw - 32px));
  max-height: min(560px, calc(100vh - 140px)); overflow-y: auto;
  box-sizing: border-box;
  background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-3, #fff));
  border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1));
  border-radius: 12px; box-shadow: var(--dsw-shadow-lv3, 0 12px 32px rgba(0,0,0,.08));
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 13px; line-height: 20px; padding: 4px;
}
.dshhos-panel-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.04)); font-size: 13px; font-weight: 500; color: var(--dsw-alias-label-primary, #0f1115); }
.dshhos-panel-sec { padding: 8px 10px; }
.dshhos-panel-sec + .dshhos-panel-sec { border-top: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.04)); }
.dshhos-sec-title { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 500; color: var(--dsw-alias-label-tertiary, #81858c); letter-spacing: .04em; margin-bottom: 8px; }
.dshhos-env-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 500; padding: 1px 8px; border-radius: 999px; background: var(--dsw-alias-interactive-bg-hover, rgba(38,49,72,.06)); color: var(--dsw-alias-label-secondary, #61666b); text-transform: none; letter-spacing: 0; }
.dshhos-env-badge.ok { color: var(--dsw-alias-state-success-primary, #22c55e); }
.dshhos-env-badge.bad { color: var(--dsw-alias-state-error-primary, #ec1313); }
.dshhos-env-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary, #61666b); }
.dshhos-env-row b { color: var(--dsw-alias-label-primary, #0f1115); font-weight: 500; min-width: 42px; flex: none; }
.dshhos-path { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--ds-font-family-code, ui-monospace, Consolas, monospace); font-size: 11px; color: var(--dsw-alias-label-tertiary, #81858c); }
.dshhos-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-border-l2, rgba(0,0,0,.1)); flex: none; }
.dshhos-dot.ok { background: var(--dsw-alias-state-success-primary, #22c55e); }
.dshhos-dot.bad { background: var(--dsw-alias-state-error-primary, #ec1313); }
.dshhos-dot.warn { background: var(--dsw-alias-state-warn-primary, #f59e0b); }
.dshhos-list { display: flex; flex-direction: column; gap: 2px; }
.dshhos-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px;
  font-size: 13px; line-height: 18px; color: var(--dsw-alias-label-primary, #0f1115);
  font-family: var(--ds-font-family-code, ui-monospace, Consolas, monospace);
  transition: background .12s ease; border: 0; background: transparent; width: 100%; text-align: left; box-sizing: border-box;
}
.dshhos-item-sn { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshhos-connect {
  border: 0; background: transparent; cursor: pointer; padding: 0;
  font-size: 11px; color: var(--dsw-alias-state-business-primary, #4176e6); font-family: inherit;
}
.dshhos-connect:hover { text-decoration: underline; }
.dshhos-connect:disabled { opacity: .5; cursor: default; }
.dshhos-item .dshhos-connecting { margin-left: auto; font-size: 11px; color: var(--dsw-alias-label-caption, #adb2ba); font-family: inherit; }
.dshhos-shot-toggle { display: inline-flex; align-items: center; gap: 5px; flex: none; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary, #61666b); font-family: inherit; cursor: default; }
.dshhos-switch {
  position: relative; width: 30px; height: 16px; border-radius: 999px; padding: 0;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.18));
  background: var(--dsw-alias-bg-layer-2, #e9ebef); cursor: pointer; flex: none;
  transition: background .15s ease, border-color .15s ease;
}
.dshhos-switch::after {
  content: ''; position: absolute; top: 1px; left: 1px; width: 12px; height: 12px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.3); transition: transform .15s ease;
}
.dshhos-switch.on { background: var(--dsw-alias-state-business-primary, #4176e6); border-color: transparent; }
.dshhos-switch.on::after { transform: translateX(14px); }
.dshhos-empty { padding: 10px 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary, #81858c); white-space: pre-line; }
.dshhos-hint { font-size: 11px; line-height: 14px; color: var(--dsw-alias-label-caption, #adb2ba); margin-top: 4px; }
.dshhos-panel-foot { display: flex; justify-content: flex-end; padding: 6px 10px; border-top: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.04)); }
.dshhos-btn-sm {
  display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px; border-radius: 8px; cursor: pointer;
  font-size: 13px; line-height: 20px; font-weight: 500;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1)); background: transparent;
  color: var(--dsw-alias-label-primary, #0f1115); transition: background .12s ease;
}
.dshhos-btn-sm:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(38,49,72,.06)); }
.dshhos-btn-primary { background: var(--dsw-alias-button-info-fill, #4176e6); border-color: transparent; color: var(--dsw-alias-label-primary-foreground, #fff); }
.dshhos-btn-primary:hover:not(:disabled) { background: var(--dsw-alias-button-info-hover, #679efe); }
.dshhos-btn:disabled, .dshhos-btn-sm:disabled { opacity: .55; cursor: default; }
.dshhos-dialog-mask { position: fixed; inset: 0; z-index: 9990; background: var(--dsw-alias-bg-mask-1, rgba(0,0,0,.24)); display: flex; align-items: flex-start; justify-content: center; padding-top: 12vh; }
.dshhos-dialog { width: 460px; max-width: calc(100vw - 40px); box-sizing: border-box; background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-3, #fff)); border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1)); border-radius: 14px; box-shadow: var(--dsw-shadow-lv3, 0 12px 32px rgba(0,0,0,.08)); color: var(--dsw-alias-label-primary, #0f1115); font-size: 13px; line-height: 20px; }
.dshhos-dialog-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.04)); font-weight: 600; font-size: 14px; line-height: 22px; }
.dshhos-dialog-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
.dshhos-field { display: flex; flex-direction: column; gap: 5px; }
.dshhos-field label { font-size: 12px; font-weight: 500; color: var(--dsw-alias-label-secondary, #61666b); }
.dshhos-field input { width: 100%; box-sizing: border-box; height: 32px; padding: 0 10px; border-radius: 8px; font-size: 12px; font-family: var(--ds-font-family-code, ui-monospace, Consolas, monospace); border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1)); background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #0f1115); outline: none; transition: border-color .12s ease; }
.dshhos-field input:focus { border-color: var(--dsw-alias-state-business-primary, #4176e6); }
.dshhos-dialog-foot { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.04)); }
.dshhos-close { border: none; background: transparent; cursor: pointer; color: var(--dsw-alias-label-tertiary, #81858c); font-size: 15px; line-height: 1; width: 24px; height: 24px; border-radius: 6px; }
.dshhos-close:hover { color: var(--dsw-alias-label-primary, #0f1115); background: var(--dsw-alias-interactive-bg-hover, rgba(38,49,72,.06)); }
.dshhos-spin { width: 11px; height: 11px; border-radius: 50%; flex: none; border: 2px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1)); border-top-color: var(--dsw-alias-state-business-primary, #4176e6); animation: dshhos-rotate .7s linear infinite; }
@keyframes dshhos-rotate { to { transform: rotate(360deg); } }
.dshhos-notice { font-size: 12px; color: var(--dsw-alias-state-success-primary, #22c55e); }
/* ---- 右侧投屏控制区 ---- */
.dshhos-control {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 9995;
  width: 360px; box-sizing: border-box;
  background: var(--dsw-alias-bg-base, #f9fafb);
  border-left: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1));
  display: flex; flex-direction: column;
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 12px;
  transition: width .2s ease;
}
.dshhos-control-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.04)); flex: none; }
.dshhos-control-head .dshhos-csn { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--ds-font-family-code, ui-monospace, Consolas, monospace); font-size: 11px; color: var(--dsw-alias-label-secondary, #61666b); }
.dshhos-control-head .dshhos-btn-sm { flex: none; white-space: nowrap; }
.dshhos-shot-btn { font-size: 11px; padding: 0 8px; height: 24px; }
.dshhos-control-status { padding: 6px 12px; font-size: 12px; line-height: 18px; flex: none; }
.dshhos-control-status.ok { color: var(--dsw-alias-state-success-primary, #22c55e); }
.dshhos-control-status.warn { color: var(--dsw-alias-state-warn-primary, #f59e0b); }
.dshhos-control-status.bad { color: var(--dsw-alias-state-error-primary, #ec1313); }
.dshhos-screen { flex: 1; min-height: 0; background: #000; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
.dshhos-screen video { width: 100%; height: 100%; object-fit: contain; display: block; cursor: crosshair; }
.dshhos-log {
  flex: 1; min-height: 40px; max-height: 160px; overflow-y: auto;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.04));
  padding: 6px 12px;
  font-family: var(--ds-font-family-code, ui-monospace, Consolas, monospace);
  font-size: 10px; line-height: 1.6; color: var(--dsw-alias-label-tertiary, #81858c);
  white-space: pre-wrap; word-break: break-all;
}
.dshhos-log-empty { color: var(--dsw-alias-label-caption, #adb2ba); }
.dshhos-control-keys { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; padding: 10px 12px; border-top: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.04)); flex: none; }
.dshhos-key { height: 34px; border-radius: 8px; cursor: pointer; border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1)); background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #0f1115); font-size: 12px; font-weight: 500; transition: background .12s ease; }
.dshhos-key:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(38,49,72,.06)); }
.dshhos-key:disabled { opacity: .5; cursor: default; }
.dshhos-key-log { color: var(--dsw-alias-state-business-primary, #4176e6); }
/* 投屏时聊天区让位 */
[class$="centerCol"] { margin-right: var(--dshhos-panel-w, 0px); transition: margin-right .2s ease; }
`

const SOURCE_LABEL = { config: '已配置', JAVA_HOME: '来自 JAVA_HOME', DEVECO_SDK_HOME: '来自 DEVECO_SDK_HOME', candidate: '自动检测' }

function rpc(method, args) {
  return fetch('/dsh-hos-scrcpy/rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method: method, args: args || {} }),
  }).then(function (resp) {
    return resp.json()
  }).then(function (res) {
    if (!res || res.ok !== true) throw new Error((res && res.error) || 'RPC failed: ' + method)
    return res.result
  })
}

function insertStyles(css) {
  try {
    const el = document.createElement('style')
    el.setAttribute('data-plugin', 'dsh-hos-scrcpy')
    el.textContent = css
    document.head.appendChild(el)
  } catch (e) {}
}


// base64 → Uint8Array（浏览器全局，无需 atob）
function base64ToBytes(b64) {
  const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const lookup = {}
  for (let i = 0; i < CH.length; i++) lookup[CH[i]] = i
  const clean = String(b64).replace(/[^A-Za-z0-9+/]/g, '')
  const bytes = []
  let i = 0
  while (i < clean.length) {
    const e1 = lookup[clean[i++]]
    const e2 = lookup[clean[i++]]
    const e3 = clean[i] !== undefined && clean[i] !== '=' ? lookup[clean[i++]] : undefined
    const e4 = clean[i] !== undefined && clean[i] !== '=' ? lookup[clean[i++]] : undefined
    bytes.push((e1 << 2) | (e2 >> 4))
    if (e3 !== undefined) bytes.push(((e2 & 15) << 4) | (e3 >> 2))
    if (e4 !== undefined) bytes.push(((e3 & 3) << 6) | e4)
  }
  return new Uint8Array(bytes)
}

function apply(ctx) {
    insertStyles(CSS)
    const slots = ctx.get('slots')
    if (slots === undefined) return
    const conversationService = ctx.get('conversation')

    function ControlPanel(props) {
      const { sn, port, onClose, shotEnabled, onToggleShot, onAddShotToChat } = props
      const videoRef = React.useRef(null)
      const headRef = React.useRef(null)
      const statusRef = React.useRef(null)
      const keysRef = React.useRef(null)
      const logRef = React.useRef(null)
      const [status, setStatus] = React.useState('connecting')
      const [statusText, setStatusText] = React.useState('连接中……（请持续滑动手机更新画面）')
      const [frames, setFrames] = React.useState(0)
      const [bytes, setBytes] = React.useState(0)
      const [error, setError] = React.useState('')
      const [diag, setDiag] = React.useState([])
      const [logOpen, setLogOpen] = React.useState(false)
      const [logLines, setLogLines] = React.useState([])
      const [panelW, setPanelW] = React.useState(360)
      const wsRef = React.useRef(null)
      const jmuxerRef = React.useRef(null)
      const deviceSizeRef = React.useRef(null)
      const lastFrameRef = React.useRef(0)
      const draggingRef = React.useRef(false)
      const logOpenRef = React.useRef(false)

      function logDiag(msg) {
        setDiag(function (prev) { const n = prev.concat(String(msg)); return n.slice(-15) })
      }

      function computeWidth() {
        const d = deviceSizeRef.current
        const vw = (typeof window !== 'undefined' && window.innerWidth) || 1280
        const vh = (typeof window !== 'undefined' && window.innerHeight) || 800
        const headH = headRef.current ? headRef.current.offsetHeight : 34
        const statusH = statusRef.current ? statusRef.current.offsetHeight : 30
        const keysH = keysRef.current ? keysRef.current.offsetHeight : 54
        const screenH = vh - headH - statusH - keysH
        if (!d || screenH <= 100) return Math.min(360, Math.max(260, Math.round(vw * 0.3)))
        const aspect = d.w / d.h
        let w = Math.round(screenH * aspect)
        w = Math.max(260, Math.min(w, 640))
        w = Math.min(w, Math.round(vw * 0.55))
        return w
      }

      function applyWidth() {
        const w = computeWidth()
        setPanelW(w)
        try { document.documentElement.style.setProperty('--dshhos-panel-w', w + 'px') } catch (e) {}
      }

      function toggleLog() {
        const next = !logOpen
        setLogOpen(next)
        logOpenRef.current = next
        if (next) sendCmd({ type: 'log', on: true })
        else sendCmd({ type: 'log', on: false })
      }

      React.useEffect(function () {
        let disposed = false
        let timerDispose = null
        function onResize() { applyWidth() }
        applyWidth()
        try { window.addEventListener('resize', onResize) } catch (e) {}
        async function init() {
          try {
            logDiag('init: 加载 jmuxer…')
            let JMuxerCtor = (typeof JMuxer !== 'undefined') ? JMuxer : (window && window.JMuxer)
            if (!JMuxerCtor) {
              const src = await rpc('jmuxer:source', {})
              if (src && src.ok && src.source) {
                try { (0, eval)(src.source) } catch (evErr) { logDiag('eval 失败: ' + String((evErr && evErr.message) || evErr)) }
                JMuxerCtor = (typeof JMuxer !== 'undefined') ? JMuxer : (window && window.JMuxer)
              }
            }
            if (!JMuxerCtor) throw new Error('JMuxer 加载失败')
            if (disposed) return
            const jmuxer = new JMuxerCtor({ node: videoRef.current, mode: 'video', flushingTime: 0, fps: 60, onError: function () { try { jmuxer.reset() } catch (e) {} } })
            jmuxerRef.current = jmuxer
            const ws = new WebSocket('ws://127.0.0.1:' + port + '/')
            ws.binaryType = 'arraybuffer'
            wsRef.current = ws
            ws.onopen = function () {
              if (disposed) return
              logDiag('WS onopen')
              ws.send(JSON.stringify({ type: 'size' }))
              ws.send(JSON.stringify({ type: 'screen', mode: 'video' }))
            }
            ws.onmessage = function (ev) {
              if (disposed) return
              if (typeof ev.data === 'string') {
                try {
                  const o = JSON.parse(ev.data)
                  if (o.msg === 'size' && o.data) {
                    const parts = String(o.data).split('x')
                    if (parts.length === 2) {
                      deviceSizeRef.current = { w: parseInt(parts[0]), h: parseInt(parts[1]) }
                      applyWidth()
                    }
                  } else if (o.msg === 'log' && o.data) {
                    setLogLines(function (prev) { const n = prev.concat(String(o.data)); return n.slice(-500) })
                  } else {
                    logDiag('WS text: ' + ev.data)
                  }
                } catch (e) { logDiag('WS text: ' + ev.data) }
              } else if (ev.data instanceof ArrayBuffer) {
                lastFrameRef.current = Date.now()
                setFrames(function (f) { return f + 1 })
                setBytes(function (b) { return b + ev.data.byteLength })
                if (status !== 'playing') setStatus('playing')
                try { jmuxer.feed({ video: new Uint8Array(ev.data) }) } catch (e) { logDiag('jmuxer.feed 错误: ' + String((e && e.message) || e)) }
              }
            }
            ws.onclose = function (e) { if (!disposed) { logDiag('WS onclose code=' + e.code); setStatus('closed'); setStatusText('连接已断开') } }
            ws.onerror = function () { if (!disposed) { logDiag('WS onerror'); setStatus('error'); setStatusText('WebSocket 错误') } }
            const iv = window.setInterval(function () {
              if (disposed) return
              const now = Date.now()
              if (lastFrameRef.current === 0) {
                setStatusText('连接中……（请持续滑动手机更新画面）')
              } else {
                const idle = Math.round((now - lastFrameRef.current) / 1000)
                if (idle >= 5) setStatusText('画面静止 ' + idle + ' 秒 · 请操作手机更新画面')
                else setStatusText('')
              }
            }, 2000)
            timerDispose = function () { try { window.clearInterval(iv) } catch (e) {} }
            logDiag('init 完成')
          } catch (e) {
            logDiag('init 异常: ' + String((e && e.message) || e))
            setError(String((e && e.message) || e))
            setStatus('error')
            setStatusText('初始化失败')
          }
        }
        init()
        return function () {
          disposed = true
          try { window.removeEventListener('resize', onResize) } catch (e) {}
          try { document.documentElement.style.setProperty('--dshhos-panel-w', '0px') } catch (e) {}
          if (timerDispose) { try { timerDispose() } catch (e) {} }
          try { if (wsRef.current) wsRef.current.close() } catch (e) {}
          try { if (jmuxerRef.current) jmuxerRef.current.reset() } catch (e) {}
        }
      }, [port])

      function sendCmd(obj) {
        const ws = wsRef.current
        if (!ws || ws.readyState !== 1) return
        try { ws.send(JSON.stringify(obj)) } catch (e) {}
      }

      function sendTouch(event, clientX, clientY) {
        const video = videoRef.current
        const ws = wsRef.current
        if (!video || !ws || ws.readyState !== 1) return
        const r = video.getBoundingClientRect()
        const sx = clientX - r.left, sy = clientY - r.top
        const vw = video.videoWidth || 1, vh = video.videoHeight || 1
        const scale = Math.min(r.width / vw, r.height / vh)
        const drawW = vw * scale, drawH = vh * scale
        const offX = (r.width - drawW) / 2, offY = (r.height - drawH) / 2
        const d = deviceSizeRef.current || { w: vw, h: vh }
        let px = Math.floor((sx - offX) * d.w / drawW)
        let py = Math.floor((sy - offY) * d.h / drawH)
        px = Math.max(0, Math.min(d.w - 1, px))
        py = Math.max(0, Math.min(d.h - 1, py))
        sendCmd({ type: 'touch', event: event, x: px, y: py })
      }

      function keyPress(name) { sendCmd({ type: 'key', name: name }) }

      function disconnect() {
        try { if (wsRef.current) wsRef.current.close() } catch (e) {}
        rpc('device:disconnect', {}).catch(function () {})
        onClose()
      }

      const statusCls = status === 'playing' ? 'ok' : (status === 'closed' || status === 'error' ? 'bad' : 'warn')
      const statusLine = statusText || ('已连接 · ' + frames + ' 帧 / ' + (bytes / 1048576).toFixed(1) + ' MB')
      const logContent = logLines.length > 0 ? logLines.join('\n') : (diag.length > 0 ? diag.join('\n') : '（日志流未开启，点击「日志▸」开始）')

      return React.createElement('div', { className: 'dshhos-control', style: { width: panelW + 'px' } },
        React.createElement('div', { className: 'dshhos-control-head', ref: headRef },
          React.createElement('span', { className: 'dshhos-csn', title: sn }, sn),
          React.createElement('button', { className: 'dshhos-btn-sm dshhos-shot-btn', title: '截取当前屏幕并像粘贴图片一样添加到聊天输入框', onClick: function () { if (onAddShotToChat) onAddShotToChat(sn) } }, '添加截图至聊天框'),
          React.createElement('span', { className: 'dshhos-shot-toggle', title: '开启后 AI 才能截取该设备屏幕并识别' },
            React.createElement('button', {
              className: 'dshhos-switch' + (shotEnabled ? ' on' : ''),
              role: 'switch', 'aria-checked': !!shotEnabled,
              onClick: function (e) { e.stopPropagation(); if (onToggleShot) onToggleShot(!shotEnabled) },
            }),
            React.createElement('span', null, '允许截图'),
          ),
          React.createElement('button', { className: 'dshhos-btn-sm', onClick: disconnect }, '断开'),
        ),
        React.createElement('div', { className: 'dshhos-control-status ' + statusCls, ref: statusRef }, error ? ('错误: ' + error) : statusLine),
        React.createElement('div', { className: 'dshhos-screen' },
          React.createElement('video', {
            ref: videoRef,
            autoPlay: true, muted: true, playsInline: true,
            onMouseDown: function (e) { draggingRef.current = true; sendTouch('down', e.clientX, e.clientY) },
            onMouseMove: function (e) { if (draggingRef.current) sendTouch('move', e.clientX, e.clientY) },
            onMouseUp: function (e) { draggingRef.current = false; sendTouch('up', e.clientX, e.clientY) },
            onMouseLeave: function (e) { if (draggingRef.current) { draggingRef.current = false; sendTouch('up', e.clientX, e.clientY) } },
          }),
        ),
        logOpen ? React.createElement('div', { className: 'dshhos-log', ref: logRef }, logContent) : null,
        React.createElement('div', { className: 'dshhos-control-keys', ref: keysRef },
          React.createElement('button', { className: 'dshhos-key dshhos-key-log', onClick: toggleLog }, logOpen ? '日志▾' : '日志▸'),
          React.createElement('button', { className: 'dshhos-key', onClick: function () { keyPress('back') }, disabled: status === 'connecting' }, '返回'),
          React.createElement('button', { className: 'dshhos-key', onClick: function () { keyPress('home') }, disabled: status === 'connecting' }, '主页'),
          React.createElement('button', { className: 'dshhos-key', onClick: function () { keyPress('volumeUp') }, disabled: status === 'connecting' }, '音量+'),
          React.createElement('button', { className: 'dshhos-key', onClick: function () { keyPress('volumeDown') }, disabled: status === 'connecting' }, '音量-'),
        ),
      )
    }

    function DevicePanel(props) {
      const [open, setOpen] = React.useState(false)
      const [settingsOpen, setSettingsOpen] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [env, setEnv] = React.useState(null)
      const [sources, setSources] = React.useState({ java: '', hdc: '' })
      const [devices, setDevices] = React.useState([])
      const [draft, setDraft] = React.useState({ javaPath: '', hdcPath: '' })
      const [saving, setSaving] = React.useState(false)
      const [notice, setNotice] = React.useState('')
      const [connectingSn, setConnectingSn] = React.useState('')
      const [control, setControl] = React.useState(null)
      const [shotEnabled, setShotEnabled] = React.useState({})

      const loadAll = React.useCallback(async function () {
        setBusy(true)
        setError('')
        try {
          const e = await rpc('env:detect', {})
          setEnv({ java: e.java, hdc: e.hdc })
          setSources({ java: e.javaSource || '', hdc: e.hdcSource || '' })
          setDraft({ javaPath: e.javaPath || '', hdcPath: e.hdcPath || '' })
          const d = await rpc('devices:list', {})
          if (d && d.ok) { setDevices(d.devices || []) } else { setDevices([]); if (d && d.error) setError(d.error) }
          const s = await rpc('shot:enabled', {})
          if (s && s.enabled) setShotEnabled(s.enabled)
        } catch (err) { setError('获取设备信息失败: ' + String((err && err.message) || err)) }
        setBusy(false)
      }, [])

      React.useEffect(function () { if (open) loadAll() }, [open])

      async function connectDevice(sn) {
        setConnectingSn(sn)
        setError('')
        try {
          const r = await rpc('device:connect', { sn: sn })
          if (r && r.ok && r.port) {
            setOpen(false)
            setControl({ sn: sn, port: r.port })
          } else {
            setError('连接失败: ' + ((r && r.error) || '未知错误'))
          }
        } catch (err) { setError('连接失败: ' + String((err && err.message) || err)) }
        setConnectingSn('')
      }

      async function toggleShot(sn, next) {
        setError('')
        setNotice('')
        try {
          const r = await rpc('shot:set-enabled', { sn: sn, enabled: next })
          if (r && r.ok) {
            setShotEnabled(function (prev) {
              const n = Object.assign({}, prev)
              if (next) n[sn] = true
              else delete n[sn]
              return n
            })
            setNotice(next
              ? ('已开启 ' + sn + ' 的截图权限，AI 现在拥有 hos_scrcpy_screenshot 工具')
              : ('已关闭 ' + sn + ' 的截图权限'))
          } else {
            setError('切换失败: ' + ((r && r.error) || '未知错误'))
          }
        } catch (err) { setError('切换失败: ' + String((err && err.message) || err)) }
      }

      // 截图并像粘贴图片一样添加到聊天输入框
      async function handleAddShotToChat(sn) {
        setError('')
        setNotice('')
        try {
          const inputActions = props && props.inputActions
          if (!inputActions || !inputActions.addImages) { setError('聊天输入框不可用'); return }
          if (!conversationService) { setError('会话服务不可用'); return }
          const r = await rpc('shot:capture', { sn: sn })
          if (!r || !r.ok || !r.base64) { setError('截图失败: ' + ((r && r.error) || '未知错误')); return }
          const mediaType = r.mediaType || 'image/jpeg'
          const ext = mediaType === 'image/png' ? 'png' : 'jpeg'
          const file = new File([base64ToBytes(r.base64)], 'dsh-scrcpy-shot.' + ext, { type: mediaType })
          const images = conversationService.createDraftImages([file])
          if (!images || !images.length) { setError('添加图片失败'); return }
          if (!inputActions.addImages(images.map(function (img) { return img.id }))) {
            try { conversationService.releaseDraftImages(images) } catch (e) {}
            setError('输入框忙，未能添加图片')
            return
          }
          setNotice('已添加截图到聊天框（可继续输入文字后发送）')
        } catch (err) { setError('添加截图失败: ' + String((err && err.message) || err)) }
      }

      async function saveConfig() {
        setSaving(true)
        setNotice('')
        try {
          const r = await rpc('cfg:save', { javaPath: draft.javaPath, hdcPath: draft.hdcPath })
          if (r && r.ok) { setSettingsOpen(false); setNotice('配置已保存'); await loadAll() }
          else setError('保存失败: ' + ((r && r.error) || '未知错误'))
        } catch (err) { setError('保存失败: ' + String((err && err.message) || err)) }
        setSaving(false)
      }

      async function autoDetect() {
        setSaving(true)
        try {
          const e = await rpc('env:detect', {})
          setDraft({ javaPath: e.javaPath || '', hdcPath: e.hdcPath || '' })
          setEnv({ java: e.java, hdc: e.hdc })
          setSources({ java: e.javaSource || '', hdc: e.hdcSource || '' })
          setNotice('已自动检测（未保存）')
        } catch (err) { setError('检测失败: ' + String((err && err.message) || err)) }
        setSaving(false)
      }

      function envRow(kind, label, path, source) {
        const e = env && env[kind]
        const ok = e && e.ok
        const dotCls = 'dshhos-dot ' + (e ? (ok ? 'ok' : 'bad') : 'warn')
        const version = e ? (ok ? (e.version || '') : (e.error || '运行失败')) : '检测中…'
        const src = SOURCE_LABEL[source] || ''
        const detail = version + (src && version ? ' · ' + src : src)
        return React.createElement('div', { className: 'dshhos-env-row' },
          React.createElement('span', { className: dotCls }),
          React.createElement('b', null, label),
          React.createElement('span', { className: 'dshhos-path', title: path || '' }, path || '未配置'),
          React.createElement('span', { className: 'dshhos-hint' }, detail),
        )
      }

      const icon = React.createElement('svg', { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: '1.4', strokeLinecap: 'round', strokeLinejoin: 'round', style: { width: 13, height: 13 } },
        React.createElement('rect', { x: '2', y: '3', width: '12', height: '10', rx: '2' }),
        React.createElement('path', { d: 'M2 7h12' }),
      )

      return React.createElement('div', { className: 'dshhos-trigger' },
        React.createElement('button', { className: 'dshhos-btn', title: '设备列表', onClick: function () { setOpen(true); setNotice('') } },
          icon, React.createElement('span', null, '设备列表')),
        control ? React.createElement(ControlPanel, {
          sn: control.sn, port: control.port,
          onClose: function () { setControl(null) },
          shotEnabled: !!shotEnabled[control.sn],
          onToggleShot: function (next) { toggleShot(control.sn, next) },
          onAddShotToChat: handleAddShotToChat,
        }) : null,
        open ? React.createElement('div', { className: 'dshhos-mask', onMouseDown: function () { setOpen(false) } }) : null,
        open ? React.createElement('div', { className: 'dshhos-panel', onMouseDown: function (e) { e.stopPropagation() } },
          React.createElement('div', { className: 'dshhos-panel-head' },
            React.createElement('span', null, '设备列表'),
            React.createElement('button', { className: 'dshhos-btn-sm', onClick: function () { loadAll() }, disabled: busy }, busy ? React.createElement('span', { className: 'dshhos-spin' }) : null, busy ? '刷新中' : '刷新'),
          ),
          React.createElement('div', { className: 'dshhos-panel-sec' },
            React.createElement('div', { className: 'dshhos-sec-title' },
              React.createElement('span', null, '鸿蒙设备'),
              React.createElement('span', { className: 'dshhos-env-badge ' + (env && env.java && env.java.ok && env.hdc && env.hdc.ok ? 'ok' : 'bad') },
                env && env.java && env.java.ok && env.hdc && env.hdc.ok ? '环境就绪' : '待配置'),
            ),
            envRow('java', 'Java', draft.javaPath, sources.java),
            envRow('hdc', 'hdc', draft.hdcPath, sources.hdc),
            React.createElement('div', { style: { marginTop: '8px' } },
              busy ? React.createElement('div', { className: 'dshhos-empty' }, '正在检测设备…')
                : devices.length > 0
                  ? React.createElement('div', { className: 'dshhos-list' },
                      devices.map(function (dev) {
                        return React.createElement('div', { className: 'dshhos-item', key: dev.sn },
                          React.createElement('span', { className: 'dshhos-dot ok' }),
                          React.createElement('span', { className: 'dshhos-item-sn', title: dev.sn }, dev.sn),
                          connectingSn === dev.sn
                            ? React.createElement('span', { className: 'dshhos-connecting' }, '连接中…')
                            : React.createElement('button', { className: 'dshhos-connect', disabled: !!connectingSn, onClick: function () { connectDevice(dev.sn) } }, '投屏'),
                        )
                      }),
                    )
                  : React.createElement('div', { className: 'dshhos-empty' },
                      error || (env && env.hdc && env.hdc.ok ? '未检测到设备\n请确认手机已开启 USB 调试并连接' : '配置 java/hdc 路径后即可发现设备'),
                    ),
            ),
            React.createElement('div', { className: 'dshhos-hint', style: { marginTop: '6px' } },
              '开启「允许截图」后，AI 将获得 hos_scrcpy_screenshot 工具（deepseek-v4-flash-vision-exp 识别，每次截图前二次确认）',
            ),
          ),
          error ? React.createElement('div', { className: 'dshhos-panel-sec' }, React.createElement('div', { className: 'dshhos-hint', style: { color: 'var(--dsw-alias-state-error-primary, #ec1313)' } }, error)) : null,
          notice ? React.createElement('div', { className: 'dshhos-panel-sec' }, React.createElement('div', { className: 'dshhos-notice' }, notice)) : null,
          React.createElement('div', { className: 'dshhos-panel-foot' },
            React.createElement('button', { className: 'dshhos-btn-sm', onClick: function () { setSettingsOpen(true) } }, '设置'),
          ),
        ) : null,
        settingsOpen ? React.createElement('div', { className: 'dshhos-dialog-mask', onMouseDown: function () { setSettingsOpen(false) } },
          React.createElement('div', { className: 'dshhos-dialog', onMouseDown: function (e) { e.stopPropagation() } },
            React.createElement('div', { className: 'dshhos-dialog-head' },
              React.createElement('span', null, '设备连接设置'),
              React.createElement('button', { className: 'dshhos-close', onClick: function () { setSettingsOpen(false) } }, '✕'),
            ),
            React.createElement('div', { className: 'dshhos-dialog-body' },
              React.createElement('div', { className: 'dshhos-field' },
                React.createElement('label', null, 'Java 路径（java.exe）'),
                React.createElement('input', { value: draft.javaPath, placeholder: '例如 %JAVA_HOME%\\bin\\java.exe 或完整路径', onChange: function (e) { setDraft(Object.assign({}, draft, { javaPath: e.target.value })) } }),
              ),
              React.createElement('div', { className: 'dshhos-field' },
                React.createElement('label', null, 'hdc 路径（hdc.exe）'),
                React.createElement('input', { value: draft.hdcPath, placeholder: '例如 %DEVECO_SDK_HOME%\\default\\openharmony\\toolchains\\hdc.exe 或完整路径', onChange: function (e) { setDraft(Object.assign({}, draft, { hdcPath: e.target.value })) } }),
              ),
              env ? React.createElement('div', { className: 'dshhos-env-row' },
                React.createElement('span', { className: 'dshhos-dot ' + (env.java.ok ? 'ok' : 'bad') }),
                React.createElement('span', null, 'Java ' + (env.java.ok ? env.java.version : env.java.error)),
              ) : null,
              env ? React.createElement('div', { className: 'dshhos-env-row' },
                React.createElement('span', { className: 'dshhos-dot ' + (env.hdc.ok ? 'ok' : 'bad') }),
                React.createElement('span', null, 'hdc ' + (env.hdc.ok ? env.hdc.version : env.hdc.error)),
              ) : null,
            ),
            React.createElement('div', { className: 'dshhos-dialog-foot' },
              React.createElement('button', { className: 'dshhos-btn-sm', onClick: autoDetect, disabled: saving }, '自动检测'),
              React.createElement('button', { className: 'dshhos-btn-sm', onClick: function () { setSettingsOpen(false) }, disabled: saving }, '取消'),
              React.createElement('button', { className: 'dshhos-btn-sm dshhos-btn-primary', onClick: saveConfig, disabled: saving }, saving ? '保存中…' : '保存'),
            ),
          ),
        ) : null,
      )
    }

    slots.inject('conversation.session.header.utilities', function () {
      return slots.register(
        { name: 'conversation.session.header.utilities', id: 'dsh-hos-scrcpy-devices', order: 10, label: '设备列表' },
        function (props) { return React.createElement(DevicePanel, props) },
      )
    })
    }
    exports.inject = ['slots']
    exports.apply = apply
    return module.exports
  },
})
