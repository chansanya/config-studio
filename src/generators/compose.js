// 引入 Vue 的 reactive，用来保存 compose 表单和动态 service 列表。
import { reactive } from "vue";
// 引入 Compose 表单 schema，service 默认值、字段和块文案都从这里读取。
import schema from "./compose/schema.json";
// 引入 Compose 配置项参考(AI verify 上下文)。
import reference from "./compose/reference-doc.json";
// 引入 schema 深拷贝和通用动态块工具，避免多个 service 共用同一份数据对象。
import {
  cloneSchemaValue,
  createDynamicBlockDescriptor,
  mergeKnownFields,
  pickAIArray,
} from "./loader";
// 引入共享工具，统一处理字符串清理、键值对解析、YAML 渲染和列表拆分。
import {
  cleanString,
  parseKeyValuePairs,
  q,
  renderYamlKeyValuePairs,
  renderYamlList,
  splitList,
} from "./shared";

// schema 默认值里可使用 {serial} 占位符，新增 service 时替换成递增编号。
function applySerialTemplate(value, serial) {
  return typeof value === "string" ? value.replaceAll("{serial}", String(serial)) : value;
}

// 创建一个 docker-compose service 的默认配置对象。
function createService(serial = 1) {
  const serialTemplate = serial === 1 ? schema.service.first : schema.service.next;
  const serialValues = Object.fromEntries(
    Object.entries(serialTemplate).map(([key, value]) => [
      key,
      applySerialTemplate(value, serial),
    ]),
  );

  // serial 用于保证新增 service 的 id、名称和容器名不会相互冲突。
  return {
    // id 只用于 Vue 列表渲染，不会写入 compose.yaml。
    id: `compose-service-${serial}`,
    ...cloneSchemaValue(schema.service.defaults),
    ...serialValues,
  };
}

