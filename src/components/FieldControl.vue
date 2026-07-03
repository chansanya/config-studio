<script setup>
import { computed } from "vue";
import { NFormItem, NInput, NInputNumber, NSelect, NSwitch } from "naive-ui";

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  field: {
    type: Object,
    required: true,
  },
});

// 字段 schema 的 when 支持字符串、函数、all/any 组合和 key/value 条件，统一在这里求值。
function resolveWhenCondition(condition) {
  if (!condition) {
    return true;
  }

  if (typeof condition === "string") {
    return Boolean(props.model[condition]);
  }

  if (typeof condition === "function") {
    return condition(props.model);
  }

  if (Array.isArray(condition.all)) {
    return condition.all.every((item) => resolveWhenCondition(item));
  }

  if (Array.isArray(condition.any)) {
    return condition.any.some((item) => resolveWhenCondition(item));
  }

  return props.model[condition.key] === condition.value;
}

// 当前字段是否显示，由字段自己的 when 条件决定。
const visible = computed(() => {
  return resolveWhenCondition(props.field.when);
});

// 文本、下拉、开关和 textarea 直接读写当前字段 key 对应的 model 值。
const value = computed({
  get() {
    return props.model[props.field.key];
  },
  set(nextValue) {
    props.model[props.field.key] = nextValue;
  },
});

// Naive UI 数字输入需要 null 表示空值；业务 state 仍保留空字符串，便于生成器判断是否输出。
const numberValue = computed({
  get() {
    const rawValue = props.model[props.field.key];
    if (rawValue === "" || rawValue === null || rawValue === undefined) {
      return null;
    }
    return Number(rawValue);
  },
  set(nextValue) {
    props.model[props.field.key] = nextValue ?? "";
  },
});

// schema 允许简写字符串选项，这里统一转换成 NSelect 的 { label, value } 结构。
const selectOptions = computed(() =>
  (props.field.options || []).map((option) =>
    typeof option === "string" ? { label: option, value: option } : option,
  ),
);
</script>

<template>
  <NFormItem
    v-if="visible"
    class="field-control"
    :class="{
      'field-control--wide': field.type === 'textarea',
      'field-control--switch': field.type === 'toggle',
    }"
    :label="field.label"
    :feedback="field.hint"
    :show-feedback="Boolean(field.hint)"
  >
    <NSwitch v-if="field.type === 'toggle'" v-model:value="value" />

    <NSelect
      v-else-if="field.type === 'select'"
      v-model:value="value"
      :options="selectOptions"
      filterable
    />

    <NInput
      v-else-if="field.type === 'textarea'"
      v-model:value="value"
      type="textarea"
      :autosize="{ minRows: 3, maxRows: 8 }"
      spellcheck="false"
    />

    <NInputNumber
      v-else-if="field.type === 'number'"
      v-model:value="numberValue"
      :min="field.min"
      :max="field.max"
      :show-button="false"
    />

    <NInput v-else v-model:value="value" spellcheck="false" />
  </NFormItem>
</template>
