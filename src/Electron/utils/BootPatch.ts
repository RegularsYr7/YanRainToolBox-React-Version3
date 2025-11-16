/**
 * Magisk Boot 修补器 (纯函数式)
 * 用于修补 Android Boot 镜像，注入 Magisk
 */

import { executeFile } from "./command";
import { fileExists, copyFile, removeFile, writeFile } from "./file";
import { info as logInfo, error as logError, warn as logWarn } from "./logger";
import { getMagiskBootPath } from "./paths";
import * as fs from "fs/promises";

/**
 * 修补配置接口
 */
export interface IPatchConfig {
  is64bit: boolean;
  keepVerity: boolean;
  keepForceEncrypt: boolean;
  recoveryMode: boolean;
}

/**
 * Boot 修补器状态接口
 */
interface BootPatcherState {
  bootImage: string;
  config: Required<IPatchConfig>;
  sha1: string | null;
  skipNewMagisk: string;
  skipOldMagisk: string;
  magiskBootPath: string;
  cpioStatus: number;
  hasStubXz: boolean;
  hasInitLdXz: boolean;
}

/**
 * 读取文件签名
 */
async function readSignature(filePath: string): Promise<{
  ascii: string;
  hex: string;
  size: number;
}> {
  try {
    const fh = await fs.open(filePath, "r");
    const buf = Buffer.alloc(16);
    const { bytesRead } = await fh.read(buf, 0, 16, 0);
    const stat = await fh.stat();
    await fh.close();
    const slice = buf.slice(0, bytesRead);
    const ascii = slice
      .toString("ascii")
      .replace(/[^\x20-\x7E]/g, ".")
      .trim();
    const hex = Array.from(slice)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    return { ascii, hex, size: stat.size };
  } catch {
    return { ascii: "", hex: "", size: 0 };
  }
}

/**
 * 解包 Boot 镜像
 */
async function unpackBootImage(state: BootPatcherState): Promise<void> {
  try {
    logInfo("Unpacking boot image");

    // 先检查 magiskboot 是否存在
    try {
      const exists = await fileExists(state.magiskBootPath);
      if (!exists) {
        throw new Error(
          `找不到 magiskboot 可执行文件: ${state.magiskBootPath}`
        );
      }
    } catch (e) {
      logError("magiskboot 缺失或不可访问", e);
      throw e;
    }

    logInfo(`使用 magiskboot: ${state.magiskBootPath}`);
    const { code } = await executeFile(state.magiskBootPath, [
      "unpack",
      state.bootImage,
    ]);

    switch (code) {
      case 0:
        break;
      case 1: {
        const sig = await readSignature(state.bootImage);
        const hint =
          sig.ascii.startsWith("ANDROID!") || sig.ascii.startsWith("VNDRBOOT")
            ? "(看起来像标准头，但仍被判定不支持，可能文件损坏)"
            : "(不是标准 ANDROID!/VNDRBOOT 头，可能选择了错误文件，或需要先从OTA正确提取)";
        throw new Error(
          `Unsupported/Unknown image format ${hint}. signature(ascii=${
            sig.ascii || "<none>"
          }, hex=${sig.hex || "<none>"}, size=${sig.size}B)`
        );
      }
      case 2:
        logInfo("ChromeOS boot image detected");
        throw new Error("ChromeOS not support on windows");
      default:
        throw new Error("Unable to unpack boot image");
    }

    // 解包完成后，检查是否存在 ramdisk.cpio
    if (!(await fileExists("ramdisk.cpio"))) {
      const msg =
        "当前镜像不包含 ramdisk（可能是 2SI/GKI 设备）。请改用对应设备的 init_boot.img 或 vendor_boot.img 进行修补。";
      logError(msg);
      throw new Error(msg);
    }
  } catch (error) {
    logError(`Failed to unpack boot image: ${error}`);
    throw error;
  }
}

/**
 * 检查恢复模式
 */
async function checkRecoveryMode(state: BootPatcherState): Promise<void> {
  if (await fileExists("recovery_dtbo")) {
    state.config.recoveryMode = true;
  }
}

/**
 * 处理原厂 Boot
 */
async function handleStockBoot(state: BootPatcherState): Promise<void> {
  logInfo("Stock boot image detected");
  const { output } = await executeFile(state.magiskBootPath, [
    "sha1",
    state.bootImage,
  ]);
  state.sha1 = output.trim();

  await copyFile(state.bootImage, "stock_boot.img");
  await copyFile("ramdisk.cpio", "ramdisk.cpio.orig");
}

/**
 * 处理已修补的 Magisk Boot
 */
