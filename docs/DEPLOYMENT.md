# 部署说明

这个项目发布的是“配置工坊页面”本身，不是右侧生成出来的 FRP / Dockerfile / Nginx / Redis 配置。

## 本地开发

只看前端界面：

```bash
npm install
npm run dev
```

需要本地测试 AI：

```bash
cp .dev.vars.example .dev.vars
# 填入 AI_BASE_URL / AI_API_KEY / AI_MODEL
npm run pages:dev
```

## Cloudflare Pages

首次使用先登录：

```bash
npm run pages:login
```

同步生产环境变量：

```bash
npm run pages:env
```

这个命令等价于：

```bash
npx wrangler pages secret bulk .dev.vars --project-name config-studio
```

发布页面：

```bash
npm run pages:deploy
```

如果你刚改过 `.dev.vars`，推荐直接：

```bash
npm run pages:release
```

它会先同步环境变量，再执行发布。

## GitHub Pages

仓库已经自带 `.github/workflows/github-pages.yml`。

只需要：

1. 打开仓库 `Settings -> Pages`
2. `Source` 选择 `GitHub Actions`
3. 推送到 `main` 分支，或去 `Actions` 页面手动重跑

## 说明

- `AI_API_KEY` 不要写进前端代码，也不要放进 `VITE_*` 变量。
- `.dev.vars` 不会自动进入 Cloudflare 生产环境，改完后要重新执行 `npm run pages:env`。
- GitHub Pages 只支持纯前端页面，不支持本项目的 AI 功能。
