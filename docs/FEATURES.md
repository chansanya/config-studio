# 配置生成器功能覆盖清单

> 本项目定位是为 FRP、Dockerfile、docker-compose、Nginx、Caddy、Redis 等工具提供可视化参考配置，不负责部署本项目自身。

> FRP 资料整理见 [src/generators/frp/reference-doc.md](../src/generators/frp/reference-doc.md)。当前 UI 覆盖清单按已实现生成器能力维护。

## 能力边界

| 类型 | 说明 |
| --- | --- |
| 做什么 | 通过表单生成目标服务可参考的配置文本，并附带中文配置项说明和使用提示。 |
| 不做什么 | 不连接服务器、不保存配置、不执行部署、不替用户校验目标环境是否满足生产要求。 |
| 输出对象 | 右侧配置面向用户自己的 FRP 节点、前端项目、容器服务、Nginx/Caddy 网关、Redis 实例。 |
| 本项目发布 | 基础页面是静态 Vue 应用，可发布到 Cloudflare Pages、Wrangler Pages、GitHub Pages；可选 AI 仅在 Cloudflare Pages Functions 下可用。 |
| 可选 AI | Cloudflare Pages Functions 下可使用"询问 AI"校验配置或口述生成；GitHub Pages / 普通 Vite dev 会降级提示不可用。 |
| 生产使用 | 复制前需要替换示例域名、镜像名、端口、证书路径、token、密码和网络策略。 |

## 工作台与模块化

| 功能 | 页面配置 | 输出 |
| --- | --- | --- |
| 顶部 Tab 工作台 | 顶部导航 | Naive UI `FRP`, `Dockerfile`, `docker-compose`, `Nginx`, `Caddy`, `Redis` |
| 三栏配置体验 | 左侧 / 中间 / 右侧 | 左侧功能块导航，中间表单编辑，右侧配置和说明预览 |
| 通用表单 | 各生成器字段模型 | text / number / select / toggle / textarea |
| 动态配置块 | 新增功能 / Service / Server / Location / Site / Handle | 多段配置合并输出 |
| 复制与下载 | 右侧输出面板 | 当前生成器对应文件名 |
| 询问 AI | 右侧输出面板 | 验证当前配置；Dockerfile、Compose、Nginx、Caddy、Redis 支持口述生成并回填表单 |
| 模块隔离 | `src/generators/*` | 每类工具独立生成逻辑 |

## frps 服务端

| 功能 | 页面配置 | 输出字段 |
| --- | --- | --- |
| schema 数据源 | FRP schema | 端类型、frps 默认值和基础字段来自 `src/generators/frp/schema.json` |
| 基础监听 | 服务端基础 | `bindAddr`, `bindPort`, `proxyBindAddr` |
| UDP/KCP/QUIC | 协议入口 | `bindUDPPort`, `kcpBindPort`, `quicBindPort` |
| TCPMUX | 协议入口 | `tcpmuxHTTPConnectPort` |
| token 鉴权 | 监听与鉴权 | `auth.method`, `auth.token` |
| OIDC 鉴权 | 监听与鉴权 | `auth.oidc.issuer`, `auth.oidc.audience`, `auth.oidc.skipExpiryCheck`, `auth.oidc.skipIssuerCheck` |
| 鉴权附加范围 | 监听与鉴权 | `auth.additionalScopes` |
| 连接池与心跳 | 监听与鉴权 | `transport.maxPoolCount`, `transport.heartbeatTimeout` |
| TLS 强制 | 监听与鉴权 | `transport.tls.force` |
| TLS 双向校验 | 监听与鉴权 | `transport.tls.certFile`, `transport.tls.keyFile`, `transport.tls.trustedCaFile` |
| TCP 多路复用 | 监听与鉴权 | `transport.tcpMux`, `transport.tcpMuxKeepaliveInterval` |
| NAT 打洞 STUN | 监听与鉴权 | `natHoleStunServer` |
| HTTP/HTTPS vhost | HTTP/HTTPS 入口 | `vhostHTTPPort`, `vhostHTTPSPort`, `subDomainHost`, `custom404Page` |
| Dashboard | Dashboard 与端口范围 | `webServer.*` |
| Prometheus/pprof | 待补齐 | 资料已整理，当前 UI 暂未生成 `webServer.enablePrometheus`, `webServer.pprofEnable` |
| 端口白名单 | Dashboard 与端口范围 | `allowPorts` |
| 日志 | 日志与观测 | `log.to`, `log.level`, `log.maxDays` |
| 服务端插件 | 待补齐 | 资料已整理，当前 UI 暂未生成 `[[httpPlugins]]` |

