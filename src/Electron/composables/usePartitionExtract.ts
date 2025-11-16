/**
 * 分区提取 Composable (函数式重构版)
 *
 * 从 PartitionExtractService 迁移而来
 * 提供统一的分区提取接口，内部调用 OnlineOTAParser
 */

import type { OnlineOTAParserOptions } from "../types/ota";
import { createOnlineOTAParser } from "./useOnlineOTAParser";

export type ExtractOptions = OnlineOTAParserOptions & {
  // 未来可扩展自定义策略
};

/**
 * 创建分区提取器
 *
 * @param options 提取选项
 * @returns 分区提取函数
 */
export function createPartitionExtractor(options?: ExtractOptions) {
  const otaParser = createOnlineOTAParser(options);

  /**
   * 提取分区
   * 智能检测文件类型（URL、本地ZIP、本地文件）并自动选择最佳提取方案
   *
   * @param urlOrPath URL地址或本地文件路径
   * @param partitionName 分区名称（如：boot、system、vendor等）
   * @param outputPath 输出文件路径
   * @returns 是否提取成功
   */
  async function extractPartition(
    urlOrPath: string,
    partitionName: string,
    outputPath: string
  ): Promise<boolean> {
    return otaParser.smartExtractPartition(
      urlOrPath,
      partitionName,
      outputPath
    );
  }

  return {
    extractPartition,
  };
}
