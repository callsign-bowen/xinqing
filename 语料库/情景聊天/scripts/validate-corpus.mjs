#!/usr/bin/env node
/**
 * 情景聊天语料库校验器 v1（零依赖，只用 Node 内置模块）
 *
 * 用法：
 *   node 语料库/情景聊天/scripts/validate-corpus.mjs
 *   node 语料库/情景聊天/scripts/validate-corpus.mjs --verbose
 *
 * 检查内容：
 *   1. JSON / JSONL 能否解析
 *   2. 是否符合 schemas/ 下的三个 JSON Schema
 *   3. 编号、目录、文件名、INDEX 是否一致
 *   4. 来源引用、许可分桶、上线门槛
 *   5. 对话轮次、分支、策略引用等结构不变量
 *   6. 是否泄漏 API Key 形态的字符串
 *
 * 退出码：0 通过；1 有错误。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VERBOSE = process.argv.includes('--verbose')
const CATEGORY_CODES = ['FAM', 'WRK', 'REL', 'FRD', 'SELF', 'CNS', 'CARE', 'DIG']

const errors = []
const warnings = []
let checkCount = 0

const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/')
const fail = (message) => errors.push(message)
const warn = (message) => warnings.push(message)

function walk(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

function readJson(file) {
  try {
    // 编辑器（记事本、VS Code 某些配置）可能写入 BOM，先剥掉再解析。
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  } catch (error) {
    fail(`${rel(file)}: JSON 解析失败 — ${error.message}`)
    return null
  }
}

function readJsonl(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  const rows = []
  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) return
    try {
      rows.push({ value: JSON.parse(trimmed), line: index + 1 })
    } catch (error) {
      fail(`${rel(file)}:${index + 1}: JSONL 解析失败 — ${error.message}`)
    }
  })
  return rows
}

function jsonType(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function matchesType(type, value) {
  if (type === 'integer') return Number.isInteger(value)
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  return jsonType(value) === type
}

function resolveRef(ref, root) {
  if (!ref.startsWith('#/')) throw new Error(`不支持的 $ref：${ref}`)
  return ref
    .slice(2)
    .split('/')
    .map((key) => key.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((node, key) => (node == null ? undefined : node[key]), root)
}

/** 运行一次校验并把本次产生的错误摘出来，用于 anyOf / oneOf。 */
function attempt(fn) {
  const mark = errors.length
  fn()
  return errors.splice(mark)
}

function validateNode(schema, value, at, root) {
  checkCount += 1
  if (schema === true || schema == null) return
  if (typeof schema !== 'object') return

  if (schema.$ref) {
    const target = resolveRef(schema.$ref, root)
    if (!target) {
      fail(`${at}: $ref 无法解析（${schema.$ref}）`)
      return
    }
    validateNode(target, value, at, root)
    return
  }

  if (schema.type != null) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!types.some((type) => matchesType(type, value))) {
      fail(`${at}: 类型应为 ${types.join(' | ')}，实际是 ${jsonType(value)}`)
      return
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    fail(`${at}: 必须是 ${JSON.stringify(schema.const)}`)
  }

  if (schema.enum && !schema.enum.includes(value)) {
    fail(`${at}: 取值必须是 ${schema.enum.join(' / ')} 之一，实际是 ${JSON.stringify(value)}`)
  }

  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) {
      fail(`${at}: 至少 ${schema.minLength} 个字符，实际 ${value.length}`)
    }
    if (schema.maxLength != null && value.length > schema.maxLength) {
      fail(`${at}: 最多 ${schema.maxLength} 个字符，实际 ${value.length}`)
    }
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) {
      fail(`${at}: 不符合格式 ${schema.pattern}（实际 ${JSON.stringify(value)}）`)
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) fail(`${at}: 不能小于 ${schema.minimum}`)
    if (schema.maximum != null && value > schema.maximum) fail(`${at}: 不能大于 ${schema.maximum}`)
  }

  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) fail(`${at}: 至少 ${schema.minItems} 项，实际 ${value.length}`)
    if (schema.maxItems != null && value.length > schema.maxItems) fail(`${at}: 最多 ${schema.maxItems} 项，实际 ${value.length}`)
    if (schema.uniqueItems) {
      const seen = new Set()
      value.forEach((item, index) => {
        const key = JSON.stringify(item)
        if (seen.has(key)) fail(`${at}[${index}]: 重复项 ${key}`)
        seen.add(key)
      })
    }
    if (schema.items) value.forEach((item, index) => validateNode(schema.items, item, `${at}[${index}]`, root))
  }

  if (matchesType('object', value)) {
    const keys = Object.keys(value)
    if (schema.minProperties != null && keys.length < schema.minProperties) fail(`${at}: 至少 ${schema.minProperties} 个字段`)
    for (const key of schema.required || []) {
      if (!(key in value)) fail(`${at}: 缺少必填字段 ${key}`)
    }
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (key in value) validateNode(child, value[key], `${at}.${key}`, root)
    }
    if (schema.additionalProperties === false) {
      const known = new Set(Object.keys(schema.properties || {}))
      for (const key of keys) {
        if (!known.has(key)) fail(`${at}: 不允许的字段 ${key}`)
      }
    } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const known = new Set(Object.keys(schema.properties || {}))
      for (const key of keys) {
        if (!known.has(key)) validateNode(schema.additionalProperties, value[key], `${at}.${key}`, root)
      }
    }
  }

  if (schema.allOf) {
    for (const sub of schema.allOf) validateNode(sub, value, at, root)
  }

  if (schema.anyOf) {
    const outcomes = schema.anyOf.map((sub) => attempt(() => validateNode(sub, value, at, root)))
    if (outcomes.every((list) => list.length > 0)) {
      fail(`${at}: anyOf 没有任何分支通过`)
    }
  }

  if (schema.oneOf) {
    const outcomes = schema.oneOf.map((sub) => attempt(() => validateNode(sub, value, at, root)))
    const passed = outcomes.filter((list) => list.length === 0).length
    if (passed !== 1) fail(`${at}: oneOf 需要恰好 1 个分支通过，实际 ${passed}`)
  }
}

