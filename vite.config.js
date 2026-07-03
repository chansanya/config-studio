// 引入 Vite 的配置定义工具，提供类型提示和标准配置入口。
import { defineConfig } from "vite";
// 引入 Vue 插件，让 Vite 能编译 .vue 单文件组件。
import vue from "@vitejs/plugin-vue";

// GitHub Pages 部署时通常需要以仓库名作为静态资源 base path。
const githubPagesBase =
  // 从 GitHub Actions 的 owner/repo 环境变量中取 repo 名。
  process.env.GITHUB_REPOSITORY?.split("/").at(-1) || "config-studio";

// 导出 Vite 配置。
export default defineConfig({
  // base 决定构建产物引用 JS/CSS 资源时使用的路径前缀。
  base:
    // VITE_BASE_PATH 优先级最高，便于手动覆盖部署子路径。
    process.env.VITE_BASE_PATH ||
    // GitHub Pages 使用 /repo/，Cloudflare Pages 和本地开发使用 /。
    (process.env.GITHUB_PAGES === "true" ? `/${githubPagesBase}/` : "/"),
  // 注册 Vue 编译插件。
  plugins: [vue()],
});
