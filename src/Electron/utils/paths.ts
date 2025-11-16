/**
 * @fileoverview 应用路径配置管理模块 (纯函数式)
 * @description 统一管理 YanRain ToolBox 应用中所有路径配置的核心模块
 *
 * @architecture 设计模式
 * - **纯函数式**: 使用闭包和工厂函数替代单例模式
 * - **工厂模式**: 根据平台自动选择对应的工具路径
 * - **适配器模式**: 兼容不同环境和平台的路径差异
 *
 * @example 基本使用
 * ```typescript
 * // 方式1: 使用预初始化实例
 * import { pathManager } from './utils/paths';
 * const adbPath = pathManager.getAdbPath();
 *
 * // 方式2: 使用快捷方法
 * import { getAdbPath, getFastbootPath } from './utils/paths';
 * const adbPath = getAdbPath();
 * const fastbootPath = getFastbootPath();
 *
 * // 方式3: 创建自定义实例
 * import { createPathManager } from './utils/paths';
 * const customPaths = createPathManager();
 * ```
 */

import path from "path";
import fs from "fs";
import os from "os";

/**
 * 平台类型定义
 *
 * 支持的操作系统平台类型：
 * - windows: Windows 操作系统
 * - darwin: macOS 操作系统
 * - linux: Linux 操作系统
 */
type Platform = "windows" | "darwin" | "linux";

/**
 * 路径管理器状态接口
 */
interface PathManagerState {
  currentPlatform: Platform;
}

/**
 * 创建路径管理器
 *
 * @returns 路径管理方法集合
 *
 * @example
 * ```ts
 * const paths = createPathManager();
 * const adbPath = paths.getAdbPath();
 * ```
 */
