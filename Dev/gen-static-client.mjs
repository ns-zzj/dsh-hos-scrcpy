// ============================================================
// 静态版 Client 半区生成器
//
// 静态包（npm tgz）走的是 DSH 客户端模块加载器（window.__ModuleLoader__），
// 与动态插件（cordis 的 client 函数体）不是同一套运行环境，所以需要一次机械转换：
//
//   host.call(...)             -> rpc(...)            （同源 fetch POST /dsh-hos-scrcpy/rpc）
//   styles.insert(...)         -> insertStyles(...)   （向 head 插 <style>）
//   ctx.timer.interval(...)    -> interval(...)       （包装 window.setInterval，返回取消函数）
//   ctx.timer.timeout(...)     -> timeout(...)        （包装 window.setTimeout，返回取消函数）
//   插件对象 { inject, apply } -> exports.inject = ['slots'] / exports.apply = apply
//
// 用法：
//   node gen-static-client.mjs          # 生成并写回两处静态 client
//   node gen-static-client.mjs --check  # 只校验磁盘上的静态 client 是否与动态版同步（CI 用）
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url)) // 2.0.0/GithubFiles/Dev
const pkgRoot = join(here, '..', '..') // 2.0.0
const SRC = join(pkgRoot, 'PluginMain-Dynamic', 'client.js')
const OUTS = [
  join(pkgRoot, 'GithubFiles', 'client', 'client.js'),
  join(pkgRoot, 'PluginMain-Static', 'client', 'client.js'),
]
const MODULE_ID = 'dsh-hos-scrcpy'

const HEADER = `// ============================================================
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
  id: ${JSON.stringify(MODULE_ID)},
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    let React = require('react')
`

const HELPERS = `
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
`

// 为什么静态版的 inject 要带上 sidebarRightTabs / sidebarRight：
// bundle 形式客户端插件的 exports.inject 就是 cordis 的服务门禁 —— apply 会等到这些服务
// 被提供出来才跑。实测（2.1.0）静态包只声明 slots 时，apply 早于
// dsh-client-ui-sidebar-right 提供服务，apply 期 ctx.get('sidebarRightTabs') 拿到 undefined
// 且**不报错**（client.js 里 `if (!tabsRegistry) return false` 是静默早退），表现为
// "菜单在、点投屏却退化成浮层面板、控制台一条日志都没有"。
// 参考写法：dsh-client-ui-sidebar-files 的 inject 里就带着 sidebarRightTabs。
const FOOTER = `
    exports.inject = ['slots', 'sidebarRightTabs', 'sidebarRight']
    exports.apply = apply
    return module.exports
  },
})
`

function fail(msg) {
  console.error('gen-static-client: ' + msg)
  process.exit(1)
}

function generate() {
  const text = readFileSync(SRC, 'utf8')
  const lines = text.split('\n')
  // 动态 client.js 末尾固定是 "  },\n}\n"（apply 的收尾 + 插件对象收尾）
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  if (lines[lines.length - 1] !== '}' || lines[lines.length - 2] !== '  },') {
    fail('动态 client.js 结尾不是预期的 "  },\\n}"，生成器锚点失效，请检查源文件')
  }
  const returnIdx = lines.findIndex((l) => l === 'return {')
  const applyIdx = lines.findIndex((l) => /^\s*apply\(ctx\)\s*\{\s*$/.test(l))
  if (returnIdx < 0 || applyIdx < 0) fail('动态 client.js 里找不到 "return {" 或 "apply(ctx) {"')

  const head = lines.slice(0, returnIdx).join('\n').replace(/\s+$/, '')
  const body = lines.slice(applyIdx + 1, lines.length - 2).join('\n')

  const subst = (s) => s
    .replace(/host\.call\(/g, 'rpc(')
    .replace(/styles\.insert\(/g, 'insertStyles(')
    .replace(/ctx\.timer\.interval\(/g, 'interval(')
    .replace(/ctx\.timer\.timeout\(/g, 'timeout(')

  return HEADER + subst(head) + '\n' + HELPERS + '\nfunction apply(ctx) {\n' + subst(body) + '\n}\n' + FOOTER
}

const out = generate()
// 生成器自身产物必须能当函数体解析（静态版是模块工厂，内层是普通 JS）
try {
  new Function('require', out) // eslint-disable-line no-new-func
} catch (e) {
  fail('生成的代码解析失败: ' + e.message)
}

const check = process.argv.includes('--check')
let bad = 0
for (const target of OUTS) {
  const cur = readFileSync(target, 'utf8')
  if (cur === out) {
    console.log('OK   ' + relative(pkgRoot, target))
    continue
  }
  bad++
  if (check) {
    console.log('落后 ' + relative(pkgRoot, target) + '（与动态版不一致，需重新生成）')
  } else {
    writeFileSync(target, out, 'utf8')
    console.log('已写 ' + relative(pkgRoot, target))
  }
}
if (check && bad > 0) process.exit(1)
if (!check && bad === 0) console.log('两处静态 client 已是最新（与动态版一致）')
