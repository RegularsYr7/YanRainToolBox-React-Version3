/**
 * IPC Handlers - 应用管理模块
 *
 * 处理所有应用管理相关的 IPC 请求
 */

import { ipcMain } from "electron";
import { createApplicationManagement } from "../composables/useApplicationManagement";
import type {
  IAppInfo,
  IInstallConfig,
  IUninstallConfig,
} from "../composables/useApplicationManagement";

export function setupApplicationHandlers() {
  const appManagement = createApplicationManagement();

  // 获取所有应用 (别名 app:get-applications)
  ipcMain.handle(
    "app:get-applications",
    async (_event, deviceSerialNumber?: string): Promise<IAppInfo[]> => {
      return await appManagement.getAllApplications(deviceSerialNumber);
    }
  );

  // 获取所有应用
  ipcMain.handle(
    "app:get-all",
    async (_event, deviceSerialNumber?: string): Promise<IAppInfo[]> => {
      return await appManagement.getAllApplications(deviceSerialNumber);
    }
  );

  // 安装应用
  ipcMain.handle(
    "app:install",
    async (
      _event,
      config: IInstallConfig,
      deviceSerialNumber?: string
    ): Promise<void> => {
      return await appManagement.installApplication(config, deviceSerialNumber);
    }
  );

  // 卸载应用
  ipcMain.handle(
    "app:uninstall",
    async (
      _event,
      config: IUninstallConfig,
      deviceSerialNumber?: string
    ): Promise<void> => {
      return await appManagement.uninstallApplication(
        config,
        deviceSerialNumber
      );
    }
  );

  // 启动应用
  ipcMain.handle(
    "app:start",
    async (
      _event,
      packageName: string,
      deviceSerialNumber?: string
    ): Promise<void> => {
      return await appManagement.startApplication(
        packageName,
        deviceSerialNumber
      );
    }
  );

  // 强制停止应用
  ipcMain.handle(
    "app:force-stop",
    async (
      _event,
      packageName: string,
      deviceSerialNumber?: string
    ): Promise<void> => {
      return await appManagement.forceStopApplication(
        packageName,
        deviceSerialNumber
      );
    }
  );

  // 冻结应用
  ipcMain.handle(
    "app:freeze",
    async (
      _event,
      packageName: string,
      deviceSerialNumber?: string
    ): Promise<void> => {
      return await appManagement.freezeApplication(
        packageName,
        deviceSerialNumber
      );
    }
  );

  // 解冻应用
  ipcMain.handle(
    "app:unfreeze",
    async (
      _event,
      packageName: string,
      deviceSerialNumber?: string
    ): Promise<void> => {
      return await appManagement.unfreezeApplication(
        packageName,
        deviceSerialNumber
      );
    }
  );

  // 提取 APK
  ipcMain.handle(
    "app:extract-apk",
    async (
      _event,
      packageName: string,
      outputPath: string,
      deviceSerialNumber?: string
    ): Promise<void> => {
      return await appManagement.extractApkToPath(
        packageName,
        outputPath,
        deviceSerialNumber
      );
    }
  );

  // 启用应用
  ipcMain.handle(
    "app:enable",
    async (
      _event,
      packageName: string,
      deviceSerialNumber?: string
    ): Promise<void> => {
      return await appManagement.enableApplication(
        packageName,
        deviceSerialNumber
      );
    }
  );

  // 禁用应用
  ipcMain.handle(
    "app:disable",
    async (
      _event,
      packageName: string,
      deviceSerialNumber?: string
    ): Promise<void> => {
      return await appManagement.disableApplication(
        packageName,
        deviceSerialNumber
      );
    }
  );

  // 清理应用数据
  ipcMain.handle(
    "app:clear-data",
    async (
      _event,
      packageName: string,
      deviceSerialNumber?: string
    ): Promise<void> => {
      return await appManagement.clearApplicationData(
        packageName,
        deviceSerialNumber
      );
    }
  );
}
