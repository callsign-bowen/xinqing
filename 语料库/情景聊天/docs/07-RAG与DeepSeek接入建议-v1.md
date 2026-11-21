# 接入 DeepSeek 与 RAG 的建议 v1

状态：**建议，未实施**。本阶段没有改动任何调用逻辑。
前置：语料 ≥ 20 条 `approved`、FAM-001 过审、校验脚本纳入流程。

---

## 1. 先说不做什么

| 不做 | 原因 |
|---|---|
| 微调模型 | 64 条量级远不够；调完不可解释、不可回滚 |
| 上向量数据库 | 64 条用关键词 + 结构化过滤就够；引入依赖与运维成本不成比例 |
| 客户端全量加载语料 | 语料含未审内容风险、包体变大、版本回滚困难 |
| 让模型自由总结语料 | 会把“示例”变成“标准答案”，也会把 `research_only` 的话带进产物 |
| 现在就改 `/api/chat` | 普通聊天与情景演练是两条链路，混在一起会互相污染人格 |

## 2. 推荐形态：服务端“结构化检索 + 提示词注入”

```text
浏览器                     account-service                       DeepSeek
   │  POST /api/scenario/chat     │                                  │
   │  {scenarioId, message,        │                                  │
   │   difficulty, history}        │                                  │
   ├──────────────────────────────>│                                  │
   │                               │ 1. riskOf(message) 高风险？       │
   │                               │    → 直接返回 FALLBACK，不检索     │
   │                               │ 2. 按 scenarioId + difficulty     │
   │                               │    取 1 条情景 + 2–3 条策略        │
   │                               │ 3. 拼 system prompt（见 §4）       │
   │                               │ 4. deepseekReplyStream(...)       │
   │                               ├─────────────────────────────────>│
   │   SSE delta / done            │<─────────────────────────────────┤
   │<──────────────────────────────┤                                  │
```

复用现有能力，不新建模型通道：

- 调用沿用 `deepseekReplyStream()` / `deepseekComplete()`；
- 高风险短路沿用 `riskOf()` 与 `FALLBACK_REPLY.high`；
- 流式协议沿用现有 SSE 的 `delta` / `done` / `error` 帧。

## 3. 检索：先用“键 + 词”，别急着上向量

### 3.1 检索键

语料里已声明 `usage.retrieval.keys`。第一版只用四个：

```text
category.code === 当前情景类目
dialogue.turns[].emotion / conflict.initial   → intensity 接近
strategies[].when 与用户这句话的意图匹配
voice.sampleLines / strategies[].example 做关键词召回
```

### 3.2 召回什么

| 内容 | 数量 | 用途 |
|---|---|---|
| 当前情景本身 | 1 条 | 人物、关系、语气、禁区 |
| 同 `subcategory` 的其他已审情景 | 0–2 条 | 同一类难话的另一种走向 |
| `strategies` | 2–3 条 | 结构参考，不照抄 |
| `REFERENCE_LIBRARY` | **不召回** | 研究资料只在写作期用，运行时不碰 |

### 3.3 排序

```text
score = 2 × 同子类 + 1 × 冲突强度接近 + 1 × 关键词命中 + 0.5 × 优先级
```

同分时取 `version` 更高的；再同分取 `id` 小的，保证可复现。

### 3.4 什么时候才考虑向量

同时满足再考虑：已审语料 ≥ 60 条、关键词召回的人工评估命中率 < 60%、有稳定的 embedding 预算。即便上了向量，结构化过滤仍然要保留。

## 4. 提示词怎么拼

### 4.1 结构

```text
[1] 角色与规则（现有 standInPrompt 的主体，不动）
[2] 当前情景卡（只放允许模型看的字段）
[3] 2–3 条策略示例（标注“只学结构，不照抄”）
[4] 用户这句话
```

### 4.2 当前情景卡放什么

| 放 | 不放 |
|---|---|
| `counterpart.role` / `relation` / `powerDistance` | `review` 整块 |
| `persona.surfaceWant` / `underlyingNeed` | `sources` 的内部备注 |
| `voice.register` / `sentenceStyle` / `forbidden` | `dialogue` 全文（避免背台词） |
| `opening.openings[difficulty]` | 其他难度的开场白 |
| `strategies[].when` / `example` / `avoid` | `emotionalState` 的数值 |

### 4.3 示例片段