async function handleMagiskPatched(state: BootPatcherState): Promise<void> {
  logInfo("Magisk patched boot image detected");
  if (!state.sha1) {
    const { output } = await executeFile(state.magiskBootPath, [
      "cpio",
      "ramdisk.cpio",
      "sha1",
    ]);
    state.sha1 = output.trim();
  }

  await executeFile(state.magiskBootPath, ["cpio", "ramdisk.cpio", "restore"]);
  await copyFile("ramdisk.cpio", "ramdisk.cpio.orig");
  await removeFile("stock_boot.img");
}

/**
 * 处理 Ramdisk
 */
async function handleRamdisk(state: BootPatcherState): Promise<void> {
  logInfo("Checking ramdisk status");

  let status = 0;
  if (await fileExists("ramdisk.cpio")) {
    const { code } = await executeFile(state.magiskBootPath, [
      "cpio",
      "ramdisk.cpio",
      "test",
    ]);
    status = code;
  }
  // 记录原始状态位以便后续决定 INIT 名称
  state.cpioStatus = status;

  switch (status & 3) {
    case 0:
      await handleStockBoot(state);
      break;
    case 1:
      await handleMagiskPatched(state);
      break;
    case 2:
      throw new Error("Boot image patched by unsupported programs");
  }
}

/**
 * 压缩 Magisk 二进制文件
 */
async function compressMagiskBinaries(state: BootPatcherState): Promise<{
  skip64: string;
  hasStubXz: boolean;
  hasInitLdXz: boolean;
}> {
  // 仅处理 magisk 文件（与参考脚本保持一致，不再向 overlay 注入 stub/init-ld）
  if (await fileExists("magisk32")) {
    await executeFile(state.magiskBootPath, [
      "compress=xz",
      "magisk32",
      "magisk32.xz",
    ]);
    await executeFile(state.magiskBootPath, [
      "compress=xz",
      "magisk64",
      "magisk64.xz",
    ]);
    state.skipNewMagisk = "#";
    state.skipOldMagisk = "";
  } else {
    await executeFile(state.magiskBootPath, [
      "compress=xz",
      "magisk",
      "magisk.xz",
    ]);
    state.skipNewMagisk = "";
    state.skipOldMagisk = "#";
  }

  // 校验生成的 xz 工件是否存在
  const needNew = state.skipNewMagisk === "#"; // 使用 magisk32/64
  if (needNew) {
    const ok32 = await fileExists("magisk32.xz");
    const ok64 = await fileExists("magisk64.xz");
    if (!ok32 || !ok64) {
      throw new Error("压缩后缺少 magisk32.xz 或 magisk64.xz，无法注入");
    }
  } else {
    const ok = await fileExists("magisk.xz");
    if (!ok) {
      throw new Error("压缩后缺少 magisk.xz，无法注入");
    }
  }

  // 可选压缩：stub.apk -> stub.xz，init-ld -> init-ld.xz
  state.hasStubXz = false;
  state.hasInitLdXz = false;
  if (await fileExists("stub.apk")) {
    await executeFile(state.magiskBootPath, [
      "compress=xz",
      "stub.apk",
      "stub.xz",
    ]);
    state.hasStubXz = await fileExists("stub.xz");
  }
  if (await fileExists("init-ld")) {
    await executeFile(state.magiskBootPath, [
      "compress=xz",
      "init-ld",
      "init-ld.xz",
    ]);
    state.hasInitLdXz = await fileExists("init-ld.xz");
  }

  return {
    skip64: state.config.is64bit ? "" : "#",
    hasStubXz: state.hasStubXz,
    hasInitLdXz: state.hasInitLdXz,
  };
}

/**
 * 修补 Ramdisk
 */
