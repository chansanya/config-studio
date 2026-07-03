# 生成器页面发布文档

本项目的基础配置生成器是纯前端 Vue 应用，构建产物位于 `dist/`，不需要数据库、KV 或用户自建后端。可选的"询问 AI"能力需要 Cloudflare Pages Functions 代理 `/api/ai`，用于在服务端安全读取 AI API Key。

> 本文档只描述如何发布这个可视化配置生成器页面。应用中生成的 FRP、Dockerfile、Compose、Nginx、Caddy、Redis 配置是给目标服务使用的参考配置，不是本项目自身的部署方案。

换句话说，本文档里的 Cloudflare Pages、Wrangler Pages、GitHub Pages 是为了让用户能打开这个生成器页面；页面右侧输出的配置文件应复制到用户自己的目标项目或目标服务器中使用。

## 本地验证

```bash
npm install
npm run build
npm run preview
```

普通 `npm run dev` / `npm run preview` 只验证纯前端生成器能力，不会启动 Pages Function，因此"询问 AI"会提示接口不可用。

使用 Cloudflare Pages 本地预览：

```bash
npm run pages:dev
```

`pages:dev` 会先执行 `npm run build`，然后运行：

```bash
XDG_CONFIG_HOME=.wrangler npx wrangler pages dev ./dist --compatibility-date=2026-07-02
```

如需本地验证 AI 功能，复制 `.dev.vars.example` 为 `.dev.vars` 并填写 `AI_BASE_URL`、`AI_API_KEY`、可选 `AI_MODEL`。`.dev.vars` 已被 `.gitignore` 忽略，不应提交。

## Cloudflare Pages Git 集成

1. 将项目推送到 GitHub。
2. 在 Cloudflare Dashboard 打开 Workers & Pages。
3. 选择 Create application -> Pages -> Connect to Git。
4. 选择仓库和分支。
5. Build command 填写 `npm run build`。
6. Build output directory 填写 `dist`。
7. Cloudflare Pages 会自动部署 `functions/` 目录下的 Pages Functions；如需启用 AI，按下方“生产环境变量同步”配置 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`。
8. 保存并发布生成器页面。

项目根目录提供 [wrangler.jsonc](../wrangler.jsonc)，其中：

```jsonc
{
  "name": "config-studio",
  "pages_build_output_dir": "./dist",
  "compatibility_date": "2026-07-02"
}
```

## 生产环境变量同步

`functions/api/ai.js` 读取的是 Cloudflare Pages 项目的运行时环境变量，本地 `.dev.vars` 不会自动进入生产环境。本地调通 AI 后，需要把 `.dev.vars` 同步到 Pages 项目。

推荐命令：

```bash
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars，填入真实 AI_BASE_URL / AI_API_KEY / AI_MODEL
npm run pages:env
npm run pages:secrets:list
npm run pages:deploy
```

`npm run pages:env` 等价于：

```bash
XDG_CONFIG_HOME=.wrangler npx wrangler pages secret bulk .dev.vars --project-name config-studio
```

说明：

- `AI_API_KEY` 必须作为 secret 保存，不能写入 `wrangler.jsonc`、GitHub Actions env 或任何 `VITE_*` 变量。
- `AI_BASE_URL`、`AI_MODEL` 不是敏感值，但为了让 `.dev.vars` 可以一键同步，项目也把它们一起保存为 Pages secret；Pages Function 中读取方式相同。
- 修改 Pages 环境变量或 secret 后，需要重新部署一次，发布环境才会使用新值。
- 如果更喜欢 Dashboard：进入 Pages 项目 -> Settings -> Environment variables，分别添加 `AI_BASE_URL`、`AI_MODEL`，并用 Secret 类型保存 `AI_API_KEY`。
- GitHub Pages 没有 Pages Functions，这些变量只对 Cloudflare Pages 部署生效。

## Wrangler Pages 手动发布

首次部署前确认已登录 Cloudflare：

```bash
npx wrangler login
```

发布生成器页面：

```bash
npm run pages:deploy
```

等价于：

```bash
npm run build
XDG_CONFIG_HOME=.wrangler npx wrangler pages deploy ./dist --project-name config-studio
```

启用 AI 前先按“生产环境变量同步”上传 `.dev.vars`。如果只想单独更新 Key，也可以运行：

```bash
XDG_CONFIG_HOME=.wrangler npx wrangler pages secret put AI_API_KEY --project-name config-studio
```

## GitHub Pages 发布

仓库包含 `.github/workflows/github-pages.yml`。启用 GitHub Pages 后，推送到 `main` 分支会自动构建并发布 `dist`，发布结果是这个配置生成工作台页面。

Vite 会在 GitHub Actions 中通过 `GITHUB_PAGES=true` 自动使用仓库名作为静态资源 base path；Cloudflare Pages 和本地开发保持 `/`。

GitHub 仓库设置：

1. 打开 Settings -> Pages。
2. Source 选择 GitHub Actions。
3. 推送到 `main` 或手动运行 Deploy GitHub Pages workflow。

GitHub Pages 没有 Pages Functions，基础配置生成、复制和下载都可正常使用；"询问 AI"会走前端降级提示。

## 静态响应头

[public/_headers](../public/_headers) 会随 Vite 构建复制到 `dist/_headers`，为 Cloudflare Pages 设置基础安全响应头和静态资源缓存策略。

## 故障排查

- 构建失败：先运行 `npm install`，再运行 `npm run build`。
- Cloudflare Pages 找不到页面：确认 Build output directory 是 `dist`。
- Wrangler 写 `~/.config` 报只读：项目脚本使用 `XDG_CONFIG_HOME=.wrangler`，会把 Wrangler 本地配置和日志写入项目目录。
- GitHub Pages 静态资源 404：确认 workflow 中 `GITHUB_PAGES=true` 生效，Vite 会自动使用仓库名作为 base path。
- AI 提示接口不可用：确认使用的是 `npm run pages:dev` 或 Cloudflare Pages；生产环境确认已执行 `npm run pages:env` 并重新部署。
- AI 本地可用但生产不可用：运行 `npm run pages:secrets:list` 确认 Pages 项目存在 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`，再重新部署。
- 右侧生成的 FRP、Dockerfile、Compose、Nginx、Caddy、Redis 配置无法直接用于本仓库：这是预期行为，它们是给目标服务使用的参考配置。
