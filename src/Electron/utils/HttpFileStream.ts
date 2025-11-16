/**
 * HTTP 文件流 (纯函数式)
 * 模拟文件接口，支持在线解析 ZIP 和 payload.bin
 * 基于 Python payload_dumper 的 HttpFile 实现
 */

import { createHttpFile } from "./HttpFile";

/**
 * HTTP 文件流状态接口
 */
interface HttpFileStreamState {
  size: number;
  pos: number;
  httpFile: ReturnType<typeof createHttpFile>;
  totalBytes: number;
  progressReporter?: (current: number, total: number) => void;
}

/**
 * 创建 HTTP 文件流
 *
 * @param url - HTTP 文件 URL
 * @param progressReporter - 进度回调函数
 * @returns HTTP 文件流操作方法集合
 *
 * @example
 * ```ts
 * const stream = createHttpFileStream("https://example.com/file.bin");
 * await stream.initialize();
 * const data = await stream.read(1024);
 * stream.seek(0, "SEEK_SET");
 * ```
 */
export function createHttpFileStream(
  url: string,
  progressReporter?: (current: number, total: number) => void
) {
  // 内部状态
  const state: HttpFileStreamState = {
    size: 0,
    pos: 0,
    httpFile: createHttpFile(url),
    totalBytes: 0,
    progressReporter,
  };

  /**
   * 初始化 - 获取文件大小和检查 Range 支持
   *
   * @throws {Error} 如果初始化失败
   */
  async function initialize(): Promise<void> {
    const success = await state.httpFile.initialize();

    if (!success) {
      throw new Error("Failed to initialize HTTP file!");
    }

    state.size = state.httpFile.getSize();
  }

  /**
   * 检查是否可以 seek
   *
   * @returns 总是返回 true（HTTP Range 请求支持 seek）
   */
  function seekable(): boolean {
    return true;
  }

  /**
   * 检查是否可读
   *
   * @returns 总是返回 true
   */
  function readable(): boolean {
    return true;
  }

  /**
   * 检查是否可写
   *
   * @returns 总是返回 false（只读流）
   */
  function writable(): boolean {
    return false;
  }

  /**
   * 读取数据到缓冲区
   *
   * @param buffer - 目标缓冲区
   * @returns 实际读取的字节数
   */
  async function readInto(buffer: Uint8Array): Promise<number> {
    const size = buffer.length;
    const endPos = Math.min(state.pos + size - 1, state.size - 1);
    const actualSize = endPos - state.pos + 1;

    if (actualSize <= 0) {
      return 0;
    }

    if (state.progressReporter) {
      state.progressReporter(0, actualSize);
    }

    const data = await state.httpFile.read(state.pos, endPos);

    // 将数据复制到缓冲区
    const sourceArray = new Uint8Array(data);
    buffer.set(sourceArray, 0);

    state.totalBytes += actualSize;
    state.pos += actualSize;

    if (state.progressReporter) {
      state.progressReporter(actualSize, actualSize);
    }

    return actualSize;
  }

  /**
   * 读取指定长度的数据
   *
   * @param size - 要读取的字节数
   * @returns 读取的数据
   */
  async function read(size: number): Promise<Uint8Array> {
    const buffer = new Uint8Array(size);
    const bytesRead = await readInto(buffer);

    if (bytesRead < size) {
      return buffer.slice(0, bytesRead);
    }

    return buffer;
  }

  /**
   * 读取所有剩余数据
   *
   * @returns 剩余的所有数据
   */
  async function readAll(): Promise<Uint8Array> {
    const remainingSize = state.size - state.pos;
    return await read(remainingSize);
  }

  /**
   * 设置文件指针位置
   *
   * @param offset - 偏移量
   * @param whence - 起始位置（SEEK_SET: 文件开头, SEEK_CUR: 当前位置, SEEK_END: 文件末尾）
   * @returns 新的文件指针位置
   *
   * @throws {Error} 如果位置无效
   */
  function seek(
    offset: number,
    whence: "SEEK_SET" | "SEEK_CUR" | "SEEK_END" = "SEEK_SET"
  ): number {
    let newPos: number;

    switch (whence) {
      case "SEEK_SET":
        newPos = offset;
        break;
      case "SEEK_CUR":
        newPos = state.pos + offset;
        break;
      case "SEEK_END":
        newPos = state.size + offset;
        break;
      default:
        throw new Error(`Unsupported seek whence: ${whence}`);
    }

    if (newPos < 0 || newPos > state.size) {
      throw new Error(
        `Invalid position to seek: ${newPos} in size ${state.size}`
      );
    }

    state.pos = newPos;
    return newPos;
  }

  /**
   * 获取当前文件指针位置
   *
   * @returns 当前位置
   */
  function tell(): number {
    return state.pos;
  }

  /**
   * 获取文件大小
   *
   * @returns 文件总大小（字节）
   */
  function getSize(): number {
    return state.size;
  }

  /**
   * 获取已下载的总字节数
   *
   * @returns 已下载的字节数
   */
  function getTotalBytes(): number {
    return state.totalBytes;
  }

  /**
   * 关闭流
   *
   * @note HttpFileStream 不需要显式关闭
   */
  function close(): void {
    // HttpFile 不需要显式关闭
  }

  return {
    initialize,
    seekable,
    readable,
    writable,
    readInto,
    read,
    readAll,
    seek,
    tell,
    getSize,
    getTotalBytes,
    close,
  };
}

