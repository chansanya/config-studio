# 文档索引

本目录统一管理配置生成工作台的功能说明、部署说明和资料索引。

## 定位说明

这个项目的核心是为使用 FRP、Dockerfile、docker-compose、Nginx、Caddy、Redis 等工具的人提供可视化参考配置。生成出来的配置面向“目标服务/目标项目”，不是用来部署这个 Vue 生成器项目自身。

文档里出现“部署”“运行”“预览”等词时，需要按上下文区分：

- [DEPLOYMENT.md](./DEPLOYMENT.md) 只描述如何发布这个生成器页面；基础生成器纯前端运行，可选 AI 功能需要 Cloudflare Pages Functions。
- `Dockerfile`、`compose.yaml`、`nginx.conf`、`Caddyfile`、`redis.conf` 相关资料只描述目标项目如何使用生成出来的参考配置。
- FRP 相关资料只描述目标 frps/frpc 节点如何填写和启动。

## 项目说明

- [功能覆盖清单](./FEATURES.md)：按 FRP、Dockerfile、docker-compose、Nginx、Caddy、Redis 分区说明当前可生成的配置能力。
- [架构说明](./ARCHITECTURE.md)：说明 Naive UI 三栏工作台、生成器模块接口和后续新增能力的约定。
- [数据驱动改造方案](./REFACTOR.md)：说明 JSON schema 迁移策略、范围边界和当前进度。
- [生成器页面发布文档](./DEPLOYMENT.md)：说明如何把这个生成器页面发布到 Cloudflare Pages、Wrangler Pages 或 GitHub Pages，以及可选 AI 功能在 Cloudflare Pages Functions 下的启用方式。
- [AI 集成方案](./AI-INTEGRATION.md)：说明"询问 AI"的 Pages Function 代理、环境变量、GitHub Pages 降级和 generator 接入约定。

## FRP / Docker / Web / 数据服务资料

生成器使用的机器可读参考资料统一存放在 `src/generators/<工具>/reference-doc.json`，部分工具旁边保留 `reference-doc.md` 作为人工阅读版：

- FRP：`src/generators/frp/reference-doc.json`
- Dockerfile：`src/generators/dockerfile/reference-doc.json`
- docker-compose：`src/generators/compose/reference-doc.json`
- Nginx：`src/generators/nginx/reference-doc.json`
- Caddyfile：`src/generators/caddy/reference-doc.json`
- Redis：`src/generators/redis/reference-doc.json`

## 使用建议

生成器输出适合作为配置起点和学习材料。复制到真实环境前，请确认目标域名、端口、证书路径、镜像名、网络名、鉴权 token、Redis 密码、访问权限和防火墙规则已经按你的实际服务调整。
