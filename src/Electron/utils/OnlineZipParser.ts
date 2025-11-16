/**
 * 在线 ZIP 解析器 (纯函数式)
 * 支持 HTTP Range 请求，无需下载完整文件
 * 支持 ZIP64 格式
 */

import { createHttpFileStream, HttpFileStream } from "./HttpFileStream";

/**
 * ZIP 文件中央目录条目
 */
export interface ZipCentralDirectoryEntry {
  fileName: string;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  compressionMethod: number;
  crc32: number;
}

/**
 * ZIP 本地文件头
 */
interface ZipLocalFileHeader {
  fileName: string;
  compressedSize: number;
  uncompressedSize: number;
  fileNameLength: number;
  extraFieldLength: number;
  compressionMethod: number;
  dataOffset: number;
}

/**
 * 在线 ZIP 解析器状态接口
 */
interface OnlineZipParserState {
  httpStream: ReturnType<typeof createHttpFileStream> | HttpFileStream;
  centralDirectoryEntries: ZipCentralDirectoryEntry[];
  initialized: boolean;
}

/**
 * 创建在线 ZIP 解析器
 *
 * @param httpStream - HTTP 文件流实例
 * @returns ZIP 解析器方法集合
 *
 * @example
 * ```ts
 * const stream = await createAndInitializeHttpFileStream("https://example.com/file.zip");
 * const parser = createOnlineZipParser(stream);
 * await parser.initialize();
 * const files = parser.getFileList();
 * ```
 */
