/**
 * Electron API 类型定义文件
 *
 * 包含 Electron 应用中主进程与渲染进程通信所需的所有类型定义。
 * 这些类型定义确保了跨进程通信的类型安全性。
 *
 * @file electron-types.ts
 * @description Electron 应用类型定义 - 主进程与渲染进程通信类型
 * @author YanRain ToolBox Team
 */

/**
 * Android 应用信息接口
 *
 * 定义从 Android 设备获取的应用程序详细信息结构。
 * 用于应用管理功能，包括应用列表展示、安装/卸载操作等。
 *
 * @interface ApplicationInfo
 *
 * @example 典型的应用信息对象
 * ```typescript
 * const appInfo: ApplicationInfo = {
 *   name: "微信",
 *   packageName: "com.tencent.mm",
 *   version: "8.0.32",
 *   installDate: "2024-01-15T10:30:00Z",
 *   targetSdk: "33"
 * };
 * ```
 */
export interface ApplicationInfo {
  /**
   * 应用显示名称
   * @example "微信", "QQ音乐", "支付宝"
   */
  name: string;

  /**
   * Android 包名，应用的唯一标识符
   * @example "com.tencent.mm", "com.alipay.android.app"
   */
  packageName: string;

  /**
   * 应用版本号
   * @example "8.0.32", "1.2.3-beta"
   */
  version: string;

  /**
   * 应用安装日期时间戳
   * @format ISO 8601 字符串格式
   * @example "2024-01-15T10:30:00Z"
   */
  installDate: string;

  /**
   * 目标 SDK 版本
   * @example "33" (Android 13), "31" (Android 12)
   */
  targetSdk: string;
}

/**
 * 备份操作进度信息接口
 *
 * 定义系统备份过程中的实时进度信息结构。
 * 用于向用户展示备份进度、当前阶段和详细状态信息。
 *
 * @interface BackupProgress
 *
 * @example 备份进度监听
 * ```typescript
 * window.electronAPI.backup.onProgress((progress: BackupProgress) => {
 *   console.log(`当前阶段: ${progress.stage}`);
 *   console.log(`总体进度: ${progress.progress}%`);
 *   if (progress.currentPartition) {
 *     console.log(`正在备份: ${progress.currentPartition}`);
 *   }
 * });
 * ```
 */
export interface BackupProgress {
  /**
   * 当前备份阶段
   *
   * 备份流程包含多个阶段，按顺序执行：
   * - "检查设备": 验证设备连接和权限
   * - "备份分区": 读取系统分区数据
   * - "校验文件": 验证备份文件完整性
   * - "生成脚本": 创建刷入脚本
   * - "压缩打包": 压缩备份文件
   * - "完成": 备份操作完成
   */
  stage:
    | "检查设备"
    | "备份分区"
    | "校验文件"
    | "生成脚本"
    | "压缩打包"
    | "完成";

  /**
   * 总体进度百分比
   * @range 0-100
   * @example 85 表示已完成 85%
   */
  progress: number;

  /**
   * 当前正在处理的分区名称 (可选)
   * @optional 仅在 "备份分区" 阶段提供
   * @example "boot", "system", "vendor", "userdata"
   */
  currentPartition?: string;

  /**
   * 总分区数量 (可选)
   * @optional 用于计算分区备份进度
   * @example 12 表示总共需要备份 12 个分区
   */
  totalPartitions?: number;

  /**
   * 详细状态消息 (可选)
   * @optional 提供更详细的操作描述
   * @example "正在读取 boot 分区数据...", "压缩文件中，请稍候..."
   */
  message?: string;
}

/**
 * Android 设备信息接口
 *
 * 定义通过 ADB 获取的 Android 设备详细信息结构。
 * 包含设备识别、系统版本、Root 状态等关键信息。
 *
 * @interface DeviceInfo
 *
 * @example 典型的设备信息对象
 * ```typescript
 * const deviceInfo: DeviceInfo = {
 *   model: "Mi 11",
 *   brand: "Xiaomi",
 *   androidVersion: "13",
 *   serialNumber: "abc123def456",
 *   isRooted: true
 * };
 * ```
 */
export interface DeviceInfo {
  /**
   * 设备型号名称
   * @example "Mi 11", "Pixel 6", "Galaxy S21", "OnePlus 9"
   */
  model: string;

  /**
   * 设备品牌厂商
   * @example "Xiaomi", "Google", "Samsung", "OnePlus"
   */
  brand: string;

  /**
   * Android 系统版本号
   * @example "13", "12", "11", "10"
   */
  androidVersion: string;

  /**
   * 设备序列号，设备的唯一标识符
   * @description 用于在多设备环境下识别和操作特定设备
   * @example "abc123def456", "R58M123ABCD"
   */
  serialNumber: string;

  /**
   * 设备是否已获得 Root 权限
   * @description 通过多种方法检测设备的 Root 状态
   * - 检查 su 命令可用性
   * - 检查 Magisk 管理器
   * - 检查系统文件权限
   */
  isRooted: boolean;

  /**
   * 设备是否已解锁 Bootloader
   * @description 检测设备 Bootloader 的解锁状态
   * - 通过 fastboot oem device-info 命令检查
   * - 检查 ro.boot.flash.locked 系统属性
   * - 检查 ro.secureboot.lockstate 状态
   */
  isBootloaderUnlocked: boolean;

  /**
   * 设备电池电量（实时）
   * @description 设备当前电池电量百分比，范围 0-100
   * @example 85 表示电量为 85%
   */
  batteryLevel: number;

