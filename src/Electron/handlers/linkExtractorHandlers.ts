/**
 * 链接提取 IPC Handlers
 *
 * 注册 Electron IPC 通道，处理来自渲染进程的链接提取请求
 */

import { ipcMain } from "electron";
import { createLinkExtractor } from "../composables/useLinkExtractor";

/**
 * 注册链接提取相关的 IPC handlers
 */
export function setupLinkExtractorHandlers() {
  const extractor = createLinkExtractor();

  /**
   * 从小米官方页面提取下载链接
   *
   * @channel link:extract-miui
   * @param url - 小米官方页面 URL
   * @returns 下载链接或 null
   */
  ipcMain.handle("link:extract-miui", async (_event, url: string) => {
    return extractor.extractDownloadLink(url);
  });

  /**
   * 获取指定设备和版本的 ROM 下载 URL
   *
   * @channel link:get-rom-url
   * @param deviceCode - 设备代码
   * @param version - 版本号
   * @returns ROM 下载 URL 或 null
   */
  ipcMain.handle(
    "link:get-rom-url",
    async (_event, deviceCode: string, version: string) => {
      return extractor.getRomUrl(deviceCode, version);
    }
  );
}
