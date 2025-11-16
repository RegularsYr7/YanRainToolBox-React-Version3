/**
 * Magisk Boot 服务 (纯函数式)
 * Boot 镜像内存/目录解包与回包工具
 *
 * 提供完整的 Boot 镜像解析、修改、重建功能
 * 支持 Android Boot Image v0–v4 格式
 */

import { promises as fs } from "fs";

/**
 * Boot 组件集合接口
 */
export interface BootParts {
  header?: Buffer;
  kernel: Buffer;
  kernel_dtb?: Buffer;
  ramdisk: Buffer;
  second?: Buffer;
  extra?: Buffer;
}

/**
 * 服务组件接口（内部使用）
 */
interface ServiceComps {
  kernel?: Buffer;
  kernel_dtb?: Buffer;
  ramdisk?: Buffer;
  second?: Buffer;
  extra?: Buffer;
}

/**
 * 解包元数据接口
 */
export interface UnpackMeta {
  kind: "legacy" | "v34";
  pageSize: number;
  headerSize: number;
}

/**
 * 解包结果接口
 */
export interface UnpackResult {
  parts: BootParts;
  meta: UnpackMeta;
  code: number;
}

/**
 * Boot 镜像魔数
 */
const MAGIC = Buffer.from("ANDROID!");

/**
 * FDT 魔数（Device Tree Blob）
 */
const MAGIC_BE = 0xd00dfeed;

/**
 * 检查是否为 2 的幂
 */
function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * 对齐到指定字节边界
 */
function align(n: number, a: number): number {
  return (n + a - 1) & ~(a - 1);
}

/**
 * 从 kernel 中分离 DTB
 *
 * @param buf - Kernel 数据
 * @returns 分离后的 kernel 和 dtb
 */
function splitKernelDtb(buf: Buffer): { kernel: Buffer; dtb?: Buffer } {
  let bestPos = -1;
  let bestLen = 0;

  for (let i = 0; i + 8 <= buf.length; i += 4) {
    const m = buf.readUInt32BE(i);
    if (m !== MAGIC_BE) continue;

    const total = buf.readUInt32BE(i + 4);
    if (total <= 0 || total > 64 * 1024 * 1024) continue;

    if (i + total <= buf.length) {
      if (i + total > bestPos + bestLen) {
        bestPos = i;
        bestLen = total;
      }
    }
  }

  if (bestPos >= 0 && bestLen > 0) {
    const dtb = buf.subarray(bestPos, bestPos + bestLen);
    const kernel = buf.subarray(0, bestPos);
    return { kernel, dtb };
  }

  return { kernel: buf };
}

/**
 * 将 Buffer 或 Uint8Array 转换为 Buffer
 */
