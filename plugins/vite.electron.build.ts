import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import * as electronBuilder from "electron-builder";
import type { Configuration } from "electron-builder";
import esbuild from "esbuild";
import { execSync } from "child_process";

/**
 * 预清理函数
 */
const preClean = () => {
  console.log("🧹 预清理旧文件...");

  // 终止可能的 Electron 进程
  try {
    if (process.platform === "win32") {
      execSync("taskkill /f /im electron.exe 2>nul", { stdio: "ignore" });
      execSync("taskkill /f /im YanRainToolBox_V3.exe 2>nul", {
        stdio: "ignore",
      });
      execSync("taskkill /f /im adb.exe 2>nul", { stdio: "ignore" });
      execSync("taskkill /f /im fastboot.exe 2>nul", { stdio: "ignore" });
    }
  } catch {
    // 忽略错误
  }

  // 尝试删除可能锁定的文件
  const problematicPaths = [
    "releases/win-unpacked/resources/app.asar",
    "releases/win-unpacked/resources",
    "releases/win-unpacked",
  ];

  for (const filePath of problematicPaths) {
    if (fs.existsSync(filePath)) {
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          fs.unlinkSync(filePath);
        } else if (stats.isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        }
        console.log(`✅ 删除: ${filePath}`);
      } catch {
        console.warn(`⚠️  无法删除: ${filePath}`);
      }
    }
  }
};

/**
 * 构建 Electron 主进程和预加载脚本
 */
const buildElectronFiles = async () => {
  try {
    console.log("🔨 开始构建 Electron 文件...");

    // 确保输出目录存在
    if (!fs.existsSync("dist")) {
      fs.mkdirSync("dist", { recursive: true });
    }

    // 构建主进程
    await esbuild.build({
      entryPoints: ["src/Electron/background.ts"],
      bundle: true,
      platform: "node",
      outfile: "dist/background.js",
      target: "node22",
      format: "cjs",
      external: ["electron"],
      minify: true,
      sourcemap: false,
      define: {
        "process.env.NODE_ENV": '"production"',
      },
      loader: {
        ".wasm": "binary",
        ".worker.js": "text",
      },
    });

    // 构建预加载脚本
    await esbuild.build({
      entryPoints: ["src/Electron/preload.ts"],
      bundle: true,
      platform: "node",
      outfile: "dist/preload.js",
      target: "node22",
      format: "cjs",
      external: ["electron"],
      minify: true,
      sourcemap: false,
      define: {
        "process.env.NODE_ENV": '"production"',
      },
    });

    console.log("✅ Electron 文件构建完成");
  } catch (error) {
    console.error("❌ Electron 文件构建失败:", error);
    throw error;
  }
};

/**
 * 准备打包所需的 package.json
 */
const preparePackageJson = () => {
  try {
    console.log("📦 准备 package.json...");

    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf-8"));

    // 创建用于打包的简化 package.json - 包含必要的元数据
    const distPackageJson = {
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description,
      main: "background.js",
      author: {
        name: "YanRain",
        email: "18203173685@163.com",
      },
      license: packageJson.license || "MIT",
      homepage: "https://gitee.com/yanrainonline/yan-rain-tool-box-react-ts-v3",
    };

    fs.writeFileSync(
      path.join("dist", "package.json"),
      JSON.stringify(distPackageJson, null, 2)
    );

    console.log("✅ package.json 准备完成");
  } catch (error) {
    console.error("❌ package.json 准备失败:", error);
    throw error;
  }
};

/**
 * 复制静态资源
 */
/**
 * 复制当前平台的工具文件
 */
