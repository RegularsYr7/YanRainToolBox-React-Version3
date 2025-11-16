/**
 * 计时工具 (纯函数式)
 * 提供同步/异步函数的耗时测量
 */

/**
 * 获取当前时间戳（毫秒）
 * 优先使用 performance.now()，回退到 Date.now()
 *
 * @returns 当前时间戳（毫秒）
 */
export function nowMs(): number {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }
  return Date.now();
}

/**
 * 测量同步函数的执行时间
 *
 * @param label - 标识符，用于日志输出
 * @param fn - 要测量的同步函数
 * @param log - 日志输出函数，默认 console.log
 * @returns 包含执行结果和耗时的对象
 *
 * @example
 * ```ts
 * const { result, ms } = timeSync('计算', () => {
 *   return heavyComputation();
 * });
 * console.log(`结果: ${result}, 耗时: ${ms}ms`);
 * ```
 */
export function timeSync<T>(
  label: string,
  fn: () => T,
  log: (msg: string) => void = console.log
): { result: T; ms: number } {
  const t0 = nowMs();
  const result = fn();
  const ms = nowMs() - t0;
  log?.(`[timeSync] ${label}: ${Math.round(ms)} ms`);
  return { result, ms };
}

/**
 * 测量异步函数的执行时间
 *
 * @param label - 标识符，用于日志输出
 * @param fn - 要测量的异步函数
 * @param log - 日志输出函数，默认 console.log
 * @returns 包含执行结果和耗时的对象
 *
 * @example
 * ```ts
 * const { result, ms } = await timeAsync('API请求', async () => {
 *   return await fetch('/api/data');
 * });
 * console.log(`结果: ${result}, 耗时: ${ms}ms`);
 * ```
 */
export async function timeAsync<T>(
  label: string,
  fn: () => Promise<T>,
  log: (msg: string) => void = console.log
): Promise<{ result: T; ms: number }> {
  const t0 = nowMs();
  const result = await fn();
  const ms = nowMs() - t0;
  log?.(`[timeAsync] ${label}: ${Math.round(ms)} ms`);
  return { result, ms };
}
