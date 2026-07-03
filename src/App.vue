<script setup>
import { NConfigProvider, NMessageProvider, dateZhCN, zhCN } from "naive-ui";
import GeneratorWorkbench from "./components/GeneratorWorkbench.vue";

// Naive UI 全局主题 token 统一放在入口，避免各组件重复写主色和圆角。
const themeOverrides = {
  common: {
    primaryColor: "#C4612F",
    primaryColorHover: "#D97742",
    primaryColorPressed: "#A94E22",
    primaryColorSuppl: "#C4612F",
    borderRadius: "8px",
    borderRadiusSmall: "6px",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  Button: {
    borderRadiusMedium: "8px",
    heightMedium: "36px",
  },
  Card: {
    borderRadius: "8px",
  },
  Drawer: {
    color: "#FBF9F5",
    textColor: "#1F2421",
    titleTextColor: "#1F2421",
    headerBorderBottom: "1px solid #E7E1D7",
  },
  Input: {
    borderRadius: "8px",
  },
  InputNumber: {
    borderRadius: "8px",
  },
  Select: {
    borderRadius: "8px",
  },
  Tabs: {
    tabFontWeightActive: "700",
  },
};
</script>

<template>
  <NConfigProvider :locale="zhCN" :date-locale="dateZhCN" :theme-overrides="themeOverrides">
    <NMessageProvider>
      <GeneratorWorkbench />
    </NMessageProvider>
  </NConfigProvider>
</template>
