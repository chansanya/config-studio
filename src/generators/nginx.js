// 引入 Vue 的 reactive，用来维护 Nginx 生成器的动态 server/upstream/location 状态。
import { reactive } from "vue";
// 引入 Nginx 表单 schema，全局/server/upstream/location 默认值、字段和块文案都从这里读取。
import schema from "./nginx/schema.json";
// 引入 Nginx 配置项参考(AI verify 上下文)。
import reference from "./nginx/reference-doc.json";
// 引入 schema 深拷贝工具，避免动态块之间共享对象引用。
import {
  applyStateFromSchema,
  cloneSchemaValue,
  createFieldGroupsFromSchema,
  createStateFromSchema,
  mergeKnownFields,
  pickAIArray,
  pickAIChildObject,
} from "./loader";
// 引入共享工具，统一处理数字兜底、字符串清理、列表和键值对解析。
import { asNumber, cleanString, parseKeyValuePairs, splitList } from "./shared";

// schema 默认值里可使用 {serial} 占位符，新增块时替换成递增编号。
function applySerialTemplate(value, serial) {
  return typeof value === "string" ? value.replaceAll("{serial}", String(serial)) : value;
}

// 创建一个 Nginx server 块的默认状态。
function createServer(serial = 1) {
  const serialTemplate = serial === 1 ? schema.server.first : schema.server.next;
  const serialValues = Object.fromEntries(
    Object.entries(serialTemplate).map(([key, value]) => [
      key,
      applySerialTemplate(value, serial),
    ]),
  );

  return {
    id: `nginx-server-${serial}`,
    ...cloneSchemaValue(schema.server.defaults),
    ...serialValues,
  };
}

// 创建一个 Nginx location 块的默认状态。
function createLocation(serial = 1, serverName = "example.com") {
  return {
    id: `nginx-location-${serial}`,
    ...cloneSchemaValue(schema.location.defaults),
    serverName,
  };
}

// 创建一个 Nginx upstream 块的默认状态。
function createUpstream(serial = 1) {
  const serialTemplate = serial === 1 ? schema.upstream.first : schema.upstream.next;
  const serialValues = Object.fromEntries(
    Object.entries(serialTemplate).map(([key, value]) => [
      key,
      applySerialTemplate(value, serial),
    ]),
  );

  return {
    id: `nginx-upstream-${serial}`,
    ...cloneSchemaValue(schema.upstream.defaults),
    ...serialValues,
  };
}

