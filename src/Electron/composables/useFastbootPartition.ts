/**
 * Fastboot 分区操作 Composable (纯函数式)
 *
 * 提供 Fastboot 模式下的分区刷写、擦除、变量查询功能
 *
 * @功能特性
 * - flash: 刷写分区镜像
 * - erase: 擦除分区数据
 * - getvar: 查询设备变量
 */

import { PathManager } from "../utils/paths";
import { CommandExecutor } from "../utils/command";

export interface FastbootPartitionOptions {
  fastbootPath?: string;
}

export interface FastbootCommandResult {
  code: number;
  output: string;
}

/**
 * 创建 Fastboot 分区操作器
 *
 * @param options - 配置选项
 * @returns Fastboot 操作方法集合
 *
 * @example
 * ```ts
 * const fastboot = createFastbootPartition();
 * await fastboot.flash('ABC123', 'boot', '/path/to/boot.img');
 * ```
 */
export function createFastbootPartition(
  options: FastbootPartitionOptions = {}
) {
  // 获取 fastboot 可执行文件路径
  const getFastbootPath = (): string => {
    if (options.fastbootPath) {
      return options.fastbootPath;
    }
    const pm = PathManager.getInstance();
    return pm.getFastbootPath();
  };

  /**
   * 刷写分区镜像
   *
   * @param serial - 设备序列号
   * @param partition - 分区名称 (如: boot, system, vendor)
   * @param imagePath - 镜像文件路径
   * @returns 命令执行结果
   */
  async function flash(
    serial: string,
    partition: string,
    imagePath: string
  ): Promise<FastbootCommandResult> {
    const fastbootPath = getFastbootPath();
    const cmd = `"${fastbootPath}" -s ${serial} flash ${partition} "${imagePath}"`;
    return CommandExecutor.execute(cmd, 5 * 60 * 1000); // 5分钟超时
  }

  /**
   * 擦除分区数据
   *
   * @param serial - 设备序列号
   * @param partition - 分区名称
   * @returns 命令执行结果
   */
  async function erase(
    serial: string,
    partition: string
  ): Promise<FastbootCommandResult> {
    const fastbootPath = getFastbootPath();
    const cmd = `"${fastbootPath}" -s ${serial} erase ${partition}`;
    return CommandExecutor.execute(cmd, 2 * 60 * 1000); // 2分钟超时
  }

  /**
   * 查询设备变量
   *
   * @param serial - 设备序列号
   * @param name - 变量名称 (如: product, version-bootloader)
   * @returns 命令执行结果
   */
  async function getvar(
    serial: string,
    name: string
  ): Promise<FastbootCommandResult> {
    const fastbootPath = getFastbootPath();
    const cmd = `"${fastbootPath}" -s ${serial} getvar ${name}`;
    return CommandExecutor.execute(cmd, 30 * 1000); // 30秒超时
  }

  return {
    flash,
    erase,
    getvar,
  };
}
