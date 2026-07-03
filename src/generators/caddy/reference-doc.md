# Caddyfile 配置项参考

> 用途：供可视化配置生成器消费。列 Caddyfile 结构与常用指令、默认值、说明。
> 这些条目用于生成用户目标 Web 服务的 Caddyfile 参考，不表示本仓库需要由 Caddy 托管才能运行。
> Caddy 默认行为：站点地址写域名即**自动签发并续期 HTTPS**（Let's Encrypt）；写 `:端口` 或 `http://` 则仅 HTTP。

## 文件结构

```
# 1. 全局选项块（可选，必须在文件顶部）
{
    ...
}

# 2. 片段（可复用）
(common) {
    encode gzip
}

# 3. 站点块
example.com {
    import common
    ...
}
```

- 注释以 `#` 开头。
- 环境变量：`{$ENV_VAR}`。
- `import` 引入片段或文件。

## 全局选项（块内）

| 指令 | 作用 | 默认 |
| --- | --- | --- |
| `auto_https` | HTTPS 行为 | `on`（自动签发+重定向） |
| `admin` | 管理 API | `localhost:2019`；`off` 关闭 |
| `servers` | 服务器参数 | `{ protocols h1 h2 h3 }` |
| `log` | 全局日志 | `{ level INFO }` |
| `storage` | 存储后端 | 文件系统 `~/.local/share/caddy` |
| `local_certs` | 用内部 CA（内网/开发） | — |
| `persist_config` | 持久化配置 | `on` |
| `default_sni` | 默认 SNI | — |

`auto_https` 取值：`on` / `off` / `disable_redirects` / `disable_certs` / `ignore_certs`

## 站点地址

| 形式 | 含义 |
| --- | --- |
| `example.com` | 域名，自动 HTTPS |
| `*.example.com` | 通配符 |
| `:8080` | 仅监听端口（HTTP） |
| `https://example.com` | 强制 HTTPS |
| `http://example.com` | 强制 HTTP |
| `localhost` | 本地（自动用内部 CA） |

## 站点块常用指令

| 指令 | 作用 | 示例/默认 |
| --- | --- | --- |
| `root` | 文档根 | `root * /srv` |
| `file_server` | 静态文件服务 | `file_server browse` |
| `reverse_proxy` | 反向代理 | `reverse_proxy app:3000`，默认支持 WebSocket |
| `encode` | 响应压缩 | `encode gzip zstd` |
| `tls` | TLS 配置 | `tls email@example.com` / `tls internal` |
| `header` | 设响应头 | `header X-Frame-Options DENY` |
| `redir` | 重定向 | `redir https://{host}{uri} permanent` |
| `rewrite` | 内部重写（不改 URL） | `rewrite * /index.html` |
| `respond` | 直接返回响应 | `respond "ok" 200` |
| `try_files` | 依次查找 | `try_files {path} /index.html` |
| `basic_auth` | 基本认证 | `basic_auth { user hash }` |
| `log` | 访问日志 | `log { output file /var/log/caddy.log }` |
| `handle` | 互斥路由块 | 类似 switch |
| `handle_path` | 带 path 剥离的 handle | — |
| `route` | 顺序路由块 | — |
| `php_fastcgi` | FastCGI（PHP） | `php_fastcgi php:9000` |
| `rate_limit` | 限流 | — |
| `templates` | 模板渲染 | — |

## matcher（匹配器）

```
# 命名 matcher
@api {
    path /api/*
    method GET POST
    header Authorization *
}
reverse_proxy @api app:3000

# 路径直写
file_server /static/*

# 通配
respond /health "ok"
```

可用匹配条件：`path` `method` `host` `header` `query` `expression` `protocol` `remote_ip` `not`。

## reverse_proxy 子指令（负载均衡/上游）

| 子指令 | 作用 | 默认 |
| --- | --- | --- |
| `to` | 多上游 | `lb_policy round_robin` |
| `lb_policy` | 负载策略 | `round_robin`；可选 `random` `least_conn` `ip_hash` `first` |
| `health_uri` / `health_interval` / `health_timeout` | 主动健康检查 | — |
| `health_status` | 健康状态码 | `2xx` |
| `fail_duration` | 标记不健康时长 | `30s` |
| `header_up` / `header_down` | 改写请求/响应头 | — |
| `transport http` | 传输配置 | `{ tls tls_insecure_skip_verify dial_timeout read_timeout write_timeout }` |
| `flush_interval` | 流式刷新 | SSE 常用 `-1`，立即刷新 |

## 默认配置示例

### 静态站点（自动 HTTPS）
```caddyfile
example.com {
    root * /srv
    encode gzip zstd
    try_files {path} /index.html          # SPA 回退
    file_server
    header {
        X-Frame-Options DENY
        X-Content-Type-Options nosniff
        Referrer-Policy no-referrer
    }
}
```

### 反向代理 + 负载均衡
```caddyfile
api.example.com {
    reverse_proxy {
        to app1:3000 app2:3000
        lb_policy least_conn
        health_uri /health
        health_interval 10s
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
    }
}
```

### 仅本地开发（内部 CA，不签公网证书）
```caddyfile
{
    local_certs
}
localhost:8080 {
    root * ./dist
    file_server
}
```