// 创建 docker-compose 参考配置生成器。
export function createComposeGenerator() {
  // addModel 保存新增块控件的当前选择，Compose 目前只支持新增 service。
  const addModel = reactive({ [schema.block.add.key]: "service" });
  // services 保存所有动态 service 配置。
  const services = reactive([createService(1)]);
  // serial 为后续新增 service 提供递增编号。
  let serial = 2;

  // serviceFields 描述一个 service 可编辑的全部表单字段，字段数据来自 schema。
  const serviceFields = cloneSchemaValue(schema.service.fields);
  // blockMeta 描述动态 Service 块的展示文案。
  const blockMeta = schema.block;

  // 新增一个 service，并递增序号。
  function addService() {
    services.push(createService(serial));
    serial += 1;
  }

  // service 的 networks 支持简单列表，也支持第一个网络绑定固定 IPv4。
  function renderServiceNetworks(service, networks) {
    if (!networks.length) {
      return [];
    }

    const containerIPv4 = cleanString(service.containerIPv4);
    if (!containerIPv4) {
      return ["    # 加入的 Compose 网络。", "    networks:", ...renderYamlList(networks, 6)];
    }

    return [
      "    # 加入的 Compose 网络；固定 IP 绑定到第一个网络。",
      "    networks:",
      `      ${networks[0]}:`,
      `        ipv4_address: ${q(containerIPv4)}`,
      ...networks.slice(1).map((network) => `      ${network}: {}`),
    ];
  }

  // 根据所有 service 的网络字段汇总顶层 networks 定义，避免重复输出同名网络。
  function collectNetworkDefinitions() {
    const definitions = new Map();

    services.forEach((service) => {
      splitList(service.networks).forEach((network) => {
        if (!definitions.has(network)) {
          definitions.set(network, {
            external: service.networkMode === "external",
            driver: cleanString(service.networkDriver) || "bridge",
            subnet: cleanString(service.networkSubnet),
          });
          return;
        }

        const current = definitions.get(network);
        if (service.networkMode === "external") {
          current.external = true;
        }
        if (!current.subnet && cleanString(service.networkSubnet)) {
          current.subnet = cleanString(service.networkSubnet);
        }
      });
    });

    return definitions;
  }

  // 将一个 service 状态对象渲染成 compose.yaml 中的多行文本。
  function renderService(service) {
    // lines 保存当前 service 的 YAML 片段，缩进从 services 下一级开始。
    const lines = [
      `  # ${cleanString(service.name)} 服务配置。`,
      `  ${cleanString(service.name)}:`,
      "    # 使用的镜像；启用 build 时可同时保留 image 作为构建结果名称。",
      `    image: ${q(cleanString(service.image))}`,
    ];

    // 启用本地构建时输出 build 子块。
    if (service.enableBuild) {
      lines.push(
        "    # 本地构建配置。",
        "    build:",
        `      context: ${q(cleanString(service.buildContext) || ".")}`,
        `      dockerfile: ${q(cleanString(service.dockerfile) || "Dockerfile")}`,
      );
    }

    // container_name 为空时不输出，保持 Compose 默认命名。
    if (cleanString(service.containerName)) {
      lines.push("    # 容器名称。", `    container_name: ${q(cleanString(service.containerName))}`);
    }

    // ports 会从逗号分隔文本转成 YAML 列表。
    const ports = splitList(service.ports);
    if (ports.length) {
      lines.push("    # 主机端口:容器端口 映射。", "    ports:", ...renderYamlList(ports.map(q), 6));
    }

    // environment 会从键值对文本转成 YAML 字典。
    const env = parseKeyValuePairs(service.environment);
    if (env.length) {
      lines.push("    # 环境变量。", "    environment:", ...renderYamlKeyValuePairs(service.environment, 6));
    }

    // volumes 会从逗号分隔文本转成 YAML 列表。
    const volumes = splitList(service.volumes);
    if (volumes.length) {
      lines.push("    # 数据卷或目录挂载。", "    volumes:", ...renderYamlList(volumes.map(q), 6));
    }

    // depends_on 为空时不输出，避免制造无意义依赖。
    const dependsOn = splitList(service.dependsOn);
    if (dependsOn.length) {
      lines.push("    # 启动顺序依赖。", "    depends_on:", ...renderYamlList(dependsOn, 6));
    }

    // restart 为 no 时省略，使用 Compose 默认行为。
    if (cleanString(service.restart) && service.restart !== "no") {
      lines.push("    # 容器退出后的重启策略。", `    restart: ${cleanString(service.restart)}`);
    }

    if (service.init) {
      lines.push("    # 启用 init 进程处理信号和僵尸进程。", "    init: true");
    }

    // command 为空时不输出，保留镜像默认启动命令。
    if (cleanString(service.command)) {
      lines.push("    # 覆盖镜像默认启动命令。", `    command: ${q(cleanString(service.command))}`);
    }

    // entrypoint 为空时不输出，保留镜像默认 ENTRYPOINT。
    if (cleanString(service.entrypoint)) {
      lines.push("    # 覆盖镜像默认 ENTRYPOINT。", `    entrypoint: ${q(cleanString(service.entrypoint))}`);
    }

    // 启用健康检查时输出 healthcheck 子块。
    if (service.enableHealthcheck) {
      lines.push(
        "    # 健康检查，Compose 会据此判断服务是否可用。",
        "    healthcheck:",
        `      test: ["CMD-SHELL", ${q(cleanString(service.healthcheckTest))}]`,
        `      interval: ${cleanString(service.healthcheckInterval) || "30s"}`,
        `      timeout: ${cleanString(service.healthcheckTimeout) || "3s"}`,
        `      retries: ${Number(service.healthcheckRetries) || 3}`,
      );
    }

    if (service.enableLogging) {
      lines.push(
        "    # 日志驱动与轮转配置。",
        "    logging:",
        `      driver: ${q(cleanString(service.loggingDriver) || "json-file")}`,
        "      options:",
        `        max-size: ${q(cleanString(service.loggingMaxSize) || "10m")}`,
        `        max-file: ${q(String(service.loggingMaxFile || 3))}`,
      );
    }

    if (service.enableDeploy) {
      lines.push(
        "    # 部署资源参考，Swarm 或兼容平台会读取 deploy。",
        "    deploy:",
        `      replicas: ${Number(service.deployReplicas) || 1}`,
        "      resources:",
        "        limits:",
        `          cpus: ${q(cleanString(service.deployCpuLimit) || "0.50")}`,
        `          memory: ${q(cleanString(service.deployMemoryLimit) || "512M")}`,
      );
    }

    // networks 会从逗号分隔文本转成 YAML 列表。
    const networks = splitList(service.networks);
    lines.push(...renderServiceNetworks(service, networks));

    // 返回当前 service 片段，由 generateConfig 汇总。
    return lines;
  }

  // 根据全部 service 状态生成完整 compose.yaml。
  function generateConfig() {
    // 顶部注释强调这是目标服务参考配置，而不是当前生成器项目部署配置。
    const lines = [
      "# Generated by Config Gen",
      "services:",
      ...services.flatMap(renderService),
    ];

    // 从所有 service 中提取网络名，自动生成顶层 networks 声明。
    const networks = collectNetworkDefinitions();
    if (networks.size) {
      lines.push("", "# 声明服务使用的网络。", "networks:");
      networks.forEach((definition, network) => {
        lines.push(`  ${network}:`);
        if (definition.external) {
          lines.push("    external: true");
          return;
        }

        lines.push(`    driver: ${cleanString(definition.driver) || "bridge"}`);
        if (definition.subnet) {
          lines.push(
            "    ipam:",
            "      config:",
            `        - subnet: ${q(definition.subnet)}`,
          );
        }
      });
    }

    // 保留文件末尾换行，方便复制保存。
    return `${lines.join("\n").trim()}\n`;
  }

  // 返回通用工作台消费的生成器接口。
  return {
    // id 用于顶部 Tab 选中和渲染 key。
    id: "compose",
    // title 是顶部 Tab 展示名。
    title: "docker-compose",
    // summary 是生成器摘要。
    summary: "多服务 Compose 编排",
    // icon 映射到 lucide 图标。
    icon: "Boxes",
    // language 用于右侧代码块语言标签。
    language: "YAML",
    // fileName 是下载文件名。
    fileName: () => "compose.yaml",
    // panelTitle 是左侧表单标题。
    panelTitle: () => "compose.yaml",
    // panelLead 说明此配置面向目标服务。
    panelLead: () => "为目标服务按需新增多个 service，生成端口、环境变量、网络、健康检查等 Compose 参考配置。",
    // Compose 没有固定字段组，主要通过动态 service 块配置。
    getFieldGroups: () => [],
    // getBlocks 返回动态 Service 管理区，通用 block helper 负责拼装工作台契约。
    getBlocks: () => [
      createDynamicBlockDescriptor({
        meta: blockMeta,
        addModel,
        items: services,
        onAdd: addService,
        fields: serviceFields,
        getTitle: (service, index) => `Service ${index + 1}: ${cleanString(service.name) || "unnamed"}`,
        getSummary: (service) => cleanString(service.image) || "未设置镜像",
        getIcon: () => "Box",
      }),
    ],
    // 暴露配置生成函数。
    generateConfig,
    // 生成面向目标项目的使用说明。
    generateUsage: () =>
      [
        "1. 保存右侧内容为目标项目的 compose.yaml。",
        "2. 在目标项目同目录运行: docker compose up -d。",
        "3. 查看服务状态: docker compose ps。",
        "4. 修改配置后运行: docker compose up -d --build。",
      ].join("\n"),
    // 暴露该工具的参考配置规范(AI verify 上下文 + 人类查阅)。
    getReference: () => reference,
    // generate 模式期望返回 services 数组，数组项只能使用 service 默认状态里的字段。
    getAIContext: () => ({
      reference,
      expectedJson: {
        type: "object",
        shape: {
          services: [Object.keys(schema.service.defaults)],
        },
      },
      schema,
    }),
    // 按 service 字段白名单把 AI 生成的 JSON 重建 services 数组(generate 模式)。
    applyAIState: (json) => {
      const list = pickAIArray(json, "services");
      if (!list.length) return;
      services.splice(0, services.length);
      list.forEach((data, idx) => {
        if (!data || typeof data !== "object") return;
        const base = createService(idx + 1);
        services.push(mergeKnownFields(base, data, serviceFields));
      });
      serial = services.length + 1;
    },
  };
}