## frpc 基础

| 功能 | 页面配置 | 输出字段 |
| --- | --- | --- |
| schema 数据源 | FRP schema | frpc 默认值、基础字段、代理 mode 清单、mode 默认值、mode 字段和高级代理字段来自 `src/generators/frp/schema.json` |
| 连接 frps | 连接 frps | `serverAddr`, `serverPort`, `user` |
| 传输协议 | 连接 frps | `transport.protocol` |
| 代理连接 frps | 连接 frps | `transport.proxyURL` |
| 登录失败策略 | 连接 frps | `loginFailExit` |
| 心跳 | 连接 frps | `transport.heartbeatInterval`, `transport.heartbeatTimeout` |
| TCP 多路复用 | 连接 frps | `transport.tcpMux`, `transport.tcpMuxKeepaliveInterval` |
| TLS | 连接 frps | `transport.tls.enable`, `transport.tls.serverName` |
| TLS 双向校验 | 连接 frps | `transport.tls.certFile`, `transport.tls.keyFile`, `transport.tls.trustedCaFile`, `transport.tls.disableCustomTLSFirstByte` |
| token 鉴权 | 连接 frps | `auth.method`, `auth.token` |
| OIDC 鉴权 | 连接 frps | `auth.oidc.clientID`, `clientSecret`, `audience`, `tokenEndpointURL`, `scope`, `trustedCaFile`, `insecureSkipVerify`, `proxyURL`, `additionalEndpointParams.*` |
| 鉴权附加范围 | 连接 frps | `auth.additionalScopes` |
| AdminServer | 客户端 AdminServer | `webServer.*` |
| 连接池 | 连接 frps | `transport.poolCount` |
| 启动列表 | 连接 frps | `start` |

## 代理类型

| 功能 | 页面入口 | 输出 |
| --- | --- | --- |
| SSH | 新增功能 | `[[proxies]] type = "tcp"` |
| TCP | 新增功能 | `[[proxies]] type = "tcp"` |
| UDP | 新增功能 | `[[proxies]] type = "udp"` |
| HTTP | 新增功能 | `[[proxies]] type = "http"` |
| HTTPS | 新增功能 | `[[proxies]] type = "https"` |
| STCP | 新增功能 | `[[proxies]] type = "stcp"` + `[[visitors]]` |
| XTCP | 新增功能 | `[[proxies]] type = "xtcp"` + `[[visitors]]` |
| P2P | 新增功能 | XTCP 模板 + `keepTunnelOpen` |
| TCPMUX | 新增功能 | `[[proxies]] type = "tcpmux"` |
| SUDP | 新增功能 | `[[proxies]] type = "sudp"` + `[[visitors]]` |
| 端口范围 | 新增功能 | 连续生成多段 `[[proxies]]` |
| 大范围端口 | 新增功能 | 超过 20 个端口时输出 `parseNumberRangePair` Go template，避免静默截断 |

## 代理高级能力

| 功能 | 页面配置 | 输出字段 |
| --- | --- | --- |
| 加密 | 代理高级功能 | `transport.useEncryption` |
| 压缩 | 代理高级功能 | `transport.useCompression` |
| 带宽限制 | 代理高级功能 | `transport.bandwidthLimit`, `transport.bandwidthLimitMode` |
| 负载均衡组 | 代理高级功能 | `loadBalancer.group`, `loadBalancer.groupKey` |
| 健康检查 | 代理高级功能 | `healthCheck.*` |
| Proxy Protocol | 代理高级功能 | `transport.proxyProtocolVersion` |
| Metadata | 代理高级功能 | `metadatas.*` |

## HTTP 附加能力

