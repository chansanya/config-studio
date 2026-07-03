// 引入 Vue 的 reactive，用来保存 FRP 表单状态和端类型切换状态。
import { reactive } from "vue";
// 引入 FRP 基础表单 schema，端类型、frps/frpc 默认值和基础字段组从这里读取。
import schema from "./frp/schema.json";
// 引入 FRP 官方功能知识库(AI verify 上下文)。
import reference from "./frp/reference-doc.json";
// 引入 schema 加载工具，基础表单数据外置，复杂代理渲染逻辑仍保留在代码中。
import { cloneSchemaValue, createFieldGroupsFromSchema, createStateFromSchema } from "./loader";
// 引入共享工具：数字兜底、字符串清理、键值对解析、TOML 渲染和列表拆分。
import {
  asNumber,
  cleanString,
  parseKeyValuePairs,
  renderToml,
  renderTomlEntries,
  splitList,
} from "./shared";

// FRP 可序列化的 mode、默认值和字段定义来自 schema；生成 TOML 的分支逻辑仍保留在本文件。
const proxyModes = cloneSchemaValue(schema.proxyModes);

// proxyModeOptions 把模式定义转换为下拉框需要的 value/label。
const proxyModeOptions = proxyModes.map((mode) => ({
  // value 是功能模式 id。
  value: mode.id,
  // label 是用户可见名称。
  label: mode.title,
}));

// 根据模式 id 查找模式定义，找不到时回退到第一个模式。
function getModeDefinition(modeId) {
  return proxyModes.find((mode) => mode.id === modeId) || proxyModes[0];
}

const modeDocUrls = {
  ssh: "https://gofrp.org/zh-cn/docs/features/common/ssh/",
  tcp: "https://gofrp.org/zh-cn/docs/features/tcp-udp/",
  udp: "https://gofrp.org/zh-cn/docs/features/tcp-udp/",
  http: "https://gofrp.org/zh-cn/docs/features/http-https/",
  https: "https://gofrp.org/zh-cn/docs/features/http-https/",
  stcp: "https://gofrp.org/zh-cn/docs/features/stcp-sudp/",
  sudp: "https://gofrp.org/zh-cn/docs/features/stcp-sudp/",
  xtcp: "https://gofrp.org/zh-cn/docs/features/xtcp/",
  p2p: "https://gofrp.org/zh-cn/docs/features/xtcp/",
  tcpmux: "https://gofrp.org/zh-cn/docs/features/tcpmux/",
  range: "https://gofrp.org/zh-cn/docs/features/common/range/",
  http_proxy: "https://gofrp.org/zh-cn/docs/features/common/client-plugin/",
  socks5: "https://gofrp.org/zh-cn/docs/features/common/client-plugin/",
  static_file: "https://gofrp.org/zh-cn/docs/features/common/client-plugin/",
  unix_socket: "https://gofrp.org/zh-cn/docs/features/common/client-plugin/",
  http2https: "https://gofrp.org/zh-cn/docs/features/common/client-plugin/",
  https2http: "https://gofrp.org/zh-cn/docs/features/common/client-plugin/",
  https2https: "https://gofrp.org/zh-cn/docs/features/common/client-plugin/",
};

function getModeDocUrl(modeId) {
  return modeDocUrls[modeId] || "https://gofrp.org/zh-cn/docs/features/";
}

// modeDefaults 定义每种功能新增时填入表单的默认示例值。
const modeDefaults = cloneSchemaValue(schema.modeDefaults);
// modeFields 定义每种客户端功能的专属表单字段。
const modeFields = cloneSchemaValue(schema.modeFields);
// advancedFields 定义所有代理功能都可选择的高级代理能力。
const advancedFields = cloneSchemaValue(schema.advanced.fields);

// 创建每个代理功能的高级选项默认值。
function createAdvancedDefaults() {
  return cloneSchemaValue(schema.advanced.defaults);
}

// serverRootComments 为 frps 根配置字段提供中文说明，会写入生成的 TOML 注释。
const serverRootComments = {
  bindAddr: "frps 主监听地址。",
  bindPort: "frpc 连接 frps 的控制端口。",
  proxyBindAddr: "TCP/UDP 代理在 frps 上监听的地址。",
  bindUDPPort: "UDP 代理和 KCP 传输使用的 UDP 监听端口。",
  kcpBindPort: "KCP 传输协议的 UDP 监听端口。",
  quicBindPort: "QUIC 传输协议的 UDP 监听端口。",
  tcpmuxHTTPConnectPort: "TCPMUX HTTP CONNECT 复用入口端口。",
  "auth.method": "鉴权方式。",
  "auth.token": "服务端和客户端必须一致的共享密钥。",
  "auth.additionalScopes": "额外鉴权范围，可覆盖心跳和新建工作连接。",
  "transport.maxPoolCount": "允许每个客户端预建立的最大连接池数量。",
  "transport.heartbeatTimeout": "服务端判定心跳超时的秒数。",
  "transport.tls.force": "是否强制 frpc 使用 TLS 连接 frps。",
  "transport.tls.certFile": "TLS 证书路径。",
  "transport.tls.keyFile": "TLS 私钥路径。",
  "transport.tls.trustedCaFile": "用于校验客户端证书的 CA。",
  "transport.tcpMux": "是否启用 TCP 多路复用。",
  "transport.tcpMuxKeepaliveInterval": "TCP 多路复用保活间隔。",
  natHoleStunServer: "XTCP/P2P NAT 打洞使用的 STUN 服务地址。",
  vhostHTTPPort: "HTTP 类型代理入口端口。",
  vhostHTTPSPort: "HTTPS 类型代理入口端口。",
  subDomainHost: "二级域名后缀。",
  custom404Page: "HTTP 未匹配任何代理时返回的自定义 404 页面。",
  "webServer.addr": "Dashboard 监听地址。",
  "webServer.port": "Dashboard 端口。",
  "webServer.user": "Dashboard 用户名。",
  "webServer.password": "Dashboard 密码。",
  "webServer.enablePrometheus": "是否暴露 Prometheus 指标。",
  "webServer.pprofEnable": "是否开启 pprof 调试接口。",
  "auth.oidc.issuer": "OIDC issuer。",
  "auth.oidc.audience": "OIDC audience。",
  "auth.oidc.skipExpiryCheck": "是否跳过 OIDC token 过期检查。",
  "auth.oidc.skipIssuerCheck": "是否跳过 OIDC issuer 检查。",
  allowPorts: "限制客户端可申请的 remotePort 范围。",
  "log.to": "日志输出位置。",
  "log.level": "日志级别。",
  "log.maxDays": "日志保留天数。",
};