  /**
   * 运行内存使用情况（实时）
   * @description 设备当前 RAM 内存的使用状况
   * @property used - 已使用的内存大小（MB）
   * @property total - 总内存大小（MB）
   * @example { used: 3072, total: 8192 } 表示已使用 3GB，总共 8GB
   */
  memoryUsage: {
    used: number;
    total: number;
  };

  /**
   * 存储空间使用情况（实时）
   * @description 设备内部存储的使用状况
   * @property used - 已使用的存储空间（MB）
   * @property total - 总存储空间（MB）
   * @example { used: 51200, total: 128000 } 表示已使用 50GB，总共 125GB
   */
  storageUsage: {
    used: number;
    total: number;
  };

  /**
   * 设备当前状态
   * @description 设备运行模式状态
   * - normal: 正常 Android 系统模式
   * - fastboot: Fastboot 模式
   * - recovery: Recovery 模式
   */
  status: "normal" | "fastboot" | "recovery";
}

/**
 * Boot 镜像修补选项接口
 *
 * 定义使用 Magisk Boot 工具修补 boot.img 时的配置选项。
 * 这些选项控制修补过程中如何处理 Android 的安全验证机制。
 *
 * @interface BootPatchOptions
 *
 * @example 典型的修补选项配置
 * ```typescript
 * const patchOptions: BootPatchOptions = {
 *   preserveVerity: false,        // 移除 dm-verity 校验
 *   preserveForceEncrypt: false,  // 移除强制加密
 *   preserveAvb2: true,          // 保留 AVB 2.0 验证
 *   magiskVersion: "26.1"        // 指定 Magisk 版本
 * };
 * ```
 */
export interface BootPatchOptions {
  /**
   * 是否保留 dm-verity 校验
   *
   * @description dm-verity 是 Android 的分区完整性验证机制
   * - true: 保留验证，系统更安全但可能影响某些修改
   * - false: 移除验证，允许系统分区修改但降低安全性
   * @default false
   */
  preserveVerity: boolean;

  /**
   * 是否保留强制加密设置
   *
   * @description 控制 Android 用户数据分区的加密策略
   * - true: 保持原有加密设置
   * - false: 移除强制加密，可能提高性能但降低数据安全性
   * @default false
   */
  preserveForceEncrypt: boolean;

  /**
   * 是否保留 AVB 2.0 验证
   *
   * @description Android Verified Boot 2.0 启动验证机制
   * - true: 保留 AVB 验证，维持启动安全性
   * - false: 移除 AVB 验证，可能导致设备无法启动
   * @default true
   * @warning 移除 AVB 验证可能导致设备变砖，请谨慎操作
   */
  preserveAvb2: boolean;

  /**
   * Magisk 版本号 (可选)
   *
   * @optional 指定要使用的 Magisk 版本
   * @description 如果不指定，将使用工具内置的默认版本
   * @example "26.1", "25.2", "24.3"
   */
  magiskVersion?: string;
}

/**
 * 日志数据扩展信息接口
 *
 * 定义日志记录时可以附加的元数据信息结构。
 * 用于提供更丰富的日志上下文，便于调试和问题排查。
 *
 * @interface LogData
 *
 * @example 日志记录示例
 * ```typescript
 * // 基础日志
 * window.electronAPI.logger.info("设备连接成功");
 *
 * // 带有详细信息的日志
 * window.electronAPI.logger.error("设备重启失败", {
 *   timestamp: Date.now(),
 *   level: "ERROR",
 *   source: "DeviceManager",
 *   metadata: {
 *     deviceSerial: "abc123",
 *     rebootMode: "recovery",
 *     errorCode: 1001,
 *     retryCount: 3
 *   }
 * });
 * ```
 */
export interface LogData {
  /**
   * 日志时间戳 (可选)
   * @optional Unix 时间戳，如果不提供将自动生成
   * @example Date.now(), 1640995200000
   */
  timestamp?: number;

  /**
   * 日志级别 (可选)
   * @optional 日志重要性级别
   * @example "INFO", "WARN", "ERROR", "DEBUG"
   */
  level?: string;

  /**
   * 日志来源 (可选)
   * @optional 产生日志的模块或组件名称
   * @example "DeviceManager", "BackupService", "BootPatcher"
   */
  source?: string;

  /**
   * 扩展元数据 (可选)
   * @optional 任意的键值对数据，用于记录详细的上下文信息
   * @example
   * ```typescript
   * {
   *   deviceSerial: "abc123",
   *   operation: "reboot",
   *   duration: 5000,
   *   success: true
   * }
   * ```
   */
  metadata?: Record<string, unknown>;
}

/**
 * Electron API 主接口定义
 *
 * 这是渲染进程访问主进程功能的完整 API 定义。
 * 所有方法都通过 IPC (进程间通信) 机制安全地调用主进程功能。
 *
 * @interface ElectronAPI
 *
 * @architecture API 分组架构
 * - system: 系统级别功能 (平台信息、外部链接)
 * - device: Android 设备管理 (连接、信息、重启、状态)
 * - app: Android 应用管理 (安装、卸载、启用/禁用)
 * - backup: 系统备份功能 (分区备份、进度监听)
 * - boot: Boot 镜像处理 (修补、验证)
 * - fs: 文件系统操作 (选择、读写、存在性检查)
 * - notification: 系统通知 (显示通知、监听操作)
 * - logger: 日志记录 (不同级别的日志输出)
 * - tools: 工具路径管理 (ADB、Fastboot、Magisk Boot)
 * - ipc: 通用 IPC 通信 (低级别的消息传递)
 *
 * @security 安全特性
 * - 所有方法都经过主进程验证
 * - 参数类型检查和边界验证
 * - 文件访问权限控制
 * - 系统命令执行沙箱化
 *
 * @example 基本使用模式
 * ```typescript
 * // 1. 获取设备信息
 * const devices = await window.electronAPI.device.getAllDevices();
 *
 * // 2. 执行设备操作
 * const result = await window.electronAPI.device.reboot(
 *   devices[0].serialNumber,
 *   'recovery'
 * );
 *
 * // 3. 监听进度事件
 * window.electronAPI.backup.onProgress((progress) => {
 *   updateProgressBar(progress.progress);
 * });
 * ```
 */
