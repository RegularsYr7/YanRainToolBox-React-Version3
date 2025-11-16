# API 参考文档

**YanRainToolBox React v3 - 完整 API 参考**

> 📚 **说明**: 本文档提供项目中所有 API 的详细参考信息，包括 Electron IPC API、Controller 层 API 和 Service 层 API

---

## 📋 目录

- [🔌 Electron IPC API](#-electron-ipc-api)
- [🎛️ Controller 层 API](#️-controller-层-api)
- [⚙️ Service 层 API](#️-service-层-api)
- [🔧 工具函数 API](#-工具函数-api)
- [📱 React Hooks API](#-react-hooks-api)

---

## 🔌 Electron IPC API（预加载暴露）

预加载在 `window.electronAPI` 下暴露分组 API。以下为主要分组与常用方法摘要（详见 `src/Electron/preload.ts` 与 `src/Electron/ipcHandlers.ts`）。

### 设备管理 API（electronAPI.device）

#### `getAllDevices()`

获取当前连接的所有设备列表。

```typescript
const devices = await window.electronAPI.device.getAllDevices();
// 返回: Device[]
```

**返回值类型:**

```typescript
interface Device {
  id: string; // 设备唯一标识
  name: string; // 设备名称
  model: string; // 设备型号
  version: string; // Android 版本
  isRooted: boolean; // 是否已 Root
  connectionType: "usb" | "wifi"; // 连接类型
}
```

#### `getDeviceInfo()`

获取指定设备的详细信息。

```typescript
const info = await window.electronAPI.device.getDeviceInfo();
// 返回: DeviceInfo
```

**参数:**

- `deviceId`: 设备 ID

**返回值类型:**

```typescript
interface DeviceInfo extends Device {
  battery: number; // 电池电量 (0-100)
  storage: {
    total: number; // 总存储空间 (MB)
    used: number; // 已使用空间 (MB)
    available: number; // 可用空间 (MB)
  };
  cpu: string; // CPU 架构
  ram: number; // 内存大小 (MB)
}
```

#### `checkRoot()`

检查设备的 Root 状态。

```typescript
const isRooted = await window.electronAPI.device.checkRoot();
// 返回: boolean
```

#### `reboot(serialNumber: string, mode: "system" | "fastboot" | "recovery" | "shutdown")`

重启设备到指定模式。

```typescript
await window.electronAPI.device.reboot("device-serial", "system");
```

**参数:**

- `deviceId`: 设备 ID
- `mode`: 重启模式
  - `'system'`: 正常重启
  - `'bootloader'`: 重启到 Bootloader
  - `'recovery'`: 重启到 Recovery
  - `'fastboot'`: 重启到 Fastboot

### 应用管理 API（electronAPI.app）

#### `getApplications(deviceSerialNumber?: string)`

获取设备上已安装的应用列表。

```typescript
const apps = await window.electronAPI.app.getApplications("device-serial");
// 返回: InstalledApp[]
```

**返回值类型:**

```typescript
interface InstalledApp {
  packageName: string; // 包名
  name: string; // 应用名称
  version: string; // 版本号
  versionCode: number; // 版本代码
  size: number; // 应用大小 (bytes)
  installTime: number; // 安装时间戳
  isSystemApp: boolean; // 是否为系统应用
  icon?: string; // 应用图标 (base64)
}
```

#### `install(apkPath: string, deviceSerialNumber?: string)`

安装 APK 文件到设备。

```typescript
const result = await window.electronAPI.app.install(
  "C:/apk/app.apk",
  "device-serial"
);
// 返回: InstallResult
```

**返回值类型:**

```typescript
interface InstallResult {
  success: boolean;
  message: string;
  packageName?: string;
  error?: string;
}
```

#### `uninstallApplication(packageName: string, keepData: boolean, deviceSerialNumber?: string)`

卸载指定应用。

```typescript
const ok = await window.electronAPI.app.uninstallApplication(
  "com.example.app",
  false,
  "device-serial"
);
```

#### `enableApplication(packageName: string, deviceSerialNumber?: string)` / `disableApplication(packageName: string, deviceSerialNumber?: string)`

启用/禁用指定应用。

```typescript
await window.electronAPI.app.enableApplication("com.example.app");
await window.electronAPI.app.disableApplication("com.example.app");
```

#### `clearApplicationData(packageName: string, deviceSerialNumber?: string)`

清除应用数据与缓存。

```typescript
await window.electronAPI.app.clearApplicationData("com.example.app");
```

### 备份管理 API（electronAPI.backup）

#### `start(outputPath: string, deviceModel: string, romVersion: string)`

```typescript
await window.electronAPI.backup.start(
  "D:/backup",
  "device-model",
  "rom-version"
);
```

**支持的分区:**

- `'boot'`: Boot 分区
- `'recovery'`: Recovery 分区
- `'system'`: System 分区
- `'userdata'`: 用户数据分区

进度监听：`electronAPI.backup.onProgress(cb)`

### 文件系统 API（electronAPI.fs）

#### `selectFile(filters: FileFilter[])`

打开文件选择对话框。

```typescript
const filePath = await window.electronAPI.fs.selectFile([
  { name: "APK Files", extensions: ["apk"] },
  { name: "All Files", extensions: ["*"] },
]);
// 返回: string | null
```

#### `selectDirectory()`

打开目录选择对话框。

```typescript
const dirPath = await window.electronAPI.fs.selectDirectory();
// 返回: string | null
```

### OTA 解析 API（electronAPI.ota）

#### `extractPartitionFromUrl(url: string, partition: string, outputPath: string, options?)`

从 OTA URL 提取指定分区。

```typescript
const res = await window.electronAPI.ota.extractPartitionFromUrl(
  "https://example.com/ota-update.zip",
  "boot",
  "./boot.img"
);
// 返回: { success: boolean; error?: string }
if (!res.success) console.error(res.error);
```

### 其他 API（节选）

- tools：getPlatform/getAdbPath/getFastbootPath/getAllPlatformPaths/checkToolsExist
- logger：info/error
- notification：show
- ipc：invoke/send/on/removeListener

---

## 🎛️ Controller 层 API

### ApplicationManagementController

应用管理控制器，提供高级应用管理功能。

```typescript
import {
  getInstalledApplications,
  installApplication,
  uninstallApplication,
  getApplicationInfo,
  enableApplication,
  disableApplication,
  forceStopApplication,
  clearApplicationData,
  clearApplicationCache,
  getApplicationPermissions,
  grantApplicationPermission,
  revokeApplicationPermission,
  installMultipleApplications,
  uninstallSystemApplication,
  backupApplicationData,
  restoreApplicationData,
} from "../Controllers/ApplicationManagementController";
```

### BackupImageController

分区备份控制器。

```typescript
import {
  createSystemBackup,
  createPartitionBackup,
  restoreSystemBackup,
  restorePartitionBackup,
  createNandroidBackup,
  restoreNandroidBackup,
  verifyBackupIntegrity,
  getBackupInfo,
} from "../Controllers/BackupImageController";
```

### BootPatchController

Boot 修补控制器。

```typescript
import {
  downloadMagiskApk,
  extractBootImage,
  patchBootImage,
  flashPatchedBoot,
  verifyPatchedBoot,
  removeMagiskPatch,
} from "../Controllers/BootPatchController";
```

### MagiskBootController

Magisk Boot 管理控制器。

```typescript
import {
  extractBootFromDevice,
  patchBootWithMagisk,
  installPatchedBoot,
  verifyMagiskInstallation,
  updateMagisk,
  uninstallMagisk,
} from "../Controllers/MagiskBootController";
```

### OnlineOTAParserController（OTA 在线/本地智能解析）

```typescript
import {
  extractPartitionFromUrl,
  extractPartitionFileFromZip,
  downloadPartitionFile,
  validateSource,
} from "../Controllers/OnlineOTAParserController";
```

#### `extractPartitionFromUrl(url, partition, outputPath)`

从 OTA URL 在线提取分区文件。

```typescript
const success = await extractPartitionFromUrl(
  "https://example.com/firmware.zip",
  "boot",
  "./boot.img"
);
```

说明：内部会根据在线/本地、ZIP/payload/直链等情况选择最优策略（Range/ZipHandler/yauzl/本地复制）。

### LinkExtractorController

小米 ROM 链接提取控制器。

```typescript
import {
  extractMiuiDownloadLink,
  getRomDownloadUrl,
} from "../Controllers/LinkExtractorController";
```

#### `extractMiuiDownloadLink(url)`

从小米官方页面提取下载链接。

```typescript
const downloadUrl = await extractMiuiDownloadLink(
  "https://www.miui.com/download-123.html"
);
```

#### `getRomDownloadUrl(device, version)`

通过设备代码和版本获取 ROM 下载链接。

```typescript
const romUrl = await getRomDownloadUrl("lisa", "V14.0.3.0.SKMCNXM");
```

---

## ⚙️ Service 层 API

### OnlineOTAParserService（服务，控制器包装调用）

```typescript
import { OnlineOTAParserService } from "../Services/OnlineOTAParserService";

const service = new OnlineOTAParserService();

// 常用方法（通过控制器已封装对外）：
// - smartExtractPartition(urlOrPath, partition, output)
// - extractPartitionFileFromZip(zipUrl, partitionFileName, outputPath)
// - downloadPartitionFile(url, outputPath)
// 说明：detectPayloadOnline/parsePayloadHeaderOnline/extractPartitionOnline 为内部流程方法。
```

### LinkExtractorService

小米 ROM 链接提取服务。

```typescript
import { LinkExtractorService } from "../Services/LinkExtractorService";

const service = new LinkExtractorService();

// 提取下载链接
const downloadUrl = await service.extractDownloadLink(pageUrl);

// 获取 ROM URL
const romUrl = await service.getRomUrl(device, version);
```

---

## 🔧 工具函数 API

### 命令执行工具 (command.ts - CommandExecutor)

```typescript
import { CommandExecutor } from "../Utils/command";

const { code, output } = await CommandExecutor.execute("ipconfig");
```

### 文件操作工具 (file.ts)

```typescript
import {
  readFile,
  writeFile,
  copyFile,
  deleteFile,
  createDirectory,
  fileExists,
  getFileSize,
  getFileStats,
} from "../Utils/file";

// 读取文件
const content = await readFile("/path/to/file.txt");

// 写入文件
await writeFile("/path/to/file.txt", "content");

// 检查文件是否存在
const exists = await fileExists("/path/to/file.txt");
```

### 路径管理工具 (paths.ts)

```typescript
import { getAdbPath, getFastbootPath, pathManager } from "../Utils/paths";
const adbPath = getAdbPath();
const fastbootPath = getFastbootPath();
const platform = pathManager.getCurrentPlatform();
```

### 日志系统 (logger.ts)

```typescript
import { Logger } from "../Utils/logger";

const logger = Logger.getInstance();

// 记录日志
logger.debug("调试信息", { data: someData });
logger.info("信息", { action: "user-action" });
logger.warn("警告", { warning: "deprecated-api" });
logger.error("错误", { error: error.message });
```

---

## 📱 React Hooks API

### useDevice

设备管理 Hook。

```typescript
import { useDevice } from "../hooks/useDevice";

function MyComponent() {
  const {
    devices, // 设备列表
    selectedDevice, // 当前选中的设备
    isConnected, // 是否有设备连接
    isLoading, // 是否正在加载
    refreshDevices, // 刷新设备列表
    selectDevice, // 选择设备
    connectDevice, // 连接设备
    disconnectDevice, // 断开设备连接
  } = useDevice();

  return (
    <div>
      <button onClick={refreshDevices}>刷新设备</button>
      {devices.map((device) => (
        <div key={device.id} onClick={() => selectDevice(device.id)}>
          {device.name}
        </div>
      ))}
    </div>
  );
}
```

### 直接访问 window.electronAPI 示例

```typescript
function MyComponent() {
  const handleOperation = async () => {
    const devices = await window.electronAPI.device.getAllDevices();
    window.electronAPI.logger.info("获取设备列表成功", {
      count: devices.length,
    });
  };
  return <button onClick={handleOperation}>执行操作</button>;
}
```

---

## 🔧 类型定义

### 核心接口

```typescript
// 设备相关类型
interface Device {
  id: string;
  name: string;
  model: string;
  version: string;
  isRooted: boolean;
  connectionType: "usb" | "wifi";
}

// API 响应类型
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: number;
}

// 文件过滤器类型
interface FileFilter {
  name: string;
  extensions: string[];
}

// 进度回调类型
type ProgressCallback = (progress: number) => void;

// OTA 解析选项
interface OnlineOTAParserOptions {
  timeout?: number;
  maxRetries?: number;
  chunkSize?: number;
}
```

---

## 🚀 使用示例

### 完整的设备管理示例

```typescript
import React, { useState, useEffect } from "react";

function DeviceManagerExample() {
  const device = window.electronAPI.device;
  const app = window.electronAPI.app;
  const logger = window.electronAPI.logger;
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [apps, setApps] = useState([]);

  // 加载设备列表
  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    try {
      const deviceList = await device.getAllDevices();
      setDevices(deviceList);
      logger.info("设备列表加载成功", { count: deviceList.length });
    } catch (error) {
      logger.error("加载设备失败", { error: error.message });
    }
  };

  const loadApps = async (deviceId) => {
    try {
      const appList = await app.getApplications(deviceId);
      setApps(appList);
      logger.info("应用列表加载成功", { deviceId, count: appList.length });
    } catch (error) {
      logger.error("加载应用失败", { deviceId, error: error.message });
    }
  };

  const handleDeviceSelect = async (device) => {
    setSelectedDevice(device);
    await loadApps(device.id);
  };

  const installApp = async (apkPath) => {
    if (!selectedDevice) return;

    try {
      const ok = await app.install(apkPath, selectedDevice.id);
      if (ok) {
        logger.info("应用安装成功");
        await loadApps(selectedDevice.id);
      } else {
        logger.error("应用安装失败");
      }
    } catch (error) {
      logger.error("安装过程出错", { error: error.message });
    }
  };

  return (
    <div>
      <h2>设备管理器</h2>

      <button onClick={loadDevices}>刷新设备</button>

      <div>
        <h3>连接的设备:</h3>
        {devices.map((dev) => (
          <div
            key={dev.id}
            onClick={() => handleDeviceSelect(dev)}
            style={{
              padding: "10px",
              border:
                selectedDevice?.id === dev.id
                  ? "2px solid blue"
                  : "1px solid gray",
              margin: "5px",
              cursor: "pointer",
            }}
          >
            <div>
              <strong>{dev.name}</strong>
            </div>
            <div>型号: {dev.model}</div>
            <div>版本: {dev.version}</div>
            <div>Root: {dev.isRooted ? "是" : "否"}</div>
          </div>
        ))}
      </div>

      {selectedDevice && (
        <div>
          <h3>设备 {selectedDevice.name} 的应用:</h3>
          <button onClick={() => loadApps(selectedDevice.id)}>刷新应用</button>

          {apps.map((application) => (
            <div
              key={application.packageName}
              style={{
                padding: "5px",
                border: "1px solid #ddd",
                margin: "2px",
              }}
            >
              <div>
                <strong>{application.name}</strong>
              </div>
              <div>包名: {application.packageName}</div>
              <div>版本: {application.version}</div>
              <div>大小: {(application.size / 1024 / 1024).toFixed(2)} MB</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### OTA 解析示例（更新为 OnlineOTAParserController）

```typescript
import React, { useState } from "react";
import {
  extractPartitionFromUrl,
  extractPartitionFileFromZip,
  downloadPartitionFile,
} from "../Controllers/OnlineOTAParserController";

function OTAParserExample() {
  const [url, setUrl] = useState("");
  const [partition, setPartition] = useState("boot");
  const [outputPath, setOutputPath] = useState("./extracted.img");
  const [progress, setProgress] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);

  const handleExtract = async () => {
    if (!url) return;

    setIsExtracting(true);
    setProgress(0);

    try {
      const ok = await extractPartitionFromUrl(url, partition, outputPath);
      if (ok) alert("提取成功！");
      else alert("提取失败");
    } catch (error) {
      alert(`提取过程出错: ${error.message}`);
    } finally {
      setIsExtracting(false);
      setProgress(0);
    }
  };

  return (
    <div>
      <h2>OTA 分区提取器</h2>

      <div>
        <label>
          OTA URL:
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/firmware.zip"
            style={{ width: "400px" }}
          />
        </label>
      </div>

      <div>
        <label>
          分区类型:
          <select
            value={partition}
            onChange={(e) => setPartition(e.target.value)}
          >
            <option value="boot">boot</option>
            <option value="recovery">recovery</option>
            <option value="system">system</option>
            <option value="vendor">vendor</option>
          </select>
        </label>
      </div>

      <div>
        <label>
          输出路径:
          <input
            type="text"
            value={outputPath}
            onChange={(e) => setOutputPath(e.target.value)}
          />
        </label>
      </div>

      <button onClick={handleExtract} disabled={isExtracting || !url}>
        {isExtracting ? "提取中..." : "开始提取"}
      </button>

      {isExtracting && (
        <div>
          <div>进度: {progress.toFixed(1)}%</div>
          <progress value={progress} max={100} />
        </div>
      )}
    </div>
  );
}
```

---

## 📚 错误处理

### 统一错误响应格式

所有 API 都遵循统一的错误响应格式：

```typescript
interface ErrorResponse {
  success: false;
  error: string; // 错误描述
  code?: string; // 错误代码
  details?: any; // 错误详情
  timestamp: number; // 错误时间戳
}
```

### 常见错误代码

| 错误代码            | 描述       | 解决方案                 |
| ------------------- | ---------- | ------------------------ |
| `DEVICE_NOT_FOUND`  | 设备未找到 | 检查设备连接和 USB 调试  |
| `PERMISSION_DENIED` | 权限不足   | 检查设备授权和 Root 权限 |
| `FILE_NOT_FOUND`    | 文件不存在 | 验证文件路径是否正确     |
| `NETWORK_ERROR`     | 网络错误   | 检查网络连接             |
| `PARSE_ERROR`       | 解析错误   | 验证文件格式是否正确     |
| `TIMEOUT`           | 操作超时   | 增加超时时间或重试       |

---

注意事项：

- 在线 Range 依赖源站；不支持时请改为完整下载。
- 本地超大 ZIP 使用 yauzl 流式，仅匹配 payload.bin 与 \*.img 常见命名。

**最后更新**: 2025 年 8 月 14 日
