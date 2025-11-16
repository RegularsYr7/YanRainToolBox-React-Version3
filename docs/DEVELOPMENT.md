# 开发指南

**YanRainToolBox React v3 - 完整开发指南**

> 🎯 **目标**: 为开发者提供全面的开发环境配置、API 使用、架构设计等技术指导

---

## 🚀 快速开始（与当前仓库一致）

### 环境要求

- **Node.js**: >= 18.0.0 (推荐 18.17.0+)
- **pnpm**: >= 8.0.0 (推荐最新版本)
- **Git**: 最新版本

### 安装与启动

```powershell
# 克隆与进入目录（示例）
git clone <repository-url>
cd YanRainToolBox_React_v3

# 安装依赖
pnpm install

# 开发模式（Vite + 自动拉起 Electron）
pnpm run dev
```

### 构建发布

本项目使用自定义 Vite 插件在 build 阶段调用 electron-builder：

```powershell
# 按平台构建（推荐）
pnpm run build:win
pnpm run build:mac
pnpm run build:linux

# 或标准构建（根据当前平台）
pnpm run build
```

构建产物默认输出到 releases/。

---

## 🏗️ 项目架构

### 技术栈

- 前端：React 19 + TypeScript + Vite + Tailwind
- 桌面端：Electron 37（主/渲染/预加载）
- 状态：React 内置（useState/useEffect/Context）
- 构建：Vite 7 + esbuild；生产阶段通过插件驱动 electron-builder 26

### 目录结构

```
src/
├── App.tsx                    # 主应用组件
├── main.tsx                   # React 入口
├── index.css                  # 全局样式
├── components/                # React 组件
│   ├── Device/               # 设备管理组件
│   ├── Navigation/           # 导航组件
│   ├── TitleBar/            # 标题栏组件
│   └── Tools/               # 工具组件
├── Controllers/              # 业务逻辑控制器（与 Services 配合）
│   ├── ApplicationManagementController.ts
│   ├── BackupImageController.ts
│   ├── BootPatchController.ts
│   ├── MagiskBootController.ts
│   ├── OnlineOTAParserController.ts
│   └── LinkExtractorController.ts
├── Services/                # 核心服务层（数据/系统交互）
│   ├── ApplicationManagementService.ts
│   ├── BackupImageService.ts
│   ├── BootPatchService.ts
│   ├── MagiskBootService.ts
│   ├── OnlineOTAParserService.ts   # OTA 在线/本地智能解析（Range + yauzl）
│   ├── OnlineZipParserService.ts   # 在线 ZIP 中央目录解析（支持 ZIP64）
│   ├── HttpFileService.ts          # HEAD/Range/流式下载封装
│   ├── ZipHandlerService.ts        # 本地/远程 ZIP（AdmZip）便捷封装
│   └── LinkExtractorService.ts
├── Electron/                # Electron 相关（安全与打包）
│   ├── background.ts        # 主进程
│   ├── preload.ts          # 预加载脚本
│   ├── ipcHandlers.ts      # IPC 处理器（与预加载 API 对应）
│   └── electron.config.ts  # 配置文件
├── Utils/                   # 工具函数（路径/命令/日志/文件）
│   ├── command.ts          # 命令执行（统一封装）
│   ├── file.ts             # 文件操作
│   ├── logger.ts           # 日志系统
│   └── paths.ts            # 路径管理
├── types/                   # 类型定义
│   └── electron.d.ts       # Electron 类型
├── View/                    # 页面组件
│   ├── HomePage.tsx
│   ├── ToolsPage.tsx
│   ├── AppManagerPage.tsx
│   └── BootPatchPage.tsx
└── Examples/                # 使用示例
    └── electronUsage.ts     # Electron API 示例
```

---

## 🔒 安全架构（Electron Preload 对齐实现）

### 核心安全特性

YanRainToolBox 采用**零信任安全模型**，确保每一层都有独立的安全防护：

```
🌐 渲染进程 (React)     ←→ 🔒 Context Bridge  ←→ 📡 Preload 脚本  ←→ 🛡️ IPC 验证  ←→ 🖥️ 主进程
   (Web 环境)                 (安全桥梁)           (隔离层)         (验证层)       (系统权限)
```

### 安全配置

#### 主进程安全设置（background.ts）

```typescript
const createWindow = () => {
  const mainWindow = new BrowserWindow({
    webPreferences: {
      nodeIntegration: false, // 🔐 禁用Node.js集成
      contextIsolation: true, // 🛡️ 启用上下文隔离
      webSecurity: true, // 🔒 启用Web安全
      preload: join(__dirname, "preload.js"),
    },
  });
};
```

#### 预加载脚本安全 API（preload.ts）

