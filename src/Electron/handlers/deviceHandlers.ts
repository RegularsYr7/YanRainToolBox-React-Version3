/**
 * 设备监听 IPC Handlers
 *
 * 处理主进程与渲染进程之间的设备监听相关通信
 */

import { ipcMain, BrowserWindow } from "electron";
import {
  createDeviceWatcher,
  type DeviceEvent,
} from "../composables/useDeviceWatcher";
import { Logger } from "../utils/logger";
import { execute } from "../utils/command";
import { getAdbPath } from "../utils/paths";

// 设备信息接口
export interface DeviceInfo {
  model: string;
  brand: string;
  androidVersion: string;
  serialNumber: string;
  isRooted: boolean;
  isBootloaderUnlocked: boolean;
  batteryLevel: number;
  memoryUsage: { used: number; total: number };
  storageUsage: { used: number; total: number };
  status: "normal" | "recovery" | "fastboot" | "sideload" | "unauthorized";
}

let deviceWatcher: ReturnType<typeof createDeviceWatcher> | null = null;

/**
 * 设置设备监听 IPC handlers
 */
export function setupDeviceHandlers() {
  Logger.info("[DeviceHandlers] 注册设备监听 IPC handlers");

  // 检查设备连接
  ipcMain.handle("device:check-connection", async () => {
    try {
      const result = await execute(`"${getAdbPath()}" devices`);
      return (
        result.output.includes("device") && !result.output.includes("offline")
      );
    } catch (error) {
      Logger.error("[DeviceHandlers] 检查设备连接失败:", error);
      return false;
    }
  });

  // 获取监听状态（别名 get-watching-status）
  ipcMain.handle("device:get-watching-status", async () => {
    try {
      const isWatching = deviceWatcher?.getWatchingStatus() || false;
      return {
        success: true,
        data: { isWatching },
      };
    } catch (error) {
      Logger.error("[DeviceHandlers] 获取监听状态失败:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "获取监听状态失败",
      };
    }
  });

  // 获取设备信息
  ipcMain.handle("device:get-device-info", async (): Promise<DeviceInfo> => {
    try {
      const adbPath = getAdbPath();
      const deviceCheck = await execute(`"${adbPath}" devices`);

      if (
        !deviceCheck.output.includes("device") ||
        deviceCheck.output.includes("offline")
      ) {
        throw new Error("没有检测到连接的设备");
      }

      const deviceLines = deviceCheck.output
        .split("\n")
        .filter(
          (line) => line.includes("\tdevice") && !line.includes("offline")
        )
        .map((line) => line.split("\t")[0].trim())
        .filter((serial) => serial && serial !== "List of devices attached");

      if (deviceLines.length === 0) {
        throw new Error("没有找到可用的设备");
      }

      const serialNumber = deviceLines[0];
      const [model, brand, androidVersion] = await Promise.all([
        execute(
          `"${adbPath}" -s ${serialNumber} shell getprop ro.product.model`
        ),
        execute(
          `"${adbPath}" -s ${serialNumber} shell getprop ro.product.brand`
        ),
        execute(
          `"${adbPath}" -s ${serialNumber} shell getprop ro.build.version.release`
        ),
      ]);

      // 检查 Root 状态
      let isRooted = false;
      try {
        const rootCheck = await execute(
          `"${adbPath}" -s ${serialNumber} shell su -c "id"`
        );
        isRooted = rootCheck.code === 0 && rootCheck.output.includes("uid=0");
      } catch {
        isRooted = false;
      }

      const deviceInfo: DeviceInfo = {
        model: model.output.trim(),
        brand: brand.output.trim(),
        androidVersion: androidVersion.output.trim(),
        serialNumber,
        isRooted,
        isBootloaderUnlocked: false,
        batteryLevel: 0,
        memoryUsage: { used: 0, total: 0 },
        storageUsage: { used: 0, total: 0 },
        status: "normal",
      };

      return deviceInfo;
    } catch (error) {
      Logger.error("[DeviceHandlers] 获取设备信息失败:", error);
      throw error;
    }
  });

  // 获取所有连接设备的信息
  ipcMain.handle("device:get-all-devices", async (): Promise<DeviceInfo[]> => {
    try {
      const adbPath = getAdbPath();
      const deviceCheck = await execute(`"${adbPath}" devices`);

      Logger.info(`ADB命令输出:`, {
        code: deviceCheck.code,
        output: deviceCheck.output,
      });

      // 检查是否有真正的设备连接
      const hasRealDevice =
        deviceCheck.output.includes("\tdevice") &&
        !deviceCheck.output.includes("offline");

      if (!hasRealDevice) {
        Logger.info("未找到连接的设备");
        return [];
      }

      // 解析设备列表
      const deviceLines = deviceCheck.output
        .split("\n")
        .filter(
          (line) =>
            line.includes("\tdevice") &&
            !line.includes("offline") &&
            !line.includes("unauthorized")
        )
        .map((line) => line.split("\t")[0].trim())
        .filter((serial) => serial && serial !== "List of devices attached");

      Logger.info(`找到 ${deviceLines.length} 个设备:`, deviceLines);

      if (deviceLines.length === 0) {
        return [];
      }

      // 获取每个设备的详细信息
      const devices: (DeviceInfo | null)[] = await Promise.all(
        deviceLines.map(async (serialNumber): Promise<DeviceInfo | null> => {
          try {
            const [model, brand, androidVersion] = await Promise.all([
              execute(
                `"${adbPath}" -s ${serialNumber} shell getprop ro.product.model`
              ),
              execute(
                `"${adbPath}" -s ${serialNumber} shell getprop ro.product.brand`
              ),
              execute(
                `"${adbPath}" -s ${serialNumber} shell getprop ro.build.version.release`
              ),
            ]);

            // 检查 Root 状态
            let isRooted = false;
            try {
              const rootCheck = await execute(
                `"${adbPath}" -s ${serialNumber} shell su -c "id"`
              );
              isRooted =
                rootCheck.code === 0 && rootCheck.output.includes("uid=0");
            } catch {
              isRooted = false;
            }

            const deviceInfo: DeviceInfo = {
              model: model.output.trim(),
              brand: brand.output.trim(),
              androidVersion: androidVersion.output.trim(),
              serialNumber,
              isRooted,
              isBootloaderUnlocked: false,
              batteryLevel: 0,
              memoryUsage: { used: 0, total: 0 },
              storageUsage: { used: 0, total: 0 },
              status: "normal",
            };

            return deviceInfo;
          } catch (error) {
            Logger.error(`获取设备 ${serialNumber} 信息失败:`, error);
            return null;
          }
        })
      );

      // 过滤掉获取失败的设备
      const validDevices = devices.filter(
        (device): device is DeviceInfo => device !== null
      );
      Logger.info(`成功获取 ${validDevices.length} 个设备信息`);

      return validDevices;
    } catch (error) {
      Logger.error("[DeviceHandlers] 获取所有设备信息失败:", error);
      return [];
    }
  });

  // 启动设备监听
  ipcMain.handle("device:start-watching", async (_event, options?) => {
    try {
      Logger.info("[DeviceHandlers] 启动设备监听", options);

      if (!deviceWatcher) {
        deviceWatcher = createDeviceWatcher(options);

        // 监听设备变化事件并转发到渲染进程
        deviceWatcher.on("deviceChange", (event: unknown) => {
          const deviceEvent = event as DeviceEvent;
          Logger.info("[DeviceHandlers] 设备变化事件:", deviceEvent);

          // 向所有窗口广播设备变化事件
          BrowserWindow.getAllWindows().forEach((window) => {
            window.webContents.send("device:change", deviceEvent);
          });
        });

        // 监听监听器启动事件
        deviceWatcher.on("watcherStarted", () => {
          Logger.info("[DeviceHandlers] 监听器已启动");

          BrowserWindow.getAllWindows().forEach((window) => {
            window.webContents.send("device:watcher-started");
          });
        });

        // 监听监听器停止事件
        deviceWatcher.on("watcherStopped", () => {
          Logger.info("[DeviceHandlers] 监听器已停止");

          BrowserWindow.getAllWindows().forEach((window) => {
            window.webContents.send("device:watcher-stopped");
          });
        });
      }

      await deviceWatcher.startWatching();

      return {
        success: true,
        message: "设备监听已启动",
      };
    } catch (error) {
      Logger.error("[DeviceHandlers] 启动设备监听失败:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "启动设备监听失败",
      };
    }
  });

  // 停止设备监听
  ipcMain.handle("device:stop-watching", async () => {
    try {
      Logger.info("[DeviceHandlers] 停止设备监听");

      if (!deviceWatcher) {
        return {
          success: false,
          error: "设备监听未启动",
        };
      }

      deviceWatcher.stopWatching();

      return {
        success: true,
        message: "设备监听已停止",
      };
    } catch (error) {
      Logger.error("[DeviceHandlers] 停止设备监听失败:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "停止设备监听失败",
      };
    }
  });

  // 获取监听状态
  ipcMain.handle("device:get-status", async () => {
    try {
      const isWatching = deviceWatcher?.getWatchingStatus() || false;

      return {
        success: true,
        data: {
          isWatching,
        },
      };
    } catch (error) {
      Logger.error("[DeviceHandlers] 获取监听状态失败:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "获取监听状态失败",
      };
    }
  });

  // 销毁设备监听器
  ipcMain.handle("device:destroy", async () => {
    try {
      Logger.info("[DeviceHandlers] 销毁设备监听器");

      if (!deviceWatcher) {
        return {
          success: true,
          message: "设备监听器未初始化",
        };
      }

      deviceWatcher.destroy();
      deviceWatcher = null;

      return {
        success: true,
        message: "设备监听器已销毁",
      };
    } catch (error) {
      Logger.error("[DeviceHandlers] 销毁设备监听器失败:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "销毁设备监听器失败",
      };
    }
  });

  // 检测指定设备的连接模式（ADB或Fastboot）
  ipcMain.handle(
    "device:detect-mode",
    async (
      _event,
      serialNumber: string
    ): Promise<{
      mode: "adb" | "fastboot" | "none";
      serialNumber: string;
      message: string;
    }> => {
      try {
        const adbPath = getAdbPath();
        const fastbootPath = getAdbPath().replace("adb", "fastboot");

        // 检查该设备是否通过ADB连接
        const adbCheck = await execute(
          `"${adbPath}" -s ${serialNumber} get-state`
        );

        if (adbCheck.code === 0) {
          Logger.info(`[DeviceHandlers] 设备 ${serialNumber} 处于ADB模式`);
          return {
            mode: "adb",
            serialNumber: serialNumber,
            message: `设备 ${serialNumber} 处于ADB模式`,
          };
        }

        // 检查该设备是否通过Fastboot连接
        const fastbootCheck = await execute(
          `"${fastbootPath}" -s ${serialNumber} getvar product`
        );

        if (fastbootCheck.code === 0) {
          Logger.info(`[DeviceHandlers] 设备 ${serialNumber} 处于Fastboot模式`);
          return {
            mode: "fastboot",
            serialNumber: serialNumber,
            message: `设备 ${serialNumber} 处于Fastboot模式`,
          };
        }

        Logger.warn(
          `[DeviceHandlers] 设备 ${serialNumber} 无法通过ADB或Fastboot访问`
        );
        return {
          mode: "none",
          serialNumber: serialNumber,
          message: `设备 ${serialNumber} 无法访问或未连接`,
        };
      } catch (error) {
        Logger.error(
          `[DeviceHandlers] 检测设备模式失败 (${serialNumber}):`,
          error
        );
        return {
          mode: "none",
          serialNumber: serialNumber,
          message: error instanceof Error ? error.message : "检测设备模式失败",
        };
      }
    }
  );

  // 重启指定设备（支持ADB和Fastboot模式）
  ipcMain.handle(
    "device:reboot",
    async (
      _event,
      serialNumber: string,
      mode?: string
    ): Promise<{ success: boolean; message: string }> => {
      try {
        const adbPath = getAdbPath();
        const fastbootPath = adbPath.replace("adb", "fastboot");

        Logger.info(
          `[DeviceHandlers] 开始重启设备 ${serialNumber}，目标模式: ${
            mode || "system"
          }`
        );

        // 检测指定设备的当前状态
        Logger.info(
          `[DeviceHandlers] 检查设备 ${serialNumber} 的ADB连接状态...`
        );
        const adbCheck = await execute(
          `"${adbPath}" -s ${serialNumber} get-state`
        );
        Logger.info(
          `[DeviceHandlers] ADB检查结果: code=${
            adbCheck.code
          }, output="${adbCheck.output.trim()}"`
        );

        Logger.info(
          `[DeviceHandlers] 检查设备 ${serialNumber} 的Fastboot连接状态...`
        );
        const fastbootCheck = await execute(
          `"${fastbootPath}" -s ${serialNumber} getvar product`
        );
        Logger.info(
          `[DeviceHandlers] Fastboot检查结果: code=${
            fastbootCheck.code
          }, output="${fastbootCheck.output.trim()}"`
        );

        let deviceState = "unknown";
        if (adbCheck.code === 0) {
          deviceState = "adb";
          Logger.info(`[DeviceHandlers] 设备 ${serialNumber} 处于ADB模式`);
        } else if (fastbootCheck.code === 0) {
          deviceState = "fastboot";
          Logger.info(`[DeviceHandlers] 设备 ${serialNumber} 处于Fastboot模式`);
        } else {
          throw new Error(`设备 ${serialNumber} 无法通过ADB或Fastboot访问`);
        }

        let rebootCommand = "";
        let rebootType = "";

        // 根据设备状态和重启模式构建命令
        if (deviceState === "adb") {
          // ADB模式下的重启命令
          rebootCommand = `"${adbPath}" -s ${serialNumber} reboot`;
          rebootType = "正常重启";

          if (mode) {
            switch (mode) {
              case "bootloader":
              case "fastboot":
                rebootCommand += " bootloader";
                rebootType = "重启到Fastboot";
                break;
              case "recovery":
                rebootCommand += " recovery";
                rebootType = "重启到Recovery";
                break;
              case "shutdown":
                rebootCommand = `"${adbPath}" -s ${serialNumber} shell reboot -p`;
                rebootType = "关机";
                break;
              case "system":
              case "normal":
              default:
                // 正常重启，不添加参数
                rebootType = "正常重启";
                break;
            }
          }
        } else if (deviceState === "fastboot") {
          // Fastboot模式下的重启命令
          if (mode) {
            switch (mode) {
              case "bootloader":
              case "fastboot":
                rebootCommand = `"${fastbootPath}" -s ${serialNumber} reboot-bootloader`;
                rebootType = "重启到Fastboot";
                break;
              case "recovery":
                rebootCommand = `"${fastbootPath}" -s ${serialNumber} reboot recovery`;
                rebootType = "重启到Recovery";
                break;
              case "shutdown":
                // Fastboot模式下关机需要先重启到系统再关机
                rebootCommand = `"${fastbootPath}" -s ${serialNumber} reboot`;
                rebootType = "重启到系统（关机需要先进入系统）";
                break;
              case "system":
              case "normal":
              default:
                rebootCommand = `"${fastbootPath}" -s ${serialNumber} reboot`;
                rebootType = "重启到系统";
                break;
            }
          } else {
            rebootCommand = `"${fastbootPath}" -s ${serialNumber} reboot`;
            rebootType = "重启到系统";
          }
        }

        Logger.info(`[DeviceHandlers] 执行重启命令: ${rebootCommand}`);
        const result = await execute(rebootCommand);
        Logger.info(
          `[DeviceHandlers] 重启命令执行结果: code=${
            result.code
          }, output="${result.output.trim()}"`
        );

        // 对于重启命令，我们需要特殊处理，因为设备重启会断开连接
        // 这可能导致命令返回非零退出码，但这是正常的
        if (result.code === 0) {
          Logger.info(
            `[DeviceHandlers] 设备 ${serialNumber} ${rebootType}命令执行成功 (${deviceState.toUpperCase()}模式)`
          );
          return {
            success: true,
            message: `${rebootType}命令已发送 (${deviceState.toUpperCase()}模式)`,
          };
        } else {
          // 对于重启命令，非零退出码通常是正常的（设备断开连接）
          // 检查是否是预期的错误
          const output = result.output.toLowerCase();
          if (
            output.includes("device not found") ||
            output.includes("no devices") ||
            output.includes("offline") ||
            output.includes("timeout") ||
            output.includes("killed") ||
            output.includes("command failed") ||
            result.output.trim() === ""
          ) {
            // 这些都是设备重启时的正常现象
            Logger.info(
              `[DeviceHandlers] 设备 ${serialNumber} ${rebootType}命令已发送，设备已断开连接 (${deviceState.toUpperCase()}模式)`
            );
            return {
              success: true,
              message: `${rebootType}命令已发送，设备正在重启 (${deviceState.toUpperCase()}模式)`,
            };
          } else {
            // 只有在明确的错误信息时才报告失败
            const errorMsg = result.output || `${rebootType}失败`;
            Logger.error(`[DeviceHandlers] 重启命令真正失败: ${errorMsg}`);
            return {
              success: false,
              message: `重启失败: ${errorMsg}`,
            };
          }
        }
      } catch (error) {
        Logger.error(`[DeviceHandlers] 设备 ${serialNumber} 重启失败:`, error);
        return {
          success: false,
          message: `重启失败: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    }
  );

  Logger.info("[DeviceHandlers] 设备监听 IPC handlers 注册完成");
}
