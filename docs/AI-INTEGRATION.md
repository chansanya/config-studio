# AI 集成方案

> 在"参考输出"面板加"询问 AI"能力（验证配置 + 口述生成配置填表单）。KEY 全程在后端环境变量，浏览器永不接触。

## 功能

参考输出面板的"询问 AI"按钮（右侧抽屉，不塞进输出 Tabs）：

- **验证配置**：把当前生成的配置文本 + 该工具的 reference 规范发给 AI → AI 返回 markdown 校验结果（通过/问题清单）。
- **口述生成**：用户用自然语言描述需求 → AI 按该工具的 schema 生成配置 JSON → 自动填回表单。

## 架构

```
浏览器  ──POST /api/ai (同源)──►  Cloudflare Pages Function (functions/api/ai.js)
                                          │  从 env 读 AI_BASE_URL + AI_API_KEY
                                          ▼
                                   上游 OpenAI 兼容 /chat/completions
```

- **KEY 只在 Pages Function 的 env**（本地 `.dev.vars` / 生产 Pages secret），浏览器**永不接触** KEY。
- **system prompt 模板在后端 Function**（`functions/api/ai.js` 的 `SYSTEM_PROMPTS`），不进前端产物——更严格、防前端篡改。
- 前端只同源 `fetch('/api/ai')`，**绕 CORS**（自建/代理 AI 端点也不怕）；后端会校验同源请求头并限制请求体大小，减少公开端点被脚本滥用。

## 安全

- `VITE_AI_KEY` **禁用**——Vite 的 `VITE_*` 变量构建期进 `dist/` 产物，公网可见。
- KEY 走环境变量：`.dev.vars`（本地，`.gitignore` 已忽略）+ Pages secret（生产）。
- **防提示词注入**：用户输入只作 `user` message，`system` prompt 固定，用户输入绝不拼进 system。
- **generate 模式**：上游 `response_format: json_object` + 前端 `parseAIJSON` 去代码块兜底 + 各 generator `applyAIState` 做**字段白名单过滤**（只接已知 key，类型转换）→ 解析失败**只提示不写入**，不污染现有表单。

## 配置

### 本地开发

```bash
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars 填入:
#   AI_BASE_URL=https://api.openai.com/v1   (OpenAI 兼容；推荐不带 /chat/completions，函数也兼容完整 chat/completions 地址)
#   AI_API_KEY=sk-...
#   AI_MODEL=gpt-4o-mini                     (可选)
npm run pages:dev   # wrangler pages dev 自动加载 .dev.vars, 启用 functions/api/ai.js
```

> `npm run dev`（纯 Vite）**不启动** Pages Function，AI 功能不可用。本地测 AI 必须用 `pages:dev`。

### 生产（Cloudflare Pages）

```bash
npm run pages:env
npm run pages:secrets:list
npm run pages:deploy
```

`pages:env` 会把 `.dev.vars` 里的 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL` 批量同步为 Cloudflare Pages secret。修改后需要重新部署一次。

## 文件清单

| 文件 | 状态 | 说明 |
|---|---|---|
| `functions/api/ai.js` | ✅ 已建 | Pages Function 代理（读 env、组装 system prompt、转发、回流 `{mode,content}`） |
| `.dev.vars.example` | ✅ 已建 | 本地 env 模板 |
| `.gitignore` | ✅ 已改 | 补 `.dev.vars` |
| `src/composables/useAI.js` | ✅ 已建 | 前端封装：`askAI` / `parseAIJSON` / `coerceByType` |
| `src/components/AIPanel.vue` | ✅ 已建 | AI 助手抽屉内容（验证/生成 UI） |
| `src/components/GeneratorWorkbench.vue` | ✅ 已改 | 加"询问 AI"按钮 + NDrawer |
| `src/generators/*.js` | ✅ 已改 | 各加 `getReference()`；除 FRP 外支持 `applyAIState(json)` |
| `src/generators/loader.js` | ✅ 已改 | 加 `applyStateFromSchema`（静态字段白名单写回） |

## 集成点

- **入口**：`GeneratorWorkbench.vue` 的 `.preview-actions` 按钮组末尾加"询问 AI" `NButton` → 打开右侧 `NDrawer`（不进输出 NTabs，避免与"生成产物"语义混淆）。
- **reference 获取**：各 generator 暴露 `getReference()`。参考资料位于 `src/generators/<id>/reference-doc.json`，用于 AI verify / generate 上下文。
- **state 写回**：
  - 静态字段 generator（Dockerfile / Redis）：`applyAIState` 调 `loader.applyStateFromSchema(state, schema, json)`，只写 schema 已知字段。
  - 动态块 generator（Compose / Nginx / Caddy）：`applyAIState` 内部按已知字段重建 service / upstream / server / location / site / handle 数组。
  - FRP：当前支持 AI 校验；因客户端功能块和 visitor 组合结构复杂，口述生成暂不开放。
- **schema 作 generate 上下文**：`import schema from "./<id>/schema.json"`，把 `state` 键 + `fields` 结构喂给 AI。FRP 有 schema，但 generate 仍先禁用，避免 AI 回填破坏复杂代理块。

## 边界

- **GitHub Pages 部署**（`.github/workflows/github-pages.yml`）无 serverless → `functions/` 在这条链路无效 → **AI 功能仅在 Cloudflare Pages 部署可用**。UI 需优雅降级（检测 `/api/ai` 不可达时给通用不可用提示）。
- **普通 `npm run dev`** 只启动 Vite，不启动 Pages Function → AI 功能不可用；本地测 AI 用 `npm run pages:dev`。
- **FRP generate 暂不支持**：verify 可用 `src/generators/frp/reference-doc.json` 校验当前配置；口述生成按钮在 UI 中禁用。
- **Redis 已支持 AI verify / generate**：通过 `src/generators/redis/reference-doc.json` 和 `src/generators/redis/schema.json` 写回。

## 验证

- `.dev.vars` 填 KEY → `npm run pages:dev` → `curl -X POST http://localhost:8788/api/ai -H 'Origin: http://localhost:8788' -H 'Content-Type: application/json' -d '{"mode":"verify","tool":"dockerfile","config":"FROM node:22\\n","reference":{}}'` 通。
- `grep -r "AI_API_KEY\|sk-" dist/` 为空（KEY 不进产物）。
- GitHub Pages 部署下点"询问 AI" → 友好提示不可用。
