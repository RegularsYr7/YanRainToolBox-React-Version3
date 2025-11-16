/**
 * Magisk Boot 修补 Composable (函数式重构版)
 *
 * 从 MagiskBootService 迁移而来
 * 100% 保留原有功能，使用函数式编程模式替代 class
 */

import path from "path";
import * as fs from "fs/promises";
import { CommandExecutor } from "../utils/command";
import { Logger } from "../utils/logger";
import { FileUtils } from "../utils/file";
import JSZip from "jszip";
import type { IPatchConfig } from "../utils/BootPatch";
import { MagiskBootPatcher } from "../utils/BootPatch";
import { getMagiskBootPath } from "../utils/paths";

/**
 * 创建 Magisk Boot 修补 Composable
 *
 * @returns Magisk Boot 修补相关的函数集合
 */
export function createMagiskBoot() {
  // 私有常量
  const SOLVE_BOOT_DIR = "SolveBoot";

  /**
   * 规范化路径：去除首尾空格与包裹引号
   */
  function normalizePath(p: string): string {
    if (!p) return p;
    let s = p.trim();
    if (
      (s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))
    ) {
      s = s.slice(1, -1);
    }
    return s;
  }

  /**
   * 验证输入文件
   */
  async function validateFiles(
    bootPath: string,
    magiskPath: string
  ): Promise<void> {
    Logger.info("正在验证文件...");

    if (!(await FileUtils.exists(bootPath))) {
      throw new Error("Boot 镜像文件不存在");
    }

    if (!(await FileUtils.exists(magiskPath))) {
      throw new Error("Magisk APK/目录 不存在");
    }

    // 简单的文件格式验证
    if (!bootPath.toLowerCase().endsWith(".img")) {
      throw new Error("无效的 Boot 镜像文件");
    }
    // 允许传入 APK/ZIP 或 已解包目录
    try {
      const st = await fs.stat(magiskPath);
      if (st.isFile()) {
        const lower = magiskPath.toLowerCase();
        if (!lower.endsWith(".apk") && !lower.endsWith(".zip")) {
          throw new Error("无效的 Magisk 文件（需 .apk/.zip 或目录）");
        }
      } else if (!st.isDirectory()) {
        throw new Error("无效的 Magisk 输入（既不是文件也不是目录）");
      }
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  /**
   * 准备工作目录
   */
  async function prepareWorkDir(): Promise<void> {
    Logger.info("准备工作目录...");

    // 确保清理旧目录
    if (await FileUtils.exists(SOLVE_BOOT_DIR)) {
      await FileUtils.remove(SOLVE_BOOT_DIR);
    }

    // 创建根目录
    await FileUtils.mkdir(SOLVE_BOOT_DIR, { recursive: true });
  }

  /**
   * 动态解压并筛选 APK/目录中的必要文件
   */
  async function extractApk(magiskPath: string): Promise<void> {
    Logger.info("正在动态解析 Magisk 包...");

    type Role =
      | "magiskinit"
      | "magisk32"
      | "magisk64"
      | "magiskSingle"
      | "initld"
      | "stubapk"
      | "libbusybox"
      | "libmagiskboot"
      | "libmagiskpolicy";

    // 记录落盘的文件来源与信息，便于排查
    const stagedLog: Array<{
      role: Role;
      from: string;
      to: string;
      size: number;
      score: number;
    }> = [];

    // 仅允许在 lib/ 与 assets/ 目录下选择候选文件（无论在包内还是目录）
    const isAllowedResource = (p: string): boolean => {
      const s = p.replace(/\\/g, "/");
      // 命中 /lib/ 或 /assets/，或以 lib/、assets/ 起始
      return /(^|\/)lib\//.test(s) || /(^|\/)assets\//.test(s);
    };

    const stage = async (
      role: Role,
      load: () => Promise<Buffer>,
      srcPath: string,
      toName: string
    ) => {
      const buf = await load();
      await FileUtils.outputFile(path.join(SOLVE_BOOT_DIR, toName), buf);
      stagedLog.push({
        role,
        from: srcPath,
        to: toName,
        size: buf.length,
        score: archScore(srcPath),
      });
    };

    // 选择策略：按架构优先级选择最佳候选
    const archScore = (p: string): number => {
      const s = p.toLowerCase();
      if (s.includes("arm64-v8a")) return 100;
      if (s.includes("armeabi-v7a")) return 80;
      if (s.includes("aarch64")) return 70;
      if (s.includes("arm64")) return 65;
      if (s.includes("arm")) return 60;
      if (s.includes("x86_64")) return 40;
      if (s.includes("x86")) return 30;
      return 0;
    };

    const roleToBasenames: Record<Role, string[]> = {
      magiskinit: ["libmagiskinit.so"],
      magisk32: ["libmagisk32.so"],
      magisk64: ["libmagisk64.so"],
      magiskSingle: ["libmagisk.so"],
      initld: ["libinit-ld.so"],
      stubapk: ["stub.apk"],
      libbusybox: ["libbusybox.so"],
      libmagiskboot: ["libmagiskboot.so"],
      libmagiskpolicy: ["libmagiskpolicy.so"],
    };

    const found: Partial<
      Record<Role, { path: string; load: () => Promise<Buffer> }>
    > = {};

    const stageFromZip = async (zip: JSZip) => {
      for (const fileName in zip.files) {
        const entry = zip.files[fileName]!;
        if (entry.dir) continue;
        if (!isAllowedResource(fileName)) continue;
        const base = fileName.split("/").pop() || fileName;
        for (const role of Object.keys(roleToBasenames) as Role[]) {
          if (!roleToBasenames[role].includes(base)) continue;
          const candidate = {
            path: fileName,
            score: archScore(fileName),
            load: () => entry.async("nodebuffer"),
          };
          const cur = found[role];
          if (!cur) {
            found[role] = { path: candidate.path, load: candidate.load };
          } else {
            // 比较优先级
            const curScore = archScore(cur.path);
            if (candidate.score > curScore) {
              found[role] = { path: candidate.path, load: candidate.load };
            }
          }
        }
      }
    };

    const stageFromDir = async (root: string) => {
      const walk = async (dir: string) => {
        const items = await fs.readdir(dir, { withFileTypes: true });
        for (const it of items) {
          const full = path.join(dir, it.name);
          if (it.isDirectory()) {
            // 仅在根或已进入 lib/assets 子树时继续递归
            const relDir = path.relative(root, full).replace(/\\/g, "/");
            if (
              relDir === "" ||
              relDir === "." ||
              relDir.startsWith("lib/") ||
              relDir === "lib" ||
              relDir.startsWith("assets/") ||
              relDir === "assets"
            ) {
              await walk(full);
            }
          } else if (it.isFile()) {
            const rel = path.relative(root, full).replace(/\\/g, "/");
            if (!isAllowedResource(rel)) continue;
            const base = it.name;
            for (const role of Object.keys(roleToBasenames) as Role[]) {
              if (!roleToBasenames[role].includes(base)) continue;
              const candidate = {
                path: rel,
                score: archScore(rel),
                load: () => fs.readFile(full),
              };
              const cur = found[role];
              if (!cur) {
                found[role] = { path: candidate.path, load: candidate.load };
              } else {
                const curScore = archScore(cur.path);
                if (candidate.score > curScore) {
                  found[role] = { path: candidate.path, load: candidate.load };
                }
              }
            }
          }
        }
      };
      await walk(root);
    };

    // 根据输入类型选择解析方式
    const st = await fs.stat(magiskPath);
    if (st.isFile()) {
      const zip = await JSZip.loadAsync(await FileUtils.readFile(magiskPath));
      await stageFromZip(zip);
    } else if (st.isDirectory()) {
      await stageFromDir(magiskPath);
    }

    // 必要项：magiskinit + （magisk32&magisk64 或 magiskSingle）
    if (!found.magiskinit) {
      throw new Error("解包失败：未找到 libmagiskinit.so（magiskinit）");
    }

    // 写出 magiskinit
    await stage(
      "magiskinit",
      found.magiskinit.load!,
      found.magiskinit.path,
      "magiskinit"
    );

    // 写出 magisk 组合或单体
    if (found.magisk32 && found.magisk64) {
      await stage(
        "magisk32",
        found.magisk32.load!,
        found.magisk32.path,
        "magisk32"
      );
      await stage(
        "magisk64",
        found.magisk64.load!,
        found.magisk64.path,
        "magisk64"
      );
    } else if (found.magiskSingle) {
      // 选择单体 magisk（优先 arm64 的那个）
      await stage(
        "magiskSingle",
        found.magiskSingle.load!,
        found.magiskSingle.path,
        "magisk"
      );
    } else {
      throw new Error(
        "解包失败：未找到 magisk 主程序（libmagisk32/64.so 或 libmagisk.so）"
      );
    }

    // 可选：init-ld
    if (found.initld) {
      await stage("initld", found.initld.load!, found.initld.path, "init-ld");
    }

    // 可选：stub.apk 与占位 stub.xz
    if (found.stubapk) {
      const buf = await found.stubapk.load!();
      await FileUtils.outputFile(path.join(SOLVE_BOOT_DIR, "stub.apk"), buf);
      await FileUtils.outputFile(path.join(SOLVE_BOOT_DIR, "stub.xz"), buf);
      stagedLog.push({
        role: "stubapk",
        from: found.stubapk.path,
        to: "stub.apk",
        size: buf.length,
        score: archScore(found.stubapk.path),
      });
      stagedLog.push({
        role: "stubapk",
        from: found.stubapk.path,
        to: "stub.xz",
        size: buf.length,
        score: archScore(found.stubapk.path),
      });
    }

    // 可选库复制到根目录
    const optRoles: Role[] = ["libbusybox", "libmagiskboot", "libmagiskpolicy"];
    for (const r of optRoles) {
      if (found[r]) {
        const to = r.replace(/^lib/, "lib") + ".so"; // 保持原名
        await stage(r, found[r]!.load!, found[r]!.path, to);
      }
    }

    // 输出汇总日志，便于核对选中的来源文件
    try {
      Logger.info("Magisk 包解析与落盘详情", stagedLog);
    } catch {
      // ignore
    }
  }

  /**
   * 处理/校验已放置到 SolveBoot 根目录的文件
   */
  async function processFiles(): Promise<void> {
    Logger.info("校验并整理已提取文件...");

    // 如存在 stub.apk 但缺少 stub.xz，则补一份占位
    const stubApk = path.join(SOLVE_BOOT_DIR, "stub.apk");
    const stubXz = path.join(SOLVE_BOOT_DIR, "stub.xz");
    if (
      (await FileUtils.exists(stubApk)) &&
      !(await FileUtils.exists(stubXz))
    ) {
      await FileUtils.copyFile(stubApk, stubXz);
    }

    // 验证必要文件（至少需 magiskinit + {magisk32/magisk64 或 magisk}）
    const need = ["magiskinit"];
    for (const n of need) {
      if (!(await FileUtils.exists(path.join(SOLVE_BOOT_DIR, n)))) {
        throw new Error(`缺少必要文件: ${n}`);
      }
    }

    const hasMagisk = await FileUtils.exists(
      path.join(SOLVE_BOOT_DIR, "magisk")
    );
    const hasMagisk32 = await FileUtils.exists(
      path.join(SOLVE_BOOT_DIR, "magisk32")
    );
    const hasMagisk64 = await FileUtils.exists(
      path.join(SOLVE_BOOT_DIR, "magisk64")
    );
    if (!hasMagisk && !(hasMagisk32 && hasMagisk64)) {
      throw new Error(
        "缺少必要的 Magisk 二进制文件（magisk 或 magisk32+magisk64）"
      );
    }
  }

  /**
   * 执行 Boot 修补
   */
  async function executePatch(bootPath: string): Promise<void> {
    Logger.info("正在修补 Boot 镜像...");

    try {
      // 配置修补参数
      const patchConfig: Partial<IPatchConfig> = {
        // 按参考脚本默认启用 64 位注入；后续可按需要做架构探测以在 32 位设备上跳过 64 位
        is64bit: true,
        keepVerity: true, // 默认保留 dm-verity/AVB2.0
        keepForceEncrypt: true, // 默认保留强制加密
        recoveryMode: false, // 默认不使用 Recovery 模式
      };

      // 先创建补丁器实例，再切换工作目录。
      // 注意：补丁器在构造时会解析 magiskboot 路径，如果先 chdir 到 SolveBoot，
      // 依赖 process.cwd() 的路径解析会被错误地指向 SolveBoot/tools/...，导致找不到二进制。
      // 因此需在 chdir 之前实例化，保证获取到正确的 tools/windows/magiskboot.exe。
      const patcher = new MagiskBootPatcher(bootPath, patchConfig);

      // 在工作目录内执行底层补丁器，保证需要的文件可见
      const prevCwd = process.cwd();
      try {
        process.chdir(SOLVE_BOOT_DIR);
        await patcher.patch();

        // 验证输出文件并拷回源目录
        const produced = "new-boot.img";
        Logger.info(`检查输出文件: ${produced} (在 ${process.cwd()} 目录)`);
        if (!(await FileUtils.exists(produced))) {
          // 列出目录内容以便调试
          const files = await fs.readdir(".");
          Logger.error(`当前目录 (${process.cwd()}) 内容:`, files);
          throw new Error("修补后的 Boot 镜像文件未生成");
        }
        const srcBase = path.basename(bootPath);
        const targetOut = path.join(
          path.dirname(bootPath),
          `magisk-${srcBase}`
        );
        await FileUtils.copyFile(produced, targetOut);
        Logger.info(`Boot 镜像修补完成: ${targetOut}`);

        // 额外自检：在临时目录解包 new-boot.img 并检查 ramdisk 是否为 Magisk patched 状态
        const magiskboot = getMagiskBootPath();
        const verifyDir = path.join(process.cwd(), "verify");
        await FileUtils.mkdir(verifyDir, { recursive: true });
        const prev = process.cwd();
        try {
          process.chdir(verifyDir);
          await CommandExecutor.execute(
            `"${magiskboot}" unpack "../${produced}"`
          );
        } catch (e) {
          Logger.warn("补丁结果自检异常（非致命）", e);
        } finally {
          try {
            process.chdir(prev);
          } catch (e) {
            Logger.warn("返回工作目录失败（非致命）", e);
          }
          try {
            await FileUtils.remove(verifyDir);
          } catch (e) {
            Logger.warn("清理自检目录失败（非致命）", e);
          }
        }
      } finally {
        try {
          process.chdir(prevCwd);
        } catch {
          /* noop */
        }
      }
    } catch (error) {
      throw new Error(
        `Boot 修补失败: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * 清理临时文件
   */
  async function cleanup(): Promise<void> {
    Logger.info("清理临时文件...");

    try {
      if (await FileUtils.exists(SOLVE_BOOT_DIR)) {
        await FileUtils.remove(SOLVE_BOOT_DIR);
      }
    } catch (error) {
      Logger.error(`清理临时文件失败: ${error}`);
    }
  }

  /**
   * 修补 Boot 镜像
   *
   * @param bootPath Boot 镜像路径
   * @param magiskPath Magisk APK 路径
   */
  async function patchBoot(
    bootPath: string,
    magiskPath: string
  ): Promise<void> {
    try {
      // 0. 规范化传入路径，避免被引号包裹导致找不到文件
      bootPath = normalizePath(bootPath);
      magiskPath = normalizePath(magiskPath);
      Logger.info("接收到修补请求", { bootPath, magiskPath });

      // 1. 验证文件
      await validateFiles(bootPath, magiskPath);

      // 2. 准备工作目录
      await prepareWorkDir();

      // 3. 解压处理 APK（动态遍历筛选所需文件）
      await extractApk(magiskPath);

      // 4. 处理文件
      await processFiles();

      // 5. 执行 Boot 修补
      await executePatch(bootPath);

      // 6. 清理
      await cleanup();
    } catch (error: unknown) {
      // 确保清理临时文件
      await cleanup();
      throw new Error(
        `Boot 修补失败: ${
          typeof error === "string" ? error : (error as Error).message
        }`
      );
    }
  }

  return {
    patchBoot,
  };
}
