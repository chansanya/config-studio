# 数据驱动改造方案

> 把配置项从「硬编码在 generator」改造为「JSON schema 驱动」。本文件记录现状、预期、范围边界、工作量与验收标准。
> 架构基础见 [ARCHITECTURE.md](./ARCHITECTURE.md)；本文件只讲「改什么、为什么、改完什么样」。

## 背景与目标

项目是 FRP / Dockerfile / Compose / Nginx / Caddy / Redis 等工具的可视化配置生成器。改造前每类工具的字段定义、默认值、选项、mode 清单都硬编码在各自的 `createXxxGenerator()` 内（`state` / `groups` / `fields` / `modeDefaults`）；当前已迁出主要可序列化数据，保留配置文本生成逻辑在各工具模块中。

**目标（务实档，~60% 数据驱动）**：把字段定义、默认值、options、comments 等"数据部分"外置成 JSON，由通用加载层渲染表单；生成逻辑（拼接配置文本）保留为代码。

- ✅ 要达成：加/改字段只动 JSON 不碰代码；配置项有单一数据源。
- ❌ 不追求：100% 数据驱动——生成逻辑含循环 / 跨集合关联，schema 描述不了，强行 DSL 化 ROI 极低。

## 现状（量化实测）

> 当前进度：UI 已迁移到 Naive UI 三栏工作台；`src/generators/loader.js` 已落地，并已提供 `createDynamicBlockDescriptor()` / `removeCollectionItem()` 作为通用动态块描述器；Compose 的 Service 动态块已接入该 helper。FRP 的端类型、frps/frpc 基础默认值和基础字段、代理 mode 清单、mode 默认值、mode 字段和高级代理字段已迁移到 `src/generators/frp/schema.json`；Dockerfile 的字段、默认值和选项已迁移到 `src/generators/dockerfile/schema.json`；Compose 的 service 默认值、字段和块文案已迁移到 `src/generators/compose/schema.json`；Nginx 的全局生产参数、server、upstream、location 默认值、字段和块文案已迁移到 `src/generators/nginx/schema.json`；Caddy 的全局 options、site、handle 默认值、字段和块文案已迁移到 `src/generators/caddy/schema.json`；Redis 的常用 redis.conf 字段、默认值和选项已迁移到 `src/generators/redis/schema.json`。配置文本生成逻辑仍保留在各自生成器代码中。

| generator | 代码行数 | schema 行数 | 已迁出数据 | 仍留代码 |
|---|---:|---:|---|---|
| frp | 880 | 641 | 端类型、frps/frpc 基础字段、18 个 mode、mode 默认值、mode 字段、高级字段 | TOML root/section 组装、插件映射、range 展开、visitor 关联 |
| nginx | 482 | 417 | 全局生产参数、server、upstream、location 默认值、字段、块文案 | server/upstream/location 关联、location URL 摘要、nginx.conf 拼装 |
| caddy | 371 | 356 | 全局 options、site、handle 默认值、字段、块文案 | site/handle 关联、ACME 邮箱扫描、Caddyfile 拼装 |
| compose | 297 | 281 | service 默认值、字段、块文案；Service 动态块契约由 `createDynamicBlockDescriptor()` 拼装 | service YAML、网络收集、固定 IP/IPAM 输出 |
| dockerfile | 266 | 167 | 固定字段、默认值、选项 | Dockerfile 指令顺序、多阶段分支、命令生成 |
| redis | 120 | 320 | 常用 redis.conf 字段、默认值、选项 | 指令顺序、多行 save 规则、条件指令拼装 |

- FRP proxy mode 的表单数据已迁到 schema；`buildProxy`、`buildAdvanced`、`buildVisitor` 等跨字段/多 section 逻辑继续保留在 `src/generators/frp.js`。
- `loader.js` 当前承担 schema state/fieldGroups 加载，以及通用动态块 descriptor 拼装；复杂的 item 创建、跨集合关联和配置渲染仍保留在各 generator 中。
- `src/generators/*/reference-doc.json` 是手工整理的知识库，当前由各 generator 的 `getReference()` 暴露给 AI verify / generate 上下文。
- 字段契约：通用 UI 用 `key/label/hint/type/options/when/min/max`；`when` 支持 string、`{ key, value }`、`{ all: [...] }`、`{ any: [...] }`，并保留 function 兼容旧代码。

