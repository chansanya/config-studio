<script setup>
import { computed, markRaw, nextTick, onMounted, ref, watch } from "vue";
import {
  NButton,
  NCollapse,
  NCollapseItem,
  NDrawer,
  NDrawerContent,
  NForm,
  NInput,
  NSelect,
  NScrollbar,
  NSpin,
  NTabPane,
  NTabs,
  useMessage,
} from "naive-ui";
import {
  Box,
  Boxes,
  Cable,
  ClipboardList,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileText,
  Globe,
  KeyRound,
  Lock,
  Monitor,
  Network,
  Plus,
  Radio,
  Route,
  Server,
  Settings2,
  Shield,
  Sparkles,
  Terminal,
  Trash2,
} from "@lucide/vue";
import { createGenerators } from "../generators";
import { askAI, getAIInfo } from "../composables/useAI";
import AIPanel from "./AIPanel.vue";
import FieldControl from "./FieldControl.vue";

// 生成器 schema 只保存图标名称，工作台在这里统一映射成 markRaw 后的组件。
const iconMap = {
  Box: markRaw(Box),
  Boxes: markRaw(Boxes),
  Cable: markRaw(Cable),
  ClipboardList: markRaw(ClipboardList),
  FileText: markRaw(FileText),
  Database: markRaw(Database),
  ExternalLink: markRaw(ExternalLink),
  Globe: markRaw(Globe),
  KeyRound: markRaw(KeyRound),
  Lock: markRaw(Lock),
  Monitor: markRaw(Monitor),
  Network: markRaw(Network),
  Plus: markRaw(Plus),
  Radio: markRaw(Radio),
  Route: markRaw(Route),
  Server: markRaw(Server),
  Settings2: markRaw(Settings2),
  Shield: markRaw(Shield),
  Sparkles: markRaw(Sparkles),
  Terminal: markRaw(Terminal),
};

const message = useMessage();
// 表单默认只展示每组前几个常用项，其余默认/高级项放入折叠区，降低首屏噪音。
const PRIMARY_FIELD_LIMIT = 6;
// 各生成器的官方文档入口；更细的分类链接由 docUrlForTitle 按标题覆盖。
const officialDocs = {
  frp: "https://gofrp.org/zh-cn/docs/features/",
  dockerfile: "https://docs.docker.com/reference/dockerfile/",
  compose: "https://docs.docker.com/reference/compose-file/",
  nginx: "https://nginx.org/en/docs/",
  caddy: "https://caddyserver.com/docs/caddyfile",
  redis: "https://redis.io/docs/latest/operate/oss_and_stack/management/config/",
};
// 生成器实例创建一次并保留各自响应式 state，切换 Tab 时不会丢表单内容。
const generators = createGenerators();
// 顶部 Tab 当前选中的生成器 id，默认使用注册列表的第一个生成器。
const activeGeneratorId = ref(generators[0].id);
// 左侧导航高亮项，对应中间表单区域的 DOM id。
const activeSectionId = ref("field-0");
// 右侧输出区当前 Tab，切换生成器时会回到配置预览。
const outputTab = ref("config");
// 控制 AI 侧边抽屉显示状态，内容始终消费当前 activeGenerator。
const aiDrawerOpen = ref(false);

// 根据顶部 Tab 的 id 找到当前生成器；兜底到第一个生成器，避免异常 id 让页面空白。
const activeGenerator = computed(
  () =>
    generators.find((generator) => generator.id === activeGeneratorId.value) ||
    generators[0],
);

// 当前生成器提供固定字段组和动态块，工作台只负责渲染，不关心具体工具规则。
const fieldGroups = computed(() => activeGenerator.value.getFieldGroups());
// 动态块来自当前生成器，例如 FRP 功能、Compose service、Nginx location。
const blocks = computed(() => activeGenerator.value.getBlocks());
// 给模板补充 blockIndex 和实时 items，方便左侧导航、中间表单共享同一份动态块视图。
const blockViews = computed(() =>
  blocks.value.map((block, blockIndex) => ({
    block,
    blockIndex,
    items: block.getItems(),
  })),
);
// 右侧输出全部从当前生成器派生，切换工具或修改表单时自动刷新。
const generatedConfig = computed(() => activeGenerator.value.generateConfig());
// 下载文件名由生成器决定，例如 frps.toml、nginx.conf 或 redis.conf。
const outputFileName = computed(() => activeGenerator.value.fileName());
// 左侧当前工具标题，跟随生成器切换。
const panelTitle = computed(() => activeGenerator.value.panelTitle());
// 左侧当前工具说明，用于快速判断这个 Tab 生成什么目标配置。
const panelLead = computed(() => activeGenerator.value.panelLead());
// AI 生成的使用说明；只在“使用说明”Tab 打开后按当前配置生成，避免无意义请求。
const aiUsageText = ref("");
const usageLoading = ref(false);
const usageError = ref("");
const usageModel = ref("");
const aiProviderModel = ref("");
const usageCache = new Map();
let usageRequestSerial = 0;
let usageTimer = null;