export function createPathManager() {
  // 内部状态
  const state: PathManagerState = {
    currentPlatform: determinePlatform(),
  };

  /**
   * 确定当前平台标识
   */
  function determinePlatform(): Platform {
    switch (process.platform) {
      case "win32":
        return "windows";
      case "darwin":
        return "darwin";
      case "linux":
        return "linux";
      default:
        return "linux"; // 默认使用 linux
    }
  }

  /**
   * 获取当前运行平台标识
   *
   * 返回经过标准化的平台标识，用于确定工具路径和平台特定的配置。
   *
   * @returns 当前平台标识 ('windows' | 'darwin' | 'linux')
   */
  function getCurrentPlatform(): Platform {
    return state.currentPlatform;
  }

  /**
   * 获取应用根目录路径
   *
   * 根据运行环境自动选择正确的应用根目录：
   *
   * @environment 开发环境 - 返回当前工作目录 (process.cwd())
   * @environment 生产环境 - 优先使用 Electron 的资源路径 (process.resourcesPath)
   * @environment 备用方案 - 使用可执行文件目录 (process.execPath 的父目录)
   *
   * @returns 应用根目录的绝对路径
   */
  function getAppRoot(): string {
    if (process.env.NODE_ENV === "development") {
      return process.cwd();
    }

    // 生产环境 - Electron 打包后
    if (process.resourcesPath) {
      // 工具文件在 app.asar.unpacked 中
      return path.join(process.resourcesPath, "app.asar.unpacked");
    }

    // 备用方案
    return path.dirname(process.execPath);
  }

  /**
   * 获取应用根目录（公开）
   * @returns 应用根目录绝对路径
   */
  function getAppRootDir(): string {
    return getAppRoot();
  }

  /**
   * 获取当前平台的工具目录路径
   *
   * 构造当前平台对应的工具目录路径。目录结构为：
   * {AppRoot}/tools/{Platform}/
   *
   * @example 路径示例
   * - Windows: /path/to/app/tools/windows/
   * - macOS: /path/to/app/tools/darwin/
   * - Linux: /path/to/app/tools/linux/
   *
   * @returns 当前平台工具目录的绝对路径
   */
  function getPlatformToolsDir(): string {
    const appRoot = getAppRoot();
    return path.join(appRoot, "tools", state.currentPlatform);
  }

  /**
   * 获取当前平台可执行文件的扩展名
   *
   * 根据平台返回对应的可执行文件扩展名：
   * - Windows: '.exe'
   * - macOS/Linux: '' (无扩展名)
   *
   * @returns 可执行文件扩展名
   */
  function getExecutableExtension(): string {
    return state.currentPlatform === "windows" ? ".exe" : "";
  }

  /**
   * 获取 ADB (Android Debug Bridge) 工具的完整路径
   *
   * ADB 是 Android 开发和调试的核心工具，用于与 Android 设备通信。
   * 自动根据当前平台选择对应的 ADB 可执行文件。
   *
   * @example 返回路径示例
   * - Windows: /path/to/app/tools/windows/adb.exe
   * - macOS: /path/to/app/tools/darwin/adb
   * - Linux: /path/to/app/tools/linux/adb
   *
   * @returns ADB 工具的绝对路径
   */
  function getAdbPath(): string {
    const toolsDir = getPlatformToolsDir();
    const adbName = `adb${getExecutableExtension()}`;
    return path.join(toolsDir, adbName);
  }

  /**
   * 获取 Fastboot 工具的完整路径
   *
   * Fastboot 是用于刷写 Android 设备引导程序和系统分区的工具。
   * 主要用于设备重启到 Fastboot 模式后的系统级操作。
   * 自动根据当前平台选择对应的 Fastboot 可执行文件。
   *
   * @example 返回路径示例
   * - Windows: /path/to/app/tools/windows/fastboot.exe
   * - macOS: /path/to/app/tools/darwin/fastboot
   * - Linux: /path/to/app/tools/linux/fastboot
   *
   * @returns Fastboot 工具的绝对路径
   */
  function getFastbootPath(): string {
    const toolsDir = getPlatformToolsDir();
    const fastbootName = `fastboot${getExecutableExtension()}`;
    return path.join(toolsDir, fastbootName);
  }

  /**
   * 获取 Magisk Boot 工具的完整路径
   *
   * Magisk Boot 是 Magisk 项目的引导镜像处理工具，用于：
   * - 解包和重新打包 boot.img 镜像文件
   * - 修补 boot 分区以获得 root 权限
   * - 管理 Magisk 模块和补丁
   *
   * 自动根据当前平台选择对应的 Magisk Boot 可执行文件。
   *
   * @example 返回路径示例
   * - Windows: /path/to/app/tools/windows/magiskboot.exe
   * - macOS: /path/to/app/tools/darwin/magiskboot
   * - Linux: /path/to/app/tools/linux/magiskboot
   *
   * @returns Magisk Boot 工具的绝对路径
   */
  function getMagiskBootPath(): string {
    const toolsDir = getPlatformToolsDir();
    const magiskbootName = `magiskboot${getExecutableExtension()}`;
    return path.join(toolsDir, magiskbootName);
  }

  /**
   * 获取 AAPT 工具的完整路径
   *
   * AAPT (Android Asset Packaging Tool) 用于：
   * - 查看 APK 包信息（包名、版本、权限等）
   * - 提取 APK 中的应用名称和图标
   * - 解析 AndroidManifest.xml
   *
   * 优先使用 aapt2（更快），如果不存在则回退到 aapt。
   *
   * @example 返回路径示例
   * - Windows: /path/to/app/tools/windows/aapt.exe
   * - macOS: /path/to/app/tools/darwin/aapt
   * - Linux: /path/to/app/tools/linux/aapt
   *
   * @returns AAPT 工具的绝对路径
   */
  function getAaptPath(): string {
    const toolsDir = getPlatformToolsDir();
    const aaptName = `aapt${getExecutableExtension()}`;
    return path.join(toolsDir, aaptName);
  }

  /**
   * 获取所有平台的工具目录路径映射表
   *
   * 返回包含所有支持平台工具目录路径的对象，主要用于：
   * - 开发时检查工具文件是否存在
   * - 调试和验证工具路径配置
   * - 平台兼容性测试
   *
   * @example 返回值示例
   * ```typescript
   * {
   *   windows: "/path/to/app/tools/windows",
   *   darwin: "/path/to/app/tools/darwin",
   *   linux: "/path/to/app/tools/linux"
   * }
   * ```
   *
   * @returns 平台到工具目录路径的映射对象
   */
  function getAllPlatformToolsPaths(): Record<Platform, string> {
    const appRoot = getAppRoot();
    return {
      windows: path.join(appRoot, "tools", "windows"),
      darwin: path.join(appRoot, "tools", "darwin"),
      linux: path.join(appRoot, "tools", "linux"),
    };
  }

  /**
   * 检查当前平台的必需工具是否都存在
   *
   * 验证当前平台下的核心工具文件是否存在且可访问：
   * - 工具目录是否存在
   * - ADB 工具文件是否存在
   * - Fastboot 工具文件是否存在
   *
   * 这个方法用于应用启动时的环境检查，确保所有必需工具都可用。
   *
   * @returns true 表示所有工具都存在，false 表示有工具缺失
   *
   * @example 使用示例
   * ```typescript
   * const paths = createPathManager();
   * if (!paths.checkPlatformToolsExist()) {
   *   console.error('缺少必需的工具文件，请重新安装应用');
   * }
   * ```
   */
  function checkPlatformToolsExist(): boolean {
    const toolsDir = getPlatformToolsDir();
    const adbPath = getAdbPath();
    const fastbootPath = getFastbootPath();

    try {
      return (
        fs.existsSync(toolsDir) &&
        fs.existsSync(adbPath) &&
        fs.existsSync(fastbootPath)
      );
    } catch {
      return false;
    }
  }

  /**
   * 获取临时文件目录路径
   *
   * 返回应用专用的临时文件目录，用于存储：
   * - 临时下载文件
   * - 处理过程中的中间文件
   * - 缓存文件和临时数据
   *
   * 根据运行环境自动选择合适的临时目录：
   *
   * @environment 开发环境 - 使用项目根目录下的 temp 文件夹
   * @environment 生产环境 - 使用系统临时目录下的应用专用子目录
   *
   * @example 返回路径示例
   * - 开发环境: /project/root/temp
   * - 生产环境: /tmp/yanrain-toolbox (Linux/macOS) 或 C:\Users\xxx\AppData\Local\Temp\yanrain-toolbox (Windows)
   *
   * @returns 临时文件目录的绝对路径
   */
  function getTempDir(): string {
    if (process.env.NODE_ENV === "development") {
      return path.join(process.cwd(), "temp");
    }

    // 生产环境使用系统临时目录
    return path.join(os.tmpdir(), "yanrain-toolbox");
  }

  /**
   * 获取用户数据目录路径
   *
   * 返回应用专用的用户数据目录，用于存储：
   * - 用户配置文件
   * - 应用日志文件
   * - 用户个人数据
   * - 持久化存储数据
   *
   * 根据运行环境和进程类型自动选择合适的用户数据目录：
   *
   * @environment 渲染进程 - 使用 Electron remote API 获取标准用户数据路径
   * @environment 开发环境/主进程 - 使用项目根目录下的 userData 文件夹
   * @environment 生产环境 - 使用用户主目录下的 .yanrain-toolbox 隐藏文件夹
   *
   * @example 返回路径示例
   * - 开发环境: /project/root/userData
   * - 生产环境 Windows: C:\Users\xxx\AppData\Roaming\yanrain-toolbox
   * - 生产环境 macOS: /Users/xxx/Library/Application Support/yanrain-toolbox
   * - 生产环境 Linux: /home/xxx/.yanrain-toolbox
   *
   * @returns 用户数据目录的绝对路径
   */
  function getUserDataDir(): string {
    if (typeof window !== "undefined" && window.require) {
      // 渲染进程
      const { remote } = window.require("electron");
      return remote.app.getPath("userData");
    }

    // 主进程或开发环境
    if (process.env.NODE_ENV === "development") {
      return path.join(process.cwd(), "userData");
    }

    return path.join(os.homedir(), ".yanrain-toolbox");
  }

  /**
   * 获取应用日志目录路径
   *
   * 返回用于存储应用日志文件的目录路径。
   * 日志目录位于用户数据目录下的 logs 子目录中。
   *
   * 用于存储：
   * - 应用运行日志
   * - 错误日志记录
   * - 调试信息日志
   * - 操作历史日志
   *
   * @example 返回路径示例
   * - {UserDataDir}/logs/
   *
   * @returns 日志目录的绝对路径
   */
  function getLogsDir(): string {
    return path.join(getUserDataDir(), "logs");
  }

  /**
   * 获取应用配置文件路径
   *
   * 返回主配置文件 config.json 的完整路径。
   * 配置文件位于用户数据目录下，用于存储：
   * - 应用设置和偏好
   * - 用户自定义配置
   * - 工具路径配置
   * - 界面状态设置
   *
   * @example 返回路径示例
   * - {UserDataDir}/config.json
   *
   * @returns 配置文件的绝对路径
   */
  function getConfigPath(): string {
    return path.join(getUserDataDir(), "config.json");
  }

  /**
   * 获取官方 OTA 协议文件 update_metadata.proto 的路径
   *
   * 用途：用于通过 protobufjs 动态加载官方 DeltaArchiveManifest 协议定义。
   *
   * 路径解析策略（按优先级）：
   * 1) {AppRoot}/src/types/update_metadata.proto  → 开发环境默认位置
   * 2) {AppRoot}/types/update_metadata.proto      → 若构建步骤改变了目录结构
   * 3) {resources}/app.asar.unpacked/src/types/update_metadata.proto → 生产环境回退
   *    - 当应用以 Electron 打包运行时，资源通常会解压到 app.asar.unpacked 目录
   *    - 本方法会在 process.resourcesPath 存在时，尝试该位置
   *
   * 注意：本方法仅返回"第一个存在的候选路径"。若所有候选路径均不存在，将抛出异常，
   * 调用方应在上层捕获并提示用户"缺少 update_metadata.proto"。
   *
   * @returns update_metadata.proto 的绝对路径
   * @throws {Error} 当未能在任何候选位置找到该文件时抛出
   */
  function getUpdateMetadataProtoPath(): string {
    const appRoot = getAppRoot();

    // 组装候选路径，按优先级从高到低
    const candidates: string[] = [
      path.join(appRoot, "src", "types", "update_metadata.proto"),
      path.join(appRoot, "types", "update_metadata.proto"),
    ];

    // 在生产环境下补充 resources/app.asar.unpacked 及 app.asar 的回退候选
    if (process.resourcesPath) {
      candidates.push(
        path.join(
          process.resourcesPath,
          "app.asar.unpacked",
          "src",
          "types",
          "update_metadata.proto"
        )
      );
      // 一些场景可能未解包，直接位于 app.asar，同步读取有局限，但保留候选以便开发者自测
      candidates.push(
        path.join(
          process.resourcesPath,
          "app.asar",
          "src",
          "types",
          "update_metadata.proto"
        )
      );
    }

    // 去重（避免 appRoot 已经是 app.asar.unpacked 时产生重复）
    const seen = new Set<string>();
    for (const p of candidates) {
      const normalized = path.resolve(p);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      try {
        if (fs.existsSync(normalized)) return normalized;
      } catch {
        // ignore and try next
      }
    }

    throw new Error(
      `未找到 update_metadata.proto，请确认该文件包含在运行环境中（尝试位置: ${Array.from(
        seen
      ).join(", ")} )`
    );
  }

  return {
    getCurrentPlatform,
    getAppRootDir,
    getPlatformToolsDir,
    getAdbPath,
    getFastbootPath,
    getMagiskBootPath,
    getAaptPath,
    getAllPlatformToolsPaths,
    checkPlatformToolsExist,
    getTempDir,
    getUserDataDir,
    getLogsDir,
    getConfigPath,
    getUpdateMetadataProtoPath,
  };
}

