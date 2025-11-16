/**
 * HTTP 文件处理 (纯函数式)
 * 提供远程文件的读取、Range 请求、流式下载等功能
 * 支持部分内容请求，适用于大文件的按需加载
 */

import axios from "axios";
import type { AxiosResponse } from "axios";
import type { HttpFileOptions } from "../../types/ota.js";

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

const DEFAULT_HEADERS = {
  Referer: "https://www.miui.com/",
  Accept: "*/*",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "cross-site",
};

/**
 * HTTP 文件状态接口
 */
interface HttpFileState {
  url: string;
  size: number;
  initialized: boolean;
  options: Required<HttpFileOptions>;
}

/**
 * 创建 HTTP 文件处理器
 *
 * @param url - 远程文件的 URL 地址
 * @param options - HTTP 请求配置选项
 * @returns HTTP 文件操作方法集合
 *
 * @example
 * ```ts
 * const httpFile = createHttpFile("https://example.com/file.zip");
 * await httpFile.initialize();
 * const size = httpFile.getSize();
 * const chunk = await httpFile.read(0, 1024);
 * ```
 */
export function createHttpFile(url: string, options: HttpFileOptions = {}) {
  // 内部状态
  const state: HttpFileState = {
    url,
    size: 0,
    initialized: false,
    options: {
      timeout: options.timeout || DEFAULT_TIMEOUT,
      maxRetries: options.maxRetries || DEFAULT_MAX_RETRIES,
      userAgent: options.userAgent || DEFAULT_USER_AGENT,
      headers: {
        ...DEFAULT_HEADERS,
        ...options.headers,
      },
      onProgress: options.onProgress || (() => {}),
    },
  };

  /**
   * 执行 HTTP 请求（带重试机制）
   *
   * @param method - HTTP 方法
   * @param targetUrl - 请求 URL
   * @param extraHeaders - 额外的请求头
   * @returns Axios 响应对象
   */
  async function makeRequest(
    method: "GET" | "HEAD",
    targetUrl: string,
    extraHeaders: Record<string, string> = {}
  ): Promise<AxiosResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < state.options.maxRetries; attempt++) {
      try {
        const response = await axios({
          method,
          url: targetUrl,
          timeout: state.options.timeout,
          responseType: method === "GET" ? "arraybuffer" : "text",
          headers: {
            "User-Agent": state.options.userAgent,
            ...state.options.headers,
            ...extraHeaders,
          },
        });

        return response;
      } catch (error) {
        lastError = error as Error;

        // 如果不是最后一次尝试，等待后重试
        if (attempt < state.options.maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000; // 指数退避
          await new Promise((resolve) => setTimeout(resolve, delay));
          console.warn(
            `HTTP请求失败，${delay}ms后重试 (${attempt + 1}/${
              state.options.maxRetries
            }):`,
            error
          );
        }
      }
    }

    throw lastError || new Error("HTTP请求失败");
  }

  /**
   * 初始化 HTTP 文件
   * 通过 HEAD 请求获取文件大小和元数据
   *
   * @returns 初始化是否成功
   */
  async function initialize(): Promise<boolean> {
    try {
      const response = await makeRequest("HEAD", state.url);

      // 获取文件大小
      const contentLength = response.headers["content-length"];
      if (contentLength) {
        state.size = parseInt(contentLength, 10);
      }

      // 检查是否支持 Range 请求
      const acceptRanges = response.headers["accept-ranges"];
      if (acceptRanges !== "bytes") {
        console.warn("服务器不支持Range请求，性能可能受影响");
      }

      state.initialized = true;
      return true;
    } catch (error) {
      console.error("初始化HTTP文件失败:", error);
      return false;
    }
  }

  /**
   * 获取文件大小
   *
   * @returns 文件大小（字节）
   */
  function getSize(): number {
    if (!state.initialized) {
      throw new Error("HTTP文件未初始化，请先调用initialize()");
    }
    return state.size;
  }

  /**
   * 读取指定范围的数据
   *
   * @param start - 起始位置（字节）
   * @param end - 结束位置（字节，可选）
   * @returns 读取的数据 Buffer
   */
  async function read(start: number, end?: number): Promise<Buffer> {
    if (!state.initialized) {
      throw new Error("HTTP文件未初始化，请先调用initialize()");
    }

    const actualEnd = end !== undefined ? end : state.size - 1;

    if (start < 0 || start >= state.size) {
      throw new Error(`起始位置超出范围: ${start}`);
    }

    if (actualEnd >= state.size) {
      throw new Error(`结束位置超出范围: ${actualEnd}`);
    }

    if (start > actualEnd) {
      throw new Error(`起始位置不能大于结束位置: ${start} > ${actualEnd}`);
    }

    try {
      const response = await makeRequest("GET", state.url, {
        Range: `bytes=${start}-${actualEnd}`,
      });

      // 检查响应状态
      if (response.status !== 206) {
        throw new Error(`Range请求失败，状态码: ${response.status}`);
      }

      return Buffer.from(response.data);
    } catch (error) {
      throw new Error(`读取数据失败: ${error}`);
    }
  }

  /**
   * 下载整个文件到指定路径
   *
   * @param outputPath - 输出文件路径
   * @param onProgress - 进度回调函数
   * @returns 下载是否成功
   */
  async function download(
    outputPath: string,
    onProgress?: (downloaded: number, total: number) => void
  ): Promise<boolean> {
    try {
      const response = await axios({
        method: "GET",
        url: state.url,
        responseType: "stream",
        timeout: state.options.timeout,
        headers: {
          "User-Agent": state.options.userAgent,
          ...state.options.headers,
        },
      });

      const totalSize = parseInt(response.headers["content-length"] || "0", 10);
      let downloadedSize = 0;

      // 创建写入流
      const fs = await import("fs");
      const writeStream = fs.createWriteStream(outputPath);

      return new Promise((resolve, reject) => {
        response.data.on("data", (chunk: Buffer) => {
          downloadedSize += chunk.length;

          // 触发进度回调
          if (onProgress) {
            onProgress(downloadedSize, totalSize);
          }
          state.options.onProgress(downloadedSize, totalSize);
        });

        response.data.on("end", () => {
          writeStream.end();
          resolve(true);
        });

        response.data.on("error", (error: Error) => {
          writeStream.destroy();
          reject(error);
        });

        writeStream.on("error", (error: Error) => {
          reject(error);
        });

        response.data.pipe(writeStream);
      });
    } catch (error) {
      console.error("下载文件失败:", error);
      return false;
    }
  }

  /**
   * 流式读取文件数据
   *
   * @param chunkSize - 每次读取的块大小（字节）
   * @param onChunk - 数据块回调函数
   * @returns 读取是否成功
   */
  async function streamRead(
    chunkSize: number = 1024 * 1024, // 默认 1MB
    onChunk: (chunk: Buffer, offset: number) => void
  ): Promise<boolean> {
    if (!state.initialized) {
      throw new Error("HTTP文件未初始化，请先调用initialize()");
    }

    try {
      let offset = 0;

      while (offset < state.size) {
        const end = Math.min(offset + chunkSize - 1, state.size - 1);
        const chunk = await read(offset, end);

        onChunk(chunk, offset);
        offset = end + 1;

        // 触发进度回调
        state.options.onProgress(offset, state.size);
      }

      return true;
    } catch (error) {
      console.error("流式读取失败:", error);
      return false;
    }
  }

  /**
   * 获取文件的 MIME 类型
   *
   * @returns MIME 类型字符串
   */
  async function getContentType(): Promise<string> {
    if (!state.initialized) {
      await initialize();
    }

    try {
      const response = await makeRequest("HEAD", state.url);
      return response.headers["content-type"] || "application/octet-stream";
    } catch {
      return "application/octet-stream";
    }
  }

  /**
   * 获取文件的最后修改时间
   *
   * @returns 最后修改时间
   */
  async function getLastModified(): Promise<Date | null> {
    if (!state.initialized) {
      await initialize();
    }

    try {
      const response = await makeRequest("HEAD", state.url);
      const lastModified = response.headers["last-modified"];
      return lastModified ? new Date(lastModified) : null;
    } catch {
      return null;
    }
  }

  return {
    initialize,
    getSize,
    read,
    download,
    streamRead,
    getContentType,
    getLastModified,
  };
}