## 预期（改造后）

新增三部分：

1. **`src/generators/loader.js`**：已把 schema 转成 `reactive state` + `fieldGroups`，并已提供通用动态块描述器，当前 Compose 已接入；后续继续扩展为 schema 驱动的 item 创建和 title/summary 模板。
2. **`src/generators/<name>/schema.json`**：每个 generator 的字段定义、默认值、options、mode 元数据、comments 映射；参考资料同目录使用 `reference-doc.json` / `reference-doc.md`。
3. **`generateConfig()` / `renderXxx()`**：保留为代码（生成逻辑不数据化）。

统一 form schema：

```jsonc
{ "key": "nodeVersion", "label": "Node 镜像", "type": "text",
  "default": "22-alpine", "hint": "例如 22-alpine",
  "when": { "key": "runtime", "value": "nginx" },
  "options": [], "min": 0, "max": 65535 }
```

- 新增 schema 的 `when` 使用 string / object / all / any 形式，保持 JSON 友好；function 仅作为兼容能力保留。
- 动态块分两步推进：当前先由 `createDynamicBlockDescriptor()` 统一工作台契约和删除行为；后续再把 `itemFactory` / `titleTemplate` / `summaryTemplate` 等纯数据部分推进到 schema，减少每个 generator 手写样板。

**改造前后，每个 generator 的 `generateConfig()` 输出必须 byte 级一致**——这是验收红线，不能破坏用户已有的复制习惯。

## 范围边界（能 / 不能数据化）

**能（外置 JSON）**：字段定义、默认值、options、comments 映射、mode 元数据、frp.pluginMap（8 插件）、group / block 元信息。

**不能（硬墙，留代码）**——命令式查询 / 循环 / 跨 state 耦合，schema 描述不了：

- **frp**：`buildProxy`（7 路 switch）、`buildAdvanced`（6 分支）、range 批量展开（循环最多 20 段）、stcp/xtcp/p2p/sudp 双 section 耦合（proxy+visitor）、visitor.serverName 拼 client.user 前缀。
- **nginx**：server↔location 按 `firstServerName` 跨集合关联过滤。
- **caddy**：site↔handle 按 host 关联 + ACME 邮箱跨 site 扫描。

## 工作量与顺序

| 模块 | 人天 | 说明 |
|---|---|---|
| loader + 通用块管理器（基建，一次性） | 1.5 | 已完成基础 descriptor helper，Compose 已接入；复杂块继续渐进迁移 |
| dockerfile | 0.5 | 试点，0 块、纯字段 |
| compose | 1 | YAML helper 已就绪 |
| caddy | 1.5 | 2 块 4 分支，ACME 扫描留代码 |
| frp | 2–3 | 18 mode、pluginMap、range/双 section 留代码 |
| nginx | 1.5–2 | 跨集合关联留代码 |
| **合计** | **~8–9** | |

迁移顺序（由易到难，先跑通闭环再啃硬骨头）：**dockerfile（试点）→ compose → caddy → frp → nginx**。

## 验收

1. `npm run build` 通过。
2. **黄金基准 diff**：改造前冻结每个 generator 各 mode 的默认输出，改造后逐项 diff 为空（byte 级）。
3. 浏览器手测：Tab 切换、mode 切换、块增删、字段 `when` 显隐。
4. 顺手对照 `src/generators/*/reference-doc.json` 补齐缺失字段。

## 风险

- 数据驱动上限约 **60%（务实）/ 85%（深度）**，**100% 不可行**——nginx/caddy 跨集合关联、frp 双 section/range 展开是硬墙。
- 验收依赖黄金基准：generator 使用 Vite 解析规则，裸 `node` 不一定能正确处理目录导入和扩展名；基准应通过 Vite SSR loader、vite-node 或 vitest 运行。