export interface ElectronAPI {
  // ==================== 系统功能 ====================

  /**
   * 当前运行平台标识
   * @description 获取应用运行的操作系统平台
   * @type {NodeJS.Platform} 'win32' | 'darwin' | 'linux' | 'freebsd' | 'openbsd' | 'android' | 'aix' | 'sunos'
   * @readonly 只读属性，在应用启动时确定
   */
  platform: NodeJS.Platform;

  /**
   * 使用系统默认程序打开外部链接
   * @description 安全地在系统默认浏览器中打开 URL
   * @param {string} url - 要打开的 URL 地址
   * @returns {Promise<void>} 操作完成的 Promise
   *
   * @example 打开网页链接
   * ```typescript
   * await window.electronAPI.openExternal('https://github.com/');
   * ```
   *
   * @security 仅支持 http、https、mailto 等安全协议
   */
  openExternal: (url: string) => Promise<void>;

  // ==================== 设备管理 ====================

  /**
   * Android 设备管理模块
   * @description 提供 Android 设备的连接、信息获取、控制等功能
   */
  device: {
    /**
     * 检查 Android 设备连接状态
     * @description 检查是否有 Android 设备通过 ADB 连接
     * @returns {Promise<boolean>} true 表示有设备连接，false 表示无设备
     *
     * @example 检查设备连接
     * ```typescript
     * const isConnected = await window.electronAPI.device.checkConnection();
     * if (isConnected) {
     *   console.log('设备已连接');
     * } else {
     *   console.log('未检测到设备');
     * }
     * ```
     */
    checkConnection: () => Promise<boolean>;

    /**
     * 获取当前连接设备的详细信息
     * @description 获取第一个连接设备的详细信息 (单设备模式)
     * @returns {Promise<DeviceInfo>} 设备信息对象
     * @throws {Error} 当无设备连接时抛出错误
     *
     * @deprecated 建议使用 getAllDevices() 以支持多设备
     *
     * @example 获取设备信息
     * ```typescript
     * try {
     *   const device = await window.electronAPI.device.getDeviceInfo();
     *   console.log(`设备型号: ${device.model}`);
     *   console.log(`Root 状态: ${device.isRooted ? '已Root' : '未Root'}`);
     * } catch (error) {
     *   console.error('无法获取设备信息:', error);
     * }
     * ```
     */
    getDeviceInfo: () => Promise<DeviceInfo>;

    /**
     * 获取所有连接设备的信息列表
     * @description 支持多设备同时连接，返回所有设备的信息
     * @returns {Promise<DeviceInfo[]>} 设备信息数组
     *
     * @example 获取多设备信息
     * ```typescript
     * const devices = await window.electronAPI.device.getAllDevices();
     * console.log(`发现 ${devices.length} 个设备:`);
     * devices.forEach((device, index) => {
     *   console.log(`设备 ${index + 1}: ${device.brand} ${device.model}`);
     * });
     * ```
     */
    getAllDevices: () => Promise<DeviceInfo[]>;

    /**
     * 检查设备 Root 权限状态
     * @description 检查当前设备是否已获得 Root 权限
     * @returns {Promise<boolean>} true 表示已 Root，false 表示未 Root
     *
     * @deprecated 建议通过 getAllDevices() 获取设备信息，其中包含 Root 状态
     *
     * @example 检查 Root 状态
     * ```typescript
     * const isRooted = await window.electronAPI.device.checkRoot();
     * if (isRooted) {
     *   console.log('设备已获得 Root 权限');
     * } else {
     *   console.log('设备未获得 Root 权限');
     * }
     * ```
     */
    checkRoot: () => Promise<boolean>;

    /**
     * 重启设备到指定模式
     * @description 将指定设备重启到不同的系统模式
     *
     * @param {string} serialNumber - 设备序列号，用于多设备环境下的设备识别
     * @param {"system" | "fastboot" | "recovery" | "shutdown"} mode - 重启模式
     *   - "system": 正常重启到系统
     *   - "fastboot": 重启到 Fastboot 模式 (刷机模式)
     *   - "recovery": 重启到 Recovery 模式 (恢复模式)
     *   - "shutdown": 关机
     *
     * @returns {Promise<{success: boolean; message: string}>} 操作结果
     *   - success: 操作是否成功
     *   - message: 结果描述信息或错误消息
     *
     * @example 重启设备到 Recovery 模式
     * ```typescript
     * const result = await window.electronAPI.device.reboot(
     *   'abc123def456',
     *   'recovery'
     * );
     *
     * if (result.success) {
     *   console.log('设备重启成功:', result.message);
     * } else {
     *   console.error('设备重启失败:', result.message);
     * }
     * ```
     *
     * @warning
     * - 重启操作会中断设备当前的所有操作
     * - Fastboot 和 Recovery 模式需要用户手动返回系统
     * - 确保设备有足够的电量执行重启操作
     */
    reboot: (
      serialNumber: string,
      mode: "system" | "fastboot" | "recovery" | "shutdown"
    ) => Promise<{ success: boolean; message: string }>;

    /**
     * 获取设备当前状态
     * @description 检测设备当前所处的系统模式
     *
     * @param {string} [serialNumber] - 设备序列号 (可选)
     *   如果不提供，将检查第一个连接的设备
     *
     * @returns {Promise<"normal" | "fastboot" | "recovery" | "unknown">} 设备状态
     *   - "normal": 设备处于正常 Android 系统模式
     *   - "fastboot": 设备处于 Fastboot 模式
     *   - "recovery": 设备处于 Recovery 模式
     *   - "unknown": 无法确定设备状态或设备未连接
     *
     * @example 检查设备状态
     * ```typescript
     * const status = await window.electronAPI.device.getStatus('abc123');
     * switch (status) {
     *   case 'normal':
     *     console.log('设备处于正常模式');
     *     break;
     *   case 'fastboot':
     *     console.log('设备处于 Fastboot 模式');
     *     break;
     *   case 'recovery':
     *     console.log('设备处于 Recovery 模式');
     *     break;
     *   case 'unknown':
     *     console.log('设备状态未知');
     *     break;
     * }
     * ```
     */
    getStatus: (
      serialNumber?: string
    ) => Promise<"normal" | "fastboot" | "recovery" | "unknown">;

    /**
     * 检测设备连接模式
     * @description 检测指定设备当前是通过ADB还是Fastboot连接
     *
     * @param {string} serialNumber - 设备序列号（必需）
     *
     * @returns {Promise<{
     *   mode: "adb" | "fastboot" | "none";
     *   serialNumber: string;
     *   message: string;
     * }>} 设备连接模式信息
     *   - mode: 连接模式
     *     - "adb": 设备通过ADB连接（正常系统模式）
     *     - "fastboot": 设备通过Fastboot连接（刷机模式）
     *     - "none": 设备未连接或无法访问
     *   - serialNumber: 检测的设备序列号
     *   - message: 检测结果描述信息
     *
     * @example 检测指定设备连接模式
     * ```typescript
     * const result = await window.electronAPI.device.detectMode('abc123def456');
     * switch (result.mode) {
     *   case 'adb':
     *     console.log('设备通过ADB连接，可以使用应用管理功能');
     *     break;
     *   case 'fastboot':
     *     console.log('设备处于Fastboot模式，可以刷写分区');
     *     break;
     *   case 'none':
     *     console.log('设备未连接或无法访问');
     *     break;
     * }
     * ```
     *
     * @since v3.0.0
     * @useful 在执行设备操作前检测设备状态，确保使用正确的工具
     */
    detectMode: (serialNumber: string) => Promise<{
      mode: "adb" | "fastboot" | "none";
      serialNumber: string;
      message: string;
    }>;

    /**
     * 启动设备监听服务
     * @description 启动 Windows 设备监听服务，实时监控设备连接变化
     * @returns {Promise<{ success: boolean; message: string }>} 启动结果
     *
     * @platform Windows only - 仅支持 Windows 系统
     *
     * @example 启动设备监听
     * ```typescript
     * const result = await window.electronAPI.device.startWatching();
     * if (result.success) {
     *   console.log('设备监听已启动');
     * } else {
     *   console.error('启动失败:', result.message);
     * }
     * ```
     */
    startWatching: () => Promise<{ success: boolean; message: string }>;

    /**
     * 停止设备监听服务
     * @description 停止设备监听服务，节省系统资源
     * @returns {Promise<{ success: boolean; message: string }>} 停止结果
     *
     * @example 停止设备监听
     * ```typescript
     * const result = await window.electronAPI.device.stopWatching();
     * console.log(result.message);
     * ```
     */
    stopWatching: () => Promise<{ success: boolean; message: string }>;

    /**
     * 获取设备监听状态
     * @description 检查设备监听服务是否正在运行
     * @returns {Promise<{ success: boolean; isWatching: boolean; message: string }>} 监听状态
     *
     * @example 检查监听状态
     * ```typescript
     * const status = await window.electronAPI.device.getWatchingStatus();
     * if (status.isWatching) {
     *   console.log('设备监听服务正在运行');
     * } else {
     *   console.log('设备监听服务未运行');
     * }
     * ```
     */
    getWatchingStatus: () => Promise<{
      success: boolean;
      isWatching: boolean;
      message: string;
    }>;

    /**
     * 监听设备变化事件
     * @description 注册设备连接/断开的事件监听器
     * @param {(event: unknown) => void} callback - 设备变化时的回调函数
     *
     * @example 监听设备变化
     * ```typescript
     * window.electronAPI.device.onDeviceChanged((event) => {
     *   console.log('设备状态发生变化:', event);
     *   // 刷新设备列表
     *   refreshDeviceList();
     * });
     * ```
     */
    onDeviceChanged: (callback: (event: unknown) => void) => void;

    /**
     * 移除设备变化事件监听器
     * @description 移除指定的设备变化事件监听器，防止内存泄漏
     * @param {(event: unknown) => void} callback - 要移除的回调函数
     *
     * @example 移除监听器
     * ```typescript
     * const deviceChangeHandler = (event) => {
     *   console.log('设备变化:', event);
     * };
     *
     * // 添加监听器
     * window.electronAPI.device.onDeviceChanged(deviceChangeHandler);
     *
     * // 移除监听器
     * window.electronAPI.device.removeDeviceChangedListener(deviceChangeHandler);
     * ```
     */
    removeDeviceChangedListener: (callback: (event: unknown) => void) => void;
  };

