import fs from 'node:fs'

const root = 'C:/Users/汪晨/Desktop/心晴'
const input = `${root}/docs/persona/special-scenarios-results-v26.json`
const output = `${root}/docs/persona/special-scenarios-review-v26.md`
const data = JSON.parse(fs.readFileSync(input, 'utf8'))
const rows = data.results || []
const violations = []
const failed = []

for (const row of rows) {
  const mustNot = Array.isArray(row.expect?.must_not) ? row.expect.must_not : []
  const hits = mustNot.filter((text) => text && row.reply.includes(text))
  if (hits.length) violations.push({ ...row, hits })
  if (row.status !== 200 || !row.reply || row.error) failed.push(row)
}

const lines = [
  '# 特殊场景 30 条：v26 复核',
  '',
  `运行时间：${data.ranAt || ''}`,
  `版本：${data.version || ''}`,
  '',
  '## 汇总',
  '',
  `- 总数：${rows.length}`,
  `- 请求失败/空回复：${failed.length}`,
  `- 命中 must_not：${violations.length}`,
  '',
  '## must_not 命中',
  ''
]

if (!violations.length) lines.push('无。')
for (const row of violations) {
  lines.push(`### ${row.id} ${row.title}`)
  lines.push(`- 用户：${row.user}`)
  lines.push(`- 回复：${row.reply}`)
  lines.push(`- 命中：${row.hits.join('；')}`)
  lines.push('')
}

lines.push('## 全部回复', '')
lines.push('| id | 风险 | 回复 |')
lines.push('|---|---|---|')
for (const row of rows) {
  const reply = String(row.reply || row.error || '').replace(/\n/g, ' ').replace(/\|/g, '｜')
  lines.push(`| ${row.id} | ${row.riskLevel || row.status} | ${reply} |`)
}

fs.writeFileSync(output, lines.join('\n'), 'utf8')
console.log(JSON.stringify({
  total: rows.length,
  failed: failed.map((row) => row.id),
  violations: violations.map((row) => ({ id: row.id, hits: row.hits }))
}, null, 2))