/**
 * 预初始化的路径管理器实例
 *
 * 为了方便使用，预先创建一个路径管理器实例并导出。
 * 这样在其他模块中可以直接导入使用。
 *
 * @example 使用示例
 * ```typescript
 * import { pathManager } from './utils/paths';
 * const adbPath = pathManager.getAdbPath();
 * ```
 */
export const pathManager = createPathManager();

/**
 * 快捷方法 - 获取 ADB 工具路径
 */
export const getAdbPath = (): string => pathManager.getAdbPath();

/**
 * 快捷方法 - 获取 Fastboot 工具路径
 */
export const getFastbootPath = (): string => pathManager.getFastbootPath();

/**
 * 快捷方法 - 获取 Magisk Boot 工具路径
 */
export const getMagiskBootPath = (): string => pathManager.getMagiskBootPath();

/**
 * 快捷方法 - 获取 AAPT 工具路径
 */
export const getAaptPath = (): string => pathManager.getAaptPath();

/**
 * 快捷方法 - 获取应用根目录
 */
export const getAppRootDir = (): string => pathManager.getAppRootDir();

/**
 * 快捷方法 - 获取临时文件目录路径
 */
export const getTempDir = (): string => pathManager.getTempDir();

/**
 * 快捷方法 - 获取用户数据目录路径
 */