/**
 * 检查 URL 是否可访问（静态工具函数）
 *
 * @param url - 要检查的 URL
 * @returns 是否可访问
 */
export async function isHttpFileAccessible(url: string): Promise<boolean> {
  try {
    const response = await axios.head(url, {
      timeout: 5000,
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
        ...DEFAULT_HEADERS,
      },
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * 向后兼容的 HttpFile 类
 * 保持与原 class 相同的 API
 *
 * @deprecated 建议直接使用 createHttpFile 工厂函数
 */
export class HttpFile {
  private impl: ReturnType<typeof createHttpFile>;

  constructor(url: string, options: HttpFileOptions = {}) {
    this.impl = createHttpFile(url, options);
  }

  async initialize(): Promise<boolean> {
    return this.impl.initialize();
  }

  getSize(): number {
    return this.impl.getSize();
  }

  async read(start: number, end?: number): Promise<Buffer> {
    return this.impl.read(start, end);
  }

  async download(
    outputPath: string,
    onProgress?: (downloaded: number, total: number) => void
  ): Promise<boolean> {
    return this.impl.download(outputPath, onProgress);
  }

  async streamRead(
    chunkSize: number = 1024 * 1024,
    onChunk: (chunk: Buffer, offset: number) => void
  ): Promise<boolean> {
    return this.impl.streamRead(chunkSize, onChunk);
  }

  async getContentType(): Promise<string> {
    return this.impl.getContentType();
  }

  async getLastModified(): Promise<Date | null> {
    return this.impl.getLastModified();
  }

  static async isAccessible(url: string): Promise<boolean> {
    return isHttpFileAccessible(url);
  }
}
