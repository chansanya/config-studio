# 配置生成工作台

一个纯前端的 Vue 3 + Vite + Naive UI 配置参考生成器，用来给目标服务生成 FRP、Dockerfile、docker-compose、Nginx、Caddy、Redis 等常用配置。

这个项目的重点不是部署它自己，而是为正在使用这些工具的人提供一套可视化、可复制、可修改的参考配置。页面里的每个 Tab 都面向你的目标项目或目标服务。

## 能力范围

- `FRP`：frps / frpc 参考配置，支持多功能块组合。
- `Dockerfile`：前端静态站点多阶段构建参考。
- `docker-compose`：多 service 编排参考。
- `Nginx`：静态站点、反向代理、HTTPS、WebSocket、SSE、限流等参考配置。
- `Caddy`：自动 HTTPS、反向代理、静态站点、headers、redirect 等参考配置。
- `Redis`：常用 `redis.conf` 参考配置。
- 可选 AI：支持配置校验、口述生成表单、按当前配置生成使用说明。

## 本地开发

```bash
npm install
npm run dev
```

如果只验证纯前端界面，这样就够了。默认地址一般是 `http://localhost:5173/`。

## 本地测试 AI

AI 依赖 Cloudflare Pages Functions，本地不要用普通 `npm run dev` 测。

```bash
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars，填入真实 AI_BASE_URL / AI_API_KEY / AI_MODEL
npm run pages:dev
```

`pages:dev` 会先构建，再启动本地 Pages 环境和 `/api/ai`。

## 构建

```bash
npm run build
npm run preview
```

## 发布到 Cloudflare Pages

推荐命令：

```bash
npm run pages:login
npm run pages:env
npm run pages:deploy
```

命令说明：

- `npm run pages:login`：登录 Cloudflare。
- `npm run pages:env`：把 `.dev.vars` 批量同步到 Cloudflare Pages secret。
- `npm run pages:deploy`：构建并发布当前页面。
- `npm run pages:secrets:list`：查看当前 Pages 项目里已有的 secret。
- `npm run pages:release`：先同步环境变量，再执行发布。

`pages:env` 当前使用的是：

```bash
npx wrangler pages secret bulk .dev.vars --project-name config-studio
```

也就是说，生产环境的 AI 变量不会自动从本地进入 Cloudflare。你修改了 `.dev.vars` 之后，必须重新执行一次：

```bash
npm run pages:env
npm run pages:deploy
```

更短的部署步骤说明见 [DEPLOYMENT.md](/home/dev/workspace/projects/vscode/frp-config-gen/docs/DEPLOYMENT.md)。

## 发布到 GitHub Pages

仓库内已经带了 `.github/workflows/github-pages.yml`。启用 GitHub Pages 时：

1. 打开仓库 `Settings -> Pages`
2. `Source` 选择 `GitHub Actions`
3. 推送到 `main` 分支，或在 Actions 页面手动重跑部署

注意：GitHub Pages 只能提供纯前端页面，不支持本项目的 AI 功能，因为它没有 `functions/api/ai.js` 这一层运行时。

## 环境变量

本地和 Cloudflare Pages 生产环境共用这三个变量：

- `AI_BASE_URL`
- `AI_API_KEY`
- `AI_MODEL`

建议把 `.dev.vars.example` 复制为 `.dev.vars` 后填写真实值。`.dev.vars` 已被 `.gitignore` 忽略，不要提交。

## 项目结构

- `src/components/`：工作台界面、AI 抽屉、字段控件
- `src/generators/`：各工具自己的状态、schema、reference、配置生成逻辑
- `functions/api/ai.js`：Cloudflare Pages Function，负责代理 AI 请求
- `public/`：静态资源和 `_headers`

## 说明

- 右侧生成的配置是给目标服务使用的参考配置，不是用来部署本仓库本身的。
- 参考资料和 schema 跟随各生成器放在 `src/generators/<tool>/` 下。
- 正式生产使用前，请把示例域名、端口、证书路径、镜像名、密码、token 等内容替换成真实值。