// 创建 Nginx 参考配置生成器。
export function createNginxGenerator() {
  // global 保存 nginx events/http 级生产参数。
  const global = createStateFromSchema(schema.global);
  // addServerModel 保存新增 server 控件状态。
  const addServerModel = reactive({ [schema.blocks.server.add.key]: "server" });
  // addUpstreamModel 保存新增 upstream 控件状态。
  const addUpstreamModel = reactive({ [schema.blocks.upstream.add.key]: "upstream" });
  // addLocationModel 保存新增 location 类型。
  const addLocationModel = reactive({ [schema.blocks.location.add.key]: "static" });
  // servers 保存全部动态 server 配置。
  const servers = reactive([createServer(1)]);
  // upstreams 保存全部 upstream 负载均衡组配置。
  const upstreams = reactive([createUpstream(1)]);
  // locations 保存全部动态 location 配置。
  const locations = reactive([createLocation(1)]);
  // serverSerial 为新增 server 提供递增编号。
  let serverSerial = 2;
  // upstreamSerial 为新增 upstream 提供递增编号。
  let upstreamSerial = 2;
  // locationSerial 为新增 location 提供递增编号。
  let locationSerial = 2;

  // 字段和块文案来自 schema，server/upstream/location 关联和渲染逻辑仍保留在本模块。
  const serverFields = cloneSchemaValue(schema.server.fields);
  const upstreamFields = cloneSchemaValue(schema.upstream.fields);
  const locationFields = cloneSchemaValue(schema.location.fields);
  const globalGroups = createFieldGroupsFromSchema(schema.global, global);
  const serverBlock = schema.blocks.server;
  const upstreamBlock = schema.blocks.upstream;
  const locationBlock = schema.blocks.location;

  // 新增 server 并递增编号。
  function addServer() {
    servers.push(createServer(serverSerial));
    serverSerial += 1;
  }

  // 新增 upstream 并递增编号。
  function addUpstream() {
    upstreams.push(createUpstream(upstreamSerial));
    upstreamSerial += 1;
  }

  // 新增 location，并默认归属到第一个 server。
  function addLocation() {
    const firstServerName = cleanString(servers[0]?.serverName).split(/\s+/)[0] || "example.com";
    const location = createLocation(locationSerial, firstServerName);
    location.type = addLocationModel[schema.blocks.location.add.key];
    locations.push(location);
    locationSerial += 1;
  }

  // 从指定集合中删除一个对象。
  function removeItem(collection, item) {
    const index = collection.indexOf(item);
    if (index !== -1) collection.splice(index, 1);
  }

  // 将逗号分隔的响应头键值对渲染为 add_header 指令。
  function renderHeaders(headersText, indent = "    ") {
    return parseKeyValuePairs(headersText).map(
      ([key, value]) => `${indent}add_header ${key} "${value}" always;`,
    );
  }

  // Nginx 支持一个 server_name 写多个域名，location 归属只取第一个作为匹配主机。
  function firstServerName(serverName) {
    return cleanString(serverName).split(/\s+/)[0] || "example.com";
  }

  // location 表单用 serverName 关联 server，这里查到对应 server 以决定协议和端口。
  function findServerForLocation(location) {
    const targetServerName = cleanString(location.serverName);
    return servers.find((server) => firstServerName(server.serverName) === targetServerName);
  }

  // 用户输入路径时可省略前导斜杠，输出和摘要统一补成 Nginx location 语义。
  function locationPath(path) {
    const currentPath = cleanString(path) || "/";
    return currentPath.startsWith("/") ? currentPath : `/${currentPath}`;
  }

  // 生成 location 摘要里展示的完整访问 URL，帮助用户确认它挂在哪个 server 下。
  function locationMatchUrl(location) {
    const server = findServerForLocation(location);
    const host = firstServerName(server?.serverName || location.serverName);
    const scheme = server?.enableHttps ? "https" : "http";
    const port = !server?.enableHttps && asNumber(server?.listenPort, 80) !== 80
      ? `:${asNumber(server?.listenPort, 80)}`
      : "";

    return `${scheme}://${host}${port}${locationPath(location.path)}`;
  }

  // location 卡片摘要根据类型展示不同目标：反代上游、重定向地址或静态目录。
  function locationTarget(location) {
    if (location.type === "proxy") {
      return cleanString(location.proxyPass) || "未设置上游";
    }

    if (location.type === "redirect") {
      return cleanString(location.redirectTarget) || "未设置重定向";
    }

    return cleanString(location.aliasRoot) || "server root";
  }

  // 将一个 upstream 状态对象渲染为 nginx upstream 块。
  function renderUpstream(upstream) {
    const name = cleanString(upstream.name) || "app_backend";
    const servers = splitList(upstream.servers);
    const lines = [
      `# ${name} upstream 负载均衡组。`,
      `upstream ${name} {`,
    ];

    if (upstream.strategy && upstream.strategy !== "round_robin") {
      lines.push(`    ${cleanString(upstream.strategy)};`);
    }

    (servers.length ? servers : ["app:3000"]).forEach((server) => {
      lines.push(`    server ${server};`);
    });

    if (upstream.enableKeepalive) {
      lines.push(`    keepalive ${asNumber(upstream.keepalive, 32)};`);
    }

    lines.push("}");
    return lines;
  }

  // 将一个 location 状态对象渲染为 nginx location 块。
  function renderLocation(location) {
    // lines 保存当前 location 的指令行。
    const lines = [
      `    # 匹配 URL: ${locationMatchUrl(location)} -> ${locationTarget(location)}`,
      `    location ${cleanString(location.path) || "/"} {`,
    ];

    // proxy 模式输出反向代理基础头。
    if (location.type === "proxy") {
      lines.push(
        "        # 反向代理到上游服务。",
        `        proxy_pass ${cleanString(location.proxyPass)};`,
        "        proxy_set_header Host $host;",
        "        proxy_set_header X-Real-IP $remote_addr;",
        "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
        "        proxy_set_header X-Forwarded-Proto $scheme;",
      );
      if (cleanString(location.proxyConnectTimeout)) {
        lines.push(`        proxy_connect_timeout ${cleanString(location.proxyConnectTimeout)};`);
      }
      if (cleanString(location.proxyReadTimeout)) {
        lines.push(`        proxy_read_timeout ${cleanString(location.proxyReadTimeout)};`);
      }
      if (cleanString(location.proxySendTimeout)) {
        lines.push(`        proxy_send_timeout ${cleanString(location.proxySendTimeout)};`);
      }
      // WebSocket 和 SSE/流式响应通常都需要 HTTP/1.1。
      if (location.enableWebSocket || location.enableSse) {
        lines.push(
          "        # WebSocket / SSE 长连接使用 HTTP/1.1。",
          `        proxy_http_version ${cleanString(location.proxyHttpVersion) || "1.1"};`,
        );
      }
      // WebSocket 需要 Upgrade/Connection 头。
      if (location.enableWebSocket) {
        lines.push(
          "        # WebSocket 协议升级头。",
          "        proxy_set_header Upgrade $http_upgrade;",
          '        proxy_set_header Connection "upgrade";',
        );
      }
      // SSE 或流式响应需要尽量避免代理缓冲。
      if (location.enableSse || location.disableProxyBuffering) {
        lines.push("        # SSE / 流式响应禁用代理缓冲。", "        proxy_buffering off;");
      }
      if (location.enableSse || location.enableChunkedTransferEncoding) {
        lines.push("        # SSE / 流式响应使用分块传输。", "        chunked_transfer_encoding on;");
      }
      if (location.enableLimitReq && global.enableLimitReq) {
        lines.push(
          "        # 当前 location 请求限流。",
          `        limit_req zone=${cleanString(global.limitReqZone) || "api"} burst=${asNumber(location.limitReqBurst, 20)} nodelay;`,
        );
      }
    // redirect 模式直接返回 301。
    } else if (location.type === "redirect") {
      lines.push("        # 永久重定向。", `        return 301 ${cleanString(location.redirectTarget)};`);
    // static 模式输出 alias 和 try_files。
    } else {
      if (cleanString(location.aliasRoot)) {
        lines.push("        # 独立静态目录。", `        alias ${cleanString(location.aliasRoot)};`);
      }
      lines.push("        # 静态文件查找策略。", `        try_files ${cleanString(location.tryFiles) || "$uri $uri/ /index.html"};`);
      if (cleanString(location.expires)) {
        lines.push(`        expires ${cleanString(location.expires)};`);
      }
    }

    // 额外响应头按当前 location 缩进追加。
    const headers = renderHeaders(location.extraHeaders, "        ");
    if (headers.length) {
      lines.push("        # 当前 location 额外响应头。", ...headers);
    }

    // 关闭 location 块并返回。
    lines.push("    }");
    return lines;
  }

  // 将一个 server 状态对象渲染为 nginx server 块。
  function renderServer(server) {
    // 使用第一个 server_name 作为 location 归属匹配键。
    const firstServerName = cleanString(server.serverName).split(/\s+/)[0];
    // 只渲染归属到当前 server 的 location。
    const serverLocations = locations.filter(
      (location) => cleanString(location.serverName) === firstServerName,
    );
    // HTTPS 开启时 listen 固定为 443 ssl http2，否则使用用户输入端口。
    const listen = server.enableHttps ? "443 ssl http2" : `${asNumber(server.listenPort, 80)}`;
    // lines 保存当前 server 及其可能的重定向 server。
    const lines = [];

    // HTTPS 且启用重定向时，先生成一个 80 到 HTTPS 的 server。
    if (server.enableHttps && server.enableHttpRedirect) {
      lines.push(
        "# HTTP 到 HTTPS 重定向。",
        "server {",
        "    listen 80;",
        `    server_name ${cleanString(server.serverName)};`,
        "    return 301 https://$host$request_uri;",
        "}",
        "",
      );
    }

    // 输出主要 Web server 块。
    lines.push(
      "# Web 站点 server 配置。",
      "server {",
      `    listen ${listen};`,
      `    server_name ${cleanString(server.serverName)};`,
      "",
      "    # 默认静态根目录和首页。",
      `    root ${cleanString(server.root)};`,
      `    index ${cleanString(server.index)};`,
    );

    // HTTPS 开启时追加证书配置。
    if (server.enableHttps) {
      lines.push(
        "",
        "    # TLS 证书配置。",
        `    ssl_certificate ${cleanString(server.sslCertificate)};`,
        `    ssl_certificate_key ${cleanString(server.sslCertificateKey)};`,
        `    ssl_protocols ${cleanString(server.sslProtocols)};`,
        `    ssl_ciphers ${cleanString(server.sslCiphers)};`,
      );
    }

    // gzip 开启时追加压缩指令。
    if (server.enableGzip) {
      lines.push("", "    # gzip 压缩。", "    gzip on;", "    gzip_types text/plain text/css application/json application/javascript application/xml;");
    }

    // server 级安全响应头。
    const headers = renderHeaders(server.securityHeaders);
    if (headers.length) {
      lines.push("", "    # 基础安全响应头。", ...headers);
    }

    // 日志路径为空时不输出对应指令。
    if (cleanString(server.accessLog)) lines.push("", `    access_log ${cleanString(server.accessLog)};`);
    if (cleanString(server.errorLog)) lines.push(`    error_log ${cleanString(server.errorLog)} warn;`);

    // 渲染当前 server 下的 locations，没有配置时生成一个默认静态 location。
    lines.push("");
    if (serverLocations.length) {
      lines.push(...serverLocations.flatMap(renderLocation));
    } else {
      lines.push(...renderLocation(createLocation(0, firstServerName)));
    }
    // 关闭 server 块。
    lines.push("}");

    // 返回当前 server 片段。
    return lines;
  }

  // 生成完整 nginx.conf。
  function generateConfig() {
    // 外层固定包含 events 和 http，方便直接保存为 nginx.conf 预览。
    return `${[
      "# Generated by Config Gen",
      "",
      "events {",
      `    worker_connections ${asNumber(global.workerConnections, 1024)};`,
      "}",
      "",
      "http {",
      `    sendfile ${global.sendfile ? "on" : "off"};`,
      `    keepalive_timeout ${cleanString(global.keepaliveTimeout) || "65s"};`,
      `    client_max_body_size ${cleanString(global.clientMaxBodySize) || "10m"};`,
      `    server_tokens ${global.serverTokens ? "on" : "off"};`,
      ...(global.enableLimitReq
        ? [
            `    limit_req_zone $binary_remote_addr zone=${cleanString(global.limitReqZone) || "api"}:10m rate=${cleanString(global.limitReqRate) || "10r/s"};`,
          ]
        : []),
      "",
      ...upstreams.flatMap((upstream) => renderUpstream(upstream).map((line) => (line ? `    ${line}` : line))),
      "",
      ...servers.flatMap((server) => renderServer(server).map((line) => (line ? `    ${line}` : line))),
      "}",
    ].join("\n").trim()}\n`;
  }

  // 返回通用工作台使用的生成器接口。
  return {
    // id 用于顶部 Tab 识别当前生成器。
    id: "nginx",
    // title 是顶部 Tab 展示名。
    title: "Nginx",
    // summary 是生成器摘要。
    summary: "静态站点与反向代理",
    // icon 映射到 lucide 图标。
    icon: "Server",
    // language 用于右侧代码块语言标识。
    language: "Nginx",
    // fileName 是下载文件名。
    fileName: () => "nginx.conf",
    // panelTitle 是左侧面板标题。
    panelTitle: () => "nginx.conf",
    // panelLead 强调配置面向目标 Web 服务。
    panelLead: () => "为目标 Web 服务新增 server 和 location，生成静态站点、反代、HTTPS、WebSocket、SSE/流式响应与响应头参考配置。",
    // Nginx 全局参数使用固定字段组，站点规则通过动态块配置。
    getFieldGroups: () => globalGroups,
    // getBlocks 返回 Server 和 Location 两类动态配置块。
    getBlocks: () => [
      {
        // Upstream 块配置。
        title: upstreamBlock.title,
        icon: upstreamBlock.icon,
        addLabel: upstreamBlock.addLabel,
        add: { ...upstreamBlock.add, model: addUpstreamModel },
        onAdd: addUpstream,
        emptyTitle: upstreamBlock.emptyTitle,
        emptyText: upstreamBlock.emptyText,
        getItems: () => upstreams,
        getTitle: (upstream, index) => `Upstream ${index + 1}: ${cleanString(upstream.name) || "unnamed"}`,
        getSummary: (upstream) => splitList(upstream.servers).join(", ") || "未设置后端",
        getIcon: () => "Network",
        onRemove: (upstream) => removeItem(upstreams, upstream),
        getGroups: (upstream) => [
          {
            title: upstreamBlock.groupTitle,
            icon: upstreamBlock.groupIcon,
            model: upstream,
            fields: upstreamFields,
          },
        ],
      },
      {
        // Server 块配置。
        title: serverBlock.title,
        icon: serverBlock.icon,
        addLabel: serverBlock.addLabel,
        add: { ...serverBlock.add, model: addServerModel },
        onAdd: addServer,
        emptyTitle: serverBlock.emptyTitle,
        emptyText: serverBlock.emptyText,
        getItems: () => servers,
        getTitle: (server, index) => `Server ${index + 1}: ${cleanString(server.serverName)}`,
        getSummary: (server) => (server.enableHttps ? "HTTPS" : "HTTP"),
        getIcon: () => "Server",
        onRemove: (server) => removeItem(servers, server),
        getGroups: (server) => [
          {
            title: serverBlock.groupTitle,
            icon: serverBlock.groupIcon,
            model: server,
            fields: serverFields,
          },
        ],
      },
      {
        // Location 块配置。
        title: locationBlock.title,
        icon: locationBlock.icon,
        addLabel: locationBlock.addLabel,
        add: { ...locationBlock.add, model: addLocationModel },
        onAdd: addLocation,
        emptyTitle: locationBlock.emptyTitle,
        emptyText: locationBlock.emptyText,
        getItems: () => locations,
        getTitle: (location, index) => `Location ${index + 1}: ${cleanString(location.path)}`,
        getSummary: (location) => `${locationMatchUrl(location)} -> ${locationTarget(location)}`,
        getIcon: () => "Route",
        typeOptions: schema.location.typeOptions,
        getType: (location) => location.type,
        // 切换 location 类型时直接更新状态，字段显示会由 when 自动联动。
        onTypeChange: (location, type) => {
          location.type = type;
        },
        onRemove: (location) => removeItem(locations, location),
        getGroups: (location) => [
          {
            title: locationBlock.groupTitle,
            icon: locationBlock.groupIcon,
            model: location,
            fields: locationFields,
          },
        ],
      },
    ],
    // 暴露配置生成函数。
    generateConfig,
    // 生成面向目标 nginx.conf 的使用说明。
    generateUsage: () =>
      [
        "1. 保存右侧内容为 nginx.conf。",
        "2. 本地容器预览: docker run --rm -p 8080:80 -v $PWD/nginx.conf:/etc/nginx/nginx.conf:ro nginx:alpine。",
        "3. 配置 HTTPS 时确认已挂载证书目录并开放 443 端口。",
        "4. 反向代理 WebSocket 时开启对应 location 的 WebSocket 选项；SSE 或流式接口开启 SSE / 流式响应并按需把 read/send timeout 调大。",
      ].join("\n"),
    // 暴露该工具的参考配置规范(AI verify 上下文 + 人类查阅)。
    getReference: () => reference,
    // generate 模式期望返回 global 对象和 upstream/server/location 数组。
    getAIContext: () => ({
      reference,
      expectedJson: {
        type: "object",
        shape: {
          global: Object.keys(schema.global.state),
          upstreams: [Object.keys(schema.upstream.defaults)],
          servers: [Object.keys(schema.server.defaults)],
          locations: [Object.keys(schema.location.defaults)],
        },
      },
      schema,
    }),
    // 按 schema 白名单把 AI 生成的 JSON 写回 global + 重建 upstreams/servers/locations(generate 模式)。
    applyAIState: (json) => {
      if (!json || typeof json !== "object") return;
      applyStateFromSchema(global, schema.global, pickAIChildObject(json, "global") || json);
      const rebuild = (collection, list, factory, fields) => {
        if (!Array.isArray(list)) return;
        collection.splice(0, collection.length);
        list.forEach((data, idx) => {
          if (!data || typeof data !== "object") return;
          const base = factory(idx + 1);
          collection.push(mergeKnownFields(base, data, fields));
        });
      };
      rebuild(upstreams, pickAIArray(json, "upstreams"), createUpstream, upstreamFields);
      rebuild(servers, pickAIArray(json, "servers"), createServer, serverFields);
      rebuild(
        locations,
        pickAIArray(json, "locations"),
        (i) => createLocation(i, servers[0]?.serverName?.split(/\s+/)[0] || "example.com"),
        locationFields,
      );
      serverSerial = servers.length + 1;
      upstreamSerial = upstreams.length + 1;
      locationSerial = locations.length + 1;
    },
  };
}