```text
【当前情景】妈妈，母女，长辈，家庭话语权更高。
她嘴上要的是“你到底什么时候定下来”，真正怕的是“你以后一个人没人管”。
她说话短、爱比较、会用“为你好”收尾。
禁区：不辱骂、不威胁断绝关系、不拿病或死施压。

【可以参考的接法｜只学结构，不照抄】
1. 先接住关心，再说自己的节奏。例：我知道你着急，我这两年先把工作稳住。
2. 不接比较，把话拉回自己。例：表姐有表姐的过法，我这边慢一点，我心里有数。
3. 承认担心，给一个具体安排。例：真到需要人搭把手，我会开口。

【这一轮对方说】……
```

### 4.4 预算

- 情景卡 ≤ 400 tokens，策略 ≤ 300 tokens，总计 ≤ 800；
- 超出就裁策略，不裁规则；
- 每次请求带上 `corpusVersion`，响应原样返回，便于复现与回滚。

## 5. 安全闸门（先于检索）

```text
用户输入
  → riskOf(message) === 'high'  → 不检索、不生成，返回 FALLBACK_REPLY.high
  → 命中 safety.hardStop        → 退出角色 + exitLine + afterExit
  → 命中 safety.stopSignals     → 弹安全卡片，暂停演练
  → 其他                        → 正常检索与生成
```

三条硬规则：

1. **安全判断不能依赖模型。** 词表短路必须在服务端、在检索之前。
2. **检索结果不能覆盖安全规则。** 语料里没有“可以辱骂”的例外。
3. **高风险时不拼语料。** 减少任何“继续演下去”的暗示。

## 6. 接口草案（第二期）

```text
POST /api/scenario/start
  { scenarioId, difficulty, goal?, duration? }
  → { sessionId, opening, corpusVersion }

POST /api/scenario/chat         (SSE)
  { sessionId, scenarioId, message, history[] }
  → delta… → done { reply, riskLevel, usedStrategies[], corpusVersion }

POST /api/scenario/debrief
  { sessionId, messages[] }
  → { closest, takeaway, nextTry, safety }
```

约束：

- `sessionId` 服务端生成，客户端不能指定 `scenarioId` 以外的检索参数；
- `usedStrategies` 只回 `S*` 编号，不回语料原文；
- 不复用 `/api/chat`，避免诺的人格与替身人格串味（现有设计文档已明确）。

## 7. 版本、缓存与回滚

| 项 | 做法 |
|---|---|
| 语料版本 | `INDEX.json` 的 `corpus.version` + 单条 `version`，拼成 `corpusVersion` |
| 提示词缓存 | 以 `corpusVersion + scenarioId + difficulty` 为 key，进程内 LRU 即可 |
| 回滚 | 语料 `deprecated` → 重新生成缓存 key → 旧 key 自然失效 |
| 灰度 | 先只对内部账号开 `scenario_chat` 的检索，观察 2 周 |

## 8. 怎么判断接得对不对

不看“回复更长”，看四件事：

1. **说出口率**：用户自评“这句我愿意在现实里说”，目标 ≥ 60%。
2. **串味率**：演练里出现“诺”的口吻（分析、建议、安慰模板），目标 < 5%。
3. **结构使用率**：生成结果能对上某条 `strategy` 的比例，目标 70–85%（太高说明在背模板）。
4. **安全**：高风险是否正确短路；有没有把 `research_only` 内容带进输出。

每轮改语料后，用固定 20 条输入跑一遍人工盲评，记录版本号。

## 9. 分阶段清单

| 阶段 | 内容 | 前置 |
|---|---|---|
| A（现在） | 语料库 + 校验，不接线 | 已完成 |
| B | 写满 20 条 P0，全部 `approved` | FAM-001 过审 |
| C | 离线编译脚本：`PRODUCTION_APPROVED` → `scenario-corpus.generated.ts` | B 完成 |
| D | 服务端 `/api/scenario/*` + 关键词检索 | C 稳定 2 周 |
| E | 关键词 + 结构化打分，人工评估 | D 有真实使用数据 |
| F | 视评估结果决定是否上向量 | E 命中率不达标 |

**每一阶段都可以停。停在上一个阶段不会产生技术债。**

## 10. 隐私

- 用户原话只进 `chat_messages` 与本地历史，**不回写语料库**。
- 若要用真实对话改进语料，必须先脱敏、取得同意、只提取结构，并登记到 `RAW_RESEARCH`。
- 日志只记 `scenarioId` / `corpusVersion` / `riskLevel` / 耗时，不记原文。
- API Key 永远只在 `account-service/.env`，不进入任何语料、日志、前端 bundle。
