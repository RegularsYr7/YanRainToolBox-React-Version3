import * as path from "path";
import yauzl from "yauzl";
import { promises as fs, createWriteStream } from "fs";
import { HttpFile } from "../utils/HttpFile";
import { OnlineZipParser } from "../utils/OnlineZipParser";
import { ZipHandler } from "../utils/ZipHandler";
import { parsePayloadPrefixAndDecode } from "../utils/officialProto";
import { getTempDir } from "../utils/paths";
import { decode as bz2Decode } from "seek-bzip";
import type { OnlineOTAParserOptions, ProtoManifest } from "../../types/ota";

/**
 * 在线OTA解析器服务
 */
/**
 * 在线 OTA 解析器 Composable (纯函数式)
 *
 * 从 OnlineOTAParserService 迁移而来
 * 100% 纯函数式实现，使用闭包管理状态
 */
export function createOnlineOTAParser(options: OnlineOTAParserOptions = {}) {
  // 内部状态（使用闭包）
  const opts: Required<OnlineOTAParserOptions> = {
    tempDir: options.tempDir || path.join(getTempDir(), "ota"),
    httpOptions: options.httpOptions || {},
    zipOptions: options.zipOptions || {},
    cleanup: options.cleanup !== false,
    onProgress: options.onProgress || (() => {}),
  };

  let httpFile: HttpFile | undefined;
  let currentUrl: string | undefined;

  /**
   * 确保目录存在
   */
  async function ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * 从ZIP文件中直接提取指定的分区文件
   * @param zipUrl ZIP文件的URL
   * @param partitionFileName ZIP内分区文件名（如'boot.img'）
   * @param outputPath 输出文件路径
   * @param onProgress 提取进度回调
   * @returns 提取是否成功
   */
  async function extractPartitionFileFromZip(
    zipUrl: string,
    partitionFileName: string,
    outputPath: string,
    onProgress?: (progress: number, extracted: number, total: number) => void
  ): Promise<boolean> {
    try {
      console.log(`📦 在线从ZIP中提取分区文件: ${partitionFileName}`);
      console.log(`🔗 ZIP URL: ${zipUrl}`);
      console.log(`💾 输出路径: ${outputPath}`);

      // 确保输出目录存在
      await ensureDir(path.dirname(outputPath));

      // 使用在线ZIP解析器
      const parser = await OnlineZipParser.create(zipUrl);

      try {
        // 查找目标文件
        const fileList = parser.getFileList();
        console.log(`📄 ZIP内容:\n${fileList.join("\n")}`);

        const targetFile = fileList.find(
          (fileName: string) =>
            fileName.toLowerCase().includes(partitionFileName.toLowerCase()) ||
            path.basename(fileName).toLowerCase() ===
              partitionFileName.toLowerCase()
        );

        if (!targetFile) {
          throw new Error(`在ZIP中未找到文件: ${partitionFileName}`);
        }

        console.log(`✅ 在ZIP中找到目标文件: ${targetFile}`);

        // 获取文件信息
        const fileInfo = parser.getFileInfo(targetFile);
        if (!fileInfo) {
          throw new Error(`无法获取文件信息: ${targetFile}`);
        }

        console.log(
          `📊 文件大小: 压缩=${(fileInfo.compressedSize / 1024 / 1024).toFixed(
            2
          )}MB, 原始=${(fileInfo.uncompressedSize / 1024 / 1024).toFixed(2)}MB`
        );

        // 检查文件是否需要解压缩
        const needsDecompression =
          fileInfo.compressedSize !== fileInfo.uncompressedSize;

        if (needsDecompression) {
          console.log(`⚠️ 文件已压缩，需要在线解压缩处理`);
          // 使用在线解压缩提取
          await extractCompressedFileFromZipOnline(
            zipUrl,
            targetFile,
            outputPath,
            onProgress
          );
        } else {
          console.log(`📄 文件未压缩，直接提取原始数据`);
          // 直接提取原始数据
          await extractFileFromZipOnline(
            zipUrl,
            targetFile,
            outputPath,
            onProgress
          );
        }

        console.log(`✅ 分区文件在线提取完成: ${outputPath}`);
        return true;
      } finally {
        parser.close();
      }
    } catch (error) {
      console.error(`❌ 在线提取分区文件失败`);
      throw error;
    }
  }

  /**
   * 从URL提取指定分区（类似payload_dumper功能）
   * @param url OTA文件的URL
   * @param partitionName 要提取的分区名称（如'boot'）
   * @param outputPath 输出文件路径
   * @returns 提取是否成功
   */
  async function extractPartitionFromUrl(
    url: string,
    partitionName: string,
    outputPath: string
  ): Promise<boolean> {
    try {
      console.log(`🔍 检测URL中的payload.bin: ${url}`);
      console.log(`📂 目标分区: ${partitionName}`);
      console.log(`💾 输出路径: ${outputPath}`);

      // 检查是否为本地文件路径
      const isLocalFile = await isLocalFilePath(url);
      if (isLocalFile) {
        console.log(`📁 检测到本地文件，使用本地处理方案`);
        return await handleLocalFile(url, partitionName, outputPath);
      }

      // 确保临时目录存在
      await ensureDir(opts.tempDir);

      // 步骤1: 在线检测payload.bin
      const payloadInfo = await detectPayloadOnline(url);
      if (!payloadInfo.exists) {
        throw new Error(
          "未在URL文件中找到payload.bin，此文件不包含OTA载荷数据"
        );
      }

      console.log(`✅ 发现payload.bin: ${payloadInfo.path || "direct"}`);
      console.log(
        `📊 payload.bin大小: ${(payloadInfo.size / 1024 / 1024).toFixed(2)} MB`
      );

      // 步骤2: 在线解析payload.bin头部信息
      const partitionInfo = await parsePayloadHeaderOnline();

      // 步骤3: 检查分区是否存在
      const targetPartition = partitionInfo.partitions.find(
        (p) => p.name === partitionName
      );
      if (!targetPartition) {
        const availablePartitions = partitionInfo.partitions
          .map((p) => p.name)
          .join(", ");
        throw new Error(
          `分区 '${partitionName}' 不存在。可用分区: ${availablePartitions}`
        );
      }

      if (!targetPartition.extractable) {
        throw new Error(`分区 '${partitionName}' 不可提取`);
      }

      console.log(
        `🎯 找到目标分区 '${partitionName}' (大小: ${(
          targetPartition.size /
          1024 /
          1024
        ).toFixed(2)} MB)`
      );

      // 步骤4: 在线提取分区数据
      const success = await extractPartitionOnline(
        payloadInfo,
        targetPartition,
        outputPath
      );

      if (success) {
        console.log(`✅ 成功在线提取分区 '${partitionName}' 到: ${outputPath}`);
      } else {
        throw new Error(`在线提取分区 '${partitionName}' 失败`);
      }

      return success;
    } catch (error) {
      console.error(`❌ 在线提取失败`);
      throw error;
    }
  }

  /**
   * 智能提取分区 - 自动检测文件类型并选择最佳提取方案
   *
   * 此方法会按照以下优先级顺序尝试不同的提取策略：
   * 1. OTA包处理：检测文件中是否包含payload.bin，如有则解析并提取指定分区
   * 2. ZIP文件处理：将文件作为ZIP处理，查找并提取分区文件（如boot.img）
   * 3. 直接复制/下载：假设文件就是分区文件，直接复制或下载
   *
   * @param urlOrPath 文件URL地址或本地文件路径，支持以下所有格式：
   *
   *   **在线文件 (URL)：**
   *   - Android OTA包（包含payload.bin）：https://example.com/ota-update.zip
   *   - 普通ZIP包（包含分区镜像）：https://example.com/firmware.zip
   *   - 自定义ZIP包（包含.img文件）：https://example.com/custom-rom.zip
   *   - 直接payload.bin文件：https://example.com/payload.bin
   *   - 直接分区文件：https://example.com/boot.img
   *
   *   **本地文件 (路径)：**
   *   - 本地OTA包：./firmware/ota-update.zip
   *   - 本地ZIP包：C:\Downloads\firmware.zip
   *   - 本地payload文件：/path/to/payload.bin
   *   - 本地分区镜像：./images/boot.img
   *
   * @param partitionName 要提取的分区名称，例如：
   *   - 'boot' - 启动分区
   *   - 'system' - 系统分区
   *   - 'recovery' - 恢复分区
   *   - 'vendor' - 厂商分区
   *   - 'product' - 产品分区
   *   - 'system_ext' - 系统扩展分区
   *   注意：会自动尝试添加.img扩展名进行匹配
   *
   * @param outputPath 输出文件路径，支持以下格式：
   *   - 完整文件路径：/path/to/boot.img
   *   - 目录路径：/path/to/output/ (会自动添加分区名.img作为文件名)
   *   - 相对路径：./output/boot.img
   *
   * @returns Promise<boolean> 返回提取结果：
   *   - true：成功提取分区文件到指定路径
   *   - false：所有提取策略都失败
   *
   * @throws 当文件不存在、路径无法访问或网络连接失败时抛出异常
   *
   * @example
   * ```typescript
   * const service = new OnlineOTAParserService();
   *
   * // 从在线Android OTA包中提取boot分区
   * const success1 = await service.smartExtractPartition(
   *   'https://example.com/ota-update.zip',  // 在线包含payload.bin的ZIP
   *   'boot',
   *   './output/boot.img'
   * );
   *
   * // 从本地ZIP文件中提取system分区
   * const success2 = await service.smartExtractPartition(
   *   './firmware/custom-rom.zip',          // 本地包含.img文件的ZIP
   *   'system',
   *   './output/'  // 会自动保存为 ./output/system.img
   * );
   *
   * // 从本地payload.bin文件中提取分区
   * const success3 = await service.smartExtractPartition(
   *   'C:\\Downloads\\payload.bin',         // 本地payload文件
   *   'vendor',
   *   './vendor.img'
   * );
   *
   * // 直接复制本地分区镜像文件
   * const success4 = await service.smartExtractPartition(
   *   '/path/to/boot.img',                  // 本地镜像文件
   *   'boot',
   *   './boot.img'
   * );
   * ```
   */
  async function smartExtractPartition(
    urlOrPath: string,
    partitionName: string,
    outputPath: string
  ): Promise<boolean> {
    try {
      console.log(`🔍 智能检测文件内容: ${urlOrPath}`);
      console.log(`🎯 目标分区: ${partitionName}`);

      // 首先检测是URL还是本地路径
      const isLocalFile = await isLocalFilePath(urlOrPath);

      if (isLocalFile) {
        console.log(`📁 检测到本地文件路径，使用本地处理方案`);
        return await handleLocalFile(urlOrPath, partitionName, outputPath);
      } else {
        console.log(`🌐 检测到URL链接，使用在线处理方案`);
        return await handleOnlineFile(urlOrPath, partitionName, outputPath);
      }
    } catch (error) {
      console.error(`❌ 智能提取失败:`, error);
      return false;
    }
  }

  /**
   * 直接下载分区文件
   * @param url 分区文件的直接URL
   * @param outputPath 输出文件路径
   * @param onProgress 下载进度回调
   * @returns 下载是否成功
   */
  async function downloadPartitionFile(
    url: string,
    outputPath: string,
    onProgress?: (progress: number, downloaded: number, total: number) => void
  ): Promise<boolean> {
    try {
      console.log(`📥 直接下载分区文件: ${url}`);
      console.log(`💾 输出路径: ${outputPath}`);

      // 确保输出目录存在
      await ensureDir(path.dirname(outputPath));

      // 创建HTTP文件实例
      const httpFile = new HttpFile(url, {
        ...opts.httpOptions,
        onProgress: (downloaded, total) => {
          const progress = total > 0 ? (downloaded / total) * 100 : 0;
          if (onProgress) {
            onProgress(progress, downloaded, total);
          }
        },
      });

      // 初始化并下载
      const initialized = await httpFile.initialize();
      if (!initialized) {
        throw new Error("无法初始化HTTP连接");
      }

      const success = await httpFile.download(outputPath);
      if (success) {
        console.log(`✅ 分区文件下载完成: ${outputPath}`);
      }

      return success;
    } catch (error) {
      console.error(`❌ 下载分区文件失败:`, error);
      throw error;
    }
  }

  /**
   * 在线检测payload.bin
   */
  async function detectPayloadOnline(url: string): Promise<{
    exists: boolean;
    path?: string;
    size: number;
    isInZip: boolean;
    zipPath?: string;
    url: string;
  }> {
    console.log(`🔍 在线检测payload.bin: ${url}`);

    httpFile = new HttpFile(url, opts.httpOptions);
    currentUrl = url;
    const initialized = await httpFile.initialize();
    if (!initialized) {
      throw new Error("无法初始化HTTP连接");
    }

    const contentType = await httpFile.getContentType();
    const fileSize = httpFile.getSize();

    console.log(`📋 Content-Type: ${contentType}`);
    console.log(`📊 文件大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

    const isZip =
      contentType.includes("zip") || url.toLowerCase().includes(".zip");

    if (isZip) {
      return await detectPayloadInZipOnline(url);
    } else if (url.toLowerCase().includes("payload.bin")) {
      return {
        exists: true,
        size: fileSize,
        isInZip: false,
        url: url,
      };
    } else {
      console.log(`⚠️ 假设文件包含payload数据: ${url}`);
      return {
        exists: true,
        size: fileSize,
        isInZip: false,
        url: url,
      };
    }
  }

  /**
   * 在线检测ZIP中的payload.bin
   */
  async function detectPayloadInZipOnline(zipUrl: string): Promise<{
    exists: boolean;
    path?: string;
    size: number;
    isInZip: boolean;
    zipPath?: string;
    url: string;
  }> {
    console.log(`📁 在线检测ZIP中的payload.bin`);

    try {
      const parser = await OnlineZipParser.create(zipUrl);

      try {
        if (!parser.hasFile("payload.bin")) {
          console.log(`❌ ZIP中未找到payload.bin文件`);
          return {
            exists: false,
            size: 0,
            isInZip: true,
            url: zipUrl,
          };
        }

        const fileInfo = parser.getFileInfo("payload.bin");
        if (!fileInfo) {
          throw new Error("无法获取payload.bin文件信息");
        }

        console.log(
          `✅ 找到payload.bin: 压缩大小=${(
            fileInfo.compressedSize /
            1024 /
            1024
          ).toFixed(2)}MB, 原始大小=${(
            fileInfo.uncompressedSize /
            1024 /
            1024
          ).toFixed(2)}MB`
        );

        return {
          exists: true,
          path: "payload.bin",
          size: fileInfo.uncompressedSize,
          isInZip: true,
          zipPath: "payload.bin",
          url: zipUrl,
        };
      } finally {
        parser.close();
      }
    } catch (error) {
      console.error(`❌ 在线检测ZIP中payload.bin失败:`, error);
      return {
        exists: true,
        path: "payload.bin",
        size: 0,
        isInZip: true,
        zipPath: "payload.bin",
        url: zipUrl,
      };
    }
  }

  /**
   * 在线解析payload.bin头部信息
   */
  async function parsePayloadHeaderOnline(): Promise<{
    partitions: Array<{
      name: string;
      size: number;
      extractable: boolean;
      offset: number;
    }>;
  }> {
    console.log(`📖 在线解析payload.bin头部信息...`);

    try {
      if (!httpFile) {
        throw new Error("HTTP文件未初始化");
      }

      // 从HTTP读取payload.bin头部
      console.log(`🌐 从HTTP读取payload.bin头部数据...`);
      const headerBuffer = await httpFile.read(0, 64 * 1024 - 1);
      const payloadHeaderData = new Uint8Array(headerBuffer);

      console.log(`📊 读取到头部数据: ${payloadHeaderData.length} 字节`);

      // 解析manifest（使用官方proto）
      const { manifest } = await parsePayloadPrefixAndDecode<ProtoManifest>(
        payloadHeaderData
      );

      // 计算每个分区的实际偏移量和大小
      const partitionsRaw = manifest.partitions.map((partition) => {
        const blockSize =
          (manifest as unknown as { block_size?: number; blockSize?: number })
            .block_size ||
          (manifest as unknown as { block_size?: number; blockSize?: number })
            .blockSize ||
          4096;
        const ops = partition.operations || [];
        let maxEndBlock = 0;
        let lastDataOffset: number = 0;
        for (const op of ops) {
          const extArr = (op.dst_extents || op.dstExtents || []) as Array<{
            start_block?: number;
            startBlock?: number;
            num_blocks?: number;
            numBlocks?: number;
          }>;
          for (const e of extArr) {
            const start = Number((e?.start_block ?? e?.startBlock) || 0);
            const num = Number((e?.num_blocks ?? e?.numBlocks) || 0);
            const end = start + num;
            if (end > maxEndBlock) maxEndBlock = end;
          }
          const dataOffsetMaybe =
            (op as unknown as { data_offset?: number; dataOffset?: number })
              .data_offset ??
            (op as unknown as { data_offset?: number; dataOffset?: number })
              .dataOffset;
          if (dataOffsetMaybe !== undefined) lastDataOffset = dataOffsetMaybe;
        }

        const newInfo =
          partition.new_partition_info || partition.newPartitionInfo;
        const computedSize = maxEndBlock * blockSize;
        const finalSize = newInfo?.size || computedSize || 64 * 1024 * 1024; // 优先 new_partition_info.size

        const partName = partition.partition_name || partition.partitionName;
        console.log(
          `📂 分区 '${partName}': 大小=${(finalSize / 1024 / 1024).toFixed(
            2
          )}MB, 偏移=${lastDataOffset}`
        );

        return {
          name: partName,
          size: finalSize,
          extractable: true,
          offset: lastDataOffset,
        };
      });
      const partitions = partitionsRaw.filter((p) => !!p.name) as Array<{
        name: string;
        size: number;
        extractable: boolean;
        offset: number;
      }>;

      console.log(`🎯 解析完成，共发现 ${partitions.length} 个可提取分区:`);

      // 显示分区列表给用户
      console.log(`\n📋 可提取分区列表:`);
      console.log(`${"=".repeat(50)}`);
      partitions.forEach((p: { name: string; size: number }, index) => {
        console.log(
          `${(index + 1).toString().padStart(2, " ")}. ${p.name.padEnd(
            15
          )} - ${(p.size / 1024 / 1024).toFixed(2).padStart(8)}MB`
        );
      });
      console.log(`${"=".repeat(50)}\n`);

      console.log(
        `💡 提示: 你可以提取以上任意分区，只需将分区名称输入到工具中即可`
      );

      return { partitions };
    } catch (error) {
      console.error(`❌ 解析payload.bin头部失败`);

      // 对于ZIP文件，通过HTTP Range请求直接解析
      if (httpFile && currentUrl) {
        try {
          console.log(`🌐 使用HTTP Range请求解析ZIP中的payload.bin...`);

          const payloadInfo = await locatePayloadInZipByHttp();

          // 读取payload.bin头部进行解析
          const totalRequiredSize = await calculateRequiredHeaderSize(
            payloadInfo.offset
          );

          const fullHeaderBuffer = await httpFile.read(
            payloadInfo.offset,
            payloadInfo.offset + totalRequiredSize - 1
          );
          const payloadHeaderData = new Uint8Array(fullHeaderBuffer);

          const { manifest } = await parsePayloadPrefixAndDecode<ProtoManifest>(
            payloadHeaderData
          );
          const partitionsRaw = manifest.partitions.map((partition) => {
            const blockSize =
              (
                manifest as unknown as {
                  block_size?: number;
                  blockSize?: number;
                }
              ).block_size ||
              (
                manifest as unknown as {
                  block_size?: number;
                  blockSize?: number;
                }
              ).blockSize ||
              4096;
            const ops = partition.operations || [];
            let maxEndBlock = 0;
            let dataOffset = payloadInfo.offset;
            for (const op of ops) {
              const extArr = (op.dst_extents || op.dstExtents || []) as Array<{
                start_block?: number;
                startBlock?: number;
                num_blocks?: number;
                numBlocks?: number;
              }>;
              for (const e of extArr) {
                const start = Number((e?.start_block ?? e?.startBlock) || 0);
                const num = Number((e?.num_blocks ?? e?.numBlocks) || 0);
                const end = start + num;
                if (end > maxEndBlock) maxEndBlock = end;
              }
              const dataOffsetMaybe =
                (op as unknown as { data_offset?: number; dataOffset?: number })
                  .data_offset ??
                (op as unknown as { data_offset?: number; dataOffset?: number })
                  .dataOffset;
              if (dataOffsetMaybe !== undefined)
                dataOffset = payloadInfo.offset + dataOffsetMaybe;
            }

            const newInfo =
              partition.new_partition_info || partition.newPartitionInfo;
            const computedSize = maxEndBlock * blockSize;
            const finalSize = newInfo?.size || computedSize || 8 * 1024 * 1024;

            const partName =
              partition.partition_name || partition.partitionName;
            return {
              name: partName,
              size: finalSize,
              extractable: true,
              offset: dataOffset,
            };
          });
          const partitions = partitionsRaw.filter((p) => !!p.name) as Array<{
            name: string;
            size: number;
            extractable: boolean;
            offset: number;
          }>;

          console.log(
            `🎯 HTTP Range解析完成，共发现 ${partitions.length} 个可提取分区`
          );

          // 显示分区列表给用户
          console.log(`\n📋 可提取分区列表:`);
          console.log(`${"=".repeat(50)}`);
          partitions.forEach((p: { name: string; size: number }, index) => {
            console.log(
              `${(index + 1).toString().padStart(2, " ")}. ${p.name.padEnd(
                15
              )} - ${(p.size / 1024 / 1024).toFixed(2).padStart(8)}MB`
            );
          });
          console.log(`${"=".repeat(50)}\n`);

          console.log(
            `💡 提示: 你可以提取以上任意分区，只需将分区名称输入到工具中即可`
          );

          return { partitions };
        } catch (httpError) {
          console.error(`❌ HTTP Range解析也失败:`, httpError);
          throw new Error(`无法解析payload.bin: ${httpError}`);
        }
      } else {
        throw new Error(`payload.bin解析失败: ${error}`);
      }
    }
  }

  /**
   * 计算需要读取的头部大小
   */
  async function calculateRequiredHeaderSize(offset: number): Promise<number> {
    if (!httpFile) {
      throw new Error("HTTP文件未初始化");
    }

    // 先读取基本头部
    const initialHeaderBuffer = await httpFile.read(offset, offset + 24 - 1);
    const initialHeaderData = new Uint8Array(initialHeaderBuffer);

    // 检查魔术数字
    const magicNumber = new DataView(
      initialHeaderData.buffer,
      initialHeaderData.byteOffset,
      4
    ).getUint32(0, false);
    if (magicNumber !== 0x43724155) {
      throw new Error(
        `无效的payload.bin魔术数字: 0x${magicNumber.toString(16)}`
      );
    }

    // 获取manifest和签名大小
    const manifestSize = Number(
      new DataView(
        initialHeaderData.buffer,
        initialHeaderData.byteOffset + 12,
        8
      ).getBigUint64(0, false)
    );
    const manifestSignatureSize = new DataView(
      initialHeaderData.buffer,
      initialHeaderData.byteOffset + 20,
      4
    ).getUint32(0, false);

    return 24 + manifestSize + manifestSignatureSize;
  }

  /**
   * 通过HTTP定位ZIP中payload.bin的位置
   */
  async function locatePayloadInZipByHttp(): Promise<{
    offset: number;
    compressedSize: number;
  }> {
    if (!currentUrl) {
      throw new Error("缺少当前ZIP的URL");
    }

    const parser = await OnlineZipParser.create(currentUrl);
    try {
      const range = await parser.getFileRange("payload.bin");
      return { offset: range.start, compressedSize: range.size };
    } finally {
      parser.close();
    }
  }

  /**
   * 在线提取分区数据
   */
  async function extractPartitionOnline(
    payloadInfo: {
      exists: boolean;
      path?: string;
      size: number;
      isInZip: boolean;
      zipPath?: string;
      url: string;
    },
    partition: {
      name: string;
      size: number;
      extractable: boolean;
      offset: number;
    },
    outputPath: string
  ): Promise<boolean> {
    console.log(`🚀 开始在线提取分区 '${partition.name}'...`);
    console.log(
      `📊 分区大小(估算): ${(partition.size / 1024 / 1024).toFixed(2)} MB`
    );

    // 在线按需读取策略：
    // 1) 解析 payload 头部，拿到 manifest（proto）和 headerSize
    // 2) 仅对目标分区的每条 op 读取 data_offset/data_length 对应的 blob（HTTP Range）
    // 3) 按 op 类型（REPLACE/ZERO/REPLACE_BZ/REPLACE_XZ）写入到输出镜像的 dst_extents

    try {
      // 确保输出目录存在
      await ensureDir(path.dirname(outputPath));

      // 初始化 HttpFile（本地实例，避免共享状态）
      const localHttpFile = new HttpFile(payloadInfo.url, opts.httpOptions);
      await localHttpFile.initialize();

      // 确定 payload.bin 在远端资源中的起始偏移（baseOffset）
      let baseOffset = 0;
      let zipCompressionMethod = 0;
      if (payloadInfo.isInZip) {
        console.log("📁 从ZIP中定位 payload.bin...");
        const parser = await OnlineZipParser.create(payloadInfo.url);
        try {
          const info = parser.getFileInfo(payloadInfo.zipPath || "payload.bin");
          if (!info) throw new Error("ZIP 中未找到 payload.bin 文件信息");
          zipCompressionMethod = info.compressionMethod;
          if (zipCompressionMethod !== 0) {
            // 压缩方式为 Deflate 等，无法直接 Range 定位到未压缩数据，只能回退到缓存下载再重建
            console.warn(
              `⚠️ ZIP 内 payload.bin 使用压缩方法 ${zipCompressionMethod}，改用临时缓存方案`
            );
            // 回退到缓存下载方案（复用本地高级解析器）
            const cacheDir = path.resolve(opts.tempDir, "payload-cache");
            await ensureDir(cacheDir);
            const safeBase = (payloadInfo.zipPath || "payload.bin").replace(
              /[^a-zA-Z0-9_.-]/g,
              "_"
            );
            const cachedPayloadPath = path.join(
              cacheDir,
              `${safeBase}.payload.bin`
            );
            try {
              await extractFileFromZipOnline(
                payloadInfo.url,
                payloadInfo.zipPath || "payload.bin",
                cachedPayloadPath
              );
              const ok = await extractPartitionFromLocalPayloadAdvanced(
                cachedPayloadPath,
                partition.name,
                outputPath
              );
              if (opts.cleanup !== false) {
                try {
                  await fs.unlink(cachedPayloadPath);
                  console.log(`🧹 已清理payload缓存: ${cachedPayloadPath}`);
                } catch (e) {
                  console.warn(`⚠️ 清理payload缓存失败: ${e}`);
                }
              }
              return ok;
            } finally {
              parser.close();
            }
          }
          const range = await parser.getFileRange(
            payloadInfo.zipPath || "payload.bin"
          );
          baseOffset = range.start;
        } finally {
          // 若未提前 close，则此处关闭
          try {
            parser.close();
          } catch {
            void 0;
          }
        }
      }

      // 计算并读取 payload 头部（CrAU 固定 24B + manifest + metadata_signature）
      // 该方法内部使用 httpFile，这里临时绑定本地 httpFile 实例
      const prevHttp = httpFile;
      httpFile = localHttpFile;
      const headerTotal = await calculateRequiredHeaderSize(baseOffset);
      httpFile = prevHttp;
      const headerBuf = await localHttpFile.read(
        baseOffset,
        baseOffset + headerTotal - 1
      );
      const headerBytes = new Uint8Array(headerBuf);
      const { manifest } = await parsePayloadPrefixAndDecode<ProtoManifest>(
        headerBytes
      );

      // 工具函数：block_size 与 extents、op字段兼容
      const m = manifest as unknown as {
        block_size?: number;
        blockSize?: number;
      };
      const blockSize = m.block_size || m.blockSize || 4096;
      const getExtents = (
        op: unknown
      ): Array<{ startBlock: number; numBlocks: number }> => {
        const o = op as Record<string, unknown>;
        const arr = (o["dst_extents"] || o["dstExtents"]) as
          | Array<Record<string, unknown>>
          | undefined;
        if (!arr || !Array.isArray(arr)) return [];
        return arr.map((e) => ({
          startBlock: Number((e?.["start_block"] ?? e?.["startBlock"]) || 0),
          numBlocks: Number((e?.["num_blocks"] ?? e?.["numBlocks"]) || 0),
        }));
      };

      // 找到目标分区（兼容字段名）
      const targetPart = (manifest.partitions || []).find((p) => {
        const pr = p as Record<string, unknown>;
        const nm =
          (pr["partition_name"] as string) || (pr["partitionName"] as string);
        return nm === partition.name;
      });
      if (
        !targetPart ||
        !targetPart.operations ||
        targetPart.operations.length === 0
      ) {
        throw new Error(
          `分区 '${partition.name}' 在 manifest 中不存在或没有操作`
        );
      }

      // 计算输出镜像大小
      const tpRec = targetPart as unknown as Record<string, unknown>;
      let targetSize =
        (targetPart.new_partition_info?.size as number | undefined) ||
        ((tpRec["newPartitionInfo"] as { size?: number } | undefined)?.size ??
          0);
      if (!targetSize) {
        let maxEnd = 0;
        for (const op of targetPart.operations) {
          for (const e of getExtents(op)) {
            const end = (e.startBlock || 0) + (e.numBlocks || 0);
            if (end > maxEnd) maxEnd = end;
          }
        }
        targetSize = maxEnd * blockSize || 64 * 1024 * 1024;
      }

      // 打开输出文件并预分配
      await ensureDir(path.dirname(outputPath));
      const outHandle = await fs.open(outputPath, "w+");
      try {
        await outHandle.truncate(targetSize);

        // 内联 XZ 解压（复用本地实现）
        const decompressXZ = async (comp: Uint8Array): Promise<Uint8Array> => {
          try {
            const { createRequire } = await import("module");
            const req = createRequire(process.cwd() + "/");
            const lzma: unknown = req("lzma-native");
            const lzmaDecompress =
              (
                lzma as {
                  decompress?: (
                    buf: Uint8Array,
                    cb: (res: Uint8Array) => void
                  ) => void;
                }
              ).decompress ||
              (
                lzma as {
                  default?: {
                    decompress?: (
                      buf: Uint8Array,
                      cb: (res: Uint8Array) => void
                    ) => void;
                  };
                }
              ).default?.decompress;
            if (typeof lzmaDecompress === "function") {
              return await new Promise<Uint8Array>((resolve, reject) => {
                try {
                  lzmaDecompress(comp, (res: Uint8Array) => resolve(res));
                } catch (e) {
                  reject(e);
                }
              });
            }
          } catch {
            void 0;
          }
          // fallback to xz-decompress
          try {
            type XzModule = {
              decompress?: (data: Uint8Array) => Uint8Array;
              default?: { decompress?: (data: Uint8Array) => Uint8Array };
              XzReadableStream?: new (
                input: ReadableStream<Uint8Array>
              ) => ReadableStream<Uint8Array>;
            };
            const mod: XzModule = (await import(
              "xz-decompress"
            )) as unknown as XzModule;
            const fnObj = mod?.decompress || mod?.default?.decompress;
            if (typeof fnObj === "function") {
              const out = fnObj(comp);
              return out instanceof Uint8Array
                ? out
                : new Uint8Array(out as ArrayBufferLike);
            }
            const XzReadableStream = mod?.XzReadableStream;
            if (XzReadableStream) {
              const input = new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(comp);
                  controller.close();
                },
              });
              const stream = new XzReadableStream(input);
              const reader = stream.getReader();
              const chunks: Uint8Array[] = [];
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) chunks.push(value);
              }
              const total = chunks.reduce((n, c) => n + c.byteLength, 0);
              const out = new Uint8Array(total);
              let off = 0;
              for (const c of chunks) {
                out.set(c, off);
                off += c.byteLength;
              }
              return out;
            }
            throw new Error("xz-decompress 未提供可用的解压实现");
          } catch (e2) {
            throw new Error(`XZ 解压不可用: ${e2}`);
          }
        };

        // 遍历并应用操作
        const getNumField = (
          o: unknown,
          k1: string,
          k2?: string
        ): number | undefined => {
          const r = o as Record<string, unknown>;
          const v =
            (r[k1] as number | undefined) ??
            (k2 ? (r[k2] as number | undefined) : undefined);
          return v;
        };

        for (let i = 0; i < targetPart.operations.length; i++) {
          const op = targetPart.operations[i] as unknown;
          const opType = getNumField(op, "type") ?? -1;
          const extents = getExtents(op);
          const dstBytes = extents.reduce(
            (acc, e) => acc + (e.numBlocks || 0) * blockSize,
            0
          );
          const dataOffset = getNumField(op, "data_offset", "dataOffset");
          const dataLength = getNumField(op, "data_length", "dataLength");

          const logDataLen = dataLength ?? 0;
          console.log(
            `🔧 操作#${i}: type=${opType}, data_len=${logDataLen}, dst_extents=${extents.length}, dst_bytes=${dstBytes}`
          );

          if (dstBytes === 0) continue;

          if (opType === 6) {
            // ZERO
            const zeroChunk = Buffer.alloc(
              Math.min(4 * 1024 * 1024, Math.max(blockSize, 4096)),
              0
            );
            for (const e of extents) {
              let remaining = (e.numBlocks || 0) * blockSize;
              let pos = (e.startBlock || 0) * blockSize;
              while (remaining > 0) {
                const w = Math.min(remaining, zeroChunk.length);
                await outHandle.write(zeroChunk, 0, w, pos);
                remaining -= w;
                pos += w;
              }
            }
            continue;
          }

          if (opType === 0 || opType === 1 || opType === 8) {
            if (dataOffset === undefined || !dataLength) {
              throw new Error(
                `操作缺少 data_offset/data_length (type=${opType})`
              );
            }
            const blobStart = baseOffset + headerTotal + dataOffset;
            const comp = await localHttpFile.read(
              blobStart,
              blobStart + dataLength - 1
            );
            let bufU8: Uint8Array = new Uint8Array(comp);
            if (opType === 1) {
              // BZ2
              try {
                const decompAny = bz2Decode(Buffer.from(bufU8));
                bufU8 =
                  decompAny instanceof Uint8Array
                    ? (decompAny as Uint8Array)
                    : new Uint8Array(decompAny as ArrayBufferLike);
              } catch (e) {
                throw new Error(`BZ2 解压失败: ${e}`);
              }
            } else if (opType === 8) {
              // XZ
              bufU8 = await decompressXZ(bufU8);
            }

            let cursor = 0;
            for (const e of extents) {
              const bytes = (e.numBlocks || 0) * blockSize;
              const slice = bufU8.subarray(cursor, cursor + bytes);
              if (slice.length < bytes) {
                throw new Error(
                  `解压/替换数据不足：需要 ${bytes}，仅有 ${slice.length}`
                );
              }
              const pos = (e.startBlock || 0) * blockSize;
              await outHandle.write(slice, 0, slice.length, pos);
              cursor += bytes;
            }
            continue;
          }

          throw new Error(
            `不支持的操作类型: ${opType}（已实现: REPLACE=0, ZERO=6, REPLACE_BZ=1, REPLACE_XZ=8）`
          );
        }

        console.log(`✅ 分区 '${partition.name}' 重建完成: ${outputPath}`);
        return true;
      } finally {
        try {
          await outHandle.close();
        } catch {
          void 0;
        }
      }
    } catch (error) {
      console.error(`❌ 在线提取分区失败:`, error);
      return false;
    }
  }

  // 直接Range截取payload内部分区会得到CrAU原始块，无法被识别为有效镜像；
  // 因此已统一至“下载payload.bin到缓存后，用高级解析器重建分区”的流程。

  /**
   * 使用HTTP Range请求从ZIP在线提取单个文件
   */
  async function extractFileFromZipOnline(
    zipUrl: string,
    fileName: string,
    outputPath: string,
    onProgress?: (progress: number, extracted: number, total: number) => void
  ): Promise<void> {
    console.log(`🌐 使用HTTP Range请求在线提取文件: ${fileName}`);

    // 优化输出路径处理
    let finalOutputPath = outputPath;

    // 检查输出路径是否是目录，如果是则添加文件名（只保留文件名，不包含ZIP内部路径）
    const baseFileName = path.basename(fileName);
    if (outputPath.endsWith("/") || outputPath.endsWith("\\")) {
      finalOutputPath = path.join(outputPath, baseFileName);
    } else {
      try {
        const pathStats = await fs.lstat(outputPath);
        if (pathStats.isDirectory()) {
          finalOutputPath = path.join(outputPath, baseFileName);
        }
      } catch {
        // 路径不存在，检查是否看起来像目录路径
        if (!path.extname(outputPath)) {
          // 没有扩展名，可能是目录路径，添加文件名
          finalOutputPath = path.join(outputPath, baseFileName);
        }
      }
    }

    // 确保输出目录存在
    await ensureDir(path.dirname(finalOutputPath));

    // 创建在线ZIP解析器获取文件范围
    const parser = await OnlineZipParser.create(zipUrl);
    let fileRange;

    try {
      fileRange = await parser.getFileRange(fileName);
      console.log(
        `📊 文件范围: ${fileRange.start} - ${
          fileRange.start + fileRange.size - 1
        } (${fileRange.size} 字节)`
      );
    } finally {
      parser.close();
    }

    // 创建HTTP文件实例
    if (!httpFile) {
      httpFile = new HttpFile(zipUrl, opts.httpOptions);
      await httpFile.initialize();
    }

    const chunkSize = 1024 * 1024; // 1MB chunks
    const writeStream = createWriteStream(finalOutputPath);
    let extractedSize = 0;
    const totalSize = fileRange.size;

    try {
      console.log(
        `📥 开始流式下载文件，总大小: ${(totalSize / 1024 / 1024).toFixed(
          2
        )} MB`
      );

      // 流式读取文件数据
      while (extractedSize < totalSize) {
        const currentOffset = fileRange.start + extractedSize;
        const remainingSize = totalSize - extractedSize;
        const currentChunkSize = Math.min(chunkSize, remainingSize);
        const endOffset = currentOffset + currentChunkSize - 1;

        // 使用Range请求读取数据块
        const chunk = await httpFile.read(currentOffset, endOffset);

        // 写入数据块
        await new Promise<void>((resolve, reject) => {
          writeStream.write(chunk, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });

        extractedSize += currentChunkSize;

        // 更新进度
        const progress = (extractedSize / totalSize) * 100;
        if (onProgress) {
          onProgress(progress, extractedSize, totalSize);
        }

        console.log(
          `📥 下载进度: ${progress.toFixed(1)}% (${(
            extractedSize /
            1024 /
            1024
          ).toFixed(2)}MB / ${(totalSize / 1024 / 1024).toFixed(2)}MB)`
        );
      }

      // 关闭文件流
      await new Promise<void>((resolve, reject) => {
        writeStream.end((error?: Error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      console.log(`✅ 文件在线提取完成: ${finalOutputPath}`);
    } catch (error) {
      writeStream.destroy();
      // 清理失败的输出文件
      try {
        await fs.unlink(finalOutputPath);
      } catch (cleanupError) {
        console.warn("清理输出文件失败:", cleanupError);
      }
      throw error;
    }
  }

  /**
   * 从ZIP在线提取并解压缩文件（处理压缩的分区文件）
   */
  async function extractCompressedFileFromZipOnline(
    zipUrl: string,
    fileName: string,
    outputPath: string,
    onProgress?: (progress: number, extracted: number, total: number) => void
  ): Promise<void> {
    console.log(`🗜️ 在线提取并解压缩文件: ${fileName}`);

    // 优化输出路径处理
    let finalOutputPath = outputPath;

    // 检查输出路径是否是目录，如果是则添加文件名（只保留文件名，不包含ZIP内部路径）
    const baseFileName = path.basename(fileName);
    if (outputPath.endsWith("/") || outputPath.endsWith("\\")) {
      finalOutputPath = path.join(outputPath, baseFileName);
    } else {
      try {
        const pathStats = await fs.lstat(outputPath);
        if (pathStats.isDirectory()) {
          finalOutputPath = path.join(outputPath, baseFileName);
        }
      } catch {
        // 路径不存在，检查是否看起来像目录路径
        if (!path.extname(outputPath)) {
          // 没有扩展名，可能是目录路径，添加文件名
          finalOutputPath = path.join(outputPath, baseFileName);
        }
      }
    }

    // 确保输出目录存在
    await ensureDir(path.dirname(finalOutputPath));

    // 使用在线ZIP解析器的解压缩功能
    const parser = await OnlineZipParser.create(zipUrl);

    try {
      // 获取文件信息
      const fileInfo = parser.getFileInfo(fileName);
      if (!fileInfo) {
        throw new Error(`无法获取文件信息: ${fileName}`);
      }

      console.log(
        `🗜️ 开始解压缩，压缩大小: ${(
          fileInfo.compressedSize /
          1024 /
          1024
        ).toFixed(2)}MB, 原始大小: ${(
          fileInfo.uncompressedSize /
          1024 /
          1024
        ).toFixed(2)}MB`
      );

      // 检查压缩方法
      if (fileInfo.compressionMethod === 0) {
        // 未压缩，直接复制
        console.log(`📄 文件未压缩，直接提取原始数据`);
        await extractFileFromZipOnline(
          zipUrl,
          fileName,
          outputPath,
          onProgress
        );
      } else if (fileInfo.compressionMethod === 8) {
        // Deflate压缩，需要解压缩
        console.log(`🗜️ 文件使用Deflate压缩，开始在线解压缩...`);
        await extractAndDecompressFromZip(
          zipUrl,
          fileName,
          finalOutputPath,
          fileInfo,
          onProgress
        );
      } else {
        throw new Error(`不支持的压缩方法: ${fileInfo.compressionMethod}`);
      }

      console.log(`✅ 文件解压缩完成: ${finalOutputPath}`);
    } finally {
      parser.close();
    }
  }

  /**
   * 从ZIP中提取并解压缩文件（支持Deflate）
   */
  async function extractAndDecompressFromZip(
    zipUrl: string,
    fileName: string,
    outputPath: string,
    fileInfo: {
      compressedSize: number;
      uncompressedSize: number;
      compressionMethod: number;
    },
    onProgress?: (progress: number, extracted: number, total: number) => void
  ): Promise<void> {
    const zlib = await import("zlib");
    const { createInflateRaw } = zlib;

    // 创建在线ZIP解析器获取文件范围
    const parser = await OnlineZipParser.create(zipUrl);
    let fileRange;

    try {
      fileRange = await parser.getFileRange(fileName);
      console.log(
        `📊 压缩数据范围: ${fileRange.start} - ${fileRange.end} (${fileRange.size} 字节)`
      );
    } finally {
      parser.close();
    }

    // 创建HTTP文件实例
    if (!httpFile) {
      httpFile = new HttpFile(zipUrl, opts.httpOptions);
      await httpFile.initialize();
    }

    // 创建解压缩流和输出流
    const inflateStream = createInflateRaw();
    const writeStream = createWriteStream(outputPath);

    let downloadedSize = 0;
    let decompressedSize = 0;
    const chunkSize = 64 * 1024; // 64KB chunks

    return new Promise<void>((resolve, reject) => {
      // 处理解压缩输出
      let lastReportedProgress = -1; // 跟踪上次报告的进度

      inflateStream.on("data", (chunk: Buffer) => {
        decompressedSize += chunk.length;
        writeStream.write(chunk);

        // 更新进度（基于解压缩的数据）
        const progress = (decompressedSize / fileInfo.uncompressedSize) * 100;
        if (onProgress) {
          onProgress(progress, decompressedSize, fileInfo.uncompressedSize);
        }

        // 只在达到10%倍数时显示进度日志
        const currentProgressMilestone = Math.floor(progress / 10) * 10;
        if (
          currentProgressMilestone > lastReportedProgress &&
          currentProgressMilestone >= 10
        ) {
          lastReportedProgress = currentProgressMilestone;
          console.log(
            `🗜️ 解压缩进度: ${currentProgressMilestone}% (${(
              decompressedSize /
              1024 /
              1024
            ).toFixed(2)}MB / ${(
              fileInfo.uncompressedSize /
              1024 /
              1024
            ).toFixed(2)}MB)`
          );
        }
      });

      inflateStream.on("end", () => {
        writeStream.end();
        console.log(
          `✅ 解压缩完成，最终大小: ${(decompressedSize / 1024 / 1024).toFixed(
            2
          )}MB`
        );
        resolve();
      });

      inflateStream.on("error", (error) => {
        writeStream.destroy();
        reject(new Error(`解压缩失败: ${error.message}`));
      });

      writeStream.on("error", (error) => {
        inflateStream.destroy();
        reject(new Error(`写入文件失败: ${error.message}`));
      });

      // 分块下载并解压缩
      const downloadNext = async () => {
        try {
          while (downloadedSize < fileInfo.compressedSize) {
            const currentOffset = fileRange.start + downloadedSize;
            const remainingSize = fileInfo.compressedSize - downloadedSize;
            const currentChunkSize = Math.min(chunkSize, remainingSize);
            const endOffset = currentOffset + currentChunkSize - 1;

            console.log(
              `📥 下载压缩数据块: ${currentOffset} - ${endOffset} (${currentChunkSize} 字节)`
            );

            // 下载压缩数据块
            const chunk = await httpFile!.read(currentOffset, endOffset);

            // 送入解压缩流
            inflateStream.write(chunk);

            downloadedSize += currentChunkSize;
          }

          // 结束解压缩流
          inflateStream.end();
        } catch (error) {
          inflateStream.destroy();
          writeStream.destroy();
          reject(error);
        }
      };

      downloadNext();
    });
  }

  /**
   * 检测是否为本地文件路径
   */
  async function isLocalFilePath(urlOrPath: string): Promise<boolean> {
    // 检查是否为URL
    if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
      return false;
    }

    // 检查是否为绝对或相对路径
    if (urlOrPath.includes("://")) {
      return false; // 其他协议的URL
    }

    try {
      // 尝试检查文件是否存在
      await fs.access(urlOrPath);
      return true;
    } catch {
      // 文件不存在，但仍可能是本地路径格式
      return !urlOrPath.includes("://");
    }
  }

  /**
   * 处理本地文件
   */
  async function handleLocalFile(
    filePath: string,
    partitionName: string,
    outputPath: string
  ): Promise<boolean> {
    try {
      // 检查文件是否存在
      try {
        await fs.access(filePath);
      } catch {
        throw new Error(`本地文件不存在: ${filePath}`);
      }

      // 获取文件统计信息
      const stats = await fs.lstat(filePath);
      if (!stats.isFile()) {
        throw new Error(`路径不是文件: ${filePath}`);
      }

      const fileSizeMB = stats.size / 1024 / 1024;
      console.log(`📊 本地文件大小: ${fileSizeMB.toFixed(2)} MB`);

      const SIZE_LIMIT_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
      if (stats.size > SIZE_LIMIT_BYTES) {
        return await handleLargeLocalFile(filePath, partitionName, outputPath);
      }

      // 方案1: 尝试作为OTA包处理（包含payload.bin的ZIP）
      if (filePath.toLowerCase().endsWith(".zip")) {
        try {
          console.log(`📦 尝试作为本地OTA包处理...`);
          const result = await extractPartitionFromLocalZip(
            filePath,
            partitionName,
            outputPath
          );
          if (result) {
            console.log(`✅ 成功从本地OTA包中提取分区`);
            return true;
          }
        } catch (otaError) {
          console.log(
            `⚠️ 本地OTA包处理失败: ${
              otaError instanceof Error ? otaError.message : "Unknown error"
            }`
          );
        }

        // 方案2: 尝试作为普通ZIP文件处理
        try {
          console.log(`📁 尝试作为本地ZIP文件处理...`);
          const result = await extractPartitionFromLocalZipFile(
            filePath,
            partitionName,
            outputPath
          );
          if (result) {
            console.log(`✅ 成功从本地ZIP文件中提取分区`);
            return true;
          }
        } catch (zipError) {
          console.log(
            `⚠️ 本地ZIP文件处理失败: ${
              zipError instanceof Error ? zipError.message : "Unknown error"
            }`
          );
        }
      }

      // 方案3: 尝试作为payload.bin文件处理
      if (
        filePath.toLowerCase().includes("payload") ||
        filePath.toLowerCase().endsWith(".bin")
      ) {
        try {
          console.log(`📄 尝试作为本地payload.bin文件处理...`);
          // 使用高级提取方法
          const result = await extractPartitionFromLocalPayloadAdvanced(
            filePath,
            partitionName,
            outputPath
          );
          if (result) {
            console.log(`✅ 成功从本地payload.bin中提取分区`);
            return true;
          }
        } catch (payloadError) {
          console.log(
            `⚠️ 本地payload.bin处理失败: ${
              payloadError instanceof Error
                ? payloadError.message
                : "Unknown error"
            }`
          );
        }
      }

      // 方案4: 直接复制（假设就是分区文件）
      try {
        console.log(`📋 尝试直接复制本地分区文件...`);

        const fileNameLower = path.basename(filePath).toLowerCase();
        const partitionLower = partitionName.toLowerCase();

        if (
          fileNameLower.includes(partitionLower) ||
          fileNameLower.includes(`${partitionLower}.img`) ||
          fileNameLower.endsWith(".img")
        ) {
          console.log(`🎯 文件名包含目标分区名称，尝试直接复制...`);
          const result = await copyLocalPartitionFile(filePath, outputPath);
          if (result) {
            console.log(`✅ 成功复制本地分区文件`);
            return true;
          }
        } else {
          console.log(`❌ 文件名不包含目标分区名称，跳过直接复制`);
        }
      } catch (copyError) {
        console.log(
          `⚠️ 直接复制失败: ${
            copyError instanceof Error ? copyError.message : "Unknown error"
          }`
        );
      }

      console.log(`❌ 所有本地文件处理方案都失败了`);
      return false;
    } catch (error) {
      console.error(`❌ 本地文件处理失败:`, error);
      return false;
    }
  }

  /**
   * 处理在线文件
   */
  async function handleOnlineFile(
    url: string,
    partitionName: string,
    outputPath: string
  ): Promise<boolean> {
    // 方案1: 首先尝试作为OTA包处理（检测payload.bin）
    try {
      console.log(`📦 尝试作为OTA包处理...`);
      const result = await extractPartitionFromUrl(
        url,
        partitionName,
        outputPath
      );
      if (result) {
        console.log(`✅ 成功从OTA包中提取分区`);
        return true;
      }
    } catch (otaError) {
      console.log(
        `⚠️ OTA包处理失败: ${
          otaError instanceof Error ? otaError.message : "Unknown error"
        }`
      );
    }

    // 方案2: 如果OTA包处理失败，尝试ZIP文件处理
    try {
      console.log(`📁 尝试作为ZIP文件处理...`);
      const partitionFileName = partitionName.endsWith(".img")
        ? partitionName
        : `${partitionName}.img`;

      const result = await extractPartitionFileFromZip(
        url,
        partitionFileName,
        outputPath
      );
      if (result) {
        console.log(`✅ 成功从ZIP文件中提取分区`);
        return true;
      }
    } catch (zipError) {
      console.log(
        `⚠️ ZIP文件处理失败: ${
          zipError instanceof Error ? zipError.message : "Unknown error"
        }`
      );
    }

    // 方案3: 最后尝试直接下载（假设URL就是分区文件）
    try {
      console.log(`📥 尝试直接下载分区文件...`);

      // 检查URL是否可能包含目标分区名称
      const urlLower = url.toLowerCase();
      const partitionLower = partitionName.toLowerCase();

      if (
        urlLower.includes(partitionLower) ||
        urlLower.includes(`${partitionLower}.img`) ||
        urlLower.endsWith(".img")
      ) {
        console.log(`🎯 URL可能包含目标分区文件，尝试直接下载...`);
        const result = await downloadPartitionFile(url, outputPath);
        if (result) {
          console.log(`✅ 成功直接下载分区文件`);
          return true;
        }
      } else {
        console.log(`❌ URL不包含目标分区名称，跳过直接下载`);
      }
    } catch (downloadError) {
      console.log(
        `⚠️ 直接下载失败: ${
          downloadError instanceof Error
            ? downloadError.message
            : "Unknown error"
        }`
      );
    }

    console.log(`❌ 所有在线处理方案都失败了`);
    return false;
  }

  /**
   * 从本地ZIP文件中提取payload分区
   */
  async function extractPartitionFromLocalZip(
    zipPath: string,
    partitionName: string,
    outputPath: string
  ): Promise<boolean> {
    try {
      console.log(`📦 从本地ZIP提取OTA分区: ${partitionName}`);

      // 检查文件大小，如果超过2GB使用流式处理
      const stats = await fs.stat(zipPath);
      const fileSizeGB = stats.size / (1024 * 1024 * 1024);

      if (fileSizeGB > 2) {
        console.log(
          `⚠️ 文件太大 (${fileSizeGB.toFixed(
            2
          )}GB > 2GB)，暂时不支持大文件ZIP处理`
        );
        console.log(
          `💡 建议：请先手动提取ZIP中的payload.bin文件，然后直接使用payload.bin文件`
        );
        throw new Error(
          `文件太大 (${fileSizeGB.toFixed(
            2
          )}GB)，超过ZIP处理库限制。请先提取payload.bin文件`
        );
      }

      const zipHandler = new ZipHandler(zipPath);
      const initialized = await zipHandler.initialize();

      if (!initialized) {
        throw new Error("无法初始化本地ZIP文件");
      }

      try {
        // 检查是否包含payload.bin
        if (!zipHandler.hasFile("payload.bin")) {
          throw new Error("ZIP中未找到payload.bin文件");
        }

        console.log(`✅ 在ZIP中找到payload.bin文件`);

        // 提取payload.bin到临时文件
        const tempDir = "./temp/ota";
        await ensureDir(tempDir);
        const tempPayloadPath = path.join(tempDir, `payload_${Date.now()}.bin`);

        await zipHandler.extractFile("payload.bin", tempPayloadPath);
        console.log(`📄 payload.bin已提取到临时文件: ${tempPayloadPath}`);

        // 使用临时payload文件提取分区
        // 使用高级提取方法
        const result = await extractPartitionFromLocalPayloadAdvanced(
          tempPayloadPath,
          partitionName,
          outputPath
        );

        // 清理临时文件
        try {
          await fs.unlink(tempPayloadPath);
        } catch (cleanupError) {
          console.warn("清理临时payload文件失败:", cleanupError);
        }

        return result;
      } finally {
        await zipHandler.dispose();
      }
    } catch (error) {
      console.error(`❌ 从本地ZIP提取payload分区失败:`, error);
      throw error;
    }
  }

  /**
   * 从本地ZIP文件中提取分区镜像
   */
  async function extractPartitionFromLocalZipFile(
    zipPath: string,
    partitionName: string,
    outputPath: string
  ): Promise<boolean> {
    try {
      console.log(`📁 从本地ZIP提取分区镜像: ${partitionName}`);

      // 检查文件大小，如果超过2GB使用流式处理
      const stats = await fs.stat(zipPath);
      const fileSizeGB = stats.size / (1024 * 1024 * 1024);

      if (fileSizeGB > 2) {
        console.log(
          `⚠️ 文件太大 (${fileSizeGB.toFixed(
            2
          )}GB > 2GB)，暂时不支持大文件ZIP处理`
        );
        console.log(
          `💡 建议：请先手动提取ZIP中的.img文件，然后直接使用镜像文件`
        );
        throw new Error(
          `文件太大 (${fileSizeGB.toFixed(
            2
          )}GB)，超过ZIP处理库限制。请先提取.img文件`
        );
      }

      const zipHandler = new ZipHandler(zipPath);
      const initialized = await zipHandler.initialize();

      if (!initialized) {
        throw new Error("无法初始化本地ZIP文件");
      }

      try {
        // 查找分区文件
        const partitionFileName = partitionName.endsWith(".img")
          ? partitionName
          : `${partitionName}.img`;

        const foundFiles = zipHandler.findFiles(partitionFileName, false);

        if (foundFiles.length === 0) {
          throw new Error(`在ZIP中未找到分区文件: ${partitionFileName}`);
        }

        const targetFile = foundFiles[0];
        console.log(`✅ 在ZIP中找到分区文件: ${targetFile}`);

        // 处理输出路径
        let finalOutputPath = outputPath;
        const baseFileName = path.basename(targetFile);

        if (outputPath.endsWith("/") || outputPath.endsWith("\\")) {
          finalOutputPath = path.join(outputPath, baseFileName);
        } else {
          try {
            const pathStats = await fs.lstat(outputPath);
            if (pathStats.isDirectory()) {
              finalOutputPath = path.join(outputPath, baseFileName);
            }
          } catch {
            // 路径不存在，检查是否看起来像目录路径
            if (!path.extname(outputPath)) {
              finalOutputPath = path.join(outputPath, baseFileName);
            }
          }
        }

        // 提取文件
        await zipHandler.extractFile(targetFile, finalOutputPath);
        console.log(`✅ 分区文件已提取到: ${finalOutputPath}`);

        return true;
      } finally {
        await zipHandler.dispose();
      }
    } catch (error) {
      console.error(`❌ 从本地ZIP提取分区镜像失败:`, error);
      throw error;
    }
  }

  /**
   * 使用高级 operation 处理从本地 payload.bin 提取分区（试验性）
   */
  async function extractPartitionFromLocalPayloadAdvanced(
    payloadPath: string,
    partitionName: string,
    outputPath: string
  ): Promise<boolean> {
    // 内联帮助：解压 XZ，优先 lzma-native，回退 xz-decompress
    const decompressXZ = async (comp: Buffer): Promise<Buffer> => {
      // 1) 优先 lzma-native（通过 createRequire 兼容 CJS/ESM/Electron）
      try {
        const { createRequire } = await import("module");
        const req = createRequire(process.cwd() + "/");
        const lzma = req("lzma-native") as {
          decompress?: (
            input: Buffer | Uint8Array,
            cb: (res: Buffer | Uint8Array) => void
          ) => void;
          default?: {
            decompress?: (
              input: Buffer | Uint8Array,
              cb: (res: Buffer | Uint8Array) => void
            ) => void;
          };
        };
        const lzmaDecompress = lzma?.decompress || lzma?.default?.decompress;
        if (typeof lzmaDecompress === "function") {
          return await new Promise<Buffer>((resolve, reject) => {
            try {
              lzmaDecompress(comp, (res: Buffer | Uint8Array) =>
                resolve(
                  Buffer.isBuffer(res) ? (res as Buffer) : Buffer.from(res)
                )
              );
            } catch (e) {
              reject(e);
            }
          });
        }
      } catch {
        // 忽略，进入回退
      }

      // 2) 回退到 xz-decompress（纯 JS），尽可能适配各种导出形态
      try {
        type XZModule = {
          (data: Uint8Array): Uint8Array | Buffer;
          decompress?: (data: Uint8Array) => Uint8Array | Buffer;
          default?: ((data: Uint8Array) => Uint8Array | Buffer) & {
            decompress?: (data: Uint8Array) => Uint8Array | Buffer;
          };
          XZ?: { decompress?: (data: Uint8Array) => Uint8Array | Buffer };
          XzReadableStream?: new (
            compressedStream: ReadableStream<Uint8Array>
          ) => ReadableStream<Uint8Array>;
        };
        const mod = (await import("xz-decompress")) as unknown as XZModule;
        // 2.1 先尝试函数式导出
        const defaultMaybe = (mod as { default?: unknown }).default;
        const defaultDecompress = (
          defaultMaybe && typeof defaultMaybe === "object"
            ? (defaultMaybe as { decompress?: unknown }).decompress
            : undefined
        ) as unknown;
        const XZMaybe = (mod as { XZ?: unknown }).XZ;
        const xzDecompress = (
          XZMaybe && typeof XZMaybe === "object"
            ? (XZMaybe as { decompress?: unknown }).decompress
            : undefined
        ) as unknown;
        const candsRaw: Array<unknown> = [
          typeof mod === "function" ? (mod as unknown) : undefined,
          mod?.decompress as unknown,
          defaultMaybe as unknown,
          defaultDecompress,
          xzDecompress,
        ];
        const candidates = candsRaw.filter(
          (f): f is (data: Uint8Array) => Uint8Array | Buffer =>
            typeof f === "function"
        );
        if (candidates.length > 0) {
          const out = candidates[0](new Uint8Array(comp));
          return Buffer.isBuffer(out) ? out : Buffer.from(out);
        }
        // 2.2 再尝试基于 XzReadableStream 的 WASM 解压
        const XzReadableStream = (mod as { XzReadableStream?: unknown })
          .XzReadableStream as
          | (new (
              compressedStream: ReadableStream<Uint8Array>
            ) => ReadableStream<Uint8Array>)
          | undefined;
        if (XzReadableStream) {
          const input = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array(comp));
              controller.close();
            },
          });
          const stream = new XzReadableStream(input);
          const reader = stream.getReader();
          const chunks: Uint8Array[] = [];
          // 累积分块
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) chunks.push(value);
          }
          const total = chunks.reduce((n, c) => n + c.byteLength, 0);
          const out = new Uint8Array(total);
          let offset = 0;
          for (const c of chunks) {
            out.set(c, offset);
            offset += c.byteLength;
          }
          return Buffer.from(out);
        }
        throw new Error("xz-decompress 未导出 decompress 或 XzReadableStream");
      } catch (e2) {
        throw new Error(`XZ 解压不可用: ${e2}`);
      }
    };

    console.log(`📄 [高级模式] 从本地payload.bin提取分区: ${partitionName}`);
    console.log(`📂 Payload文件: ${payloadPath}`);
    console.log(`💾 输出路径: ${outputPath}`);

    // 读取 payload.bin 头部信息
    const fileHandle = await fs.open(payloadPath, "r");
    try {
      // 读取固定 24B 头并解析 sizes
      const headerFixed = Buffer.alloc(24);
      const { bytesRead: hdrRead } = await fileHandle.read(
        headerFixed,
        0,
        24,
        0
      );
      if (hdrRead < 24) {
        throw new Error("Payload文件太小，无法解析头部信息");
      }
      const magic = headerFixed.readUInt32BE(0);
      if (magic !== 0x43724155) {
        throw new Error(
          `无效的payload魔术数字: 0x${magic.toString(16)}，应为 0x43724155`
        );
      }
      /* const version = */ headerFixed.readBigUInt64BE(4);
      const manifestLength = Number(headerFixed.readBigUInt64BE(12));
      const manifestSignatureLength = headerFixed.readUInt32BE(20);

      const totalHeaderSize = 24 + manifestLength + manifestSignatureLength;
      const fullHeaderBuffer = Buffer.alloc(totalHeaderSize);
      const { bytesRead } = await fileHandle.read(
        fullHeaderBuffer,
        0,
        totalHeaderSize,
        0
      );
      if (bytesRead < totalHeaderSize) {
        throw new Error(
          `Payload header读取不足: 需要 ${totalHeaderSize}, 实际 ${bytesRead}`
        );
      }

      // 解析 manifest
      const payloadHeaderData = new Uint8Array(
        fullHeaderBuffer.subarray(0, bytesRead)
      );
      const { manifest } = await parsePayloadPrefixAndDecode<ProtoManifest>(
        payloadHeaderData
      );

      // 查找目标分区
      const targetPartition = manifest.partitions.find((p) => {
        const nm = p.partition_name || p.partitionName;
        return nm === partitionName;
      });
      if (!targetPartition) {
        const available = manifest.partitions
          .map((p) => p.partition_name || p.partitionName)
          .join(", ");
        throw new Error(
          `分区 '${partitionName}' 不存在。可用分区: ${available}`
        );
      }
      if (
        !targetPartition.operations ||
        targetPartition.operations.length === 0
      ) {
        throw new Error(
          `分区 '${partitionName}' 在此 OTA 中没有操作，基础提取将生成无效镜像，已中止。`
        );
      }

      // 操作统计日志
      const typeCounts: Record<number, number> = {};
      let totalOpData = 0;
      for (const op of targetPartition.operations as NonNullable<
        ProtoManifest["partitions"][number]["operations"]
      >) {
        const t = op?.type;
        if (typeof t === "number") {
          typeCounts[t] = (typeCounts[t] || 0) + 1;
        }
        const dataLen = op?.data_length ?? op?.dataLength;
        if (typeof dataLen === "number") totalOpData += dataLen;
      }
      console.log(
        `🧩 操作统计: 总数=${
          targetPartition.operations.length
        }, 分布=${JSON.stringify(typeCounts)}, data_length总和=${totalOpData}`
      );

      // 计算数据起始偏移
      const dataStartOffset = totalHeaderSize;
      const payloadDataOffset = dataStartOffset;

      // block_size（默认 4096）
      const m = manifest as unknown as {
        block_size?: number;
        blockSize?: number;
      };
      const blockSize = m.block_size || m.blockSize || 4096;
      console.log(`📐 使用 block_size: ${blockSize}`);

      // 小工具：安全读取 dst_extents（兼容 snake_case/camelCase）
      const getExtents = (
        op: unknown
      ): Array<{ startBlock: number; numBlocks: number }> => {
        const o = op as Record<string, unknown>;
        const arr = (o["dst_extents"] || o["dstExtents"]) as
          | Array<Record<string, unknown>>
          | undefined;
        if (!arr || !Array.isArray(arr)) return [];
        return arr.map((e) => ({
          startBlock: Number((e?.["start_block"] ?? e?.["startBlock"]) || 0),
          numBlocks: Number((e?.["num_blocks"] ?? e?.["numBlocks"]) || 0),
        }));
      };

      // 计算输出大小
      let targetSize = targetPartition.new_partition_info?.size || 0;
      if (!targetSize) {
        let maxEndBlock = 0;
        for (const op of targetPartition.operations) {
          for (const e of getExtents(op)) {
            const end = (e.startBlock || 0) + (e.numBlocks || 0);
            if (end > maxEndBlock) maxEndBlock = end;
          }
        }
        targetSize = maxEndBlock * blockSize;
        if (!targetSize) {
          targetSize = targetPartition.operations.reduce(
            (acc: number, op: unknown) => {
              return (
                acc +
                getExtents(op).reduce(
                  (a: number, e: { numBlocks: number }) =>
                    a + (e.numBlocks || 0) * blockSize,
                  0
                )
              );
            },
            0
          );
          if (!targetSize) targetSize = 64 * 1024 * 1024; // 64MB fallback
        }
      }

      // 准备输出文件
      await ensureDir(path.dirname(outputPath));
      const outHandle = await fs.open(outputPath, "w+");
      try {
        await outHandle.truncate(targetSize);

        // 逐操作重建
        for (let i = 0; i < targetPartition.operations.length; i++) {
          const op = targetPartition.operations[i] as {
            type?: number;
            data_offset?: number;
            data_length?: number;
            dataOffset?: number;
            dataLength?: number;
            dst_extents?: Array<{ start_block?: number; num_blocks?: number }>;
            dstExtents?: Array<{ start_block?: number; num_blocks?: number }>;
          };
          const opType = op.type ?? -1;
          const extents = getExtents(op);
          let totalExtentBytes = 0;
          for (const e of extents)
            totalExtentBytes += (e.numBlocks || 0) * blockSize;

          const logDataLen = op.data_length ?? op.dataLength ?? 0;
          console.log(
            `🔧 操作#${i}: type=${opType}, data_len=${logDataLen}, dst_extents=${extents.length}, dst_bytes=${totalExtentBytes}`
          );

          // 若目标写入范围为 0，跳过该操作（常见于占位/无效 op）
          if (totalExtentBytes === 0) {
            continue;
          }

          if (opType === 6) {
            // ZERO
            const zeroChunk = Buffer.alloc(
              Math.min(4 * 1024 * 1024, Math.max(blockSize, 4096)),
              0
            );
            for (const e of extents) {
              const bytes = (e.numBlocks || 0) * blockSize;
              let remaining = bytes;
              let pos = (e.startBlock || 0) * blockSize;
              while (remaining > 0) {
                const writeSize = Math.min(remaining, zeroChunk.length);
                await outHandle.write(zeroChunk, 0, writeSize, pos);
                remaining -= writeSize;
                pos += writeSize;
              }
            }
            continue;
          }

          if (opType === 0) {
            // REPLACE
            const dataOffset = op.data_offset ?? op.dataOffset;
            const dataLength = op.data_length ?? op.dataLength;
            if (dataOffset === undefined || !dataLength) {
              throw new Error("REPLACE 操作缺少 data_offset/data_length");
            }
            const readOffset = payloadDataOffset + dataOffset;
            const dataBuf = Buffer.alloc(dataLength);
            await fileHandle.read(dataBuf, 0, dataLength, readOffset);

            let cursor = 0;
            for (const e of extents) {
              const bytes = (e.numBlocks || 0) * blockSize;
              const slice = dataBuf.subarray(cursor, cursor + bytes);
              if (slice.length !== bytes) {
                throw new Error(
                  `REPLACE 数据不足：需要 ${bytes}，仅有 ${slice.length}`
                );
              }
              const pos = (e.startBlock || 0) * blockSize;
              await outHandle.write(slice, 0, slice.length, pos);
              cursor += bytes;
            }
            continue;
          }

          if (opType === 1 || opType === 8) {
            // REPLACE_BZ / REPLACE_XZ
            const dataOffset = op.data_offset ?? op.dataOffset;
            const dataLength = op.data_length ?? op.dataLength;
            if (dataOffset === undefined || !dataLength) {
              throw new Error(
                `压缩替换操作缺少 data_offset/data_length (type=${opType})`
              );
            }
            const readOffset = payloadDataOffset + dataOffset;
            const compBuf = Buffer.alloc(dataLength);
            await fileHandle.read(compBuf, 0, dataLength, readOffset);

            let decompBuf: Buffer;
            if (opType === 8) {
              try {
                decompBuf = await decompressXZ(compBuf);
              } catch (e) {
                throw new Error(`XZ 解压失败: ${e}`);
              }
            } else {
              try {
                const decomp = bz2Decode(compBuf);
                decompBuf = Buffer.isBuffer(decomp)
                  ? (decomp as Buffer)
                  : Buffer.from(decomp);
              } catch (e) {
                throw new Error(`BZ2 解压失败: ${e}`);
              }
            }

            const expectedBytes = extents.reduce(
              (acc: number, e: { startBlock: number; numBlocks: number }) =>
                acc + (e.numBlocks || 0) * blockSize,
              0
            );
            if (expectedBytes > 0 && decompBuf.length !== expectedBytes) {
              console.warn(
                `⚠️ 解压后大小(${decompBuf.length})与目标范围(${expectedBytes})不一致，按目标范围截断/填充`
              );
            }

            let cursor = 0;
            for (const e of extents) {
              const bytes = (e.numBlocks || 0) * blockSize;
              const slice = decompBuf.subarray(cursor, cursor + bytes);
              if (slice.length < bytes) {
                throw new Error(
                  `解压数据不足：需要 ${bytes}，仅有 ${slice.length}`
                );
              }
              const pos = (e.startBlock || 0) * blockSize;
              await outHandle.write(slice, 0, slice.length, pos);
              cursor += bytes;
            }
            continue;
          }

          // 其它类型暂不支持
          throw new Error(
            `不支持的操作类型: ${opType}（已实现: REPLACE=0, ZERO=6, REPLACE_BZ=1, REPLACE_XZ=8）`
          );
        }

        console.log(`✅ 分区 '${partitionName}' 重建完成: ${outputPath}`);
        return true;
      } catch (opErr) {
        // 发生错误时清理输出文件，避免留下无效镜像
        try {
          await fs.unlink(outputPath);
        } catch {
          // ignore unlink error
        }
        throw opErr;
      } finally {
        await outHandle.close();
      }
    } finally {
      await fileHandle.close();
    }
  }

  /**
   * 复制本地分区文件
   */
  async function copyLocalPartitionFile(
    sourcePath: string,
    outputPath: string
  ): Promise<boolean> {
    try {
      console.log(`📋 复制本地文件: ${sourcePath} → ${outputPath}`);

      // 确保输出目录存在
      await ensureDir(path.dirname(outputPath));

      // 检查输出路径是否是目录
      let finalOutputPath = outputPath;
      if (outputPath.endsWith("/") || outputPath.endsWith("\\")) {
        finalOutputPath = path.join(outputPath, path.basename(sourcePath));
      } else {
        try {
          const pathStats = await fs.lstat(outputPath);
          if (pathStats.isDirectory()) {
            finalOutputPath = path.join(outputPath, path.basename(sourcePath));
          }
        } catch {
          // 路径不存在，按原路径处理
        }
      }

      // 复制文件
      await fs.copyFile(sourcePath, finalOutputPath);

      console.log(`✅ 本地文件复制完成: ${finalOutputPath}`);
      return true;
    } catch (error) {
      console.error(`❌ 复制本地文件失败:`, error);
      return false;
    }
  }

  /**
   * 处理大文件 - 使用流式处理
   */
  async function handleLargeLocalFile(
    filePath: string,
    partitionName: string,
    outputPath: string
  ): Promise<boolean> {
    try {
      console.log(`🚀 启动大文件流式处理模式...`);

      // 使用yauzl流式ZIP处理
      const result = await extractFromLargeZipStream(
        filePath,
        partitionName,
        outputPath
      );
      if (result) {
        console.log(`✅ 流式ZIP处理成功`);
        return true;
      }

      return false;
    } catch (zipError) {
      console.log(
        `⚠️ 流式ZIP处理失败: ${
          zipError instanceof Error ? zipError.message : "Unknown error"
        }`
      );
      return false;
    }
  }

  /**
   * 使用yauzl流式处理大ZIP文件
   */
  async function extractFromLargeZipStream(
    zipPath: string,
    partitionName: string,
    outputPath: string
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      console.log(`🔍 开始流式扫描ZIP文件...`);

      yauzl.open(
        zipPath,
        { lazyEntries: true, autoClose: false },
        (err: Error | null, zipfile: yauzl.ZipFile | undefined) => {
          if (err) {
            reject(new Error(`无法打开ZIP文件: ${err.message}`));
            return;
          }

          let found = false;
          let payloadEntry: yauzl.Entry | null = null;
          let entriesScanned = 0;

          if (!zipfile) {
            reject(new Error("ZIP文件未能正确打开"));
            return;
          }

          zipfile.readEntry();

          zipfile.on("entry", (entry: yauzl.Entry) => {
            entriesScanned++;

            if (entriesScanned % 100 === 0) {
              console.log(`📊 已扫描 ${entriesScanned} 个条目...`);
            }

            const fileName = entry.fileName.toLowerCase();
            const targetName = partitionName.toLowerCase();

            // 检查是否是目标文件
            if (
              fileName.includes(`${targetName}.img`) ||
              (fileName.includes(targetName) && fileName.endsWith(".img"))
            ) {
              console.log(`🎯 找到目标分区文件: ${entry.fileName}`);
              found = true;

              zipfile.openReadStream(
                entry,
                (err: Error | null, readStream: NodeJS.ReadableStream) => {
                  if (err) {
                    reject(new Error(`无法读取文件流: ${err.message}`));
                    return;
                  }

                  // 直接使用指定的输出路径，不要再次拼接
                  const finalOutputPath = outputPath;

                  // 确保输出目录存在
                  ensureDir(path.dirname(finalOutputPath))
                    .then(() => {
                      const writeStream = createWriteStream(finalOutputPath);

                      readStream.pipe(writeStream);

                      writeStream.on("finish", () => {
                        console.log(`✅ 流式提取完成: ${finalOutputPath}`);
                        zipfile.close();
                        resolve(true);
                      });

                      writeStream.on("error", (err: Error) => {
                        reject(new Error(`写入失败: ${err.message}`));
                      });
                    })
                    .catch((err: Error) => {
                      reject(new Error(`创建目录失败: ${err.message}`));
                    });
                }
              );
              return;
            } else if (fileName.includes("payload.bin")) {
              // 先记录，优先扫描完整ZIP寻找直出 .img
              console.log(
                `👀 发现payload.bin条目，先记录待后置处理: ${entry.fileName}`
              );
              payloadEntry = entry;
            }

            zipfile.readEntry();
          });

          zipfile.on("end", () => {
            if (found) return; // 已通过直出 .img 处理

            // 未找到直出 .img，若存在 payload.bin，则走 payload 解析
            if (payloadEntry) {
              const cacheDir = path.resolve(opts.tempDir, "payload-cache");
              const cacheName = `${path
                .basename(zipPath)
                .replace(/[^a-zA-Z0-9_.-]/g, "_")}.payload.bin`;
              const cachedPayloadPath = path.join(cacheDir, cacheName);

              ensureDir(cacheDir)
                .then(async () => {
                  // 尝试复用缓存
                  let reuse = false;
                  try {
                    const s = await fs.stat(cachedPayloadPath);
                    reuse = s.size > 0;
                  } catch {
                    // ignore
                  }

                  const parsePayload = async () => {
                    try {
                      const success =
                        await extractPartitionFromLocalPayloadAdvanced(
                          cachedPayloadPath,
                          partitionName,
                          outputPath
                        );
                      try {
                        zipfile.close();
                      } catch {
                        // ignore
                      }
                      if (opts.cleanup !== false) {
                        try {
                          await fs.unlink(cachedPayloadPath);
                          console.log(
                            `🧹 已清理payload缓存: ${cachedPayloadPath}`
                          );
                        } catch (e) {
                          console.warn(`⚠️ 清理payload缓存失败: ${e}`);
                        }
                        // 兼容清理旧命名遗留（.payload 无 .bin）
                        try {
                          if (cachedPayloadPath.endsWith(".payload.bin")) {
                            const legacy = cachedPayloadPath.replace(
                              /\.payload\.bin$/,
                              ".payload"
                            );
                            try {
                              const s = await fs.stat(legacy);
                              if (s.size >= 0) {
                                await fs.unlink(legacy);
                                console.log(`🧹 同步清理旧缓存: ${legacy}`);
                              }
                            } catch {
                              /* no legacy */
                            }
                          }
                        } catch (e) {
                          console.warn(`⚠️ 旧缓存清理检查失败: ${e}`);
                        }
                      }
                      resolve(success);
                    } catch (payloadError) {
                      try {
                        zipfile.close();
                      } catch {
                        // ignore
                      }
                      if (opts.cleanup !== false) {
                        try {
                          await fs.unlink(cachedPayloadPath);
                        } catch (e) {
                          console.warn(
                            `⚠️ 清理payload缓存失败(解析失败分支): ${e}`
                          );
                        }
                        // 同步尝试清理旧命名遗留（.payload）
                        try {
                          if (cachedPayloadPath.endsWith(".payload.bin")) {
                            const legacy = cachedPayloadPath.replace(
                              /\.payload\.bin$/,
                              ".payload"
                            );
                            try {
                              const s = await fs.stat(legacy);
                              if (s.size >= 0) {
                                await fs.unlink(legacy);
                              }
                            } catch {
                              /* no legacy */
                            }
                          }
                        } catch (e) {
                          console.warn(`⚠️ 旧缓存清理检查失败: ${e}`);
                        }
                      }
                      reject(
                        new Error(
                          `payload.bin解析失败: ${
                            payloadError instanceof Error
                              ? payloadError.message
                              : "Unknown error"
                          }`
                        )
                      );
                    }
                  };

                  if (reuse) {
                    console.log(
                      `🗃️ 复用已缓存的payload.bin: ${cachedPayloadPath}`
                    );
                    return parsePayload();
                  }

                  // 解压payload到缓存后再解析
                  zipfile.openReadStream(
                    payloadEntry as yauzl.Entry,
                    (err: Error | null, readStream: NodeJS.ReadableStream) => {
                      if (err) {
                        reject(
                          new Error(`无法读取payload.bin流: ${err.message}`)
                        );
                        return;
                      }
                      console.log(
                        `📥 正在将payload.bin解压到缓存: ${cachedPayloadPath}`
                      );
                      const writeStream = createWriteStream(cachedPayloadPath);
                      readStream.pipe(writeStream);
                      writeStream.on("finish", parsePayload);
                      writeStream.on("error", (err: Error) => {
                        reject(
                          new Error(`payload.bin写入失败: ${err.message}`)
                        );
                      });
                    }
                  );
                })
                .catch((err: Error) => {
                  reject(new Error(`创建缓存目录失败: ${err.message}`));
                });
              return;
            }

            reject(new Error(`在ZIP中未找到分区文件: ${partitionName}`));
          });

          zipfile.on("error", (err: Error) => {
            reject(new Error(`ZIP处理错误: ${err.message}`));
          });
        }
      );
    });
  }

  // 返回公共API
  return {
    extractPartitionFileFromZip,
    extractPartitionFromUrl,
    smartExtractPartition,
    downloadPartitionFile,
  };
}
