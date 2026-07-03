// Cloudflare Pages Function —— AI 代理(SSE 流式)
// 浏览器同源 POST /api/ai; 本函数从 env 读 AI_BASE_URL / AI_API_KEY 转发到上游
// OpenAI 兼容 /chat/completions(stream=true), 把上游 SSE 增量回流给浏览器。
// system prompt 模板在后端, KEY 全程在边缘运行时, 永不落地 dist/。
//
// 环境变量:
//   本地 .dev.vars  →  AI_BASE_URL / AI_API_KEY / AI_MODEL(可选)
//   生产 Pages      →  npm run pages:env 批量同步 AI_BASE_URL / AI_API_KEY / AI_MODEL
//
// 输出 SSE 协议:
//   data: {"delta":"..."}        增量文本(可多条, 顺序拼接即完整内容)
//   data: {"done":true}          正常结束
//   data: {"error":"..."}        任意异常(上游错误/解析失败)
// 浏览器侧 useAI.js 解析这些事件驱动 UI 增量渲染。

// 固定系统提示词(严格): 声明角色/输出格式/字段约束, 禁止解释性文字。
// 用户输入只作为 user message 内容, 绝不拼进 system prompt, 防注入。
const SYSTEM_PROMPTS = {
  verify:
    "你是配置校验专家。依据参考规范(reference)校验用户提交的配置文本(config)。输出 markdown: 第一行写『✅ 通过』或『❌ 有问题』, 随后用要点逐条列出问题并引用具体字段名/指令名; 没问题就只写通过一行。禁止开场白、禁止复述配置原文。",
  generate:
    "你是配置生成专家。依据 reference.expectedJson / reference.schema 中的表单字段和用户需求(userInput)生成配置。严格规则: 只输出一个 JSON 对象; reference.expectedJson 是目标结构说明, 不要原样返回 type/keys/shape/schema; 对象的键必须使用表单 state key, 不要使用 Dockerfile/Nginx/Caddy/Redis 等配置指令名; 静态表单直接返回字段 key, 动态块返回 services/sites/handles/upstreams/servers/locations 等数组; 值必须符合 schema 字段类型与选项; 禁止任何解释文字; 禁止 markdown 代码块标记(不要写 ```json); 输出必须是可直接 JSON.parse 的合法 JSON。",
};

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const AI_UNAVAILABLE = "AI 暂时不可用，请稍后重试或检查服务配置。";
const MAX_REQUEST_BYTES = 96 * 1024;
const MAX_REFERENCE_CHARS = 16 * 1024;
const MAX_UPSTREAM_FALLBACK_CHARS = 64 * 1024;

function sseChunk(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

// 只允许同源页面通过 CORS 预检，降低公开端点被第三方站点滥用。
function sameOriginCorsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return {};
  const requestOrigin = new URL(request.url).origin;
  if (origin !== requestOrigin) return {};
  return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
}

// Pages Function 仍是公开 URL；要求浏览器同源请求可挡掉大部分跨站和脚本直连滥用。
function isAllowedOriginRequest(request, env) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("Origin");
  if (origin) return origin === requestOrigin;

  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite) return fetchSite === "same-origin" || fetchSite === "none";

  return env?.AI_ALLOW_MISSING_ORIGIN === "true";
}

async function readJsonBodyLimited(request) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    const error = new Error("请求体过大");
    error.status = 413;
    throw error;
  }

  if (!request.body) return null;

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_REQUEST_BYTES) {
      await reader.cancel().catch(() => {});
      const error = new Error("请求体过大");
      error.status = 413;
      throw error;
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();

  return JSON.parse(text);
}

function limitReference(reference) {
  const text = JSON.stringify(reference ?? null);
  if (text.length <= MAX_REFERENCE_CHARS) return reference;
  return {
    truncated: true,
    jsonPreview: text.slice(0, MAX_REFERENCE_CHARS),
  };
}

