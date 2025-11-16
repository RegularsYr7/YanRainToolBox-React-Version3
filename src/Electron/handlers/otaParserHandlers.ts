/**
 * OTA Parser IPC Handlers
 *
 * 处理在线OTA解析相关的IPC通信
 */

import { ipcMain } from "electron";
import { createOnlineOTAParser } from "../composables/useOnlineOTAParser";

export function setupOTAParserHandlers() {
  const otaParser = createOnlineOTAParser();

  /**
   * 从ZIP中提取分区文件
   */
  ipcMain.handle(
    "ota:extract-partition-from-zip",
    async (
      _event,
      zipUrl: string,
      partitionFileName: string,
      outputPath: string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const success = await otaParser.extractPartitionFileFromZip(
          zipUrl,
          partitionFileName,
          outputPath
        );
        return { success };
      } catch (error) {
        console.error("❌ 从ZIP提取分区失败:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  /**
   * 从URL提取分区（OTA包）
   */
  ipcMain.handle(
    "ota:extract-partition-from-url",
    async (
      _event,
      url: string,
      partitionName: string,
      outputPath: string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const success = await otaParser.extractPartitionFromUrl(
          url,
          partitionName,
          outputPath
        );
        return { success };
      } catch (error) {
        console.error("❌ 从URL提取分区失败:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  /**
   * 智能提取分区（自动检测文件类型）
   */
  ipcMain.handle(
    "ota:smart-extract-partition",
    async (
      _event,
      urlOrPath: string,
      partitionName: string,
      outputPath: string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const success = await otaParser.smartExtractPartition(
          urlOrPath,
          partitionName,
          outputPath
        );
        return { success };
      } catch (error) {
        console.error("❌ 智能提取分区失败:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  /**
   * 直接下载分区文件
   */
  ipcMain.handle(
    "ota:download-partition",
    async (
      _event,
      url: string,
      outputPath: string
    ): Promise<{
      success: boolean;
      error?: string;
    }> => {
      try {
        const success = await otaParser.downloadPartitionFile(url, outputPath);
        return { success };
      } catch (error) {
        console.error("❌ 下载分区文件失败:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  /**
   * 自定义分区提取（URL 或本地 ZIP/路径）- 别名
   */
  ipcMain.handle(
    "ota:custom-extract",
    async (
      _event,
      urlOrPath: string,
      partitionName: string,
      outputPath: string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const success = await otaParser.smartExtractPartition(
          urlOrPath,
          partitionName,
          outputPath
        );
        return { success };
      } catch (error) {
        console.error("❌ 自定义提取分区失败:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  console.log("✅ OTA Parser IPC handlers registered");
}
