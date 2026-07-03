// 引入 Vue 的 reactive，用来维护 Caddy 生成器的动态 site/handle 状态。
import { reactive } from "vue";
// 引入 Caddy 表单 schema，全局 options、site、handle 默认值、字段和块文案都从这里读取。
import schema from "./caddy/schema.json";
// 引入 Caddy 配置项参考(AI verify 上下文)。
import reference from "./caddy/reference-doc.json";
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
// 引入共享工具，统一清理字符串、列表和解析响应头键值对。
import { cleanString, parseKeyValuePairs, splitList } from "./shared";

// schema 默认值里可使用 {serial} 占位符，新增 site 时替换成递增编号。
function applySerialTemplate(value, serial) {
  return typeof value === "string" ? value.replaceAll("{serial}", String(serial)) : value;
}

// 创建一个 Caddy site 块的默认状态。
function createSite(serial = 1) {
  const serialTemplate = serial === 1 ? schema.site.first : schema.site.next;
  const serialValues = Object.fromEntries(
    Object.entries(serialTemplate).map(([key, value]) => [
      key,
      applySerialTemplate(value, serial),
    ]),
  );

  return {
    id: `caddy-site-${serial}`,
    ...cloneSchemaValue(schema.site.defaults),
    ...serialValues,
  };
}

// 创建一个 Caddy handle 块的默认状态。
function createHandle(serial = 1, host = "example.com") {
  return {
    id: `caddy-handle-${serial}`,
    ...cloneSchemaValue(schema.handle.defaults),
    host,
  };
}

