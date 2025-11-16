/**
 * 通知系统 IPC Handlers
 *
 * 处理主进程与渲染进程之间的系统通知相关通信
 */

import { ipcMain, Notification } from "electron";
import { Logger } from "../utils/logger";

/**
 * 设置通知系统 IPC handlers
 */
export function setupNotificationHandlers() {
  Logger.info("[NotificationHandlers] 注册通知系统 IPC handlers");

  // 显示通知
  ipcMain.on(
    "notification:show",
    (_event, title: string, body: string, icon?: string) => {
      try {
        const notification = new Notification({
          title,
          body,
          icon,
        });
        notification.show();
        Logger.info(`[NotificationHandlers] 显示通知: ${title}`);
      } catch (error) {
        Logger.error("[NotificationHandlers] 显示通知失败:", error);
      }
    }
  );

  Logger.info("[NotificationHandlers] 通知系统 IPC handlers 注册完成");
}
