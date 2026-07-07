<script setup>
// AI 助手面板 —— 作为 GeneratorWorkbench 里 NDrawer 的内容组件。
// 两种模式: verify(校验当前配置) / generate(口述需求生成配置填回表单)。
// 调同源 /api/ai(Pages Function 持 KEY), 提示词在后端, 这里只发公开数据。
import { computed, onMounted, ref, watch } from "vue";
import {
  NAlert,
  NButton,
  NCollapse,
  NCollapseItem,
  NInput,
  NRadioButton,
  NRadioGroup,
  NSpin,
  useMessage,
} from "naive-ui";
import { askAI, getAIInfo, parseAIJSON } from "../composables/useAI";

const props = defineProps({
  generator: { type: Object, required: true },
});

const debugAI = (...args) => {
  if (import.meta.env.DEV) console.debug(...args);
};
const warnAI = (...args) => {
  if (import.meta.env.DEV) console.warn(...args);
};

const message = useMessage();
// 当前 AI 面板模式：verify 只校验配置，generate 会尝试把结果写回表单。
const mode = ref("verify");
// 口述生成的用户输入，仅在 generate 模式请求时发送。
const userInput = ref("");
// AI 返回内容或错误提示统一放这里展示，切换请求时会清空。
const result = ref("");
// 防止重复点击请求按钮，并驱动按钮和 loading 状态。
const loading = ref(false);
// AI 流式返回的增量文本，用于展示“思考过程”面板。
const streamText = ref("");
// 后端会返回当前实际使用的模型展示名，例如 siliconflow/GLM-5.2 显示为 GLM-5.2。
const activeModel = ref("");
// 控制思考过程折叠面板：请求中展开，请求结束后自动收起。
const thinkingExpanded = ref(["thinking"]);

// 当前工具 id 会随顶部 Tab 切换变化，用于告诉后端这次请求属于哪个生成器。
const toolId = computed(() => props.generator?.id || "");
// 只有提供 applyAIState 的生成器才能把 AI JSON 安全写回表单；FRP 暂时只开放校验。
const canGenerate = computed(
  () => toolId.value !== "frp" && typeof props.generator?.applyAIState === "function",
);
// 生成模式不可用时给出面向用户的原因，不暴露部署和接口细节。
const generateDisabledReason = computed(() =>
  toolId.value === "frp"
    ? "FRP 功能块结构较复杂，当前仅支持 AI 校验配置。"
    : "当前工具暂未提供 AI 回填方法。",
);

// generate 需要表单字段上下文；verify 只需要配置参考资料，避免请求过大。
const aiReference = computed(() =>
  mode.value === "generate"
    ? props.generator?.getAIContext?.() || props.generator?.getReference?.()
    : props.generator?.getReference?.(),
);
// 只要请求中或已经收到过增量文本，就显示可折叠的思考过程。
const showThinking = computed(() => loading.value || Boolean(streamText.value));
const modelLabel = computed(() => activeModel.value || "AI");

onMounted(async () => {
  const info = await getAIInfo();
  if (info.ok) activeModel.value = info.model;
});

// 切到不支持口述生成的工具时，自动退回验证模式，避免保留不可用状态。
watch(canGenerate, (enabled) => {
  if (!enabled && mode.value === "generate") {
    mode.value = "verify";
  }
});

