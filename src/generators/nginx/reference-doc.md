# nginx.conf 配置项参考

> 用途：供可视化配置生成器消费。列 nginx 配置块结构与常用指令、默认值、说明。
> 这些条目用于生成用户目标 Web 服务的 nginx.conf 参考，不表示本仓库需要由 Nginx 反代才能运行。
> 配置层级：`main > events > http > server > location`，外加 `upstream`（在 http 内）。

## 块结构与作用域

| 块 | 作用 | 内含典型指令 |
| --- | --- | --- |
| `main`（全局，块外） | 主进程行为 | `user` `worker_processes` `error_log` `pid` |
| `events` | 连接处理 | `worker_connections` `use` `multi_accept` |
| `http` | HTTP 服务全局 | `sendfile` `gzip` `types` `include` `client_max_body_size` |
| `server` | 虚拟主机 | `listen` `server_name` `root` `ssl_certificate` |
| `location` | URL 匹配处理 | `proxy_pass` `try_files` `return` `add_header` |
| `upstream` | 后端服务器组 | `server` `least_conn` `ip_hash` `keepalive` |

## main 全局指令

| 指令 | 作用 | 默认 |
| --- | --- | --- |
| `user` | worker 运行用户 | `nobody` |
| `worker_processes` | worker 数 | `auto`（=CPU 核数） |
| `worker_rlimit_nofile` | 最大文件描述符 | 系统 ulimit |
| `error_log` | 错误日志 | `logs/error.log`，级别默认 `error` |
| `pid` | PID 文件 | `logs/nginx.pid` |
| `daemon` | 守护进程 | `on`（容器内设 `off`） |

## events

| 指令 | 默认 |
| --- | --- |
| `worker_connections` | `512`（官方默认；发行版常调 1024） |
| `multi_accept` | `off` |
| `use` | 自动选择（Linux 为 `epoll`） |

## http 常用指令

| 指令 | 作用 | 默认 |
| --- | --- | --- |
| `sendfile` | 内核零拷贝传文件 | `off`（发行版常开 `on`） |
| `tcp_nopush` | 配合 sendfile | `off` |
| `tcp_nodelay` | 禁用 Nagle | `on` |
| `keepalive_timeout` | 长连接超时 | `75s` |
| `keepalive_requests` | 单连接最大请求数 | `1000` |
| `default_type` | 默认 MIME | `text/plain` |
| `client_max_body_size` | 请求体上限 | `1m` |
| `server_tokens` | 响应隐藏版本 | `on`（生产建议 `off`） |
| `include` | 引入文件 | — |
| `types {}` | MIME 映射 | 通常 `include mime.types` |
| `gzip` | 开启压缩 | `off` |
| `gzip_types` | 压缩类型 | 默认仅 `text/html` |
| `gzip_min_length` | 最小压缩长度 | `20` |

## server 常用指令

| 指令 | 作用 | 默认/示例 |
| --- | --- | --- |
| `listen` | 监听 | `80`；`443 ssl` `443 ssl http2` |
| `server_name` | 域名 | 空时匹配所有 |
| `root` | 文档根 | — |
| `index` | 默认首页 | `index.html` |
| `error_page` | 错误页 | `error_page 404 /404.html` |
| `return` | 直接返回 | `return 301 https://$host$request_uri` |
| `rewrite` | 重写 | `rewrite ^/old/(.*) /new/$1 permanent` |
| `access_log` | 访问日志 | `logs/access.log` |
| `ssl_certificate` | 证书 | — |
| `ssl_certificate_key` | 私钥 | — |
| `ssl_protocols` | TLS 版本 | `TLSv1.2 TLSv1.3`（现代） |
| `ssl_ciphers` | 加密套件 | — |

## location 匹配修饰符

| 修饰符 | 含义 |
| --- | --- |
| `=` | 精确匹配（最高优先级） |
| `^~` | 前缀匹配，命中后不再查正则 |
| `~` | 区分大小写正则 |
| `~*` | 不区分大小写正则 |
| （无） | 普通前缀匹配 |

## location 常用指令

| 指令 | 作用 | 示例 |
| --- | --- | --- |
| `proxy_pass` | 反向代理 | `proxy_pass http://app:8080` |
| `proxy_set_header` | 转发头 | `Host` / `X-Real-IP` / `X-Forwarded-For` |
| `proxy_connect_timeout` | 连后端超时 | 默认 `60s` |
| `proxy_read_timeout` | 读后端超时 | 默认 `60s` |
| `proxy_send_timeout` | 发往后端超时 | 长连接可设 `86400s` |
| `proxy_http_version` | 代理 HTTP 版本 | WebSocket/SSE 常用 `1.1` |
| `proxy_buffering` | 代理缓冲 | SSE/流式响应常用 `off` |
| `chunked_transfer_encoding` | 分块传输 | SSE/流式响应可设 `on` |
| `try_files` | 依次查找 | `try_files $uri $uri/ /index.html`（SPA 回退） |
| `alias` | 路径别名 | 区别于 `root`（root 拼接 location，alias 替换） |
| `add_header` | 加响应头 | `X-Frame-Options SAMEORIGIN` |
| `expires` | 缓存 | `expires 30d` |
| `autoindex` | 目录列表 | `off`（默认） |
| `limit_req` | 限流 | `limit_req zone=one burst=20` |

## upstream（负载均衡）

| 指令 | 作用 | 默认 |
| --- | --- | --- |
| `server` | 后端节点 | `weight=1 max_fails=1 fail_timeout=10s` |
| `least_conn` | 最少连接策略 | 默认轮询 |
| `ip_hash` | 源 IP 哈希（会话保持） | 默认轮询 |
| `random` | 随机 | — |
| `keepalive` | 到后端长连接池 | — |
| `health_check` | 主动健康检查 | 开源版不支持，需 NGINX Plus/第三方 |

## 默认配置示例（静态站点 + 反代 + HTTPS）

```nginx
worker_processes auto;
events { worker_connections 1024; }

http {
    sendfile on;
    keepalive_timeout 65;
    client_max_body_size 10m;
    server_tokens off;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    upstream api {                      # 负载均衡组
        server app1:3000 weight=3;
        server app2:3000;
        keepalive 32;
    }

    server {
        listen 80;
        server_name example.com;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl;
        http2 on;
        server_name example.com;
        root /usr/share/nginx/html;
        index index.html;
        ssl_certificate     /etc/nginx/cert.pem;
        ssl_certificate_key /etc/nginx/key.pem;

        location / {
            try_files $uri $uri/ /index.html;     # SPA 回退
        }

        location ~* \.(js|css|png)$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }

        location /api/ {                          # 反向代理
            proxy_pass http://api;
            proxy_http_version 1.1;
            proxy_set_header Host              $host;
            proxy_set_header X-Real-IP         $remote_addr;
            proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Upgrade           $http_upgrade;
            proxy_set_header Connection        "upgrade";
            proxy_read_timeout 86400s;
            proxy_send_timeout 86400s;
            proxy_buffering off;
            chunked_transfer_encoding on;
        }
    }
}
```