onMounted(async () => {
  const info = await getAIInfo();
  if (info.ok) aiProviderModel.value = info.model;
});

// 切换生成器时回到基础配置和配置预览，避免停留在上一个工具的功能块位置。
watch(activeGeneratorId, () => {
  activeSectionId.value = "field-0";
  outputTab.value = "config";
  aiUsageText.value = "";
  usageError.value = "";
  usageModel.value = "";
  usageLoading.value = false;
  nextTick(() => scrollToSection("field-0", false));
});

watch([outputTab, generatedConfig, activeGeneratorId], () => {
  if (usageTimer) {
    clearTimeout(usageTimer);
    usageTimer = null;
  }

  if (outputTab.value !== "usage") return;
  usageTimer = setTimeout(() => {
    generateUsageWithAI();
  }, 700);
});

// schema 里只保存图标名，这里统一映射成 lucide 组件并提供默认图标。
function iconFor(name) {
  return iconMap[name] || Settings2;
}

// 字段 schema 支持字符串数组或 Naive UI option 对象数组，这里统一成 NSelect 可消费格式。
function normalizedOptions(options = []) {
  return options.map((option) =>
    typeof option === "string" ? { label: option, value: option } : option,
  );
}

// 字段可通过 primary/defaultHidden/advanced 显式声明展示层级；未声明时按顺序保留常用字段。
function splitFields(fields = []) {
  const list = fields || [];
  const hasExplicitTier = list.some(
    (field) => field.primary || field.defaultHidden || field.advanced,
  );
  if (hasExplicitTier) {
    return {
      primary: list.filter((field) => field.primary || (!field.defaultHidden && !field.advanced)),
      secondary: list.filter((field) => field.defaultHidden || field.advanced),
    };
  }

  return {
    primary: list.slice(0, PRIMARY_FIELD_LIMIT),
    secondary: list.slice(PRIMARY_FIELD_LIMIT),
  };
}

function primaryFields(fields) {
  return splitFields(fields).primary;
}

function secondaryFields(fields) {
  return splitFields(fields).secondary;
}

// 不同配置类型尽量跳到官方的具体章节，找不到时回退到当前工具的官方文档主页。
function docUrlForTitle(title, fallback) {
  const id = activeGenerator.value.id;
  const key = String(title || "").toLowerCase();
  if (fallback) return fallback;

  if (id === "nginx") {
    if (key.includes("upstream")) return "https://nginx.org/en/docs/http/ngx_http_upstream_module.html";
    if (key.includes("server") || key.includes("location")) return "https://nginx.org/en/docs/http/ngx_http_core_module.html";
    return "https://nginx.org/en/docs/http/ngx_http_core_module.html";
  }

  if (id === "caddy") {
    if (key.includes("handle")) return "https://caddyserver.com/docs/caddyfile/directives/handle";
    if (key.includes("site")) return "https://caddyserver.com/docs/caddyfile/concepts#addresses";
    return "https://caddyserver.com/docs/caddyfile/options";
  }

  if (id === "compose") return "https://docs.docker.com/reference/compose-file/services/";
  return officialDocs[id];
}

// 下面这些 id 生成器要和模板里的 section id 保持一致，用于左侧导航滚动定位。
function fieldSectionId(index) {
  return `field-${index}`;
}

// 动态块空态区域的 DOM id，用于新增前也能定位到该功能区。
function blockSectionId(blockIndex) {
  return `block-${blockIndex}`;
}

// 动态块内具体条目的 DOM id，用于新增后滚到刚创建的配置卡片。
function itemSectionId(blockIndex, itemIndex) {
  return `block-${blockIndex}-item-${itemIndex}`;
}