// 创建 Caddyfile 参考配置生成器。
export function createCaddyGenerator() {
  // global 保存 Caddyfile 全局 options。
  const global = createStateFromSchema(schema.global);
  // addSiteModel 保存新增 site 控件状态。
  const addSiteModel = reactive({ [schema.blocks.site.add.key]: "site" });
  // addHandleModel 保存新增 handle 的类型。
  const addHandleModel = reactive({ [schema.blocks.handle.add.key]: "file_server" });
  // sites 保存全部动态站点配置。
  const sites = reactive([createSite(1)]);
  // handles 保存全部动态处理规则配置。
  const handles = reactive([createHandle(1)]);
  // siteSerial 为新增 site 提供递增编号。
  let siteSerial = 2;
  // handleSerial 为新增 handle 提供递增编号。
  let handleSerial = 2;

  // 字段和块文案来自 schema，渲染逻辑仍保留在本模块。
  const globalGroups = createFieldGroupsFromSchema(schema.global, global);
  const siteFields = cloneSchemaValue(schema.site.fields);
  const handleFields = cloneSchemaValue(schema.handle.fields);
  const siteBlock = schema.blocks.site;
  const handleBlock = schema.blocks.handle;

  // 新增 site 并递增编号。
  function addSite() {
    sites.push(createSite(siteSerial));
    siteSerial += 1;
  }

  // 新增 handle，并默认归属到第一个 site。
  function addHandle() {
    const handle = createHandle(handleSerial, cleanString(sites[0]?.host) || "example.com");
    handle.type = addHandleModel[schema.blocks.handle.add.key];
    handles.push(handle);
    handleSerial += 1;
  }

  // 从指定集合中删除一个对象。
  function removeItem(collection, item) {
    const index = collection.indexOf(item);
    if (index !== -1) collection.splice(index, 1);
  }

  // 将逗号分隔的响应头键值对渲染为 Caddy header 块。
  function renderHeaders(headersText, indent = "    ") {
    // pairs 为空时不输出 header 块。
    const pairs = parseKeyValuePairs(headersText);
    if (!pairs.length) return [];
    // Caddy header 块需要保持内部缩进。
    return ["header {", ...pairs.map(([key, value]) => `    ${key} "${value}"`), "}"].map((line) => `${indent}${line}`);
  }

  // Caddy reverse_proxy 的 header_up/header_down 子指令共用键值对渲染逻辑。
  function renderProxyHeaderPairs(kind, value) {
    return parseKeyValuePairs(value).map(([key, pairValue]) =>
      `            ${kind} ${key} "${pairValue}"`,
    );
  }

  // Basic Auth 输入为 user=hash 键值对；没有内容时不输出 basic_auth 块。
  function renderBasicAuth(value) {
    const pairs = parseKeyValuePairs(value);
    if (!pairs.length) return [];

    return [
      "    # Basic Auth 访问控制，密码应使用 caddy hash-password 生成。",
      "    basic_auth {",
      ...pairs.map(([user, hash]) => `        ${user} ${hash}`),
      "    }",
    ];
  }

  // 渲染 Caddy reverse_proxy；有子指令时使用块形式。
  function renderReverseProxy(handle) {
    const upstreams = splitList(handle.upstream);
    const targets = (upstreams.length ? upstreams : ["app:3000"]).join(" ");
    const subDirectives = [];

    if (cleanString(handle.lbPolicy) && handle.lbPolicy !== "round_robin") {
      subDirectives.push(`            lb_policy ${cleanString(handle.lbPolicy)}`);
    }

    if (cleanString(handle.healthUri)) {
      subDirectives.push(`            health_uri ${cleanString(handle.healthUri)}`);
    }

    subDirectives.push(...renderProxyHeaderPairs("header_up", handle.headerUp));
    subDirectives.push(...renderProxyHeaderPairs("header_down", handle.headerDown));

    if (handle.enableStreaming && cleanString(handle.flushInterval)) {
      subDirectives.push(`            flush_interval ${cleanString(handle.flushInterval)}`);
    }

    const transportDirectives = [];
    if (handle.transport === "tls" || handle.transport === "tls_insecure_skip_verify") {
      transportDirectives.push("                tls");
      if (handle.transport === "tls_insecure_skip_verify") {
        transportDirectives.push("                tls_insecure_skip_verify");
      }
    }
    if (cleanString(handle.transportDialTimeout)) {
      transportDirectives.push(`                dial_timeout ${cleanString(handle.transportDialTimeout)}`);
    }
    if (cleanString(handle.transportReadTimeout)) {
      transportDirectives.push(`                read_timeout ${cleanString(handle.transportReadTimeout)}`);
    }
    if (cleanString(handle.transportWriteTimeout)) {
      transportDirectives.push(`                write_timeout ${cleanString(handle.transportWriteTimeout)}`);
    }

    if (transportDirectives.length) {
      subDirectives.push("            transport http {");
      subDirectives.push(...transportDirectives);
      subDirectives.push("            }");
    }

    if (!subDirectives.length) {
      return [`        reverse_proxy ${targets}`];
    }

    return [
      `        reverse_proxy ${targets} {`,
      ...subDirectives,
      "        }",
    ];
  }

  // 将一个 handle 状态对象渲染为 Caddy handle_path 块。
  function renderHandle(handle) {
    // matcher 为空时回退到通配路径。
    const matcher = cleanString(handle.path) || "/*";
    // lines 保存当前 handle 的指令行。
    const lines = [`    # ${matcher} 处理规则。`, `    handle_path ${matcher} {`];

    // handle 级响应头优先生效。
    const handleHeaders = renderHeaders(handle.headers, "        ");
    if (handleHeaders.length) {
      lines.push("        # 当前 handle 额外响应头。", ...handleHeaders);
    }

    // reverse_proxy 模式输出上游代理指令。
    if (handle.type === "reverse_proxy") {
      lines.push("        # 反向代理，Caddy 默认支持 WebSocket；SSE 可用 flush_interval 立即刷新。", ...renderReverseProxy(handle));
    // redir 模式输出永久重定向。
    } else if (handle.type === "redir") {
      lines.push("        # 重定向。", `        redir ${cleanString(handle.redirectTarget)} permanent`);
    // respond 模式输出直接响应。
    } else if (handle.type === "respond") {
      lines.push("        # 直接响应。", `        respond "${cleanString(handle.respondBody)}" ${Number(handle.respondStatus) || 200}`);
    // 默认 file_server 模式输出静态文件服务。
    } else {
      lines.push(
        "        # 静态文件服务。",
        `        root * ${cleanString(handle.root)}`,
      );
      // rewriteTo 不为空时生成 SPA fallback。
      if (cleanString(handle.rewriteTo)) {
        lines.push(`        try_files {path} ${cleanString(handle.rewriteTo)}`);
      }
      lines.push("        file_server");
    }

    // 关闭 handle_path 块并返回。
    lines.push("    }");
    return lines;
  }

  // 将一个 site 状态对象渲染为 Caddy 站点块。
  function renderSite(site) {
    // 根据 host 过滤归属到当前 site 的 handle。
    const siteHandles = handles.filter((handle) => cleanString(handle.host) === cleanString(site.host));
    // lines 保存当前站点块指令。
    const lines = [`# ${cleanString(site.host)} 站点配置。`, `${cleanString(site.host)} {`];

    // 启用压缩时输出 encode 指令。
    if (site.enableEncode) {
      lines.push("    # 响应压缩。", `    encode ${cleanString(site.encoders).replaceAll(",", " ")}`);
    }

    if (site.tlsMode === "internal") {
      lines.push("    # 使用 Caddy 内部 CA 签发证书。", "    tls internal");
    } else if (site.tlsMode === "custom") {
      lines.push("    # 使用自定义证书。", `    tls ${cleanString(site.tlsCert)} ${cleanString(site.tlsKey)}`);
    }

    if (site.enableAccessLog) {
      lines.push(
        "    # 站点访问日志。",
        "    log {",
        `        output file ${cleanString(site.accessLogPath)}`,
        "    }",
      );
    }

    lines.push(...renderBasicAuth(site.basicAuth));

    // 输出站点级默认 root。
    lines.push("    # 默认静态根目录。", `    root * ${cleanString(site.root)}`);

    // 输出站点级响应头。
    const headers = renderHeaders(site.headers);
    if (headers.length) {
      lines.push("    # 基础响应头。", ...headers);
    }

    // 有归属 handle 时渲染全部 handle，否则补一个默认静态文件规则。
    if (siteHandles.length) {
      lines.push(...siteHandles.flatMap(renderHandle));
    } else {
      lines.push(...renderHandle(createHandle(0, cleanString(site.host))));
    }

    // 关闭站点块并返回。
    lines.push("}");
    return lines;
  }

  // 生成完整 Caddyfile。
  function generateConfig() {
    // 找到第一个启用自动 HTTPS 且填写邮箱的 site，用于全局 email。
    const acmeEmail = cleanString(sites.find((site) => site.enableAutoHttps && cleanString(site.email))?.email);
    // Caddy 全局选项块必须位于文件顶部。
    const globalOptions = [
      "# 全局选项，ACME 邮箱、HTTPS 行为、管理 API 和协议在这里设置。",
      "{",
      ...(acmeEmail ? [`    email ${acmeEmail}`] : []),
      ...(global.autoHttps && global.autoHttps !== "on" ? [`    auto_https ${cleanString(global.autoHttps)}`] : []),
      ...(cleanString(global.admin) ? [`    admin ${cleanString(global.admin)}`] : []),
      ...(cleanString(global.protocols)
        ? ["    servers {", `        protocols ${cleanString(global.protocols).replaceAll(",", " ")}`, "    }"]
        : []),
      ...(global.enableGlobalLog ? ["    log {", `        level ${cleanString(global.logLevel) || "INFO"}`, "    }"] : []),
      "}",
      "",
    ];

    // 汇总全局选项和所有 site 块，保留文件末尾换行。
    return `${[
      "# Generated by Config Gen",
      "",
      ...globalOptions,
      ...sites.flatMap((site) => [...renderSite(site), ""]),
    ].join("\n").trim()}\n`;
  }

  // 返回通用工作台使用的生成器接口。
  return {
    // id 用于顶部 Tab 识别当前生成器。
    id: "caddy",
    // title 是顶部 Tab 展示名。
    title: "Caddy",
    // summary 是生成器摘要。
    summary: "Caddyfile 自动 HTTPS",
    // icon 映射到 lucide 图标。
    icon: "Shield",
    // language 用于右侧代码块语言标识。
    language: "Caddyfile",
    // fileName 是下载文件名。
    fileName: () => "Caddyfile",
    // panelTitle 是左侧面板标题。
    panelTitle: () => "Caddyfile",
    // panelLead 强调配置面向目标 Web 服务。
    panelLead: () => "为目标 Web 服务新增 site 和 handle，生成静态站点、反向代理、自动 HTTPS、headers 和重定向参考配置。",
    // Caddy 全局 options 使用固定字段组，site/handle 通过动态块配置。
    getFieldGroups: () => globalGroups,
    // getBlocks 返回 Site 和 Handle 两类动态配置块。
    getBlocks: () => [
      {
        // Site 块配置。
        title: siteBlock.title,
        icon: siteBlock.icon,
        addLabel: siteBlock.addLabel,
        add: { ...siteBlock.add, model: addSiteModel },
        onAdd: addSite,
        emptyTitle: siteBlock.emptyTitle,
        emptyText: siteBlock.emptyText,
        getItems: () => sites,
        getTitle: (site, index) => `Site ${index + 1}: ${cleanString(site.host)}`,
        getSummary: (site) => (site.enableAutoHttps ? "自动 HTTPS" : "明文/自定义端口"),
        getIcon: () => "Globe",
        onRemove: (site) => removeItem(sites, site),
        getGroups: (site) => [
          {
            title: siteBlock.groupTitle,
            icon: siteBlock.groupIcon,
            model: site,
            fields: siteFields,
          },
        ],
      },
      {
        // Handle 块配置。
        title: handleBlock.title,
        icon: handleBlock.icon,
        addLabel: handleBlock.addLabel,
        add: { ...handleBlock.add, model: addHandleModel },
        onAdd: addHandle,
        emptyTitle: handleBlock.emptyTitle,
        emptyText: handleBlock.emptyText,
        getItems: () => handles,
        getTitle: (handle, index) => `Handle ${index + 1}: ${cleanString(handle.path)}`,
        getSummary: (handle) => `${handle.type} -> ${cleanString(handle.host)}`,
        getIcon: () => "Route",
        typeOptions: schema.handle.typeOptions,
        getType: (handle) => handle.type,
        // 切换 handle 类型时直接更新状态，字段显示由 when 自动联动。
        onTypeChange: (handle, type) => {
          handle.type = type;
        },
        onRemove: (handle) => removeItem(handles, handle),
        getGroups: (handle) => [
          {
            title: handleBlock.groupTitle,
            icon: handleBlock.groupIcon,
            model: handle,
            fields: handleFields,
          },
        ],
      },
    ],
    // 暴露配置生成函数。
    generateConfig,
    // 生成面向目标 Caddyfile 的使用说明。
    generateUsage: () =>
      [
        "1. 保存右侧内容为 Caddyfile。",
        "2. 本地容器预览: docker run --rm -p 8080:80 -v $PWD/Caddyfile:/etc/caddy/Caddyfile:ro caddy:alpine。",
        "3. 使用域名自动 HTTPS 时开放 80/443，并确保 DNS 指向服务器。",
        "4. Caddy 的 reverse_proxy 默认支持 WebSocket；SSE 或流式接口可开启 flush_interval，并按需设置 transport http 超时。",
      ].join("\n"),
    // 暴露该工具的参考配置规范(AI verify 上下文 + 人类查阅)。
    getReference: () => reference,
    // generate 模式期望返回 global 对象和 site/handle 数组。
    getAIContext: () => ({
      reference,
      expectedJson: {
        type: "object",
        shape: {
          global: Object.keys(schema.global.state),
          sites: [Object.keys(schema.site.defaults)],
          handles: [Object.keys(schema.handle.defaults)],
        },
      },
      schema,
    }),
    // 按 schema 白名单把 AI 生成的 JSON 写回 global + 重建 sites/handles(generate 模式)。
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
      rebuild(sites, pickAIArray(json, "sites"), createSite, siteFields);
      rebuild(
        handles,
        pickAIArray(json, "handles"),
        (i) => createHandle(i, cleanString(sites[0]?.host) || "example.com"),
        handleFields,
      );
      siteSerial = sites.length + 1;
      handleSerial = handles.length + 1;
    },
  };
}