```typescript
import { contextBridge, ipcRenderer } from "electron";

// 安全地暴露API到渲染进程
// 仅展示关键分组，详见 src/Electron/preload.ts
contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  device: {
    getAllDevices: () => ipcRenderer.invoke("device:get-all-devices"),
    reboot: (sn: string, mode: string) =>
      ipcRenderer.invoke("device:reboot", sn, mode),
    startWatching: () => ipcRenderer.invoke("device:start-watching"),
  },
  app: {
    getApplications: (sn?: string) =>
      ipcRenderer.invoke("app:get-applications", sn),
    install: (apkPath: string, sn?: string) =>
      ipcRenderer.invoke("app:install", apkPath, sn),
  },
  ota: {
    extractPartitionFromUrl: (
      url: string,
      part: string,
      out: string,
      options?: any
    ) =>
      ipcRenderer.invoke(
        "ota:extract-partition-from-url",
        url,
        part,
        out,
        options
      ),
  },
  fs: {
    selectFile: (filters?: Electron.FileFilter[]) =>
      ipcRenderer.invoke("fs:select-file", filters),
  },
});
```

提示：API 数量以实际代码为准，详见 docs/API_REFERENCE.md。

---

## 🌍 多平台支持与工具路径

### 支持的平台

| 平台                    | 支持状态    | 测试状态    | 特性完整度 |
| ----------------------- | ----------- | ----------- | ---------- |
| **Windows 10/11**       | ✅ 完全支持 | ✅ 充分测试 | 100%       |
| **macOS (Intel)**       | ✅ 完全支持 | ✅ 充分测试 | 100%       |
| **macOS (Apple M1/M2)** | ✅ 完全支持 | ✅ 充分测试 | 100%       |
| **Linux (Ubuntu)**      | ✅ 完全支持 | ✅ 充分测试 | 100%       |

### 工具路径管理

项目通过 Utils/paths 提供平台判断与工具路径：

```typescript
// 自动平台检测
import { getAdbPath, getFastbootPath, pathManager } from "../src/Utils/paths";
const platform = pathManager.platform; // windows | darwin | linux
const adbPath = await getAdbPath();
const fastbootPath = await getFastbootPath();
```

### 工具目录结构

```
tools/
├── windows/     # Windows 平台工具 (14个文件)
│   ├── adb.exe
│   ├── fastboot.exe
│   ├── AdbWinApi.dll
│   └── ...
├── darwin/      # macOS 平台工具
│   ├── adb
│   ├── fastboot
│   └── ...
└── linux/       # Linux 平台工具
    ├── adb
    ├── fastboot
    └── ...
```

---

## 🛠️ 核心功能开发（关键场景）

### 设备管理

#### 基本用法

```typescript
function DeviceManager() {
  const device = window.electronAPI.device;

  const checkDevices = async () => {
    const devices = await device.getAllDevices();
    console.log("连接的设备:", devices);
  };

  return <button onClick={checkDevices}>检查设备</button>;
}
```

#### API 参考

```typescript
// 获取连接的设备列表
const devices = await window.electronAPI.device.getAllDevices();

// 获取设备详细信息
const deviceInfo = await window.electronAPI.device.getDeviceInfo();

// 检查Root状态
const isRooted = await window.electronAPI.device.checkRoot();

// 重启设备
await window.electronAPI.device.reboot(deviceId, "system");
```

### 应用管理

#### 基本用法

```typescript
function AppManager() {
  const [apps, setApps] = useState([]);

  const loadApps = async () => {
    const installedApps = await window.electronAPI.app.getApplications(
      deviceId
    );
    setApps(installedApps);
  };

  const installApp = async (apkPath: string) => {
    const result = await window.electronAPI.app.install(apkPath, deviceId);
    if (result.success) {
      await loadApps(); // 刷新应用列表
    }
  };

  return (
    <div>
      <button onClick={loadApps}>加载应用</button>
      {apps.map((app) => (
        <div key={app.packageName}>{app.name}</div>
      ))}
    </div>
  );
}
```

### OTA 解析器（在线/本地智能提取）

#### 基本用法

```typescript
import {
  extractPartitionFromUrl,
  extractPartitionFileFromZip,
  downloadPartitionFile,
} from "../Controllers/OnlineOTAParserController";

// 从OTA文件提取boot分区
await extractPartitionFromUrl("https://example.com/ota.zip", "boot", "./boot.img");

// 智能下载分区（自动检测URL类型）
await extractPartitionFileFromZip("https://example.com/fw.zip", "boot.img", "./boot.img");
await downloadPartitionFile("https://example.com/boot.img", "./boot.img");

注意：
- 在线 ZIP/OTA 依赖远端支持 Range 请求；不支持时会降级提示。
- 本地超大 ZIP（>2GB）通过 yauzl 流式扫描，匹配 payload.bin 或 <partition>.img。
```

### 小米 ROM 链接提取

#### 基本用法

```typescript
import {
  extractMiuiDownloadLink,
  getRomDownloadUrl,
} from "../Controllers/LinkExtractorController";

// 从小米官方页面提取下载链接
const downloadUrl = await extractMiuiDownloadLink(
  "https://www.miui.com/download-123.html"
);

// 通过设备代码和版本获取ROM链接
const romUrl = await getRomDownloadUrl("lisa", "V14.0.3.0.SKMCNXM");
```

