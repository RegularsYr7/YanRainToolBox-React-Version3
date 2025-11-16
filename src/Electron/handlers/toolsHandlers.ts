/**
 * 工具路径 IPC Handlers
 *
 * 处理工具路径相关的 IPC 请求
 */

import { ipcMain } from "electron";
import {
  pathManager,
  getAdbPath,
  getFastbootPath,
  getMagiskBootPath,
  getPlatformToolsDirPath,
} from "../utils/paths";
import { fileExists } from "../utils/file";

/**
 * 设置工具相关的 IPC handlers
 */
export function setupToolsHandlers() {
  // 获取当前平台
  ipcMain.handle("tools:get-platform", async () => {
    return pathManager.getCurrentPlatform();
  });

  // 获取 ADB 路径
  ipcMain.handle("tools:get-adb-path", async () => {
    return getAdbPath();
  });

  // 获取 Fastboot 路径
  ipcMain.handle("tools:get-fastboot-path", async () => {
    return getFastbootPath();
  });

  // 获取 Magiskboot 路径
  ipcMain.handle("tools:get-magiskboot-path", async () => {
    return getMagiskBootPath();
  });

  // 获取所有平台工具路径
  ipcMain.handle("tools:get-all-platform-paths", async () => {
    return {
      adb: getAdbPath(),
      fastboot: getFastbootPath(),
      magiskboot: getMagiskBootPath(),
      platformToolsDir: getPlatformToolsDirPath(),
    };
  });

  // 检查工具是否存在
  ipcMain.handle("tools:check-tools-exist", async () => {
    const [adbExists, fastbootExists, magiskbootExists] = await Promise.all([
      fileExists(getAdbPath()),
      fileExists(getFastbootPath()),
      fileExists(getMagiskBootPath()),
    ]);

    return {
      adb: adbExists,
      fastboot: fastbootExists,
      magiskboot: magiskbootExists,
    };
  });

  // 获取平台工具目录
  ipcMain.handle("tools:get-platform-tools-dir", async () => {
    return getPlatformToolsDirPath();
  });
}