  // ==================== Fastboot 分区管理 ====================
  fastboot: {
    /** 刷入分区镜像 */
    flash: (
      serial: string,
      partition: string,
      imagePath: string
    ) => Promise<{ code: number; output: string }>;

    /** 擦除分区 */
    erase: (
      serial: string,
      partition: string
    ) => Promise<{ code: number; output: string }>;

    /** 读取 fastboot 变量 */
    getvar: (
      serial: string,
      name: string
    ) => Promise<{ code: number; output: string }>;
  };

  // ==================== 应用管理 ====================

  /**
   * Android 应用管理模块
   * @description 提供 Android 应用的安装、卸载、列表获取等功能
   */
  app: {
    /**
     * 获取设备上的应用列表
     * @description 获取指定设备上安装的所有应用程序信息
     *
     * @param {string} [deviceSerialNumber] - 设备序列号 (可选)
     *   如果不提供，将操作第一个连接的设备
     *
     * @returns {Promise<ApplicationInfo[]>} 应用信息数组
     *
     * @example 获取应用列表
     * ```typescript
     * const apps = await window.electronAPI.app.getApplications('abc123');
     * console.log(`找到 ${apps.length} 个应用:`);
     * apps.forEach(app => {
     *   console.log(`- ${app.name} (${app.packageName})`);
     * });
     * ```
     */
    getApplications: (
      deviceSerialNumber?: string
    ) => Promise<ApplicationInfo[]>;

    /**
     * 安装 APK 应用到设备
     * @description 将指定的 APK 文件安装到 Android 设备
     *
     * @param {string} apkPath - APK 文件的完整路径
     * @param {string} [deviceSerialNumber] - 设备序列号 (可选)
     *   如果不提供，将安装到第一个连接的设备
     *
     * @returns {Promise<boolean>} 安装结果，true 表示成功，false 表示失败
     *
     * @example 安装应用
     * ```typescript
     * const success = await window.electronAPI.app.install(
     *   '/path/to/app.apk',
     *   'abc123'
     * );
     *
     * if (success) {
     *   console.log('应用安装成功');
     * } else {
     *   console.error('应用安装失败');
     * }
     * ```
     *
     * @warning
     * - 确保 APK 文件存在且格式正确
     * - 某些系统应用可能需要特殊权限才能安装
     * - 安装过程中请勿断开设备连接
     */
    install: (apkPath: string, deviceSerialNumber?: string) => Promise<boolean>;

    /**
     * 卸载应用
     * @description 从设备卸载指定的应用程序
     *
     * @param {string} packageName - 应用包名
     * @param {boolean} keepData - 是否保留应用数据
     * @param {string} [deviceSerialNumber] - 设备序列号 (可选)
     *
     * @returns {Promise<boolean>} 卸载结果，true 表示成功，false 表示失败
     */
    uninstallApplication: (
      packageName: string,
      keepData: boolean,
      deviceSerialNumber?: string
    ) => Promise<boolean>;

    /**
     * 启用应用
     * @description 启用被禁用的应用程序
     *
     * @param {string} packageName - 应用包名
     * @param {string} [deviceSerialNumber] - 设备序列号 (可选)
     *
     * @returns {Promise<boolean>} 启用结果，true 表示成功，false 表示失败
     */
    enableApplication: (
      packageName: string,
      deviceSerialNumber?: string
    ) => Promise<boolean>;

    /**
     * 禁用应用
     * @description 禁用指定的应用程序
     *
     * @param {string} packageName - 应用包名
     * @param {string} [deviceSerialNumber] - 设备序列号 (可选)
     *
     * @returns {Promise<boolean>} 禁用结果，true 表示成功，false 表示失败
     */
    disableApplication: (
      packageName: string,
      deviceSerialNumber?: string
    ) => Promise<boolean>;

    /**
     * 清除应用数据
     * @description 清除指定应用的所有数据和缓存
     *
     * @param {string} packageName - 应用包名
     * @param {string} [deviceSerialNumber] - 设备序列号 (可选)
     *
     * @returns {Promise<boolean>} 清除结果，true 表示成功，false 表示失败
     */
    clearApplicationData: (
      packageName: string,
      deviceSerialNumber?: string
    ) => Promise<boolean>;

    /** 启动应用 */
    start: (
      packageName: string,
      deviceSerialNumber?: string
    ) => Promise<boolean>;
    /** 停止应用 */
    stop: (
      packageName: string,
      deviceSerialNumber?: string
    ) => Promise<boolean>;
    /** 冻结应用 */
    freeze: (
      packageName: string,
      deviceSerialNumber?: string
    ) => Promise<boolean>;
    /** 解冻应用 */
    unfreeze: (
      packageName: string,
      deviceSerialNumber?: string
    ) => Promise<boolean>;
    /** 提取APK到本地路径 */
    extractApk: (
      packageName: string,
      outputApkPath: string,
      deviceSerialNumber?: string
    ) => Promise<boolean>;
  };