---

## 🏗️ 构建系统（Vite 插件 + electron-builder）

### 开发环境

```powershell
pnpm run dev          # 开发（自动启动 Electron）
pnpm run build        # 生产构建（触发 electron-builder）
pnpm run build:win    # 指定平台构建（推荐）
```

### 生产构建

```bash
# 构建前端资源
pnpm run build

# 打包Electron应用
pnpm run package

# 生成安装包 (Windows)
pnpm run dist:win

# 生成安装包 (macOS)
pnpm run dist:mac

# 生成安装包 (Linux)
pnpm run dist:linux
```

### 构建配置

#### Vite 配置（vite.config.ts 摘要）

```typescript
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(command === "serve" ? [electronDev()] : []),
    ...(command === "build" ? [ElectronBuildPlugin()] : []),
  ],
  base: "./",
}));
```

#### Electron 构建（插件内部执行）

开发：plugins/vite.electron.dev.ts 使用 esbuild 同步构建 background.cjs 与 preload.js，并在 dev server ready 后 spawn Electron。

生产：plugins/vite.electron.build.ts 会：

- 清理 dist/releases
- esbuild 构建 background.cjs 与 preload.js（target node22，format cjs）
- 准备 dist/package.json 与资源
- 根据 TARGET_PLATFORM 调用 electron-builder 生成 releases 产物

### 性能优化（要点）

#### 包体积优化

- 仅打包当前平台工具（插件在打包阶段复制 tools/<platform>）
- 在线提取使用 Range，避免完整下载
- 大 ZIP 本地通过流式解压避免 OOM

#### 启动性能

- 预加载脚本优化
- 懒加载非核心模块
- 缓存机制

---

## 🧪 测试与手动验证

### 开发测试

当前仓库以手动验证为主：

- Online OTA：提供一个含 payload.bin 的 MIUI/Android OTA ZIP，使用 extractPartitionFromUrl 提取 boot，观察控制台分区清单与进度。
- 本地大 ZIP：准备 >2GB ZIP，验证 yauzl 流式路径能找到 payload.bin 或 boot.img 并输出。

### 手动测试

1. **功能测试**: 确保所有功能正常工作
2. **性能测试**: 检查启动时间和响应速度
3. **兼容性测试**: 在不同平台上验证
4. **安全测试**: 验证 IPC 通信安全性

---

## 🐛 故障排除（常见场景）

### 常见问题

#### 1. 构建失败

```bash
# 清理缓存
pnpm run clean

# 重新安装依赖
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

#### 2. Electron 应用启动失败

- 检查预加载脚本路径
- 验证 IPC 处理器是否正确注册
- 查看开发者工具控制台错误

#### 3. 在线源不支持 Range

控制台会提示服务器不支持 Range；请改用完整下载，或更换镜像源。

#### 4. 设备连接问题

- 确保 ADB 驱动已安装
- 检查 USB 调试是否开启
- 验证设备授权状态

### 调试技巧

#### 开发者工具

```typescript
// 在开发模式下打开 DevTools（示例）
mainWindow.webContents.openDevTools();
```

#### 日志系统

```typescript
// 使用内置日志系统
window.electronAPI.logger.info("操作完成", { action: "backup" });
window.electronAPI.logger.error("操作失败");
```

---

## 📚 设计要点与亮点

- 在线 OTA 流式解析（ZIP64 + payload.bin + Range）
- 本地超大 ZIP 流式扫描（yauzl）避免内存爆炸
- 预加载安全 API 与最小权限暴露
- Vite 插件化构建，打包阶段自动选择平台

---

## 📝 最佳实践

### 代码规范

1. **TypeScript**: 严格的类型检查
2. **ESLint**: 代码质量检查
3. **Prettier**: 代码格式化
4. **文件命名**: 使用 PascalCase for 组件，camelCase for 函数

### 安全最佳实践

1. **最小权限原则**: 只暴露必要的 API
2. **输入验证**: 所有用户输入都要验证
3. **错误处理**: 不要暴露敏感错误信息
4. **定期更新**: 保持依赖包最新

### 性能最佳实践

1. **懒加载**: 大型组件使用懒加载
2. **虚拟化**: 大列表使用虚拟滚动
3. **缓存**: 合理使用缓存机制
4. **Bundle 分析**: 定期分析包大小

---

## 🤝 贡献指南

### 开发流程

1. Fork 项目
2. 创建特性分支
3. 开发并测试
4. 提交 Pull Request

### 代码提交

```bash
# 提交格式
git commit -m "feat: 添加新功能"
git commit -m "fix: 修复bug"
git commit -m "docs: 更新文档"
```

### 文档贡献

- 保持文档与代码同步
- 添加详细的 API 文档
- 提供使用示例

---

**最后更新**: 2025 年 8 月 14 日
