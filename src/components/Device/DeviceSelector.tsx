/**
 * 设备选择器组件
 * 
 * 封装设备选择、刷新、状态显示等功能，供多个页面复用
 * 
 * @component DeviceSelector
 * @description 全局设备选择器 - 支持设备选择、刷新和状态显示
 * @author YanRain ToolBox Team
 */

import React from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useDevice } from '../../hooks/useDevice';

interface DeviceSelectorProps {
    /** 组件标题，传入空字符串或不传入则不显示标题 */
    title?: string;
    /** 是否显示错误信息，默认为true */
    showError?: boolean;
    /** 自定义CSS类名 */
    className?: string;
    /** 是否紧凑模式（减少内边距），默认为false */
    compact?: boolean;
}

/**
 * 设备选择器组件
 * 
 * @param props 组件属性
 * @returns React 组件
 */
const DeviceSelector: React.FC<DeviceSelectorProps> = ({
    title = "",
    showError = true,
    className = "",
    compact = false
}) => {
    // 使用全局设备上下文
    const {
        devices,
        selectedDeviceIndex,
        isLoading: deviceLoading,
        error: deviceError,
        refreshDevices,
        selectDeviceByIndex
    } = useDevice();

    const containerPadding = compact ? "p-3" : "p-4";
    const marginBottom = compact ? "mb-4" : "mb-6";

    return (
        <div className={`bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border transition-colors duration-200 ${containerPadding} ${marginBottom} ${className}`}>
            <div className="space-y-3">
                {/* 标题 - 仅在传入标题时显示 */}
                {title && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary transition-colors duration-200">
                            {title}
                        </label>
                    </div>
                )}

                {/* 设备选择框 */}
                <div>
                    <select
                        value={selectedDeviceIndex ?? -1}
                        onChange={(e) => {
                            const index = parseInt(e.target.value);
                            if (index >= 0) {
                                selectDeviceByIndex(index);
                            }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary transition-colors duration-200"
                        disabled={deviceLoading}
                    >
                        {devices.length === 0 ? (
                            <option value={-1}>
                                {deviceLoading ? "正在检测设备..." : "未检测到设备"}
                            </option>
                        ) : (
                            devices.map((device, index) => (
                                <option key={device.serialNumber} value={index}>
                                    {device.brand} {device.model} ({device.serialNumber})
                                </option>
                            ))
                        )}
                    </select>
                </div>

                {/* 刷新设备按钮 */}
                <div>
                    <button
                        onClick={refreshDevices}
                        disabled={deviceLoading}
                        className="w-full px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors duration-200"
                    >
                        <ArrowPathIcon className={`w-4 h-4 ${deviceLoading ? 'animate-spin' : ''}`} />
                        {deviceLoading ? '刷新中...' : '刷新设备'}
                    </button>
                </div>

                {/* 错误显示 */}
                {showError && deviceError && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded transition-colors duration-200">
                        <div className="text-sm text-red-600 dark:text-red-400 transition-colors duration-200">
                            设备错误：{deviceError}
                        </div>
                    </div>
                )}

                {/* 无设备时的提示 */}
                {!deviceLoading && devices.length === 0 && !deviceError && (
                    <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded transition-colors duration-200">
                        <div className="text-sm text-yellow-700 dark:text-yellow-400 transition-colors duration-200">
                            <span className="font-medium">提示：</span>
                            请确保设备已连接并开启USB调试，然后点击"刷新设备"
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DeviceSelector;