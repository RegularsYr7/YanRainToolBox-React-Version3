/**
 * 日志工具 (纯函数式)
 * 用于统一管理应用程序的日志输出
 *
 * @example
 * // 输出普通信息
 * info("应用程序启动成功");
 * // 输出: [INFO] 应用程序启动成功
 *
 * // 输出错误信息
 * error("配置文件加载失败");
 * // 输出: [ERROR] 配置文件加载失败
 *
 * // 在异步操作中使用
 * async function loadConfig() {
 *   try {
 *     const config = await fetch("/api/config");
 *     info("配置加载成功");
 *     return config;
 *   } catch (err) {
 *     error(`配置加载失败: ${err.message}`);
 *     throw err;
 *   }
 * }
 */

// 设置控制台编码为UTF-8（Windows环境）
if (process.platform === "win32") {
  process.stdout.setDefaultEncoding?.("utf8");
  process.stderr.setDefaultEncoding?.("utf8");
}

/**
 * 格式化日志输出，确保中文字符正确显示
 *
 * @param level - 日志级别 (INFO, ERROR, WARN, DEBUG)
 * @param message - 日志消息
 * @param data - 可选的附加数据
 * @returns 格式化后的日志字符串
 */
function formatMessage(level: string, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  let formattedMessage = `[${timestamp}] [${level}] ${message}`;

  if (data !== undefined) {
    if (typeof data === "object" && data !== null) {
      // 若对象包含字符串 output 字段，则优先按原样输出 output，避免换行被 JSON 转义
      const maybe = data as Record<string, unknown>;
      const hasRawOutput =
        Object.prototype.hasOwnProperty.call(maybe, "output") &&
        typeof maybe.output === "string";
      if (hasRawOutput) {
        const { output, ...rest } = maybe as Record<string, unknown> & {
          output: string;
        };
        const hasRest = rest && Object.keys(rest).length > 0;
        if (hasRest) {
          formattedMessage += `\n${JSON.stringify(rest, null, 2)}`;
        }
        // 原样输出外部进程的多行文本
        formattedMessage += `\n${output}`;
      } else {
        formattedMessage += `\n${JSON.stringify(data, null, 2)}`;
      }
    } else {
      formattedMessage += ` ${String(data)}`;
    }
  }

  return formattedMessage;
}

/**
 * 输出信息级别的日志
 *
 * @param message - 日志信息
 * @param data - 可选的附加数据
 *
 * @example
 * info("用户已登录");
 * info(`数据库连接成功，共有 ${count} 条记录`);
 * info("操作完成", { result: "success", count: 10 });
 */
export function info(message: string, data?: unknown): void {
  const formattedMessage = formatMessage("INFO", message, data);
  console.log(formattedMessage);
}

/**
 * 输出错误级别的日志
 *
 * @param message - 错误信息
 * @param data - 可选的附加数据
 *
 * @example
 * error("数据库连接失败");
 * error(`API请求失败: ${error.message}`);
 * error("操作失败", { error: error.stack, code: 500 });
 */
export function error(message: string, data?: unknown): void {
  const formattedMessage = formatMessage("ERROR", message, data);
  console.error(formattedMessage);
}

/**
 * 输出警告级别的日志
 *
 * @param message - 警告信息
 * @param data - 可选的附加数据
 *
 * @example
 * warn("配置项缺失，使用默认值");
 * warn("性能警告", { responseTime: 5000 });
 */
export function warn(message: string, data?: unknown): void {
  const formattedMessage = formatMessage("WARN", message, data);
  console.warn(formattedMessage);
}

/**
 * 输出调试级别的日志
 *
 * @param message - 调试信息
 * @param data - 可选的附加数据
 *
 * @example
 * debug("调试信息");
 * debug("变量状态", { variable: value });
 */
export function debug(message: string, data?: unknown): void {
  if (process.env.NODE_ENV === "development") {
    const formattedMessage = formatMessage("DEBUG", message, data);
    console.debug(formattedMessage);
  }
}

/**
 * 向后兼容的 Logger 对象
 * 保持与原 class 相同的 API
 *
 * @deprecated 建议直接使用纯函数 info, error, warn, debug
 */
export const Logger = {
  info,
  error,
  warn,
  debug,
};

export default Logger;
