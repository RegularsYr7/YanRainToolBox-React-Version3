/**
 * ZIP 文件处理器 (纯函数式)
 * 支持本地和远程 ZIP 文件的处理
 * 提供文件列表、提取等功能
 */

import AdmZip from "adm-zip";
import { promises as fs } from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { createHttpFile, HttpFile } from "./HttpFile";
import type { ZipHandlerOptions } from "../../types/ota";

/**
 * ZIP 文件信息接口
 */
export interface ZipFileInfo {
  name: string;
  size: number;
  compressedSize: number;
  method: string;
  crc: number;
  time: Date;
}

/**
 * ZIP 统计信息接口
 */
export interface ZipStats {
  totalFiles: number;
  totalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

/**
 * ZIP 处理器状态接口
 */
interface ZipHandlerState {
  source: string;
  isRemote: boolean;
  httpFile?: ReturnType<typeof createHttpFile> | HttpFile;
  zip?: AdmZip;
  options: Required<ZipHandlerOptions>;
  tempFilePath?: string;
}

/**
 * 检查缓存文件是否有效
 */
async function isCacheValid(
  tempFilePath: string | undefined,
  httpFile: ReturnType<typeof createHttpFile> | HttpFile | undefined
): Promise<boolean> {
  if (!tempFilePath || !httpFile) {
    return false;
  }

  try {
    // 检查本地文件是否存在
    const stats = await fs.stat(tempFilePath);

    // 检查文件大小是否匹配
    const remoteSize = httpFile.getSize();
    if (stats.size !== remoteSize) {
      return false;
    }

    // 检查文件修改时间（可选）
    const lastModified = await httpFile.getLastModified();
    if (lastModified && stats.mtime < lastModified) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * 初始化本地 ZIP 文件
 */
async function initializeLocalZip(state: ZipHandlerState): Promise<boolean> {
  try {
    // 检查文件是否存在
    await fs.access(state.source);

    // 加载 ZIP 文件
    state.zip = new AdmZip(state.source);
    state.options.onProgress(100, "ZIP文件加载完成");

    return true;
  } catch (error) {
    console.error("加载本地ZIP文件失败:", error);
    return false;
  }
}

/**
 * 初始化远程 ZIP 文件
 */
async function initializeRemoteZip(state: ZipHandlerState): Promise<boolean> {
  try {
    state.httpFile = createHttpFile(state.source, {
      onProgress: (downloaded, total) => {
        const progress = total > 0 ? (downloaded / total) * 80 : 0;
        state.options.onProgress(
          progress,
          `下载ZIP文件: ${downloaded}/${total} 字节`
        );
      },
    });

    // 初始化 HTTP 文件
    const initialized = await state.httpFile.initialize();
    if (!initialized) {
      throw new Error("无法初始化远程ZIP文件");
    }

    // 如果启用缓存，先检查缓存文件
    if (state.options.useCache) {
      // 确保缓存目录存在
      try {
        await fs.mkdir(state.options.cacheDir, { recursive: true });
      } catch {
        // 目录可能已存在，忽略错误
      }

      const fileName =
        path.basename(new URL(state.source).pathname) || "remote.zip";
      state.tempFilePath = path.join(state.options.cacheDir, fileName);

      // 检查缓存文件是否存在且有效
      if (await isCacheValid(state.tempFilePath, state.httpFile)) {
        state.zip = new AdmZip(state.tempFilePath);
        state.options.onProgress(100, "ZIP文件从缓存加载完成");
        return true;
      }
    } else {
      // 不使用缓存，创建临时文件
      state.tempFilePath = path.join(
        state.options.cacheDir,
        `temp_${uuidv4()}.zip`
      );
    }

    // 下载 ZIP 文件
    state.options.onProgress(10, "开始下载ZIP文件...");
    const downloaded = await state.httpFile.download(state.tempFilePath!);

    if (!downloaded) {
      throw new Error("下载ZIP文件失败");
    }

    // 加载下载的 ZIP 文件
    state.zip = new AdmZip(state.tempFilePath);
    state.options.onProgress(100, "ZIP文件下载并加载完成");

    return true;
  } catch (error) {
    console.error("初始化远程ZIP文件失败:", error);
    return false;
  }
}

/**
 * 创建 ZIP 处理器
 *
 * @param source - ZIP 文件路径或 URL
 * @param options - ZIP 处理配置选项
 * @returns ZIP 处理器方法集合
 *
 * @example
 * ```ts
 * const handler = createZipHandler("https://example.com/rom.zip");
 * await handler.initialize();
 * const files = handler.getFileList();
 * await handler.extractFile("boot.img", "/tmp/boot.img");
 * ```
 */
export function createZipHandler(
  source: string,
  options: ZipHandlerOptions = {}
) {
  // 内部状态
  const state: ZipHandlerState = {
    source,
    isRemote: source.startsWith("http://") || source.startsWith("https://"),
    options: {
      useCache: options.useCache !== false,
      cacheDir: options.cacheDir || "./temp",
      onProgress: options.onProgress || (() => {}),
    },
  };

  /**
   * 初始化 ZIP 处理器
   *
   * @returns 初始化是否成功
   */
  async function initialize(): Promise<boolean> {
    try {
      if (state.isRemote) {
        return await initializeRemoteZip(state);
      } else {
        return await initializeLocalZip(state);
      }
    } catch (error) {
      console.error("初始化ZIP处理器失败:", error);
      return false;
    }
  }

  /**
   * 获取 ZIP 文件中的文件列表
   *
   * @returns 文件列表
   */
  function getFileList(): string[] {
    if (!state.zip) {
      throw new Error("ZIP文件未初始化");
    }

    return state.zip
      .getEntries()
      .filter((entry) => !entry.isDirectory)
      .map((entry) => entry.entryName);
  }

  /**
   * 查找指定文件
   *
   * @param fileName - 文件名或文件名模式
   * @param exactMatch - 是否精确匹配
   * @returns 匹配的文件名列表
   */
  function findFiles(fileName: string, exactMatch: boolean = false): string[] {
    const fileList = getFileList();

    if (exactMatch) {
      return fileList.filter((file) => path.basename(file) === fileName);
    } else {
      // 支持通配符匹配
      const pattern = fileName.toLowerCase();
      return fileList.filter((file) =>
        path.basename(file).toLowerCase().includes(pattern)
      );
    }
  }

  /**
   * 提取指定文件
   *
   * @param fileName - 要提取的文件名
   * @param outputPath - 输出路径（可选）
   * @returns 提取的文件数据或文件路径
   */
  async function extractFile(
    fileName: string,
    outputPath?: string
  ): Promise<Buffer | string> {
    if (!state.zip) {
      throw new Error("ZIP文件未初始化");
    }

    const entry = state.zip.getEntry(fileName);
    if (!entry) {
      throw new Error(`文件不存在: ${fileName}`);
    }

    const data = state.zip.readFile(entry);
    if (!data) {
      throw new Error(`无法读取文件: ${fileName}`);
    }

    if (outputPath) {
      // 确保输出目录存在
      try {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
      } catch {
        // 目录可能已存在，忽略错误
      }

      // 写入文件
      await fs.writeFile(outputPath, data);
      state.options.onProgress(100, `文件已提取到: ${outputPath}`);

      return outputPath;
    } else {
      // 返回数据
      return data;
    }
  }

  /**
   * 提取所有文件到指定目录
   *
   * @param outputDir - 输出目录
   * @param fileFilter - 文件过滤器（可选）
   * @returns 提取是否成功
   */
  async function extractAll(
    outputDir: string,
    fileFilter?: (fileName: string) => boolean
  ): Promise<boolean> {
    if (!state.zip) {
      throw new Error("ZIP文件未初始化");
    }

    try {
      try {
        await fs.mkdir(outputDir, { recursive: true });
      } catch {
        // 目录可能已存在，忽略错误
      }

      const entries = state.zip.getEntries();
      const filesToExtract = entries.filter((entry) => {
        if (entry.isDirectory) return false;
        if (fileFilter) return fileFilter(entry.entryName);
        return true;
      });

      for (let i = 0; i < filesToExtract.length; i++) {
        const entry = filesToExtract[i];
        const outputPath = path.join(outputDir, entry.entryName);

        // 确保目录存在
        try {
          await fs.mkdir(path.dirname(outputPath), {
            recursive: true,
          });
        } catch {
          // 目录可能已存在，忽略错误
        }

        // 提取文件
        const data = state.zip.readFile(entry);
        if (data) {
          await fs.writeFile(outputPath, data);
        }

        // 更新进度
        const progress = ((i + 1) / filesToExtract.length) * 100;
        state.options.onProgress(progress, `已提取: ${entry.entryName}`);
      }

      return true;
    } catch (error) {
      console.error("提取所有文件失败:", error);
      return false;
    }
  }

  /**
   * 获取文件信息
   *
   * @param fileName - 文件名
   * @returns 文件信息或 null
   */
  function getFileInfo(fileName: string): ZipFileInfo | null {
    if (!state.zip) {
      throw new Error("ZIP文件未初始化");
    }

    const entry = state.zip.getEntry(fileName);
    if (!entry) {
      return null;
    }

    return {
      name: entry.entryName,
      size: entry.header.size,
      compressedSize: entry.header.compressedSize,
      method: entry.header.method === 0 ? "Stored" : "Deflated",
      crc: entry.header.crc,
      time: entry.header.time,
    };
  }

  /**
   * 检查文件是否存在
   *
   * @param fileName - 文件名
   * @returns 文件是否存在
   */
  function hasFile(fileName: string): boolean {
    if (!state.zip) {
      return false;
    }

    return state.zip.getEntry(fileName) !== null;
  }

  /**
   * 获取 ZIP 文件统计信息
   *
   * @returns 统计信息
   */
  function getStats(): ZipStats {
    if (!state.zip) {
      throw new Error("ZIP文件未初始化");
    }

    const entries = state.zip
      .getEntries()
      .filter((entry) => !entry.isDirectory);
    const totalSize = entries.reduce(
      (sum, entry) => sum + entry.header.size,
      0
    );
    const compressedSize = entries.reduce(
      (sum, entry) => sum + entry.header.compressedSize,
      0
    );

    return {
      totalFiles: entries.length,
      totalSize,
      compressedSize,
      compressionRatio: totalSize > 0 ? compressedSize / totalSize : 0,
    };
  }

  /**
   * 清理临时文件
   */
  async function cleanup(): Promise<void> {
    if (state.tempFilePath && !state.options.useCache) {
      try {
        await fs.unlink(state.tempFilePath);
        console.log("临时文件已清理:", state.tempFilePath);
      } catch (error) {
        console.warn("清理临时文件失败:", error);
      }
    }
  }

  /**
   * 释放资源
   */
  async function dispose(): Promise<void> {
    await cleanup();
    state.zip = undefined;
    state.httpFile = undefined;
  }

  return {
    initialize,
    getFileList,
    findFiles,
    extractFile,
    extractAll,
    getFileInfo,
    hasFile,
    getStats,
    cleanup,
    dispose,
  };
}

/**
 * 创建并初始化 ZIP 处理器（便捷方法）
 *
 * @param source - ZIP 文件路径或 URL
 * @param options - ZIP 处理配置选项
 * @returns 已初始化的 ZIP 处理器
 *
 * @example
 * ```ts
 * const handler = await createAndInitializeZipHandler(
 *   "https://example.com/rom.zip"
 * );
 * const files = handler.getFileList();
 * ```
 */
export async function createAndInitializeZipHandler(
  source: string,
  options: ZipHandlerOptions = {}
) {
  const handler = createZipHandler(source, options);
  const success = await handler.initialize();
  if (!success) {
    throw new Error("Failed to initialize ZIP handler");
  }
  return handler;
}

/**
 * 向后兼容的 ZipHandler 类
 *
 * @deprecated 建议直接使用 createZipHandler 工厂函数
 */
export class ZipHandler {
  private impl: ReturnType<typeof createZipHandler>;

  constructor(source: string, options: ZipHandlerOptions = {}) {
    this.impl = createZipHandler(source, options);
  }

  async initialize(): Promise<boolean> {
    return this.impl.initialize();
  }

  getFileList(): string[] {
    return this.impl.getFileList();
  }

  findFiles(fileName: string, exactMatch: boolean = false): string[] {
    return this.impl.findFiles(fileName, exactMatch);
  }

  async extractFile(
    fileName: string,
    outputPath?: string
  ): Promise<Buffer | string> {
    return this.impl.extractFile(fileName, outputPath);
  }

  async extractAll(
    outputDir: string,
    fileFilter?: (fileName: string) => boolean
  ): Promise<boolean> {
    return this.impl.extractAll(outputDir, fileFilter);
  }

  getFileInfo(fileName: string): ZipFileInfo | null {
    return this.impl.getFileInfo(fileName);
  }

  hasFile(fileName: string): boolean {
    return this.impl.hasFile(fileName);
  }

  getStats(): ZipStats {
    return this.impl.getStats();
  }

  async cleanup(): Promise<void> {
    return this.impl.cleanup();
  }

  async dispose(): Promise<void> {
    return this.impl.dispose();
  }
}
