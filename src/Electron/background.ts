import { app, BrowserWindow, Menu } from "electron";
import { join, dirname } from "path";
import { setupIpcHandlers } from "./handlers";

// 设置控制台输出编码为 UTF-8（Windows 环境）
if (process.platform === "win32") {
  process.stdout.setDefaultEncoding?.("utf8");
  process.stderr.setDefaultEncoding?.("utf8");
}

// 获取当前文件的目录路径 (在 CommonJS 环境中)
const __dirname = dirname(__filename);

// 禁用一些不需要的功能来减少警告
app.commandLine.appendSwitch("--disable-features", "VizDisplayCompositor");
app.commandLine.appendSwitch("--disable-gpu-sandbox");
app.commandLine.appendSwitch("--no-sandbox");

app.whenReady().then(() => {
  // 初始化 IPC 处理器
  setupIpcHandlers();

  const mainWindow: BrowserWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    maximizable: false,
    minWidth: 1130,
    minHeight: 770,
    maxWidth: 1300,
    maxHeight: 840,
    center: true,
    resizable: true,
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      partition: "nopersist",
      preload: join(__dirname, "preload.js"),
      backgroundThrottling: false,
    },
  });

  // 设置宽高比例锁定，保持 1100:750 的比例 (约 1.47:1)
  mainWindow.setAspectRatio(1100 / 750);

  Menu.setApplicationMenu(null);

  if (process.argv[2]) {
    mainWindow.loadURL(process.argv[2]);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile("index.html");
  }
});
