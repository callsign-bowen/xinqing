# REFERENCE_LIBRARY：研究参考资料与来源登记

这里回答两个问题：**这条语料是从哪来的**，以及**它允许被怎么用**。

## 三个桶，物理隔离

| 文件 | 授权等级 | 能做什么 | 不能做什么 |
|---|---|---|---|
| `sources-commercial-ok-v1.jsonl` | `commercial_ok` | 可改写、可商用、可进正式库 | — |
| `sources-research-only-v1.jsonl` | `research_only` | 只读、只提炼结构、只做研究 | 不能整段复制，不能商用，不能进正式库 |
| `sources-restricted-v1.jsonl` | `restricted` | 只看节奏与结构 | 不能复制、不能训练、不能衍生商用 |

**默认桶是 `research_only`。** 任何新资料先登记进研究桶；要升级到商业可用，必须补齐许可证证据并由许可审核签字，不能因为“反正是公开网页”就自动认定可商用。

## 一条记录怎么填

字段定义见 `schemas/source-registry.schema.json`，模板见 `templates/data-source-entry-template-v1.json`，三种授权各有一条示例：`templates/data-source-examples-v1.jsonl`。

最少要写清：

- `id`：`SRC-<三个大写字母>-<三位数字>`，全局唯一，永不复用。
- `name` / `author` / `platform`：正式名称，不写“某篇文章”。
- `url` 与 `localPath`：至少一个非空。内部资料写相对项目根目录的路径。确实还没查到位置时，`verification.status` 必须是 `pending`；若已决定不用（`usageStatus: excluded`），可以都不填。
- `license` + `licenseClass`：许可证名称要具体（`CC-BY-4.0`、`copyright-all`、`internal-owned`、`unknown-pending-verification`）。
- `commercialUse` / `modification`：**布尔值必须和许可证一致**，不确定就写 `false`。
- `verification`：`pending` 表示还没核对；`pending` 的记录不许被 `PRODUCTION_APPROVED` 引用。
- `usageStatus`：`reference_only` → `draft_cited` → `approved_derived`，或 `excluded`。

## 判断顺序

```text
这是谁写的？          → 找不到作者 → restricted
许可证写了吗？        → 没写 / 写着“保留所有权利” → restricted
是 CC BY / CC0 / 自有？→ 是 → commercial_ok（仍需登记证据）
是 CC BY-NC / 论文？  → research_only
是影视、歌词、小说？  → restricted（只允许看结构）
```

## 硬规则

1. **研究资料不等于商业可用资料。** 两个桶之间没有自动升级通道。
2. `research_only` 与 `restricted` 的原文不得整段出现在 `ORIGINAL_CORPUS` 里。
3. 引用必须能追到 `sourceIds`；查不到来源的语料一律 `draft`。
4. 记录只增不改：许可证变化时追加一条 `notes` 并改 `verification`，不覆盖历史判断。
