# docker-compose.yml 配置项参考

> 用途：供可视化配置生成器消费。列 Compose 顶层键与 services 常用字段、默认值、说明。
> 这些条目用于生成用户目标服务的 compose.yaml 参考，不表示本仓库需要用 Compose 编排。
> 文件版本：Compose Spec（不再需要顶层 `version`）。命令：`docker compose up -d`

## 顶层键

| 键 | 作用 | 默认 |
| --- | --- | --- |
| `name` | 项目名（决定容器/网络前缀） | 目录名 |
| `services` | 服务定义（必填） | — |
| `networks` | 自定义网络 | 默认 bridge |
| `volumes` | 命名卷 | — |
| `configs` / `secrets` | 配置/敏感数据 | — |
| `version` | （已弃用） | — |

## services 字段速查

| 字段 | 作用 | 默认/示例 |
| --- | --- | --- |
| `image` | 使用现成镜像 | `nginx:1.27` |
| `build` | 构建配置 | `{ context, dockerfile, args, target, cache_from, labels }` |
| `container_name` | 固定容器名 | 默认 `<项目>-<服务>-1` |
| `command` | 覆盖默认命令 | `["app","--debug"]` |
| `entrypoint` | 覆盖入口 | `["/entrypoint.sh"]` |
| `environment` | 环境变量 | `KEY: value` 或字典 |
| `env_file` | 从文件加载环境变量 | `.env` |
| `ports` | 发布端口到宿主 | `"8080:80"` 或 `{target,published,protocol,mode}` |
| `expose` | 仅对链接服务暴露 | `80`（不发布宿主） |
| `volumes` | 挂载 | `"./data:/data"` / `named:/data` |
| `networks` | 加入网络 | `internal: {}` |
| `depends_on` | 启动依赖 | `{ db: { condition: service_healthy } }` |
| `restart` | 重启策略 | `no`（默认）/ `always` / `on-failure` / `unless-stopped` |
| `user` | 运行用户 | `"1001:1001"` |
| `working_dir` | 工作目录 | `/app` |
| `hostname` | 容器主机名 | — |
| `healthcheck` | 健康检查 | 默认无，继承镜像的 |
| `labels` | 标签 | `key: value` |
| `profiles` | 激活 profile 才启动 | `[debug]` |
| `deploy` | Swarm/K8s 部署 | `{ replicas, resources, placement }` |
| `logging` | 日志驱动 | `{ driver: json-file, options: { max-size: 10m } }` |
| `init` | 启用 tini 作 PID 1 | `false`（默认） |
| `tty` / `stdin_open` | 分配终端/标准输入 | `false` |
| `cap_add` / `cap_drop` | 增减内核能力 | — |
| `privileged` | 特权模式 | `false`（默认） |
| `sysctls` / `ulimits` | 内核参数/资源限制 | — |
| `stop_signal` / `stop_grace_period` | 停止信号/宽限 | `SIGTERM` / `10s` |

## 默认值与示例

### 服务定义
```yaml
services:
  web:
    image: nginx:1.27
    container_name: web
    restart: unless-stopped          # 默认 no
    ports:
      - "8080:80"                    # 宿主:容器
      - { target: 443, published: 8443, protocol: tcp, mode: ingress }
    environment:
      TZ: Asia/Shanghai
    env_file: .env
    volumes:
      - ./html:/usr/share/nginx/html       # 绑定挂载
      - data:/data                          # 命名卷
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost/"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
```

### build 配置
```yaml
build:
  context: ./app
  dockerfile: Dockerfile
  args:
    NODE_ENV: production
  target: runtime          # 多阶段目标
  cache_from: [type=registry,ref=...]
```

### 顶层网络与卷
```yaml
networks:
  internal:
    driver: bridge          # 默认 bridge；可选 host/overlay/none
    external: true          # 引用已存在网络
volumes:
  data:                     # 默认 local 驱动
    external: true
```

### deploy（Swarm）
```yaml
deploy:
  replicas: 3
  resources:
    limits: { cpus: "0.5", memory: 512M }
    reservations: { memory: 256M }
  placement:
    constraints: [node.role == manager]
  update_config: { parallelism: 1, delay: 10s }
  restart_policy: { condition: on-failure, max_attempts: 3 }
```

> 注：`deploy` 仅 Swarm 模式生效；普通 `docker compose up` 用 `restart` 控制重启。资源限制普通模式用 `mem_limit`/`cpus`（compose v2 非标准）或 `deploy.resources`（兼容支持）。