// 根据当前模式调用 AI；verify 只展示结果，generate 会先解析 JSON 再写回 generator。
async function runAI() {
  const generator = props.generator;
  if (!generator) return;

  loading.value = true;
  result.value = "";
  streamText.value = "";
  thinkingExpanded.value = ["thinking"];

  // 只发送当前配置、参考资料和用户输入；密钥和系统提示词都留在后端函数里。
  const payload = {
    mode: mode.value,
    tool: toolId.value,
    config: generator.generateConfig(),
    reference: aiReference.value,
    userInput: mode.value === "generate" ? userInput.value.trim() : undefined,
  };
  debugAI("[AI] request", {
    mode: payload.mode,
    tool: payload.tool,
    hasReference: Boolean(payload.reference),
    userInput: payload.userInput,
  });

  const res = await askAI(
    payload,
    (_delta, full) => {
      streamText.value = full;
    },
    (meta) => {
      activeModel.value = meta.model || "";
    },
  );
  loading.value = false;
  activeModel.value = res.meta?.model || "";
  if (streamText.value) {
    thinkingExpanded.value = [];
  }

  if (!res.ok) {
    warnAI("[AI] request failed", { tool: toolId.value, error: res.error });
    result.value = `❌ ${res.error}`;
    return;
  }
  debugAI("[AI] response received", {
    tool: toolId.value,
    length: res.content?.length || 0,
    preview: String(res.content || "").slice(0, 240),
  });

  // verify 模式直接展示 markdown 结果。
  if (mode.value === "verify") {
    result.value = res.content || "(AI 未返回内容)";
    return;
  }

  // generate 模式: 解析 JSON 并写回表单。
  const parsed = parseAIJSON(res.content);
  if (!parsed.ok) {
    result.value = `❌ ${parsed.error}\n\n--- AI 原始输出 ---\n${res.content}`;
    return;
  }
  try {
    const beforeConfig = generator.generateConfig();
    debugAI("[AI] generate parsed JSON", {
      tool: toolId.value,
      value: parsed.value,
    });
    generator.applyAIState(parsed.value);
    const afterConfig = generator.generateConfig();
    debugAI("[AI] generate apply result", {
      tool: toolId.value,
      changed: afterConfig !== beforeConfig,
      beforeLength: beforeConfig.length,
      afterLength: afterConfig.length,
    });
    if (afterConfig === beforeConfig) {
      warnAI("[AI] generate did not change current generator state", {
        tool: toolId.value,
        value: parsed.value,
      });
      result.value = "⚠️ AI 已返回内容，但没有匹配到可写字段，请调整描述后重试。";
      return;
    }
    result.value = "✅ 已按描述生成并填充表单, 请到左侧检查各字段。";
    message.success("配置已填充表单");
  } catch (e) {
    result.value = `❌ ${e?.message || e}`;
  }
}
</script>

<template>
  <div class="ai-panel">
    <NRadioGroup v-model:value="mode" class="ai-mode">
      <NRadioButton value="verify">验证配置</NRadioButton>
      <NRadioButton value="generate" :disabled="!canGenerate">口述生成</NRadioButton>
    </NRadioGroup>

    <p v-if="mode === 'verify'" class="ai-hint">
      把当前 <code>{{ toolId }}</code> 配置发给 AI, 依据参考规范校验, 输出通过/问题清单。
    </p>
    <NAlert v-if="mode === 'verify'" type="info" :bordered="false">
      由 {{ modelLabel }} 提供支持。
    </NAlert>
    <template v-else>
      <p class="ai-hint">
        用自然语言描述需求, AI 按 <code>{{ toolId }}</code> 字段规范生成配置并填入左侧表单。
      </p>
      <NInput
        v-model:value="userInput"
        type="textarea"
        :autosize="{ minRows: 3, maxRows: 6 }"
        spellcheck="false"
        placeholder="例如: 反代 app:3000, 开启 WebSocket 与 SSE, gzip 压缩"
      />
    </template>
    <NAlert v-if="!canGenerate" type="warning" :bordered="false">
      {{ generateDisabledReason }}
    </NAlert>

    <div class="ai-actions">
      <span class="ai-model">
        由 {{ modelLabel }} 提供支持
      </span>
      <NButton
        type="primary"
        :loading="loading"
        :disabled="mode === 'generate' && !userInput.trim()"
        @click="runAI"
      >
        {{ mode === "verify" ? "校验配置" : "生成并填充" }}
      </NButton>
    </div>

    <NCollapse
      v-if="showThinking"
      v-model:expanded-names="thinkingExpanded"
      class="ai-thinking"
    >
      <NCollapseItem name="thinking">
        <template #header>
          <span class="ai-thinking-title">
            <NSpin v-if="loading" size="small" />
            AI 思考过程
          </span>
        </template>
        <NInput
          :value="streamText || '等待响应...'"
          type="textarea"
          readonly
          spellcheck="false"
          :autosize="{ minRows: 4, maxRows: 12 }"
          class="ai-stream"
        />
      </NCollapseItem>
    </NCollapse>

    <NInput
      v-if="result"
      :value="result"
      type="textarea"
      readonly
      spellcheck="false"
      :autosize="{ minRows: 4, maxRows: 18 }"
      class="ai-result"
    />
  </div>
</template>

<style scoped>
.ai-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ai-hint {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.5;
}
.ai-hint code {
  padding: 1px 5px;
  border-radius: 4px;
  background: #f3f4f6;
  font-size: 12px;
}
.ai-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
.ai-model {
  color: #6b7280;
  font-size: 12px;
}
.ai-thinking {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  padding: 2px 10px;
}
.ai-thinking-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #374151;
  font-size: 13px;
  font-weight: 600;
}
.ai-stream :deep(textarea),
.ai-result :deep(textarea) {
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 12px;
  line-height: 1.55;
}
</style>