const copyPlatformTools = () => {
  try {
    console.log("🔧 复制平台工具...");

    // 确定目标平台 - 优先使用环境变量，否则使用当前平台
    let targetPlatform;
    const envPlatform = process.env.TARGET_PLATFORM;

    if (envPlatform) {
      switch (envPlatform) {
        case "win32":
          targetPlatform = "windows";
          break;
        case "darwin":
          targetPlatform = "darwin";
          break;
        case "linux":
          targetPlatform = "linux";
          break;
        default:
          targetPlatform = "linux";
          break;
      }
      console.log(
        `🎯 使用环境变量指定的目标平台: ${targetPlatform} (${envPlatform})`
      );
    } else {
      // 如果没有设置环境变量，使用当前平台
      switch (process.platform) {
        case "win32":
          targetPlatform = "windows";
          break;
        case "darwin":
          targetPlatform = "darwin";
          break;
        case "linux":
          targetPlatform = "linux";
          break;
        default:
          targetPlatform = "linux";
          break;
      }
      console.log(`🖥️ 使用当前平台: ${targetPlatform} (${process.platform})`);
    }

    const platformToolsDir = path.join("tools", targetPlatform);
    const destToolsDir = path.join("dist", "tools", targetPlatform);

    if (fs.existsSync(platformToolsDir)) {
      // 确保目标目录存在
      fs.mkdirSync(destToolsDir, { recursive: true });

      // 递归复制工具文件
      const copyDirectory = (srcDir: string, destDir: string) => {
        const items = fs.readdirSync(srcDir);

        for (const item of items) {
          const srcPath = path.join(srcDir, item);
          const destPath = path.join(destDir, item);

          if (fs.statSync(srcPath).isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            copyDirectory(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
            console.log(`🔧 复制工具: ${srcPath} -> ${destPath}`);
          }
        }
      };

      copyDirectory(platformToolsDir, destToolsDir);
      console.log(`✅ ${targetPlatform} 平台工具复制完成`);
    } else {
      console.log(
        `⚠️ 未找到 ${targetPlatform} 平台工具目录: ${platformToolsDir}`
      );
    }
  } catch (error) {
    throw new Error(
      `平台工具复制失败: ${error instanceof Error ? error.message : error}`
    );
  }
};

/**
 * 复制静态资源
 */
const copyAssets = () => {
  try {
    console.log("📂 复制静态资源...");

    // 复制图标文件（如果存在）
    const iconPaths = [
      "public/icon.ico",
      "assets/icon.ico",
      "src/assets/icon.ico",
    ];
    let iconCopied = false;

    for (const iconPath of iconPaths) {
      if (fs.existsSync(iconPath)) {
        const destPath = path.join("dist", "icon.ico");
        fs.copyFileSync(iconPath, destPath);
        console.log(`📋 复制图标: ${iconPath} -> ${destPath}`);
        iconCopied = true;
        break;
      }
    }

    if (!iconCopied) {
      console.log("⚠️ 未找到图标文件，将使用默认图标");
    }

    // 复制其他必要的资源文件
    const resourceDirs = ["public", "assets"];
    for (const dir of resourceDirs) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (!file.includes("vite.svg") && !file.includes("favicon")) {
            const srcPath = path.join(dir, file);
            const destPath = path.join("dist", file);

            if (fs.statSync(srcPath).isFile()) {
              fs.copyFileSync(srcPath, destPath);
              console.log(`📋 复制资源: ${srcPath} -> ${destPath}`);
            }
          }
        }
      }
    }

    // 复制当前平台的工具
    copyPlatformTools();

    // 复制官方 OTA proto（供运行时动态加载）
    const protoSrc = path.join("src", "types", "update_metadata.proto");
    if (fs.existsSync(protoSrc)) {
      const protoDest = path.join(
        "dist",
        "src",
        "types",
        "update_metadata.proto"
      );
      fs.mkdirSync(path.dirname(protoDest), { recursive: true });
      fs.copyFileSync(protoSrc, protoDest);
      console.log(`📋 复制 proto: ${protoSrc} -> ${protoDest}`);
    } else {
      console.warn(
        `⚠️ 未找到 proto 文件: ${protoSrc}，如果生产环境需要解析 OTA Manifest，请确保该文件存在`
      );
    }

    console.log("✅ 静态资源复制完成");
  } catch (error) {
    console.error("❌ 静态资源复制失败:", error);
    throw error;
  }
};

/**
 * 获取构建配置
 */