function toBuffer(data: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

/**
 * 内存解包：将 boot 镜像解析为各组件（不触发磁盘写入）
 *
 * @param input - 镜像来源，文件路径或 Buffer
 * @param opts.includeHeader - 是否返回对齐后的 header 页（便于保留原始头部）
 * @returns Promise<UnpackResult>
 *
 * @example
 * ```ts
 * const { parts, meta, code } = await unpackBootToMemory("boot.img", { includeHeader: true });
 * if (code === 0) {
 *   console.log("Kernel size:", parts.kernel.length);
 * }
 * ```
 */
export async function unpackBootToMemory(
  input: string | Buffer,
  opts: { includeHeader?: boolean } = {}
): Promise<UnpackResult> {
  const buf = typeof input === "string" ? await fs.readFile(input) : input;

  if (buf.length < 4096 || !buf.subarray(0, 8).equals(MAGIC)) {
    return {
      parts: { kernel: Buffer.alloc(0), ramdisk: Buffer.alloc(0) },
      meta: { kind: "legacy", pageSize: 0, headerSize: 0 },
      code: 1,
    };
  }

  const header_size = buf.readUInt32LE(20);

  if (header_size >= 1580 || header_size === 1660 || header_size === 1580) {
    // v3/v4
    const page = 4096;
    const kernel_size = buf.readUInt32LE(8);
    const ramdisk_size = buf.readUInt32LE(12);

    let off = page;
    let kernel = buf.subarray(off, off + kernel_size);
    const kd = splitKernelDtb(kernel);
    kernel = kd.kernel;

    off = align(off + kernel_size, page);
    const ramdisk = buf.subarray(off, off + ramdisk_size);

    off = align(off + ramdisk_size, page);
    const extra = off < buf.length ? buf.subarray(off) : undefined;

    const parts: BootParts = { kernel, ramdisk };
    if (opts.includeHeader) parts.header = buf.subarray(0, page);
    if (kd.dtb) parts.kernel_dtb = kd.dtb;
    if (extra && extra.length) parts.extra = extra;

    return {
      parts,
      meta: { kind: "v34", pageSize: page, headerSize: header_size },
      code: 0,
    };
  } else {
    // legacy v0–v2
    const page = buf.readUInt32LE(36);

    if (!isPowerOfTwo(page) || page < 2048 || page > 65536) {
      return {
        parts: { kernel: Buffer.alloc(0), ramdisk: Buffer.alloc(0) },
        meta: { kind: "legacy", pageSize: page, headerSize: header_size },
        code: 1,
      };
    }

    const kernel_size = buf.readUInt32LE(8);
    const ramdisk_size = buf.readUInt32LE(16);
    const second_size = buf.readUInt32LE(24);

    let off = page;
    let kernel = buf.subarray(off, off + kernel_size);
    const kd = splitKernelDtb(kernel);
    kernel = kd.kernel;

    off = align(off + kernel_size, page);
    const ramdisk = buf.subarray(off, off + ramdisk_size);

    off = align(off + ramdisk_size, page);
    const second =
      second_size > 0 ? buf.subarray(off, off + second_size) : undefined;

    const tailOff = align(off + second_size, page);
    const extra = tailOff < buf.length ? buf.subarray(tailOff) : undefined;

    const parts: BootParts = { kernel, ramdisk };
    if (opts.includeHeader) parts.header = buf.subarray(0, page);
    if (kd.dtb) parts.kernel_dtb = kd.dtb;
    if (second && second.length) parts.second = second;
    if (extra && extra.length) parts.extra = extra;

    return {
      parts,
      meta: { kind: "legacy", pageSize: page, headerSize: header_size },
      code: 0,
    };
  }
}

/**
 * 内存回包：从组件重建 boot 镜像，返回新镜像 Buffer（不触发磁盘写入）
 *
 * @param orig - 原始镜像（文件路径或 Buffer），用于继承对齐和头信息
 * @param comps - 组件覆盖项：kernel、ramdisk、kernel_dtb、second、extra
 * @returns Promise<Buffer> 新镜像数据
 *
 * @example
 * ```ts
 * const { parts } = await unpackBootToMemory("boot.img");
 * const newBoot = await repackBootFromMemory("boot.img", {
 *   ramdisk: modifiedRamdisk
 * });
 * await fs.writeFile("new-boot.img", newBoot);
 * ```
 */
export async function repackBootFromMemory(
  orig: string | Buffer,
  comps: ServiceComps
): Promise<Buffer> {
  const origBuf = typeof orig === "string" ? await fs.readFile(orig) : orig;
  const header_size = origBuf.readUInt32LE(20);

  if (header_size >= 1580 || header_size === 1660 || header_size === 1580) {
    // v3/v4 repack
    const page = 4096;
    let kernel = comps.kernel ?? Buffer.alloc(0);
    if ((comps.kernel_dtb?.length ?? 0) > 0) {
      kernel = Buffer.concat([kernel, comps.kernel_dtb!]);
    }
    const ramdisk = comps.ramdisk ?? Buffer.alloc(0);
    const extra = comps.extra ?? Buffer.alloc(0);

    const header = Buffer.alloc(page);
    origBuf.copy(header, 0, 0, Math.min(origBuf.length, page));
    header.writeUInt32LE(kernel.length, 8);
    header.writeUInt32LE(ramdisk.length, 12);

    const chunks: Buffer[] = [header];
    const pad = (len: number) => {
      const n = (page - (len % page)) % page;
      if (n) chunks.push(Buffer.alloc(n));
    };

    chunks.push(kernel);
    pad(kernel.length);
    chunks.push(ramdisk);
    pad(ramdisk.length);
    if (extra.length) chunks.push(extra);

    return Buffer.concat(chunks);
  } else {
    // legacy repack
    const page = origBuf.readUInt32LE(36);

    if (!isPowerOfTwo(page) || page < 2048 || page > 65536) {
      throw new Error("unsupported page size");
    }

    let kernel = comps.kernel ?? Buffer.alloc(0);
    if ((comps.kernel_dtb?.length ?? 0) > 0) {
      kernel = Buffer.concat([kernel, comps.kernel_dtb!]);
    }
    const ramdisk = comps.ramdisk ?? Buffer.alloc(0);
    const second = comps.second ?? Buffer.alloc(0);
    const extra = comps.extra ?? Buffer.alloc(0);

    const header = Buffer.alloc(page);
    origBuf.copy(header, 0, 0, Math.min(origBuf.length, page));
    header.writeUInt32LE(kernel.length, 8);
    header.writeUInt32LE(ramdisk.length, 16);
    header.writeUInt32LE(second.length, 24);

    const chunks: Buffer[] = [header];
    const pad = (len: number) => {
      const n = (page - (len % page)) % page;
      if (n) chunks.push(Buffer.alloc(n));
    };

    chunks.push(kernel);
    pad(kernel.length);
    chunks.push(ramdisk);
    pad(ramdisk.length);
    if (second.length) {
      chunks.push(second);
      pad(second.length);
    }
    if (extra.length) chunks.push(extra);

    return Buffer.concat(chunks);
  }
}

/**
 * 目录解包：将组件写入指定目录
 *
 * @param file - 源镜像路径
 * @param opts.dumpHeader - 是否写出 header 文件
 * @param opts.outDir - 输出目录，默认 "."
 * @returns Promise<number> 0 表示成功
 *
 * @example
 * ```ts
 * await unpackBootToDir("boot.img", {
 *   dumpHeader: true,
 *   outDir: "./boot_parts"
 * });
 * ```
 */
export async function unpackBootToDir(
  file: string,
  opts: { dumpHeader?: boolean; outDir?: string } = {}
): Promise<number> {
  const { parts, code } = await unpackBootToMemory(file, {
    includeHeader: !!opts.dumpHeader,
  });

  if (code) return code;

  const outDir = opts.outDir ?? ".";
  const writes: Promise<void>[] = [];

  if (parts.header) {
    writes.push(fs.writeFile(`${outDir}/header`, parts.header));
  }
  if (parts.kernel) {
    writes.push(fs.writeFile(`${outDir}/kernel`, parts.kernel));
  }
  if (parts.kernel_dtb) {
    writes.push(fs.writeFile(`${outDir}/kernel_dtb`, parts.kernel_dtb));
  }
  if (parts.ramdisk) {
    writes.push(fs.writeFile(`${outDir}/ramdisk.cpio`, parts.ramdisk));
  }
  if (parts.second) {
    writes.push(fs.writeFile(`${outDir}/second`, parts.second));
  }
  if (parts.extra) {
    writes.push(fs.writeFile(`${outDir}/extra`, parts.extra));
  }

  await Promise.all(writes);
  return 0;
}

/**
 * 目录回包：从目录读取组件并回包成镜像
 * 读取 dir 下 kernel/kernel_dtb/ramdisk.cpio/second/extra 文件并写入 outPath
 *
 * @param orig - 原始镜像路径（用于继承头信息与对齐）
 * @param outPath - 输出镜像路径
 * @param opts.dir - 组件所在目录，默认 "."
 *
 * @example
 * ```ts
 * await repackBootFromDir("boot.img", "new-boot.img", {
 *   dir: "./boot_parts"
 * });
 * ```
 */
export async function repackBootFromDir(
  orig: string,
  outPath: string,
  opts: { dir?: string } = {}
): Promise<void> {
  const dir = opts.dir ?? ".";

  const comps: ServiceComps = {
    kernel: await fs.readFile(`${dir}/kernel`).catch(() => Buffer.alloc(0)),
    kernel_dtb: await fs
      .readFile(`${dir}/kernel_dtb`)
      .catch(() => Buffer.alloc(0)),
    ramdisk: await fs
      .readFile(`${dir}/ramdisk.cpio`)
      .catch(() => Buffer.alloc(0)),
    second: await fs.readFile(`${dir}/second`).catch(() => Buffer.alloc(0)),
    extra: await fs.readFile(`${dir}/extra`).catch(() => Buffer.alloc(0)),
  };

  const outBuf = await repackBootFromMemory(orig, comps);
  await fs.writeFile(outPath, outBuf);
}

/**
 * 创建 Boot 服务处理器
 *
 * @returns Boot 服务方法集合
 *
 * @example
 * ```ts
 * const service = createBootService();
 * const { parts } = await service.unpackToMemory("boot.img");
 * const rebuilt = await service.repackFromMemory("boot.img", parts);
 * ```
 */
export function createBootService() {
  return {
    unpackToMemory: unpackBootToMemory,
    repackFromMemory: repackBootFromMemory,
    unpackToDir: unpackBootToDir,
    repackFromDir: repackBootFromDir,
  };
}

/**
 * 创建 Boot 控制器（高层封装）
 *
 * @returns Boot 控制器方法集合
 *
 * @example
 * ```ts
 * const controller = createBootController();
 * const { parts } = await controller.unpackToMemory(buffer);
 * const rebuilt = await controller.repackFromMemory(buffer, { ramdisk: newRamdisk });
 * ```
 */
export function createBootController() {
  /**
   * 内存解包（控制器层）
   */
  async function unpackToMemory(
    input: Buffer | Uint8Array,
    options?: { includeHeader?: boolean }
  ): Promise<UnpackResult> {
    return unpackBootToMemory(toBuffer(input), options);
  }

  /**
   * 内存回包（控制器层）
   */
  async function repackFromMemory(
    orig: Buffer | Uint8Array,
    comps: {
      header?: Buffer | Uint8Array;
      kernel?: Buffer | Uint8Array;
      ramdisk?: Buffer | Uint8Array;
      dtb?: Buffer | Uint8Array;
      extra?: Buffer | Uint8Array;
      kernel_dtb?: Buffer | Uint8Array;
      second?: Buffer | Uint8Array;
    }
  ): Promise<Buffer> {
    const mapped: ServiceComps = {
      kernel: comps.kernel ? toBuffer(comps.kernel) : undefined,
      ramdisk: comps.ramdisk ? toBuffer(comps.ramdisk) : undefined,
      kernel_dtb: comps.kernel_dtb
        ? toBuffer(comps.kernel_dtb)
        : comps.dtb
        ? toBuffer(comps.dtb)
        : undefined,
      second: comps.second ? toBuffer(comps.second) : undefined,
      extra: comps.extra ? toBuffer(comps.extra) : undefined,
    };
    return repackBootFromMemory(toBuffer(orig), mapped);
  }

  return {
    unpackToMemory,
    repackFromMemory,
    unpackToDir: unpackBootToDir,
    repackFromDir: repackBootFromDir,
  };
}

/**
 * 向后兼容的 bootService 类
 *
 * @deprecated 建议直接使用 createBootService 工厂函数
 */
export class bootService {
  async unpackToMemory(
    input: string | Buffer,
    opts: { includeHeader?: boolean } = {}
  ): Promise<UnpackResult> {
    return unpackBootToMemory(input, opts);
  }

  async repackFromMemory(
    orig: string | Buffer,
    comps: ServiceComps
  ): Promise<Buffer> {
    return repackBootFromMemory(orig, comps);
  }

  async unpackToDir(
    file: string,
    opts: { dumpHeader?: boolean; outDir?: string } = {}
  ): Promise<number> {
    return unpackBootToDir(file, opts);
  }

  async repackFromDir(
    orig: string,
    outPath: string,
    opts: { dir?: string } = {}
  ): Promise<void> {
    return repackBootFromDir(orig, outPath, opts);
  }
}

/**
 * 向后兼容的 BootController 类
 *
 * @deprecated 建议直接使用 createBootController 工厂函数
 */
export class BootController {
  private impl: ReturnType<typeof createBootController>;

  constructor() {
    this.impl = createBootController();
  }

  unpackToMemory(
    input: Buffer | Uint8Array,
    options?: { includeHeader?: boolean }
  ): Promise<UnpackResult> {
    return this.impl.unpackToMemory(input, options);
  }

  repackFromMemory(
    orig: Buffer | Uint8Array,
    comps: {
      header?: Buffer | Uint8Array;
      kernel?: Buffer | Uint8Array;
      ramdisk?: Buffer | Uint8Array;
      dtb?: Buffer | Uint8Array;
      extra?: Buffer | Uint8Array;
      kernel_dtb?: Buffer | Uint8Array;
      second?: Buffer | Uint8Array;
    }
  ): Promise<Buffer> {
    return this.impl.repackFromMemory(orig, comps);
  }

  unpackToDir(
    filePath: string,
    options?: { dumpHeader?: boolean; outDir?: string }
  ): Promise<number> {
    return this.impl.unpackToDir(filePath, options);
  }

  repackFromDir(
    orig: string,
    outPath: string,
    options?: { dir?: string }
  ): Promise<void> {
    return this.impl.repackFromDir(orig, outPath, options);
  }
}
