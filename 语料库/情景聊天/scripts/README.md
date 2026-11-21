# scripts

## `validate-corpus.mjs`

零依赖校验器，只用 Node 内置模块。不联网、不读 `.env`、不改文件。

```powershell
node "语料库\情景聊天\scripts\validate-corpus.mjs"
node "语料库\情景聊天\scripts\validate-corpus.mjs" --verbose
```

退出码：`0` 通过 / `1` 有错误。

## 它怎么工作

1. 读 `schemas/` 下三个 JSON Schema；
2. 用一个手写的 JSON Schema 子集校验器（支持 `$ref` / `type` / `enum` / `const` / `pattern` / `required` / `additionalProperties` / `items` / `anyOf` / `oneOf` / `allOf`）校验 `INDEX.json`、三个来源桶、每个情景文件、模板；
3. 做跨文件检查：编号 / 目录 / 文件名 / 索引 / 状态 / 来源引用 / 许可桶 / 上线门槛 / 对话轮次 / 分支 / 策略引用；
4. 扫描 `sk-` 长串、`AI_API_KEY=` 赋值、私钥头。

完整检查清单见 `docs/06-校验方法-v1.md`。

## 为什么不用 ajv

- 项目没有运行时依赖，语料校验不该成为第一个；
- 只需要 JSON Schema 的一个子集，手写 200 行足够；
- 报错信息可以写成中文、带字段路径，比通用库更贴近本库的字段语义。

## 扩展

加一条规则时：

1. 先想清楚它属于“格式”“结构”“许可”还是“安全”；
2. 加在对应段落，不要把所有逻辑堆到 `main`；
3. 同时更新 `docs/06-校验方法-v1.md` 的检查清单；
4. 用一个**故意改坏**的副本验证它真的会报错（见该文档第 5 节）。

## 不做

- 不自动修复文件（避免脚本偷偷改内容）；
- 不自动生成语料；
- 不调用模型；
- 不访问网络。
