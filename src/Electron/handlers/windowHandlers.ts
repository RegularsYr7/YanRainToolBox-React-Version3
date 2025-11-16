/**
 * 窗口控制 IPC Handlers
 *
 * 处理主进程与渲染进程之间的窗口控制相关通信
 */

import { ipcMain, BrowserWindow } from "electron";
import { Logger } from "../utils/logger";
import { execute } from "../utils/command";

/**
 * 设置窗口控制 IPC handlers
 */
export function setupWindowHandlers() {
  Logger.info("[WindowHandlers] 注册窗口控制 IPC handlers");

  // 最小化窗口
  ipcMain.on("window:minimize", () => {
    const window = BrowserWindow.getFocusedWindow();
    if (window) {
      window.minimize();
      Logger.info("[WindowHandlers] 窗口已最小化");
    }
  });

  // 关闭窗口
  ipcMain.on("window:close", async () => {
    const window = BrowserWindow.getFocusedWindow();
    if (window) {
      try {
        // 关闭所有 ADB/Fastboot/Magiskboot 进程
        const [adbResult, fastbootResult, magiskbootResult] = await Promise.all(
          [
            execute(`taskkill /F /IM adb.exe`),
            execute(`taskkill /F /IM fastboot.exe`),
            execute(`taskkill /F /IM magiskboot.exe`),
          ]
        );

        if (adbResult.code !== 0) {
          Logger.warn("[WindowHandlers] ADB 进程关闭失败，可能未运行");
        } else {
          Logger.info("[WindowHandlers] ADB 进程已成功关闭");
        }

        if (fastbootResult.code !== 0) {
          Logger.warn("[WindowHandlers] Fastboot 进程关闭失败，可能未运行");
        } else {
          Logger.info("[WindowHandlers] Fastboot 进程已成功关闭");
        }

        if (magiskbootResult.code !== 0) {
          Logger.warn("[WindowHandlers] Magiskboot 进程关闭失败，可能未运行");
        } else {
          Logger.info("[WindowHandlers] Magiskboot 进程已成功关闭");
        }

        window.close();
      } catch (error) {
        Logger.error("[WindowHandlers] 关闭进程失败:", error);
        window.close();
      }
    }
  });

  // 检查窗口是否最大化
  ipcMain.handle("window:is-maximized", () => {
    const window = BrowserWindow.getFocusedWindow();
    const isMaximized = window ? window.isMaximized() : false;
    Logger.info(`[WindowHandlers] 窗口最大化状态: ${isMaximized}`);
    return isMaximized;
  });

  Logger.info("[WindowHandlers] 窗口控制 IPC handlers 注册完成");
}
