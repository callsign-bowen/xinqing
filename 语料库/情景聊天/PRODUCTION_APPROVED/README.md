# PRODUCTION_APPROVED：正式审核通过的语料

**当前为空。这是有意为之。**

在人工审核完成之前，任何语料都不允许进入这里，也不会被接入正式聊天。第一期只搭架子，不放进未审核内容。

## 进这里的门槛

必须同时满足（校验脚本会自动核对）：

1. `review.status === "approved"`，文件内与 `INDEX.json` 一致；
2. 五项检查 `safety / license / language / realism / bias` 全部 `pass`；
3. 审核人里至少一位不是作者；
4. 来源为 `original`，或只引用 `commercial_ok` 桶的资料；
5. `node 语料库/情景聊天/scripts/validate-corpus.mjs` 通过。

## 目录

```text
PRODUCTION_APPROVED/
├─ FAM/  WRK/  REL/  FRD/  SELF/  CNS/  CARE/  DIG/
```

分类子目录**在第一次有语料通过审核时创建**，并同步更新 `INDEX.json` 的 `file` 与 `status`。这样不会出现一排空目录，也不会出现“目录在、内容是草稿”的假象。

## 规则

- 这里只放 `approved` 文件；`draft` 留在 `ORIGINAL_CORPUS/`，两份真相最容易出事。
- 只增不改：内容更新升版本号（`-v2`），旧版本标记 `deprecated` 后再下线。
- 每个文件必须能追溯到 `sources.sourceIds`，没有来源的语料不许上线。
- 运行时不直接读这个目录的原始 JSON，而是由适配层生成带版本号的提示词片段（见 `docs/07-RAG与DeepSeek接入建议-v1.md`）。

## 回滚

1. 把问题文件的 `review.status` 改为 `deprecated`；
2. 从 `PRODUCTION_APPROVED/` 移回 `ORIGINAL_CORPUS/` 并加审核备注；
3. 更新 `INDEX.json`；
4. 跑一次校验脚本，确认没有悬空引用。