export function createOnlineZipParser(
  httpStream: ReturnType<typeof createHttpFileStream> | HttpFileStream
) {
  // 内部状态
  const state: OnlineZipParserState = {
    httpStream,
    centralDirectoryEntries: [],
    initialized: false,
  };

  /**
   * 解析中央目录条目
   */
  function parseCentralDirectoryEntry(
    data: Uint8Array,
    offset: number
  ): { entry: ZipCentralDirectoryEntry; entrySize: number } {
    const view = new DataView(data.buffer, data.byteOffset + offset);

    // 检查中央目录文件头签名
    const signature = view.getUint32(0, true);
    if (signature !== 0x02014b50) {
      throw new Error("Invalid central directory entry signature");
    }

    const compressionMethod = view.getUint16(10, true);
    const crc32 = view.getUint32(16, true);
    const compressedSize = view.getUint32(20, true);
    const uncompressedSize = view.getUint32(24, true);
    const fileNameLength = view.getUint16(28, true);
    const extraFieldLength = view.getUint16(30, true);
    const fileCommentLength = view.getUint16(32, true);
    const localHeaderOffset = view.getUint32(42, true);

    // 读取文件名
    const fileNameBytes = new Uint8Array(
      data.buffer,
      data.byteOffset + offset + 46,
      fileNameLength
    );
    const fileName = new TextDecoder("utf-8").decode(fileNameBytes);

    const entry: ZipCentralDirectoryEntry = {
      fileName,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      compressionMethod,
      crc32,
    };

    const entrySize =
      46 + fileNameLength + extraFieldLength + fileCommentLength;

    return { entry, entrySize };
  }

  /**
   * 查找 ZIP64 End of Central Directory 记录
   */
  async function findZip64EndOfCentralDirectory(
    eocdPosition: number
  ): Promise<number> {
    // ZIP64 End of Central Directory Locator 在 EOCD 之前 20 字节
    const zip64LocatorPosition = eocdPosition - 20;

    state.httpStream.seek(zip64LocatorPosition);
    const locatorData = await state.httpStream.read(20);
    const locatorView = new DataView(locatorData.buffer);

    // 检查 ZIP64 EOCD Locator 签名 0x07064b50
    if (locatorView.getUint32(0, true) !== 0x07064b50) {
      throw new Error("ZIP64 End of Central Directory Locator not found");
    }

    // 读取 ZIP64 EOCD 记录的位置（8字节，小端序）
    const zip64EocdOffset = Number(locatorView.getBigUint64(8, true));

    console.log(`找到ZIP64 EOCD记录位置: ${zip64EocdOffset}`);

    // 读取 ZIP64 EOCD 记录来获取正确的中央目录信息
    state.httpStream.seek(zip64EocdOffset);
    const zip64EocdData = await state.httpStream.read(56); // ZIP64 EOCD 最小 56 字节
    const zip64View = new DataView(zip64EocdData.buffer);

    // 检查 ZIP64 EOCD 签名 0x06064b50
    if (zip64View.getUint32(0, true) !== 0x06064b50) {
      throw new Error("Invalid ZIP64 End of Central Directory signature");
    }

    // 返回 ZIP64 EOCD 位置，后续解析会使用它
    return zip64EocdOffset;
  }

  /**
   * 查找 EOCD 记录（支持 ZIP64）
   */
  async function findEndOfCentralDirectory(): Promise<number> {
    const fileSize = state.httpStream.getSize();

    // 从文件末尾开始搜索 EOCD，最多搜索 65KB
    const maxSearchLength = Math.min(65536, fileSize);
    const searchStart = fileSize - maxSearchLength;

    state.httpStream.seek(searchStart);
    const searchData = await state.httpStream.read(maxSearchLength);

    // 从后往前搜索 EOCD 签名 0x06054b50
    for (let i = searchData.length - 22; i >= 0; i--) {
      const view = new DataView(
        searchData.buffer,
        searchData.byteOffset + i,
        Math.min(22, searchData.length - i)
      );
      if (view.getUint32(0, true) === 0x06054b50) {
        const eocdPosition = searchStart + i;

        // 确保有足够的数据来读取中央目录偏移（需要至少 20 字节）
        if (view.byteLength >= 20) {
          // 检查是否为 ZIP64 格式（中央目录偏移为 0xFFFFFFFF）
          const centralDirOffset = view.getUint32(16, true);
          if (centralDirOffset === 0xffffffff) {
            console.log("检测到ZIP64格式，查找ZIP64 EOCD记录");
            return await findZip64EndOfCentralDirectory(eocdPosition);
          }
        }

        return eocdPosition;
      }
    }

    throw new Error("ZIP EOCD record not found");
  }

  /**
   * 解析 ZIP 中央目录（支持 ZIP64）
   */
  async function parseCentralDirectory(): Promise<void> {
    // 读取 EOCD (End of Central Directory)
    const eocdOffset = await findEndOfCentralDirectory();

    let totalEntries: number;
    let centralDirSize: number;
    let centralDirOffset: number;

    // 检查是否为 ZIP64 格式
    state.httpStream.seek(eocdOffset);
    const eocdData = await state.httpStream.read(56); // 读取足够的数据
    const eocdView = new DataView(eocdData.buffer);

    const signature = eocdView.getUint32(0, true);

    if (signature === 0x06064b50) {
      // ZIP64 End of Central Directory
      console.log("解析ZIP64 EOCD记录");
      totalEntries = Number(eocdView.getBigUint64(32, true));
      centralDirSize = Number(eocdView.getBigUint64(40, true));
      centralDirOffset = Number(eocdView.getBigUint64(48, true));
    } else if (signature === 0x06054b50) {
      // 标准 EOCD 记录
      console.log("解析标准EOCD记录");
      totalEntries = eocdView.getUint16(10, true);
      centralDirSize = eocdView.getUint32(12, true);
      centralDirOffset = eocdView.getUint32(16, true);

      // 检查是否需要 ZIP64（值为 0xFFFFFFFF 表示需要 ZIP64）
      if (centralDirOffset === 0xffffffff) {
        throw new Error("ZIP64格式检测失败，请检查ZIP64 EOCD Locator");
      }
    } else {
      throw new Error("Invalid EOCD signature");
    }

    console.log(
      `ZIP info: ${totalEntries} entries, central dir at ${centralDirOffset}, size ${centralDirSize}`
    );

    // 读取中央目录
    state.httpStream.seek(centralDirOffset);
    const centralDirData = await state.httpStream.read(centralDirSize);

    // 解析中央目录条目
    let offset = 0;
    for (let i = 0; i < totalEntries; i++) {
      const { entry, entrySize } = parseCentralDirectoryEntry(
        centralDirData,
        offset
      );
      state.centralDirectoryEntries.push(entry);
      offset += entrySize;
    }
  }

  /**
   * 初始化 ZIP 解析器
   */
  async function initialize(): Promise<void> {
    await parseCentralDirectory();
    state.initialized = true;
  }

  /**
   * 获取文件列表
   *
   * @returns 文件名列表
   */
  function getFileList(): string[] {
    if (!state.initialized) {
      throw new Error("ZIP parser not initialized");
    }
    return state.centralDirectoryEntries.map((entry) => entry.fileName);
  }

  /**
   * 检查文件是否存在
   *
   * @param fileName - 文件名
   * @returns 文件是否存在
   */
  function hasFile(fileName: string): boolean {
    if (!state.initialized) {
      throw new Error("ZIP parser not initialized");
    }
    return state.centralDirectoryEntries.some(
      (entry) => entry.fileName === fileName
    );
  }

  /**
   * 解析本地文件头
   */
  async function parseLocalFileHeader(
    offset: number
  ): Promise<ZipLocalFileHeader> {
    state.httpStream.seek(offset);
    const headerData = await state.httpStream.read(30); // 本地文件头固定 30 字节
    const view = new DataView(headerData.buffer);

    // 检查本地文件头签名
    const signature = view.getUint32(0, true);
    if (signature !== 0x04034b50) {
      throw new Error("Invalid local file header signature");
    }

    const compressionMethod = view.getUint16(8, true);
    const compressedSize = view.getUint32(18, true);
    const uncompressedSize = view.getUint32(22, true);
    const fileNameLength = view.getUint16(26, true);
    const extraFieldLength = view.getUint16(28, true);

    // 读取文件名
    const fileNameData = await state.httpStream.read(fileNameLength);
    const fileName = new TextDecoder("utf-8").decode(fileNameData);

    // 数据开始位置 = 本地文件头(30) + 文件名长度 + 额外字段长度
    const dataOffset = offset + 30 + fileNameLength + extraFieldLength;

    return {
      fileName,
      compressedSize,
      uncompressedSize,
      fileNameLength,
      extraFieldLength,
      compressionMethod,
      dataOffset,
    };
  }

  /**
   * 获取文件的 HTTP Range 信息（用于直接下载）
   *
   * @param fileName - 文件名
   * @returns Range 信息（起始位置、结束位置、大小）
   */
  async function getFileRange(
    fileName: string
  ): Promise<{ start: number; end: number; size: number }> {
    if (!state.initialized) {
      throw new Error("ZIP parser not initialized");
    }

    const entry = state.centralDirectoryEntries.find(
      (e) => e.fileName === fileName
    );
    if (!entry) {
      throw new Error(`File '${fileName}' not found in ZIP`);
    }

    // 读取本地文件头来获取实际数据偏移
    const localHeader = await parseLocalFileHeader(entry.localHeaderOffset);

    const dataStart = localHeader.dataOffset;
    const dataEnd = dataStart + entry.compressedSize - 1;

    return {
      start: dataStart,
      end: dataEnd,
      size: entry.compressedSize,
    };
  }

  /**
   * 获取文件信息
   *
   * @param fileName - 文件名
   * @returns 文件信息或 null
   */
  function getFileInfo(fileName: string): ZipCentralDirectoryEntry | null {
    if (!state.initialized) {
      throw new Error("ZIP parser not initialized");
    }

    return (
      state.centralDirectoryEntries.find(
        (entry) => entry.fileName === fileName
      ) || null
    );
  }

  /**
   * 关闭解析器
   */
  function close(): void {
    state.httpStream.close();
  }

  return {
    initialize,
    getFileList,
    hasFile,
    getFileRange,
    getFileInfo,
    close,
  };
}

