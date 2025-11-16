/**
 * Magisk Boot 修补 IPC Handlers
 *
 * 处理主进程与渲染进程之间的 Magisk Boot 修补相关通信
 */

import { ipcMain } from "electron";
import { createMagiskBoot } from "../composables/useMagiskBoot";
import { Logger } from "../utils/logger";

/**
 * 设置 Magisk Boot 修补 IPC handlers
 */
export function setupMagiskBootHandlers() {
  Logger.info("[MagiskBootHandlers] 注册 Magisk Boot 修补 IPC handlers");

  // 执行 Boot 修补
  ipcMain.handle(
    "boot:patch",
    async (_event, bootPath: string, magiskPath: string) => {
      try {
        Logger.info("[MagiskBootHandlers] 开始执行 Boot 修补", {
          bootPath,
          magiskPath,
        });

        const magiskBoot = createMagiskBoot();
        await magiskBoot.patchBoot(bootPath, magiskPath);

        return {
          success: true,
          message: "Boot 修补完成",
        };
      } catch (error) {
        Logger.error("[MagiskBootHandlers] Boot 修补失败:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Boot 修补失败",
        };
      }
    }
  );

  // Boot 镜像头部快速检测
  ipcMain.handle(
    "boot:inspect",
    async (
      _event,
      imgPath: string
    ): Promise<{
      magic: string;
      size: number;
      kernelSize?: number;
      ramdiskSize?: number;
      note?: string;
    }> => {
      try {
        const fs = await import("fs/promises");
        const fh = await fs.open(imgPath, "r");
        const buf = Buffer.alloc(0x1000);
        const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
        const stat = await fh.stat();
        await fh.close();

        const magic = buf.slice(0, 8).toString("ascii");
        let kernelSize: number | undefined;
        let ramdiskSize: number | undefined;
        let note: string | undefined;

        if (magic.startsWith("ANDROID!")) {
          // Android boot header v0/v1/v2/v3：前 8 字节为 ANDROID!
          // 为安全起见仅做最基础解读，避免跨平台字节序误差（LE）
          const readU32LE = (off: number) =>
            buf.readUInt32LE(off < bytesRead ? off : 0);
          try {
            kernelSize = readU32LE(0x08);
            ramdiskSize = readU32LE(0x0c);
            // 粗略判断 header 版本（仅提示性质）
            const headerVersion = buf.readUInt32LE(0x20);
            if (headerVersion === 3) {
              note = "Android boot header v3 (Android 9+ / GKI 可能)";
            } else if (headerVersion === 2) {
              note = "Android boot header v2";
            } else if (headerVersion === 1) {
              note = "Android boot header v1";
            } else {
              note = "Android boot header v0/v?";
            }
          } catch {
            /* ignore */
          }
        } else if (magic.startsWith("VNDRBOOT")) {
          note = "Vendor Boot 镜像";
        } else {
          note = "未知或非标准 ANDROID!/VNDRBOOT 头";
        }

        return {
          magic: magic.replace(/[^\x20-\x7E]/g, "."),
          size: stat.size,
          kernelSize,
          ramdiskSize,
          note,
        };
      } catch (error) {
        Logger.error("[MagiskBootHandlers] Boot 镜像检测失败:", error);
        throw error;
      }
    }
  );

  Logger.info("[MagiskBootHandlers] Magisk Boot 修补 IPC handlers 注册完成");
}
