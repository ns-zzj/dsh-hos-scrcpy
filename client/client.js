// ============================================================
// dsh-hos-scrcpy - Client half (static npm package browser bundle)
// 本文件由 Dev/gen-static-client.mjs 从 PluginMain-Dynamic/client.js 生成，请勿手改：
//   host.call -> rpc() (same-origin fetch POST /dsh-hos-scrcpy/rpc)
//   styles.insert -> insertStyles()
//   ctx.timer.interval -> interval()
//   ctx.timer.timeout -> timeout()
//   inject: ['timer'] -> exports.inject = ['slots', 'sidebarRightTabs', 'sidebarRight']
// Format follows the window.__ModuleLoader__.load convention.
// ============================================================

window.__ModuleLoader__.load({
  id: "dsh-hos-scrcpy",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    let React = require('react')
// ============================================================
// dsh-hos-scrcpy — 插件 Client 半区源码（浏览器 React）
//
// 重新加载方法：在 DSH 会话中用 cordis_define 创建动态插件，
// code.client 填入本文件全部内容（函数体），code.host 填入
// PluginMain/host.js 的内容，然后 cordis_run 激活。
// ============================================================

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
/* 灰点 = 该设备未在投屏（绿点 ok 表示 sidecar 在跑） */
.dshhos-dot.idle { background: var(--dsw-alias-label-caption, #adb2ba); opacity: .55; }
/* 行内多按钮（投屏 + 断开） */
.dshhos-item-actions { margin-left: auto; display: inline-flex; align-items: center; gap: 10px; flex: none; }
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
.dshhos-select {
  height: 30px; padding: 0 6px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1));
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 12px; font-family: inherit; outline: none; flex: none;
}
.dshhos-select:disabled { opacity: .45; cursor: not-allowed; }
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
/* ---- 设置弹层：开关行 ---- */
.dshhos-setting-row { display: flex; align-items: center; gap: 12px; padding: 6px 0; }
.dshhos-setting-info { flex: 1; min-width: 0; }
.dshhos-setting-label { font-size: 13px; font-weight: 500; line-height: 20px; color: var(--dsw-alias-label-primary, #0f1115); }
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
/* 内嵌到右侧栏标签页时：由标签页报告的位置贴上去（left/top/width/height 走内联样式）
   contain 让这个大图层的布局/绘制跟外面隔离，侧栏挤压动画时不会互相拖累 */
.dshhos-control-overlay { position: fixed; border-left: 0; transition: none; contain: layout paint; }
/* 标签页不在最前 / 侧栏收起时：留在 DOM 里继续收流解码，只是不显示（切回来即时有画面） */
.dshhos-control-hidden { display: none; }
/* 标签页里还没连接设备时的占位 */
.dshhos-tab-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; height: 100%; padding: 24px; box-sizing: border-box; text-align: center; }
.dshhos-control-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.04)); flex: none; }
.dshhos-control-head .dshhos-csn { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--ds-font-family-code, ui-monospace, Consolas, monospace); font-size: 11px; color: var(--dsw-alias-label-secondary, #61666b); }
.dshhos-control-head .dshhos-btn-sm { flex: none; white-space: nowrap; }
/* 画质标记：有线/无线 + 视频流缩小倍率 */
.dshhos-quality { flex: none; font-size: 10px; line-height: 16px; padding: 0 6px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1)); color: var(--dsw-alias-label-tertiary, #81858c); white-space: nowrap; }
.dshhos-shot-btn { font-size: 11px; padding: 0 8px; height: 24px; }
.dshhos-control-status { padding: 6px 12px; font-size: 12px; line-height: 18px; flex: none; }
.dshhos-control-status.ok { color: var(--dsw-alias-state-success-primary, #22c55e); }
.dshhos-control-status.warn { color: var(--dsw-alias-state-warn-primary, #f59e0b); }
.dshhos-control-status.bad { color: var(--dsw-alias-state-error-primary, #ec1313); }
.dshhos-status-bar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; flex: none; }
.dshhos-status-bar .dshhos-control-status { padding: 0; flex: 1; min-width: 0; }
.dshhos-input-wrap { position: relative; flex: none; }
.dshhos-input-btn { font-size: 11px; padding: 0 8px; height: 24px; }
.dshhos-input-pop {
  position: absolute; top: calc(100% + 6px); right: 6px; z-index: 9996;
  display: flex; align-items: center; gap: 6px;
  padding: 8px; border-radius: 10px; width: 240px; box-sizing: border-box;
  background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-3, #fff));
  border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1));
  box-shadow: var(--dsw-shadow-lv3, 0 12px 32px rgba(0,0,0,.08));
}
.dshhos-input-field {
  flex: 1; min-width: 0; height: 28px; padding: 0 8px; border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1));
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary, #0f1115);
  font-size: 12px; font-family: inherit; outline: none;
}
.dshhos-input-field:focus { border-color: var(--dsw-alias-state-business-primary, #4176e6); }
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
/* AI 点击落点预览（二次确认期间闪烁绿点，半透明不遮挡画面，不拦截鼠标） */
.dshhos-tapdot {
  position: absolute; width: 28px; height: 28px; border-radius: 50%;
  background: rgba(34,197,94,.25); border: 3px solid rgba(34,197,94,.7);
  box-shadow: 0 0 14px rgba(34,197,94,.55);
  transform: translate(-50%, -50%);
  pointer-events: none; z-index: 9999;
  animation: dshhos-blink .8s ease-in-out infinite;
}
@keyframes dshhos-blink { 0%, 100% { opacity: .9; } 50% { opacity: .25; } }
/* 长按落点预览：慢速闪烁（与单击的快速闪烁区分） */
.dshhos-tapdot.slow { animation-duration: 1.8s; }
`

const SOURCE_LABEL = { config: '已配置', JAVA_HOME: '来自 JAVA_HOME', DEVECO_SDK_HOME: '来自 DEVECO_SDK_HOME', candidate: '自动检测' }

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

// ctx.timer.interval / ctx.timer.timeout 的等价物：返回取消函数，调用处不用改
function interval(fn, ms) {
  const id = window.setInterval(fn, ms)
  return function () { try { window.clearInterval(id) } catch (e) {} }
}

function timeout(fn, ms) {
  const id = window.setTimeout(fn, ms)
  return function () { try { window.clearTimeout(id) } catch (e) {} }
}

function apply(ctx) {
    insertStyles(CSS)
    // 「开始」页接管所需的样式（照官方 GuideBody 的声明，换成我们自己的类名，不依赖其构建哈希）
    const GUIDE_CSS = `
.dshhos-guide{box-sizing:border-box;flex-direction:column;justify-content:center;align-items:center;gap:14px;min-height:100%;padding:0 24px;display:flex}
.dshhos-guide:after{content:"";flex:0 10%}
.dshhos-guide-hero{color:var(--dsw-static-neutral-200,#c7c7cc);margin-bottom:16px;display:flex}
body[data-ds-dark-theme] .dshhos-guide-hero{color:var(--dsw-static-neutral-700,#3a3a3c)}
.dshhos-guide-entry{box-sizing:border-box;width:380px;max-width:100%;min-height:56px;color:var(--dsw-alias-label-primary,inherit);font:inherit;text-align:left;background:var(--dsw-alias-bg-layer-1,transparent);border:.5px solid var(--dsw-alias-border-l4,rgba(128,128,128,.25));cursor:pointer;border-radius:24px;align-items:center;gap:14px;padding:14px 20px;display:flex}
.dshhos-guide-entry:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
.dshhos-guide-entryIcon{width:26px;height:26px;color:var(--dsw-alias-label-secondary,inherit);flex:none;justify-content:center;align-items:center;display:flex}
.dshhos-guide-placeholderInk{color:var(--dsw-alias-label-tertiary,inherit)}
.dshhos-guide-entryText{flex-direction:column;gap:3px;min-width:0;display:flex}
.dshhos-guide-entryTitle{white-space:nowrap;text-overflow:ellipsis;font-size:15px;line-height:1.4;overflow:hidden}
.dshhos-guide-entryDescription{color:var(--dsw-alias-label-caption,inherit);white-space:nowrap;text-overflow:ellipsis;font-size:13px;line-height:1.4;overflow:hidden}
`
    insertStyles(GUIDE_CSS)
    const slots = ctx.get('slots')
    if (slots === undefined) return
    const conversationService = ctx.get('conversation')

    // 「hos-scrcpy 菜单」（设备列表弹层）的跨组件唤起：header 按钮与「开始」页入口共用同一个弹层
    const menuOpenListeners = new Set()
    function openScrcpyMenu() {
      menuOpenListeners.forEach(function (fn) { try { fn() } catch (e) {} })
    }
    function onScrcpyMenuOpen(fn) {
      menuOpenListeners.add(fn)
      return function () { menuOpenListeners.delete(fn) }
    }

    // ------------------------------------------------------------
    // 共享的投屏会话状态
    // 「hos-scrcpy 菜单」在 header 槽、投屏面板在右侧栏标签页里，是两个独立的组件树，
    // 用模块级 store + 订阅同步「连了哪台设备 / 四个权限模式 / 聊天输入框动作」，
    // 免得把状态靠 props 层层传过去。
    // ------------------------------------------------------------
    const sessionStore = (function () {
      // sessions: { sn -> {sn,port,wireless,scale,frameRate,...} } —— 每台设备一条会话（可多台同时投屏）
      // docks:    { sn -> {left,top,width,height,fullscreen} } —— 各设备标签页上报的矩形，
      //           决定它那块面板贴在哪；没有该 sn 的 dock = 它的标签页不在最前 → 面板隐藏（仍收流）
      let state = { sessions: {}, focusedSn: '', dock: null, docks: {}, shotMode: {}, ctlMode: {}, keyMode: {}, inputMode: {}, inputActions: null }
      const listeners = new Set()
      function get() { return state }
      function set(patch) {
        state = Object.assign({}, state, patch)
        listeners.forEach(function (fn) { try { fn() } catch (e) {} })
      }
      // 改其中一个 map：mutate 拿到的是副本，改完自动提交
      function update(key, mutate) {
        const copy = Object.assign({}, state[key])
        mutate(copy)
        const patch = {}
        patch[key] = copy
        set(patch)
      }
      function subscribe(fn) { listeners.add(fn); return function () { listeners.delete(fn) } }
      // ---- 多设备专用：会话与矩形都按 sn 存 ----
      function setSession(info) {
        const next = Object.assign({}, state.sessions)
        next[info.sn] = info
        set({ sessions: next })
      }
      function removeSession(sn) {
        const next = Object.assign({}, state.sessions)
        delete next[sn]
        const docks = Object.assign({}, state.docks)
        delete docks[sn]
        set({ sessions: next, docks: docks })
      }
      function setDock(sn, rect) {
        const docks = Object.assign({}, state.docks)
        if (rect) docks[sn] = rect
        else delete docks[sn]
        set({ docks: docks })
      }
      return { get: get, set: set, update: update, subscribe: subscribe, setSession: setSession, removeSession: removeSession, setDock: setDock }
    })()

    function useSessionStore() {
      const [state, setState] = React.useState(sessionStore.get())
      React.useEffect(function () {
        return sessionStore.subscribe(function () { setState(sessionStore.get()) })
      }, [])
      return state
    }

    /**
     * 截图并像粘贴图片一样塞进聊天输入框。
     * 抽到 apply 作用域是因为两处都要用：header 菜单里的面板、右侧栏标签页里的面板。
     * @returns {Promise<{ok:boolean, error?:string}>}
     */
    async function addShotToChat(sn, inputActions) {
      if (!inputActions || !inputActions.addImages) return { ok: false, error: '聊天输入框不可用' }
      if (!conversationService) return { ok: false, error: '会话服务不可用' }
      const r = await rpc('shot:capture', { sn: sn })
      if (!r || !r.ok || !r.base64) return { ok: false, error: '截图失败: ' + ((r && r.error) || '未知错误') }
      const mediaType = r.mediaType || 'image/jpeg'
      const ext = mediaType === 'image/png' ? 'png' : 'jpeg'
      const file = new File([base64ToBytes(r.base64)], 'dsh-scrcpy-shot.' + ext, { type: mediaType })
      const images = conversationService.createDraftImages([file])
      if (!images || !images.length) return { ok: false, error: '添加图片失败' }
      if (!inputActions.addImages(images.map(function (img) { return img.id }))) {
        try { conversationService.releaseDraftImages(images) } catch (e) {}
        return { ok: false, error: '输入框忙，未能添加图片' }
      }
      return { ok: true }
    }

    /**
     * 设置四个权限模式之一：RPC + 共享 store。DevicePanel（浮层降级路径）与右侧栏标签页共用。
     * @returns {Promise<{notice?:string, error?:string}>} 由调用方决定把结果播到哪儿
     */
    async function setMode(kind, sn, mode) {
      const MODE_LABEL = { off: '禁止使用', confirm: '需要确认', trust: '无需确认' }
      const conf = {
        shot: { rpc: 'shot:set-mode', key: 'shotMode', label: '截图识别' },
        ctl: { rpc: 'ctl:set-mode', key: 'ctlMode', label: 'AI 控制' },
        key: { rpc: 'key:set-mode', key: 'keyMode', label: '按键操作' },
        input: { rpc: 'input:set-mode', key: 'inputMode', label: '文本输入' },
      }[kind]
      if (!conf) return { error: '未知模式: ' + kind }
      try {
        const r = await rpc(conf.rpc, { sn: sn, mode: mode })
        if (!r || !r.ok) return { error: '设置失败: ' + ((r && r.error) || '未知错误') }
        sessionStore.update(conf.key, function (n) {
          if (mode === 'off') delete n[sn]
          else n[sn] = mode
        })
        if (kind === 'shot' && mode === 'off') {
          // 允许截图禁止 -> 允许控制/允许按键/允许输入 强制禁止（与 Host 逻辑一致）
          sessionStore.update('ctlMode', function (n) { delete n[sn] })
          sessionStore.update('keyMode', function (n) { delete n[sn] })
          sessionStore.update('inputMode', function (n) { delete n[sn] })
        }
        return {
          notice: mode === 'off'
            ? ('已禁止 ' + sn + ' 的' + conf.label)
            : ('已设置 ' + sn + ' ' + conf.label + '为' + (MODE_LABEL[mode] || mode)),
        }
      } catch (err) { return { error: '设置失败: ' + String((err && err.message) || err) } }
    }

    function ControlPanel(props) {
      const { sn, port, onClose, shotMode, ctlMode, keyMode, inputMode, onShotMode, onCtlMode, onKeyMode, onInputMode, onAddShotToChat } = props
      // 画面本体一直挂在 header 组件里（不受标签页卸载影响，切走也继续收流解码），
      // 摆放方式由 placement 决定：
      //   floating — 老式浮层（侧栏服务不可用时的降级），fixed 贴右边缘并给聊天区让位
      //   overlay  — 贴到右侧栏标签页报告的矩形上
      //   hidden   — 标签页不在最前/侧栏收起：留在 DOM 里但 display:none
      const placement = props.placement || 'floating'
      const rect = props.rect || null
      const videoRef = React.useRef(null)
      const screenRef = React.useRef(null)
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
      const [settingsOpen, setSettingsOpen] = React.useState(false)
      const [inputOpen, setInputOpen] = React.useState(false)
      const [inputText, setInputText] = React.useState('')
      const [preview, setPreview] = React.useState(null)
      const [modelInfo, setModelInfo] = React.useState(null)
      const wsRef = React.useRef(null)
      const jmuxerRef = React.useRef(null)
      const deviceSizeRef = React.useRef(null)
      const lastFrameRef = React.useRef(0)
      const draggingRef = React.useRef(false)
      const logOpenRef = React.useRef(false)
      const lastStatusTextRef = React.useRef('') // 状态文案去重：500ms 轮询不要每次都 setState
      // 帧计数用 ref 累加，500ms 才发布进 state（避免每帧 setState 导致的渲染风暴）
      const framesRef = React.useRef(0)
      const bytesRef = React.useRef(0)
      const shownFramesRef = React.useRef(0)
      const shownBytesRef = React.useRef(0)
      const playingRef = React.useRef(false)

      function logDiag(msg) {
        setDiag(function (prev) { const n = prev.concat(String(msg)); return n.slice(-15) })
      }

      // ---- 识别模型（只列支持图片输入的模型） ----
      function loadModelInfo() {
        rpc('model:get', {}).then(function (r) { setModelInfo(r || null) }).catch(function () { setModelInfo(null) })
      }

      function changeModel(id) {
        rpc('model:set', { model: id }).then(function () { loadModelInfo() }).catch(function () {})
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
        if (placement !== 'floating') return // overlay/hidden 模式下宽度由标签页矩形决定，或压根不显示
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
        let gestureDispose = null
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
            // fps 必须跟实际编码帧率一致：写死 60 而实际只有 30/15 时，
            // jmuxer 给每帧算的时长会偏短，媒体时间轴和真实时间对不上（表现为持续微卡）。
            const encFps = (props && props.frameRate) > 0 ? props.frameRate : 60
            const jmuxer = new JMuxerCtor({ node: videoRef.current, mode: 'video', flushingTime: 0, fps: encFps, onError: function () { try { jmuxer.reset() } catch (e) {} } })
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
                // 帧计数只改 ref，不 setState：以前每帧两次 setState，60fps 就是每秒 120 次渲染，
                // React 每秒重建上百棵 fiber 树 → JS 堆疯涨、GC 追不上。现在由 500ms 的 tick 统一发布。
                framesRef.current += 1
                bytesRef.current += ev.data.byteLength
                if (!playingRef.current) { playingRef.current = true; setStatus('playing') }
                try { jmuxer.feed({ video: new Uint8Array(ev.data) }) } catch (e) { logDiag('jmuxer.feed 错误: ' + String((e && e.message) || e)) }
              }
            }
            ws.onclose = function (e) { if (!disposed) { playingRef.current = false; logDiag('WS onclose code=' + e.code); setStatus('closed'); setStatusText('连接已断开') } }
            ws.onerror = function () { if (!disposed) { playingRef.current = false; logDiag('WS onerror'); setStatus('error'); setStatusText('WebSocket 错误') } }
            // 500ms 一跳：以前是 2000ms，所以"画面静止 N 秒"会 2 秒 2 秒地跳（老 bug）
            timerDispose = interval(function () {
              if (disposed) return
              let next = ''
              if (lastFrameRef.current === 0) {
                next = '连接中……（请持续滑动手机更新画面）'
              } else {
                const idle = Math.round((Date.now() - lastFrameRef.current) / 1000)
                if (idle >= 5) next = '画面静止 ' + idle + ' 秒 · 请操作手机更新画面'
              }
              if (lastStatusTextRef.current !== next) {
                lastStatusTextRef.current = next
                setStatusText(next)
              }
              // 帧/字节计数每 500ms 发布一次（见帧回调里的说明）
              if (framesRef.current !== shownFramesRef.current) { shownFramesRef.current = framesRef.current; setFrames(framesRef.current) }
              if (bytesRef.current !== shownBytesRef.current) { shownBytesRef.current = bytesRef.current; setBytes(bytesRef.current) }
              // MSE 缓冲护栏：直播流如果缓冲越攒越多，内存会被吃爆；超过阈值就把播放位置拉到直播边缘
              try {
                const v = videoRef.current
                if (v && v.buffered && v.buffered.length > 0) {
                  const end = v.buffered.end(v.buffered.length - 1)
                  const lag = end - v.currentTime
                  if (lag > 2.5) {
                    v.currentTime = Math.max(0, end - 0.15)
                    logDiag('MSE 缓冲深度 ' + lag.toFixed(1) + 's，已跳到直播边缘')
                  }
                }
              } catch (e) {}
            }, 500)
            // 轮询 Host 待执行手势（AI 控制），经本 WebSocket 发送
            gestureDispose = interval(function () {
              if (disposed) return
              // 落点预览：二次确认期间显示闪烁绿点（仅当前投屏设备的）
              rpc('ctl:preview', {}).then(function (r) {
                if (disposed) return
                const p = (r && r.preview) || null
                setPreview(p && p.sn === sn ? p : null)
              }).catch(function () {})
              rpc('ctl:dequeue', {}).then(function (r) {
                if (disposed) return
                if (r && r.ok && r.gesture) sendGesture(r.gesture)
              }).catch(function () {})
            }, 700)
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
          if (gestureDispose) { try { gestureDispose() } catch (e) {} }
          try { if (wsRef.current) wsRef.current.close() } catch (e) {}
          try { if (jmuxerRef.current) jmuxerRef.current.reset() } catch (e) {}
        }
      }, [port])

      function sendCmd(obj) {
        const ws = wsRef.current
        if (!ws || ws.readyState !== 1) return
        try { ws.send(JSON.stringify(obj)) } catch (e) {}
      }

      // 面板不可见 → 暂停"广播"（抓屏会话留着）；重新可见 → 请求关键帧 + 恢复广播。
      // 实测 requestIDRFrame() 后约 117ms 就来 SPS/PPS+IDR，所以不用重开会话、也不用动手机。
      // setBroadcast(true) 在本来就是广播状态时是空操作，所以首连时发它无害。
      React.useEffect(function () {
        if (placement === 'hidden') sendCmd({ type: 'screen', mode: 'pause' })
        else if (placement === 'overlay') sendCmd({ type: 'screen', mode: 'resume' })
        // 多设备：把"当前聚焦（面板可见）的设备"告诉 host——AI 工具只作用于它；
        // 没有聚焦设备时 host 会明确回"没有聚焦的投屏设备"，不会猜。
        rpc('device:focus', placement === 'hidden' ? {} : { sn: sn }).catch(function () {})
        // 老浮层模式留下的 --dshhos-panel-w 会给聊天列挂上 0.2s 的 margin 过渡，
        // 侧栏一开一合就跟着动（也是卡的一个来源）→ 非浮层模式一律清零
        if (placement !== 'floating') {
          try { document.documentElement.style.setProperty('--dshhos-panel-w', '0px') } catch (e) {}
        }
      }, [placement])

      // 执行一个 AI 手势（比例坐标 -> 运行时设备像素 -> 现有 WS）
      function sendGesture(g) {
        if (!g) return
        // 手势归属设备必须与当前投屏面板一致，防止点错屏幕
        if (g.sn && g.sn !== sn) { logDiag('跳过手势：目标设备 ' + g.sn + ' ≠ 当前投屏 ' + sn); return }
        const d = deviceSizeRef.current
        if (!d) { logDiag('AI 手势未执行：缺少设备分辨率'); return }
        if (g.kind === 'tap') {
          const x = Math.max(0, Math.min(d.w - 1, Math.round(Number(g.fx) * (d.w - 1))))
          const y = Math.max(0, Math.min(d.h - 1, Math.round(Number(g.fy) * (d.h - 1))))
          sendCmd({ type: 'touch', event: 'down', x: x, y: y })
          timeout(function () { sendCmd({ type: 'touch', event: 'up', x: x, y: y }) }, 40)
          logDiag('AI 点击 @' + x + ',' + y + ' · ' + (g.intent || ''))
        } else if (g.kind === 'longpress') {
          const x = Math.max(0, Math.min(d.w - 1, Math.round(Number(g.fx) * (d.w - 1))))
          const y = Math.max(0, Math.min(d.h - 1, Math.round(Number(g.fy) * (d.h - 1))))
          const hold = Math.max(100, Math.min(10000, Number(g.holdMs) || 2000))
          sendCmd({ type: 'touch', event: 'down', x: x, y: y })
          timeout(function () { sendCmd({ type: 'touch', event: 'up', x: x, y: y }) }, hold)
          logDiag('AI 长按 @' + x + ',' + y + ' ' + hold + 'ms · ' + (g.intent || ''))
        } else if (g.kind === 'key') {
          sendCmd({ type: 'key', name: g.key })
          logDiag('AI 按键 ' + g.key + ' · ' + (g.intent || ''))
        }
      }

      // 落点预览：把比例坐标映射到视频元素内的像素位置（含黑边偏移；半透明、不拦鼠标）
      function dotPos(fx, fy) {
        const screen = screenRef.current
        const video = videoRef.current
        if (!screen || !video || fx === undefined || fy === undefined) return null
        const sr = screen.getBoundingClientRect()
        const r = video.getBoundingClientRect()
        const vw = video.videoWidth || 1, vh = video.videoHeight || 1
        const scale = Math.min(r.width / vw, r.height / vh)
        const drawW = vw * scale, drawH = vh * scale
        const offX = (r.width - drawW) / 2, offY = (r.height - drawH) / 2
        return {
          x: (r.left - sr.left) + offX + Number(fx) * drawW,
          y: (r.top - sr.top) + offY + Number(fy) * drawH,
        }
      }
      function previewDots() {
        if (!preview || preview.sn !== sn) return []
        const p = dotPos(preview.fx, preview.fy)
        if (!p) return []
        return [{ cls: preview.kind === 'longpress' ? ' slow' : '', style: { left: p.x + 'px', top: p.y + 'px' } }]
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

      // 「输入」按钮：把输入框内容经 Host 用 hdc 注入到手机当前聚焦的输入框
      async function confirmInput() {
        const t = inputText.trim()
        if (!t) return
        try {
          const r = await rpc('ctl:input', { text: t, sn: sn })
          if (r && r.ok) { setInputText(''); setInputOpen(false); logDiag('已输入: ' + t) }
          else logDiag('输入失败: ' + ((r && r.error) || '未知错误'))
        } catch (e) { logDiag('输入失败: ' + String((e && e.message) || e)) }
      }

      function disconnect() {
        try { if (wsRef.current) wsRef.current.close() } catch (e) {}
        rpc('device:disconnect', { sn: sn }).catch(function () {})
        onClose()
      }

      const statusCls = status === 'playing' ? 'ok' : (status === 'closed' || status === 'error' ? 'bad' : 'warn')
      const statusLine = statusText || ('已连接 · ' + frames + ' 帧 / ' + (bytes / 1048576).toFixed(1) + ' MB')
      const logContent = logLines.length > 0 ? logLines.join('\n') : (diag.length > 0 ? diag.join('\n') : '（日志流未开启，点击「日志▸」开始）')

      const rootCls = 'dshhos-control'
        + (placement === 'overlay' ? ' dshhos-control-overlay' : '')
        + (placement === 'hidden' ? ' dshhos-control-hidden' : '')
      let rootStyle = null
      if (placement === 'floating') rootStyle = { width: panelW + 'px' }
      else if (placement === 'overlay' && rect) {
        rootStyle = {
          left: rect.left + 'px',
          top: rect.top + 'px',
          width: rect.width + 'px',
          height: rect.height + 'px',
          // 侧栏面板本身 z-index:10；全屏呈现时是 40，得压在它上面（浮动面板层是 60，不抢）
          zIndex: rect.fullscreen ? 45 : 35,
        }
      }
      return React.createElement('div', { className: rootCls, style: rootStyle },
        React.createElement('div', { className: 'dshhos-control-head', ref: headRef },
          React.createElement('span', { className: 'dshhos-csn', title: sn }, sn),
          props.wireless === undefined ? null : React.createElement('span', {
            className: 'dshhos-quality',
            title: props.wireless ? '无线（TCP）连接：视频流已固定降到 1/4 画质以减轻卡顿' : '有线（USB）连接',
          }, props.wireless ? ('无线 · 1/' + (props.scale || 4)) : ('有线 · 1/' + (props.scale || 2))),
          React.createElement('button', { className: 'dshhos-btn-sm dshhos-shot-btn', title: '截取当前屏幕并像粘贴图片一样添加到聊天输入框', onClick: function () { if (onAddShotToChat) onAddShotToChat(sn) } }, '添加截图至聊天框'),
          React.createElement('button', { className: 'dshhos-btn-sm', title: 'AI 截图/控制设置', onClick: function () { setSettingsOpen(true); loadModelInfo() } }, '设置'),
          React.createElement('button', { className: 'dshhos-btn-sm', onClick: disconnect }, '断开'),
        ),
        React.createElement('div', { className: 'dshhos-status-bar' },
          React.createElement('div', { className: 'dshhos-control-status ' + statusCls, ref: statusRef }, error ? ('错误: ' + error) : statusLine),
          React.createElement('div', { className: 'dshhos-input-wrap' },
            React.createElement('button', { className: 'dshhos-btn-sm dshhos-input-btn', title: '向手机当前聚焦的输入框注入文本', onClick: function () { setInputOpen(!inputOpen) } }, '输入'),
            inputOpen ? React.createElement('div', { className: 'dshhos-input-pop' },
              React.createElement('input', {
                className: 'dshhos-input-field',
                value: inputText,
                placeholder: '输入内容',
                onChange: function (e) { setInputText(e.target.value) },
                onKeyDown: function (e) { if (e.key === 'Enter') confirmInput() },
                autoFocus: true,
              }),
              React.createElement('button', { className: 'dshhos-btn-sm dshhos-btn-primary', onClick: confirmInput, disabled: !inputText.trim() }, '确定'),
            ) : null,
          ),
        ),
        React.createElement('div', { className: 'dshhos-screen', ref: screenRef },
          React.createElement('video', {
            ref: videoRef,
            autoPlay: true, muted: true, playsInline: true,
            onMouseDown: function (e) { draggingRef.current = true; sendTouch('down', e.clientX, e.clientY) },
            onMouseMove: function (e) { if (draggingRef.current) sendTouch('move', e.clientX, e.clientY) },
            onMouseUp: function (e) { draggingRef.current = false; sendTouch('up', e.clientX, e.clientY) },
            onMouseLeave: function (e) { if (draggingRef.current) { draggingRef.current = false; sendTouch('up', e.clientX, e.clientY) } },
          }),
          (function () {
            const dots = previewDots()
            return dots.map(function (d, i) {
              if (d.line) return React.createElement('div', { key: 'l' + i, className: 'dshhos-swipe-line', style: d.style })
              return React.createElement('div', { key: 'd' + i, className: 'dshhos-tapdot' + d.cls, style: d.style })
            })
          })(),
        ),
        logOpen ? React.createElement('div', { className: 'dshhos-log', ref: logRef }, logContent) : null,
        React.createElement('div', { className: 'dshhos-control-keys', ref: keysRef },
          React.createElement('button', { className: 'dshhos-key dshhos-key-log', onClick: toggleLog }, logOpen ? '日志▾' : '日志▸'),
          React.createElement('button', { className: 'dshhos-key', onClick: function () { keyPress('back') }, disabled: status === 'connecting' }, '返回'),
          React.createElement('button', { className: 'dshhos-key', onClick: function () { keyPress('home') }, disabled: status === 'connecting' }, '主页'),
          React.createElement('button', { className: 'dshhos-key', onClick: function () { keyPress('volumeUp') }, disabled: status === 'connecting' }, '音量+'),
          React.createElement('button', { className: 'dshhos-key', onClick: function () { keyPress('volumeDown') }, disabled: status === 'connecting' }, '音量-'),
        ),
        settingsOpen ? React.createElement(SettingsDialog, {
          sn: sn,
          shotMode: shotMode,
          ctlMode: ctlMode,
          keyMode: keyMode,
          inputMode: inputMode,
          onShotMode: onShotMode,
          onCtlMode: onCtlMode,
          onKeyMode: onKeyMode,
          onInputMode: onInputMode,
          modelInfo: modelInfo,
          onModelChange: changeModel,
          onClose: function () { setSettingsOpen(false) },
        }) : null,
      )
    }

    function modeRow(label, value, onChange, disabled) {
      return React.createElement('div', { className: 'dshhos-setting-row' },
        React.createElement('div', { className: 'dshhos-setting-info' },
          React.createElement('div', { className: 'dshhos-setting-label' }, label),
        ),
        React.createElement('select', {
          className: 'dshhos-select',
          value: value || 'off',
          disabled: !!disabled,
          onChange: function (e) { if (!disabled && onChange) onChange(e.target.value) },
        },
          React.createElement('option', { value: 'off' }, '禁止使用'),
          React.createElement('option', { value: 'confirm' }, '需要确认'),
          React.createElement('option', { value: 'trust' }, '无需确认'),
        ),
      )
    }

    // 识别模型：只列 provider 里支持图片输入的模型
    // （不在标题下写说明小字；只在出错/回退/加载中这类"状态"上显示一行）
    function modelRow(info, onChange) {
      const models = (info && info.models) || []
      const value = (info && info.effective) || ''
      let warn = ''
      if (!info) warn = '加载中…'
      else if (info.error) warn = info.error
      else if (info.fallback) warn = '设置中的模型不可用，已回退到 ' + info.effective
      return React.createElement('div', { className: 'dshhos-setting-row' },
        React.createElement('div', { className: 'dshhos-setting-info' },
          React.createElement('div', { className: 'dshhos-setting-label' }, '识别模型'),
          warn ? React.createElement('div', { className: 'dshhos-hint' }, warn) : null,
        ),
        React.createElement('select', {
          className: 'dshhos-select',
          value: value,
          disabled: models.length === 0,
          onChange: function (e) { if (onChange) onChange(e.target.value) },
        }, models.map(function (m) {
          const isDefault = info && m.id === info.default
          return React.createElement('option', { key: m.id, value: m.id }, m.name || m.id, isDefault ? '（默认）' : '')
        })),
      )
    }

    function SettingsDialog(props) {
      const { sn, shotMode, ctlMode, keyMode, inputMode, onShotMode, onCtlMode, onKeyMode, onInputMode, onClose, modelInfo, onModelChange } = props
      const shotDisabled = !shotMode || shotMode === 'off'
      return React.createElement('div', { className: 'dshhos-dialog-mask', onMouseDown: onClose },
        React.createElement('div', { className: 'dshhos-dialog', onMouseDown: function (e) { e.stopPropagation() } },
          React.createElement('div', { className: 'dshhos-dialog-head' },
            React.createElement('span', null, 'AI 控制设置' + (sn ? ' · ' + sn : '')),
            React.createElement('button', { className: 'dshhos-close', onClick: onClose }, '✕'),
          ),
          React.createElement('div', { className: 'dshhos-dialog-body' },
            modeRow('允许截图', shotMode, onShotMode),
            modeRow('允许控制', ctlMode, onCtlMode, shotDisabled),
            modeRow('允许按键', keyMode, onKeyMode, shotDisabled),
            modeRow('允许输入', inputMode, onInputMode, shotDisabled),
            modelRow(modelInfo, onModelChange),
          ),
          React.createElement('div', { className: 'dshhos-dialog-foot' },
            React.createElement('button', { className: 'dshhos-btn-sm dshhos-btn-primary', onClick: onClose }, '完成'),
          ),
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
      const [draft, setDraft] = React.useState({ javaPath: '', hdcPath: '', wiredFrameRate: 60, wirelessFrameRate: 30 })
      const [saving, setSaving] = React.useState(false)
      const [notice, setNotice] = React.useState('')
      const [connectingSn, setConnectingSn] = React.useState('')
      // 正在跑的设备 sn 列表（绿点/灰点的依据），由 sidecar:status 轮询刷新
      const [runningSns, setRunningSns] = React.useState([])
      const missRef = React.useRef({}) // sn -> 连续未见次数（确认 sidecar 真的没了才清理会话）
      // 投屏会话状态（连了哪台设备、四个权限模式）放在共享 store 里：
      // 面板本体现在渲染在右侧栏标签页中，与本组件是两棵组件树。
      const { sessions, docks, shotMode, ctlMode, keyMode, inputMode } = useSessionStore()
      const inputActions = props && props.inputActions
      // 右侧栏服务可用时，投屏面板进标签页；不可用（老版本 DSH）或调用失败时，退回原来的浮层
      const [tabBroken, setTabBroken] = React.useState(false)
      const canUseTab = !!(tabsRegistry && sidebarRight) && !tabBroken

      React.useEffect(function () {
        if (sessionStore.get().inputActions !== (inputActions || null)) {
          sessionStore.set({ inputActions: inputActions || null }) // 供标签页里的「添加截图至聊天框」使用
        }
      }, [inputActions])

      // 允许「开始」页的入口唤起同一个「hos-scrcpy 菜单」弹层
      React.useEffect(function () {
        return onScrcpyMenuOpen(function () { setOpen(true); setNotice('') })
      }, [])

      const loadAll = React.useCallback(async function () {
        setBusy(true)
        setError('')
        try {
          const e = await rpc('env:detect', {})
          setEnv({ java: e.java, hdc: e.hdc })
          setSources({ java: e.javaSource || '', hdc: e.hdcSource || '' })
          const cfg = await rpc('cfg:get', {})
          setDraft({
            javaPath: e.javaPath || '',
            hdcPath: e.hdcPath || '',
            wiredFrameRate: (cfg && cfg.wiredFrameRate) || 60,
            wirelessFrameRate: (cfg && cfg.wirelessFrameRate) || 30,
          })
          const d = await rpc('devices:list', {})
          if (d && d.ok) { setDevices(d.devices || []) } else { setDevices([]); if (d && d.error) setError(d.error) }
          const s = await rpc('shot:mode', {})
          const cc = await rpc('ctl:mode', {})
          const kk = await rpc('key:mode', {})
          const ii = await rpc('input:mode', {})
          sessionStore.set({
            shotMode: (s && s.modes) || {},
            ctlMode: (cc && cc.modes) || {},
            keyMode: (kk && kk.modes) || {},
            inputMode: (ii && ii.modes) || {},
          })
        } catch (err) { setError('获取设备信息失败: ' + String((err && err.message) || err)) }
        setBusy(false)
      }, [])

      React.useEffect(function () { if (open) loadAll() }, [open])

      // 菜单打开时轮询"哪些设备在跑"（绿点/灰点的依据），并顺手清理真死掉的会话：
      // 进程可能被 idle-exit（5 分钟无客户端）收走，或宿主重启后没了。
      // 用"连续两次没看到才清理"防误杀（刚启动时存在竞态）。
      React.useEffect(function () {
        if (!open) return undefined
        let disposed = false
        async function tick() {
          try {
            const r = await rpc('sidecar:status', {})
            if (disposed) return
            const sns = ((r && r.devices) || []).map(function (d) { return d.sn })
            setRunningSns(sns)
            const sessions = sessionStore.get().sessions
            Object.keys(sessions).forEach(function (sn) {
              if (sns.indexOf(sn) >= 0) { missRef.current[sn] = 0; return }
              missRef.current[sn] = (missRef.current[sn] || 0) + 1
              if (missRef.current[sn] >= 2) {
                delete missRef.current[sn]
                sessionStore.removeSession(sn)
                releaseDeviceTab(sn) // 先注销：closeScrcpyScreenTab 要据此判断"是不是最后一张"
                closeScrcpyScreenTab(sn)
                setNotice('设备 ' + sn + ' 的投屏已结束（进程不在了）')
              }
            })
          } catch (e) {}
        }
        tick()
        const dispose = interval(tick, 2000)
        return function () { disposed = true; try { dispose() } catch (e) {} }
      }, [open])

      /** 断开某台设备：杀掉它的 sidecar + 移除会话 + 关掉它的标签页（= 面板里那个「断开」） */
      async function disconnectDevice(sn) {
        setError('')
        try { await rpc('device:disconnect', { sn: sn }) } catch (e) { setError('断开失败: ' + String((e && e.message) || e)) }
        sessionStore.removeSession(sn)
        releaseDeviceTab(sn) // 先注销：closeScrcpyScreenTab 要据此判断"是不是最后一张"
        closeScrcpyScreenTab(sn)
        setRunningSns(function (prev) { return prev.filter(function (x) { return x !== sn }) })
        setNotice('已断开 ' + sn)
      }

      async function connectDevice(sn) {
        setConnectingSn(sn)
        setError('')
        try {
          const r = await rpc('device:connect', { sn: sn })
          if (r && r.ok && r.port) {
            setOpen(false)
            sessionStore.setSession({
              sn: sn, port: r.port, wireless: !!r.wireless, scale: r.scale || 2,
              frameRate: r.frameRate || 0, bitRate: r.bitRate || 0, iFrameInterval: r.iFrameInterval || 0,
            })
            // 打不开标签页（服务缺失/没有挂载的侧栏座位）就退回浮层，别让用户什么都看不到
            if (!(await openScrcpyScreenTab(sn))) {
              setTabBroken(true)
              setError('打开投屏标签页失败：' + (sessionStore.get().openError || '未知原因'))
            }
            setRunningSns(function (prev) { return prev.indexOf(sn) >= 0 ? prev : prev.concat([sn]) })
          } else {
            setError('连接失败: ' + ((r && r.error) || '未知错误'))
          }
        } catch (err) { setError('连接失败: ' + String((err && err.message) || err)) }
        setConnectingSn('')
      }

      // 四个权限模式：真正的逻辑在 apply 作用域的 setMode()（侧栏标签页里也用它），
      // 这里只负责把结果播到本组件的提示/错误区。
      async function applyMode(kind, sn, mode) {
        setError('')
        setNotice('')
        const r = await setMode(kind, sn, mode)
        if (r && r.error) setError(r.error)
        else if (r && r.notice) setNotice(r.notice)
      }

      function changeShotMode(sn, mode) { return applyMode('shot', sn, mode) }
      function changeCtlMode(sn, mode) { return applyMode('ctl', sn, mode) }
      function changeKeyMode(sn, mode) { return applyMode('key', sn, mode) }
      function changeInputMode(sn, mode) { return applyMode('input', sn, mode) }

      // 截图并像粘贴图片一样添加到聊天输入框（逻辑在 apply 作用域，标签页里也复用同一份）
      async function handleAddShotToChat(sn) {
        setError('')
        setNotice('')
        try {
          const r = await addShotToChat(sn, inputActions)
          if (r && r.ok) setNotice('已添加截图到聊天框（可继续输入文字后发送）')
          else setError((r && r.error) || '添加截图失败')
        } catch (err) { setError('添加截图失败: ' + String((err && err.message) || err)) }
      }

      async function saveConfig() {
        setSaving(true)
        setNotice('')
        try {
          const r = await rpc('cfg:save', {
            javaPath: draft.javaPath, hdcPath: draft.hdcPath,
            wiredFrameRate: draft.wiredFrameRate, wirelessFrameRate: draft.wirelessFrameRate,
          })
          if (r && r.ok) { setSettingsOpen(false); setNotice('配置已保存'); await loadAll() }
          else setError('保存失败: ' + ((r && r.error) || '未知错误'))
        } catch (err) { setError('保存失败: ' + String((err && err.message) || err)) }
        setSaving(false)
      }

      async function autoDetect() {
        setSaving(true)
        try {
          const e = await rpc('env:detect', {})
          setDraft(Object.assign({}, draft, { javaPath: e.javaPath || '', hdcPath: e.hdcPath || '' }))
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

      // 编码参数的数字输入行（标题自解释，标题下不写说明小字）
      function numField(label, value, onChange) {
        return React.createElement('div', { className: 'dshhos-field' },
          React.createElement('label', null, label),
          React.createElement('input', {
            type: 'number',
            value: String(value),
            onChange: function (e) { onChange(Number(e.target.value) || 0) },
          }),
        )
      }

      const icon = React.createElement('svg', { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: '1.4', strokeLinecap: 'round', strokeLinejoin: 'round', style: { width: 13, height: 13 } },
        React.createElement('rect', { x: '2', y: '3', width: '12', height: '10', rx: '2' }),
        React.createElement('path', { d: 'M2 7h12' }),
      )

      return React.createElement('div', { className: 'dshhos-trigger' },
        React.createElement('button', { className: 'dshhos-btn', title: 'hos-scrcpy 菜单', onClick: function () { setOpen(true); setNotice('') } },
          icon, React.createElement('span', null, 'hos-scrcpy 菜单')),
        // 面板一直挂在 header 组件里（它常驻），切标签页/收侧栏都不会卸载它，
        // 所以 WebSocket 与解码器活着，切回来是接着放的画面，不用重开编码会话。
        // 多设备：每台设备一个面板（各自一条 WS），各自按"自己标签页是否在最前"决定
        // overlay（贴上去）/ hidden（隐藏但仍收流）。
        Object.keys(sessions).map(function (key) {
          const s = sessions[key]
          const rect = docks[key] || null
          const placement = canUseTab ? (rect ? 'overlay' : 'hidden') : 'floating'
          return React.createElement(ControlPanel, {
            key: key,
            sn: s.sn, port: s.port,
            wireless: !!s.wireless, scale: s.scale, frameRate: s.frameRate,
            placement: placement,
            rect: rect,
            onClose: function () {
              sessionStore.removeSession(key)
              releaseDeviceTab(key) // 先注销，再关标签页（判断"是不是最后一张"要用它）
              closeScrcpyScreenTab(key)
            },
            shotMode: shotMode[key] || 'off',
            ctlMode: ctlMode[key] || 'off',
            keyMode: keyMode[key] || 'off',
            inputMode: inputMode[key] || 'off',
            onShotMode: function (mode) { changeShotMode(key, mode) },
            onCtlMode: function (mode) { changeCtlMode(key, mode) },
            onKeyMode: function (mode) { changeKeyMode(key, mode) },
            onInputMode: function (mode) { changeInputMode(key, mode) },
            onAddShotToChat: handleAddShotToChat,
          })
        }),
        open ? React.createElement('div', { className: 'dshhos-mask', onMouseDown: function () { setOpen(false) } }) : null,
        open ? React.createElement('div', { className: 'dshhos-panel', onMouseDown: function (e) { e.stopPropagation() } },
          React.createElement('div', { className: 'dshhos-panel-head' },
            React.createElement('span', null, 'hos-scrcpy 菜单'),
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
                        const running = runningSns.indexOf(dev.sn) >= 0
                        const busyThis = connectingSn === dev.sn
                        return React.createElement('div', { className: 'dshhos-item', key: dev.sn },
                          React.createElement('span', { className: 'dshhos-dot ' + (running ? 'ok' : 'idle'), title: running ? '正在运行（sidecar 已启动）' : '未启动' }),
                          React.createElement('span', { className: 'dshhos-item-sn', title: dev.sn }, dev.sn),
                          busyThis
                            ? React.createElement('span', { className: 'dshhos-connecting' }, '连接中…')
                            : running
                              // 已运行：投屏 = 打开/聚焦它的标签页（不重连不重开流）；断开 = 杀掉这台设备的 sidecar
                              ? React.createElement('span', { className: 'dshhos-item-actions' },
                                  React.createElement('button', { className: 'dshhos-connect', onClick: async function () {
                                    const ok = await openScrcpyScreenTab(dev.sn)
                                    if (ok) setOpen(false)
                                    else setError('打开投屏标签页失败：' + (sessionStore.get().openError || '未知原因'))
                                  } }, '投屏'),
                                  React.createElement('button', { className: 'dshhos-connect', onClick: function () { disconnectDevice(dev.sn) } }, '断开'),
                                )
                              // 未运行：启动 = 起 sidecar + 打开它的投屏标签页
                              : React.createElement('button', { className: 'dshhos-connect', disabled: !!connectingSn, onClick: function () { connectDevice(dev.sn) } }, '启动'),
                        )
                      }),
                    )
                  : React.createElement('div', { className: 'dshhos-empty' },
                      error || (env && env.hdc && env.hdc.ok ? '未检测到设备\n请确认手机已开启 USB 调试并连接' : '配置 java/hdc 路径后即可发现设备'),
                    ),
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
              numField('有线帧率 (fps)', draft.wiredFrameRate, function (v) { setDraft(Object.assign({}, draft, { wiredFrameRate: v })) }),
              numField('无线帧率 (fps)', draft.wirelessFrameRate, function (v) { setDraft(Object.assign({}, draft, { wirelessFrameRate: v })) }),
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

    // ============================================================
    // 右侧栏标签页 + 接管「开始」页（DSH 0.1.5+）
    // 服务缺失时整块跳过，不影响上面的 header 菜单
    // ============================================================
    const TAB_ID = 'dsh-hos-scrcpy'
    const TAB_KIND = 'dsh-hos-scrcpy-devices'
    // ⚠️ 服务解析时机（静态包实测的坑）：bundle 形式的客户端插件 apply 可能早于
    // sidebar-right 提供服务，此时 apply 期 ctx.get 拿到 undefined，而下面的
    // `if (!tabsRegistry) return false` 是**静默**早退 → 现象就是"标签页没注册成功、
    // 直接退化成浮层面板、控制台一条日志都没有"。
    // 所以：apply 期试取一次，真正要用的时候再解析一次；静态版生成器还会把这两个服务
    // 写进 exports.inject（bundle 插件的服务门禁，见 dsh-client-ui-sidebar-files 的写法）兜底。
    let tabsRegistry = ctx.get('sidebarRightTabs')
    let sidebarRight = ctx.get('sidebarRight')
    let sidebarWarned = false
    function resolveSidebarServices() {
      if (!tabsRegistry) { try { tabsRegistry = ctx.get('sidebarRightTabs') } catch (e) {} }
      if (!sidebarRight) { try { sidebarRight = ctx.get('sidebarRight') } catch (e) {} }
      const missing = []
      if (!tabsRegistry) missing.push('sidebarRightTabs')
      if (!sidebarRight) missing.push('sidebarRight')
      if (missing.length === 0) return true
      if (!sidebarWarned) {
        sidebarWarned = true
        console.warn('[dsh-hos-scrcpy] 侧栏服务未就绪，缺少：' + missing.join('、') + ' —— 标签页不可用，退回浮层面板')
      }
      return false
    }

    function safeInject(name, fn) {
      try { slots.inject(name, fn) } catch (e) { /* 该槽位在当前 DSH 不存在 */ }
    }

    function CompassGlyph(props) {
      const s = (props && props.size) || 16
      return React.createElement('svg', { width: s, height: s, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', className: props && props.className },
        React.createElement('circle', { cx: '8', cy: '8', r: '6', stroke: 'currentColor', strokeWidth: '1.4' }),
        React.createElement('path', { d: 'M 10.9 5.1 L 9.1 9.1 L 5.1 10.9 L 6.9 6.9 Z', fill: 'currentColor' }))
    }

    function CubeGlyph(props) {
      const s = (props && props.size) || 16
      return React.createElement('svg', { width: s, height: s, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', className: props && props.className },
        React.createElement('path', { d: 'M 8 2.5 L 12.9 5.2 V 10.8 L 8 13.5 L 3.1 10.8 V 5.2 Z', stroke: 'currentColor', strokeWidth: '1.1', strokeLinejoin: 'round' }),
        React.createElement('path', { d: 'M 3.1 5.2 L 8 7.9 L 12.9 5.2 M 8 7.9 V 13.5', stroke: 'currentColor', strokeWidth: '1.1', strokeLinejoin: 'round', strokeLinecap: 'round' }))
    }

    // 读「开始」页胶囊列表（含其它插件注册的），并订阅变更
    function useGuideEntries(registry) {
      const [entries, setEntries] = React.useState(function () { return (registry && registry.guide && registry.guide()) || [] })
      React.useEffect(function () {
        if (!registry || typeof registry.subscribe !== 'function') return undefined
        const unsub = registry.subscribe(function () { setEntries((registry.guide && registry.guide()) || []) })
        return function () { try { unsub() } catch (e) {} }
      }, [])
      return entries
    }

    function GuideEntryBox(props) {
      const entry = props.entry
      const description = props.described && entry.description ? entry.description() : undefined
      const Icon = entry.icon || CubeGlyph
      return React.createElement('button', {
        type: 'button',
        className: 'dshhos-guide-entry',
        'data-sidebar-right-guide-entry': entry.kind,
        onClick: function () { props.onPick(entry) },
      },
        React.createElement('span', { className: 'dshhos-guide-entryIcon' },
          React.createElement(Icon, {
            size: description === undefined ? 22 : 26,
            className: entry.icon === undefined ? 'dshhos-guide-placeholderInk' : undefined,
          })),
        React.createElement('span', { className: 'dshhos-guide-entryText' },
          React.createElement('span', { className: 'dshhos-guide-entryTitle' }, entry.title()),
          description !== undefined
            ? React.createElement('span', { className: 'dshhos-guide-entryDescription' }, description)
            : null))
    }

    // 复刻官方「开始」页（含其它插件的胶囊）+ 追加我们自己的入口
    function GuidePage(props) {
      const MAX_DESCRIBED_ENTRIES = 4
      const entries = useGuideEntries(props.registry)
      const described = entries.length <= MAX_DESCRIBED_ENTRIES
      return React.createElement('div', { className: 'dshhos-guide', 'data-sidebar-right-guide': true },
        React.createElement('span', { className: 'dshhos-guide-hero', 'aria-hidden': 'true' },
          React.createElement(CompassGlyph, { size: 56 })),
        entries.map(function (entry, index) {
          return React.createElement(GuideEntryBox, {
            key: entry.kind + ':' + index, entry: entry, described: described, onPick: props.onPick,
          })
        }),
        React.createElement('button', {
          type: 'button',
          className: 'dshhos-guide-entry',
          onClick: function () { props.onOpenMenu() },
        },
          React.createElement('span', { className: 'dshhos-guide-entryIcon' },
            React.createElement(CubeGlyph, { size: 22, className: 'dshhos-guide-placeholderInk' })),
          React.createElement('span', { className: 'dshhos-guide-entryText' },
            React.createElement('span', { className: 'dshhos-guide-entryTitle' }, 'hos-scrcpy 菜单'),
            described ? React.createElement('span', { className: 'dshhos-guide-entryDescription' }, '打开设备列表') : null)))
    }

    // ---- 资源型标签页地址：一设备一标签页 ----
    // 页面型标签页的 contentId 是 sidebar://<kind>，而"一个 pane 里每种 kind 只能有一个页面
    // 标签页"（dockkit 源码注释原话），所以多设备必须走资源型：地址不同 = 标签页不同，
    // 同一地址默认复用 → 正好是"已有该设备标签页就跳转，没有就新建"。
    const TAB_ADDR_PREFIX = 'dsh-resource://dsh-hos-scrcpy/device/'
    // 地址里只放"安全字符"：设备号可能是 192.168.1.241:35147，冒号在 URL 里会被编码成 %3A，
    // 而路由/glob 匹配对编码字符的处理不好预期——统一换成 _，再用 deviceKey 反查真实 sn。
    function deviceKey(sn) { return String(sn || '').replace(/[^0-9A-Za-z.\-]/g, '_') }
    function scrcpyAddress(sn) { return TAB_ADDR_PREFIX + deviceKey(sn) }
    function keyFromAddress(address) {
      const s = String(address || '')
      return s.indexOf(TAB_ADDR_PREFIX) === 0 ? s.slice(TAB_ADDR_PREFIX.length) : ''
    }
    /** 从地址里的安全 key 反查真实 sn（需要在现有会话里找；找不到返回 ''） */
    function snFromAddress(address, sessions) {
      const key = keyFromAddress(address)
      if (!key) return ''
      const keys = Object.keys(sessions || {})
      for (let i = 0; i < keys.length; i++) if (deviceKey(keys[i]) === key) return keys[i]
      return ''
    }

    /**
     * 取这张标签页的地址。踩过的坑：一开始只读 `info.tab.contentId`，结果拿到空值
     * （调试行显示"地址=(空)"）——所以这里把几个可能的位置都试一遍。
     */
    function tabAddress(info, props) {
      const candidates = [
        info && info.tab && info.tab.contentId,
        info && info.tab && info.tab.navigation && info.tab.navigation.address,
        info && info.tab && info.tab.address,
        info && info.address,
        props && props.tab && props.tab.contentId,
        props && props.address,
      ]
      for (let i = 0; i < candidates.length; i++) {
        if (typeof candidates[i] === 'string' && candidates[i]) return candidates[i]
      }
      return ''
    }

    /**
     * 右侧栏标签页：本体只是"占位 + 位置报告器"。
     * 投屏画面挂在 header 的常驻面板里（dockkit 的 paneBody 只渲染活动标签的 body，
     * 切走就卸载，所以画面绝不能放在这里），这里只把这台设备的矩形报给 store，
     * 面板据此贴上来。切走时本组件卸载 → 该设备的 dock 清空 → 面板隐藏（并 pause 停流）。
     *
     * 身份来自 props.sn（由 ensureDeviceTab 在注册这个专属 kind 的组件时闭包进来），
     * 不读地址、不依赖 tabInfo。
     */
    function ScrcpyTabBody(props) {
      const sess = useSessionStore()
      const hostRef = React.useRef(null)
      const sn = String((props && props.sn) || '')
      const snRef = React.useRef(sn)
      snRef.current = sn
      const info = props && props.hooks && typeof props.hooks.tabInfo === 'function' ? (function () {
        try { return props.hooks.tabInfo() } catch (e) { return null }
      })() : null
      const infoRef = React.useRef(info)
      infoRef.current = info // 只是用来拿"全屏呈现"（拿不到也不影响）
      const lastRawRef = React.useRef(null) // 上一次采样到的"原始"矩形，用于判断动画是否停下

      /** 我这张标签页现在是不是"最前 + 侧栏展开"？（不用 tabInfo，直接问 sidebarRight） */
      function myTabActive() {
        if (!sidebarRight) return true
        try {
          if (typeof sidebarRight.isExpanded === 'function' && !sidebarRight.isExpanded()) return false
          const active = typeof sidebarRight.active === 'function' ? sidebarRight.active() : undefined
          if (!active) return false
          return active.kind === deviceKind(sn)
        } catch (e) { return false }
      }

      function publish() {
        const el = hostRef.current
        const mySn = snRef.current
        if (!el || !mySn) return
        const cur = infoRef.current
        // 侧栏收起 / 切到别的标签页：立刻隐藏（不能每 500ms 跟着正在滑动的容器重排——
        // 一个带 <video> 的大图层半秒变一次尺寸，会把侧栏动画一起拖卡，实测就是这么卡的）。
        if (!myTabActive()) {
          lastRawRef.current = null
          if (sessionStore.get().docks[mySn]) sessionStore.setDock(mySn, null)
          // 面板不可见就不算聚焦设备（AI 只操作看得见的那台）
          if (sessionStore.get().focusedSn === mySn) {
            sessionStore.set({ focusedSn: '' })
            rpc('device:focus', {}).catch(function () {})
          }
          return
        }
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height) return
        // 全屏呈现时侧栏铺满视口，面板的 z-index 要压过它（见 ControlPanel）
        const next = {
          left: Math.round(r.left), top: Math.round(r.top),
          width: Math.round(r.width), height: Math.round(r.height),
          fullscreen: !!(cur && cur.sidebar && cur.sidebar.fullscreen),
        }
        const prev = sessionStore.get().docks[mySn]
        const same = prev && prev.left === next.left && prev.top === next.top && prev.width === next.width
          && prev.height === next.height && prev.fullscreen === next.fullscreen
        const raw = lastRawRef.current
        const rawSame = raw && raw.left === next.left && raw.top === next.top && raw.width === next.width && raw.height === next.height
        lastRawRef.current = next
        if (!same) {
          // 侧栏展开/收起有 ~200ms 的滑动动画，拖宽时也在连续变化：
          // 动画期间矩形"每帧尺寸"都不同，这时去改大图层尺寸＝动画卡顿的来源。
          // 规则：首帧立刻贴（不然要等半秒才出现），之后必须连续两次采样一致（= 动画停了）才发布。
          if (!raw || rawSame) sessionStore.setDock(mySn, next)
        }
        // 我这张标签页在最前 → 我就是"聚焦设备"（AI 的目标）；这是 DSH 的真实状态，不用猜
        if (sessionStore.get().focusedSn !== mySn) {
          sessionStore.set({ focusedSn: mySn })
          rpc('device:focus', { sn: mySn }).catch(function () {})
        }
      }

      React.useEffect(function () {
        publish()
        const dispose = interval(publish, 500) // 侧栏拖宽 / 窗口变化 / 切全屏都能跟上
        function onResize() { publish() }
        try { window.addEventListener('resize', onResize) } catch (e) {}
        return function () {
          try { dispose() } catch (e) {}
          try { window.removeEventListener('resize', onResize) } catch (e) {}
          const mySn = snRef.current
          if (mySn) sessionStore.setDock(mySn, null) // 标签页被卸载：这台设备的面板转隐藏态（仍收流）
        }
      }, [])

      return React.createElement('div', { ref: hostRef, className: 'dshhos-tab-host', style: { width: '100%', height: '100%', boxSizing: 'border-box' } },
        sess.sessions[sn] ? null : React.createElement('div', { className: 'dshhos-tab-empty' },
          React.createElement('div', { className: 'dshhos-hint' }, '还没有连接设备。'),
          React.createElement('button', { className: 'dshhos-btn-sm dshhos-btn-primary', onClick: function () { openScrcpyMenu() } }, '打开「hos-scrcpy 菜单」'),
        ),
      )
    }

    // 标签题名：sn 同样来自闭包（props.sn），不读地址、不依赖 tabInfo
    function ScrcpyTabTitle(props) {
      const sess = useSessionStore()
      const sn = String((props && props.sn) || '')
      if (!sn) return 'hos-scrcpy'
      return sess.sessions[sn] ? ('投屏 · ' + sn) : ('已断开 · ' + sn)
    }

    /**
     * 打开（或聚焦）投屏标签页，并把"当前聚焦设备"切到 sn。
     *
     * ⚠️ 为什么不用"一设备一标签页"（资源型）：实测我们注册的标签页组件**拿不到 tabInfo**
     * （调试行显示"地址=(空)"，两种会话数下都是空的）——sidebar-right 的 tabInfo hook 由它内部
     * 构造，外部插件按 slot 契约拿不到。所以退回**一张页面型标签页**：
     * 多设备各自的后台流都活着，标签页里只显示"聚焦"的那台。
     *
     * @returns {Promise<boolean>} false = 打不开（调用方回退到浮层面板）
     */
    async function openScrcpyScreenTab(sn) {
      if (!sn) return false
      if (!ensureDeviceTab(sn)) return false
      if (!resolveSidebarServices() || typeof sidebarRight.openTab !== 'function') {
        console.warn('[dsh-hos-scrcpy] sidebarRight.openTab 不可用（服务未就绪或版本不匹配），退回浮层面板')
        return false
      }
      const myKind = deviceKind(sn)
      const attempt = function () {
        try {
          sidebarRight.openTab(myKind)
          return { ok: true }
        } catch (e) { return { ok: false, error: String((e && e.message) || e) } }
      }
      let last = attempt()
      if (last.ok) return true
      // 侧栏收起时"座位"可能没挂载 → 先展开再重试
      try {
        if (typeof sidebarRight.isExpanded === 'function' && !sidebarRight.isExpanded()
          && typeof sidebarRight.toggleExpanded === 'function') sidebarRight.toggleExpanded()
      } catch (e) {}
      for (let i = 0; i < 6 && !last.ok; i++) {
        await new Promise(function (r) { timeout(r, 250) })
        last = attempt()
      }
      if (!last.ok) {
        console.warn('[dsh-hos-scrcpy] openTab 失败：', last.error)
        sessionStore.set({ openError: last.error || '未知错误' })
        return false
      }
      return true
    }

    /**
     * 关掉某台设备的投屏标签页（断开时调用）。
     *
     * 侧栏规则（两条实测出来的坑）：
     * - **还有别的设备标签页**：什么都不动 —— 你还在看另一台，贸然收起会把它的画面一起收掉；
     * - **这是最后一张**：主动收起侧栏 —— 否则 dockkit 会把侧栏切到别的标签（实测会跳到
     *   "文件"或"开始"页），看着像是插件乱跳。
     * 因此调用方必须**先 releaseDeviceTab(sn) 再调本函数**，本函数才能正确判断"是不是最后一张"。
     */
    function closeScrcpyScreenTab(sn) {
      if (!resolveSidebarServices()) return
      try {
        const active = typeof sidebarRight.active === 'function' ? sidebarRight.active() : undefined
        const mine = !!(active && active.id && active.kind === deviceKind(sn))
        if (!mine) return
        if (typeof sidebarRight.close === 'function') sidebarRight.close(active.id)
        // 还有别的设备注册着（= 别的设备还在投屏）→ 保持侧栏现状，别打扰
        if (Object.keys(deviceTabDisposers).length > 0) return
        if (typeof sidebarRight.isExpanded === 'function' && typeof sidebarRight.toggleExpanded === 'function'
          && sidebarRight.isExpanded()) sidebarRight.toggleExpanded()
      } catch (e) {}
    }

    /**
     * 旧版页面型标签页（kind = TAB_KIND）的占位：不在 layout 里留"无法查看此内容"。
     */
    function LegacyTabNotice() {
      return React.createElement('div', { className: 'dshhos-tab-empty' },
        React.createElement('div', { className: 'dshhos-hint' }, '这是旧版投屏标签页（已废弃）。关掉它，然后从「hos-scrcpy 菜单」里对某台设备点「投屏」。'),
        React.createElement('button', { className: 'dshhos-btn-sm dshhos-btn-primary', onClick: function () { openScrcpyMenu() } }, '打开「hos-scrcpy 菜单」'),
      )
    }

    // ============================================================
    // 每台设备一个专属 kind + 专属组件（sn 闭包进组件）
    //
    // 为什么这才是"一设备一标签页"的正解：标签页 body 是**按该 tab 的 kind 对应的类型 id**
    // 派发的（sidebar-right 文档原话：dispatched with the `id` of the type in force for tab.kind），
    // 而注册那个类型的组件是我们自己写的 —— 所以把 sn 闭包进组件即可知道身份。
    // 不需要读地址（实测读不到：调试行 地址=(空)），也不需要 tabInfo。
    // 每个 kind 是一种页面 → dockkit"每个 pane 每种 kind 最多一张页面标签页"的规则反而帮我们
    // 实现了"同设备已有标签页就跳转，没有就新建"。
    // ============================================================
    const deviceTabDisposers = {} // sn -> [dispose…]
    function deviceKind(sn) { return TAB_KIND + '-' + deviceKey(sn) }

    function ensureDeviceTab(sn) {
      if (!sn) return false
      if (deviceTabDisposers[sn]) return true
      const ready = resolveSidebarServices()
      if (!ready || !slots) {
        sessionStore.set({ openError: '侧栏服务不可用（slots=' + (!!slots) + ', sidebarRightTabs=' + (!!tabsRegistry) + ', sidebarRight=' + (!!sidebarRight) + '）' })
        return false
      }
      const id = deviceKind(sn)
      const disposers = []
      // 注册一个 keyed 槽位：优先走 slots.inject（缺失就退化成直接 register）——
      // 实测项目里其它地方都得用 safeInject 包着它，说明这个 API 不一定存在，
      // 上一版直接调它、抛错又被 try/catch 吞掉 → 注册失败 → 标签页开不出来（表现为"还是旧版"）。
      const registerSlot = function (name, component) {
        const direct = function () { return slots.register({ name: name, key: id }, component) }
        if (typeof slots.inject === 'function') {
          try { return slots.inject(name, direct) } catch (e) { /* 退化到直接注册 */ }
        }
        return direct()
      }
      try {
        // 已经有人注册过这个 kind（上一次插件实例的残留、或页面里另一个实例）→ 直接用，别再注册
        // （重复注册同一个 id/kind 会抛错；以前一抛错我就整个退出 → 面板退化成浮层，看着"不是标签页了"）
        const already = typeof tabsRegistry.get === 'function' ? tabsRegistry.get(id) : undefined
        if (already) {
          deviceTabDisposers[sn] = []
          return true
        }
        disposers.push(tabsRegistry.register({
          id: id,
          kind: id,
          priority: 'extension',
          title: function () { return '投屏' },
        }))
        disposers.push(registerSlot('sidebar.right.pane.tab', function (props) {
          return React.createElement(ScrcpyTabBody, Object.assign({}, props, { sn: sn }))
        }))
        disposers.push(registerSlot('sidebar.right.pane.tab.title', function (props) {
          return React.createElement(ScrcpyTabTitle, Object.assign({}, props, { sn: sn }))
        }))
      } catch (e) {
        const msg = '注册设备标签页失败：' + String((e && e.message) || e)
        console.warn('[dsh-hos-scrcpy] ' + msg, e)
        sessionStore.set({ openError: msg })
        disposers.forEach(function (d) { try { d() } catch (e2) {} })
        return false
      }
      deviceTabDisposers[sn] = disposers
      return true
    }

    /** 断开某台设备时注销它的专属 kind（否则留下悬空的类型注册） */
    function releaseDeviceTab(sn) {
      const ds = deviceTabDisposers[sn]
      if (!ds) return
      delete deviceTabDisposers[sn]
      ds.forEach(function (d) { try { d() } catch (e) {} })
    }

    if (tabsRegistry) {
      // 旧 kind 的占位注册：**必须容错** —— 页面里如果还残留上一次实例注册的同名 kind/id，
      // 这里会抛错，而它在 apply 早期执行、抛出去会把整个 client 半区带崩（菜单都出不来）。
      const registerLegacyKind = function () {
        try {
          if (typeof tabsRegistry.get === 'function' && tabsRegistry.get(TAB_KIND)) return function () {}
          return tabsRegistry.register({
            id: TAB_ID, kind: TAB_KIND, priority: 'extension',
            title: function () { return 'hos-scrcpy' },
          })
        } catch (e) {
          console.warn('[dsh-hos-scrcpy] 旧 kind 注册失败（忽略，通常是残留）：', e)
          return function () {}
        }
      }
      if (typeof ctx.effect === 'function') ctx.effect(registerLegacyKind, 'dsh-hos-scrcpy: legacy tab kind')
      else { try { registerLegacyKind() } catch (e) {} }

      safeInject('sidebar.right.pane.tab', function () {
        return slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, function () {
          return React.createElement(LegacyTabNotice, null)
        })
      })
    }

    slots.inject('conversation.session.header.utilities', function () {
      return slots.register(
        { name: 'conversation.session.header.utilities', id: 'dsh-hos-scrcpy-devices', order: -20, label: 'hos-scrcpy 菜单' },
        function (props) { return React.createElement(DevicePanel, props) },
      )
    })
}

    exports.inject = ['slots', 'sidebarRightTabs', 'sidebarRight']
    exports.apply = apply
    return module.exports
  },
})
