/**
 * IPC Handlers 统一注册入口
 *
 * 聚合所有模块的 handlers 并统一注册
 */

import { setupApplicationHandlers } from "./applicationHandlers";
import { setupDeviceHandlers } from "./deviceHandlers";
import { setupBackupHandlers } from "./backupHandlers";
import { setupMagiskBootHandlers } from "./magiskBootHandlers";
import { setupOTAParserHandlers } from "./otaParserHandlers";
import { setupPartitionExtractHandlers } from "./partitionExtractHandlers";
import { setupFastbootPartitionHandlers } from "./fastbootPartitionHandlers";
import { setupLinkExtractorHandlers } from "./linkExtractorHandlers";
import { setupToolsHandlers } from "./toolsHandlers";
import { setupFileSystemHandlers } from "./fileSystemHandlers";
import { setupShellHandlers } from "./shellHandlers";
import { setupNotificationHandlers } from "./notificationHandlers";
import { setupLoggerHandlers } from "./loggerHandlers";
import { setupWindowHandlers } from "./windowHandlers";

/**
 * 注册所有 IPC handlers
 */
export function setupIpcHandlers() {
  setupApplicationHandlers();
  setupDeviceHandlers();
  setupBackupHandlers();
  setupMagiskBootHandlers();
  setupOTAParserHandlers();
  setupPartitionExtractHandlers();
  setupFastbootPartitionHandlers();
  setupLinkExtractorHandlers();
  setupToolsHandlers();
  setupFileSystemHandlers();
  setupShellHandlers();
  setupNotificationHandlers();
  setupLoggerHandlers();
  setupWindowHandlers();
}