function validateInstance(schema, value, label) {
  if (value == null) return
  validateNode(schema, value, label, schema)
}

// ---------------------------------------------------------------------------
// 载入 schema
// ---------------------------------------------------------------------------
const schemaDir = path.join(ROOT, 'schemas')
const scenarioSchema = readJson(path.join(schemaDir, 'scenario.schema.json'))
const sourceSchema = readJson(path.join(schemaDir, 'source-registry.schema.json'))
const indexSchema = readJson(path.join(schemaDir, 'corpus-index.schema.json'))
if (!scenarioSchema || !sourceSchema || !indexSchema) {
  console.error('schema 读取失败，无法继续')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 1. INDEX.json
// ---------------------------------------------------------------------------
const indexFile = path.join(ROOT, 'INDEX.json')
const index = readJson(indexFile)
const slotById = new Map()
let declaredSlots = 0

if (index) {
  validateInstance(indexSchema, index, 'INDEX')

  const codes = (index.categories || []).map((category) => category.code)
  if (new Set(codes).size !== codes.length) fail('INDEX: 类目代码重复')
  for (const code of CATEGORY_CODES) {
    if (!codes.includes(code)) fail(`INDEX: 缺少类目 ${code}`)
  }

  const orders = (index.categories || []).map((category) => category.order)
  if (new Set(orders).size !== orders.length) fail('INDEX: 类目 order 重复')

  for (const category of index.categories || []) {
    declaredSlots += (category.slots || []).length
    if ((category.slots || []).length !== 8) fail(`INDEX: ${category.code} 应有 8 个编号，实际 ${(category.slots || []).length}`)
    if (category.dir !== `ORIGINAL_CORPUS/${category.code}`) fail(`INDEX: ${category.code} 的 dir 应为 ORIGINAL_CORPUS/${category.code}`)

    category.slots.forEach((slot, indexInCategory) => {
      const expectedId = `${category.code}-${String(indexInCategory + 1).padStart(3, '0')}`
      if (slot.id !== expectedId) fail(`INDEX: ${category.code} 第 ${indexInCategory + 1} 位应为 ${expectedId}，实际 ${slot.id}`)
      if (slot.seq !== indexInCategory + 1) fail(`INDEX: ${slot.id}: seq 应为 ${indexInCategory + 1}`)
      if (slotById.has(slot.id)) fail(`INDEX: 编号重复 ${slot.id}`)
      slotById.set(slot.id, { ...slot, code: category.code })
      if (slot.file != null) {
        const file = path.join(ROOT, slot.file)
        if (!fs.existsSync(file)) fail(`INDEX: ${slot.id} 登记的 file 不存在 — ${slot.file}`)
      }
    })
  }

  if (declaredSlots !== 64) fail(`INDEX: totalSlots 应为 64，实际登记 ${declaredSlots}`)
  if (index.corpus?.totalSlots !== declaredSlots) fail(`INDEX: corpus.totalSlots(${index.corpus?.totalSlots}) 与实际编号数(${declaredSlots}) 不一致`)

  const licenseClasses = index.licenseClasses || []
  for (const expected of ['commercial_ok', 'research_only', 'restricted']) {
    if (!licenseClasses.includes(expected)) fail(`INDEX: licenseClasses 缺少 ${expected}`)
  }
}

// ---------------------------------------------------------------------------
// 2. 来源登记（三个桶）
// ---------------------------------------------------------------------------
const registries = [
  { file: 'sources-commercial-ok-v1.jsonl', expected: 'commercial_ok' },
  { file: 'sources-research-only-v1.jsonl', expected: 'research_only' },
  { file: 'sources-restricted-v1.jsonl', expected: 'restricted' }
]
const sourceById = new Map()
let sourceCount = 0

for (const registry of registries) {
  const file = path.join(ROOT, 'REFERENCE_LIBRARY', registry.file)
  if (!fs.existsSync(file)) {
    fail(`REFERENCE_LIBRARY: 缺少 ${registry.file}`)
    continue
  }
  for (const row of readJsonl(file)) {
    sourceCount += 1
    const record = row.value
    const label = `${registry.file}:${row.line}`
    validateInstance(sourceSchema, record, label)
    if (!record || typeof record !== 'object') continue

    if (record.licenseClass !== registry.expected) {
      fail(`${label}: ${record.id} 的 licenseClass 为 ${record.licenseClass}，不能放在 ${registry.file}（应为 ${registry.expected}）`)
    }
    if (sourceById.has(record.id)) fail(`${label}: 来源 id 重复 ${record.id}`)
    sourceById.set(record.id, record)

    if (!record.url && !record.localPath) {
      if (record.verification?.status === 'pending') {
        warn(`${label}: ${record.id} 的 url 与 localPath 都待补（verification=pending）`)
      } else if (record.usageStatus === 'excluded') {
        warn(`${label}: ${record.id} 已标记 excluded，未保留原始位置`)
      } else {
        fail(`${label}: ${record.id} 的 url 与 localPath 不能同时为空；待补时 verification.status 必须为 pending，或把 usageStatus 设为 excluded`)
      }
    }
    if (record.url && !/^https?:\/\//.test(record.url) && !/^internal:\/\//.test(record.url)) {
      warn(`${label}: ${record.id} 的 url 不是 http(s) 或 internal://，请确认`)
    }

    if (record.licenseClass === 'commercial_ok') {
      if (record.commercialUse !== true) fail(`${label}: ${record.id} 在商用桶里，commercialUse 必须为 true`)
      if (record.modification !== true) fail(`${label}: ${record.id} 在商用桶里，modification 必须为 true`)
      if (record.verification?.status !== 'verified') fail(`${label}: ${record.id} 在商用桶里，verification.status 必须为 verified`)
      if (/unknown|copyright|nc|non-?commercial/i.test(String(record.license))) {
        fail(`${label}: ${record.id} 的许可证 ${record.license} 不支持商用，不能放在商用桶`)
      }
    }
    if (record.licenseClass === 'research_only' && record.commercialUse !== false) {
      fail(`${label}: ${record.id} 是研究资料，commercialUse 必须为 false`)
    }
    if (record.licenseClass === 'restricted') {
      if (record.commercialUse !== false) fail(`${label}: ${record.id} 是受限资料，commercialUse 必须为 false`)
      if (record.modification !== false) fail(`${label}: ${record.id} 是受限资料，modification 必须为 false`)
    }
  }
}

// ---------------------------------------------------------------------------
// 3. 情景语料
// ---------------------------------------------------------------------------
const scenarioDirs = [
  { dir: path.join(ROOT, 'ORIGINAL_CORPUS'), approval: false },
  { dir: path.join(ROOT, 'PRODUCTION_APPROVED'), approval: true }
]
const scenarios = new Map()

for (const target of scenarioDirs) {
  for (const file of walk(target.dir)) {
    if (!file.endsWith('.json')) continue
    if (path.basename(file) === 'package.json') continue
    const record = readJson(file)
    if (!record) continue
    const label = rel(file)
    validateInstance(scenarioSchema, record, label)
    if (!record || typeof record !== 'object' || !record.id) continue

    if (scenarios.has(record.id)) fail(`${label}: 情景 id 与 ${scenarios.get(record.id).label} 重复`)
    scenarios.set(record.id, { record, file, label, approval: target.approval })

    const folder = path.basename(path.dirname(file))
    if (!CATEGORY_CODES.includes(folder)) {
      fail(`${label}: 文件必须放在 ORIGINAL_CORPUS/<类目代码>/ 或 PRODUCTION_APPROVED/<类目代码>/ 下`)
    } else if (record.id && !record.id.startsWith(`${folder}-`)) {
      fail(`${label}: 编号 ${record.id} 与目录 ${folder} 不匹配`)
    }
    if (!path.basename(file).startsWith(`${record.id}-`)) {
      fail(`${label}: 文件名必须以 ${record.id}- 开头`)
    }

    if (record.status !== record.review?.status) {
      fail(`${label}: 顶层 status(${record.status}) 与 review.status(${record.review?.status}) 不一致`)
    }
    if (target.approval && record.status !== 'approved') {
      fail(`${label}: PRODUCTION_APPROVED 里只能是 approved，实际 ${record.status}`)
    }
    if (!target.approval && record.status === 'approved') {
      fail(`${label}: approved 文件必须移到 PRODUCTION_APPROVED/`)
    }

    const turns = record.dialogue?.turns || []
    turns.forEach((turn, index) => {
      if (turn.turn !== index + 1) fail(`${label}: 第 ${index + 1} 轮的 turn 应为 ${index + 1}，实际 ${turn.turn}`)
      const expectedSpeaker = index % 2 === 0 ? 'counterpart' : 'user_stand_in'
      if (turn.speaker !== expectedSpeaker) fail(`${label}: 第 ${turn.turn} 轮说话人应为 ${expectedSpeaker}，实际 ${turn.speaker}`)
      if (turn.strategy && !(record.strategies || []).some((item) => item.id === turn.strategy)) {
        fail(`${label}: 第 ${turn.turn} 轮引用了不存在的策略 ${turn.strategy}`)
      }
    })

    if ((record.strategies || []).length > 0) {
      const ids = record.strategies.map((item) => item.id)
      if (new Set(ids).size !== ids.length) fail(`${label}: 策略 id 重复`)
    }

    if ((record.conflict?.initial ?? 0) > (record.conflict?.peak ?? 0)) {
      fail(`${label}: conflict.initial 不能大于 peak`)
    }

    const branches = record.branches || []
    if (branches.length && branches.every((branch) => branch.leadsTo === 'continue')) {
      fail(`${label}: 所有分支都是 continue，等于没有分支`)
    }
    for (const branch of branches) {
      if (branch.afterTurn > turns.length) fail(`${label}: 分支 ${branch.id} 的 afterTurn(${branch.afterTurn}) 超出对话轮数(${turns.length})`)
    }

    const licenseClass = record.sources?.licenseClass
    if (record.status === 'approved') {
      if (licenseClass !== 'commercial_ok') fail(`${label}: approved 语料的 licenseClass 必须是 commercial_ok`)
      const checklist = record.review?.checklist || {}
      for (const key of ['safety', 'license', 'language', 'realism', 'bias']) {
        if (checklist[key] !== 'pass') fail(`${label}: approved 语料的 checklist.${key} 必须为 pass`)
      }
      if (!(record.review?.reviewers || []).some((reviewer) => reviewer.role !== 'author')) {
        fail(`${label}: approved 语料必须有非作者审核人`)
      }
    }

    for (const sourceId of record.sources?.sourceIds || []) {
      if (!sourceById.has(sourceId)) {
        fail(`${label}: 引用了未登记的来源 ${sourceId}`)
        continue
      }
      const source = sourceById.get(sourceId)
      if (licenseClass === 'commercial_ok' && source.licenseClass !== 'commercial_ok') {
        fail(`${label}: 语料标记为 commercial_ok，但引用了 ${source.licenseClass} 来源 ${sourceId}`)
      }
    }

    const slot = slotById.get(record.id)
    if (!slot) {
      fail(`${label}: 编号 ${record.id} 不在 INDEX.json 里`)
    } else {
      if (slot.file !== label) fail(`${label}: INDEX 里 ${record.id} 的 file 写的是 ${slot.file}`)
      if (slot.status !== record.status) fail(`${label}: INDEX 状态(${slot.status}) 与文件状态(${record.status}) 不一致`)
      if (slot.code !== record.category?.code) fail(`${label}: INDEX 类目(${slot.code}) 与文件类目(${record.category?.code}) 不一致`)
    }
  }
}

// INDEX 里有 file 的编号，必须真的有对应文件
for (const [id, slot] of slotById) {
  if (slot.file && !scenarios.has(id)) fail(`INDEX: ${id} 标了 file，但找不到文件 ${slot.file}`)
  if (!slot.file && scenarios.has(id)) fail(`INDEX: ${id} 有文件，但 file 字段是 null`)
}

// 统计
const approved = [...scenarios.values()].filter((item) => item.record.status === 'approved').length
const drafts = [...scenarios.values()].filter((item) => item.record.status === 'draft').length
if (index?.corpus) {
  if (index.corpus.approvedCount !== approved) fail(`INDEX: approvedCount 写的是 ${index.corpus.approvedCount}，实际 ${approved}`)
  if (index.corpus.draftCount !== drafts) fail(`INDEX: draftCount 写的是 ${index.corpus.draftCount}，实际 ${drafts}`)
}

// ---------------------------------------------------------------------------
// 4. 模板
// ---------------------------------------------------------------------------
const templateDir = path.join(ROOT, 'templates')
const scenarioTemplate = path.join(templateDir, 'scenario-template-v1.json')
if (fs.existsSync(scenarioTemplate)) {
  validateInstance(scenarioSchema, readJson(scenarioTemplate), 'templates/scenario-template-v1.json')
}
const sourceTemplate = path.join(templateDir, 'data-source-entry-template-v1.json')
if (fs.existsSync(sourceTemplate)) {
  validateInstance(sourceSchema, readJson(sourceTemplate), 'templates/data-source-entry-template-v1.json')
}
const sourceExamples = path.join(templateDir, 'data-source-examples-v1.jsonl')
if (fs.existsSync(sourceExamples)) {
  for (const row of readJsonl(sourceExamples)) {
    validateInstance(sourceSchema, row.value, `templates/data-source-examples-v1.jsonl:${row.line}`)
  }
}

// ---------------------------------------------------------------------------
// 5. 密钥与隐私扫描
// ---------------------------------------------------------------------------
const SECRET_PATTERNS = [
  { name: 'API Key 形态的字符串', pattern: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: '密钥赋值', pattern: /AI_API_KEY\s*=\s*["']?[A-Za-z0-9_-]{16,}/ },
  { name: '私钥内容', pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ }
]
let scanned = 0
for (const file of walk(ROOT)) {
  if (!/\.(md|json|jsonl|mjs|js|ts|txt|ya?ml)$/i.test(file)) continue
  scanned += 1
  const text = fs.readFileSync(file, 'utf8')
  for (const rule of SECRET_PATTERNS) {
    if (rule.pattern.test(text)) fail(`${rel(file)}: 检测到${rule.name}，禁止写入语料库`)
  }
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
const stats = {
  schemaChecks: checkCount,
  categories: index?.categories?.length || 0,
  slots: declaredSlots,
  sources: sourceCount,
  scenarios: scenarios.size,
  approved,
  drafts,
  filesScanned: scanned
}

console.log('情景聊天语料库校验 v1')
console.log('─'.repeat(52))
console.log(`类目 ${stats.categories} · 编号 ${stats.slots} · 来源 ${stats.sources} · 情景 ${stats.scenarios}（approved ${stats.approved} / draft ${stats.drafts}）`)
console.log(`Schema 校验 ${stats.schemaChecks} 次 · 扫描文件 ${stats.filesScanned} 个`)

if (warnings.length) {
  console.log('')
  console.log(`⚠ 警告 ${warnings.length} 条`)
  for (const message of VERBOSE ? warnings : warnings.slice(0, 10)) console.log(`  · ${message}`)
  if (!VERBOSE && warnings.length > 10) console.log(`  … 其余 ${warnings.length - 10} 条用 --verbose 查看`)
}

if (errors.length) {
  console.log('')
  console.log(`✗ 失败 ${errors.length} 条`)
  for (const message of errors.slice(0, 50)) console.log(`  · ${message}`)
  if (errors.length > 50) console.log(`  … 其余 ${errors.length - 50} 条略`)
  console.log('')
  console.log('校验未通过。')
  process.exit(1)
}

console.log('')
console.log('✓ 通过：结构、编号、来源、许可、安全字段与密钥扫描均无问题。')
