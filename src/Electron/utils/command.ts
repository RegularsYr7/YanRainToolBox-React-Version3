/**
 * 命令执行器 (纯函数式)
 * 用于执行系统命令
 */

import { exec, execFile as execFileCb } from "child_process";
import type { ExecException } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFileCb);

/**
 * 类型守卫：检查是否为 ExecException 错误
 *
 * @param error - 未知错误对象
 * @returns 是否为 ExecException 类型
 */
function isExecError(error: unknown): error is ExecException & {
  stdout?: string;
  stderr?: string;
} {
  return (
    typeof error === "object" &&
    error !== null &&
    ("code" in error || "message" in error)
  );
}

/**
 * 执行系统命令
 *
 * @param command - 要执行的命令字符串
 * @param timeout - 超时时间（毫秒），默认 10 秒
 * @param options - 执行选项
 * @returns 返回执行结果 {code: number, output: string}
 *          code: 0 表示成功，非 0 表示失败
 *          output: 命令的输出内容或错误信息
 *
 * @example
 * // Windows 示例
 * const { code, output } = await execute("ipconfig");
 *
 * @example
 * // 自定义工作目录和更大的缓冲区
 * const result = await execute("git status", 10000, { cwd: "/path/to/repo", maxBuffer: 10 * 1024 * 1024 });
 */
export async function execute(
  command: string,
  timeout: number = 10000,
  options?: { cwd?: string; env?: NodeJS.ProcessEnv; maxBuffer?: number }
): Promise<{ code: number; output: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout,
      cwd: options?.cwd,
      windowsHide: true,
      encoding: "utf8",
      maxBuffer: options?.maxBuffer || 10 * 1024 * 1024, // 默认 10MB，防止 dumpsys 等大输出命令失败
      env: options?.env ? { ...process.env, ...options.env } : process.env,
    });
    return {
      code: 0,
      output: stdout || stderr,
    };
  } catch (error: unknown) {
    if (isExecError(error)) {
      return {
        code: error.code || 1,
        output: error.message || "Unknown error",
      };
    }
    return {
      code: 1,
      output: "Unknown error",
    };
  }
}

/**
 * 以参数数组方式执行可执行文件（不经由 shell），规避引号转义问题
 *
 * @param file - 可执行文件路径
 * @param args - 参数数组
 * @param timeout - 超时时间（毫秒），默认 10 秒
 * @param options - 执行选项
 * @returns 返回执行结果 {code: number, output: string}
 *
 * @example
 * // 执行 adb 命令
 * const result = await executeFile(
 *   "/path/to/adb",
 *   ["devices", "-l"],
 *   10000
 * );
 */
export async function executeFile(
  file: string,
  args: string[],
  timeout: number = 10000,
  options?: { env?: NodeJS.ProcessEnv; maxBuffer?: number }
): Promise<{ code: number; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      timeout,
      windowsHide: true,
      encoding: "utf8",
      maxBuffer: options?.maxBuffer || 10 * 1024 * 1024, // 默认 10MB
      env: options?.env ? { ...process.env, ...options.env } : process.env,
    });
    return {
      code: 0,
      output: stdout || stderr || "",
    };
  } catch (error: unknown) {
    if (isExecError(error)) {
      // execFile 的 error.message 可能过于简短，这里拼接 stderr/stdout 更有参考价值
      const err2 = error as ExecException & {
        stdout?: string;
        stderr?: string;
      };
      const combined = [err2.stdout, err2.stderr, error.message]
        .filter(Boolean)
        .join("\n");
      return {
        code: (error.code as number) ?? 1,
        output: combined,
      };
    }
    return { code: 1, output: "Unknown error" };
  }
}

/**
 * 向后兼容的 CommandExecutor 对象
 * 保持与原 class 相同的 API
 *
 * @deprecated 建议直接使用纯函数 execute, executeFile
 */
export const CommandExecutor = {
  execute,
  executeFile,
};