/**
 * 创建并初始化在线 ZIP 解析器（便捷方法）
 *
 * @param url - ZIP 文件 URL
 * @param progressReporter - 进度回调函数
 * @returns 已初始化的 ZIP 解析器
 *
 * @example
 * ```ts
 * const parser = await createAndInitializeOnlineZipParser(
 *   "https://example.com/rom.zip"
 * );
 * const files = parser.getFileList();
 * const range = await parser.getFileRange("boot.img");
 * ```
 */
export async function createAndInitializeOnlineZipParser(
  url: string,
  progressReporter?: (current: number, total: number) => void
) {
  const httpStream = await HttpFileStream.create(url, progressReporter);
  const parser = createOnlineZipParser(httpStream);
  await parser.initialize();
  return parser;
}

/**
 * 向后兼容的 OnlineZipParser 类
 *
 * @deprecated 建议直接使用 createOnlineZipParser 工厂函数
 */
export class OnlineZipParser {
  private impl: ReturnType<typeof createOnlineZipParser>;

  constructor(httpStream: HttpFileStream) {
    this.impl = createOnlineZipParser(httpStream);
  }

  async initialize(): Promise<void> {
    return this.impl.initialize();
  }

  getFileList(): string[] {
    return this.impl.getFileList();
  }

  hasFile(fileName: string): boolean {
    return this.impl.hasFile(fileName);
  }

  async getFileRange(
    fileName: string
  ): Promise<{ start: number; end: number; size: number }> {
    return this.impl.getFileRange(fileName);
  }

  getFileInfo(fileName: string): ZipCentralDirectoryEntry | null {
    return this.impl.getFileInfo(fileName);
  }

  close(): void {
    return this.impl.close();
  }

  static async create(
    url: string,
    progressReporter?: (current: number, total: number) => void
  ): Promise<OnlineZipParser> {
    const httpStream = await HttpFileStream.create(url, progressReporter);
    const parser = new OnlineZipParser(httpStream);
    await parser.initialize();
    return parser;
  }
}
