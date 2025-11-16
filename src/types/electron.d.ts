/**
 * Electron API 全局类型声明文件
 *
 * 这个文件为 Electron 应用的渲染进程提供类型安全的 API 访问。
 * 通过扩展全局 Window 接口，使得在渲染进程中可以安全地使用 electronAPI。
 *
 * @file electron.d.ts
 * @description 全局类型声明文件，扩展 Window 接口以支持 Electron API
 * @author YanRain ToolBox Team
 *
 * @architecture
 * 类型声明层次结构：
 * - Window (全局接口)
 *   └── electronAPI (Electron 预加载脚本注入的 API)
 *       └── ElectronAPI (从 preload.ts 导入的类型定义)
 *
 * @security
 * 这个类型声明确保了：
 * - 渲染进程只能访问预定义的安全 API
 * - 类型检查防止误用不存在的方法
 * - 与 Electron 的上下文隔离配合使用
 *
 * @example 在渲染进程中使用
 * ```typescript
 * // 类型安全的 API 调用
 * const devices = await window.electronAPI.getAllDevices();
 * const result = await window.electronAPI.reboot('system', 'device123');
 *
 * // TypeScript 会提供完整的类型提示和错误检查
 * window.electronAPI.nonExistentMethod(); // ❌ 编译错误
 * ```
 *
 * @example 组件中的使用
 * ```typescript
 * import React, { useEffect, useState } from 'react';
 *
 * function DeviceManager() {
 *   const [devices, setDevices] = useState([]);
 *
 *   useEffect(() => {
 *     // TypeScript 提供完整的类型支持
 *     window.electronAPI.getAllDevices()
 *       .then(setDevices)
 *       .catch(console.error);
 *   }, []);
 *
 *   return <div>{devices.length} devices found</div>;
 * }
 * ```
 */

import { ElectronAPI } from "../Electron/preload";

/**
 * 全局声明模块
 *
 * 扩展全局命名空间，为渲染进程添加 Electron API 类型支持。
 * 这个声明告诉 TypeScript 编译器 window.electronAPI 的存在和类型。
 */
declare global {
  /**
   * 扩展 Window 接口
   *
   * 向标准的 DOM Window 接口添加 electronAPI 属性。
   * 这个属性由 Electron 的预加载脚本注入，提供主进程和渲染进程之间的安全通信桥梁。
   *
   * @interface Window
   * @extends Window (DOM 标准接口)
   */
  interface Window {
    /**
     * Electron API 接口实例
     *
     * 由 Electron 预加载脚本通过 contextBridge.exposeInMainWorld 注入。
     * 提供渲染进程访问主进程功能的安全接口。
     *
     * @type {ElectronAPI} 完整的 Electron API 类型定义
     *
     * @security
     * - 通过 Electron 的上下文隔离机制保证安全性
     * - 只暴露预定义的安全方法，不直接暴露 Node.js API
     * - 所有调用都通过 IPC 机制进行，确保进程间安全通信
     *
     * @example 基本用法
     * ```typescript
     * // 设备管理
     * const devices = await window.electronAPI.getAllDevices();
     * await window.electronAPI.reboot('recovery', 'device001');
     *
     * // 文件操作
     * const result = await window.electronAPI.selectFile(['zip']);
     *
     * // 系统信息
     * const status = await window.electronAPI.getStatus('device001');
     * ```
     *
     * @see {@link ../Electron/preload.ts} 查看完整的 API 定义
     * @see {@link ../Electron/ipcHandlers.ts} 查看 API 的具体实现
     */
    electronAPI: ElectronAPI;
  }
}

/**
 * 导出空对象以确保此文件被视为模块
 *
 * TypeScript 要求模块文件必须有 import 或 export 语句。
 * 这个空导出确保文件被正确识别为模块，使全局声明生效。
 *
 * @export {} 空导出，仅用于模块声明
 */
export {};