| 功能 | 页面配置 | 输出字段 |
| --- | --- | --- |
| HTTP Basic Auth | HTTP | `httpUser`, `httpPassword` |
| 按 HTTP 用户路由 | HTTP | `routeByHTTPUser` |
| Host Header 重写 | HTTP | `hostHeaderRewrite` |
| 请求 Header 设置 | HTTP | `requestHeaders.set.*` |
| 响应 Header 设置 | HTTP | `responseHeaders.set.*` |
| 路径路由 | HTTP | `locations` |

## 客户端插件

| 功能 | 页面入口 | 输出 |
| --- | --- | --- |
| HTTP Proxy | 新增功能 | `plugin.type = "http_proxy"` |
| SOCKS5 | 新增功能 | `plugin.type = "socks5"` |
| Static File | 新增功能 | `plugin.type = "static_file"` |
| Unix Domain Socket | 新增功能 | `plugin.type = "unix_domain_socket"` |
| HTTP2HTTPS | 新增功能 | `plugin.type = "http2https"` |
| HTTPS2HTTP | 新增功能 | `plugin.type = "https2http"` |
| HTTPS2HTTPS | 新增功能 | `plugin.type = "https2https"` |

## Dockerfile

| 功能 | 页面配置 | 输出 |
| --- | --- | --- |
| Node 构建阶段 | 构建阶段 | `FROM node:* AS builder`, `WORKDIR`, `RUN install`, `RUN build` |
| 包管理器 | 构建阶段 | npm / pnpm / yarn 依赖安装参考 |
| 构建扩展指令 | 构建阶段 | `ENV`, 额外 `COPY`, 额外 `RUN` |
| 多阶段构建 | 运行阶段 | `FROM nginx/caddy AS runtime`, `COPY --from=builder` |
| 静态运行镜像 | 运行阶段 | Nginx 或 Caddy 静态文件运行阶段 |
| 启动指令覆写 | 运行阶段 | `ENTRYPOINT`, `CMD` |
| 健康检查 | 运行阶段 | `HEALTHCHECK` |
| schema 数据源 | Dockerfile schema | 字段、默认值、选项来自 `src/generators/dockerfile/schema.json` |
| 使用说明 | 输出面板 | 面向目标前端项目的 `docker build` / `docker run` 参考命令 |

## docker-compose

| 功能 | 页面配置 | 输出 |
| --- | --- | --- |
| 多 service | Services | `services.*` |
| schema 数据源 | Compose schema | service 默认值、字段、块文案来自 `src/generators/compose/schema.json` |
| 镜像与构建 | Service 参数 | `image`, `build.context`, `build.dockerfile` |
| 端口与环境变量 | Service 参数 | `ports`, `environment` |
| 卷与网络 | Service 参数 | `volumes`, `networks` |
| 网络来源 | Service 参数 | 创建 bridge 网络或 `external: true` 引用现有网络 |
| 固定容器 IP | Service 参数 | `networks.<name>.ipv4_address`, 顶层 `ipam.config.subnet` |
| 依赖与启动 | Service 参数 | `depends_on`, `restart`, `entrypoint`, `command` |
| 健康检查 | Service 参数 | `healthcheck.*` |
| init 进程 | Service 参数 | `init: true` |
| 日志轮转 | Service 参数 | `logging.driver`, `logging.options.max-size`, `logging.options.max-file` |
| deploy 资源 | Service 参数 | `deploy.replicas`, `deploy.resources.limits` |
| 使用说明 | 输出面板 | 面向目标项目目录的 `docker compose up -d` 参考命令 |

## Nginx