// clientRootComments 为 frpc 根配置字段提供中文说明，会写入生成的 TOML 注释。
const clientRootComments = {
  serverAddr: "frps 服务器地址。",
  serverPort: "frps 的 bindPort。",
  user: "客户端用户名，会作为代理名称前缀避免冲突。",
  loginFailExit: "首次登录 frps 失败时是否退出。",
  "transport.protocol": "连接 frps 的传输协议。",
  "transport.heartbeatInterval": "客户端发送心跳间隔。",
  "transport.heartbeatTimeout": "客户端等待心跳响应超时时间。",
  "transport.tcpMux": "是否启用 TCP 多路复用。",
  "transport.tcpMuxKeepaliveInterval": "TCP 多路复用保活间隔。",
  "transport.proxyURL": "通过 HTTP/SOCKS5 代理连接 frps。",
  "transport.tls.enable": "是否使用 TLS 连接 frps。",
  "transport.tls.serverName": "TLS 校验和 SNI 使用的 serverName。",
  "transport.tls.certFile": "TLS 客户端证书路径。",
  "transport.tls.keyFile": "TLS 客户端私钥路径。",
  "transport.tls.trustedCaFile": "校验 frps 证书的 CA。",
  "transport.tls.disableCustomTLSFirstByte": "是否禁用自定义 TLS first byte。",
  "auth.method": "鉴权方式。",
  "auth.token": "token 鉴权密钥。",
  "auth.oidc.clientID": "OIDC client id。",
  "auth.oidc.clientSecret": "OIDC client secret。",
  "auth.oidc.audience": "OIDC audience。",
  "auth.oidc.tokenEndpointURL": "OIDC token endpoint URL。",
  "auth.oidc.scope": "OIDC scope。",
  "auth.oidc.trustedCaFile": "OIDC endpoint CA。",
  "auth.oidc.insecureSkipVerify": "是否跳过 OIDC TLS 校验。",
  "auth.oidc.proxyURL": "访问 OIDC endpoint 的代理 URL。",
  "auth.oidc.additionalEndpointParams.*": "OIDC token endpoint 附加参数。",
  "auth.additionalScopes": "额外鉴权范围。",
  "webServer.addr": "frpc AdminServer 监听地址。",
  "webServer.port": "frpc AdminServer 端口。",
  "webServer.user": "frpc AdminServer 用户名。",
  "webServer.password": "frpc AdminServer 密码。",
  "transport.poolCount": "客户端预建立工作连接池数量。",
  start: "只启动列表中的代理或访问者。",
};

// proxyComments 为 [[proxies]] 字段提供中文说明，会写入生成的 TOML 注释。
const proxyComments = {
  name: "代理名称。",
  type: "代理类型。",
  localIP: "frpc 所在机器上本地服务地址。",
  localPort: "frpc 所在机器上本地服务端口。",
  remotePort: "frps 对外暴露访问端口。",
  customDomains: "HTTP/HTTPS/TCPMUX 访问域名。",
  subdomain: "二级域名前缀。",
  locations: "HTTP 路径前缀路由。",
  httpUser: "HTTP Basic Auth 用户名。",
  httpPassword: "HTTP Basic Auth 密码。",
  hostHeaderRewrite: "转发到本地服务时重写 Host。",
  routeByHTTPUser: "按 HTTP 用户路由。",
  "requestHeaders.set.*": "转发请求前设置请求头。",
  "responseHeaders.set.*": "返回响应前设置响应头。",
  secretKey: "安全代理服务方和访问方必须一致的密钥。",
  allowUsers: "允许访问的用户列表。",
  multiplexer: "TCPMUX 使用的复用协议。",
  "transport.useEncryption": "为当前代理启用加密。",
  "transport.useCompression": "为当前代理启用压缩。",
  "transport.bandwidthLimit": "当前代理带宽限制。",
  "transport.bandwidthLimitMode": "带宽限制生效位置。",
  "loadBalancer.group": "负载均衡组名。",
  "loadBalancer.groupKey": "负载均衡组密钥。",
  "healthCheck.type": "健康检查类型。",
  "healthCheck.path": "HTTP 健康检查路径。",
  "healthCheck.intervalSeconds": "健康检查间隔。",
  "healthCheck.timeoutSeconds": "健康检查超时。",
  "healthCheck.maxFailed": "连续失败次数阈值。",
  "transport.proxyProtocolVersion": "向本地服务发送 Proxy Protocol。",
  "metadatas.*": "代理元数据。",
  "plugin.type": "frpc 本地插件类型。",
  "plugin.*": "插件配置项。",
};

