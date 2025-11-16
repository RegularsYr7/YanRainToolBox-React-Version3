/**
 * Fastboot 分区操作 IPC Handlers
 *
 * 注册 Electron IPC 通道，处理来自渲染进程的 Fastboot 操作请求
 */

import { ipcMain } from "electron";
import { createFastbootPartition } from "../composables/useFastbootPartition";

/**
 * 注册 Fastboot 分区操作相关的 IPC handlers
 */
export function setupFastbootPartitionHandlers() {
  const fastboot = createFastbootPartition();

  /**
   * 刷写分区镜像
   *
   * @channel fastboot:flash
   * @param serial - 设备序列号
   * @param partition - 分区名称
   * @param imagePath - 镜像文件路径
   */
  ipcMain.handle(
    "fastboot:flash",
    async (_event, serial: string, partition: string, imagePath: string) => {
      return fastboot.flash(serial, partition, imagePath);
    }
  );

  /**
   * 擦除分区数据
   *
   * @channel fastboot:erase
   * @param serial - 设备序列号
   * @param partition - 分区名称
   */
  ipcMain.handle(
    "fastboot:erase",
    async (_event, serial: string, partition: string) => {
      return fastboot.erase(serial, partition);
    }
  );

  /**
   * 查询设备变量
   *
   * @channel fastboot:getvar
   * @param serial - 设备序列号
   * @param name - 变量名称
   */
  ipcMain.handle(
    "fastboot:getvar",
    async (_event, serial: string, name: string) => {
      return fastboot.getvar(serial, name);
    }
  );
}