const getBuildConfiguration = (): Configuration => {
  // 检查是否存在图标文件
  const iconPaths = [
    "public/icon.ico",
    "assets/icon.ico",
    "src/assets/icon.ico",
    "dist/icon.ico",
  ];
  let iconPath: string | undefined;

  for (const path of iconPaths) {
    if (fs.existsSync(path)) {
      iconPath = path;
      break;
    }
  }

  // 确定目标平台 - 优先使用环境变量，否则使用当前平台
  let targetPlatform;
  const envPlatform = process.env.TARGET_PLATFORM;

  if (envPlatform) {
    switch (envPlatform) {
      case "win32":
        targetPlatform = "windows";
        break;
      case "darwin":
        targetPlatform = "darwin";
        break;
      case "linux":
        targetPlatform = "linux";
        break;
      default:
        targetPlatform = "linux";
        break;
    }
    console.log(
      `🎯 构建目标平台: ${targetPlatform} (环境变量: ${envPlatform})`
    );
  } else {
    // 如果没有设置环境变量，使用当前平台
    switch (process.platform) {
      case "win32":
        targetPlatform = "windows";
        break;
      case "darwin":
        targetPlatform = "darwin";
        break;
      case "linux":
        targetPlatform = "linux";
        break;
      default:
        targetPlatform = "linux";
        break;
    }
    console.log(
      `🖥️ 构建目标平台: ${targetPlatform} (当前平台: ${process.platform})`
    );
  }

  // 基础配置
  const baseConfig: Configuration = {
    directories: {
      output: path.resolve(process.cwd(), "releases"),
      app: path.resolve(process.cwd(), "dist"),
    },
    // 先做大范围排除，再显式重新包含需要的 proto 文件
    files: [
      "**/*",
      "!**/*.ts",
      "!**/*.map",
      "!src/**/*",
      // 重新包含：我们在 copyAssets 中复制到了 dist/src/types/update_metadata.proto
      "src/types/update_metadata.proto",
    ],
    appId: "com.yanrain.toolbox",
    productName: "YanRainToolBox_V3",
    asar: true,
    // 解包工具与 proto 文件，便于运行时直接访问与用户在 releases 中直观看到
    asarUnpack: ["**/tools/**", "src/types/update_metadata.proto"],
    extraResources: [],
    publish: null,
    // 跨平台构建配置
    npmRebuild: false, // 禁用 npm rebuild，避免跨平台依赖问题
    nodeGypRebuild: false, // 禁用 node-gyp rebuild
    buildDependenciesFromSource: false, // 不从源码构建依赖
    // 元数据
    copyright: "Copyright © 2024 YanRain",
    // 确保有必要的构建信息
    electronVersion: undefined, // 让 electron-builder 自动检测
  };

  // 根据目标平台配置构建选项
  if (targetPlatform === "windows") {
    return {
      ...baseConfig,
      // 移除 extraResources，只使用 asarUnpack 避免重复
      win: {
        target: [
          {
            target: "nsis",
            arch: ["x64"],
          },
          {
            target: "portable",
            arch: ["x64"],
          },
        ],
        ...(iconPath ? { icon: iconPath } : {}),
        verifyUpdateCodeSignature: false,
      },
      nsis: {
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        allowElevation: true,
        ...(iconPath
          ? {
              installerIcon: iconPath,
              uninstallerIcon: iconPath,
              installerHeaderIcon: iconPath,
            }
          : {}),
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: "YanRainToolBox V3",
      },
    };
  } else if (targetPlatform === "linux") {
    // 在 Windows 系统上构建 Linux 包时，只构建 deb，避免 AppImage 工具缺失问题
    const isWindowsHost = process.platform === "win32";

    if (isWindowsHost) {
      console.log(`🐧 Linux 构建目标: tar.gz (Windows 主机限制)`);
      return {
        ...baseConfig,
        // 移除 extraResources，只使用 asarUnpack 避免重复
        linux: {
          target: [
            {
              target: "tar.gz",
              arch: "x64",
            },
          ],
          ...(iconPath ? { icon: iconPath } : {}),
          category: "Utility",
          maintainer: "YanRain <18203173685@163.com>",
          vendor: "YanRain",
        },
      };
    } else {
      console.log(`🐧 Linux 构建目标: AppImage, deb`);
      return {
        ...baseConfig,
        // 移除 extraResources，只使用 asarUnpack 避免重复
        linux: {
          target: [
            {
              target: "AppImage",
              arch: "x64",
            },
            {
              target: "deb",
              arch: "x64",
            },
          ],
          ...(iconPath ? { icon: iconPath } : {}),
          category: "Utility",
          maintainer: "YanRain <18203173685@163.com>",
          vendor: "YanRain",
        },
      };
    }
  } else if (targetPlatform === "darwin") {
    // 检查是否在 Windows 系统上尝试构建 macOS
    const isWindowsHost = process.platform === "win32";

    if (isWindowsHost) {
      console.log(`🍎 macOS 构建目标: 跳过 (Windows 主机不支持)`);
      console.log(`💡 提示: macOS 构建需要在 macOS 系统上进行`);
      console.log(
        `📖 更多信息: https://www.electron.build/multi-platform-build`
      );
      console.log(`🐳 替代方案: 使用 Docker 或 CI/CD 服务构建`);
      throw new Error(
        "macOS 构建需要在 macOS 系统上进行。\n" +
          "替代方案:\n" +
          "1. 在 macOS 设备上运行 'pnpm run build:mac'\n" +
          "2. 使用 Docker 容器进行跨平台构建\n" +
          "3. 使用 CI/CD 服务 (如 GitHub Actions, Travis CI)"
      );
    }

    console.log(`🍎 macOS 构建目标: dmg`);
    return {
      ...baseConfig,
      // 移除 extraResources，只使用 asarUnpack 避免重复
      mac: {
        target: [
          {
            target: "dmg",
            arch: ["x64", "arm64"],
          },
        ],
        ...(iconPath ? { icon: iconPath } : {}),
        category: "public.app-category.utilities",
      },
    };
  }

  // 默认返回基础配置 (不应该到达这里)
  return baseConfig;
};

