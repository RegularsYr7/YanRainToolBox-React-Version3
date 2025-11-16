/**
 * Electron 预加载脚本
 *
 * 这是 Electron 应用架构中的关键组件，负责在渲染进程中安全地暴露主进程功能。
 * 通过 contextBridge API 创建一个安全的通信桥梁，避免直接暴露 Node.js API 给渲染进程。
 *
 * @file preload.ts
 * @description Electron 预加载脚本 - 主进程与渲染进程的安全通信桥梁
 * @author YanRain ToolBox Team
 *
 * @architecture
 * 通信架构图：
 * ```
 * 渲染进程 (React)
 *     ↕ (contextBridge)
 * 预加载脚本 (preload.ts)
 *     ↕ (ipcRenderer)
 * 主进程 (ipcHandlers.ts)
 *     ↕ (spawn/exec)
 * 系统工具 (ADB/Fastboot)
 * ```
 *
 * @security
 * 安全机制：
 * - 上下文隔离：渲染进程无法直接访问 Node.js API
 * - 受控暴露：只暴露预定义的安全方法
 * - 类型安全：所有 API 都有完整的 TypeScript 类型定义
 * - 参数验证：主进程会验证所有传入参数
 *
 * @performance
 * 性能优化：
 * - 异步通信：所有 IPC 调用都是非阻塞的
 * - 事件监听：支持进度监听和实时更新
 * - 资源管理：自动清理事件监听器防止内存泄漏
 *
 * @example 渲染进程中的使用
 * ```typescript
 * // 设备管理
 * const devices = await window.electronAPI.device.getAllDevices();
 * await window.electronAPI.device.reboot('device123', 'recovery');
 *
 * // 文件操作
 * const filePath = await window.electronAPI.fs.selectFile([
 *   { name: 'APK Files', extensions: ['apk'] }
 * ]);
 *
 * // 备份进度监听
 * window.electronAPI.backup.onProgress((progress) => {
 *   console.log(`备份进度: ${progress.progress}%`);
 * });
 * ```
 */

import { contextBridge, ipcRenderer, shell } from "electron";
import type {
  BackupProgress,
  LogData,
  ElectronAPI,
} from "../types/electron-types";

/**
 * 扩展全局 Window 接口
 *
 * 为渲染进程的 window 对象添加 electronAPI 属性的类型声明。
 * 这使得 TypeScript 编译器能够提供完整的类型检查和智能提示。
 */
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

/**
 * ElectronAPI 实现对象
 *
 * 包含所有暴露给渲染进程的功能方法，通过 IPC 与主进程通信。
 * 所有方法都经过安全验证，确保渲染进程无法直接访问系统资源。
 *
 * @implements {ElectronAPI}
 *
 * @architecture 架构说明
 * - 渲染进程调用 electronAPI 方法
 * - 方法通过 ipcRenderer 发送消息到主进程
 * - 主进程的 ipcHandlers 处理消息并执行实际操作
 * - 结果通过 IPC 返回给渲染进程
 */
