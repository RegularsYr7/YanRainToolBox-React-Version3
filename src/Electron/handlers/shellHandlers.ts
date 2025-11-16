/**
 * Shell 命令执行 IPC Handlers
 *
 * 处理主进程与渲染进程之间的 Shell 命令执行相关通信
 */

import { ipcMain } from "electron";
import { Logger } from "../utils/logger";
import { execute as CommandExecutor } from "../utils/command";
import * as pathManager from "../utils/paths";

// 运行中的进程映射
const running = new Map<
  string,
  { proc: import("child_process").ChildProcess; timer?: NodeJS.Timeout }
>();

/**
 * 设置 Shell 命令执行 IPC handlers
 */
export function setupShellHandlers() {
  Logger.info("[ShellHandlers] 注册 Shell 命令执行 IPC handlers");

  /**
   * 执行 Shell 命令（同步等待结果）
   */
  ipcMain.handle(
    "shell:run",
    async (
      _event,
      command: string,
      options?: {
        useToolsCwd?: boolean;
        timeout?: number;
        replaceTools?: boolean;
      }
    ): Promise<{ code: number; output: string }> => {
      try {
        const toolsDir = pathManager.getPlatformToolsDirPath();

        // 构造替换映射
        const adb = pathManager.getAdbPath();
        const fastboot = pathManager.getFastbootPath();
        const magisk = pathManager.getMagiskBootPath();

        let cmd = command.trim();
        if (options?.replaceTools) {
          // 仅当命令中独立出现这些词时进行替换
          // 使用边界确保不会替换子串
          const replaceWord = (src: string, real: string) =>
            cmd.replace(
              new RegExp(`(?<![\\w-])${src}(?![\\w-])`, "g"),
              `"${real}"`
            );
          cmd = replaceWord("adb", adb);
          cmd = replaceWord("fastboot", fastboot);
          cmd = replaceWord("magiskboot", magisk);
        }

        const result = await CommandExecutor(cmd, options?.timeout ?? 120000, {
          cwd: options?.useToolsCwd !== false ? toolsDir : undefined,
        });
        return result;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        Logger.error("[ShellHandlers] shell:run 执行失败", msg);
        return { code: 1, output: msg };
      }
    }
  );

  /**
   * 启动流式命令执行
   */
  ipcMain.handle(
    "shell:run-stream",
    async (
      event,
      command: string,
      options?: {
        useToolsCwd?: boolean;
        timeout?: number;
        replaceTools?: boolean;
      }
    ): Promise<{ id: string }> => {
      const webContents = event.sender;
      try {
        const toolsDir = pathManager.getPlatformToolsDirPath();

        const adb = pathManager.getAdbPath();
        const fastboot = pathManager.getFastbootPath();
        const magisk = pathManager.getMagiskBootPath();

        let cmd = command.trim();
        if (options?.replaceTools) {
          const replaceWord = (src: string, real: string) =>
            cmd.replace(
              new RegExp(`(?<![\\w-])${src}(?![\\w-])`, "g"),
              `"${real}"`
            );
          cmd = replaceWord("adb", adb);
          cmd = replaceWord("fastboot", fastboot);
          cmd = replaceWord("magiskboot", magisk);
        }

        const { spawn } = await import("child_process");
        const child = spawn(cmd, {
          shell: true,
          cwd: options?.useToolsCwd !== false ? toolsDir : undefined,
          windowsHide: true,
        });

        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const rec: {
          proc: import("child_process").ChildProcess;
          timer?: NodeJS.Timeout;
        } = { proc: child };
        running.set(id, rec);

        const sendData = (
          source: "stdout" | "stderr",
          chunk: Buffer | string
        ) => {
          const text = Buffer.isBuffer(chunk)
            ? chunk.toString("utf8")
            : String(chunk);
          try {
            webContents.send("shell:run-stream:data", {
              id,
              source,
              data: text,
            });
          } catch {
            // ignore send failure when renderer is gone
          }
        };

        child.stdout?.on("data", (d) => sendData("stdout", d));
        child.stderr?.on("data", (d) => sendData("stderr", d));
        child.on("close", (code, signal) => {
          try {
            webContents.send("shell:run-stream:exit", { id, code, signal });
          } catch {
            // ignore send failure when renderer is gone
          }
          const item = running.get(id);
          if (item?.timer) clearTimeout(item.timer);
          running.delete(id);
        });

        if (options?.timeout && options.timeout > 0) {
          rec.timer = setTimeout(() => {
            try {
              child.kill();
            } catch {
              // ignore kill error
            }
          }, options.timeout);
        }

        Logger.info(`[ShellHandlers] 启动流式命令: ${cmd} (ID: ${id})`);
        return { id };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        Logger.error("[ShellHandlers] shell:run-stream 启动失败", msg);
        throw error;
      }
    }
  );

  /**
   * 终止流式命令
   */
  ipcMain.handle(
    "shell:run-kill",
    async (_event, id: string): Promise<boolean> => {
      const rec = running.get(id);
      if (!rec) {
        Logger.warn(`[ShellHandlers] 未找到进程 ID: ${id}`);
        return false;
      }
      try {
        if (rec.timer) clearTimeout(rec.timer);
        const ok = rec.proc.kill();
        running.delete(id);
        Logger.info(`[ShellHandlers] 终止进程: ${id}, 结果: ${ok}`);
        return ok;
      } catch (error) {
        Logger.error(`[ShellHandlers] 终止进程失败: ${id}`, error);
        return false;
      }
    }
  );

  Logger.info("[ShellHandlers] Shell 命令执行 IPC handlers 注册完成");
}