/**
 * 创建并初始化 HTTP 文件流（便捷方法）
 *
 * @param url - HTTP 文件 URL
 * @param progressReporter - 进度回调函数
 * @returns 已初始化的 HTTP 文件流
 *
 * @example
 * ```ts
 * const stream = await createAndInitializeHttpFileStream(
 *   "https://example.com/payload.bin",
 *   (current, total) => console.log(`${current}/${total}`)
 * );
 * const data = await stream.read(1024);
 * ```
 */
export async function createAndInitializeHttpFileStream(
  url: string,
  progressReporter?: (current: number, total: number) => void
) {
  const stream = createHttpFileStream(url, progressReporter);
  await stream.initialize();
  return stream;
}

/**
 * 向后兼容的 HttpFileStream 类
 *
 * @deprecated 建议直接使用 createHttpFileStream 工厂函数
 */
export class HttpFileStream {
  private impl: ReturnType<typeof createHttpFileStream>;

  constructor(
    url: string,
    progressReporter?: (current: number, total: number) => void
  ) {
    this.impl = createHttpFileStream(url, progressReporter);
  }

  async initialize(): Promise<void> {
    return this.impl.initialize();
  }

  seekable(): boolean {
    return this.impl.seekable();
  }

  readable(): boolean {
    return this.impl.readable();
  }

  writable(): boolean {
    return this.impl.writable();
  }

  async readInto(buffer: Uint8Array): Promise<number> {
    return this.impl.readInto(buffer);
  }

  async read(size: number): Promise<Uint8Array> {
    return this.impl.read(size);
  }

  async readAll(): Promise<Uint8Array> {
    return this.impl.readAll();
  }

  seek(
    offset: number,
    whence: "SEEK_SET" | "SEEK_CUR" | "SEEK_END" = "SEEK_SET"
  ): number {
    return this.impl.seek(offset, whence);
  }

  tell(): number {
    return this.impl.tell();
  }

  getSize(): number {
    return this.impl.getSize();
  }

  getTotalBytes(): number {
    return this.impl.getTotalBytes();
  }

  close(): void {
    return this.impl.close();
  }

  static async create(
    url: string,
    progressReporter?: (current: number, total: number) => void
  ): Promise<HttpFileStream> {
    const stream = new HttpFileStream(url, progressReporter);
    await stream.initialize();
    return stream;
  }
}
