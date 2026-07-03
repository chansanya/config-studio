# 配置生成工作台

基础能力纯前端、可选 AI 走 Cloudflare Pages Functions 的 Vue 3 + Vite + Naive UI 可视化参考配置生成器，用于为目标服务生成 FRP、Dockerfile、docker-compose、Nginx、Caddy、Redis 等工具配置。

这个项目的核心不是“用 Dockerfile、Nginx、Caddy 部署本项目”，而是给正在使用这些工具的人提供一套能看、能改、能复制的参考配置。页面里的每个 Tab 都面向你的目标项目或目标服务，当前 Vue 应用本身只负责表单、预览、复制和下载。

## 定位边界

- `FRP` 生成的是目标 frps/frpc 配置参考。
- `Dockerfile` 生成的是目标前端静态站点镜像构建参考。
- `docker-compose` 生成的是目标服务多容器编排参考。
- `Nginx` 和 `Caddy` 生成的是目标 Web 服务的静态站点、反向代理、HTTPS 等配置参考。
- `Redis` 生成的是目标 Redis 服务的常用 `redis.conf` 参考。
- 本项目自身主要作为静态网页发布到 Cloudflare Pages、Wrangler Pages 或 GitHub Pages；基础生成器不依赖服务端运行时，可选的"询问 AI"能力仅在 Cloudflare Pages Functions 环境可用。
- 生成结果默认带中文配置项说明，适合学习、审阅和二次修改；正式生产使用前仍需按真实域名、端口、证书、网络和安全策略调整。

## 功能覆盖

- Naive UI 多生成器工作台：顶部 Tab 切换工具，左侧管理基础配置和功能块，中间填写表单，右侧实时预览配置和使用说明。
- frps 服务端：监听地址、TCP/UDP/KCP/QUIC/TCPMUX 入口、token/OIDC 鉴权、鉴权附加范围、连接池、心跳、TLS 强制和双向校验、TCP 多路复用、NAT 打洞 STUN、HTTP/HTTPS vhost、二级域名、404 页面、Dashboard、端口白名单、日志。
- frpc 基础：服务端地址、传输协议 `tcp/kcp/quic/websocket/wss`、HTTP/SOCKS 代理连接 frps、登录失败策略、心跳、TCP 多路复用、TLS 双向校验、token/OIDC 鉴权、鉴权附加范围、AdminServer、连接池、`start` 启动列表。
- 代理类型：SSH/TCP、UDP、HTTP、HTTPS、STCP、XTCP、P2P、TCPMUX、SUDP、连续端口范围。
- 代理高级能力：加密、压缩、带宽限制、负载均衡组、健康检查、Proxy Protocol、metadata。
- 客户端插件模板：HTTP Proxy、SOCKS5、Static File、Unix Domain Socket、HTTP2HTTPS、HTTPS2HTTP、HTTPS2HTTPS。
- STCP、XTCP、P2P、SUDP 会同时生成服务提供方 `[[proxies]]` 和访问方 `[[visitors]]` 示例。
- frpc 支持在同一个配置中添加多个功能块，每个功能块拥有独立参数和高级代理选项。
- Dockerfile：前端静态站点多阶段构建，支持 Node 构建阶段、Nginx/Caddy 运行阶段、`WORKDIR`、`ENV`、额外 `COPY` / `RUN`、`ENTRYPOINT`、`CMD`、健康检查。
- docker-compose：支持多个 service，覆盖 image/build、ports、environment、volumes、networks、创建或引用外部网络、固定容器 IPv4、depends_on、restart、entrypoint、healthcheck、logging、deploy、init、command。
- Nginx：支持 server/location、upstream 负载均衡、全局生产参数、限流、静态站点、反向代理、HTTPS、WebSocket、SSE/流式响应、gzip、headers、HTTP 到 HTTPS 重定向，并在 location 摘要和配置注释中展示匹配 URL。
- Caddy：支持全局 options、site/handle、站点 TLS、Basic Auth、站点日志、静态站点、反向代理多上游与子指令、WebSocket、SSE/流式响应、自动 HTTPS、headers、redirect、encode gzip/zstd。
- Redis：支持 `redis.conf` 常用配置，覆盖监听地址、端口、保护模式、密码/ACL、TLS、运行参数、RDB/AOF 持久化、最大内存、淘汰策略、副本连接、日志、慢查询和键空间通知。
- 生成的配置会为主要配置项附带中文注释，复制后仍可作为目标服务的参考配置使用。
- 可选 AI 辅助：在 Cloudflare Pages Functions 中通过 `/api/ai` 代理上游 OpenAI 兼容接口，支持校验当前配置和按自然语言生成表单内容；GitHub Pages 会优雅提示 AI 不可用。

详细覆盖清单见 [FEATURES.md](./docs/FEATURES.md)，完整文档入口见 [docs/README.md](./docs/README.md)。

## 本地开发

```bash
npm install
npm run dev
```

默认开发地址为 Vite 输出的本地地址，例如 `http://localhost:5173/`。

## 构建

```bash
npm run build
npm run preview
```

构建产物位于 `dist/`。基础配置生成、复制和下载在浏览器内完成；需要使用"询问 AI"时请通过 Cloudflare Pages Functions 或 `npm run pages:dev` 启动 `/api/ai`。

## 发布生成器页面

Cloudflare Pages、Wrangler Pages、GitHub Pages 的完整步骤见 [DEPLOYMENT.md](./docs/DEPLOYMENT.md)。这里的“部署”只表示发布这个可视化生成器页面，不表示使用右侧生成的 Dockerfile、Compose、Nginx、Caddy、Redis 配置来部署本仓库。

常用命令：

```bash
npm run pages:dev
npm run pages:deploy
```

## 参考资料

机器可读字段模板和参考资料跟随各生成器放在 `src/generators/<工具>/` 下，例如 `schema.json`、`reference-doc.json` 和可选的 `reference-doc.md`。生成器会输出带注释的参考配置；参考文件里的外部文档链接只用于说明，不会作为裸 URL 写入生成结果。

## 架构

生成器逻辑按工具拆分到 `src/generators/`，通用 UI 拆分到 `src/components/`，页面只负责 Tab、功能块导航、表单、预览、复制和下载。FRP、Dockerfile、docker-compose、Nginx、Caddy、Redis 的字段、默认值和选项已按各自 schema 渐进外置，配置文本生成逻辑仍保留在独立生成器模块中；具体约定见 [ARCHITECTURE.md](./docs/ARCHITECTURE.md) 和 [REFACTOR.md](./docs/REFACTOR.md)。
