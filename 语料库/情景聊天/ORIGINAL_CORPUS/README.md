# ORIGINAL_CORPUS：原创语料

本目录放**自己写**的情景语料：原创台词、原创分支、原创策略示例。每个情景一个 JSON 文件，结构见 `schemas/scenario.schema.json`。

## 命名

```text
ORIGINAL_CORPUS/<类目代码>/<编号>-<标题>-v<主版本>.json
例：ORIGINAL_CORPUS/FAM/FAM-001-父母催婚-v1.json
```

- 编号必须和文件名、`id` 字段、`INDEX.json` 三处一致。
- 标题改动不换文件名；结构或定位大改才升 `v2`。
- 一个情景一个文件，不要把 8 个情景塞进一个 JSON。

## 状态

目录里的文件只允许是：`draft`、`in_review`、`blocked`、`rejected`、`deprecated`。
**`approved` 的文件必须移到 `PRODUCTION_APPROVED/`**，原目录不留副本，避免两份真相。

## 写作底线

1. 只写“施压、打断、否定、转移责任”，不写辱骂、威胁、暴力、创伤细节。
2. 对方要有自己的道理，不能写成等着被主角说服的工具人。
3. 替身台词要短、口语、能直接说出口，不写谈判课金句。
4. 允许这次没谈拢；不承诺“练完就能解决”。
5. 引用外部资料必须先在 `REFERENCE_LIBRARY` 登记，并把 `sourceIds` 填上。

## 每个类目一个子目录

| 目录 | 类目 | 编号段 |
|---|---|---|
| `FAM/` | 家庭 | FAM-001 ~ FAM-008 |
| `WRK/` | 职场 | WRK-001 ~ WRK-008 |
| `REL/` | 亲密关系 | REL-001 ~ REL-008 |
| `FRD/` | 朋友 | FRD-001 ~ FRD-008 |
| `SELF/` | 自我 | SELF-001 ~ SELF-008 |
| `CNS/` | 消费 | CNS-001 ~ CNS-008 |
| `CARE/` | 照护 | CARE-001 ~ CARE-008 |
| `DIG/` | 数字生活 | DIG-001 ~ DIG-008 |
