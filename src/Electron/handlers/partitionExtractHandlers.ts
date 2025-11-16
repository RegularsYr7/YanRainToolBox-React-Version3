/**
 * Partition Extract IPC Handlers
 *
 * 处理分区提取相关的IPC通信
 */

import { ipcMain } from "electron";
import { createPartitionExtractor } from "../composables/usePartitionExtract";
import type { ExtractOptions } from "../composables/usePartitionExtract";

export function setupPartitionExtractHandlers() {
  /**
   * 智能提取分区（统一接口）
   * 支持：
   * - 在线URL（OTA包、ZIP文件、直链）
   * - 本地文件（ZIP、payload.bin、.img）
   */
  ipcMain.handle(
    "partition:extract",
    async (
      _event,
      urlOrPath: string,
      partitionName: string,
      outputPath: string,
      options?: ExtractOptions
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const extractor = createPartitionExtractor(options);
        const success = await extractor.extractPartition(
          urlOrPath,
          partitionName,
          outputPath
        );
        return { success };
      } catch (error) {
        console.error("❌ 分区提取失败:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  console.log("✅ Partition Extract IPC handlers registered");
}