// visitorComments 为 [[visitors]] 字段提供中文说明，会写入生成的 TOML 注释。
const visitorComments = {
  name: "访问方名称。",
  type: "访问者类型。",
  serverName: "要访问的服务方代理名称。",
  secretKey: "访问方密钥，必须和服务方一致。",
  bindAddr: "访问方本地监听地址。",
  bindPort: "访问方本地监听端口。",
  keepTunnelOpen: "XTCP/P2P 是否保持打洞通道。",
};

// 把逗号分隔的键值对写入 dotted key，例如 requestHeaders.set.X=Y。
function assignDottedPairs(target, prefix, value) {
  // parseKeyValuePairs 会过滤空值，并兼容逗号分隔格式。
  parseKeyValuePairs(value).forEach(([key, pairValue]) => {
    // 组装成 TOML emitter 能识别的 dotted key。
    target[`${prefix}.${key}`] = pairValue;
  });
}

// 克隆指定功能的默认配置，避免多个功能块共享同一个对象。
function cloneConfig(modeId) {
  // 找不到 modeId 时回退到 TCP 默认值。
  return { ...(modeDefaults[modeId] || modeDefaults.tcp) };
}

// 根据高级选项表单生成代理高级配置片段。
function buildAdvanced(config) {
  // advanced 最终会合并进 [[proxies]] 条目。
  const advanced = {};

  // 仅在用户开启对应功能时输出字段，保持配置简洁。
  if (config.useEncryption) advanced["transport.useEncryption"] = true;
  // 仅在用户开启压缩时输出字段。
  if (config.useCompression) advanced["transport.useCompression"] = true;
  // 带宽限制需要同时输出限制值和生效侧。
  if (config.enableBandwidth) {
    advanced["transport.bandwidthLimit"] = cleanString(config.bandwidthLimit);
    advanced["transport.bandwidthLimitMode"] = cleanString(config.bandwidthLimitMode);
  }
  // 负载均衡组需要 group 和 groupKey 同时存在。
  if (config.enableLoadBalance) {
    advanced["loadBalancer.group"] = cleanString(config.group);
    advanced["loadBalancer.groupKey"] = cleanString(config.groupKey);
  }
  // 健康检查支持 TCP 和 HTTP 两种方式。
  if (config.enableHealthCheck) {
    advanced["healthCheck.type"] = cleanString(config.healthCheckType);
    // HTTP 健康检查才需要 path。
    if (config.healthCheckType === "http") {
      advanced["healthCheck.path"] = cleanString(config.healthCheckPath);
    }
    // 数字字段使用 asNumber 兜底，避免空值写出非法 TOML。
    advanced["healthCheck.intervalSeconds"] = asNumber(config.healthCheckIntervalSeconds, 10);
    advanced["healthCheck.timeoutSeconds"] = asNumber(config.healthCheckTimeoutSeconds, 3);
    advanced["healthCheck.maxFailed"] = asNumber(config.healthCheckMaxFailed, 3);
  }
  // Proxy Protocol 用于把真实源地址传给本地服务。
  if (config.enableProxyProtocol) {
    advanced["transport.proxyProtocolVersion"] = cleanString(config.proxyProtocolVersion);
  }
  // metadatas 使用 dotted key 展开为 metadatas.xxx。
  if (config.enableMetadatas) {
    assignDottedPairs(advanced, "metadatas", config.metadatas);
  }

  // 返回可合并到代理条目的高级配置。
  return advanced;
}

