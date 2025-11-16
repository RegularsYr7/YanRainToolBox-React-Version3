/**
 * 应用管理 Composable (函数式重构版)
 *
 * 从 ApplicationManagementService 迁移而来
 * 使用函数式编程模式替代 class，去除 MVC 分层
 */

import { CommandExecutor } from "../utils/command";
import { FileUtils } from "../utils/file";
import { getAdbPath, getAaptPath } from "../utils/paths";
import { Logger } from "../utils/logger";
import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";

/** 应用基础信息 */
export interface IAppInfo {
  name: string;
  packageName: string;
  version: string;
  installDate: string;
  targetSdk: string;
}

/** 安装应用配置 */
export interface IInstallConfig {
  apkPath: string;
  replaceExisting?: boolean;
  grantPermissions?: boolean;
  allowDowngrade?: boolean;
}

/** 卸载应用配置 */
export interface IUninstallConfig {
  packageName: string;
  keepData?: boolean;
}

/**
 * 创建应用管理 Composable
 *
 * @returns 应用管理相关的函数集合
 */
export function createApplicationManagement() {
  const adbPath = getAdbPath();

  /**
   * 获取当前前台用户ID（失败则回退0）
   */
  const getCurrentUserId = async (adbCommand: string): Promise<number> => {
    try {
      const { code, output } = await CommandExecutor.execute(
        `${adbCommand} shell am get-current-user`,
        1500
      );
      if (code === 0) {
        const id = parseInt(output.trim(), 10);
        if (!Number.isNaN(id)) return id;
      }
    } catch {
      // ignore
    }
    return 0;
  };

  /**
   * 解析包列表输出
   */
  const parsePackageList = (output: string): string[] => {
    const set = new Set<string>();
    if (!output) return [];
    const lines = output.split(/\r?\n/);

    for (const raw of lines) {
      if (!raw) continue;
      const line = raw.trim();
      if (!line.startsWith("package:")) continue;

      const body = line.slice("package:".length).trim();
      let pkg = "";
      const eq = body.lastIndexOf("=");
      if (eq !== -1) {
        pkg = body.slice(eq + 1).trim();
      } else {
        pkg = body.split(/\s+/)[0].trim();
      }
      if (pkg) set.add(pkg);
    }

    return Array.from(set);
  };

  /**
   * 解析单个应用信息
   */
  const parseApplicationInfo = (
    packageName: string,
    output: string
  ): IAppInfo | null => {
    try {
      const lines = output.split(/\r?\n/);
      let name = packageName;
      let version = "未知";
      let installDate = "未知";
      let targetSdk = "未知";
      let foundLabel = false;

      for (const line of lines) {
        const trimmedLine = line.trim();

        // 优先级1: application-label (多语言标签) - 支持多种格式
        // 格式1: application-label:'应用名'
        // 格式2: application-label-zh-CN:'应用名'
        // 格式3: application-label:'应用名'
        if (trimmedLine.startsWith("application-label")) {
          const match = trimmedLine.match(
            /application-label[^:]*:\s*'?(.+?)'?\s*$/
          );
          if (match && match[1]) {
            const lbl = match[1].trim().replace(/^'|'$/g, ""); // 去除首尾引号
            if (lbl && lbl.toLowerCase() !== "null" && !lbl.startsWith("0x")) {
              name = lbl;
              foundLabel = true;
              continue;
            }
          }
        }

        // 优先级2: nonLocalizedLabel (非本地化标签)
        if (!foundLabel && name === packageName) {
          const nl = trimmedLine.match(/\bnonLocalizedLabel=(.+?)(?:\s|$)/);
          if (nl && nl[1]) {
            const lbl = nl[1].trim();
            if (lbl && lbl.toLowerCase() !== "null" && !lbl.startsWith("0x")) {
              name = lbl;
              foundLabel = true;
            }
          }
        }

        // 版本信息
        if (trimmedLine.startsWith("versionName=")) {
          version = trimmedLine.split("=")[1]?.trim() || "未知";
        }

        // 安装日期
        if (trimmedLine.startsWith("firstInstallTime=")) {
          const timeStr = trimmedLine.split("=")[1];
          if (timeStr) {
            installDate = new Date(timeStr).toLocaleDateString();
          }
        }

        // 目标 SDK
        if (trimmedLine.startsWith("targetSdk=")) {
          targetSdk = trimmedLine.split("=")[1]?.trim() || "未知";
        }
      }

      // 如果没有找到应用名称，记录警告
      if (!foundLabel && name === packageName) {
        Logger.warn(`[AppInfo] 未找到 ${packageName} 的应用名称标签`);
      }

      return {
        name,
        packageName,
        version,
        installDate,
        targetSdk,
      };
    } catch (error) {
      Logger.error(`解析 ${packageName} 信息失败: ${(error as Error).message}`);
      return null;
    }
  };

  /**
   * 从 APK 路径中提取应用名称（使用本地 aapt 工具）
   */
  const getAppNameFromApk = async (
    apkPath: string,
    deviceSerialNumber?: string
  ): Promise<string | null> => {
    try {
      // 跳过需要 root 权限的路径
      if (apkPath.startsWith("/data/app/")) {
        return null;
      }

      const adbCommand = deviceSerialNumber
        ? `${adbPath} -s ${deviceSerialNumber}`
        : `${adbPath}`;
      const aaptPath = getAaptPath();

      // 创建临时文件路径
      const tempDir = os.tmpdir();
      const tempApk = path.join(tempDir, `temp_${Date.now()}.apk`);

      try {
        // 1. 从设备拉取 APK 到本地临时目录（增加超时）
        const pullCmd = `${adbCommand} pull "${apkPath}" "${tempApk}"`;
        const { code: pullCode, output: pullOutput } =
          await CommandExecutor.execute(pullCmd, 8000);

        if (pullCode !== 0) {
          // 只对非权限错误输出警告
          if (!pullOutput.includes("Permission denied")) {
            Logger.warn(`拉取 APK 失败: ${apkPath} - ${pullOutput}`);
          }
          return null;
        }

        // 验证文件是否真的存在
        if (!(await FileUtils.exists(tempApk))) {
          return null;
        }

        // 2. 使用本地 aapt 解析 APK（增加超时）
        const aaptCmd = `"${aaptPath}" dump badging "${tempApk}"`;
        const { code, output } = await CommandExecutor.execute(aaptCmd, 3000, {
          maxBuffer: 5 * 1024 * 1024,
        });

        if (code === 0 && output) {
          // 解析 application-label:'应用名'
          const match = output.match(/application-label(?::[^:]+)?:'([^']+)'/);
          if (match && match[1]) {
            const label = match[1].trim();
            if (label && label.toLowerCase() !== "null") {
              Logger.info(`[AAPT] 成功提取应用名称: ${label} <- ${apkPath}`);
              return label;
            }
          }
        }
      } finally {
        // 3. 清理临时文件
        try {
          if (await FileUtils.exists(tempApk)) {
            await fs.unlink(tempApk);
          }
        } catch {
          // 忽略清理错误
        }
      }
    } catch {
      // 静默失败，aapt 可能不可用
    }
    return null;
  };

  /**
   * 获取单个应用的详细信息
   */
  const getApplicationInfo = async (
    packageName: string,
    deviceSerialNumber?: string
  ): Promise<IAppInfo | null> => {
    try {
      const adbCommand = deviceSerialNumber
        ? `${adbPath} -s ${deviceSerialNumber}`
        : `${adbPath}`;

      let parsedInfo: IAppInfo | null = null;

      // 方法1: 尝试通过启动器查询获取应用名称（最快）
      {
        const { code, output } = await CommandExecutor.execute(
          `${adbCommand} shell cmd package query-activities --brief ${packageName}`,
          1000
        );
        if (code === 0 && output) {
          // 输出格式: package:com.example label:应用名
          const labelMatch = output.match(/label:(.+?)(?:\s|$)/);
          if (labelMatch && labelMatch[1]) {
            const label = labelMatch[1].trim();
            if (label && label !== packageName && !label.startsWith("0x")) {
              parsedInfo = {
                name: label,
                packageName,
                version: "未知",
                installDate: "未知",
                targetSdk: "未知",
              };
            }
          }
        }
      }

      // 方法2: 使用 dumpsys package 获取详细信息
      {
        const { code, output } = await CommandExecutor.execute(
          `${adbCommand} shell dumpsys package ${packageName}`,
          1500,
          { maxBuffer: 5 * 1024 * 1024 }
        );
        if (code === 0 && output) {
          const info = parseApplicationInfo(packageName, output);
          if (info) {
            // 如果方法1已经获取到名称，保留它
            if (parsedInfo && parsedInfo.name !== packageName) {
              parsedInfo.version = info.version;
              parsedInfo.installDate = info.installDate;
              parsedInfo.targetSdk = info.targetSdk;
            } else {
              parsedInfo = info;
            }

            // 如果已经有名称了，直接返回
            if (parsedInfo.name !== packageName) {
              return parsedInfo;
            }
          }
        }
      }

      // 方法3: 使用 pm dump (备用方案)
      if (!parsedInfo || parsedInfo.version === "未知") {
        const { code, output } = await CommandExecutor.execute(
          `${adbCommand} shell pm dump ${packageName}`,
          1500,
          { maxBuffer: 5 * 1024 * 1024 }
        );
        if (code === 0 && output) {
          const info = parseApplicationInfo(packageName, output);
          if (info) {
            if (parsedInfo) {
              // 合并信息
              if (
                parsedInfo.name === packageName &&
                info.name !== packageName
              ) {
                parsedInfo.name = info.name;
              }
              if (parsedInfo.version === "未知")
                parsedInfo.version = info.version;
              if (parsedInfo.installDate === "未知")
                parsedInfo.installDate = info.installDate;
              if (parsedInfo.targetSdk === "未知")
                parsedInfo.targetSdk = info.targetSdk;
            } else {
              parsedInfo = info;
            }
          }
        }
      }

      // 方法4: 如果仍然没有名称，尝试从 APK 中提取（仅系统应用）
      if (parsedInfo && parsedInfo.name === packageName) {
        // 获取 APK 路径
        const { code, output } = await CommandExecutor.execute(
          `${adbCommand} shell pm path ${packageName}`,
          1000
        );
        if (code === 0 && output) {
          const match = output.match(/package:(.+)/);
          if (match) {
            const apkPath = match[1].trim();
            // 只对系统应用路径尝试 AAPT 提取
            if (
              !apkPath.startsWith("/data/app/") ||
              apkPath.includes("/system/") ||
              apkPath.includes("/product/") ||
              apkPath.includes("/vendor/") ||
              apkPath.includes("/apex/")
            ) {
              const appName = await getAppNameFromApk(
                apkPath,
                deviceSerialNumber
              );
              if (appName) {
                parsedInfo.name = appName;
                return parsedInfo;
              }
            }
          }
        }
      }

      // 如果所有方法都失败，返回基础信息
      return (
        parsedInfo || {
          name: packageName,
          packageName,
          version: "未知",
          installDate: "未知",
          targetSdk: "未知",
        }
      );
    } catch (error) {
      Logger.error(
        `获取 ${packageName} 详细信息失败: ${(error as Error).message}`
      );
      return null;
    }
  };

  /**
   * 启动应用
   */
  const startApplication = async (
    packageName: string,
    deviceSerialNumber?: string
  ): Promise<void> => {
    const adbCommand = deviceSerialNumber
      ? `${adbPath} -s ${deviceSerialNumber}`
      : `${adbPath}`;

    try {
      Logger.info(`启动应用: ${packageName}`);

      const resolveCmd = `${adbCommand} shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER ${packageName}`;
      let res = await CommandExecutor.execute(resolveCmd, 2000);
      let component = "";

      if (res.code === 0 && res.output) {
        const line = res.output.trim().split(/\r?\n/).pop() || "";
        if (line.includes("/")) component = line.trim();
      }

      if (!component) {
        const resolvePm = `${adbCommand} shell pm resolve-activity -a android.intent.action.MAIN -c android.intent.category.LAUNCHER ${packageName}`;
        res = await CommandExecutor.execute(resolvePm, 2000);
        if (res.code === 0 && res.output) {
          const m = res.output.match(/\b([a-zA-Z0-9_.]+\/[a-zA-Z0-9_.$]+)\b/);
          if (m) component = m[1];
        }
      }

      if (component) {
        const startCmd = `${adbCommand} shell am start -W -n ${component}`;
        const { code, output } = await CommandExecutor.execute(startCmd, 4000);
        if (code === 0) return;
        Logger.warn?.(`am start 返回非0，改用 monkey: ${output}`);
      }

      const monkeyCmd = `${adbCommand} shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`;
      const { code, output } = await CommandExecutor.execute(monkeyCmd, 5000);
      if (code !== 0) {
        throw new Error(output || "monkey 启动失败");
      }
    } catch (error) {
      const msg = `启动应用失败: ${(error as Error).message}`;
      Logger.error(msg);
      throw new Error(msg);
    }
  };

  /**
   * 强行停止应用
   */
  const forceStopApplication = async (
    packageName: string,
    deviceSerialNumber?: string
  ): Promise<void> => {
    const adbCommand = deviceSerialNumber
      ? `${adbPath} -s ${deviceSerialNumber}`
      : `${adbPath}`;

    try {
      Logger.info(`停止应用: ${packageName}`);
      const userId = await getCurrentUserId(adbCommand);

      let res = await CommandExecutor.execute(
        `${adbCommand} shell am force-stop --user ${userId} ${packageName}`,
        3000
      );
      if (res.code === 0) return;

      Logger.warn?.(
        `am force-stop 失败，尝试 cmd activity force-stop: ${res.output}`
      );
      res = await CommandExecutor.execute(
        `${adbCommand} shell cmd activity force-stop ${packageName} --user ${userId}`,
        3000
      );
      if (res.code === 0) return;

      Logger.warn?.(
        `cmd activity force-stop 失败，尝试 am kill: ${res.output}`
      );
      res = await CommandExecutor.execute(
        `${adbCommand} shell am kill --user ${userId} ${packageName}`,
        3000
      );
      if (res.code !== 0) throw new Error(res.output || "停止失败");
    } catch (error) {
      const msg = `停止应用失败: ${(error as Error).message}`;
      Logger.error(msg);
      throw new Error(msg);
    }
  };

  /**
   * 冻结应用
   */
  const freezeApplication = async (
    packageName: string,
    deviceSerialNumber?: string
  ): Promise<void> => {
    const adbCommand = deviceSerialNumber
      ? `${adbPath} -s ${deviceSerialNumber}`
      : `${adbPath}`;

    try {
      Logger.info(`冻结应用: ${packageName}`);
      const userId = await getCurrentUserId(adbCommand);

      let res = await CommandExecutor.execute(
        `${adbCommand} shell cmd package suspend ${packageName} --user ${userId}`,
        3000
      );
      if (res.code === 0) return;

      Logger.warn?.(`suspend 失败，回退 disable-user: ${res.output}`);
      res = await CommandExecutor.execute(
        `${adbCommand} shell pm disable-user --user ${userId} ${packageName}`,
        3000
      );
      if (res.code === 0) return;

      Logger.warn?.(
        `pm disable-user 失败，回退 set-enabled disabled-user: ${res.output}`
      );
      res = await CommandExecutor.execute(
        `${adbCommand} shell cmd package set-enabled --user ${userId} disabled-user ${packageName}`,
        3000
      );
      if (res.code !== 0) throw new Error(res.output || "冻结失败");
    } catch (error) {
      const msg = `冻结应用失败: ${(error as Error).message}`;
      Logger.error(msg);
      throw new Error(msg);
    }
  };

  /**
   * 解冻应用
   */
  const unfreezeApplication = async (
    packageName: string,
    deviceSerialNumber?: string
  ): Promise<void> => {
    const adbCommand = deviceSerialNumber
      ? `${adbPath} -s ${deviceSerialNumber}`
      : `${adbPath}`;

    try {
      Logger.info(`解冻应用: ${packageName}`);
      const userId = await getCurrentUserId(adbCommand);

      let res = await CommandExecutor.execute(
        `${adbCommand} shell cmd package unsuspend ${packageName} --user ${userId}`,
        3000
      );
      if (res.code !== 0) {
        Logger.warn?.(`unsuspend 失败，继续恢复 enabled 状态: ${res.output}`);
      }

      res = await CommandExecutor.execute(
        `${adbCommand} shell pm enable --user ${userId} ${packageName}`,
        3000
      );
      if (res.code === 0) return;

      Logger.warn?.(`pm enable 失败，回退 set-enabled default: ${res.output}`);
      res = await CommandExecutor.execute(
        `${adbCommand} shell cmd package set-enabled --user ${userId} default ${packageName}`,
        3000
      );
      if (res.code !== 0) throw new Error(res.output || "解冻失败");
    } catch (error) {
      const msg = `解冻应用失败: ${(error as Error).message}`;
      Logger.error(msg);
      throw new Error(msg);
    }
  };

  /**
   * 提取 APK 到指定路径
   */
  const extractApkToPath = async (
    packageName: string,
    outputApkPath: string,
    deviceSerialNumber?: string
  ): Promise<void> => {
    const adbCommand = deviceSerialNumber
      ? `${adbPath} -s ${deviceSerialNumber}`
      : `${adbPath}`;

    try {
      Logger.info(`提取 APK: ${packageName} -> ${outputApkPath}`);

      const { code: pcode, output: pout } = await CommandExecutor.execute(
        `${adbCommand} shell pm path ${packageName}`,
        3000
      );
      if (pcode !== 0 || !pout) throw new Error(pout || "pm path 失败");

      const remote = (
        pout
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.startsWith("package:"))
          .pop() || ""
      ).replace(/^package:\s*/, "");

      if (!remote) throw new Error(`未能获取 ${packageName} 的APK路径`);

      await FileUtils.ensureDir(path.dirname(outputApkPath));
      const pullCmd = `${adbCommand} pull "${remote}" "${outputApkPath}"`;
      const { code, output } = await CommandExecutor.execute(pullCmd, 20000);
      if (code !== 0) throw new Error(output || "adb pull 失败");

      Logger.info(`提取 APK 成功: ${outputApkPath}`);
    } catch (error) {
      const msg = `提取 APK 失败: ${(error as Error).message}`;
      Logger.error(msg);
      throw new Error(msg);
    }
  };

  /**
   * 获取所有已安装应用
   */
  const getAllApplications = async (
    deviceSerialNumber?: string
  ): Promise<IAppInfo[]> => {
    try {
      const adbCommand = deviceSerialNumber
        ? `${adbPath} -s ${deviceSerialNumber}`
        : `${adbPath}`;

      // 使用 pm list packages -3 获取第三方应用（通常有完整信息）
      // 然后用 pm list packages -s 获取系统应用
      // 这样可以分别处理，提高成功率
      const listCandidates = [
        `${adbCommand} shell pm list packages --user 0`,
        `${adbCommand} shell pm list packages`,
        `${adbCommand} shell cmd package list packages --user 0`,
        `${adbCommand} shell cmd package list packages`,
      ];

      let packages: string[] = [];
      let lastOutput = "";

      for (const cmd of listCandidates) {
        const { code, output } = await CommandExecutor.execute(cmd, 8000);
        lastOutput = output;
        packages = parsePackageList(output);
        Logger.info(`包列表命令尝试: ${cmd} -> 解析到 ${packages.length} 个包`);
        if (code === 0 && packages.length > 0) break;
      }

      if (packages.length === 0) {
        const fallbackCmds = [
          `${adbCommand} shell pm list packages`,
          `${adbCommand} shell cmd package list packages`,
        ];
        for (const cmd of fallbackCmds) {
          const { code, output } = await CommandExecutor.execute(cmd, 12000);
          lastOutput = output;
          packages = parsePackageList(output);
          Logger.info(
            `包列表兜底命令: ${cmd} -> 解析到 ${packages.length} 个包`
          );
          if (code === 0 && packages.length > 0) break;
        }
      }

      if (packages.length === 0) {
        throw new Error(`获取包列表失败: ${lastOutput}`);
      }

      const isLarge = packages.length >= 250;
      const budgetMs = isLarge ? 20000 : 12000; // 增加时间预算到20秒

      if (!isLarge) {
        Logger.info(
          `找到 ${packages.length} 个包，先执行一次性 dumpsys 以加速...`
        );
      } else {
        Logger.info(
          `包数较多(${packages.length})，使用批量+并发策略获取应用信息...`
        );
        Logger.info(
          `仅提取系统应用名称（/system、/product、/vendor），用户应用跳过 AAPT`
        );
      }

      const t0 = Date.now();

      // 策略：直接使用并发查询每个应用，不再依赖 dumpsys package
      // 因为 dumpsys package 输出中没有 application-label
      const applications: IAppInfo[] = packages.map((pkg) => ({
        name: pkg,
        packageName: pkg,
        version: "未知",
        installDate: "未知",
        targetSdk: "未知",
      }));

      // 分批并发获取应用详细信息
      const batchSize = 30; // 每批30个（增加批大小）
      const maxConcurrent = isLarge ? 8 : 12; // 减少并发数（避免拥塞）

      Logger.info(
        `开始分批并发获取应用信息，批大小=${batchSize}，并发数=${maxConcurrent}`
      );

      for (
        let batchStart = 0;
        batchStart < applications.length;
        batchStart += batchSize
      ) {
        if (Date.now() - t0 > budgetMs - 1000) {
          Logger.warn(
            `获取应用信息超时，已处理 ${batchStart}/${applications.length} 个应用`
          );
          break;
        }

        const batchEnd = Math.min(batchStart + batchSize, applications.length);
        const batch = applications.slice(batchStart, batchEnd);

        let cursor = 0;
        const workers: Promise<void>[] = [];

        for (let k = 0; k < maxConcurrent && cursor < batch.length; k++) {
          const worker = (async () => {
            while (cursor < batch.length) {
              const localIndex = cursor++;
              const globalIndex = batchStart + localIndex;
              const app = applications[globalIndex];

              if (Date.now() - t0 > budgetMs - 500) break;

              try {
                const info = await getApplicationInfo(
                  app.packageName,
                  deviceSerialNumber
                );
                if (info) {
                  applications[globalIndex] = info;
                }
              } catch {
                // 保持默认值
              }
            }
          })();
          workers.push(worker);
        }

        await Promise.all(workers);

        const progress = Math.round((batchEnd / applications.length) * 100);
        const withNamesNow = applications.filter(
          (a) => a.name !== a.packageName
        ).length;
        Logger.info(
          `批次进度: ${batchEnd}/${applications.length} (${progress}%) - 已提取 ${withNamesNow} 个应用名称`
        );
      }

      const dt = Date.now() - t0;
      const withNames = applications.filter(
        (a) => a.name !== a.packageName
      ).length;
      const withVersion = applications.filter(
        (a) => a.version !== "未知"
      ).length;

      Logger.info(
        `✅ 成功获取 ${applications.length} 个应用信息，耗时 ${dt} ms\n` +
          `📱 ${withNames} 个有真实名称 (${Math.round(
            (withNames / applications.length) * 100
          )}%)\n` +
          `📊 ${withVersion} 个有版本信息 (${Math.round(
            (withVersion / applications.length) * 100
          )}%)`
      );

      return applications;
    } catch (error) {
      const errorMsg = `获取应用列表失败: ${(error as Error).message}`;
      Logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  };

  /**
   * 安装应用
   */
  const installApplication = async (
    config: IInstallConfig,
    deviceSerialNumber?: string
  ): Promise<void> => {
    try {
      Logger.info(`开始安装应用: ${config.apkPath}`);

      if (!(await FileUtils.exists(config.apkPath))) {
        throw new Error(`APK文件不存在: ${config.apkPath}`);
      }

      const adbCommand = deviceSerialNumber
        ? `${adbPath} -s ${deviceSerialNumber}`
        : `${adbPath}`;

      let installCommand = `${adbCommand} install`;

      if (config.allowDowngrade) installCommand += " -d";
      if (config.replaceExisting) installCommand += " -r";
      if (config.grantPermissions) installCommand += " -g";

      installCommand += ` "${config.apkPath}"`;

      const { code, output } = await CommandExecutor.execute(installCommand);

      if (code !== 0 || !output.includes("Success")) {
        throw new Error(`安装失败: ${output}`);
      }

      Logger.info("应用安装成功");
    } catch (error) {
      const errorMsg = `安装应用失败: ${(error as Error).message}`;
      Logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  };

  /**
   * 卸载应用
   */
  const uninstallApplication = async (
    config: IUninstallConfig,
    deviceSerialNumber?: string
  ): Promise<void> => {
    try {
      Logger.info(`开始卸载应用: ${config.packageName}`);

      const adbCommand = deviceSerialNumber
        ? `${adbPath} -s ${deviceSerialNumber}`
        : `${adbPath}`;

      let uninstallCommand = `${adbCommand} uninstall`;

      if (config.keepData) uninstallCommand += " -k";

      uninstallCommand += ` ${config.packageName}`;

      const { code, output } = await CommandExecutor.execute(uninstallCommand);

      if (code !== 0 || !output.includes("Success")) {
        throw new Error(`卸载失败: ${output}`);
      }

      Logger.info("应用卸载成功");
    } catch (error) {
      const errorMsg = `卸载应用失败: ${(error as Error).message}`;
      Logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  };

  /**
   * 启用应用
   */
  const enableApplication = async (
    packageName: string,
    deviceSerialNumber?: string
  ): Promise<void> => {
    try {
      Logger.info(`启用应用: ${packageName}`);

      const adbCommand = deviceSerialNumber
        ? `${adbPath} -s ${deviceSerialNumber}`
        : `${adbPath}`;

      const userId = await getCurrentUserId(adbCommand);
      let res = await CommandExecutor.execute(
        `${adbCommand} shell pm enable --user ${userId} ${packageName}`
      );
      if (res.code === 0) return;

      Logger.warn?.(`pm enable 失败，回退 set-enabled enabled: ${res.output}`);
      res = await CommandExecutor.execute(
        `${adbCommand} shell cmd package set-enabled --user ${userId} enabled ${packageName}`
      );
      if (res.code !== 0) throw new Error(`启用失败: ${res.output}`);

      Logger.info("应用启用成功");
    } catch (error) {
      const errorMsg = `启用应用失败: ${(error as Error).message}`;
      Logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  };

  /**
   * 禁用应用
   */
  const disableApplication = async (
    packageName: string,
    deviceSerialNumber?: string
  ): Promise<void> => {
    try {
      Logger.info(`禁用应用: ${packageName}`);

      const adbCommand = deviceSerialNumber
        ? `${adbPath} -s ${deviceSerialNumber}`
        : `${adbPath}`;

      const userId = await getCurrentUserId(adbCommand);
      let res = await CommandExecutor.execute(
        `${adbCommand} shell pm disable-user --user ${userId} ${packageName}`
      );
      if (res.code === 0) return;

      Logger.warn?.(
        `pm disable-user 失败，回退 set-enabled disabled-user: ${res.output}`
      );
      res = await CommandExecutor.execute(
        `${adbCommand} shell cmd package set-enabled --user ${userId} disabled-user ${packageName}`
      );
      if (res.code !== 0) throw new Error(`禁用失败: ${res.output}`);

      Logger.info("应用禁用成功");
    } catch (error) {
      const errorMsg = `禁用应用失败: ${(error as Error).message}`;
      Logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  };

  /**
   * 清理应用数据
   */
  const clearApplicationData = async (
    packageName: string,
    deviceSerialNumber?: string
  ): Promise<void> => {
    try {
      Logger.info(`清理应用数据: ${packageName}`);

      const adbCommand = deviceSerialNumber
        ? `${adbPath} -s ${deviceSerialNumber}`
        : `${adbPath}`;

      const userId = await getCurrentUserId(adbCommand);
      let res = await CommandExecutor.execute(
        `${adbCommand} shell pm clear --user ${userId} ${packageName}`
      );
      if (res.code === 0 && res.output.includes("Success")) return;

      Logger.warn?.(`pm clear 失败，尝试不带 --user: ${res.output}`);
      res = await CommandExecutor.execute(
        `${adbCommand} shell pm clear ${packageName}`
      );
      if (res.code !== 0 || !res.output.includes("Success")) {
        throw new Error(`清理失败: ${res.output}`);
      }

      Logger.info("应用数据清理成功");
    } catch (error) {
      const errorMsg = `清理应用数据失败: ${(error as Error).message}`;
      Logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  };

  // 返回所有公开函数
  return {
    getAllApplications,
    installApplication,
    uninstallApplication,
    startApplication,
    forceStopApplication,
    freezeApplication,
    unfreezeApplication,
    extractApkToPath,
    enableApplication,
    disableApplication,
    clearApplicationData,
  };
}
