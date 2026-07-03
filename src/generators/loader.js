import { reactive } from "vue";

// schema 默认值里可能有数组和对象，深拷贝可避免多个动态块共享同一份引用。
export function cloneSchemaValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cloneSchemaValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneSchemaValue(item)]),
    );
  }

  return value;
}

// 把 schema.state 转成 Vue 响应式 state，后续表单控件直接读写这份对象。
export function createStateFromSchema(schema) {
  return reactive(cloneSchemaValue(schema.state || {}));
}

// 把 schema.fieldGroups 绑定到指定 state，生成通用 FieldControl 可渲染的数据结构。
export function createFieldGroupsFromSchema(schema, state) {
  return (schema.fieldGroups || []).map((group) => ({
    title: group.title,
    icon: group.icon,
    model: state,
    fields: (group.fields || []).map((field) => cloneSchemaValue(field)),
  }));
}

// 静态表单生成器的快捷入口：一次性得到响应式 state 和字段分组。
export function createSchemaForm(schema) {
  const state = createStateFromSchema(schema);
  const groups = createFieldGroupsFromSchema(schema, state);

  return { state, groups };
}

// 按 schema 白名单把 AI 生成的 JSON 写回 state(静态字段 generator 用, 如 dockerfile)。
// 只接 schema.state 已知 key, 按 fieldGroups 字段类型做 number/toggle 容错转换。
export function applyStateFromSchema(state, schema, json) {
  const allowed = schema?.state ? new Set(Object.keys(schema.state)) : null;
  const source = pickAIObject(json, allowed);
  if (!source) return;
  const typeMap = {};
  for (const group of schema?.fieldGroups || []) {
    Object.assign(typeMap, createFieldTypeMap(group.fields));
  }
  for (const [key, value] of Object.entries(source)) {
    if (allowed && !allowed.has(key)) continue;
    state[key] = coerceValue(value, typeMap[key]);
  }
}

// AI 不一定完全按 expectedJson 返回，常见会包一层 state/config/form/data。
// 这里按 schema 已知 key 选择最像表单 state 的对象，避免回填被静默忽略。
export function pickAIObject(json, allowedKeys) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  if (hasAllowedKey(json, allowedKeys)) return json;

  for (const key of ["state", "config", "form", "values", "data", "settings"]) {
    const candidate = json[key];
    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      hasAllowedKey(candidate, allowedKeys)
    ) {
      return candidate;
    }
  }

  return null;
}

// 动态块回填同样兼容包装对象，例如 { data: { services: [...] } }。
export function pickAIArray(json, key) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];
  if (Array.isArray(json[key])) return json[key];

  for (const wrapperKey of ["state", "config", "form", "values", "data", "settings"]) {
    const candidate = json[wrapperKey];
    if (candidate && typeof candidate === "object" && Array.isArray(candidate[key])) {
      return candidate[key];
    }
  }

  return [];
}

// 从 AI 输出里取命名对象，兼容 { global: {...} } 和 { data: { global: {...} } }。
export function pickAIChildObject(json, key) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  if (json[key] && typeof json[key] === "object" && !Array.isArray(json[key])) {
    return json[key];
  }

  for (const wrapperKey of ["state", "config", "form", "values", "data", "settings"]) {
    const candidate = json[wrapperKey];
    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      candidate[key] &&
      typeof candidate[key] === "object" &&
      !Array.isArray(candidate[key])
    ) {
      return candidate[key];
    }
  }

  return null;
}

function hasAllowedKey(obj, allowedKeys) {
  if (!allowedKeys) return Object.keys(obj).length > 0;
  return Object.keys(obj).some((key) => allowedKeys.has(key));
}

export function mergeKnownFields(base, data, fields = []) {
  const typeMap = createFieldTypeMap(fields);
  const merged = { ...base };
  for (const key of Object.keys(base)) {
    if (key === "id") continue;
    if (data?.[key] !== undefined) {
      merged[key] = coerceValue(data[key], typeMap[key]);
    }
  }
  return merged;
}

export function createFieldTypeMap(fields = []) {
  const typeMap = {};
  for (const field of fields || []) {
    if (field.key) typeMap[field.key] = field.type;
  }
  return typeMap;
}

// AI 回填时按字段类型做轻量转换，避免数字和开关被字符串污染。
export function coerceValue(value, type) {
  if (type === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  if (type === "toggle") {
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    return Boolean(value);
  }
  return value == null ? value : String(value);
}

// 动态块删除统一按对象引用移除，避免各生成器重复写 splice 样板代码。
export function removeCollectionItem(collection, item) {
  const index = collection.indexOf(item);
  if (index !== -1) {
    collection.splice(index, 1);
  }
}

// 创建通用动态块 descriptor，让工作台能用同一套模板渲染不同工具的可新增条目。
export function createDynamicBlockDescriptor({
  meta,
  addModel,
  items,
  onAdd,
  fields,
  getTitle,
  getSummary,
  getIcon,
  getGroups,
  onRemove,
  typeOptions,
  getType,
  onTypeChange,
}) {
  // block 是工作台消费的稳定契约，内部函数仍回到各生成器自己的状态和规则。
  const block = {
    title: meta.title,
    icon: meta.icon,
    addLabel: meta.addLabel,
    add: { ...cloneSchemaValue(meta.add || {}), model: addModel },
    onAdd,
    emptyTitle: meta.emptyTitle,
    emptyText: meta.emptyText,
    getItems: () => items,
    getTitle,
    getSummary,
    getIcon,
    onRemove: onRemove || ((item) => removeCollectionItem(items, item)),
    getGroups:
      getGroups ||
      ((item) => [
        {
          title: meta.groupTitle,
          icon: meta.groupIcon,
          model: item,
          fields,
        },
      ]),
  };

  if (typeOptions) {
    block.typeOptions = typeOptions;
  }
  if (getType) {
    block.getType = getType;
  }
  if (onTypeChange) {
    block.onTypeChange = onTypeChange;
  }

  return block;
}
