/**
 * 多设备信息管理组件
 * 
 * 专门用于工具页面的多设备详细信息管理，包含高级设备信息和批量操作功能。
 * 
 * @component MultiDeviceManager
 * @description 多设备信息管理 - 高级设备管理和批量操作
 * @author YanRain ToolBox Team
 * 
 * @features
 * - 多设备详细信息显示
 * - 设备对比功能
 * - 批量设备操作
 * - 设备状态监控
 * - 设备信息导出
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    DevicePhoneMobileIcon,
    ArrowPathIcon,
    PowerIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
    InformationCircleIcon,
    DocumentTextIcon,
    Cog6ToothIcon
} from '@heroicons/react/24/outline';

interface DeviceInfo {
    model: string;
    brand: string;
    androidVersion: string;
    serialNumber: string;
    isRooted: boolean;
    status: 'normal' | 'fastboot' | 'recovery';
}

interface RebootAction {
    type: 'system' | 'fastboot' | 'recovery' | 'shutdown';
    label: string;
    description: string;
}

/**
 * 多设备信息管理组件
 */
const MultiDeviceManager: React.FC = () => {
    const [devices, setDevices] = useState<DeviceInfo[]>([]);
    const [deviceLoading, setDeviceLoading] = useState(false);
    const [rebootLoading, setRebootLoading] = useState<{ [key: string]: boolean }>({});

    /**
     * 获取连接的设备列表
     */
    const getConnectedDevices = useCallback(async () => {
        if (!window.electronAPI) {
            console.error('Electron API 不可用');
            return;
        }

        setDeviceLoading(true);
        try {
            // 首先检查设备连接
            const isConnected = await window.electronAPI.device.checkConnection();
            if (!isConnected) {
                setDevices([]);
                console.log('没有检测到连接的设备');
                return;
            }

            // 获取所有设备信息
            try {
                const allDevices = await window.electronAPI.device.getAllDevices();
                console.log(`获取到 ${allDevices.length} 个设备`);

                if (allDevices.length === 0) {
                    setDevices([]);
                    console.log('没有获取到有效的设备信息');
                    return;
                }

                // 为每个设备添加状态信息
                const enhancedDevices: DeviceInfo[] = [];
                for (const device of allDevices) {
                    try {
                        const status = await window.electronAPI.device.getStatus(device.serialNumber);
                        enhancedDevices.push({
                            ...device,
                            status: status === 'unknown' ? 'normal' : status
                        });
                    } catch (error) {
                        console.warn(`无法获取设备 ${device.serialNumber} 状态，使用默认值:`, error);
                        enhancedDevices.push({
                            ...device,
                            status: 'normal'
                        });
                    }
                }

                setDevices(enhancedDevices);
                console.log('获取设备信息成功:', enhancedDevices);
            } catch (deviceInfoError) {
                console.error('获取设备详细信息失败:', deviceInfoError);
                setDevices([]);
            }
        } catch (error) {
            console.error('检查设备连接失败:', error);
            setDevices([]);
        } finally {
            setDeviceLoading(false);
        }
    }, []);

    /**
     * 处理设备重启
     */
    const handleReboot = async (serialNumber: string, type: RebootAction['type']) => {
        setRebootLoading(prev => ({ ...prev, [serialNumber]: true }));
        try {
            const result = await window.electronAPI.device.reboot(serialNumber, type);
            if (result.success) {
                console.log(`设备重启成功: ${result.message}`);
                // 重启后延迟刷新设备状态
                setTimeout(() => {
                    getConnectedDevices();
                }, 2000);
            } else {
                console.error(`设备重启失败: ${result.message}`);
            }
        } catch (error) {
            console.error('重启操作失败:', error);
        } finally {
            setRebootLoading(prev => ({ ...prev, [serialNumber]: false }));
        }
    };

    /**
     * 获取重启选项
     */
    const getRebootOptions = (): RebootAction[] => {
        return [
            {
                type: 'system',
                label: '重启到系统',
                description: '正常重启设备到Android系统'
            },
            {
                type: 'fastboot',
                label: '重启到Fastboot',
                description: '重启到Fastboot模式，用于刷机操作'
            },
            {
                type: 'recovery',
                label: '重启到Recovery',
                description: '重启到Recovery模式，用于系统恢复'
            },
            {
                type: 'shutdown',
                label: '关机',
                description: '关闭设备电源'
            }
        ];
    };

    /**
     * 获取设备状态显示
     */
    const getStatusDisplay = (status: string) => {
        switch (status) {
            case 'normal':
                return { text: '正常运行', color: 'text-green-600', bgColor: 'bg-green-50', icon: CheckCircleIcon };
            case 'fastboot':
                return { text: 'Fastboot模式', color: 'text-yellow-600', bgColor: 'bg-yellow-50', icon: ExclamationCircleIcon };
            case 'recovery':
                return { text: 'Recovery模式', color: 'text-blue-600', bgColor: 'bg-blue-50', icon: InformationCircleIcon };
            default:
                return { text: '未知状态', color: 'text-gray-600', bgColor: 'bg-gray-50', icon: ExclamationCircleIcon };
        }
    };

    /**
     * 导出设备信息
     */
    const exportDeviceInfo = () => {
        const deviceData = devices.map(device => ({
            序列号: device.serialNumber,
            品牌: device.brand,
            型号: device.model,
            Android版本: device.androidVersion,
            Root状态: device.isRooted ? '已Root' : '未Root',
            设备状态: getStatusDisplay(device.status).text
        }));

        const jsonString = JSON.stringify(deviceData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `devices_info_${new Date().getTime()}.json`;
        a.click();

        URL.revokeObjectURL(url);
    };

    // 组件挂载时获取设备信息
    useEffect(() => {
        getConnectedDevices();
    }, [getConnectedDevices]);

    return (
        <div className="bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-xl shadow-sm overflow-hidden transition-colors duration-200">
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 px-6 py-4 border-b border-gray-200 dark:border-dark-border transition-colors duration-200">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <Cog6ToothIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                        <h3 className="text-xl font-bold text-gray-800 dark:text-dark-text-primary transition-colors duration-200">多设备信息管理</h3>
                        {devices.length > 0 && (
                            <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 text-xs font-medium px-2 py-1 rounded-full transition-colors duration-200">
                                {devices.length} 个设备
                            </span>
                        )}
                    </div>
                    <div className="flex items-center space-x-2">
                        {devices.length > 0 && (
                            <button
                                onClick={exportDeviceInfo}
                                className="flex items-center space-x-1 px-3 py-1.5 bg-white dark:bg-dark-bg-tertiary border border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors text-sm font-medium"
                            >
                                <DocumentTextIcon className="w-4 h-4" />
                                <span>导出</span>
                            </button>
                        )}
                        <button
                            onClick={getConnectedDevices}
                            disabled={deviceLoading}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-white dark:bg-dark-bg-tertiary border border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors disabled:opacity-50"
                        >
                            <ArrowPathIcon className={`w-4 h-4 ${deviceLoading ? 'animate-spin' : ''}`} />
                            <span className="text-sm font-medium">刷新</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="p-6">
                {deviceLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="flex items-center space-x-2 text-purple-600 dark:text-purple-400">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 dark:border-purple-400"></div>
                            <span className="text-lg font-medium">检测设备中...</span>
                        </div>
                    </div>
                ) : devices.length === 0 ? (
                    <div className="text-center py-12">
                        <DevicePhoneMobileIcon className="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                        <h4 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-2 transition-colors duration-200">未检测到设备</h4>
                        <p className="text-gray-500 dark:text-dark-text-secondary text-sm mb-1 transition-colors duration-200">请确保设备已连接并启用USB调试</p>
                        <p className="text-gray-400 dark:text-dark-text-tertiary text-xs transition-colors duration-200">支持同时管理多个Android设备</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* 设备列表 */}
                        <div className="grid gap-6">
                            {devices.map((device, index) => {
                                const statusDisplay = getStatusDisplay(device.status);
                                const StatusIcon = statusDisplay.icon;
                                const isRebootLoading = rebootLoading[device.serialNumber];

                                return (
                                    <div key={device.serialNumber} className="border border-gray-200 dark:border-dark-border rounded-lg p-6 hover:shadow-md dark:hover:shadow-lg transition-all duration-200 bg-white dark:bg-dark-bg-tertiary">
                                        {/* 设备头部信息 */}
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center space-x-3">
                                                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold">
                                                    {index + 1}
                                                </div>
                                                <div>
                                                    <h4 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary transition-colors duration-200">
                                                        {device.brand} {device.model}
                                                    </h4>
                                                    <p className="text-sm text-gray-500 dark:text-dark-text-secondary font-mono transition-colors duration-200">
                                                        {device.serialNumber}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full ${statusDisplay.bgColor}`}>
                                                <StatusIcon className={`w-4 h-4 ${statusDisplay.color}`} />
                                                <span className={`text-sm font-medium ${statusDisplay.color}`}>
                                                    {statusDisplay.text}
                                                </span>
                                            </div>
                                        </div>

                                        {/* 设备详细信息 */}
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 transition-colors duration-200">
                                                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Android版本</div>
                                                <div className="text-sm font-semibold text-gray-900 dark:text-dark-text-primary transition-colors duration-200">
                                                    {device.androidVersion}
                                                </div>
                                            </div>
                                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 transition-colors duration-200">
                                                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Root状态</div>
                                                <div className="flex items-center space-x-1">
                                                    {device.isRooted ? (
                                                        <>
                                                            <span className="text-green-500 text-xs">✅</span>
                                                            <span className="text-green-700 dark:text-green-400 font-semibold text-sm transition-colors duration-200">已Root</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="text-red-500 text-xs">❌</span>
                                                            <span className="text-red-700 dark:text-red-400 font-semibold text-sm transition-colors duration-200">未Root</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 col-span-2 md:col-span-1 transition-colors duration-200">
                                                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">设备品牌</div>
                                                <div className="text-sm font-semibold text-gray-900 dark:text-dark-text-primary transition-colors duration-200">
                                                    {device.brand}
                                                </div>
                                            </div>
                                        </div>

                                        {/* 设备控制 */}
                                        <div>
                                            <h5 className="text-sm font-semibold text-gray-700 dark:text-dark-text-secondary mb-3 flex items-center space-x-2 transition-colors duration-200">
                                                <PowerIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                                <span>设备控制</span>
                                            </h5>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                                {getRebootOptions().map((option) => (
                                                    <button
                                                        key={option.type}
                                                        onClick={() => handleReboot(device.serialNumber, option.type)}
                                                        disabled={isRebootLoading}
                                                        className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50 text-xs font-medium"
                                                        title={option.description}
                                                    >
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>
                                            {isRebootLoading && (
                                                <div className="mt-2 flex items-center space-x-2 text-blue-600 dark:text-blue-400">
                                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 dark:border-blue-400"></div>
                                                    <span className="text-xs">操作进行中...</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* 批量操作 */}
                        {devices.length > 1 && (
                            <div className="border-t border-gray-200 pt-6">
                                <h4 className="text-lg font-semibold text-gray-800 mb-3">批量操作</h4>
                                <div className="flex flex-wrap gap-2">
                                    <button className="px-4 py-2 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg hover:bg-yellow-100 transition-colors text-sm font-medium">
                                        批量重启到系统
                                    </button>
                                    <button className="px-4 py-2 bg-orange-50 border border-orange-200 text-orange-700 rounded-lg hover:bg-orange-100 transition-colors text-sm font-medium">
                                        批量重启到Fastboot
                                    </button>
                                    <button className="px-4 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium">
                                        批量关机
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                    批量操作将同时应用到所有连接的设备，请谨慎使用
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MultiDeviceManager;
