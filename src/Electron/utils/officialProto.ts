/**
 * 官方 Protobuf 协议解析 (纯函数式)
 *
 * 用于解析 Android OTA 更新包的 DeltaArchiveManifest 协议
 * 基于 Google 官方的 update_metadata.proto 定义
 */

import { getUpdateMetadataProtoPath } from "./paths";
import type { Root, Type } from "protobufjs";

// Lazy-loaded protobufjs to avoid bundler issues until used
let _DeltaArchiveManifest: Type | null = null;

/**
 * 确保 Protobuf 类型已加载
 * 延迟加载 protobufjs 避免打包问题
 *
 * @throws {Error} 如果无法加载 proto 文件或找不到类型定义
 */
async function ensureProtoLoaded(): Promise<void> {
  if (_DeltaArchiveManifest) return;

  const protobuf = await import("protobufjs");
  const { load } = protobuf as unknown as {
    load: (p: string) => Promise<Root>;
  };

  // 解析 proto 路径（多候选）
  const protoPath = getUpdateMetadataProtoPath();
  const _root = await load(protoPath);
  const fullName = "chromeos_update_engine.DeltaArchiveManifest";
  const lookup = _root.lookupType(fullName);
  if (!lookup) throw new Error(`在proto中未找到类型: ${fullName}`);
  _DeltaArchiveManifest = lookup as unknown as Type;
}

/**
 * 使用官方 update_metadata.proto 解码 DeltaArchiveManifest
 *
 * 传入的 bytes 必须是纯 Manifest 的 protobuf 序列化内容（不含 CrAU 头/签名）。
 *
 * @param manifestBytes - Manifest 的 protobuf 序列化数据
 * @returns 解码后的 Manifest 对象
 *
 * @throws {Error} 如果 Manifest 类型未初始化或解码失败
 *
 * @example
 * ```ts
 * const manifestBytes = new Uint8Array([...]); // 从 payload.bin 提取的 manifest 数据
 * const manifest = await decodeManifestWithProto(manifestBytes);
 * console.log(manifest.partitions);
 * ```
 */
export async function decodeManifestWithProto<T = unknown>(
  manifestBytes: Uint8Array
): Promise<T> {
  await ensureProtoLoaded();
  if (!_DeltaArchiveManifest) throw new Error("Manifest类型未初始化");

  // decode -> toJSON for plain object with camelCase keys
  const msg = _DeltaArchiveManifest.decode(manifestBytes);
  const plain = _DeltaArchiveManifest.toObject(msg, {
    longs: Number,
    enums: Number,
    bytes: Uint8Array,
    defaults: false,
    arrays: true,
    objects: true,
  });
  return plain as unknown as T;
}

/**
 * 从完整 payload 前缀（含 CrAU 头 + manifest + 签名）中切出 manifest 并解码
 *
 * CrAU 格式结构：
 * - Magic (4 bytes): 0x43724155 ("CrAU")
 * - Version (8 bytes): 版本号
 * - Manifest Size (8 bytes): manifest 长度
 * - Signature Size (4 bytes): 签名长度
 * - Manifest (manifestSize bytes): protobuf 序列化的 manifest
 * - Signature (signatureSize bytes): 签名数据
 *
 * @param payloadPrefix - payload.bin 的前缀数据（至少包含头部 + manifest + 签名）
 * @returns 包含解码后的 manifest 和各部分大小的对象
 *
 * @throws {Error} 如果数据不足、魔术数字无效或解析失败
 *
 * @example
 * ```ts
 * const payloadData = await readFile('payload.bin');
 * const { manifest, headerSize, manifestSize } = await parsePayloadPrefixAndDecode(
 *   payloadData.slice(0, 100000) // 读取前 100KB
 * );
 * console.log(`Header: ${headerSize}, Manifest: ${manifestSize}`);
 * ```
 */
export async function parsePayloadPrefixAndDecode<T = unknown>(
  payloadPrefix: Uint8Array
): Promise<{
  manifest: T;
  headerSize: number;
  manifestSize: number;
  signatureSize: number;
}> {
  if (payloadPrefix.length < 24) {
    throw new Error("Payload数据不足以包含头部");
  }

  const dv = new DataView(
    payloadPrefix.buffer,
    payloadPrefix.byteOffset,
    payloadPrefix.byteLength
  );

  // 验证魔术数字 "CrAU" (0x43724155)
  const magic = dv.getUint32(0, false);
  if (magic !== 0x43724155) {
    throw new Error("无效的CrAU魔术数字");
  }

  // 跳过版本号 (8 bytes, offset 4-11)
  // 读取 manifest 大小 (8 bytes, offset 12-19)
  const manifestSize = Number(
    new DataView(
      payloadPrefix.buffer,
      payloadPrefix.byteOffset + 12,
      8
    ).getBigUint64(0, false)
  );

  // 读取签名大小 (4 bytes, offset 20-23)
  const sigSize = new DataView(
    payloadPrefix.buffer,
    payloadPrefix.byteOffset + 20,
    4
  ).getUint32(0, false);

  const headerSize = 24;
  const totalNeeded = headerSize + manifestSize + sigSize;

  if (payloadPrefix.length < totalNeeded) {
    throw new Error(
      `传入数据不足: 需要 ${totalNeeded} 字节, 实际 ${payloadPrefix.length}`
    );
  }

  // 提取 manifest 数据
  const manifestBytes = payloadPrefix.slice(
    headerSize,
    headerSize + manifestSize
  );

  // 解码 manifest
  const manifest = await decodeManifestWithProto<T>(manifestBytes);

  return {
    manifest,
    headerSize,
    manifestSize,
    signatureSize: sigSize,
  };
}