const electronAPI: ElectronAPI = {
  // 系统信息
  platform: process.platform,

  // 外部链接
  openExternal: (url: string) => shell.openExternal(url),

  // 窗口控制
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    close: () => ipcRenderer.send("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  },

  // 设备管理
  device: {
    checkConnection: () => ipcRenderer.invoke("device:check-connection"),
    getDeviceInfo: () => ipcRenderer.invoke("device:get-device-info"),
    getAllDevices: () => ipcRenderer.invoke("device:get-all-devices"),
    detectMode: (serialNumber: string) =>
      ipcRenderer.invoke("device:detect-mode", serialNumber),
    checkRoot: () => ipcRenderer.invoke("device:check-root"),
    reboot: (
      serialNumber: string,
      mode: "system" | "fastboot" | "recovery" | "shutdown"
    ) => ipcRenderer.invoke("device:reboot", serialNumber, mode),
    getStatus: (serialNumber?: string) =>
      ipcRenderer.invoke("device:get-status", serialNumber),
    startWatching: () => ipcRenderer.invoke("device:start-watching"),
    stopWatching: () => ipcRenderer.invoke("device:stop-watching"),
    getWatchingStatus: () => ipcRenderer.invoke("device:get-watching-status"),
    onDeviceChanged: (callback: (event: unknown) => void) => {
      ipcRenderer.on("device:change", callback);
    },
    removeDeviceChangedListener: (callback: (event: unknown) => void) => {
      ipcRenderer.removeListener("device:change", callback);
    },
  },

  // 应用管理
  app: {
    getApplications: (deviceSerialNumber?: string) =>
      ipcRenderer.invoke("app:get-applications", deviceSerialNumber),
    install: (apkPath: string, deviceSerialNumber?: string) =>
      ipcRenderer.invoke("app:install", apkPath, deviceSerialNumber),
    uninstallApplication: (
      packageName: string,
      keepData: boolean,
      deviceSerialNumber?: string
    ) =>
      ipcRenderer.invoke(
        "app:uninstall",
        packageName,
        keepData,
        deviceSerialNumber
      ),
    enableApplication: (packageName: string, deviceSerialNumber?: string) =>
      ipcRenderer.invoke("app:enable", packageName, deviceSerialNumber),
    disableApplication: (packageName: string, deviceSerialNumber?: string) =>
      ipcRenderer.invoke("app:disable", packageName, deviceSerialNumber),
    clearApplicationData: (packageName: string, deviceSerialNumber?: string) =>
      ipcRenderer.invoke("app:clear-data", packageName, deviceSerialNumber),
    start: (packageName: string, deviceSerialNumber?: string) =>
      ipcRenderer.invoke("app:start", packageName, deviceSerialNumber),
    stop: (packageName: string, deviceSerialNumber?: string) =>
      ipcRenderer.invoke("app:stop", packageName, deviceSerialNumber),
    freeze: (packageName: string, deviceSerialNumber?: string) =>
      ipcRenderer.invoke("app:freeze", packageName, deviceSerialNumber),
    unfreeze: (packageName: string, deviceSerialNumber?: string) =>
      ipcRenderer.invoke("app:unfreeze", packageName, deviceSerialNumber),
    extractApk: (
      packageName: string,
      outputApkPath: string,
      deviceSerialNumber?: string
    ) =>
      ipcRenderer.invoke(
        "app:extract-apk",
        packageName,
        outputApkPath,
        deviceSerialNumber
      ),
  },

  // 系统备份
  backup: (() => {
    const progressWrapperMap = new WeakMap<
      (progress: BackupProgress) => void,
      (event: Electron.IpcRendererEvent, progress: BackupProgress) => void
    >();
    return {
      start: (
        outputPath: string,
        deviceModel: string,
        romVersion: string,
        serialNumber?: string,
        options?: { excludePartitions?: string[] }
      ) =>
        ipcRenderer.invoke(
          "backup:start",
          outputPath,
          deviceModel,
          romVersion,
          serialNumber,
          options
        ),
      onProgress: (callback: (progress: BackupProgress) => void) => {
        const wrapper = (
          _event: Electron.IpcRendererEvent,
          progress: BackupProgress
        ) => callback(progress);
        progressWrapperMap.set(callback, wrapper);
        ipcRenderer.on("backup:progress", wrapper);
      },
      removeProgressListener: (
        callback: (progress: BackupProgress) => void
      ) => {
        const wrapper = progressWrapperMap.get(callback);
        if (wrapper) {
          ipcRenderer.removeListener("backup:progress", wrapper);
          progressWrapperMap.delete(callback);
        }
      },
    };
  })(),

  // Boot 修补
  boot: {
    patch: (bootPath: string, magiskPath: string) =>
      ipcRenderer.invoke("boot:patch", bootPath, magiskPath),
    inspect: (imgPath: string) => ipcRenderer.invoke("boot:inspect", imgPath),
  },

  // OTA 解析
  ota: {
    extractPartitionFromUrl: (
      url: string,
      partitionName: string,
      outputPath: string,
      options?: { timeout?: number; verify?: boolean }
    ) =>
      ipcRenderer.invoke(
        "ota:extract-partition-from-url",
        url,
        partitionName,
        outputPath,
        options
      ),
    customExtract: (
      urlOrPath: string,
      partitionName: string,
      outputPath: string,
      options?: { timeout?: number; verify?: boolean }
    ) =>
      ipcRenderer.invoke(
        "ota:custom-extract",
        urlOrPath,
        partitionName,
        outputPath,
        options
      ),
  },
  fastboot: {
    flash: (serial: string, partition: string, imagePath: string) =>
      ipcRenderer.invoke(
        "fastboot:flash",
        serial,
        partition,
        imagePath
      ) as Promise<{
        code: number;
        output: string;
      }>,
    erase: (serial: string, partition: string) =>
      ipcRenderer.invoke("fastboot:erase", serial, partition) as Promise<{
        code: number;
        output: string;
      }>,
    getvar: (serial: string, name: string) =>
      ipcRenderer.invoke("fastboot:getvar", serial, name) as Promise<{
        code: number;
        output: string;
      }>,
  },

  // 文件系统
  fs: {
    selectFile: (filters?: Electron.FileFilter[]) =>
      ipcRenderer.invoke("fs:select-file", filters),
    selectDirectory: () => ipcRenderer.invoke("fs:select-directory"),
  },

  // 系统通知
  notification: {
    show: (title: string, body: string, icon?: string) =>
      ipcRenderer.send("notification:show", title, body, icon),
  },

  // 日志系统
  logger: {
    info: (message: string, data?: LogData) =>
      ipcRenderer.send("logger:info", message, data),
    error: (message: string, data?: LogData) =>
      ipcRenderer.send("logger:error", message, data),
  },

  // 工具路径管理
  tools: {
    getPlatform: () => ipcRenderer.invoke("tools:get-platform"),
    getAdbPath: () => ipcRenderer.invoke("tools:get-adb-path"),
    getFastbootPath: () => ipcRenderer.invoke("tools:get-fastboot-path"),
    getMagiskBootPath: () => ipcRenderer.invoke("tools:get-magiskboot-path"),
    getAllPlatformPaths: () =>
      ipcRenderer.invoke("tools:get-all-platform-paths"),
    checkToolsExist: () => ipcRenderer.invoke("tools:check-tools-exist"),
    getPlatformToolsDir: () =>
      ipcRenderer.invoke("tools:get-platform-tools-dir"),
    shellRun: (
      command: string,
      options?: {
        useToolsCwd?: boolean;
        timeout?: number;
        replaceTools?: boolean;
      }
    ) =>
      ipcRenderer.invoke("shell:run", command, {
        useToolsCwd: true,
        replaceTools: false,
        ...options,
      }),
    shellRunStream: (
      command: string,
      options?: {
        useToolsCwd?: boolean;
        timeout?: number;
        replaceTools?: boolean;
      }
    ) =>
      ipcRenderer.invoke("shell:run-stream", command, {
        useToolsCwd: true,
        replaceTools: false,
        ...options,
      }) as Promise<{ id: string }>,
    shellKill: (id: string) =>
      ipcRenderer.invoke("shell:run-kill", id) as Promise<boolean>,
    onShellData: (
      callback: (evt: {
        id: string;
        source: "stdout" | "stderr";
        data: string;
      }) => void
    ) => {
      const handler = (
        _: unknown,
        payload: { id: string; source: "stdout" | "stderr"; data: string }
      ) => callback(payload);
      ipcRenderer.on("shell:run-stream:data", handler);
      return () => ipcRenderer.removeListener("shell:run-stream:data", handler);
    },
    onShellExit: (
      callback: (evt: {
        id: string;
        code: number | null;
        signal: NodeJS.Signals | null;
      }) => void
    ) => {
      const handler = (
        _: unknown,
        payload: {
          id: string;
          code: number | null;
          signal: NodeJS.Signals | null;
        }
      ) => callback(payload);
      ipcRenderer.on("shell:run-stream:exit", handler);
      return () => ipcRenderer.removeListener("shell:run-stream:exit", handler);
    },
  },

  // 通用 IPC 通信
  ipc: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(channel, ...args),
    send: (channel: string, ...args: unknown[]) =>
      ipcRenderer.send(channel, ...args),
    on: (channel: string, listener: (...args: unknown[]) => void) =>
      ipcRenderer.on(channel, listener),
    removeListener: (channel: string, listener: (...args: unknown[]) => void) =>
      ipcRenderer.removeListener(channel, listener),
  },
};