  // ==================== 系统备份 ====================

  /**
   * 系统备份模块
   * @description 提供 Android 设备系统分区的备份功能
   */
  backup: {
    /**
     * 开始系统备份操作
     * @description 备份设备的关键系统分区到指定目录
     *
     * @param {string} outputPath - 备份文件的输出目录路径
     * @param {string} deviceModel - 设备型号标识
     * @param {string} romVersion - ROM 版本信息
     *
     * @returns {Promise<boolean>} 备份结果，true 表示成功，false 表示失败
     *
     * @example 开始备份
     * ```typescript
     * const success = await window.electronAPI.backup.start(
     *   '/backup/path',
     *   'Mi 11',
     *   'MIUI 14.0.3'
     * );
     *
     * if (success) {
     *   console.log('备份完成');
     * } else {
     *   console.error('备份失败');
     * }
     * ```
     *
     * @warning
     * - 备份过程可能需要较长时间，请保持设备连接
     * - 确保输出目录有足够的存储空间
     * - 备份过程中设备可能会重启到不同模式
     */
    start: (
      outputPath: string,
      deviceModel: string,
      romVersion: string,
      serialNumber?: string,
      options?: { excludePartitions?: string[] }
    ) => Promise<boolean>;

    /**
     * 监听备份进度事件
     * @description 注册备份进度变化的事件监听器
     * @param {(progress: BackupProgress) => void} callback - 进度更新回调函数
     *
     * @example 监听备份进度
     * ```typescript
     * window.electronAPI.backup.onProgress((progress) => {
     *   console.log(`当前阶段: ${progress.stage}`);
     *   console.log(`进度: ${progress.progress}%`);
     *
     *   if (progress.currentPartition) {
     *     console.log(`正在备份分区: ${progress.currentPartition}`);
     *   }
     *
     *   if (progress.message) {
     *     console.log(`状态: ${progress.message}`);
     *   }
     * });
     * ```
     */
    onProgress: (callback: (progress: BackupProgress) => void) => void;

    /**
     * 移除备份进度事件监听器
     * @description 移除指定的备份进度监听器，防止内存泄漏
     * @param {(progress: BackupProgress) => void} callback - 要移除的回调函数
     *
     * @example 移除进度监听器
     * ```typescript
     * const progressHandler = (progress) => {
     *   console.log('备份进度:', progress.progress);
     * };
     *
     * // 添加监听器
     * window.electronAPI.backup.onProgress(progressHandler);
     *
     * // 移除监听器
     * window.electronAPI.backup.removeProgressListener(progressHandler);
     * ```
     */
    removeProgressListener: (
      callback: (progress: BackupProgress) => void
    ) => void;
  };

