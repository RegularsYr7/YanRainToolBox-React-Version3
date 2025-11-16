/**
 * 文件操作工具 (纯函数式)
 *
 * @example
 * // 检查文件是否存在
 * const exists = await fileExists("./config.json");
 * if (exists) {
 *   console.log("文件存在");
 * }
 *
 * // 写入文件
 * await writeFile(
 *   "./data.json",
 *   JSON.stringify({ name: "测试" })
 * );
 *
 * // 复制文件
 * await copyFile(
 *   "./source.txt",
 *   "./backup/source.txt"
 * );
 *
 * // 删除所有 .tmp 文件
 * await removeFile(".+\\.tmp$");
 */

import * as fs from "fs/promises";
import * as path from "path";

/**
 * 检查文件是否存在
 *
 * @param filePath - 文件路径
 * @returns 文件是否存在
 *
 * @example
 * const exists = await fileExists("./config.json");
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 写入文件内容
 *
 * @param filePath - 文件路径
 * @param content - 要写入的内容
 *
 * @example
 * await writeFile(
 *   "./user.json",
 *   JSON.stringify({ id: 1, name: "张三" })
 * );
 */
export async function writeFile(
  filePath: string,
  content: string
): Promise<void> {
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * 复制文件
 *
 * @param src - 源文件路径
 * @param dest - 目标文件路径
 *
 * @example
 * await copyFile(
 *   "./downloads/image.jpg",
 *   "./backup/image_20250729.jpg"
 * );
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  await fs.copyFile(src, dest);
}

/**
 * 根据正则表达式模式删除文件
 *
 * @param pattern - 文件名匹配的正则表达式
 *
 * @example
 * // 删除所有临时文件
 * await removeFile("\\.temp$");
 *
 * // 删除所有日志文件
 * await removeFile("\\.log$");
 */
export async function removeFile(pattern: string): Promise<void> {
  const files = await fs.readdir(".");
  for (const file of files) {
    if (file.match(pattern)) {
      await fs.unlink(file);
    }
  }
}

/**
 * 读取文件内容
 *
 * @param filePath - 文件路径
 * @returns 文件内容
 *
 * @example
 * const content = await readFile("./config.json");
 * const config = JSON.parse(content.toString());
 */
export async function readFile(filePath: string): Promise<Buffer> {
  return await fs.readFile(filePath);
}

/**
 * 创建目录
 *
 * @param dirPath - 目录路径
 * @param options - 创建选项
 *
 * @example
 * await mkdir("./logs", { recursive: true });
 */
export async function mkdir(
  dirPath: string,
  options?: { recursive?: boolean }
): Promise<void> {
  await fs.mkdir(dirPath, options);
}

/**
 * 递归删除目录或文件
 *
 * @param targetPath - 要删除的路径
 *
 * @example
 * await remove("./temp");
 */
export async function remove(targetPath: string): Promise<void> {
  try {
    const stat = await fs.lstat(targetPath);
    if (stat.isDirectory()) {
      const files = await fs.readdir(targetPath);
      await Promise.all(
        files.map((file) => remove(path.join(targetPath, file)))
      );
      await fs.rmdir(targetPath);
    } else {
      await fs.unlink(targetPath);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

/**
 * 递归创建目录并写入文件
 *
 * @param filePath - 文件路径
 * @param content - 文件内容
 *
 * @example
 * await outputFile("./logs/app.log", "日志内容");
 */
export async function outputFile(
  filePath: string,
  content: string | Buffer
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  if (typeof content === "string") {
    await writeFile(filePath, content);
  } else {
    await fs.writeFile(filePath, content);
  }
}

/**
 * 确保目录存在，如果不存在则创建
 *
 * @param dirPath - 目录路径
 *
 * @example
 * await ensureDir("./cache");
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

/**
 * 计算文件的 SHA256 哈希值
 *
 * @param filePath - 文件路径
 * @returns SHA256 哈希值
 *
 * @example
 * const hash = await calculateFileHash("./package.zip");
 * console.log(`文件哈希: ${hash}`);
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  const crypto = await import("crypto");
  const hash = crypto.createHash("sha256");
  const content = await fs.readFile(filePath);
  hash.update(content);
  return hash.digest("hex");
}

/**
 * 向后兼容的 FileUtils 对象
 * 保持与原 class 相同的 API
 *
 * @deprecated 建议直接使用纯函数
 */
export const FileUtils = {
  exists: fileExists,
  writeFile,
  copyFile,
  removeFile,
  readFile,
  mkdir,
  remove,
  outputFile,
  ensureDir,
  calculateFileHash,
};
