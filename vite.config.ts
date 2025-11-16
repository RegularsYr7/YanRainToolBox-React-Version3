import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { electronDev } from "./plugins/vite.electron.dev";
import { ElectronBuildPlugin } from "./plugins/vite.electron.build";

export default defineConfig(({ command }) => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // 只在开发模式下启用 Electron 开发插件
      ...(command === "serve" ? [electronDev()] : []),
      // 只在生产构建时启用 Electron 构建插件
      ...(command === "build" ? [ElectronBuildPlugin()] : []),
    ],
    base: "./",
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  };
});