export async function onRequestOptions(context) {
  if (!isAllowedOriginRequest(context.request, context.env)) {
    return jsonResponse({ error: AI_UNAVAILABLE }, 403);
  }
  const corsHeaders = sameOriginCorsHeaders(context.request);
  return new Response(null, {
    headers: {
      ...corsHeaders,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!isAllowedOriginRequest(request, env)) {
    return jsonResponse({ error: AI_UNAVAILABLE }, 403);
  }

  // 1. 校验后端 env(缺则 503, 提示如何配置)
  const baseUrl = (env?.AI_BASE_URL || "").replace(/\/+$/, "");
  const chatCompletionsUrl = baseUrl.endsWith("/chat/completions")
    ? baseUrl
    : `${baseUrl}/chat/completions`;
  const apiKey = env?.AI_API_KEY;
  if (!baseUrl || !apiKey) {
    return jsonResponse({ error: AI_UNAVAILABLE }, 503);
  }

  // 2. 解析前端请求(只收公开数据: mode/tool/userInput/config/reference)
  let body;
  try {
    body = await readJsonBodyLimited(request);
  } catch (e) {
    if (e?.status === 413) {
      return jsonResponse({ error: "请求体过大" }, 413);
    }
    return jsonResponse({ error: "请求体必须是 JSON" }, 400);
  }

  const { mode, tool, userInput, config, reference } = body || {};
  if (!SYSTEM_PROMPTS[mode]) {
    return jsonResponse({ error: "无效 mode, 仅支持 verify / generate" }, 400);
  }

  // 3. 组装 messages: system 固定模板 + user 只放公开数据(限长防滥用)
  const messages = [
    { role: "system", content: SYSTEM_PROMPTS[mode] },
    {
      role: "user",
      content: JSON.stringify({
        tool: typeof tool === "string" ? tool.slice(0, 64) : undefined,
        userInput: typeof userInput === "string" ? userInput.slice(0, 2000) : undefined,
        config: typeof config === "string" ? config.slice(0, 8000) : undefined,
        reference: limitReference(reference),
      }),
    },
  ];

  // 4. 转发上游(stream=true), 用 ReadableStream 把增量 chunk 编码成 SSE 推给浏览器。
  let upstream;
  try {
    upstream = await fetch(chatCompletionsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: env.AI_MODEL || "gpt-4o-mini",
        messages,
        temperature: mode === "generate" ? 0.2 : 0.3,
        stream: true,
        // generate 强制 JSON 对象输出(上游不支持会自动忽略, 前端仍会严格 parse)
        ...(mode === "generate" ? { response_format: { type: "json_object" } } : {}),
      }),
    });
  } catch (e) {
    return jsonResponse({ error: AI_UNAVAILABLE }, 502);
  }

  if (!upstream.ok || !upstream.body) {
    await upstream.body?.cancel().catch(() => {});
    return jsonResponse({ error: AI_UNAVAILABLE }, 502);
  }

  // 5. 解析上游 SSE: 每个 `data: {json}` 行抽 choices[0].delta.content 推给浏览器;
  //    也兼容上游不流式(整块 JSON)的情况, 把整块作为一次 delta 推出。
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let nonStreamFallback = "";
  let sawSSEData = false;

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      const send = (obj) => controller.enqueue(encoder.encode(sseChunk(obj)));
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunkText = decoder.decode(value, { stream: true });
          buffer += chunkText;
          if (!sawSSEData) {
            nonStreamFallback += chunkText;
            if (nonStreamFallback.length > MAX_UPSTREAM_FALLBACK_CHARS) {
              send({ error: AI_UNAVAILABLE });
              return;
            }
          }

          let lineEnd;
          while ((lineEnd = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, lineEnd).trim();
            buffer = buffer.slice(lineEnd + 1);
            if (!line || line.startsWith(":")) continue;
            if (!line.startsWith("data:")) continue;
            sawSSEData = true;
            nonStreamFallback = "";
            const dataStr = line.slice(5).trim();
            if (dataStr === "[DONE]") {
              send({ done: true });
              return;
            }
            let parsed;
            try {
              parsed = JSON.parse(dataStr);
            } catch {
              continue;
            }
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) {
              send({ delta });
            }
          }
        }

        // 上游流结束后 buffer 可能残留非 SSE JSON 整块(非流式响应)。
        const trimmed = sawSSEData ? buffer.trim() : nonStreamFallback.trim();
        if (trimmed) {
          let parsed;
          try {
            parsed = JSON.parse(trimmed);
          } catch {
            send({ error: AI_UNAVAILABLE });
            return;
          }
          const content = parsed?.choices?.[0]?.message?.content;
          if (typeof content === "string" && content) {
            send({ delta: content });
          } else {
            send({ error: AI_UNAVAILABLE });
            return;
          }
        }
        send({ done: true });
      } catch (e) {
        send({ error: AI_UNAVAILABLE });
      } finally {
        try {
          controller.close();
        } catch {
          // controller 已关闭时忽略。
        }
      }
    },
  });

  return new Response(stream, {
    headers: { ...SSE_HEADERS, ...sameOriginCorsHeaders(request) },
  });
}
