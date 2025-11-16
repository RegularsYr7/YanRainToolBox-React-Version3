/**
 * 备份镜像 IPC Handlers
 *
 * 处理主进程与渲染进程之间的备份镜像相关通信
 */

import { ipcMain, BrowserWindow } from "electron";
import {
  createBackupImage,
  type IBackupConfig,
} from "../composables/useBackupImage";
import type { BackupProgress } from "../../types/electron-types";
import { Logger } from "../utils/logger";

/**
 * 设置备份镜像 IPC handlers
 */
export function setupBackupHandlers() {
  Logger.info("[BackupHandlers] 注册备份镜像 IPC handlers");

  // 执行备份
  ipcMain.handle("backup:execute", async (event, config: IBackupConfig) => {
    try {
      Logger.info("[BackupHandlers] 开始执行备份", config);

      // 进度回调函数
      const onProgress = (progress: BackupProgress) => {
        Logger.info("[BackupHandlers] 备份进度:", progress);

        // 向触发请求的窗口发送进度更新
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window) {
          window.webContents.send("backup:progress", progress);
        }
      };

      // 创建备份实例并执行
      const backup = createBackupImage(config, onProgress);
      await backup.executeBackup();

      return {
        success: true,
        message: "备份完成",
      };
    } catch (error) {
      Logger.error("[BackupHandlers] 备份失败:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "备份失败",
      };
    }
  });

  Logger.info("[BackupHandlers] 备份镜像 IPC handlers 注册完成");
}
