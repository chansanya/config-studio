// 从 Vue 中引入创建应用实例的方法。
import { createApp } from "vue";
// 引入根组件，所有生成器工作台 UI 都挂在这个组件下。
import App from "./App.vue";
// 引入全局样式，包含布局、表单、代码预览和响应式规则。
import "./styles.css";

// 创建 Vue 应用并挂载到 index.html 中的 #app 节点。
createApp(App).mount("#app");