export const ElectronBuildPlugin = (): Plugin => {
  return {
    name: "electron-build",

    async closeBundle() {
      try {
        console.log("🚀 开始 Electron 应用打包...");

        // 0. 预清理
        preClean();

        // 1. 构建 Electron 文件
        await buildElectronFiles();

        // 2. 准备 package.json
        preparePackageJson();

        // 3. 复制静态资源
        copyAssets();

        // 4. 执行 electron-builder 打包
        console.log("📦 开始打包应用...");
        const config = getBuildConfiguration();

        // 确定目标平台
        const envPlatform = process.env.TARGET_PLATFORM;
        let targetPlatform: electronBuilder.Platform;

        if (envPlatform) {
          switch (envPlatform) {
            case "win32":
              targetPlatform = electronBuilder.Platform.WINDOWS;
              console.log(`🎯 electron-builder 目标平台: Windows`);
              break;
            case "darwin":
              targetPlatform = electronBuilder.Platform.MAC;
              console.log(`🎯 electron-builder 目标平台: macOS`);
              break;
            case "linux":
              targetPlatform = electronBuilder.Platform.LINUX;
              console.log(`🎯 electron-builder 目标平台: Linux`);
              break;
            default:
              targetPlatform = electronBuilder.Platform.LINUX;
              console.log(`🎯 electron-builder 目标平台: Linux (默认)`);
              break;
          }
        } else {
          // 如果没有设置环境变量，使用当前平台
          switch (process.platform) {
            case "win32":
              targetPlatform = electronBuilder.Platform.WINDOWS;
              console.log(`🖥️ electron-builder 目标平台: Windows (当前平台)`);
              break;
            case "darwin":
              targetPlatform = electronBuilder.Platform.MAC;
              console.log(`🖥️ electron-builder 目标平台: macOS (当前平台)`);
              break;
            case "linux":
              targetPlatform = electronBuilder.Platform.LINUX;
              console.log(`🖥️ electron-builder 目标平台: Linux (当前平台)`);
              break;
            default:
              targetPlatform = electronBuilder.Platform.LINUX;
              console.log(`🖥️ electron-builder 目标平台: Linux (默认)`);
              break;
          }
        }

        await electronBuilder.build({
          config,
          targets: targetPlatform.createTarget(),
          publish: "never", // 不自动发布
        });

        console.log("🎉 应用打包完成！");
        console.log("📁 输出目录:", path.resolve(process.cwd(), "releases"));
      } catch (error) {
        console.error("❌ 打包失败:", error);
        process.exit(1);
      }
    },
  };
};
