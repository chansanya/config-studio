// 前端 AI 调用封装。
// 只同源 fetch /api/ai(Cloudflare Pages Function 代理持 KEY), 这里不接触 KEY、不组装 system prompt
// (system prompt 模板在后端 functions/api/ai.js)。本文件负责: 发请求 + 解析 SSE 流 + 增量回调 +
// 解析 generate 模式的最终 JSON。

const AI_ENDPOINT = "/api/ai";
const UNAVAILABLE_MESSAGE = "AI 暂时不可用，请稍后重试或检查服务配置。";
let aiInfoPromise = null;

export async function getAIInfo() {
  if (!aiInfoPromise) {
    aiInfoPromise = fetch(AI_ENDPOINT)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => ({
        ok: Boolean(data?.model),
        model: data?.model || "",
      }))
      .catch(() => ({ ok: false, model: "" }));
  }
  return aiInfoPromise;
}

// 调用 AI 代理(SSE 流式)。
// payload: { mode: "verify"|"generate"|"usage", tool, userInput?, config?, reference? }
// onDelta(delta, full): 每收到一段增量文本时回调, delta 是本次片段, full 是已累计的完整内容。
// onMeta(meta): 每收到后端元信息时回调, 例如当前使用的模型名。
// 返回 { ok: true, content, meta } 或 { ok: false, error }。content 即最终完整文本。
export async function askAI(payload, onDelta, onMeta) {
  let res;
  try {
    res = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
  } catch {
    return { ok: false, error: UNAVAILABLE_MESSAGE };
  }

  // 后端 4xx/5xx 返回 JSON 错误, 不是 SSE。
  if (!res.ok || !res.body) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      // ignore
    }
    if ([404, 502, 503].includes(res.status)) {
      return { ok: false, error: UNAVAILABLE_MESSAGE };
    }
    return { ok: false, error: data?.error || "AI 请求失败，请稍后重试。" };
  }

  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let buffer = "";
  let full = "";
  let meta = {};

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE 事件以空行分隔, 内部每行 `data: {...}`。
      let sep;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const event = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const dataLine = event
          .split("\n")
          .map((l) => l.trim())
          .find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const text = dataLine.slice(5).trim();
        if (!text) continue;

        let obj;
        try {
          obj = JSON.parse(text);
        } catch {
          continue;
        }

        if (obj.error) {
          return { ok: false, error: obj.error };
        }
        if (obj.meta && typeof obj.meta === "object") {
          meta = { ...meta, ...obj.meta };
          onMeta?.(meta);
          continue;
        }
        if (typeof obj.delta === "string" && obj.delta) {
          full += obj.delta;
          onDelta?.(obj.delta, full);
        }
        if (obj.done) {
          return { ok: true, content: full, meta };
        }
      }
    }
    // 流自然结束但没显式 done,也按完成处理。
    return { ok: true, content: full, meta };
  } catch (e) {
    return { ok: false, error: UNAVAILABLE_MESSAGE };
  }
}

// 解析 generate 模式的 AI 输出为 JSON 对象。
// 去除可能的 ```json 包裹兜底(system prompt 已禁, 但上游不一定听话)。
// 不做字段白名单 —— 白名单由各 generator 的 applyAIState 处理(generator 最清楚自己的合法字段)。
// 返回 { ok: true, value } 或 { ok: false, error }。
export function parseAIJSON(content) {
  const cleaned = stripCodeFences(content);
  let value;
  try {
    value = JSON.parse(cleaned);
  } catch (e) {
    return { ok: false, error: `AI 输出不是合法 JSON: ${e.message}` };
  }
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "AI 输出不是 JSON 对象" };
  }
  return { ok: true, value };
}

// 按目标字段类型做容错转换(generator 写回 state 时用)。
// type 取自 schema 字段的 type: text/textarea/select → 原样; number → Number; toggle → boolean。
export function coerceByType(value, type) {
  if (type === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  if (type === "toggle" || type === "boolean") {
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    return Boolean(value);
  }
  return value == null ? value : String(value);
}

// 兜底去掉模型偶尔返回的 markdown 代码块包装，再交给 JSON.parse。
function stripCodeFences(text) {
  const match = String(text || "").match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : String(text || "").trim();
}