  // ==================== Boot 修补 ====================

  /**
   * Boot 镜像修补模块
   * @description 提供 Boot 镜像的 Magisk 修补功能
   */
  boot: {
    /**
     * 修补 Boot 镜像
     * @description 使用 Magisk 修补指定的 Boot 镜像文件
     *
     * @param {string} bootPath - Boot 镜像文件的完整路径
     * @param {BootPatchOptions} options - 修补选项配置
     *
     * @returns {Promise<string>} 修补结果消息
     * @throws {Error} 修补失败时抛出错误
     *
     * @example 修补 Boot 镜像
     * ```typescript
     * try {
     *   const result = await window.electronAPI.boot.patch(
     *     '/path/to/boot.img',
     *     {
     *       preserveVerity: false,
     *       preserveForceEncrypt: false,
     *       preserveAvb2: true,
     *       magiskVersion: '26.1'
     *     }
     *   );
     *   console.log('修补成功:', result);
     * } catch (error) {
     *   console.error('修补失败:', error);
     * }
     * ```
     *
     * @warning
     * - 修补 Boot 镜像有一定风险，请确保备份原始文件
     * - 不当的修补选项可能导致设备无法启动
     * - 建议在修补前充分了解设备的安全机制
     */
    patch: (bootPath: string, magiskPath: string) => Promise<string>;
    /**
     * 验证/解析 Boot 或 Init_Boot 镜像的头部信息
     * @param {string} imgPath 镜像路径
     * @returns {Promise<{ magic: string; size: number; kernelSize?: number; ramdiskSize?: number; note?: string }>} 头部信息
     */
    inspect: (imgPath: string) => Promise<{
      magic: string;
      size: number;
      kernelSize?: number;
      ramdiskSize?: number;
      note?: string;
    }>;
  };

  // ==================== OTA 解析 ====================

  /**
   * OTA 包解析模块
   * @description 提供在线 OTA 包的分析和分区提取功能
   */
  ota: {
    /**
     * 从 URL 提取 OTA 包中的指定分区
     * @description 从在线 OTA 包中提取指定的系统分区镜像
     *
     * @param {string} url - OTA 包的下载 URL
     * @param {string} partitionName - 要提取的分区名称
     * @param {string} outputPath - 分区镜像的保存路径
     * @param {Object} [options] - 可选的解析配置
     * @param {number} [options.timeout] - 下载超时时间 (毫秒)
     * @param {boolean} [options.verify] - 是否验证文件完整性
     *
     * @returns {Promise<{ success: boolean; error?: string }>} 提取结果
     *   - success: 提取是否成功
     *   - error: 错误信息 (仅在失败时提供)
     *
     * @example 提取 Boot 分区
     * ```typescript
     * const result = await window.electronAPI.ota.extractPartitionFromUrl(
     *   'https://example.com/ota-package.zip',
     *   'boot',
     *   '/save/path/boot.img',
     *   { timeout: 30000, verify: true }
     * );
     *
     * if (result.success) {
     *   console.log('分区提取成功');
     * } else {
     *   console.error('提取失败:', result.error);
     * }
     * ```
     *
     * @warning
     * - 下载大型 OTA 包可能需要较长时间
     * - 确保网络连接稳定
     * - 验证输出路径的写入权限
     */
    extractPartitionFromUrl: (
      url: string,
      partitionName: string,
      outputPath: string,
      options?: { timeout?: number; verify?: boolean }
    ) => Promise<{ success: boolean; error?: string }>;
    /**
     * 自定义分区提取（URL/本地ZIP/本地payload/直链）
     */
    customExtract: (
      urlOrPath: string,
      partitionName: string,
      outputPath: string,
      options?: { timeout?: number; verify?: boolean }
    ) => Promise<{ success: boolean; error?: string }>;
  };

  // ==================== 文件系统 ====================