export const getUserDataDir = (): string => pathManager.getUserDataDir();

/**
 * Boot 工具路径配置对象 (向后兼容)
 *
 * @deprecated 建议使用新的 pathManager 实例或快捷方法来获取工具路径
 */
export const BOOT_PATH_CONFIG = {
  ADB_BIN_PATH: getAdbPath(),
  FASTBOOT_BIN_PATH: getFastbootPath(),
  MAGISKBOOT_PATCH_PATH: getMagiskBootPath(),
};

/**
 * 快捷方法 - 获取 update_metadata.proto 的绝对路径
 */
export const getUpdateMetadataProtoPath = (): string =>
  pathManager.getUpdateMetadataProtoPath();

/**
 * 快捷方法 - 获取当前平台的工具目录路径
 */
export const getPlatformToolsDirPath = (): string =>
  pathManager.getPlatformToolsDir();

/**
 * 向后兼容的 PathManager 类
 *
 * @deprecated 建议直接使用 createPathManager 工厂函数或 pathManager 实例
 */
export class PathManager {
  private static instance: ReturnType<typeof createPathManager>;

  private constructor() {
    // Private constructor for singleton pattern compatibility
  }

  public static getInstance(): ReturnType<typeof createPathManager> {
    if (!PathManager.instance) {
      PathManager.instance = createPathManager();
    }
    return PathManager.instance;
  }
}
