/**
 * 备份镜像 Composable (函数式重构版)
 *
 * 从 BackupImageService 迁移而来
 * 100% 保留原有功能，使用函数式编程模式替代 class
 */

import { CommandExecutor } from "../utils/command";
import { FileUtils } from "../utils/file";
import path from "path";
import fs from "fs";
import JSZip from "jszip";
import { getAdbPath, getFastbootPath } from "../utils/paths";
import type { BackupProgress } from "../../types/electron-types";

/**
 * 备份配置接口
 */
export interface IBackupConfig {
  outputPath: string;
  deviceModel: string;
  romVersion: string;
  includeFastbootTools?: boolean;
  serialNumber?: string;
  /** 可选：要排除的分区名列表（按 by-name 名称匹配，精确匹配） */
  excludePartitions?: string[];
}

/**
 * 创建备份镜像 Composable
 *
 * @param config 备份配置
 * @param onProgress 进度回调函数
 * @returns 备份相关的函数集合
 */
export function createBackupImage(
  config: IBackupConfig,
  onProgress?: (progress: BackupProgress) => void
) {
  // 私有状态（闭包）
  const backupFolderName = `BackupImages-${config.deviceModel}-${
    config.romVersion
  }-${getTimeStamp()}`;
  const backupFolderPath = path.join(config.outputPath, backupFolderName);
  const adbPath = getAdbPath();
  let phoneTmpDir = "/sdcard/YanRainBackup"; // 手机端临时输出目录（固定使用 /sdcard）

  /**
   * 获取时间戳
   */
  function getTimeStamp(): string {
    const now = new Date();
    return now.toISOString().slice(0, 10).replace(/-/g, "");
  }

  /**
   * 进度上报工具
   */
  function reportProgress(progress: BackupProgress): void {
    try {
      onProgress?.(progress);
    } catch {
      // ignore reporting errors
    }
  }

  /**
   * 使用 execFile 方式调用 ADB，避免路径引号问题
   */
  async function adb(args: string[], timeout = 1000 * 60 * 60) {
    const prefix = config.serialNumber ? ["-s", config.serialNumber] : [];
    return CommandExecutor.executeFile(adbPath, [...prefix, ...args], timeout);
  }

  /**
   * 检查设备Root状态
   */
  async function checkRootStatus(): Promise<void> {
    // 尝试方式1：id -u 返回 0
    const r1 = await adb(["shell", "su", "-c", "id -u"], 30000);
    const out1 = (r1.output || "").trim();
    const ok1 = r1.code === 0 && /(^|\b)0(\b|$)/.test(out1);
    if (ok1) return;

    // 尝试方式2：id 输出包含 uid=0
    const r2 = await adb(["shell", "su", "-c", "id"], 30000);
    const out2 = (r2.output || "").trim();
    const ok2 = r2.code === 0 && /uid=0/.test(out2);
    if (ok2) return;

    throw new Error("设备未Root，无法进行分区备份");
  }

  /**
   * 以多种方式尝试创建手机目录
   */
  async function createDir(dir: string): Promise<boolean> {
    const verify = async (): Promise<boolean> => {
      const v = await adb(["shell", "ls", "-ld", dir], 10000);
      return v.code === 0;
    };

    // 先用非 root 参数化调用：adb shell mkdir -p <dir>
    await adb(["shell", "mkdir", "-p", dir], 20000);
    if (await verify()) return true;

    // 可选：尝试设置权限
    await adb(["shell", "chmod", "0777", dir], 10000);
    if (await verify()) return true;

    // 再用 su 尝试（通过 sh -c 包一层，确保 su -c 接收单字符串）
    const inner = `mkdir -p '${dir}' && (chmod 0777 '${dir}' || true)`;
    const wrapped = `su -c "${inner.replace(/"/g, '\\"')}"`;
    await adb(["shell", "sh", "-c", wrapped], 20000);
    if (await verify()) return true;

    return false;
  }

  /**
   * 选择并创建手机端临时目录（固定为 /sdcard/YanRainBackup）
   */
  async function ensurePhoneTmpDir(): Promise<void> {
    const dest = "/sdcard/YanRainBackup";
    const ok = await createDir(dest);
    phoneTmpDir = dest;
    if (ok) {
      reportProgress({
        stage: "检查设备",
        progress: 5,
        message: `使用手机临时目录: ${dest}`,
      });
      return;
    }

    throw new Error("无法创建 /sdcard/YanRainBackup，请确认设备存储权限并重试");
  }

  /**
   * 删除手机端临时目录（清理）
   */
  async function cleanupPhoneTmpDir(): Promise<void> {
    // 清理当前 phoneTmpDir 指向的目录
    await adb(["shell", "su", "-c", `rm -rf '${phoneTmpDir}'`]);

    // 明确清理整个根目录和脚本文件，确保完全清理
    await adb(
      ["shell", "su", "-c", "rm -f /sdcard/YanRainBackupScript.sh"],
      20000
    );
    await adb(["shell", "su", "-c", "rm -rf /sdcard/YanRainBackup"], 20000);

    // 验证清理是否成功
    const verifyResult = await adb(
      ["shell", "ls", "-la", "/sdcard/YanRainBackup"],
      10000
    );

    // 如果目录仍然存在，说明清理失败
    if (verifyResult.code === 0) {
      console.warn("警告：手机端备份目录清理可能未完全成功");
    }
  }

  /**
   * 创建必要的文件夹
   */
  async function createBackupFolders(): Promise<void> {
    // 选择并创建手机端临时目录
    await ensurePhoneTmpDir();
    // 在电脑上创建输出目录
    await FileUtils.ensureDir(backupFolderPath);
    await FileUtils.ensureDir(path.join(backupFolderPath, "images"));
  }

  /**
   * 导出镜像到电脑
   */
  async function exportToComputer(): Promise<void> {
    const dest = path.join(backupFolderPath, "images");

    // 确保目标目录存在
    await FileUtils.ensureDir(dest);

    console.log(`开始导出，源目录: ${phoneTmpDir}，目标目录: ${dest}`);

    // 修复导出逻辑：直接拉取images目录中的所有文件
    const { code, output } = await adb(["pull", `${phoneTmpDir}/.`, dest], 0);

    console.log(`导出命令执行完成，返回码: ${code}，输出: ${output}`);

    if (code !== 0) {
      throw new Error(`导出备份失败: ${output}`);
    }

    // 验证导出结果
    try {
      const exportedFiles = await fs.promises.readdir(dest);
      console.log(
        `导出完成，发现${exportedFiles.length}个文件:`,
        exportedFiles
      );

      if (exportedFiles.length === 0) {
        throw new Error("导出完成但未发现任何文件，可能手机端备份失败");
      }
    } catch (error) {
      console.error("验证导出结果时出错:", error);
      throw new Error(`导出验证失败: ${(error as Error).message}`);
    }
  }

  /**
   * 通过推送并执行脚本的方式进行整机分区备份并导出
   */
  async function backupViaScript(): Promise<void> {
    // 1) 在本地生成脚本文件内容
    const script = `#!/system/bin/sh
dk=$1
echo "开始执行备份脚本，分区目录: $dk"
if [ -d /sdcard/YanRainBackup/backup ]; then
  echo "清理现有备份目录"
  rm -rf /sdcard/YanRainBackup/backup/images
  mkdir -p /sdcard/YanRainBackup/backup/images
else
  echo "创建新备份目录"
  mkdir -p /sdcard/YanRainBackup/backup/images
fi

echo "开始列举分区"
for fs in $(ls $dk/ | grep -vE '(userdata|cust|modem|exaid|cache|mmcblk0|recovery|super|system|vendor|product|sda|sdb|sdc|sdd|sde|sdf|sdg|rannki)'); do
  echo "备份分区：$fs"
  dd if=$dk/$fs of=/sdcard/YanRainBackup/backup/images/$fs.img 2>&1
  echo "完成分区：$fs"
done
sync
echo "备份脚本执行完毕"
exit
`;

    // 2) 写入到本地临时路径并推送到设备 (15-20%)
    const localScriptPath = path.join(
      backupFolderPath,
      "YanRainBackupScript.sh"
    );
    await fs.promises.writeFile(localScriptPath, script, "utf8");
    reportProgress({
      stage: "备份分区",
      progress: 20,
      message: "推送备份脚本到设备",
    });
    let r = await adb(
      ["push", localScriptPath, "/sdcard/YanRainBackupScript.sh"],
      120000
    );
    if (r.code !== 0) throw new Error(`推送脚本失败: ${r.output}`);

    // 3) 自动检测分区目录 (20-25%)
    reportProgress({
      stage: "备份分区",
      progress: 25,
      message: "检测设备分区目录",
    });
    let dk = "";
    const p1 = await adb(
      ["shell", "ls", "-d", "/dev/block/bootdevice/by-name"],
      15000
    );
    if (p1.code === 0) {
      dk = "/dev/block/bootdevice/by-name";
    } else {
      const p2 = await adb(["shell", "ls", "-d", "/dev/block/by-name"], 15000);
      if (p2.code === 0) dk = "/dev/block/by-name";
    }
    if (!dk) throw new Error("设备上未找到 by-name 分区目录");

    // 4) 执行备份脚本 (25-75%)
    reportProgress({
      stage: "备份分区",
      progress: 30,
      message: "执行分区备份脚本，请稍候…",
    });

    // 先测试脚本是否存在且可读
    const testScript = await adb(
      ["shell", "ls", "-la", "/sdcard/YanRainBackupScript.sh"],
      10000
    );
    if (testScript.code !== 0)
      throw new Error(`脚本文件不存在或无法访问: ${testScript.output}`);

    // 再测试su权限
    const testSu = await adb(["shell", "su", "-c", "id"], 15000);
    if (testSu.code !== 0) throw new Error(`su权限测试失败: ${testSu.output}`);

    // 直接调用备份脚本
    r = await adb(
      [
        "shell",
        "su",
        "-c",
        `"sh /sdcard/YanRainBackupScript.sh ${dk} && exit"`,
      ],
      1800000 // 30分钟超时，备份可能较久
    );
    if (r.code !== 0) throw new Error(`手机端备份脚本执行失败: ${r.output}`);

    // 5) 导出备份文件到电脑 (75-85%)
    phoneTmpDir = "/sdcard/YanRainBackup/backup/images";
    reportProgress({
      stage: "备份分区",
      progress: 75,
      message: "导出备份文件到电脑",
    });
    await exportToComputer();
  }

  /**
   * 生成刷机脚本
   */
  async function generateFlashScript(): Promise<void> {
    const imagesPath = path.join(backupFolderPath, "images");

    // 检查images目录是否存在
    try {
      const files = await fs.promises.readdir(imagesPath);
      console.log(`发现${files.length}个文件在images目录:`, files);

      let scriptContent =
        "@echo off\nset PATH=%~dp0tools;%PATH%\n\n@echo off\n\n";

      let imageCount = 0;
      for (const file of files) {
        if (!file.endsWith(".img")) {
          console.log(`跳过非镜像文件: ${file}`);
          continue;
        }

        const partitionName = file.replace(".img", "");
        scriptContent += `fastboot flash ${partitionName} .\\images\\${file}\n`;
        imageCount++;
        console.log(
          `添加刷机命令: fastboot flash ${partitionName} .\\images\\${file}`
        );
      }

      scriptContent += "\nfastboot reboot\n";

      console.log(`生成刷机脚本，包含${imageCount}个分区刷写命令`);
      console.log("脚本内容:", scriptContent);

      await fs.promises.writeFile(
        path.join(backupFolderPath, "start.bat"),
        scriptContent
      );
    } catch (error) {
      console.error("生成刷机脚本时出错:", error);
      // 如果images目录不存在或为空，生成基本脚本
      const basicScript =
        "@echo off\nset PATH=%~dp0tools;%PATH%\n\n@echo off\n\n\nfastboot reboot\n";
      await fs.promises.writeFile(
        path.join(backupFolderPath, "start.bat"),
        basicScript
      );
    }
  }

  /**
   * 复制Fastboot工具
   */
  async function copyFastbootTools(): Promise<void> {
    // 创建tools目录
    const toolsDir = path.join(backupFolderPath, "tools");
    await FileUtils.ensureDir(toolsDir);

    try {
      // 复制 adb
      const adbPath = getAdbPath();
      await FileUtils.copyFile(
        adbPath,
        path.join(toolsDir, path.basename(adbPath))
      );

      // 复制 fastboot
      const fastbootPath = getFastbootPath();
      await FileUtils.copyFile(
        fastbootPath,
        path.join(toolsDir, path.basename(fastbootPath))
      );

      // 复制 ADB 依赖的 DLL 文件
      const toolsBasePath = path.dirname(adbPath); // tools/windows 目录
      const dllFiles = ["AdbWinApi.dll", "AdbWinUsbApi.dll"];

      for (const dllFile of dllFiles) {
        const dllPath = path.join(toolsBasePath, dllFile);
        try {
          await FileUtils.copyFile(dllPath, path.join(toolsDir, dllFile));
        } catch (error) {
          console.warn(
            `复制${dllFile}失败，可能不存在: ${(error as Error).message}`
          );
        }
      }
    } catch (error) {
      throw new Error(`复制刷机工具失败: ${(error as Error).message}`);
    }
  }

  /**
   * 递归地将文件夹添加到ZIP文件中
   */
  async function addFolderToZip(
    zip: JSZip,
    folderPath: string,
    zipPath: string
  ): Promise<void> {
    const files = await fs.promises.readdir(folderPath);

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const stats = await fs.promises.stat(filePath);
      const relativePath = path.join(zipPath, file);

      if (stats.isDirectory()) {
        // 递归处理子目录
        await addFolderToZip(zip, filePath, relativePath);
      } else {
        // 添加文件到zip
        const content = await fs.promises.readFile(filePath);
        zip.file(relativePath, content);
      }
    }
  }

  /**
   * 压缩备份文件
   */
  async function compressBackup(): Promise<void> {
    const zip = new JSZip();
    const archiveName = `${backupFolderName}.zip`;
    const archivePath = path.join(config.outputPath, archiveName);

    try {
      // 递归添加文件到zip
      await addFolderToZip(zip, backupFolderPath, "");

      // 生成zip文件，使用最大压缩等级
      const content = await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: {
          level: 9,
        },
      });

      // 写入zip文件
      await fs.promises.writeFile(archivePath, content);

      // 验证文件大小
      const stats = await fs.promises.stat(archivePath);
      if (stats.size === 0) {
        throw new Error("生成的压缩文件大小为0");
      }
    } catch (error) {
      throw new Error(`压缩失败: ${(error as Error).message}`);
    }
  }

  /**
   * 执行完整的备份流程
   */
  async function executeBackup(): Promise<void> {
    // 步骤1: 检查设备root状态 (1-10%)
    reportProgress({
      stage: "检查设备",
      progress: 1,
      message: "准备检查 Root 状态",
    });
    await checkRootStatus();

    // 步骤2: 创建必要目录 (10-15%)
    reportProgress({
      stage: "检查设备",
      progress: 10,
      message: "创建必要目录",
    });
    await createBackupFolders();

    // 步骤3: 脚本方式备份分区并导出 (15-85%)
    reportProgress({
      stage: "备份分区",
      progress: 15,
      message: "开始脚本方式备份分区",
    });
    await backupViaScript();

    // 步骤4: 生成刷机脚本 (85-90%)
    reportProgress({
      stage: "生成脚本",
      progress: 85,
      message: "生成刷机脚本",
    });
    await generateFlashScript();

    // 步骤5: 复制刷机工具（可选）(90-93%)
    if (config.includeFastbootTools) {
      reportProgress({
        stage: "生成脚本",
        progress: 90,
        message: "复制刷机工具",
      });
      await copyFastbootTools();
    }

    // 步骤6: 压缩备份文件 (93-98%)
    reportProgress({
      stage: "压缩打包",
      progress: 93,
      message: "压缩备份文件",
    });
    await compressBackup();

    // 步骤7: 清理手机端临时文件 (98-100%)
    try {
      reportProgress({
        stage: "完成",
        progress: 98,
        message: "清理手机端临时文件",
      });
      await cleanupPhoneTmpDir();
    } catch {
      // 清理失败不影响整体流程
    }

    reportProgress({ stage: "完成", progress: 100, message: "备份完成" });
  }

  return {
    executeBackup,
  };
}
