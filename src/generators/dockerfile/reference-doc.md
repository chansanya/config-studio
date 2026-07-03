# Dockerfile 配置项参考

> 用途：供可视化配置生成器消费。列 Dockerfile 指令清单、默认值、说明、示例。
> 这些条目用于生成用户目标项目的 Dockerfile 参考，不表示本仓库需要用 Dockerfile 部署。
> 指令大小写不敏感，约定全大写。构建命令：`docker build -t <name>:<tag> .`

## 指令速查

| 指令 | 作用 | 阶段 | 默认/要点 |
| --- | --- | --- | --- |
| `FROM` | 基础镜像（必须，且为首个非注释指令） | 构建 | `FROM <image>:<tag> [AS <name>]` |
| `ARG` | 构建期参数（仅构建期可见） | 构建 | `ARG <name>[=<default>]`；FROM 前可用 |
| `LABEL` | 镜像元数据 | 构建 | 替代废弃的 `MAINTAINER` |
| `ENV` | 环境变量（构建+运行） | 都 | `ENV KEY=value`，运行时仍生效 |
| `WORKDIR` | 工作目录 | 都 | 绝对路径，不存在自动创建 |
| `COPY` | 复制文件/目录进镜像 | 构建 | `COPY [--chown=u:g] [--from=stage] src dest` |
| `ADD` | 复制（支持 tar 自动解压、URL） | 构建 | 一般优先用 `COPY` |
| `RUN` | 构建期执行命令 | 构建 | shell 形式 / exec 形式 `["cmd","arg"]` |
| `USER` | 切换运行用户 | 运行 | `USER <user>[:<group>]` |
| `EXPOSE` | 声明端口（文档性质，不真正发布） | 运行 | `EXPOSE 80/tcp` |
| `VOLUME` | 声明匿名卷挂载点 | 运行 | `VOLUME ["/data"]` |
| `ENTRYPOINT` | 固定入口命令（不易覆盖） | 运行 | `ENTRYPOINT ["cmd"]` |
| `CMD` | 默认命令/参数（可被覆盖） | 运行 | 与 ENTRYPOINT 配合提供参数 |
| `HEALTHCHECK` | 容器健康检查 | 运行 | 默认无；`HEALTHCHECK NONE` 禁用 |
| `STOPSIGNAL` | 停止信号 | 运行 | 默认 `SIGTERM` |
| `SHELL` | 默认 shell（多用于 Windows） | 都 | 默认 `/bin/sh -c` |
| `ONBUILD` | 被作为基础镜像时触发 | — | 已不推荐 |
| `MAINTAINER` | （已废弃）维护者 | — | 用 `LABEL maintainer=` |

## 默认值与示例

### FROM
```dockerfile
FROM node:20-alpine           # 基础镜像
FROM --platform=linux/amd64 golang:1.22 AS builder   # 指定平台 + 命名阶段
```

### RUN（注意分层缓存，合并 RUN 减少层数）
```dockerfile
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN ["executable", "arg1", "arg2"]   # exec 形式，不依赖 shell
```

### COPY vs ADD
```dockerfile
COPY package.json ./            # 推荐：普通文件
ADD https://x.com/tar.gz /tmp   # ADD 才支持 URL/tar 解压
COPY --chown=node:node --from=builder /app/dist ./dist   # 多阶段拷贝
```

### ENV / ARG
```dockerfile
ARG NODE_ENV=production        # 仅构建期，可 docker build --build-arg 覆盖
ENV NODE_ENV=$NODE_ENV PORT=3000   # 写入镜像，容器运行时仍生效
```

### ENTRYPOINT + CMD（推荐组合）
```dockerfile
ENTRYPOINT ["node"]            # 固定：始终以 node 启动
CMD ["server.js"]              # 默认参数，docker run 可追加覆盖
```

### HEALTHCHECK
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
# 默认: interval=30s timeout=30s start-period=0s retries=3
```

### EXPOSE / VOLUME / USER
```dockerfile
EXPOSE 3000
VOLUME ["/app/data"]
USER 1001:1001
```

## 多阶段构建（减体积）
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
```

## .dockerignore（放 build context 根目录）
排除不必进镜像的文件，加速构建、避免泄露：
```
node_modules
dist
.git
*.env
```