async function patchRamdisk(state: BootPatcherState): Promise<void> {
  logInfo("Patching ramdisk");

  const config = [
    `KEEPVERITY=${state.config.keepVerity}`,
    `KEEPFORCEENCRYPT=${state.config.keepForceEncrypt}`,
    `RECOVERYMODE=${state.config.recoveryMode}`,
  ];

  if (state.sha1) {
    config.push(`SHA1=${state.sha1}`);
  }

  await writeFile("config", config.join("\n"));

  // 先压缩生成 .xz 工件（仅 magisk32/64 或旧版单一 magisk）
  const { skip64, hasStubXz, hasInitLdXz } = await compressMagiskBinaries(
    state
  );

  // 关键文件存在性断言
  if (!(await fileExists("magiskinit"))) {
    throw new Error("缺少 magiskinit，无法向 ramdisk 注入 init");
  }

  // Sony 定制：若 cpio test 的 bit4 置位，则替换 /init.real
  const initName = (state.cpioStatus & 4) !== 0 ? "init.real" : "init";

  const cpioCommands = [
    `add 0750 ${initName} magiskinit`,
    "mkdir 0750 overlay.d",
    "mkdir 0750 overlay.d/sbin",
    `${state.skipNewMagisk} add 0644 overlay.d/sbin/magisk.xz magisk.xz`,
    `${state.skipOldMagisk} add 0644 overlay.d/sbin/magisk32.xz magisk32.xz`,
    `${state.skipOldMagisk} ${skip64} add 0644 overlay.d/sbin/magisk64.xz magisk64.xz`,
    // Alpha 变种：若存在则注入 stub/init-ld 的 xz
    `${hasStubXz ? "" : "#"} add 0644 overlay.d/sbin/stub.xz stub.xz`,
    `${hasInitLdXz ? "" : "#"} add 0644 overlay.d/sbin/init-ld.xz init-ld.xz`,
    "patch",
    "backup ramdisk.cpio.orig",
    "mkdir 000 .backup",
    "add 000 .backup/.magisk config",
  ];

  // 在执行 cpio patch 前先做一份 before 文件用于对比
  try {
    if (await fileExists("ramdisk.cpio")) {
      await copyFile("ramdisk.cpio", "ramdisk.cpio.before");
    }
  } catch {
    /* ignore */
  }

  // 逐条执行 cpio 子指令
  for (const raw of cpioCommands) {
    const directive = raw.trim();
    if (!directive || directive.startsWith("#")) continue;
    const isPatch = directive.startsWith("patch");
    const { code, output } = await executeFile(
      state.magiskBootPath,
      ["cpio", "ramdisk.cpio", directive],
      20000,
      isPatch
        ? {
            env: {
              KEEPVERITY: String(state.config.keepVerity),
              KEEPFORCEENCRYPT: String(state.config.keepForceEncrypt),
              RECOVERYMODE: String(state.config.recoveryMode),
            },
          }
        : undefined
    );
    if (code !== 0) {
      logWarn(`cpio 子指令执行非零退出: ${directive}`);
      logWarn(output);
    }
  }

  // 校验：体积变化 + cpio test/ls 检查 overlay 注入情况
  try {
    const safeStat = async (p: string): Promise<import("fs").Stats | null> => {
      try {
        return await fs.stat(p);
      } catch {
        return null;
      }
    };
    const [curStat, beforeStat] = await Promise.all([
      safeStat("ramdisk.cpio"),
      safeStat("ramdisk.cpio.before"),
    ]);
    if (curStat && beforeStat) {
      logInfo(
        `ramdisk.cpio size: ${curStat.size}B, before: ${
          beforeStat.size
        }B, delta: ${curStat.size - beforeStat.size}B`
      );
    }

    const test = await executeFile(state.magiskBootPath, [
      "cpio",
      "ramdisk.cpio",
      "test",
    ]);
    logInfo(
      `ramdisk 自检：cpio test code=${test.code} (0=stock,1=magisk,2=unsupported)`
    );

    const magiskExist = await executeFile(state.magiskBootPath, [
      "cpio",
      "ramdisk.cpio",
      "exists overlay.d/sbin/magisk.xz",
    ]);
    const m32Exist = await executeFile(state.magiskBootPath, [
      "cpio",
      "ramdisk.cpio",
      "exists overlay.d/sbin/magisk32.xz",
    ]);
    const m64Exist = await executeFile(state.magiskBootPath, [
      "cpio",
      "ramdisk.cpio",
      "exists overlay.d/sbin/magisk64.xz",
    ]);
    const hasOverlay = [magiskExist.code, m32Exist.code, m64Exist.code].some(
      (c) => c === 0
    );
    logInfo(`ramdisk 自检：overlay entries present=${hasOverlay}`);
    if (!hasOverlay) {
      logWarn("ramdisk 内未发现 overlay.d/sbin/magisk*.xz，可能未成功注入");
    }

    // 若 test 结果不是 1（Magisk patched），则认为补丁未生效
    if (test.code !== 1) {
      const msg =
        test.code === 0
          ? "当前 ramdisk 状态仍为 stock，补丁未生效。请检查镜像是否正确（部分设备需修补 init_boot/vendor_boot），或查看日志中 cpio 指令执行是否有非零退出。"
          : "当前 ramdisk 状态为 unsupported，可能被其他程序修改过，或镜像格式特殊。建议改用正确镜像或还原后再试。";
      logError(msg);
      throw new Error(msg);
    }
  } catch (e) {
    logWarn("ramdisk 修改结果校验失败（非致命）", e);
  } finally {
    try {
      await removeFile("ramdisk\\.cpio\\.before$");
    } catch {
      /* ignore */
    }
  }

  await removeFile("ramdisk.cpio.orig");
  await removeFile("config");
  await removeFile("\\.xz$");
}

/**
 * 修补内核
 */