// 根据功能类型和表单状态生成一个 [[proxies]] 条目。
function buildProxy(modeId, config, advancedConfig) {
  // 先构建高级代理能力，再按不同模式合并。
  const advanced = buildAdvanced(advancedConfig);

  // HTTP 模式需要处理域名、路径、Basic Auth 和请求/响应头。
  if (modeId === "http") {
    // proxy 是 HTTP 代理条目。
    const proxy = {
      name: cleanString(config.name),
      type: "http",
      localIP: cleanString(config.localIP),
      localPort: asNumber(config.localPort, 8080),
      customDomains: splitList(config.customDomains),
      subdomain: cleanString(config.subdomain),
      locations: splitList(config.locations),
      httpUser: cleanString(config.httpUser),
      httpPassword: cleanString(config.httpPassword),
      hostHeaderRewrite: cleanString(config.hostHeaderRewrite),
      routeByHTTPUser: cleanString(config.routeByHTTPUser),
      ...advanced,
    };
    // 请求头设置使用 requestHeaders.set.* dotted key。
    assignDottedPairs(proxy, "requestHeaders.set", config.requestHeaders);
    // 响应头设置使用 responseHeaders.set.* dotted key。
    assignDottedPairs(proxy, "responseHeaders.set", config.responseHeaders);
    // 返回 HTTP 代理条目。
    return proxy;
  }

  // HTTPS 模式只做 TLS/SNI 层转发，不负责本地证书终止。
  if (modeId === "https") {
    return {
      name: cleanString(config.name),
      type: "https",
      localIP: cleanString(config.localIP),
      localPort: asNumber(config.localPort, 443),
      customDomains: splitList(config.customDomains),
      subdomain: cleanString(config.subdomain),
      ...advanced,
    };
  }

  // TCPMUX 模式通过 HTTP CONNECT 入口复用端口。
  if (modeId === "tcpmux") {
    return {
      name: cleanString(config.name),
      type: "tcpmux",
      multiplexer: cleanString(config.multiplexer),
      localIP: cleanString(config.localIP),
      localPort: asNumber(config.localPort, 22),
      customDomains: splitList(config.customDomains),
      ...advanced,
    };
  }

  // STCP/XTCP/P2P/SUDP 都需要服务方 proxies 和访问方 visitors 配合。
  if (["stcp", "xtcp", "p2p", "sudp"].includes(modeId)) {
    return {
      name: cleanString(config.name),
      type: modeId === "stcp" || modeId === "sudp" ? modeId : "xtcp",
      localIP: cleanString(config.localIP),
      localPort: asNumber(config.localPort, modeId === "sudp" ? 53 : 3389),
      secretKey: cleanString(config.secretKey),
      allowUsers: splitList(config.allowUsers),
      ...advanced,
    };
  }

  // pluginMap 定义各类 frpc 插件和协议转换模板。
  const pluginMap = {
    // HTTP Proxy 插件通过 TCP remotePort 暴露本地 HTTP 代理。
    http_proxy: {
      type: "tcp",
      remotePort: asNumber(config.remotePort, 8080),
      "plugin.type": "http_proxy",
      "plugin.httpUser": cleanString(config.httpUser),
      "plugin.httpPassword": cleanString(config.httpPassword),
    },
    // SOCKS5 插件通过 TCP remotePort 暴露本地 SOCKS5 代理。
    socks5: {
      type: "tcp",
      remotePort: asNumber(config.remotePort, 1080),
      "plugin.type": "socks5",
      "plugin.username": cleanString(config.username),
      "plugin.password": cleanString(config.password),
    },
    // Static File 插件通过 TCP remotePort 暴露本地目录。
    static_file: {
      type: "tcp",
      remotePort: asNumber(config.remotePort, 8081),
      "plugin.type": "static_file",
      "plugin.localPath": cleanString(config.localPath),
      "plugin.stripPrefix": cleanString(config.stripPrefix),
      "plugin.httpUser": cleanString(config.httpUser),
      "plugin.httpPassword": cleanString(config.httpPassword),
    },
    // Unix Socket 插件把 TCP 连接转发到本机 Unix Socket。
    unix_socket: {
      type: "tcp",
      remotePort: asNumber(config.remotePort, 9000),
      "plugin.type": "unix_domain_socket",
      "plugin.unixPath": cleanString(config.unixPath),
    },
    // HTTP2HTTPS 插件把 HTTP 入口转换为本地 HTTPS。
    http2https: {
      type: "http",
      customDomains: splitList(config.customDomains),
      "plugin.type": "http2https",
      "plugin.localAddr": cleanString(config.localAddr),
      "plugin.hostHeaderRewrite": cleanString(config.hostHeaderRewrite),
    },
    // HTTPS2HTTP 插件把 HTTPS 入口转换为本地 HTTP。
    https2http: {
      type: "https",
      customDomains: splitList(config.customDomains),
      "plugin.type": "https2http",
      "plugin.localAddr": cleanString(config.localAddr),
      "plugin.crtPath": cleanString(config.crtPath),
      "plugin.keyPath": cleanString(config.keyPath),
      "plugin.hostHeaderRewrite": cleanString(config.hostHeaderRewrite),
    },
    // HTTPS2HTTPS 插件把 HTTPS 入口转换为本地 HTTPS。
    https2https: {
      type: "https",
      customDomains: splitList(config.customDomains),
      "plugin.type": "https2https",
      "plugin.localAddr": cleanString(config.localAddr),
      "plugin.crtPath": cleanString(config.crtPath),
      "plugin.keyPath": cleanString(config.keyPath),
      "plugin.hostHeaderRewrite": cleanString(config.hostHeaderRewrite),
    },
  };

  // 命中插件模板时合并 name 和高级配置。
  if (pluginMap[modeId]) {
    return { name: cleanString(config.name), ...pluginMap[modeId], ...advanced };
  }

  // 默认分支处理 TCP/UDP/SSH，SSH 在配置层面就是 TCP。
  const fallback = modeId === "udp" ? modeDefaults.udp : modeDefaults.tcp;
  // 返回基础 TCP/UDP 代理条目。
  return {
    name: cleanString(config.name),
    type: modeId === "udp" ? "udp" : "tcp",
    localIP: cleanString(config.localIP),
    localPort: asNumber(config.localPort, fallback.localPort),
    remotePort: asNumber(config.remotePort, fallback.remotePort),
    ...advanced,
  };
}

