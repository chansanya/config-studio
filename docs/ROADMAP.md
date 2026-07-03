# 功能路线图（缺口审计）

> 基于 `src/generators/*/reference-doc.json` 对 generator 的功能缺口审计。
> 整理于 2026-07-03。当前 FRP、Dockerfile、Compose、Nginx、Caddy、Redis 的主要字段、默认值和选项已迁移到各自 `schema.json`，配置文本生成逻辑仍保留在对应 generator 中。

## 覆盖度总览

| generator | 覆盖度 | 主要短板 |
|---|---|---|
| frp | ~75% | sshTunnelGateway / httpPlugins / Store / tokenSource / 部分插件整块缺 |
| dockerfile | 9/18 指令 | 缺 ARG / LABEL / USER / VOLUME / ADD 等 9 项 |
| compose | ~16/34 字段 | 已补 logging / deploy / init；仍缺 configs / secrets / profiles 等生产项 |
| nginx | 单站基础 + upstream + 生产硬化 | stream/tcp 等边缘能力仍缺 |
| caddy | 单站基础 + reverse_proxy 子指令 + 部分生产硬化 | 命名 matcher、templates/import 等仍缺 |
| redis | 常用单实例 redis.conf | Cluster / Sentinel / 模块加载等高级能力暂未覆盖 |

## P0 — 已修复（bug，非缺口）

frp 三处字段名前缀 bug（`src/generators/frp.js` 的 `buildAdvanced`）已修复：

| 原错误输出 | 当前输出 | 状态 |
|---|---|---|
| `proxyProtocolVersion = "v2"` | `transport.proxyProtocolVersion` | 已修复 |
| `group` / `groupKey` | `loadBalancer.group` / `loadBalancer.groupKey` | 已修复 |
| `bandwidthLimit` / `bandwidthLimitMode` | `transport.bandwidthLimit` / `.bandwidthLimitMode` | 已修复 |

> 已用 Vite SSR 生成器实测确认：`useEncryption` / `useCompression` 仍输出 `transport.*`，限速、负载均衡、Proxy Protocol 也已输出新字段名。

## P1 — 已实现（反向代理核心）

| generator | 原缺口 | 当前实现 |
|---|---|---|
| nginx | upstream 负载均衡组（server / least_conn / ip_hash / keepalive） | 已新增 Upstream 动态块，支持多 server、round_robin/least_conn/ip_hash/random、keepalive，并可被 location `proxy_pass` 引用；反代支持 WebSocket 与 SSE/流式响应常用项 |
| caddy | reverse_proxy 子指令（to 多上游 / lb_policy / health_uri / header_up / transport） | 已支持多上游、lb_policy、health_uri、header_up、header_down、transport tls / tls_insecure_skip_verify、flush_interval 与 transport 超时 |

## P2 — 基本完成（生产硬化）

- **nginx**：已实现 http 全局（sendfile / keepalive_timeout / client_max_body_size / server_tokens）+ events（worker_connections）；limit_req 限流；ssl_protocols / ciphers；expires；proxy_connect/read_timeout
- **caddy**：已实现全局 options（auto_https / admin / servers）；basic_auth；site 级 tls；log。命名 matcher 仍未实现。
- **compose**：已实现 logging 轮转；deploy（replicas / resources）；init
- **frp**：已实现 TLS 双向校验字段；端口范围超过 20 个时改 Go template；OIDC 字段
- **redis**：已实现常用单实例配置（监听、安全、TLS、RDB/AOF、内存、淘汰、副本、日志、慢查询）

## P3 — 功能整块补齐

- **frp**：sshTunnelGateway（ssh -R 无 frpc 反向隧道）、`[[httpPlugins]]` 服务端插件、tokenSource、Store、enablePrometheus、tls2raw / virtual_net 插件
- **dockerfile**：HEALTHCHECK 四子项、ARG、LABEL、USER、ADD、多阶段 stage 命名 / `--from` / `--chown`
- **compose**：configs / secrets、cap_add / cap_drop、sysctls、ulimits、profiles、user、env_file、顶层命名 volumes
- **redis**：Sentinel、Cluster、Redis Modules、ACL 用户细粒度规则模板

## P4 — 边缘（低价值，可缓）

nginx stream/tcp 模块、dockerfile VOLUME / STOPSIGNAL / SHELL / ONBUILD、frp XTCP visitor 调优字段（protocol / maxRetriesAnHour / fallbackTo 等）、caddy templates / import 片段、http2https 等插件的 requestHeaders。

## 建议执行顺序

1. **P3**：功能整块补齐
2. **P4**：择机补齐