| 功能 | 页面配置 | 输出 |
| --- | --- | --- |
| 多 server | Server | `server {}` |
| schema 数据源 | Nginx schema | 全局生产参数、server、upstream、location 默认值、字段、块文案来自 `src/generators/nginx/schema.json` |
| upstream 负载均衡 | Upstream | `upstream { server ...; least_conn; ip_hash; random; keepalive; }` |
| 全局生产参数 | 全局与生产参数 | `worker_connections`, `sendfile`, `keepalive_timeout`, `client_max_body_size`, `server_tokens` |
| 请求限流 | 全局与 Location | `limit_req_zone`, `limit_req` |
| HTTPS | Server 参数 | `listen 443 ssl http2`, `ssl_certificate` |
| TLS 加固 | Server 参数 | `ssl_protocols`, `ssl_ciphers` |
| HTTP 到 HTTPS | Server 参数 | `return 301 https://$host$request_uri` |
| 静态站点 | Location | `try_files`, `root`, `alias` |
| 反向代理 | Location | `proxy_pass`, `proxy_set_header` |
| 反代超时 | Location | `proxy_connect_timeout`, `proxy_read_timeout`, `proxy_send_timeout` |
| WebSocket | Location | `proxy_http_version 1.1`, `Upgrade`, `Connection` |
| SSE / 流式响应 | Location | `proxy_http_version 1.1`, `proxy_buffering off`, `chunked_transfer_encoding on` |
| 静态缓存 | Location | `expires` |
| gzip 与响应头 | Server/Location | `gzip`, `add_header` |
| 匹配 URL 摘要 | Location | 左侧和卡片摘要展示 `http(s)://host/path -> target`，配置注释同步输出 |
| 访问日志 | Server 参数 | `access_log`, `error_log` |
| 使用说明 | 输出面板 | 面向目标 `nginx.conf` 的容器预览和证书检查提示 |

## Caddy

| 功能 | 页面配置 | 输出 |
| --- | --- | --- |
| 多 site | Site | `example.com {}` |
| schema 数据源 | Caddy schema | 全局 options、site、handle 默认值、字段、块文案来自 `src/generators/caddy/schema.json` |
| 自动 HTTPS | Site 参数 | `email`, Caddy 自动证书能力 |
| 全局 Options | 全局 Options | `auto_https`, `admin`, `servers.protocols`, `log.level` |
| 站点 TLS | Site 参数 | `tls internal` 或 `tls cert key` |
| 站点日志 | Site 参数 | `log { output file ... }` |
| Basic Auth | Site 参数 | `basic_auth { user hash }` |
| 静态站点 | Handle | `root`, `try_files`, `file_server` |
| 反向代理 | Handle | `reverse_proxy` 多上游、`lb_policy`、`health_uri`、`header_up`、`header_down`、`transport http` |
| WebSocket | Handle | Caddy `reverse_proxy` 默认支持 WebSocket |
| SSE / 流式响应 | Handle | `flush_interval -1`, `transport http` 超时配置 |
| 重定向与响应 | Handle | `redir`, `respond` |
| 压缩与响应头 | Site/Handle | `encode`, `header` |
| 使用说明 | 输出面板 | 面向目标 `Caddyfile` 的容器预览、DNS 和 80/443 提示 |

## Redis

| 功能 | 页面配置 | 输出 |
| --- | --- | --- |
| 常用 redis.conf | Redis | `redis.conf` |
| schema 数据源 | Redis schema | 字段、默认值和选项来自 `src/generators/redis/schema.json` |
| 监听与保护模式 | 监听与安全 | `bind`, `port`, `protected-mode` |
| 鉴权与 ACL | 监听与安全 | `requirepass`, `aclfile` |
| TLS | 监听与安全 | `tls-port`, `tls-cert-file`, `tls-key-file`, `tls-ca-cert-file` |
| 运行参数 | 运行参数 | `timeout`, `tcp-keepalive`, `databases`, `daemonize`, `supervised` |
| RDB 持久化 | 持久化 | `dir`, `dbfilename`, `save` |
| AOF 持久化 | 持久化 | `appendonly`, `appendfilename`, `appendfsync` |
| 内存控制 | 内存与淘汰 | `maxmemory`, `maxmemory-policy`, `lazyfree-lazy-eviction` |
| 副本连接 | 副本与观测 | `replicaof`, `masterauth` |
| 日志与慢查询 | 副本与观测 | `loglevel`, `logfile`, `slowlog-log-slower-than`, `slowlog-max-len` |
| 键空间通知 | 副本与观测 | `notify-keyspace-events` |
| 额外指令 | 副本与观测 | 每行一条 Redis 指令原样追加 |
| 使用说明 | 输出面板 | 面向目标 Redis 服务的 `redis-server` / Docker 预览命令 |
