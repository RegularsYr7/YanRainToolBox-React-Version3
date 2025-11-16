/**
 * 设备监听 Composable (函数式重构版)
 *
 * 从 WindowsDeviceWatcherService 迁移而来
 * 100% 保留原有功能，使用函数式编程模式替代 class
 */

import { EventEmitter } from "events";
import { spawn, ChildProcess } from "child_process";
import { Logger } from "../utils/logger";

/**
 * 设备事件类型
 */
export interface DeviceEvent {
  type: "connected" | "disconnected";
  deviceId?: string;
  deviceName?: string;
  timestamp: number;
}

/**
 * 设备监听选项
 */
export interface DeviceWatcherOptions {
  /** 防抖延迟时间(毫秒) */
  debounceDelay?: number;
  /** 是否只监听Android设备 */
  androidOnly?: boolean;
  /** 是否启用详细日志 */
  verbose?: boolean;
}

/**
 * 创建设备监听 Composable
 *
 * @param options 监听选项
 * @returns 设备监听相关的函数集合和事件发射器
 */
export function createDeviceWatcher(options: DeviceWatcherOptions = {}) {
  const eventEmitter = new EventEmitter();

  // 私有状态（闭包）
  let isWatching = false;
  let wmiProcess: ChildProcess | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;
  const recentEvents = new Map<string, number>();

  const opts: Required<DeviceWatcherOptions> = {
    debounceDelay: options.debounceDelay || 500,
    androidOnly: options.androidOnly !== false,
    verbose: options.verbose || false,
  };

  /**
   * 日志输出
   */
  const log = (...args: unknown[]): void => {
    if (opts.verbose) {
      Logger.info("[设备监听]", ...args);
    }
  };

  log("设备监听服务已初始化", opts);

  /**
   * 解析WMI事件
   */
  const parseWMIEvent = (eventLine: string): void => {
    const parts = eventLine.split("|");
    if (parts.length < 3) {
      return;
    }

    const [eventType, deviceInfo, deviceName] = parts;
    let deviceEvent: DeviceEvent | null = null;

    switch (eventType) {
      case "USB_POLL_CONNECTED":
      case "USB_CONNECTED":
      case "DEVICE_CONNECTED":
        deviceEvent = {
          type: "connected",
          deviceId: deviceInfo || "unknown",
          deviceName: deviceName || deviceInfo || "Unknown Device",
          timestamp: Date.now(),
        };
        break;

      case "USB_POLL_DISCONNECTED":
      case "USB_DISCONNECTED":
      case "DEVICE_DISCONNECTED":
        deviceEvent = {
          type: "disconnected",
          deviceId: deviceInfo || "unknown",
          deviceName: deviceName || deviceInfo || "Unknown Device",
          timestamp: Date.now(),
        };
        break;

      case "WMI_WATCHER_STARTED":
        log("WMI监听器启动确认");
        return;

      case "DEVICE_COUNT_INIT":
        log(`初始设备数量: ${deviceInfo}`);
        return;

      case "POLLING_ERROR":
        log("轮询检查错误:", deviceInfo);
        return;

      default:
        if (opts.verbose) {
          log("未知事件类型:", eventType, "数据:", eventLine);
        }
        return;
    }

    if (deviceEvent) {
      log(`检测到设备事件: ${deviceEvent.type} - ${deviceEvent.deviceName}`);
      emitDeviceEvent(deviceEvent);
    }
  };

  /**
   * 发送设备事件（带防抖处理和去重）
   */
  const emitDeviceEvent = (deviceEvent: DeviceEvent): void => {
    const eventKey = `${deviceEvent.type}-${Date.now()}`;
    const recentEventsArray = Array.from(recentEvents.entries());

    // 清理超过30秒的旧事件记录
    const thirtySecondsAgo = Date.now() - 30000;
    for (const [key, timestamp] of recentEventsArray) {
      if (timestamp < thirtySecondsAgo) {
        recentEvents.delete(key);
      }
    }

    // 检查是否在短时间内有相同类型的事件
    const recentSameTypeEvents = recentEventsArray.filter(([key]) =>
      key.startsWith(deviceEvent.type)
    );

    // 如果5秒内已有相同类型事件，则跳过
    const fiveSecondsAgo = Date.now() - 5000;
    const hasRecentSameEvent = recentSameTypeEvents.some(
      ([, timestamp]) => timestamp > fiveSecondsAgo
    );

    if (hasRecentSameEvent) {
      log(`跳过重复事件: ${deviceEvent.type} - ${deviceEvent.deviceName}`);
      return;
    }

    // 记录当前事件
    recentEvents.set(eventKey, Date.now());

    // 清除之前的防抖定时器
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // 设置新的防抖定时器
    debounceTimer = setTimeout(() => {
      log(`触发设备事件: ${deviceEvent.type} - ${deviceEvent.deviceName}`);
      eventEmitter.emit("deviceChange", deviceEvent);
      debounceTimer = null;
    }, opts.debounceDelay);
  };

  /**
   * 处理WMI输出
   */
  const handleWMIOutput = (output: string): void => {
    const lines = output.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      try {
        parseWMIEvent(line.trim());
      } catch (error) {
        if (opts.verbose) {
          log("解析WMI事件失败:", error, "原始数据:", line);
        }
      }
    }
  };

  /**
   * 启动WMI监听器
   */
  const startWMIWatcher = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      const powershellScript = `
                Write-Output "WMI_WATCHER_STARTED||$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
                
                # 初始化设备列表
                $lastDeviceList = @()
                $checkInterval = 1
                
                # 获取当前USB设备列表的函数
                function Get-CurrentUSBDevices {
                    try {
                        return Get-WmiObject -Class Win32_PnPEntity | Where-Object { 
                            $_.DeviceID -like "USB*" -and $_.Present -eq $true -and 
                            ($_.Name -match "Android|ADB|realme|RMX|Samsung|Huawei|Xiaomi|OnePlus|OPPO|Vivo" -or
                             $_.DeviceID -match "VID_") 
                        } | Select-Object DeviceID, Name
                    } catch {
                        return @()
                    }
                }
                
                # 初始设备列表
                $lastDeviceList = Get-CurrentUSBDevices
                Write-Output "DEVICE_COUNT_INIT|$($lastDeviceList.Count)|Initial device count|$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
                
                # 定期检查设备变化
                try {
                    while ($true) {
                        Start-Sleep -Seconds $checkInterval
                        
                        $currentDevices = Get-CurrentUSBDevices
                        
                        # 检查新连接的设备
                        foreach ($device in $currentDevices) {
                            $found = $false
                            foreach ($lastDevice in $lastDeviceList) {
                                if ($lastDevice.DeviceID -eq $device.DeviceID) {
                                    $found = $true
                                    break
                                }
                            }
                            if (-not $found) {
                                Write-Output "USB_POLL_CONNECTED|$($device.DeviceID)|$($device.Name)|$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
                            }
                        }
                        
                        # 检查断开的设备
                        foreach ($lastDevice in $lastDeviceList) {
                            $found = $false
                            foreach ($device in $currentDevices) {
                                if ($device.DeviceID -eq $lastDevice.DeviceID) {
                                    $found = $true
                                    break
                                }
                            }
                            if (-not $found) {
                                Write-Output "USB_POLL_DISCONNECTED|$($lastDevice.DeviceID)|$($lastDevice.Name)|$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
                            }
                        }
                        
                        # 更新设备列表
                        $lastDeviceList = $currentDevices
                    }
                } catch {
                    Write-Output "POLLING_ERROR|$($_.Exception.Message)||$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
                }
            `;

      wmiProcess = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          powershellScript,
        ],
        {
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        }
      );

      wmiProcess.stdout?.on("data", (data: Buffer) => {
        const output = data.toString().trim();
        if (output) {
          log("WMI输出:", output);
          handleWMIOutput(output);
        }
      });

      wmiProcess.stderr?.on("data", (data: Buffer) => {
        const error = data.toString().trim();
        if (error && opts.verbose) {
          log("WMI错误:", error);
        }
      });

      wmiProcess.on("exit", (code) => {
        log(`WMI进程退出，代码: ${code}`);
        if (isWatching) {
          isWatching = false;
          eventEmitter.emit("watcherStopped");
        }
      });

      wmiProcess.on("error", (error) => {
        log("WMI进程错误:", error);
        reject(error);
      });

      setTimeout(() => {
        if (wmiProcess && !wmiProcess.killed) {
          resolve();
        } else {
          reject(new Error("WMI进程启动失败"));
        }
      }, 2000);
    });
  };

  /**
   * 开始监听设备变化
   */
  const startWatching = async (): Promise<void> => {
    if (isWatching) {
      log("设备监听已在运行中");
      return;
    }

    if (process.platform !== "win32") {
      throw new Error("WindowsDeviceWatcher 仅支持 Windows 系统");
    }

    try {
      log("开始启动设备监听...");
      await startWMIWatcher();
      isWatching = true;
      log("设备监听启动成功");
      eventEmitter.emit("watcherStarted");
    } catch (error) {
      log("启动设备监听失败:", error);
      throw error;
    }
  };

  /**
   * 停止监听设备变化
   */
  const stopWatching = (): void => {
    if (!isWatching) {
      log("设备监听未在运行");
      return;
    }

    log("正在停止设备监听...");

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    recentEvents.clear();

    if (wmiProcess) {
      wmiProcess.kill();
      wmiProcess = null;
    }

    isWatching = false;
    log("设备监听已停止");
    eventEmitter.emit("watcherStopped");
  };

  /**
   * 获取监听状态
   */
  const getWatchingStatus = (): boolean => {
    return isWatching;
  };

  /**
   * 销毁监听器
   */
  const destroy = (): void => {
    stopWatching();
    eventEmitter.removeAllListeners();
    log("设备监听服务已销毁");
  };

  /**
   * 监听事件
   */
  const on = (event: string, listener: (...args: unknown[]) => void) => {
    eventEmitter.on(event, listener);
  };

  /**
   * 移除事件监听
   */
  const off = (event: string, listener: (...args: unknown[]) => void) => {
    eventEmitter.off(event, listener);
  };

  /**
   * 单次监听事件
   */
  const once = (event: string, listener: (...args: unknown[]) => void) => {
    eventEmitter.once(event, listener);
  };

  return {
    startWatching,
    stopWatching,
    getWatchingStatus,
    destroy,
    on,
    off,
    once,
  };
}
