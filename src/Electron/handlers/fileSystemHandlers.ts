/**
 * IPC Handlers - 文件系统模块
 *
 * 处理所有文件系统相关的 IPC 请求（文件/目录选择等）
 */

import { ipcMain, dialog } from "electron";
import { Logger } from "../utils/logger";

export function setupFileSystemHandlers() {
  // 选择文件
  ipcMain.handle(
    "fs:select-file",
    async (_event, filters?: Electron.FileFilter[]): Promise<string | null> => {
      try {
        const result = await dialog.showOpenDialog({
          properties: ["openFile"],
          filters: filters || [{ name: "所有文件", extensions: ["*"] }],
        });
        return result.canceled ? null : result.filePaths[0];
      } catch (error) {
        Logger.error("[FileSystemHandlers] 选择文件失败:", error);
        return null;
      }
    }
  );

  // 选择目录
  ipcMain.handle("fs:select-directory", async (): Promise<string | null> => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory"],
      });
      return result.canceled ? null : result.filePaths[0];
    } catch (error) {
      Logger.error("[FileSystemHandlers] 选择目录失败:", error);
      return null;
    }
  });

  // 选择多个文件
  ipcMain.handle(
    "fs:select-files",
    async (
      _event,
      filters?: Electron.FileFilter[]
    ): Promise<string[] | null> => {
      try {
        const result = await dialog.showOpenDialog({
          properties: ["openFile", "multiSelections"],
          filters: filters || [{ name: "所有文件", extensions: ["*"] }],
        });
        return result.canceled ? null : result.filePaths;
      } catch (error) {
        Logger.error("[FileSystemHandlers] 选择多个文件失败:", error);
        return null;
      }
    }
  );

  // 保存文件对话框
  ipcMain.handle(
    "fs:save-file",
    async (
      _event,
      defaultPath?: string,
      filters?: Electron.FileFilter[]
    ): Promise<string | null> => {
      try {
        const result = await dialog.showSaveDialog({
          defaultPath,
          filters: filters || [{ name: "所有文件", extensions: ["*"] }],
        });
        return result.canceled ? null : result.filePath || null;
      } catch (error) {
        Logger.error("[FileSystemHandlers] 保存文件对话框失败:", error);
        return null;
      }
    }
  );
}