  /**
   * 文件系统操作模块
   * @description 提供文件和目录的选择、操作功能
   */
  fs: {
    /**
     * 打开文件选择对话框
     * @description 显示系统文件选择对话框，允许用户选择文件
     *
     * @param {Electron.FileFilter[]} [filters] - 文件类型过滤器 (可选)
     *
     * @returns {Promise<string | null>} 选中的文件路径，取消选择时返回 null
     *
     * @example 选择 APK 文件
     * ```typescript
     * const filePath = await window.electronAPI.fs.selectFile([
     *   { name: 'APK Files', extensions: ['apk'] },
     *   { name: 'All Files', extensions: ['*'] }
     * ]);
     *
     * if (filePath) {
     *   console.log('选择的文件:', filePath);
     * } else {
     *   console.log('用户取消了选择');
     * }
     * ```
     */
    selectFile: (filters?: Electron.FileFilter[]) => Promise<string | null>;

    /**
     * 打开目录选择对话框
     * @description 显示系统目录选择对话框，允许用户选择目录
     *
     * @returns {Promise<string | null>} 选中的目录路径，取消选择时返回 null
     *
     * @example 选择备份目录
     * ```typescript
     * const dirPath = await window.electronAPI.fs.selectDirectory();
     *
     * if (dirPath) {
     *   console.log('选择的目录:', dirPath);
     * } else {
     *   console.log('用户取消了选择');
     * }
     * ```
     */
    selectDirectory: () => Promise<string | null>;
  };

  // ==================== 系统通知 ====================

  /**
   * 系统通知模块
   * @description 提供系统级通知显示功能
   */
  notification: {
    /**
     * 显示系统通知
     * @description 显示原生的系统通知消息
     *
     * @param {string} title - 通知标题
     * @param {string} body - 通知内容
     * @param {string} [icon] - 通知图标路径 (可选)
     *
     * @example 显示通知
     * ```typescript
     * window.electronAPI.notification.show(
     *   '备份完成',
     *   '系统分区备份已成功完成',
     *   '/path/to/icon.png'
     * );
     * ```
     */
    show: (title: string, body: string, icon?: string) => void;
  };

  // ==================== 日志系统 ====================

  /**
   * 日志记录模块
   * @description 提供统一的日志记录功能
   */
  logger: {
    /**
     * 记录信息级别日志
     * @description 记录一般信息类型的日志
     *
     * @param {string} message - 日志消息
     * @param {LogData} [data] - 附加的日志数据 (可选)
     *
     * @example 记录信息日志
     * ```typescript
     * window.electronAPI.logger.info('设备连接成功', {
     *   source: 'DeviceManager',
     *   metadata: { deviceSerial: 'abc123' }
     * });
     * ```
     */
    info: (message: string, data?: LogData) => void;

    /**
     * 记录错误级别日志
     * @description 记录错误信息类型的日志
     *
     * @param {string} message - 错误消息
     * @param {LogData} [data] - 附加的错误数据 (可选)
     *
     * @example 记录错误日志
     * ```typescript
     * window.electronAPI.logger.error('设备连接失败', {
     *   source: 'DeviceManager',
     *   metadata: {
     *     errorCode: 1001,
     *     retryCount: 3
     *   }
     * });
     * ```
     */
    error: (message: string, data?: LogData) => void;
  };

  // ==================== 工具路径管理 ====================

  /**
   * 工具路径管理模块
   * @description 提供各种 Android 开发工具的路径管理功能
   */
  tools: {
    /**
     * 获取当前平台标识
     * @description 获取当前运行的操作系统平台
     * @returns {Promise<NodeJS.Platform>} 平台标识
     *
     * @example 获取平台信息
     * ```typescript
     * const platform = await window.electronAPI.tools.getPlatform();
     * console.log('当前平台:', platform); // 'win32', 'darwin', 'linux'
     * ```
     */
    getPlatform: () => Promise<NodeJS.Platform>;

    /**
     * 获取 ADB 工具路径
     * @description 获取当前平台的 ADB 可执行文件路径
     * @returns {Promise<string>} ADB 工具的完整路径
     *
     * @example 获取 ADB 路径
     * ```typescript
     * const adbPath = await window.electronAPI.tools.getAdbPath();
     * console.log('ADB 路径:', adbPath);
     * ```
     */
    getAdbPath: () => Promise<string>;

    /**
     * 获取 Fastboot 工具路径
     * @description 获取当前平台的 Fastboot 可执行文件路径
     * @returns {Promise<string>} Fastboot 工具的完整路径
     *
     * @example 获取 Fastboot 路径
     * ```typescript
     * const fastbootPath = await window.electronAPI.tools.getFastbootPath();
     * console.log('Fastboot 路径:', fastbootPath);
     * ```
     */
    getFastbootPath: () => Promise<string>;

    /**
     * 获取 Magisk Boot 工具路径
     * @description 获取当前平台的 Magisk Boot 可执行文件路径
     * @returns {Promise<string>} Magisk Boot 工具的完整路径
     *
     * @example 获取 Magisk Boot 路径
     * ```typescript
     * const magiskPath = await window.electronAPI.tools.getMagiskBootPath();
     * console.log('Magisk Boot 路径:', magiskPath);
     * ```
     */
    getMagiskBootPath: () => Promise<string>;

    /**
     * 获取所有平台工具路径
     * @description 获取所有支持平台的工具路径映射
     * @returns {Promise<Record<string, Record<string, string>>>} 平台工具路径映射
     *
     * @example 获取所有平台路径
     * ```typescript
     * const allPaths = await window.electronAPI.tools.getAllPlatformPaths();
     * console.log('Windows ADB:', allPaths.windows?.adb);
     * console.log('Linux ADB:', allPaths.linux?.adb);
     * console.log('macOS ADB:', allPaths.darwin?.adb);
     * ```
     */
    getAllPlatformPaths: () => Promise<Record<string, Record<string, string>>>;

    /**
     * 检查工具文件是否存在
     * @description 验证当前平台的所有必需工具是否存在
     * @returns {Promise<Record<string, boolean>>} 工具存在性检查结果
     *
     * @example 检查工具存在性
     * ```typescript
     * const toolsExist = await window.electronAPI.tools.checkToolsExist();
     * if (toolsExist.adb) {
     *   console.log('ADB 工具可用');
     * } else {
     *   console.log('ADB 工具缺失');
     * }
     * ```
     */
    checkToolsExist: () => Promise<Record<string, boolean>>;

    /** 获取当前平台的工具目录（如 tools/windows） */
    getPlatformToolsDir: () => Promise<string>;

    /** 启动流式命令执行，返回进程 id */
    shellRunStream: (
      command: string,
      options?: {
        useToolsCwd?: boolean;
        timeout?: number;
        replaceTools?: boolean;
      }
    ) => Promise<{ id: string }>;
    /** 终止流式命令 */
    shellKill: (id: string) => Promise<boolean>;
    /** 订阅流式输出数据（返回取消订阅函数） */
    onShellData: (
      callback: (evt: {
        id: string;
        source: "stdout" | "stderr";
        data: string;
      }) => void
    ) => () => void;
    /** 订阅流式退出事件（返回取消订阅函数） */
    onShellExit: (
      callback: (evt: {
        id: string;
        code: number | null;
        signal: NodeJS.Signals | null;
      }) => void
    ) => () => void;

    /**
     * 运行任意命令行（带工具路径替换或在工具目录下执行）
     * @param command 待执行的命令，如 "adb reboot"
     * @param options 可选项：
     *  - useToolsCwd: 是否将工作目录切换到对应平台 tools 目录
     *  - timeout: 超时毫秒
     *  - replaceTools: 是否把命令里的 adb/fastboot/magiskboot 替换为绝对路径（默认 true）
     * @returns {Promise<{ code: number; output: string }>} 执行结果
     */
    shellRun: (
      command: string,
      options?: {
        useToolsCwd?: boolean;
        timeout?: number;
        replaceTools?: boolean;
      }
    ) => Promise<{ code: number; output: string }>;
  };