// 点击左侧导航时更新 active 状态，并滚动到中间表单对应区域。
function scrollToSection(id, smooth = true) {
  activeSectionId.value = id;
  document.getElementById(id)?.scrollIntoView({
    behavior: smooth ? "smooth" : "auto",
    block: "start",
  });
}

// 新增动态块后等 DOM 更新，再滚动到刚创建的条目。
function addBlockItem(blockView) {
  blockView.block.onAdd();
  nextTick(() => {
    const nextIndex = blockView.block.getItems().length - 1;
    scrollToSection(
      nextIndex >= 0
        ? itemSectionId(blockView.blockIndex, nextIndex)
        : blockSectionId(blockView.blockIndex),
    );
  });
}

// Clipboard API 不可用或被浏览器拒绝时，降级到隐藏 textarea 复制。
async function copyText(text, successMessage) {
  let copied = false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      copied = false;
    }
  }

  if (!copied) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }

  message.success(successMessage);
}

// 复制当前生成的配置文本，是右侧最常用的快捷动作。
function copyConfig() {
  copyText(generatedConfig.value, "配置已复制");
}

// 下载时只下载当前配置文本，不混入右侧使用说明。
function downloadConfig() {
  const blob = new Blob([generatedConfig.value], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = outputFileName.value;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  message.success(`已下载 ${outputFileName.value}`);
}

// AI 抽屉不进入输出 Tabs，避免和“生成产物”语义混在一起。
function openAI() {
  aiDrawerOpen.value = true;
}

async function generateUsageWithAI() {
  const generator = activeGenerator.value;
  const configText = generatedConfig.value.trim();
  const requestId = ++usageRequestSerial;
  const cacheKey = `${generator.id}::${configText}`;

  if (!configText) {
    aiUsageText.value = "";
    usageError.value = "当前还没有可说明的配置内容。";
    usageLoading.value = false;
    return;
  }

  if (usageCache.has(cacheKey)) {
    const cached = usageCache.get(cacheKey);
    aiUsageText.value = cached.content;
    usageModel.value = cached.model || "";
    usageError.value = "";
    usageLoading.value = false;
    return;
  }

  usageLoading.value = true;
  usageError.value = "";
  usageModel.value = "";

  const res = await askAI(
    {
      mode: "usage",
      tool: generator.id,
      config: configText,
      reference: generator.getReference?.(),
    },
    undefined,
    (meta) => {
      usageModel.value = meta.model || "";
    },
  );

  if (requestId !== usageRequestSerial) return;

  usageLoading.value = false;
  usageModel.value = res.meta?.model || "";
  if (!res.ok) {
    aiUsageText.value = "";
    usageError.value = res.error || "使用说明暂时不可用，请稍后重试。";
    return;
  }

  aiUsageText.value = (res.content || "").trim();
  if (!aiUsageText.value) {
    usageError.value = "AI 没有返回可用的使用说明。";
    return;
  }
  usageCache.set(cacheKey, {
    content: aiUsageText.value,
    model: usageModel.value,
  });
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">
          <Settings2 :size="23" aria-hidden="true" />
        </div>
        <div class="brand-copy">
          <strong>配置工坊</strong>
          <span>面向目标服务的 FRP / Docker / Web Server 配置工作台</span>
        </div>
      </div>

      <NTabs
        v-model:value="activeGeneratorId"
        class="generator-tabs"
        type="line"
        animated
        :pane-style="{ display: 'none' }"
      >
        <NTabPane
          v-for="generator in generators"
          :key="generator.id"
          :name="generator.id"
        >
          <template #tab>
            <span class="tab-label">
              <component :is="iconFor(generator.icon)" :size="17" aria-hidden="true" />
              {{ generator.title }}
            </span>
          </template>
        </NTabPane>
      </NTabs>
    </header>

    <main class="workspace">
      <aside class="rail" aria-label="配置导航">
        <NScrollbar class="rail-scroll">
          <section class="rail-panel rail-panel--intro">
            <span class="eyebrow">
              <component :is="iconFor(activeGenerator.icon)" :size="15" aria-hidden="true" />
              当前工具
            </span>
            <h1>{{ panelTitle }}</h1>
            <p>{{ panelLead }}</p>
          </section>

          <section v-if="fieldGroups.length" class="rail-panel">
            <div class="rail-heading">
              <span>基础配置</span>
            </div>
            <button
              v-for="(group, groupIndex) in fieldGroups"
              :key="group.title"
              type="button"
              class="rail-item"
              :class="{ active: activeSectionId === fieldSectionId(groupIndex) }"
              @click="scrollToSection(fieldSectionId(groupIndex))"
            >
              <component :is="iconFor(group.icon)" :size="16" aria-hidden="true" />
              <span>{{ group.title }}</span>
            </button>
          </section>

          <section
            v-for="blockView in blockViews"
            :key="blockView.block.title"
            class="rail-panel"
          >
            <div class="rail-heading">
              <span>{{ blockView.block.title }}</span>
              <small>{{ blockView.items.length }}</small>
            </div>

            <div class="rail-add">
              <label v-if="blockView.block.add?.options">
                <span>{{ blockView.block.add.label }}</span>
                <NSelect
                  v-model:value="blockView.block.add.model[blockView.block.add.key]"
                  :options="normalizedOptions(blockView.block.add.options)"
                  size="small"
                  filterable
                />
              </label>
              <p v-else>{{ blockView.block.add?.hint || blockView.block.emptyText }}</p>

              <NButton
                type="primary"
                size="small"
                block
                @click="addBlockItem(blockView)"
              >
                <template #icon>
                  <Plus :size="15" aria-hidden="true" />
                </template>
                {{ blockView.block.addLabel }}
              </NButton>
            </div>

            <button
              v-if="blockView.items.length === 0"
              type="button"
              class="rail-item rail-item--empty"
              :class="{ active: activeSectionId === blockSectionId(blockView.blockIndex) }"
              @click="scrollToSection(blockSectionId(blockView.blockIndex))"
            >
              <component :is="iconFor(blockView.block.icon)" :size="16" aria-hidden="true" />
              <span>{{ blockView.block.emptyTitle }}</span>
            </button>

            <button
              v-for="(item, itemIndex) in blockView.items"
              :key="item.id || itemIndex"
              type="button"
              class="rail-item"
              :class="{
                active:
                  activeSectionId ===
                  itemSectionId(blockView.blockIndex, itemIndex),
              }"
              @click="scrollToSection(itemSectionId(blockView.blockIndex, itemIndex))"
            >
              <component :is="iconFor(blockView.block.getIcon(item))" :size="16" aria-hidden="true" />
              <span>{{ blockView.block.getTitle(item, itemIndex) }}</span>
            </button>
          </section>
        </NScrollbar>
      </aside>

      <section class="editor" aria-label="配置表单">
        <NScrollbar class="editor-scroll">
          <section
            v-for="(group, groupIndex) in fieldGroups"
            :id="fieldSectionId(groupIndex)"
            :key="group.title"
            class="editor-section"
          >
            <header class="section-header">
              <div>
                <span class="eyebrow">
                  <component :is="iconFor(group.icon)" :size="15" aria-hidden="true" />
                  基础配置
                </span>
                <h2>{{ group.title }}</h2>
              </div>
              <a
                v-if="docUrlForTitle(group.title, group.docUrl)"
                class="doc-link"
                :href="docUrlForTitle(group.title, group.docUrl)"
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink :size="15" aria-hidden="true" />
                官方文档
              </a>
            </header>

            <NForm :show-require-mark="false" label-placement="top">
              <div class="field-grid">
                <FieldControl
                  v-for="field in primaryFields(group.fields)"
                  :key="`${group.title}-${field.key}`"
                  :model="group.model"
                  :field="field"
                />
              </div>
            </NForm>

            <NCollapse
              v-if="secondaryFields(group.fields).length"
              class="field-defaults"
              arrow-placement="right"
            >
              <NCollapseItem name="defaults">
                <template #header>
                  <span class="collapse-title">
                    <Settings2 :size="16" aria-hidden="true" />
                    更多默认/高级属性
                  </span>
                </template>

                <NForm :show-require-mark="false" label-placement="top">
                  <div class="field-grid">
                    <FieldControl
                      v-for="field in secondaryFields(group.fields)"
                      :key="`${group.title}-more-${field.key}`"
                      :model="group.model"
                      :field="field"
                    />
                  </div>
                </NForm>
              </NCollapseItem>
            </NCollapse>
          </section>

          <section
            v-for="blockView in blockViews"
            :id="blockSectionId(blockView.blockIndex)"
            :key="blockView.block.title"
            class="editor-section"
          >
            <header class="section-header section-header--split">
              <div>
                <span class="eyebrow">
                  <component :is="iconFor(blockView.block.icon)" :size="15" aria-hidden="true" />
                  功能块
                </span>
                <h2>{{ blockView.block.title }}</h2>
              </div>

              <div class="section-actions">
                <NButton type="primary" secondary @click="addBlockItem(blockView)">
                  <template #icon>
                    <Plus :size="16" aria-hidden="true" />
                  </template>
                  {{ blockView.block.addLabel }}
                </NButton>
                <a
                  v-if="docUrlForTitle(blockView.block.title, blockView.block.docUrl)"
                  class="doc-link"
                  :href="docUrlForTitle(blockView.block.title, blockView.block.docUrl)"
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink :size="15" aria-hidden="true" />
                  官方文档
                </a>
              </div>
            </header>

            <div v-if="blockView.items.length === 0" class="empty-block">
              <strong>{{ blockView.block.emptyTitle }}</strong>
              <span>{{ blockView.block.emptyText }}</span>
            </div>

            <article
              v-for="(item, itemIndex) in blockView.items"
              :id="itemSectionId(blockView.blockIndex, itemIndex)"
              :key="item.id || itemIndex"
              class="feature-card"
            >
              <header class="feature-header">
                <div>
                  <span class="eyebrow">
                    <component :is="iconFor(blockView.block.getIcon(item))" :size="15" aria-hidden="true" />
                    {{ blockView.block.title }}
                  </span>
                  <h3>{{ blockView.block.getTitle(item, itemIndex) }}</h3>
                  <p>{{ blockView.block.getSummary(item) }}</p>
                </div>

                <div class="feature-actions">
                  <NSelect
                    v-if="blockView.block.typeOptions"
                    :value="blockView.block.getType(item)"
                    :options="normalizedOptions(blockView.block.typeOptions)"
                    class="feature-type"
                    size="small"
                    @update:value="blockView.block.onTypeChange(item, $event)"
                  />

                  <NButton
                    quaternary
                    circle
                    type="error"
                    title="删除"
                    @click="blockView.block.onRemove(item)"
                  >
                    <template #icon>
                      <Trash2 :size="16" aria-hidden="true" />
                    </template>
                  </NButton>
                </div>
              </header>

              <template
                v-for="itemGroup in blockView.block.getGroups(item)"
                :key="`${item.id || itemIndex}-${itemGroup.title}`"
              >
                <NCollapse
                  v-if="itemGroup.collapsible"
                  class="advanced-collapse"
                  arrow-placement="right"
                >
                  <NCollapseItem :name="itemGroup.title">
                    <template #header>
                      <span class="collapse-title collapse-title--split">
                        <span>
                          <component :is="iconFor(itemGroup.icon)" :size="16" aria-hidden="true" />
                          {{ itemGroup.title }}
                        </span>
                        <a
                          v-if="docUrlForTitle(itemGroup.title, itemGroup.docUrl || blockView.block.docUrl)"
                          class="doc-link doc-link--small"
                          :href="docUrlForTitle(itemGroup.title, itemGroup.docUrl || blockView.block.docUrl)"
                          target="_blank"
                          rel="noreferrer"
                          @click.stop
                        >
                          <ExternalLink :size="14" aria-hidden="true" />
                          官方文档
                        </a>
                      </span>
                    </template>

                    <NForm :show-require-mark="false" label-placement="top">
                      <div class="field-grid">
                        <FieldControl
                          v-for="field in itemGroup.fields"
                          :key="`${item.id || itemIndex}-${itemGroup.title}-${field.key}`"
                          :model="itemGroup.model"
                          :field="field"
                        />
                      </div>
                    </NForm>
                  </NCollapseItem>
                </NCollapse>

                <section v-else class="nested-section">
                  <div class="nested-heading nested-heading--split">
                    <span>
                      <component :is="iconFor(itemGroup.icon)" :size="17" aria-hidden="true" />
                      <h4>{{ itemGroup.title }}</h4>
                    </span>
                    <a
                      v-if="docUrlForTitle(itemGroup.title, itemGroup.docUrl || blockView.block.docUrl)"
                      class="doc-link doc-link--small"
                      :href="docUrlForTitle(itemGroup.title, itemGroup.docUrl || blockView.block.docUrl)"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink :size="14" aria-hidden="true" />
                      官方文档
                    </a>
                  </div>

                  <NForm :show-require-mark="false" label-placement="top">
                    <div class="field-grid">
                      <FieldControl
                        v-for="field in primaryFields(itemGroup.fields)"
                        :key="`${item.id || itemIndex}-${itemGroup.title}-${field.key}`"
                        :model="itemGroup.model"
                        :field="field"
                      />
                    </div>
                  </NForm>

                  <NCollapse
                    v-if="secondaryFields(itemGroup.fields).length"
                    class="field-defaults"
                    arrow-placement="right"
                  >
                    <NCollapseItem name="defaults">
                      <template #header>
                        <span class="collapse-title">
                          <Settings2 :size="16" aria-hidden="true" />
                          更多默认/高级属性
                        </span>
                      </template>

                      <NForm :show-require-mark="false" label-placement="top">
                        <div class="field-grid">
                          <FieldControl
                            v-for="field in secondaryFields(itemGroup.fields)"
                            :key="`${item.id || itemIndex}-${itemGroup.title}-more-${field.key}`"
                            :model="itemGroup.model"
                            :field="field"
                          />
                        </div>
                      </NForm>
                    </NCollapseItem>
                  </NCollapse>
                </section>
              </template>
            </article>
          </section>
        </NScrollbar>
      </section>

      <aside class="preview" aria-label="生成结果">
        <header class="preview-header">
          <div>
            <span class="eyebrow">
              <FileText :size="15" aria-hidden="true" />
              参考输出
            </span>
            <h2>{{ outputFileName }}</h2>
            <p>配置会随表单变化实时刷新，面向目标服务复制或下载。</p>
          </div>

          <div class="preview-actions">
            <NButton secondary @click="copyConfig">
              <template #icon>
                <Copy :size="16" aria-hidden="true" />
              </template>
              复制配置
            </NButton>
            <NButton secondary @click="downloadConfig">
              <template #icon>
                <Download :size="16" aria-hidden="true" />
              </template>
              下载
            </NButton>
            <NButton secondary type="primary" @click="openAI">
              <template #icon>
                <Sparkles :size="16" aria-hidden="true" />
              </template>
              询问 AI
            </NButton>
          </div>
        </header>

        <NTabs v-model:value="outputTab" type="line" animated class="output-tabs">
          <NTabPane name="config" tab="配置预览">
            <div class="code-shell">
              <div class="code-bar">
                <span>{{ outputFileName }}</span>
                <span>{{ activeGenerator.language }}</span>
              </div>
              <NScrollbar class="code-scroll" x-scrollable>
                <pre><code>{{ generatedConfig }}</code></pre>
              </NScrollbar>
            </div>
          </NTabPane>

          <NTabPane name="usage" tab="使用说明">
            <div class="usage-shell">
              <div class="usage-bar">
                <Terminal :size="16" aria-hidden="true" />
                <small>由 {{ usageModel || aiProviderModel || "AI" }} 提供支持</small>
                <NSpin v-if="usageLoading" size="small" />
              </div>
              <NInput
                :value="
                  usageLoading
                    ? aiUsageText || 'AI 正在根据当前配置生成使用说明...'
                    : usageError || aiUsageText
                "
                type="textarea"
                readonly
                :autosize="{ minRows: 18, maxRows: 32 }"
              />
            </div>
          </NTabPane>
        </NTabs>
      </aside>
    </main>

    <NDrawer
      v-model:show="aiDrawerOpen"
      placement="right"
      width="min(560px, calc(100vw - 24px))"
      class="ai-drawer"
      content-class="ai-drawer-content"
      :content-style="{ background: 'var(--surface-subtle)', color: 'var(--ink)', height: '100%' }"
      :show-mask="false"
      :block-scroll="false"
      :native-scrollbar="true"
    >
      <NDrawerContent
        title="询问 AI"
        closable
        :header-style="{ background: 'var(--surface)', borderBottom: '1px solid var(--line)' }"
        :body-style="{ background: 'var(--surface-subtle)' }"
        :body-content-style="{ padding: '16px' }"
      >
        <AIPanel :generator="activeGenerator" />
      </NDrawerContent>
    </NDrawer>
  </div>
</template>
