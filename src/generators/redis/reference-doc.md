# Redis 配置项参考

> 本资料用于可视化生成器的 Redis Tab。生成结果面向目标 Redis 服务，不用于部署当前 Vue 生成器项目。

## 常用配置范围

| 配置项 | 作用 | 示例 |
| --- | --- | --- |
| `bind` | 监听地址 | `bind 127.0.0.1 -::1` |
| `port` | TCP 监听端口 | `port 6379` |
| `protected-mode` | 保护模式 | `protected-mode yes` |
| `requirepass` | 访问密码 | `requirepass change-me` |
| `aclfile` | ACL 用户文件 | `aclfile /etc/redis/users.acl` |
| `tls-port` | TLS 监听端口 | `tls-port 6380` |
| `timeout` | 客户端空闲超时 | `timeout 0` |
| `tcp-keepalive` | TCP keepalive | `tcp-keepalive 300` |
| `databases` | 逻辑数据库数量 | `databases 16` |
| `daemonize` | 是否后台运行 | `daemonize no` |
| `supervised` | 进程监督方式 | `supervised systemd` |
| `dir` | 数据文件目录 | `dir /data` |
| `dbfilename` | RDB 文件名 | `dbfilename dump.rdb` |
| `save` | RDB 保存规则 | `save 900 1` |
| `appendonly` | 是否开启 AOF | `appendonly yes` |
| `appendfsync` | AOF 刷盘策略 | `appendfsync everysec` |
| `maxmemory` | 最大内存 | `maxmemory 256mb` |
| `maxmemory-policy` | 内存淘汰策略 | `maxmemory-policy allkeys-lru` |
| `replicaof` | 副本跟随主节点 | `replicaof 10.0.0.10 6379` |
| `loglevel` | 日志级别 | `loglevel notice` |
| `logfile` | 日志文件 | `logfile ""` |
| `slowlog-log-slower-than` | 慢查询阈值 | `slowlog-log-slower-than 10000` |
| `notify-keyspace-events` | 键空间通知 | `notify-keyspace-events Ex` |

## 使用提醒

- Redis 不建议直接暴露到公网；生产环境请用安全组、防火墙、内网地址、强密码或 ACL。
- 容器环境通常保持 `daemonize no` 和 `logfile ""`，让日志输出到 stdout。
- 缓存场景常用 `maxmemory-policy allkeys-lru`；数据库场景更常用 `noeviction` 并做好容量告警。
- 复制生成配置前，请替换 `requirepass`、证书路径、数据目录和内存上限。