async function patchKernel(state: BootPatcherState): Promise<void> {
  if (await fileExists("kernel")) {
    // Remove Samsung RKP
    await executeFile(state.magiskBootPath, [
      "hexpatch",
      "kernel",
      "49010054011440B93FA00F71E9000054010840B93FA00F7189000054001840B91FA00F7188010054",
      "A1020054011440B93FA00F7140020054010840B93FA00F71E0010054001840B91FA00F7181010054",
    ]);

    // Remove Samsung defex
    await executeFile(state.magiskBootPath, [
      "hexpatch",
      "kernel",
      "821B8012",
      "E2FF8F12",
    ]);

    // Patch procfs
    await executeFile(state.magiskBootPath, [
      "hexpatch",
      "kernel",
      "70726F63615F636F6E66696700",
      "70726F63615F6D616769736B00",
    ]);

    // Force kernel to load rootfs
    await executeFile(state.magiskBootPath, [
      "hexpatch",
      "kernel",
      "736B69705F696E697472616D667300",
      "77616E745F696E697472616D667300",
    ]);
  }
}

/**
 * 创建 Magisk Boot 修补器
 *
 * @param bootImage - Boot 镜像文件路径
 * @param config - 修补配置
 * @returns Boot 修补器方法集合
 *
 * @example
 * ```ts
 * const patcher = createMagiskBootPatcher("/path/to/boot.img", {
 *   is64bit: true,
 *   keepVerity: false,
 *   keepForceEncrypt: false,
 *   recoveryMode: false,
 * });
 * await patcher.patch();
 * await patcher.cleanup();
 * ```
 */
export function createMagiskBootPatcher(
  bootImage: string,
  config?: Partial<IPatchConfig>
) {
  // 内部状态
  const state: BootPatcherState = {
    bootImage,
    config: {
      is64bit: false,
      keepVerity: true,
      keepForceEncrypt: true,
      recoveryMode: false,
      ...config,
    },
    sha1: null,
    skipNewMagisk: "",
    skipOldMagisk: "#",
    magiskBootPath: getMagiskBootPath(),
    cpioStatus: 0,
    hasStubXz: false,
    hasInitLdXz: false,
  };

  /**
   * 执行修补
   */
  async function patch(): Promise<void> {
    try {
      await unpackBootImage(state);
      await checkRecoveryMode(state);
      await handleRamdisk(state);
      await patchRamdisk(state);

      // 处理 dtb 文件
      for (const dt of ["dtb", "kernel_dtb", "extra"]) {
        if (await fileExists(dt)) {
          await executeFile(state.magiskBootPath, ["dtb", dt, "patch"], 20000, {
            env: {
              KEEPVERITY: String(state.config.keepVerity),
              KEEPFORCEENCRYPT: String(state.config.keepForceEncrypt),
              RECOVERYMODE: String(state.config.recoveryMode),
            },
          });
          logInfo(`Patch fstab in ${dt}`);
        }
      }

      await patchKernel(state);

      logInfo("Repacking boot image");
      const repackResult = await executeFile(state.magiskBootPath, [
        "repack",
        state.bootImage,
      ]);
      logInfo("Repack command result:", repackResult);

      // 检查可能的输出文件名
      const possibleOutputs = ["new-boot.img", "new_boot.img", "boot_new.img"];
      let foundOutput = false;

      for (const outputName of possibleOutputs) {
        if (await fileExists(outputName)) {
          logInfo(`Found output file: ${outputName}`);
          if (outputName !== "new-boot.img") {
            await copyFile(outputName, "new-boot.img");
            logInfo(`Renamed ${outputName} to new-boot.img`);
          }
          foundOutput = true;
          break;
        }
      }

      if (!foundOutput) {
        // 列出当前目录的所有文件以便调试
        const files = await fs.readdir(".");
        logError(
          "Repack completed but no output file found. Directory contents:",
          files
        );
        throw new Error(
          "Repack completed but no output boot image was generated"
        );
      }
    } catch (error) {
      logError(`Patch process failed: ${error}`);
      throw error;
    }
  }

  /**
   * 清理临时文件
   */
  async function cleanup(): Promise<void> {
    await removeFile("stock_boot.img");
    await removeFile("kernel");
    await removeFile(".*dtb.*");
    await removeFile("ramdisk\\.cpio.*");
    // 注意：不删除 new-boot.img，让上层服务处理
  }

  return {
    patch,
    cleanup,
  };
}

/**
 * 向后兼容的 MagiskBootPatcher 类
 *
 * @deprecated 建议直接使用 createMagiskBootPatcher 工厂函数
 */
export class MagiskBootPatcher {
  private impl: ReturnType<typeof createMagiskBootPatcher>;

  constructor(bootImage: string, config?: Partial<IPatchConfig>) {
    this.impl = createMagiskBootPatcher(bootImage, config);
  }

  async patch(): Promise<void> {
    return this.impl.patch();
  }

  async cleanup(): Promise<void> {
    return this.impl.cleanup();
  }
}