  // ==================== 窗口控制 ====================

  /**
   * 窗口控制模块
   * @description 提供应用窗口的控制功能
   */
  window: {
    /**
     * 最小化当前窗口
     * @description 将当前活动窗口最小化到任务栏
     *
     * @example 最小化窗口
     * ```typescript
     * window.electronAPI.window.minimize();
     * ```
     */
    minimize: () => void;

    /**
     * 关闭当前窗口
     * @description 关闭当前活动窗口，退出应用
     *
     * @example 关闭窗口
     * ```typescript
     * window.electronAPI.window.close();
     * ```
     */
    close: () => void;

    /**
     * 检查窗口是否最大化
     * @description 检查当前窗口是否处于最大化状态
     * @returns {Promise<boolean>} true 表示已最大化，false 表示未最大化
     *
     * @example 检查最大化状态
     * ```typescript
     * const isMaximized = await window.electronAPI.window.isMaximized();
     * if (isMaximized) {
     *   console.log('窗口已最大化');
     * } else {
     *   console.log('窗口未最大化');
     * }
     * ```
     */
    isMaximized: () => Promise<boolean>;
  };

  // ==================== 通用 IPC 通信 ====================

  /**
   * 通用 IPC 通信模块
   * @description 提供低级别的进程间通信功能
   */
  ipc: {
    /**
     * 调用主进程方法
     * @description 通用的主进程方法调用接口
     *
     * @param {string} channel - IPC 通道名称
     * @param {...unknown[]} args - 传递给主进程的参数
     *
     * @returns {Promise<unknown>} 主进程方法的返回值
     *
     * @example 调用自定义 IPC 方法
     * ```typescript
     * const result = await window.electronAPI.ipc.invoke(
     *   'custom:method',
     *   param1,
     *   param2
     * );
     * ```
     */
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;

    /**
     * 发送消息到主进程
     * @description 向主进程发送单向消息（无返回值）
     *
     * @param {string} channel - IPC 通道名称
     * @param {...unknown[]} args - 传递给主进程的参数
     *
     * @example 发送消息到主进程
     * ```typescript
     * window.electronAPI.ipc.send('custom:notification', 'Hello');
     * ```
     */
    send: (channel: string, ...args: unknown[]) => void;

    /**
     * 监听主进程消息
     * @description 注册主进程消息的监听器
     *
     * @param {string} channel - IPC 通道名称
     * @param {Function} listener - 消息监听器函数
     *
     * @example 监听主进程消息
     * ```typescript
     * window.electronAPI.ipc.on('custom:update', (event, data) => {
     *   console.log('收到更新:', data);
     * });
     * ```
     */
    on: (channel: string, listener: (...args: unknown[]) => void) => void;

    /**
     * 移除消息监听器
     * @description 移除指定的主进程消息监听器
     *
     * @param {string} channel - IPC 通道名称
     * @param {Function} listener - 要移除的监听器函数
     *
     * @example 移除消息监听器
     * ```typescript
     * const updateHandler = (event, data) => {
     *   console.log('更新:', data);
     * };
     *
     * // 添加监听器
     * window.electronAPI.ipc.on('custom:update', updateHandler);
     *
     * // 移除监听器
     * window.electronAPI.ipc.removeListener('custom:update', updateHandler);
     * ```
     */
    removeListener: (
      channel: string,
      listener: (...args: unknown[]) => void
    ) => void;
  };
}

/**
 * 全局 Window 接口扩展
 *
 * 扩展浏览器 Window 对象，添加 Electron API 访问能力。
 * 通过预加载脚本的 contextBridge 安全地暴露主进程功能。
 */
declare global {
  interface Window {
    /**
     * Electron API 访问接口
     * @description 通过 contextBridge 安全暴露的主进程功能
     * @readonly 只读接口，确保渲染进程无法修改
     */
    electronAPI: ElectronAPI;
  }
}