// 创建 FRP 参考配置生成器。
export function createFrpGenerator() {
  // endpoint 保存当前生成服务端还是客户端配置，默认值来自 schema。
  const endpoint = createStateFromSchema(schema.endpoint);
  // newMode 保存新增客户端功能时选择的代理类型。
  const newMode = reactive(cloneSchemaValue(schema.newMode));
  // features 保存 frpc 端已添加的功能块。
  const features = reactive([]);
  // featureSerial 用于生成稳定 id 和默认名称后缀。
  let featureSerial = 1;

  // server/client 保存 frps/frpc 基础表单状态，默认值来自 schema。
  const server = createStateFromSchema(schema.server);
  const client = createStateFromSchema(schema.client);

  // endpointGroup 是 frps/frpc 共用的端类型选择字段组。
  const endpointGroup = {
    title: schema.endpoint.group.title,
    icon: schema.endpoint.group.icon,
    model: endpoint,
    fields: cloneSchemaValue(schema.endpoint.group.fields),
  };

  const serverGroups = [endpointGroup, ...createFieldGroupsFromSchema(schema.server, server)];
  const clientGroups = [endpointGroup, ...createFieldGroupsFromSchema(schema.client, client)];

  // 创建一个新的客户端功能块。
  function createFeature(modeId) {
    // 当前序号用于 id 和默认名称后缀。
    const serial = featureSerial;
    // 序号立即递增，确保删除后再新增也不会重复。
    featureSerial += 1;
    // 克隆模式默认值，避免不同功能共享同一对象。
    const config = cloneConfig(modeId);

    // 第二个及之后的功能自动给 name 加后缀，减少重名风险。
    if (serial > 1 && config.name) config.name = `${config.name}-${serial}`;
    // 第二个及之后的 visitor 也自动加后缀。
    if (serial > 1 && config.visitorName) config.visitorName = `${config.visitorName}-${serial}`;

    // 返回功能块状态，包含基础参数和高级参数两部分。
    return {
      // id 只用于 Vue 列表渲染。
      id: `frp-feature-${serial}`,
      // modeId 记录当前功能类型。
      modeId,
      // config 保存功能参数。
      config,
      // advanced 保存高级代理参数。
      advanced: createAdvancedDefaults(),
    };
  }

  // 新增一个当前选择类型的客户端功能块。
  function addFeature() {
    features.push(createFeature(newMode.value));
  }

  // 删除指定客户端功能块。
  function removeFeature(feature) {
    const index = features.indexOf(feature);
    if (index !== -1) features.splice(index, 1);
  }

  // 切换已添加功能的类型，并重置对应字段。
  function updateFeatureMode(feature, modeId) {
    feature.modeId = modeId;
    feature.config = cloneConfig(modeId);
    feature.advanced = createAdvancedDefaults();
  }

  // 根据 frps 表单状态生成 frps.toml。
  function generateServerToml() {
    // root 保存 TOML 根级配置，dotted key 会由 renderToml 转成嵌套表。
    const root = {
      // frps 主监听地址。
      bindAddr: cleanString(server.bindAddr),
      // frps 控制连接端口。
      bindPort: asNumber(server.bindPort, 9550),
      // 代理监听地址。
      proxyBindAddr: cleanString(server.proxyBindAddr),
      // 鉴权方式。
      "auth.method": server.authMethod,
      // token 方式才输出 auth.token，OIDC 预留由后续字段扩展。
      "auth.token": server.authMethod === "token" ? cleanString(server.authToken) : "",
      // 附加鉴权范围从逗号分隔文本转为数组。
      "auth.additionalScopes": splitList(server.authAdditionalScopes),
      // 最大连接池数量。
      "transport.maxPoolCount": asNumber(server.maxPoolCount, 5),
      // 心跳超时。
      "transport.heartbeatTimeout": asNumber(server.heartbeatTimeout, 90),
      // 是否强制 TLS。
      "transport.tls.force": Boolean(server.tlsForce),
      "transport.tls.certFile": server.tlsForce ? cleanString(server.tlsCertFile) : "",
      "transport.tls.keyFile": server.tlsForce ? cleanString(server.tlsKeyFile) : "",
      "transport.tls.trustedCaFile": server.tlsForce ? cleanString(server.tlsTrustedCaFile) : "",
      // 是否开启 TCP 多路复用。
      "transport.tcpMux": Boolean(server.tcpMux),
      // TCP 多路复用保活间隔，关闭时交给 renderToml 过滤空值。
      "transport.tcpMuxKeepaliveInterval": server.tcpMux ? asNumber(server.tcpMuxKeepaliveInterval, 30) : "",
      // XTCP/P2P NAT 打洞 STUN 服务。
      natHoleStunServer: cleanString(server.natHoleStunServer),
      // HTTP 二级域名公共后缀。
      subDomainHost: cleanString(server.subDomainHost),
      // 自定义 404 页面路径。
      custom404Page: cleanString(server.custom404Page),
    };

    // 可选协议入口只在开关开启时输出。
    if (server.enableUDP) root.bindUDPPort = asNumber(server.bindUDPPort, 9550);
    if (server.enableKCP) root.kcpBindPort = asNumber(server.kcpBindPort, 9550);
    if (server.enableQUIC) root.quicBindPort = asNumber(server.quicBindPort, 9550);
    if (server.enableTCPMux) root.tcpmuxHTTPConnectPort = asNumber(server.tcpmuxHTTPConnectPort, 9554);
    // HTTP/HTTPS vhost 端口按开关输出。
    if (server.enableHTTP) root.vhostHTTPPort = asNumber(server.vhostHTTPPort, 9551);
    if (server.enableHTTPS) root.vhostHTTPSPort = asNumber(server.vhostHTTPSPort, 9553);
    // Dashboard 配置只在启用时输出。
    if (server.enableDashboard) {
      root["webServer.addr"] = cleanString(server.dashboardAddr);
      root["webServer.port"] = asNumber(server.dashboardPort, 9552);
      root["webServer.user"] = cleanString(server.dashboardUser);
      root["webServer.password"] = cleanString(server.dashboardPassword);
    }
    // allowPorts 使用 FRP 支持的内联表数组格式。
    if (server.enableAllowPorts) {
      root.allowPorts = [{ start: asNumber(server.allowPortStart, 9554), end: asNumber(server.allowPortEnd, 9570) }];
    }
    // 日志配置只在启用时输出。
    if (server.enableLog) {
      root["log.to"] = cleanString(server.logTo);
      root["log.level"] = cleanString(server.logLevel);
      root["log.maxDays"] = asNumber(server.logMaxDays, 3);
    }

    if (server.authMethod === "oidc") {
      root["auth.oidc.issuer"] = cleanString(server.oidcIssuer);
      root["auth.oidc.audience"] = cleanString(server.oidcAudience);
      root["auth.oidc.skipExpiryCheck"] = Boolean(server.oidcSkipExpiryCheck);
      root["auth.oidc.skipIssuerCheck"] = Boolean(server.oidcSkipIssuerCheck);
    }

    // renderToml 负责输出中文注释、嵌套表和尾部换行。
    return renderToml({ fileName: "frps.toml", root, rootComments: serverRootComments });
  }

  // 根据 frpc 基础表单状态生成 TOML 根配置。
  function buildClientRoot() {
    // root 保存 frpc 根级配置。
    const root = {
      // frps 地址和端口。
      serverAddr: cleanString(client.serverAddr),
      serverPort: asNumber(client.serverPort, 9550),
      // user 会影响服务端看到的代理名前缀。
      user: cleanString(client.user),
      // 登录失败是否退出。
      loginFailExit: Boolean(client.loginFailExit),
      // 传输协议。
      "transport.protocol": cleanString(client.transportProtocol),
      // 心跳间隔和超时。
      "transport.heartbeatInterval": asNumber(client.heartbeatInterval, 30),
      "transport.heartbeatTimeout": asNumber(client.heartbeatTimeout, 90),
      // TCP 多路复用开关和保活间隔。
      "transport.tcpMux": Boolean(client.tcpMux),
      "transport.tcpMuxKeepaliveInterval": client.tcpMux ? asNumber(client.tcpMuxKeepaliveInterval, 30) : "",
      // 可选代理 URL，用于通过 HTTP/SOCKS5 代理连接 frps。
      "transport.proxyURL": cleanString(client.proxyURL),
      // 当前 UI 默认使用 token 鉴权。
      "auth.method": cleanString(client.authMethod) || "token",
      "auth.token": client.authMethod === "token" ? cleanString(client.authToken) : "",
      "auth.additionalScopes": splitList(client.authAdditionalScopes),
      // 预建立工作连接池数量。
      "transport.poolCount": asNumber(client.poolCount, 5),
    };

    // TLS 开启时输出 TLS 子配置。
    if (client.tlsEnable) {
      root["transport.tls.enable"] = true;
      root["transport.tls.serverName"] = cleanString(client.tlsServerName);
      root["transport.tls.certFile"] = cleanString(client.tlsCertFile);
      root["transport.tls.keyFile"] = cleanString(client.tlsKeyFile);
      root["transport.tls.trustedCaFile"] = cleanString(client.tlsTrustedCaFile);
      root["transport.tls.disableCustomTLSFirstByte"] = Boolean(client.tlsDisableCustomTLSFirstByte);
    }
    // AdminServer 开启时输出 webServer 子配置。
    if (client.enableAdmin) {
      root["webServer.addr"] = cleanString(client.adminAddr);
      root["webServer.port"] = asNumber(client.adminPort, 7400);
      root["webServer.user"] = cleanString(client.adminUser);
      root["webServer.password"] = cleanString(client.adminPassword);
    }

    if (client.authMethod === "oidc") {
      root["auth.oidc.clientID"] = cleanString(client.oidcClientID);
      root["auth.oidc.clientSecret"] = cleanString(client.oidcClientSecret);
      root["auth.oidc.audience"] = cleanString(client.oidcAudience);
      root["auth.oidc.tokenEndpointURL"] = cleanString(client.oidcTokenEndpointURL);
      root["auth.oidc.scope"] = cleanString(client.oidcScope);
      root["auth.oidc.trustedCaFile"] = cleanString(client.oidcTrustedCaFile);
      root["auth.oidc.insecureSkipVerify"] = Boolean(client.oidcInsecureSkipVerify);
      root["auth.oidc.proxyURL"] = cleanString(client.oidcProxyURL);
      assignDottedPairs(root, "auth.oidc.additionalEndpointParams", client.oidcAdditionalEndpointParams);
    }

    // 返回根配置，由 generateClientToml 继续合并 start 列表。
    return root;
  }

  // 根据 STCP/XTCP/P2P/SUDP 配置生成访问方 [[visitors]] 条目。
  function buildVisitor(modeId, config) {
    // serverName 需要和服务方代理名称匹配；有 user 时 FRP 会带 user 前缀。
    const serverName = cleanString(client.user)
      ? `${cleanString(client.user)}.${cleanString(config.name)}`
      : cleanString(config.name);
    // visitor 保存访问方配置。
    const visitor = {
      name: cleanString(config.visitorName),
      type: modeId === "stcp" || modeId === "sudp" ? modeId : "xtcp",
      serverName,
      secretKey: cleanString(config.secretKey),
      bindAddr: cleanString(config.bindAddr),
      bindPort: asNumber(config.bindPort, 6000),
    };

    // XTCP/P2P 支持 keepTunnelOpen，STCP/SUDP 不输出该字段。
    if (modeId !== "stcp" && modeId !== "sudp") {
      visitor.keepTunnelOpen = Boolean(config.keepTunnelOpen);
    }

    // 返回访问方条目。
    return visitor;
  }

  // 根据一个功能块生成对应的 TOML section 列表。
  function buildFeatureSections(feature, index) {
    // label 用于写入每段配置前的中文注释。
    const label = `功能 ${index + 1}: ${getModeDefinition(feature.modeId).title}`;

    // 端口范围模式会展开为多个 [[proxies]]。
    if (feature.modeId === "range") {
      // localStart 是本地端口起点。
      const localStart = asNumber(feature.config.localPortStart, 6000);
      // localEnd 至少不能小于 localStart。
      const localEnd = Math.max(localStart, asNumber(feature.config.localPortEnd, localStart));
      // remoteStart 是公网端口起点。
      const remoteStart = asNumber(feature.config.remotePortStart, 9600);
      const totalCount = localEnd - localStart + 1;
      // 大范围端口使用 FRP 支持的 Go template，避免静默截断。
      if (totalCount > 20) {
        const remoteEnd = remoteStart + totalCount - 1;
        const advancedLines = renderTomlEntries(buildAdvanced(feature.advanced));
        return [
          {
            raw: [
              `# ${label}，端口范围使用 Go template 展开，避免大范围端口被截断。`,
              `{{- range $_, $v := parseNumberRangePair "${localStart}-${localEnd},${remoteStart}-${remoteEnd}" }}`,
              "[[proxies]]",
              `name = "${cleanString(feature.config.name)}-{{ $v.First }}"`,
              `type = "${cleanString(feature.config.rangeType) || "tcp"}"`,
              `localIP = "${cleanString(feature.config.localIP)}"`,
              "localPort = {{ $v.First }}",
              "remotePort = {{ $v.Second }}",
              ...advancedLines,
              "{{- end }}",
            ].join("\n"),
          },
        ];
      }
      const count = totalCount;
      // 逐段生成 proxies section。
      return Array.from({ length: count }, (_, offset) => ({
        name: "proxies",
        comment: offset === 0 ? `${label}，端口范围展开为多段代理` : "",
        entryComments: proxyComments,
        entries: {
          name: `${cleanString(feature.config.name)}-${localStart + offset}`,
          type: cleanString(feature.config.rangeType) || "tcp",
          localIP: cleanString(feature.config.localIP),
          localPort: localStart + offset,
          remotePort: remoteStart + offset,
          ...buildAdvanced(feature.advanced),
        },
      }));
    }

    // 普通模式至少生成一个 [[proxies]]。
    const sections = [
      {
        name: "proxies",
        comment: feature.modeId === "ssh" ? `${label}，SSH 实际使用 TCP 代理` : `${label} 服务提供方代理`,
        entryComments: proxyComments,
        entries: buildProxy(feature.modeId, feature.config, feature.advanced),
      },
    ];

    // 安全代理模式同时生成访问方 [[visitors]] 示例。
    if (["stcp", "xtcp", "p2p", "sudp"].includes(feature.modeId)) {
      sections.push({
        name: "visitors",
        comment: `${label} 访问方配置`,
        entryComments: visitorComments,
        entries: buildVisitor(feature.modeId, feature.config),
      });
    }

    // 返回当前功能块对应的 section 列表。
    return sections;
  }

  // 生成完整 frpc.toml。
  function generateClientToml() {
    // 把所有功能块展开为 proxies/visitors section。
    const builtSections = features.flatMap((feature, index) => buildFeatureSections(feature, index));
    const sections = builtSections.filter((section) => !section.raw);
    const rawSections = builtSections.map((section) => section.raw).filter(Boolean);
    // 先生成 frpc 根配置。
    const root = buildClientRoot();

    // start 列表开启时，自动收集所有代理和访问方名称。
    if (client.enableStartList) {
      root.start = [
        ...new Set([
          ...sections
            .filter((section) => section.name === "proxies" || section.name === "visitors")
            .map((section) => section.entries.name)
            .filter(Boolean),
          ...splitList(client.extraStartNames),
        ]),
      ];
    }

    // renderToml 统一输出中文注释、根表和重复 section。
    const toml = renderToml({
      fileName: "frpc.toml",
      root,
      rootComments: clientRootComments,
      sections,
    });
    return rawSections.length ? `${toml}\n${rawSections.join("\n\n")}\n` : toml;
  }

  // 生成 HTTP/HTTPS 使用说明时优先展示 customDomains，其次展示 subdomain。
  function displayDomain(config) {
    // customDomains 有值时取第一个域名作为访问示例。
    const domains = splitList(config.customDomains);
    if (domains.length) return domains[0];
    // subdomain 和 frps subDomainHost 都有值时拼接完整域名。
    if (cleanString(config.subdomain) && cleanString(server.subDomainHost)) {
      return `${cleanString(config.subdomain)}.${cleanString(server.subDomainHost)}`;
    }
    // 都没有时返回占位域名，提醒用户替换。
    return "your-domain.example";
  }

  // 根据一个客户端功能块生成使用说明片段。
  function featureUsage(feature, index) {
    // modeId 是当前功能类型。
    const modeId = feature.modeId;
    // config 是当前功能参数。
    const config = feature.config;
    // title 是用户可读功能名称。
    const title = getModeDefinition(modeId).title;
    // lines 保存当前功能的说明文本。
    const lines = [`功能 ${index + 1}: ${title}`];

    // SSH 输出完整 ssh 命令。
    if (modeId === "ssh") {
      lines.push(`- SSH: ssh -p ${config.remotePort} ${config.sshUser}@${client.serverAddr}`);
    // TCP 输出公网端口到本地端口的映射关系。
    } else if (modeId === "tcp") {
      lines.push(`- 公网访问: ${client.serverAddr}:${config.remotePort} -> ${config.localIP}:${config.localPort}`);
    // UDP 输出 UDP 映射关系。
    } else if (modeId === "udp") {
      lines.push(`- UDP 访问: ${client.serverAddr}:${config.remotePort}/udp -> ${config.localIP}:${config.localPort}/udp`);
    // HTTP 输出基于 vhostHTTPPort 的访问地址。
    } else if (modeId === "http") {
      lines.push(`- 访问地址: http://${displayDomain(config)}:${server.vhostHTTPPort}`);
    // HTTPS 输出基于 vhostHTTPSPort 的访问地址。
    } else if (modeId === "https") {
      lines.push(`- 访问地址: https://${displayDomain(config)}:${server.vhostHTTPSPort}`);
    // 安全代理说明访问方本地监听地址。
    } else if (["stcp", "xtcp", "p2p", "sudp"].includes(modeId)) {
      lines.push(`- 访问方本地连接 ${config.bindAddr}:${config.bindPort}，流量转发到服务方 ${config.localIP}:${config.localPort}`);
    // 端口范围说明展开关系。
    } else if (modeId === "range") {
      lines.push(`- 已展开 ${config.localPortStart}-${config.localPortEnd} 到公网连续端口 ${config.remotePortStart} 起。`);
    // 插件类给出通用说明。
    } else {
      lines.push("- 插件或协议转换流量由 frpc 在本地处理。");
    }

    // 返回当前功能说明。
    return lines;
  }

  // 返回通用工作台消费的生成器接口。
  return {
    // id 用于顶部 Tab 识别。
    id: "frp",
    // title 是顶部 Tab 展示名称。
    title: "FRP",
    // summary 是生成器摘要。
    summary: "frps / frpc TOML 生成",
    // icon 映射到 lucide 图标。
    icon: "Network",
    // language 用于代码预览语言标签。
    language: "TOML",
    // 根据当前端类型决定下载文件名。
    fileName: () => (endpoint.value === "frps" ? "frps.toml" : "frpc.toml"),
    // 根据当前端类型决定面板标题。
    panelTitle: () => (endpoint.value === "frps" ? "服务端 frps.toml" : "客户端 frpc.toml"),
    // 根据当前端类型决定面板说明。
    panelLead: () =>
      endpoint.value === "frps"
        ? "设置 frps 监听、鉴权、vhost、Dashboard 和端口范围。"
        : "先填写连接 frps 的基础配置，再按需新增 SSH、HTTP、UDP 等代理功能。",
    // frps 显示服务端字段组，frpc 显示客户端基础字段组。
    getFieldGroups: () => (endpoint.value === "frps" ? serverGroups : clientGroups),
    // 只有 frpc 需要动态新增功能块。
    getBlocks: () =>
      endpoint.value === "frpc"
        ? [
            {
              // 客户端功能块用于新增和管理 proxies/visitors。
              title: "客户端功能",
              icon: "Plus",
              addLabel: "添加功能",
              add: {
                model: newMode,
                key: "value",
                label: "功能类型",
                hint: getModeDefinition(newMode.value).summary,
                options: proxyModeOptions,
              },
              // 新增按钮调用 addFeature。
              onAdd: addFeature,
              emptyTitle: "还没有添加代理功能",
              emptyText: "选择 SSH、HTTP、UDP 等功能后点击添加，右侧会追加对应配置。",
              // 返回已添加功能列表。
              getItems: () => features,
              // 动态卡片标题。
              getTitle: (feature, index) => `功能 ${index + 1}: ${getModeDefinition(feature.modeId).title}`,
              // 动态卡片摘要。
              getSummary: (feature) => getModeDefinition(feature.modeId).summary,
              // 动态卡片图标。
              getIcon: (feature) => getModeDefinition(feature.modeId).icon,
              // 允许已添加功能直接切换类型。
              typeOptions: proxyModeOptions,
              // 当前功能类型。
              getType: (feature) => feature.modeId,
              // 切换功能类型时重置字段。
              onTypeChange: updateFeatureMode,
              // 删除功能块。
              onRemove: removeFeature,
              // 返回当前功能的参数字段组和高级字段组。
              getGroups: (feature) => [
                {
                  title: "功能参数",
                  icon: getModeDefinition(feature.modeId).icon,
                  docUrl: getModeDocUrl(feature.modeId),
                  model: feature.config,
                  fields: modeFields[feature.modeId] || modeFields.tcp,
                },
                {
                  title: "代理高级功能",
                  icon: "Shield",
                  collapsible: true,
                  docUrl: "https://gofrp.org/zh-cn/docs/features/common/",
                  model: feature.advanced,
                  fields: advancedFields,
                },
              ],
            },
          ]
        : [],
    // 根据当前端类型生成 TOML。
    generateConfig: () => (endpoint.value === "frps" ? generateServerToml() : generateClientToml()),
    // 根据当前端类型生成中文使用说明。
    generateUsage: () => {
      // frps 使用说明强调服务器启动和防火墙放行。
      if (endpoint.value === "frps") {
        return [
          "1. 保存右侧内容为 frps.toml。",
          "2. 在服务器运行: frps -c ./frps.toml。",
          `3. 防火墙放行 bindPort=${server.bindPort}，以及已启用的 vhost / remotePort 端口。`,
        ].join("\n");
      }

      // frpc 基础说明包含保存和启动命令。
      const lines = ["1. 保存右侧内容为 frpc.toml。", "2. 在客户端运行: frpc -c ./frpc.toml。"];
      // 没有新增功能时提示用户继续添加代理。
      if (!features.length) {
        lines.push("3. 当前只生成客户端基础连接配置；点击新增功能后会追加代理配置。");
        return lines.join("\n");
      }
      // 有功能时逐个追加功能说明。
      features.forEach((feature, index) => lines.push("", ...featureUsage(feature, index)));
      // 返回完整说明。
      return lines.join("\n");
    },
    // 暴露 FRP 官方功能知识库(AI verify 上下文)。
    getReference: () => reference,
    // frp 字段结构复杂(18 mode + features 块), generate 模式暂不支持, 仅保留接口。
    applyAIState: () => {
      throw new Error("frp generate 模式暂不支持, 请改用 verify 模式");
    },
  };
}
