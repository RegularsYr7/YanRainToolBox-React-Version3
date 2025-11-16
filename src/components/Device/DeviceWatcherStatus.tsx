/**
 * 设备监听状态组件
 * 
 * 显示设备监听的状态和控制按钮，用于测试和调试设备监听功能
 * 
 * @component DeviceWatcherStatus
 * @description 设备监听状态显示和控制组件
 * @author YanRain ToolBox Team
 */

import React, { useState, useEffect } from 'react';
import {
    EyeIcon,
    EyeSlashIcon,
    PlayIcon,
    StopIcon,
    CheckCircleIcon,
    ExclamationCircleIcon
} from '@heroicons/react/24/outline';

/**
 * 设备监听状态组件
 */
const DeviceWatcherStatus: React.FC = () => {
    const [isWatching, setIsWatching] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [lastUpdate, setLastUpdate] = useState<string>('未启动');
    const [platform, setPlatform] = useState<string>('');

    /**
     * 获取平台信息
     */
    const getPlatformInfo = async () => {
        if (!window.electronAPI?.tools?.getPlatform) {
            return;
        }

        try {
            const platformInfo = await window.electronAPI.tools.getPlatform();
            setPlatform(platformInfo);
        } catch (error) {
            console.error('获取平台信息失败:', error);
        }
    };

    /**
     * 检查监听状态
     */
    const checkWatchingStatus = async () => {
        if (!window.electronAPI) {
            return;
        }

        try {
            const result = await window.electronAPI.device.getWatchingStatus();
            if (result.success) {
                setIsWatching(result.isWatching);
                setLastUpdate(result.isWatching ? '运行中' : '已停止');
            }
        } catch (error) {
            console.error('检查监听状态失败:', error);
            setLastUpdate('检查失败');
        }
    };

    /**
     * 启动设备监听
     */
    const startWatching = async () => {
        if (!window.electronAPI) {
            return;
        }

        setIsLoading(true);
        try {
            const result = await window.electronAPI.device.startWatching();
            if (result.success) {
                setIsWatching(true);
                setLastUpdate('启动成功');
                console.log('设备监听启动成功:', result.message);
            } else {
                setLastUpdate('启动失败');
                console.error('设备监听启动失败:', result.message);
            }
        } catch (error) {
            console.error('启动监听时发生错误:', error);
            setLastUpdate('启动错误');
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * 停止设备监听
     */
    const stopWatching = async () => {
        if (!window.electronAPI) {
            return;
        }

        setIsLoading(true);
        try {
            const result = await window.electronAPI.device.stopWatching();
            if (result.success) {
                setIsWatching(false);
                setLastUpdate('已停止');
                console.log('设备监听已停止:', result.message);
            } else {
                setLastUpdate('停止失败');
                console.error('停止监听失败:', result.message);
            }
        } catch (error) {
            console.error('停止监听时发生错误:', error);
            setLastUpdate('停止错误');
        } finally {
            setIsLoading(false);
        }
    };

    // 组件挂载时检查状态
    useEffect(() => {
        const initializeComponent = async () => {
            await getPlatformInfo();
            await checkWatchingStatus();
        };

        initializeComponent();
    }, []);

    // 设置设备事件监听器 - 仅用于状态显示，不触发刷新
    useEffect(() => {
        if (!window.electronAPI || !window.electronAPI.ipc) {
            return;
        }

        let statusTimeout: NodeJS.Timeout | null = null;
        const STATUS_DEBOUNCE = 500; // 状态更新防抖

        const updateStatus = (message: string) => {
            if (statusTimeout) {
                clearTimeout(statusTimeout);
            }

            statusTimeout = setTimeout(() => {
                setLastUpdate(message);
                statusTimeout = null;
            }, STATUS_DEBOUNCE);
        };

        const handleDeviceChange = (...args: unknown[]) => {
            const payload = (args[0] ?? {}) as { type?: string; deviceName?: string };
            const action = payload.type === 'connected' ? '连接' : '断开';
            const deviceName = payload.deviceName || '未知设备';
            updateStatus(`设备${action}: ${deviceName} - ${new Date().toLocaleTimeString()}`);
        };

        // 只监听通用的设备变化事件，避免重复
        window.electronAPI.ipc.on('device:change', handleDeviceChange);

        // 清理函数
        return () => {
            if (statusTimeout) {
                clearTimeout(statusTimeout);
            }
            window.electronAPI.ipc.removeListener('device:change', handleDeviceChange);
        };
    }, []);

    return (
        <div className="bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-lg p-4 shadow-sm transition-colors duration-200">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                    {isWatching ? (
                        <EyeIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
                    ) : (
                        <EyeSlashIcon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                    )}
                    <h3 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary transition-colors duration-200">
                        设备监听状态
                    </h3>
                </div>

                <div className="flex items-center space-x-1">
                    {isWatching ? (
                        <CheckCircleIcon className="w-4 h-4 text-green-500 dark:text-green-400" />
                    ) : (
                        <ExclamationCircleIcon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    )}
                    <span className={`text-xs font-medium ${isWatching ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
                        } transition-colors duration-200`}>
                        {isWatching ? '运行中' : '已停止'}
                    </span>
                </div>
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-600 dark:text-dark-text-secondary transition-colors duration-200">
                    <span>最后更新:</span>
                    <span className="font-mono">{lastUpdate}</span>
                </div>

                <div className="flex space-x-2">
                    {!isWatching ? (
                        <button
                            onClick={startWatching}
                            disabled={isLoading}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-green-600 dark:bg-green-700 text-white text-xs font-medium rounded-lg hover:bg-green-700 dark:hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <PlayIcon className="w-3 h-3" />
                            <span>{isLoading ? '启动中...' : '启动监听'}</span>
                        </button>
                    ) : (
                        <button
                            onClick={stopWatching}
                            disabled={isLoading}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-red-600 dark:bg-red-700 text-white text-xs font-medium rounded-lg hover:bg-red-700 dark:hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <StopIcon className="w-3 h-3" />
                            <span>{isLoading ? '停止中...' : '停止监听'}</span>
                        </button>
                    )}

                    <button
                        onClick={checkWatchingStatus}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                        <span>刷新状态</span>
                    </button>
                </div>
            </div>

            {platform && platform !== 'win32' && (
                <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded text-xs text-yellow-800 dark:text-yellow-300 transition-colors duration-200">
                    ⚠️ 设备监听功能仅在Windows系统上可用 (当前: {platform})
                </div>
            )}
        </div>
    );
};

export default DeviceWatcherStatus;
