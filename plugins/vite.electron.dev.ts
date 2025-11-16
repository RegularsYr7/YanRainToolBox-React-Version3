import type { Plugin } from "vite";
import type { AddressInfo } from "net";
import { spawn } from "child_process";
import esbuild from "esbuild";

function buildElectronFiles() {
  try {
    // 构建主进程
    esbuild.buildSync({
      entryPoints: ["src/Electron/background.ts"],
      bundle: true,
      platform: "node",
      outfile: "dist/background.cjs",
      target: "node22",
      format: "cjs",
      external: [
        "electron",
        "fs",
        "path",
        "os",
        "child_process",
        "util",
        "events",
        "stream",
        "crypto",
        "fs-extra",
        "graceful-fs",
        "lzma",
        "node:fs",
        "node:path",
        "node:os",
        "node:child_process",
        "node:util",
        "node:events",
        "node:stream",
        "node:crypto",
        "node:url",
      ],
    });

    // 构建预加载脚本
    esbuild.buildSync({
      entryPoints: ["src/Electron/preload.ts"],
      bundle: true,
      platform: "node",
      outfile: "dist/preload.js",
      target: "node22",
      format: "cjs",
      external: ["electron"],
    });

    console.log("✅ Electron 文件构建成功");
  } catch (error) {
    console.error("❌ 构建失败:", error);
    throw error;
  }
}

export function electronDev(): Plugin {
  let electronProcess: ReturnType<typeof spawn> | null = null;

  // 杀掉 Electron 进程（包括所有子进程）
  const killElectron = () => {
    if (!electronProcess) return;

    if (process.platform === "win32") {
      // Windows: 使用 taskkill 杀掉整个进程树
      try {
        spawn(
          "taskkill",
          ["/pid", electronProcess.pid!.toString(), "/T", "/F"],
          {
            stdio: "ignore",
          }
        );
      } catch (error) {
        console.error("❌ 杀进程失败:", error);
      }
    } else {
      // macOS/Linux: 直接 kill
      electronProcess.kill();
    }
    electronProcess = null;
  };

  // 启动 Electron 进程的函数
  const startElectron = (devServerUrl: string) => {
    // 如果已有运行中的进程，先杀掉
    if (electronProcess) {
      console.log("🔄 检测到文件变化，重启 Electron...");
      killElectron();
      // 等待一小段时间确保进程完全退出
      setTimeout(() => {
        launchElectron(devServerUrl);
      }, 500);
    } else {
      launchElectron(devServerUrl);
    }
  };

  // 实际启动 Electron 的函数
  const launchElectron = (devServerUrl: string) => {
    console.log(`🚀 启动 Electron`);
    console.log(`📡 开发服务器: ${devServerUrl}`);

    // 在 Windows 上先设置控制台代码页为 UTF-8，再启动 Electron
    let command: string;
    let args: string[];

    if (process.platform === "win32") {
      // Windows: 使用 PowerShell 先设置代码页再启动
      command = "powershell";
      args = [
        "-NoProfile",
        "-Command",
        `chcp 65001 > $null; npx electron dist/background.cjs ${devServerUrl}`,
      ];
    } else {
      // macOS/Linux: 直接启动
      command = "npx";
      args = ["electron", "dist/background.cjs", devServerUrl];
    }

    electronProcess = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform !== "win32",
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
        PYTHONIOENCODING: "utf-8",
        LANG: "zh_CN.UTF-8",
      },
    });

    electronProcess.on("error", (error: Error) => {
      console.error(`❌ Electron 启动失败:`, error);
    });

    electronProcess.on("exit", (code) => {
      if (code !== null && code !== 0) {
        console.log(`⚠️ Electron 进程退出，退出码: ${code}`);
      }
    });
  };

  return {
    name: "electron-dev-simple",
    configureServer(server) {
      buildElectronFiles();

      server?.httpServer?.once("listening", () => {
        const addressInfo = server.httpServer?.address() as AddressInfo;
        const devServerUrl = `http://localhost:${addressInfo.port}`;

        // 首次启动
        startElectron(devServerUrl);
      });

      // 监听文件变化，重新构建并重启 Electron
      server.watcher.on("change", (file) => {
        if (
          file.includes("src/Electron") ||
          file.includes("plugins/vite.electron")
        ) {
          try {
            buildElectronFiles();
            const addressInfo = server.httpServer?.address() as AddressInfo;
            const devServerUrl = `http://localhost:${addressInfo.port}`;
            startElectron(devServerUrl);
          } catch (error) {
            console.error("❌ 重新构建失败:", error);
          }
        }
      });
    },

    // 在 Vite 关闭时确保杀掉 Electron 进程
    closeBundle() {
      killElectron();
    },
  };
}