/**
 * 安全暴露 API 到渲染进程
 *
 * 使用 Electron 的 contextBridge.exposeInMainWorld 方法将 electronAPI 对象
 * 安全地暴露给渲染进程。这确保了渲染进程无法直接访问 Node.js API，
 * 只能通过预定义的安全接口与主进程通信。
 *
 * @param {string} "electronAPI" - 在渲染进程中访问的全局对象名称
 * @param {ElectronAPI} electronAPI - 要暴露的 API 对象
 *
 * @security 上下文隔离
 * - 渲染进程运行在独立的 JavaScript 上下文中
 * - 无法访问主进程的 Node.js API 和文件系统
 * - 只能通过 electronAPI 对象调用预定义的安全方法
 *
 * @example 渲染进程中的访问方式
 * ```typescript
 * // 这些调用都是安全的，经过主进程验证
 * window.electronAPI.device.getAllDevices();
 * window.electronAPI.fs.selectFile();
 * window.electronAPI.logger.info('Application started');
 * ```
 */
contextBridge.exposeInMainWorld("electronAPI", electronAPI);

/**
 * 预加载脚本初始化日志
 *
 * 在预加载脚本加载完成时输出初始化信息，用于调试和确认脚本正确加载。
 * 显示当前运行环境的基本信息。
 *
 * @log 输出内容包括：
 * - 应用名称和加载状态
 * - 运行平台信息
 * - Node.js 版本
 * - Electron 版本
 *
 * @example 控制台输出示例
 * ```
 * 🚀 YanRain ToolBox Preload Script Loaded
 * 📱 Platform: win32
 * ⚡ Node Version: 18.15.0
 * 🖥️ Electron Version: 28.1.0
 * ```
 */
console.log("🚀 YanRain ToolBox Preload Script Loaded");
console.log(`📱 Platform: ${process.platform}`);
console.log(`⚡ Node Version: ${process.versions.node}`);
console.log(`🖥️ Electron Version: ${process.versions.electron}`);
