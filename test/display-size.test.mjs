// 屏幕尺寸解析的回归测试。
// 背景：以前"屏幕尺寸"是拿控件最大边界算的 —— 页面只渲染了状态栏时，
// 会算出 1320x137 这种鬼值，AI 点哪都偏到屏幕最底。
// 现在改成问 DisplayManagerService 要"内部屏的逻辑尺寸"。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

function extract(name) {
  const start = source.indexOf('async function ' + name + '(')
  assert.ok(start >= 0, '找不到函数 ' + name)
  const end = source.indexOf('\n}', start) + 2
  assert.ok(end > start, '函数 ' + name + ' 没有正常收尾')
  return source.slice(start, end)
}

/** 注入一个假的 run()，返回给定的 dump 文本 */
function loader(dumpText, ok = true) {
  return new Function('run',
    extract('readLogicalDisplaySize') + '\nreturn readLogicalDisplaySize')(
    async () => ({ ok, stdout: dumpText }))
}

// 真实设备（鸿蒙 7.0.0.109）上抓下来的结构，只保留了关键行
const PORTRAIT = `
Name:                          UNKNOWN
DisplayId:                     0
RSScreenId:                    0
isInternal:                    true
isExtend:                      false
activeModes<id, W, H, RS>:     768, 1320, 2856, 60
SourceMode:                    0
ScreenCombination:             5
Rotation:                      0
`

const LANDSCAPE = PORTRAIT.replace('Rotation:                      0', 'Rotation:                      90')

const VIRTUAL_FIRST = `
DisplayId:                     1165
isInternal:                    false
activeModes<id, W, H, RS>:     900, 800, 1280, 60
Rotation:                      0
` + PORTRAIT

test('竖屏：取内部屏的 activeModes 尺寸', async () => {
  const size = await loader(PORTRAIT)('sn')
  assert.deepEqual(size, { width: 1320, height: 2856 })
})

test('横屏（Rotation 90）：宽高对调', async () => {
  const size = await loader(LANDSCAPE)('sn')
  assert.deepEqual(size, { width: 2856, height: 1320 })
})

test('投屏虚拟屏排在前面时，仍然取 isInternal 的那块', async () => {
  const size = await loader(VIRTUAL_FIRST)('sn')
  assert.deepEqual(size, { width: 1320, height: 2856 })
})

test('查不到就返回 null（让调用方显式退路，不许瞎猜）', async () => {
  assert.equal(await loader('')('sn'), null)
  assert.equal(await loader('完全没有尺寸信息')('sn'), null)
  assert.equal(await loader(PORTRAIT, false)('sn'), null)
  assert.equal(await loader(PORTRAIT.replace('768, 1320, 2856', '768, 0, 0'))('sn'), null)
})
