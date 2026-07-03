# frp 功能特性参考

> **来源**：<https://gofrp.org/zh-cn/docs/features/> · **整理于**：2026-07-03 · **规模**：32 项功能 + 14 条关系
> 结构化数据（机器可读）见同目录 [reference-doc.json](./reference-doc.json)。所有字段取自官方文档原文，URL slug 已校正。

## 索引

- [一、代理类型（9）](#一代理类型9)
- [二、通用功能（14）](#二通用功能14)
- [三、客户端插件（9）](#三客户端插件9)
- [四、关系](#四关系)

---

## 一、代理类型（9）

### TCP & UDP  `type: tcp / udp`
- **用途**：frps 监听 `remotePort` 透传到 frpc 本地端口，外网访问内网 TCP/UDP 服务。
- **proxies 字段**：`name` `type` `localIP`(默认 127.0.0.1) `localPort` `remotePort`
- **注意**：每个服务独占一个 remotePort；frps 侧需 `bindPort`。
- 📖 <https://gofrp.org/zh-cn/docs/features/tcp-udp/>

### HTTP & HTTPS  `type: http / https`
- **用途**：按请求 Host 路由复用端口，无需每服务独占端口。
- **frps 字段**：`vhostHTTPPort` `vhostHTTPSPort`
- **注意**：https 要求本地是 HTTPS 服务，frps 不做 TLS 终止。下属子功能：改 Header / BasicAuth / 二级域名 / 路由。
- 📖 <https://gofrp.org/zh-cn/docs/features/http-https/>

### 修改 HTTP 请求 Header  `type: http`（子功能）
- **proxies 字段**：`hostHeaderRewrite` `requestHeaders.set.<k>` `responseHeaders.set.<k>`（外加 `customDomains[]`）
- **注意**：仅 HTTP 类型；frp 默认不修改转发数据。
- 📖 <https://gofrp.org/zh-cn/docs/features/http-https/header/>

### HTTP BasicAuth 鉴权  `type: http`（子功能）
- **proxies 字段**：`httpUser` `httpPassword`（外加 `customDomains[]`）
- **注意**：所有人共用 frps HTTP 端口，知道域名者默认能访问，故需此鉴权。
- 📖 <https://gofrp.org/zh-cn/docs/features/http-https/auth/>

### 自定义二级域名  `type: http / https`（子功能）
- **用途**：多人共用 frps 时用 `subdomain` 替代 `customDomains`，通过 `{subdomain}.{subdomainHost}` 访问。
- **proxies 字段**：`subdomain`（可与 `customDomains[]` 并存）
- **frps 字段**：`subdomainHost`（如 `frps.com`）
- **注意**：需泛域名 `*.subdomainHost` 解析到 frps；配了 subdomainHost 后 customDomains 不能是其子/泛域名。
- 📖 <https://gofrp.org/zh-cn/docs/features/http-https/subdomain/>

### URL 路由  `type: http`（子功能）
- **proxies 字段**：`locations[]`（URL 前缀，如 `["/news","/about"]`）
- **注意**：仅最大前缀匹配，不支持正则；未命中其它的请求落到 `locations=["/"]` 的代理。
- 📖 <https://gofrp.org/zh-cn/docs/features/http-https/route/>

### STCP & SUDP  `type: stcp / sudp`
- **用途**：Secret TCP/UDP，端口不直接暴露公网，需访问者部署 frpc 并用相同 `secretKey`。
- **proxies 字段**：`secretKey` `localIP` `localPort`
- **visitors 字段**：`serverName`(目标代理名) `secretKey`(须一致) `bindAddr` `bindPort`
- **注意**：服务端和访问端都要部署 frpc；SUDP 配置同 STCP，仅 type 不同。
- 📖 <https://gofrp.org/zh-cn/docs/features/stcp-sudp/>（生成器内置 STCP/SUDP proxy 与 visitor 示例输出）

### XTCP  `type: xtcp`
- **用途**：P2P 打洞穿透，成功后流量直连不经 frps，不受 frps 带宽限制。
- **proxies 字段**：`secretKey` `localIP` `localPort`
- **visitors 字段**：`serverName` `secretKey` `bindAddr` `bindPort` `protocol`(quic/kcp，默认 quic) `keepTunnelOpen`(bool) `maxRetriesAnHour`(默认 8) `minRetryInterval`(默认 90s) `fallbackTo` `fallbackTimeoutMs`
- **frpc 字段**：`natHoleStunServer`（STUN 服务器）
- **注意**：打洞成功率取决于 NAT 类型，可靠场景建议 STCP；`bindPort=-1` 表示不监听物理端口只做 fallback。
- 📖 <https://gofrp.org/zh-cn/docs/features/xtcp/>（生成器内置 XTCP proxy 与 visitor 示例输出）

### TCPMUX  `type: tcpmux`
- **用途**：单端口复用，按 HTTP CONNECT 请求中的 host 路由到不同代理。
- **proxies 字段**：`multiplexer`(目前只支持 `httpconnect`) `customDomains[]`(CONNECT 的 host 匹配) `localPort`
- **frps 字段**：`tcpmuxHTTPConnectPort`
- 📖 <https://gofrp.org/zh-cn/docs/features/tcpmux/>

---

## 二、通用功能（14）

### 配置文件
- **格式**：v0.52.0 起支持 TOML/YAML/JSON；INI 已弃用将移除，新功能仅新格式可用。
- **模板渲染**：Go 标准格式，环境变量须以 `.Envs` 前缀，如 `{{ .Envs.FRP_SERVER_ADDR }}`。
- **YAML**：支持 `&anchor` / `<<: *anchor` 合并及点前缀字段（类 Docker Compose `x-`），严格模式下无需 `--strict-config=false`。
- **校验**：`frpc/frps verify -c xx.toml`；默认严格模式，`--strict-config=false` 关闭。
- **拆分**：`includes = ["./confd/*.toml"]`（被引入文件只能含 proxy 配置，通用参数必须在主配置）。
- 📖 <https://gofrp.org/zh-cn/docs/features/common/configure/>

### 监控
- **frps 字段**：`enablePrometheus`(bool，须同时启用 webServer 才生效)；监控接口复用 Dashboard 地址，路径 `/metrics`。
- **注意**：内存监控默认随 Dashboard 启用，进程重启清空，最多保留 7 天；Dashboard 监控 API 不规范，不建议直接用。
- 📖 <https://gofrp.org/zh-cn/docs/features/common/monitor/>

### 身份认证
- **方式**：`token`（默认）/ `oidc`。
- **frps 字段**：`auth.token`(明文，与 tokenSource 互斥) `auth.tokenSource.type`(file/exec，v0.66.0+) `auth.tokenSource.file.path` `auth.tokenSource.exec.{command,args,env}` `auth.method=oidc` `auth.oidc.{issuer,audience,skipExpiryCheck,skipIssuerCheck}`
- **frpc 字段**：`auth.token/tokenSource.*` `auth.method=oidc` `auth.oidc.{clientID,clientSecret,audience,tokenEndpointURL,scope,additionalEndpointParams,trustedCaFile,insecureSkipVerify,proxyURL,tokenSource}`
- **注意**：token 与 tokenSource 二选一；token 文件建议权限 600，不支持运行时重载；exec 需启动加 `--allow-unsafe=TokenSourceExec`；OIDC 走 Client Credentials Grant（RFC 6749 §4.4）。
- 📖 <https://gofrp.org/zh-cn/docs/features/common/authentication/>

### Web 界面 / Dashboard
- **frps 字段**：`webServer.addr`(默认 127.0.0.1，公网访问改 0.0.0.0) `webServer.port`(必填) `webServer.{user,password}`(BasicAuth 可选) `webServer.tls.{certFile,keyFile}`(启用 HTTPS)
- **frpc 字段**：`webServer.{addr,port,user,password}`；`store.path`(持久化如 `./db.json`，启用后支持运行时 Web UI/API 增删改代理与 visitor，重启自动恢复)
- **注意**：Dashboard 未对大量 proxy 做展示优化；客户端 Admin UI 默认本地，外网暴露需评估风险；Store 依赖 webServer 启用。
- 📖 <https://gofrp.org/zh-cn/docs/features/common/ui/>

### 通信安全及优化
- **proxy 字段**：`transport.useEncryption`(bool，aes-128-cfb) `transport.useCompression`(bool，snappy)
- **两端必一致**：`transport.tcpMux`(bool，默认启用)
- **frps 字段**：`transport.maxPoolCount`(每代理连接池上限，默认 5) `kcpBindPort` `quicBindPort`(均 UDP，可与 bindPort 相同)
- **frpc 字段**：`transport.poolCount`(预创建连接数) `transport.protocol`(tcp 默认 / kcp / quic)
- **注意**：启用 TLS 后流量已全局加密，无需再 `useEncryption`；tcpMux 启用后连接池提升有限；KCP/QUIC 走 UDP，弱网更优但 KCP 有额外流量消耗。
- 📖 <https://gofrp.org/zh-cn/docs/features/common/network/network/>

### 自定义 TLS 协议加密
- **frps 字段**(`transport.tls.*`)：`force`(true 时只收 TLS 客户端) `certFile` `keyFile` `trustedCaFile`(校验客户端证书的 CA)
- **frpc 字段**(`transport.tls.*`)：`enable`(v0.50.0 起默认 true) `certFile` `keyFile` `trustedCaFile` `disableCustomTLSFirstByte`(默认 true，为 true 不发 0x17 字节且无法与 vhostHTTPSPort 端口复用)
- **注意**：v0.50.0 起 enable 默认 true，frps 未配证书用随机证书加密，默认 frpc 开 TLS 但不校验 frps 证书；启用 TLS 后除 xtcp 外无需 useEncryption；三种校验模式（frpc 单向验 frps / frps 单向验 frpc / 双向）；Go 1.15 起废弃 CommonName，推荐 SAN 证书。
- 📖 <https://gofrp.org/zh-cn/docs/features/common/network/network-tls/>

### 负载均衡与健康检查
- **proxy 字段**：`loadBalancer.{group,groupKey}` `healthCheck.{type(tcp/http),timeoutSeconds,maxFailed,intervalSeconds,path(仅 http)}`
- **注意**：支持 tcp/http/https/tcpmux；同组 tcp 的 remotePort 须一致，http 的 customDomains/subdomain/locations 须一致；分发策略随机。
- 📖 <https://gofrp.org/zh-cn/docs/features/common/load-balancer/>

### 获取用户真实 IP
- **proxy 字段**：`transport.proxyProtocolVersion`(v1/v2，默认不启用)
- **注意**：X-Forwarded-For 仅 http 代理默认启用（含 https2http/https2https 插件代理）；Proxy Protocol 支持 TCP/UDP，本地服务须支持解析（nginx/haproxy）；UDP 启用后保留源 IP。
- 📖 <https://gofrp.org/zh-cn/docs/features/common/realip/>

### 端口范围映射
- **模板函数**：`parseNumberRangePair "6000-6006,6007" "6000-6006,6007"`（前 local 后 remote，支持 `a-b,c` 语法）
- **注意**：v0.56.0 新增；是模板语法不再是旧 `range:` 前缀；命名需自行保证唯一（如 `tcp-{{ $v.First }}`）。
- 📖 <https://gofrp.org/zh-cn/docs/features/common/range/>

### 客户端运维
- **字段**：`webServer.addr` `webServer.port`(启用 reload/status API 必需) `transport.proxyURL`(http://user:pwd@host:port 或 socks5://...)
- **命令**：`frpc reload -c frpc.toml` / `frpc status -c frpc.toml`
- **注意**：reload 只能更新代理相关配置，公共部分除 start 外不能动态改；transport.proxyURL 仅在 protocol=tcp 时生效。
- 📖 <https://gofrp.org/zh-cn/docs/features/common/client/>

### 服务端管理
- **frps 字段**：`allowPorts[]`(`{start,end}` 或 `{single}`) `vhostHTTPPort/vhostHTTPSPort/bindPort`(可设同端口复用) `transport.tls.disableCustomTLSFirstByte`(复用前须 false)
- **proxy 字段**：`transport.bandwidthLimit`(如 1MB，仅 MB/KB) `transport.bandwidthLimitMode`(server=服务端限速，默认客户端)
- **注意**：端口复用依赖协议探测；`vhostHTTPSPort==bindPort` 前须先设 `disableCustomTLSFirstByte=false`。
- 📖 <https://gofrp.org/zh-cn/docs/features/common/server-manage/>

### 服务端插件
- **frps 字段**：`[[httpPlugins]]` `name` `addr`(host:port) `path`(如 /handler) `ops[]`(Login/NewProxy/CloseProxy/Ping/NewWorkConn/NewUserConn) `tls_verify`
- **frpc 字段**：全局 `metadatas.<k>`(随 Login) / 代理级 `[[proxies]] metadatas.<k>`(随 NewProxy)
- **RPC**：`POST /handler?version=0.1.0&op=<Op>`，Body 含 content；三种回应：reject+reject_reason / unchange:true / unchange:false+content 替换。
- **注意**：插件独立进程监听独立端口；CloseProxy 在大量 proxy 时易超连接数。
- 📖 <https://gofrp.org/zh-cn/docs/features/common/server-plugin/>

### SSH 隧道网关
- **frps 字段**：`sshTunnelGateway.{bindPort(必填), privateKeyFile, autoGenPrivateKeyPath(默认 ./.autogen_ssh_key), authorizedKeysFile(公钥鉴权)}`
- **客户端命令**：`ssh -R :80:{local_ip:port} v0@{frps} -p {port} {tcp|http|https|stcp|tcpmux} --remote_port {p} --proxy_name {n} --token {t}`
- **注意**：v0.53.0 新增；登录用户名固定 `v0`；frps 不支持 ssh 密码认证，只支持 authorized_keys 公钥；强烈建议至少开 token 或 authorizedKeysFile 之一；换私钥需清客户端 known_hosts。
- 📖 <https://gofrp.org/zh-cn/docs/features/common/ssh/>

---

## 三、客户端插件（9）

> 启用插件后不再使用 `localIP`/`localPort`；公共必填字段 `plugin.type`。

| plugin.type | 用途 | 字段 |
| --- | --- | --- |
| `http_proxy` | frpc 内提供本地 HTTP 代理 | `httpUser` `httpPassword`（均可选） |
| `socks5` | frpc 内提供本地 SOCKS5 代理 | `username` `password`（均可选） |
| `static_file` | 对外提供本地静态文件访问 | `localPath`(必填) `stripPrefix` `httpUser` `httpPassword` |
| `unix_domain_socket` | 暴露本地 Unix 域套接字 | `unixPath`(必填) |
| `http2https` | 对外 HTTP，本地为 HTTPS | `localAddr`(必填) `hostHeaderRewrite` `requestHeaders` |
| `https2http` | 对外 HTTPS（frp 做 TLS 终止），本地为 HTTP | `localAddr`(必填) `hostHeaderRewrite` `requestHeaders` `enableHTTP2`(默认 true) `crtPath` `keyPath` |
| `https2https` | 对外 HTTPS 且本地也为 HTTPS | 同 https2http |
| `tls2raw` | 对外 TLS，剥离后以 raw TCP 连本地 | `localAddr`(必填) `crtPath` `keyPath` |
| `virtual_net` | 虚拟网络组网 | `type=virtual_net`（特性页未列特有字段）；visitor 侧含 `destinationIP` |

📖 字段详情 <https://gofrp.org/zh-cn/docs/reference/client-plugin/>

---

## 四、关系

- **HTTP 代理子功能**（改 Header / BasicAuth / 二级域名 / URL 路由）→ 隶属于 `HTTP & HTTPS 代理`。
- **9 个客户端插件** → 隶属于 `客户端插件` 总览。
- `自定义 TLS 协议加密` → 细化于 `通信安全及优化`。
