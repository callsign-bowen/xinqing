import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import ts from 'typescript'
import * as THREE from 'three'

const source = await fs.readFile(new URL('./geometry.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  .replaceAll("from 'three'", `from ${JSON.stringify(import.meta.resolve('three'))}`)
  .replaceAll("from 'three/addons/geometries/RoundedBoxGeometry.js'", `from ${JSON.stringify(import.meta.resolve('three/addons/geometries/RoundedBoxGeometry.js'))}`)
const { buildCabin } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const motionSource = await fs.readFile(new URL('./motion.ts', import.meta.url), 'utf8')
const motionCode = ts.transpileModule(motionSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const { readChatMotion } = await import(`data:text/javascript;base64,${Buffer.from(motionCode).toString('base64')}`)
const labels = []
const cabin = buildCabin((text, width, height) => {
  labels.push(text)
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial())
}, { days: '0天', streak: '0天', levels: [] })
function named(name) { const result = []; cabin.root.traverse(o => { if (o.name === name) result.push(o) }); return result }

test('四个独立的三维入口及其空间锚点存在，舱壁开口是真实几何孔洞', () => {
  assert.deepEqual(Object.keys(cabin.devices).sort(), ['chat', 'emotion', 'journal', 'profile'])
  for (const [key, group] of Object.entries(cabin.devices)) {
    assert.equal(group.userData.device, key)
    assert.ok(cabin.anchors[key].isVector3)
    assert.ok(group.children.length > 2)
  }
  assert.equal(named('rear-wall-with-window-and-recess')[0].geometry.parameters.shapes.holes.length, 2)
  const floor = named('solid-floor')[0].geometry
  floor.computeBoundingBox()
  const floorSize = floor.boundingBox.getSize(new THREE.Vector3())
  assert.ok(floorSize.x > 10 && floorSize.z > 10 && floorSize.y > .25)
  assert.ok(named('modeled-padded-chair')[0].children.length > 10)
})

test('Nuo 身体与头部有体积，五官和四肢不使用平面人物或 Sprite', () => {
  const nuo = named('nuo-volumetric-character')[0]
  nuo.traverse(o => {
    assert.equal(Boolean(o.isSprite), false)
    if (o.isMesh) assert.notEqual(o.geometry.type, 'PlaneGeometry')
  })
  for (const part of ['nuo-rounded-body', 'nuo-sculpted-head', 'nuo-smile']) assert.equal(named(part).length, 1)
  for (const part of ['nuo-arm', 'nuo-foot']) assert.equal(named(part).length, 2)
  const bounds = new THREE.Box3().setFromObject(nuo).getSize(new THREE.Vector3())
  assert.ok(bounds.x > 1 && bounds.y > 2 && bounds.z > .8)
  assert.equal(named('nuo-blinking-eye').length, 2)
  assert.equal(named('nuo-pink-cheek').length, 2)
})

test('全息书具备独立书脊、两侧封面、十层实体书页和翻页铰链', () => {
  assert.equal(named('book-three-dimensional-spine')[0].geometry.type, 'CylinderGeometry')
  assert.equal(named('book-thick-cover').length, 2)
  assert.equal(named('book-page-layer').length, 10)
  assert.equal(named('book-open-leaf-stack').length, 2)
  const leaf = named('book-page-layer')[0]
  leaf.geometry.computeBoundingBox()
  assert.ok(leaf.geometry.boundingBox.getSize(new THREE.Vector3()).z > .015)
  const turning = named('book-turning-page')[0]
  cabin.animate(14, .016, false); assert.equal(turning.visible, true); assert.notEqual(turning.rotation.y, 0)
  cabin.animate(2, .016, false); assert.equal(turning.visible, false)
})

test('待机浮动、眨眼、思考与回应动作执行，减少动画偏好冻结周期动作', () => {
  const nuo = named('nuo-volumetric-character')[0], eye = named('nuo-blinking-eye')[0]
  cabin.animate(0, .016, false); const initial = nuo.position.y
  cabin.animate(1, .016, false); assert.notEqual(nuo.position.y, initial)
  cabin.animate(5.19, .016, false); assert.ok(eye.scale.y < .02)
  cabin.activity(true, true, 6); cabin.animate(6.1, .016, false)
  const orbit = named('nuo-thinking-orbit')[0].parent
  assert.equal(orbit.visible, true)
  cabin.root.updateMatrixWorld(true)
  const headTop = new THREE.Box3().setFromObject(named('nuo-head-rig')[0]).max.y
  const dotBottom = new THREE.Box3().setFromObject(orbit).min.y
  assert.ok(dotBottom > headTop + .05, '思考光点必须高于头部，不能被头部几何体遮住')
  cabin.activity(false, true, 6.2, true); cabin.animate(6.4, .016, false)
  assert.equal(named('nuo-thinking-orbit')[0].parent.visible, false)
  assert.equal(cabin.motionState(6.4), 'responding')
  assert.equal(cabin.motionState(9), 'listening')
  cabin.animate(9, .016, true); assert.equal(nuo.position.y, 2.05); assert.equal(named('book-turning-page')[0].visible, false)
})

test('磁吸模块有厚度；悬停触发舱门、模块、Nuo 的动态反馈', () => {
  assert.equal(named('independent-magnetic-module').length, 4)
  const lid = named('hinged-storage-lid')[0]
  cabin.hover('profile'); cabin.animate(0, .2, false)
  assert.ok(lid.rotation.x < -.18); assert.ok(named('independent-magnetic-module')[0].position.z > 0)
  cabin.hover('chat'); cabin.animate(1, .2, false)
  assert.ok(named('nuo-volumetric-character')[0].scale.x > 1)
  cabin.hover(null)
})

test('情绪面板使用真实指标；无连续记录时明确标示示意，曲线是三维 Tube', () => {
  assert.ok(labels.includes('尚无连续记录 · 光谱示意'))
  cabin.updateEmotion({ days: '3天', streak: '2天', levels: [1, 4, 2] })
  assert.ok(labels.includes('3天记录   ·   2天连续'))
  assert.ok(labels.includes('最近记录 · 心情轨迹'))
  assert.equal(named('emotion-chart-curve').length, 1)
  assert.equal(named('emotion-chart-curve')[0].geometry.type, 'TubeGeometry')
  assert.equal(named('emotion-glass-layer').length, 2)
  assert.ok(cabin.geometrySummary().meshes > 100)
})

test('实际聊天的等待行也有 ai-assistant 类，但不得计入正式 assistant 数量', () => {
  const state = readChatMotion(['ai-message ai-assistant', 'ai-message ai-user', 'ai-message ai-assistant ai-typing-message'], { pending: false, assistantCount: 1 })
  assert.equal(state.pending, true); assert.equal(state.assistantCount, 1); assert.equal(state.responded, false)
  const reply = readChatMotion(['ai-message ai-assistant', 'ai-message ai-user', 'ai-message ai-assistant'], state)
  assert.equal(reply.pending, false); assert.equal(reply.assistantCount, 2); assert.equal(reply.responded, true)
})

test('停止等待或报错移除占位行，不伪造回应动作；读取历史也不冒充新回复', () => {
  const cancelled = readChatMotion(['ai-message ai-assistant', 'ai-message ai-user'], { pending: true, assistantCount: 1 })
  assert.equal(cancelled.responded, false)
  const history = readChatMotion(['ai-message ai-assistant', 'ai-message ai-user', 'ai-message ai-assistant'], { pending: false, assistantCount: 0 })
  assert.equal(history.responded, false)
})

test('无初始问候时首条模型回复仍触发动作；后续流式文本变化不重复触发', () => {
  const first = readChatMotion(['ai-message ai-user', 'ai-message ai-assistant'], { pending: true, assistantCount: 0 })
  assert.equal(first.responded, true)
  const sameMessage = readChatMotion(['ai-message ai-user', 'ai-message ai-assistant'], first)
  assert.equal(sameMessage.responded, false)
})

test.after(() => {
  const geometries = new Set(), materials = new Set()
  cabin.root.traverse(o => { if (o.isMesh || o.isPoints) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)) } })
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose())
})
