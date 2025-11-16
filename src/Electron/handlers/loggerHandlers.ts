/**
 * 日志系统 IPC Handlers
 *
 * 处理主进程与渲染进程之间的日志记录相关通信
 */

import { ipcMain } from "electron";
import { Logger } from "../utils/logger";

/**
 * 设置日志系统 IPC handlers
 */
export function setupLoggerHandlers() {
  Logger.info("[LoggerHandlers] 注册日志系统 IPC handlers");

  // 记录信息日志
  ipcMain.on("logger:info", (_event, message: string, data?: object) => {
    Logger.info(`[Renderer] ${message}`, data || "");
  });

  // 记录错误日志
  ipcMain.on("logger:error", (_event, message: string, data?: object) => {
    Logger.error(`[Renderer] ${message}`, data || "");
  });

  Logger.info("[LoggerHandlers] 日志系统 IPC handlers 注册完成");
}
