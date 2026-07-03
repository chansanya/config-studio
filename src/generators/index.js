// 引入 Caddyfile 参考配置生成器。
import { createCaddyGenerator } from "./caddy";
// 引入 docker-compose 参考配置生成器。
import { createComposeGenerator } from "./compose";
// 引入 Dockerfile 参考配置生成器。
import { createDockerfileGenerator } from "./dockerfile";
// 引入 FRP 参考配置生成器。
import { createFrpGenerator } from "./frp";
// 引入 Nginx 参考配置生成器。
import { createNginxGenerator } from "./nginx";
// 引入 Redis 参考配置生成器。
import { createRedisGenerator } from "./redis";

// 创建并返回顶部 Tab 工作台需要展示的全部生成器实例。
export function createGenerators() {
  // 数组顺序就是页面顶部 Tab 的展示顺序。
  return [
    // FRP 放在第一位，保留项目最初的核心能力。
    createFrpGenerator(),
    // Dockerfile 用于目标前端静态站点镜像参考配置。
    createDockerfileGenerator(),
    // Compose 用于目标服务的多容器编排参考配置。
    createComposeGenerator(),
    // Nginx 用于目标 Web 服务的静态站点和反代参考配置。
    createNginxGenerator(),
    // Caddy 用于目标 Web 服务的自动 HTTPS 和反代参考配置。
    createCaddyGenerator(),
    // Redis 用于目标缓存或数据服务的常用 redis.conf 参考配置。
    createRedisGenerator(),
  ];
}
