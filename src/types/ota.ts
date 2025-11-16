/**
 * Android OTA 解析器类型定义
 * 定义了OTA payload解析和处理过程中使用的所有数据结构
 */

/**
 * 操作类型枚举
 * 定义了OTA更新过程中可能的操作类型
 */
export const OperationType = {
  /** 替换操作 - 直接替换数据 */
  REPLACE: 0,
  /** 替换BZ操作 - 使用BZ2压缩的数据替换 (per proto) */
  REPLACE_BZ: 1,
  /** 零填充操作 - 用零填充指定区域 */
  ZERO: 6,
  /** 丢弃操作 - 丢弃指定数据 */
  DISCARD: 7,
  /** 替换XZ操作 - 使用XZ压缩的数据替换 (per proto) */
  REPLACE_XZ: 8,
} as const;

export type OperationType = (typeof OperationType)[keyof typeof OperationType];

/**
 * 范围定义
 * 表示数据块的连续范围
 */
export interface Extent {
  /** 起始块号 */
  startBlock: number;
  /** 块数量 */
  numBlocks: number;
}

/**
 * 安装操作接口
 * 定义了单个安装操作的所有属性
 */
/**
 * 安装操作（InstallOperation）
 *
 * 表示对某个分区的一条原子更新操作。工具仅关心与完整提取相关的字段：
 * - type: 操作类型（与 OperationType 对应）。完整提取典型使用 REPLACE/REPLACE_BZ/REPLACE_XZ/ZERO。
 * - dataOffset/dataLength: 指向 payload 数据区中该操作数据片段的偏移与长度（字节）。
 * - dstExtents/dstLength: 目标镜像上的块范围与总长度。dstExtents 的块大小由 manifest.blockSize 指定。
 * - srcExtents/srcLength: 主要用于差分更新（本工具对“全量”提取可忽略）。
 * - dataSha256Hash: 可选校验信息。
 */
export interface InstallOperation {
  /** 操作类型（见 OperationType 常量） */
  type: OperationType;
  /** 数据在 payload 数据区中的偏移（字节） */
  dataOffset?: number;
  /** 数据长度（字节） */
  dataLength?: number;
  /** 目标写入区域（块范围），块大小=manifest.blockSize */
  dstExtents?: Extent[];
  /** 目标写入总长度（字节，可选） */
  dstLength?: number;
  /** 源区域（差分更新用，可选） */
  srcExtents?: Extent[];
  /** 源数据长度（字节，可选） */
  srcLength?: number;
  /** 数据 SHA-256 哈希（可选） */
  dataSha256Hash?: Buffer;
}

/**
 * OTA分区接口
 * 简化的分区定义，专注于必要的提取信息
 */
/**
 * OTAPartition（OTA 分区）
 *
 * 描述某个分区在此次 OTA 中的更新内容。
 * - name: 分区名（例如 boot/system/product 等）。
 * - operations: 针对该分区的更新操作，按顺序重放可恢复镜像。
 * - newPartitionInfo/oldPartitionInfo: 新/旧分区的尺寸与校验摘要（字节），部分 ROM/版本可能缺省 hash。
 */
export interface OTAPartition {
  /** 分区名称（如 'boot', 'system' 等） */
  name: string;
  /** 针对该分区的安装操作（按顺序重放） */
  operations: InstallOperation[];
  /** 新分区信息（全量包通常提供 size；hash 可选） */
  newPartitionInfo?: {
    size: number;
    hash?: Buffer;
  };
  /** 旧分区信息（差分包相关字段，可选） */
  oldPartitionInfo?: {
    size: number;
    hash?: Buffer;
  };
}

/**
 * OTA解析结果
 * 包含解析操作的结果和元数据
 */
export interface OTAParseResult {
  /** 解析是否成功 */
  success: boolean;
  /** 错误信息（如果失败） */
  error?: string;
  /** 分区列表 */
  partitions: OTAPartition[];
  /** 元数据信息 */
  metadata?: {
    blockSize: number;
    totalPartitions: number;
    payloadSize: number;
    sourceUrl: string;
  };
}

/**
 * OTA有效载荷头部信息
 * 包含payload文件的基本元数据
 */
export interface PayloadHeader {
  /** 版本号 */
  version: number;
  /** 清单数据长度 */
  manifestLen: number;
  /** 元数据签名长度 */
  metadataSignatureLen: number;
}

/**
 * Delta存档清单
 * 包含完整的更新信息
 */
/**
 * DeltaArchiveManifest（清单）
 *
 * 对 payload 的高层描述：包含块大小、分区列表等元数据。
 * - blockSize: 块大小（字节）。通常为 4096，用于解释 extents 与目标镜像布局。
 * - partitions: OTA 分区更新列表。
 * - minorVersion/maxTimestamp: 版本/时间戳等附加元信息，因包而异。
 */
