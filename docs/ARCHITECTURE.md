# 架构说明

本项目的基础生成器能力是纯前端配置生成工作台。页面基于 Vue 3、Vite 和 Naive UI 负责可视化输入、实时预览、复制和下载；可选 AI 能力通过 Cloudflare Pages Function 代理上游接口；每类工具的配置生成逻辑保持独立，方便后续继续新增能力。

## 职责边界

- `App.vue` 负责 Naive UI 全局主题和 Provider。
- `src/components/*` 负责工作台壳层、Tab、功能块导航、表单渲染、输出预览、复制和下载。
- `src/generators/*` 负责各工具自己的状态、字段定义、动态块、配置文本和使用说明。
- `src/generators/loader.js` 负责把 JSON schema 转成响应式 state 和通用字段分组，并提供动态块 descriptor helper，供渐进数据驱动改造使用。
- `functions/api/ai.js` 是可选 Cloudflare Pages Function，用于"询问 AI"功能的服务端代理；基础生成器能力不依赖它。
- `docs/` 负责保存功能清单、架构说明和发布说明；机器可读字段模板与参考资料跟随对应生成器放在 `src/generators/<id>/` 下。
- 生成出来的 FRP、Dockerfile、Compose、Nginx、Caddy、Redis 配置都属于用户目标服务，不属于本项目自身的运行配置。

## 工作台结构

- 顶部 Tab 是生成器入口：`FRP`、`Dockerfile`、`docker-compose`、`Nginx`、`Caddy`、`Redis`。
- 左侧导航展示当前生成器的基础配置分组、动态功能块和新增入口。
- 中间表单由当前生成器提供字段模型，通用 Naive UI 表单控件负责展示输入控件。
- 右侧输出由当前生成器的 `generateConfig()` 和 `generateUsage()` 生成，并以“配置预览 / 使用说明”两个 Tab 展示。
- 所有生成结果都是目标服务的参考配置，不代表本项目自身的部署配置。

## UI 模块

通用 UI 统一放在 `src/components/` 下：

- `GeneratorWorkbench.vue`：顶部 Tab、三栏布局、功能块导航、复制和下载。
- `AIPanel.vue`：可选 AI 面板，调用同源 `/api/ai` 校验当前配置或把 AI 生成的 JSON 写回当前生成器表单。
- `FieldControl.vue`：把字段模型渲染为 Naive UI 输入控件。

UI 层只消费生成器契约，不拼接具体配置文本，也不写工具 mode 分支。

## 生成器模块

生成器统一放在 `src/generators/` 下：

- `index.js`：注册生成器列表。
- `loader.js`：schema 加载器，当前已用于 FRP、Dockerfile、Compose、Caddy、Nginx 和 Redis 的字段与默认值数据；`createDynamicBlockDescriptor()` 已用于 Compose 的 Service 动态块。
- `shared.js`：通用字符串、列表、TOML/YAML 辅助函数。
- `frp.js` + `frp/schema.json`：FRP `frps.toml` / `frpc.toml` 生成器，端类型、frps/frpc 基础字段、代理 mode 清单、mode 默认值、mode 字段和高级代理字段由 schema 提供；TOML section 组装、range 展开、visitor 关联等渲染逻辑保留在代码中。
- `dockerfile.js` + `dockerfile/schema.json`：Dockerfile 生成器，字段和默认值由 schema 提供。
- `compose.js` + `compose/schema.json`：docker-compose 生成器，service 默认值、字段和块文案由 schema 提供。
- `nginx.js` + `nginx/schema.json`：Nginx 生成器，全局生产参数、server、upstream、location 的默认值、字段和块文案由 schema 提供。
- `caddy.js` + `caddy/schema.json`：Caddyfile 生成器，全局 options、site、handle 的默认值、字段和块文案由 schema 提供。
- `redis.js` + `redis/schema.json`：Redis 生成器，常用 `redis.conf` 字段、默认值和选项由 schema 提供。

每个生成器独立维护自己的状态、字段、动态功能块和输出逻辑，避免把不同工具的规则混在一起。

## 生成器接口

每个生成器返回同一组能力：

- `id`、`title`、`summary`、`icon`、`language`
- `fileName()`：当前下载文件名。
- `panelTitle()`、`panelLead()`：表单标题和说明。
- `getFieldGroups()`：固定表单分组。
- `getBlocks()`：可新增/删除的动态配置块。
- `generateConfig()`：输出配置文本。
- `generateUsage()`：输出使用说明。
- `getReference()`：可选 AI 校验上下文，返回该工具的结构化参考资料。
- `applyAIState(json)`：可选 AI 生成写回入口，必须只接受本生成器已知字段；FRP 当前仅开放 AI 校验，不开放口述生成。

新增生成器时，只需要实现这个接口，并在 `src/generators/index.js` 注册。

## 字段模型

通用字段支持：

- `text`：单行文本。
- `number`：数字输入。
- `select`：下拉选项。
- `toggle`：开关。
- `textarea`：多行文本，适合 headers、environment、键值对。

字段可通过 `when` 控制显示条件。`when` 可以是布尔字段名、`{ key, value }`、`{ all: [...] }`、`{ any: [...] }` 条件，或自定义函数。

## 数据驱动改造方向

当前 UI 已经消费统一字段模型。FRP 的端类型、frps/frpc 基础默认值和基础字段、代理 mode 清单、mode 默认值、mode 字段和高级代理字段来自 `src/generators/frp/schema.json`；Dockerfile 的字段、默认值和选项来自 `src/generators/dockerfile/schema.json`；Compose 的 service 默认值、字段和块文案来自 `src/generators/compose/schema.json`；Nginx 的全局生产参数、server、upstream、location 默认值、字段和块文案来自 `src/generators/nginx/schema.json`；Caddy 的全局 options、site、handle 默认值、字段和块文案来自 `src/generators/caddy/schema.json`；Redis 的常用 `redis.conf` 字段、默认值和选项来自 `src/generators/redis/schema.json`。后续按 [REFACTOR.md](./REFACTOR.md) 继续推进 JSON schema 驱动：把可序列化的数据迁到 schema，`generateConfig()` / `generateUsage()` 等跨字段、循环和复杂渲染逻辑继续保留在代码中。

## 后续扩展约定

- 新工具优先新增独立生成器模块，不直接修改已有生成器逻辑。
- 通用 UI 能复用时扩展 `src/components/` 或共享字段能力；工具规则放在对应生成器里。
- 字段模板和参考资料跟随对应生成器放在 `src/generators/<id>/` 下，保持工具模块自包含。
- 生成配置应保留中文注释，并尽量保证复制后可作为目标服务的参考配置运行或改造。
- 使用说明要明确“在目标项目/目标服务中执行”，避免让用户误以为这些命令用于部署当前生成器仓库。
