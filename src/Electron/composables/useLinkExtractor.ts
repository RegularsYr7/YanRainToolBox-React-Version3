/**
 * 链接提取 Composable (纯函数式)
 *
 * 从小米官方页面和 API 获取 ROM 下载链接
 *
 * @功能特性
 * - extractDownloadLink: 从小米官方页面提取下载链接（老系统）
 * - getRomUrl: 从 HyperOS.fans API 获取 ROM 下载链接
 */

export interface LinkExtractorOptions {
  userAgent?: string;
  baseApiUrl?: string;
  cdnDomain?: string;
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

const DEFAULT_API_BASE = "https://data.hyperos.fans/devices";

const DEFAULT_CDN_DOMAIN =
  "https://bkt-sgp-miui-ota-update-alisgp.oss-ap-southeast-1.aliyuncs.com/";

const OLD_DOMAIN = "https://bn.d.miui.com/";

/**
 * 创建链接提取器
 *
 * @param options - 配置选项
 * @returns 链接提取方法集合
 *
 * @example
 * ```ts
 * const extractor = createLinkExtractor();
 * const url = await extractor.extractDownloadLink('https://www.miui.com/...');
 * const romUrl = await extractor.getRomUrl('lisa', 'V14.0.3.0.SKMCNXM');
 * ```
 */
export function createLinkExtractor(options: LinkExtractorOptions = {}) {
  const userAgent = options.userAgent || DEFAULT_USER_AGENT;
  const apiBase = options.baseApiUrl || DEFAULT_API_BASE;
  const cdnDomain = options.cdnDomain || DEFAULT_CDN_DOMAIN;

  /**
   * 发送 HTTP GET 请求并返回响应内容
   *
   * @param urlString - 请求 URL
   * @returns 响应内容
   */
  async function fetchJson(urlString: string): Promise<string> {
    const response = await fetch(urlString, {
      method: "GET",
      headers: {
        "User-Agent": userAgent,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error code: ${response.status}`);
    }

    return await response.text();
  }

  /**
   * 从小米官方页面提取下载链接（老系统版本，无澎湃系统）
   *
   * @param url - 要解析的 URL
   * @returns 下载链接或 null
   *
   * @example
   * ```ts
   * const link = await extractDownloadLink('https://www.miui.com/download-123.html');
   * ```
   */
  async function extractDownloadLink(url: string): Promise<string | null> {
    try {
      // 发送 HTTP 请求获取页面内容
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": userAgent,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();

      // 使用正则表达式解析 HTML
      const TARGET_TEXT = "小米官方 #2";
      const URL_PATTERN = /window\.open\('([^']*)'/;

      // 匹配所有 a 标签及其内容
      const linkPattern =
        /<a[^>]*onclick\s*=\s*["']([^"']*?)["'][^>]*>(.*?)<\/a>/gi;
      let match;

      while ((match = linkPattern.exec(html)) !== null) {
        const onclick = match[1];
        const linkText = match[2];

        // 处理文本中的空白字符和 HTML 标签
        const processedText = linkText
          .replace(/<[^>]*>/g, "") // 移除 HTML 标签
          .replace(/\s+/g, " ")
          .trim();

        if (TARGET_TEXT === processedText) {
          const urlMatch = onclick.match(URL_PATTERN);
          if (urlMatch) {
            let downloadUrl = urlMatch[1];

            // 检查链接是否以 .zip 结尾
            if (downloadUrl.toLowerCase().endsWith(".zip")) {
              // 替换域名部分
              downloadUrl = downloadUrl.replace(OLD_DOMAIN, cdnDomain);
              return downloadUrl;
            }
          }
        }
      }

      return null; // 未找到符合条件的链接
    } catch (error) {
      console.error("提取下载链接失败:", error);
      return null;
    }
  }

  /**
   * 从 HyperOS.fans API 获取 ROM 下载 URL
   *
   * @param code - 设备代码（如: lisa, venus）
   * @param version - 版本号（如: V14.0.3.0.SKMCNXM）
   * @returns ROM 下载 URL 或 null
   *
   * @example
   * ```ts
   * const romUrl = await getRomUrl('lisa', 'V14.0.3.0.SKMCNXM');
   * ```
   */
  async function getRomUrl(
    code: string,
    version: string
  ): Promise<string | null> {
    try {
      // 1. 构建初始 JSON URL
      const jsonUrl = `${apiBase}/${code}.json`;
      const jsonResponse = await fetchJson(jsonUrl);

      // 2. 解析 JSON
      const deviceData = JSON.parse(jsonResponse);
      const branches = deviceData.branches;

      if (!Array.isArray(branches)) {
        throw new Error("Invalid device data structure");
      }

      // 3. 遍历 branches 和 roms，查找匹配的 os
      for (const branch of branches) {
        const roms = branch.roms;
        if (roms && roms[version]) {
          const recovery = roms[version].recovery;
          if (recovery) {
            // 4. 拼接最终 URL
            return `${cdnDomain}${version}/${recovery}`;
          }
        }
      }

      return null; // 未找到匹配项
    } catch (error) {
      console.error("获取 ROM URL 失败:", error);
      return null;
    }
  }

  return {
    extractDownloadLink,
    getRomUrl,
  };
}