export interface DeltaArchiveManifest {
  /** 块大小（字节，通常为 4096） */
  blockSize: number;
  /** 分区更新列表 */
  partitions?: OTAPartition[];
  /** 最小 Android 版本（可选） */
  minorVersion?: number;
  /** 最大时间戳（可选） */
  maxTimestamp?: number;
}

/**
 * 解析结果接口
 * 包含解析操作的结果和状态
 */
export interface ParseResult {
  /** 解析的清单数据 */
  manifest: DeltaArchiveManifest;
  /** 分区列表 */
  partitions: OTAPartition[];
  /** 解析是否成功 */
  success: boolean;
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 提取配置选项
 * 用于配置分区提取过程
 */
export interface ExtractOptions {
  /** 输出目录路径 */
  outputDir: string;
  /** 要提取的分区列表（如果为空则提取所有分区） */
  partitions?: string[];
  /** 是否验证提取的数据 */
  verify?: boolean;
  /** 进度回调函数 */
  onProgress?: (progress: number, message: string) => void;
}

/**
 * HTTP文件配置选项
 */
export interface HttpFileOptions {
  /** 请求超时时间（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 用户代理字符串 */
  userAgent?: string;
  /** 自定义请求头 */
  headers?: Record<string, string>;
  /** 进度回调函数 */
  onProgress?: (downloaded: number, total: number) => void;
}

/**
 * ZIP处理选项
 */
export interface ZipHandlerOptions {
  /** 是否使用临时文件缓存 */
  useCache?: boolean;
  /** 缓存目录路径 */
  cacheDir?: string;
  /** 进度回调函数 */
  onProgress?: (progress: number, message: string) => void;
}

/**
 * 在线OTA解析器选项
 */
export interface OnlineOTAParserOptions {
  /** 临时文件目录 */
  tempDir?: string;
  /** HTTP配置选项 */
  httpOptions?: HttpFileOptions;
  /** ZIP处理选项 */
  zipOptions?: ZipHandlerOptions;
  /** 是否在处理完成后清理临时文件 */
  cleanup?: boolean;
  /** 进度回调函数 */
  onProgress?: (progress: number, message: string) => void;
}

/**
 * ProtoManifest
 *
 * 从官方 update_metadata.proto 解析出的清单（manifest）最小结构描述。
 * 为了在不同 ROM/设备上保持兼容，字段同时保留 snake_case 与 camelCase 两种命名形式。
 * 注意：这里的类型仅用于反序列化后的读取，不强制约束完整 proto 结构。
 */
export interface ProtoManifest {
  /**
   * 块大小（单位：字节）。标准为 4096。可能以 block_size 或 blockSize 两种形式出现。
   */
  block_size?: number;
  blockSize?: number;

  /**
   * 分区列表。不同包可能使用 partition_name / partitionName 命名。
   */
  partitions: Array<{
    /** 分区名称（snake_case 版本） */
    partition_name?: string;
    /** 分区名称（camelCase 版本） */
    partitionName?: string;

    /** 新分区信息（snake_case 版本，仅关心 size） */
    new_partition_info?: { size?: number };
    /** 新分区信息（camelCase 版本，仅关心 size） */
    newPartitionInfo?: { size?: number };

    /**
     * 操作列表。安装时将依此重放。
     * - type: 操作类型（数字，与 OperationType 常量对应）
     * - data_offset/data_length: 指向 payload 数据区中该操作数据片段的偏移与长度
     * - dst_extents: 目标写入的块范围（start_block/num_blocks）
     *
     * 注意：字段同样保留 snake_case 与 camelCase 的并存形式，以兼容不同实现。
     */
    operations?: Array<{
      /** 操作类型（数值枚举） */
      type?: number;

      /** 数据偏移（相对于 payload 数据区的起始，snake_case/camelCase 兼容） */
      data_offset?: number;
      dataOffset?: number;

      /** 数据长度（snake_case/camelCase 兼容） */
      data_length?: number;
      dataLength?: number;

      /** 目标范围（snake_case 版本） */
      dst_extents?: Array<{ start_block?: number; num_blocks?: number }>;
      /** 目标范围（混合/兼容版本） */
      dstExtents?: Array<{
        start_block?: number;
        num_blocks?: number;
        startBlock?: number;
        numBlocks?: number;
      }>;
    }>;
  }>;
}

/**
 * 分区信息接口
 * 用于显示分区的基本信息
 */
export interface PartitionInfo {
  /** 分区名称 */
  name: string;
  /** 分区大小（字节） */
  size: number;
  /** 操作数量 */
  operationCount: number;
  /** 文件系统类型 */
  fileSystemType: string;
  /** 是否支持提取 */
  extractable: boolean;
}

/**
 * 提取进度信息
 */
export interface ExtractionProgress {
  /** 当前处理的分区名称 */
  currentPartition: string;
  /** 已完成的分区数量 */
  completedPartitions: number;
  /** 总分区数量 */
  totalPartitions: number;
  /** 当前分区的进度百分比 */
  partitionProgress: number;
  /** 总体进度百分比 */
  overallProgress: number;
  /** 状态消息 */
  message: string;
}
