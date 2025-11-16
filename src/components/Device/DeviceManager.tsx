/**
 * 设备管理组件 - 新版本使用全局设备状态
 * 
 * 专门用于主页的设备管理功能，包含设备信息显示、设备控制等。
 * 
 * @component D    // 如果没有选择设备，显示提示
    if (!selectedDevice) {
        return (
            <div className="bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-xl shadow-sm overflow-hidden transition-colors duration-200">
                <div className="p-8 text-center">
                    <DevicePhoneMobileIcon className="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-2 transition-colors duration-200">
                        未选择设备
                    </h3>
                    <p className="text-gray-600 dark:text-dark-text-secondary transition-colors duration-200">
                        请在上方选择一个已连接的设备以查看详细信息
                    </p>
                </div>
            </div>
        );
    } @description 设备管理 - Android设备信息显示和控制
 * @author YanRain ToolBox Team
 */

import React, { useState } from 'react';
import {
    DevicePhoneMobileIcon,
    PowerIcon,
    CheckCircleIcon,
    ShieldCheckIcon,
    Battery50Icon,
    CpuChipIcon
} from '@heroicons/react/24/outline';
import type { DeviceInfo } from '../../types/electron-types';

interface RebootAction {
    type: 'system' | 'fastboot' | 'recovery' | 'shutdown';
    label: string;
    color: string;
}

interface DeviceManagerProps {
    selectedDevice: DeviceInfo | null;
}

/**
 * 设备管理组件
 */
const DeviceManager: React.FC<DeviceManagerProps> = ({ selectedDevice }) => {
    const [rebootLoading, setRebootLoading] = useState(false);

    /**
     * 处理设备重启操作
     */
    const handleReboot = async (type: RebootAction['type']) => {
        if (!selectedDevice) {
            console.warn('没有选择设备');
            return;
        }

        if (!window.electronAPI) {
            console.error('Electron API 不可用');
            return;
        }

        setRebootLoading(true);
        try {
            console.log(`重启设备 ${selectedDevice.serialNumber} 到 ${type} 模式`);
            const result = await window.electronAPI.device.reboot(selectedDevice.serialNumber, type);

            if (result.success) {
                console.log('重启命令执行成功:', result.message);
                // 可以在这里添加成功提示
            } else {
                console.error('重启失败:', result.message);
                // 可以在这里添加错误提示
            }
        } catch (error) {
            console.error('重启设备失败:', error);
        } finally {
            setRebootLoading(false);
        }
    };

    /**
     * 获取重启选项
     */
    const getRebootOptions = (): RebootAction[] => [
        { type: 'system', label: '重启到系统', color: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' },
        { type: 'fastboot', label: '重启到Fastboot', color: 'bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100' },
        { type: 'recovery', label: '重启到Recovery', color: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' },
        { type: 'shutdown', label: '关机', color: 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100' }
    ];

    /**
     * 获取设备状态显示
     */
    const getStatusDisplay = (isRooted: boolean) => {
        return isRooted
            ? { text: '已Root', color: 'text-orange-600', icon: ShieldCheckIcon }
            : { text: '未Root', color: 'text-green-600', icon: CheckCircleIcon };
    };

    // 如果没有选择设备，显示提示
    if (!selectedDevice) {
        return (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="p-8 text-center">
                    <DevicePhoneMobileIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                        请选择设备
                    </h3>
                    <p className="text-gray-500">
                        请在设备选择器中选择一个设备以查看详细信息
                    </p>
                </div>
            </div>
        );
    }

    const statusDisplay = getStatusDisplay(selectedDevice.isRooted);
    const StatusIcon = statusDisplay.icon;

    return (
        <div className="bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-xl shadow-sm overflow-hidden transition-colors duration-200">
            {/* 设备头部信息 */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 px-6 py-4 border-b border-gray-200 dark:border-dark-border transition-colors duration-200">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <DevicePhoneMobileIcon className="w-8 h-8 text-green-600 dark:text-green-400" />
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary transition-colors duration-200">
                                {selectedDevice.brand} {selectedDevice.model}
                            </h2>
                            <div className="flex items-center space-x-4 mt-1">
                                <span className="text-sm text-gray-600 dark:text-dark-text-secondary transition-colors duration-200">
                                    Android {selectedDevice.androidVersion}
                                </span>
                                <div className="flex items-center space-x-1">
                                    <StatusIcon className={`w-4 h-4 ${statusDisplay.color}`} />
                                    <span className={`text-sm font-medium ${statusDisplay.color}`}>
                                        {statusDisplay.text}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 设备详细信息 */}
            <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {/* 序列号 */}
                    <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 transition-colors duration-200">
                        <div className="flex items-center space-x-2 mb-2">
                            <DevicePhoneMobileIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                            <span className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary transition-colors duration-200">序列号</span>
                        </div>
                        <span className="text-sm text-gray-900 dark:text-dark-text-primary font-mono transition-colors duration-200">
                            {selectedDevice.serialNumber}
                        </span>
                    </div>

                    {/* Root状态 */}
                    <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 transition-colors duration-200">
                        <div className="flex items-center space-x-2 mb-2">
                            <ShieldCheckIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                            <span className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary transition-colors duration-200">Root状态</span>
                        </div>
                        <div className="flex items-center space-x-1">
                            <StatusIcon className={`w-4 h-4 ${statusDisplay.color}`} />
                            <span className={`text-sm font-medium ${statusDisplay.color}`}>
                                {statusDisplay.text}
                            </span>
                        </div>
                    </div>

                    {/* Bootloader状态 */}
                    <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 transition-colors duration-200">
                        <div className="flex items-center space-x-2 mb-2">
                            <CpuChipIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                            <span className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary transition-colors duration-200">Bootloader</span>
                        </div>
                        <span className={`text-sm font-medium ${selectedDevice.isBootloaderUnlocked
                            ? 'text-orange-600 dark:text-orange-400'
                            : 'text-green-600 dark:text-green-400'
                            } transition-colors duration-200`}>
                            {selectedDevice.isBootloaderUnlocked ? '已解锁' : '已锁定'}
                        </span>
                    </div>

                    {/* 电池电量 */}
                    <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 transition-colors duration-200">
                        <div className="flex items-center space-x-2 mb-2">
                            <Battery50Icon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                            <span className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary transition-colors duration-200">电池电量</span>
                        </div>
                        <span className="text-sm text-gray-900 dark:text-dark-text-primary font-medium transition-colors duration-200">
                            {selectedDevice.batteryLevel}%
                        </span>
                    </div>
                </div>

                {/* 重启控制区域 */}
                <div className="border-t border-gray-200 dark:border-dark-border pt-6 transition-colors duration-200">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-4 flex items-center transition-colors duration-200">
                        <PowerIcon className="w-5 h-5 mr-2" />
                        设备控制
                    </h3>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {getRebootOptions().map((option) => (
                            <button
                                key={option.type}
                                onClick={() => handleReboot(option.type)}
                                disabled={rebootLoading}
                                className={`
                                    ${option.color}
                                    dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-600
                                    px-4 py-3 border rounded-lg transition-colors duration-200
                                    disabled:opacity-50 disabled:cursor-not-allowed
                                    font-medium text-sm text-center
                                `}
                            >
                                {rebootLoading ? '执行中...' : option.label}
                            </button>
                        ))}
                    </div>

                    {rebootLoading && (
                        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg transition-colors duration-200">
                            <div className="flex items-center">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 dark:border-blue-400 mr-3"></div>
                                <span className="text-sm text-blue-800 dark:text-blue-300 transition-colors duration-200">正在执行重启操作...</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DeviceManager;
