/**
 * 设备上下文管理
 * 
 * 提供全局的设备列表和当前选中设备的状态管理
 * 支持自动监听设备插拔事件并实时更新设备列表
 * 
 * @context DeviceContext
 * @description 全局设备状态管理 - 跨页面设备选择和自动监听
 * @author YanRain ToolBox Team
 */

import React, { createContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { DeviceInfo } from '../types/electron-types';

interface DeviceContextType {
    devices: DeviceInfo[];
    selectedDevice: DeviceInfo | null;
    selectedDeviceIndex: number;
    isLoading: boolean;
    error: string | null;
    isWatching: boolean;
    refreshDevices: () => Promise<void>;
    selectDevice: (device: DeviceInfo, index: number) => void;
    selectDeviceByIndex: (index: number) => void;
    selectDeviceBySerial: (serialNumber: string) => void;
    startDeviceWatching: () => Promise<void>;
    stopDeviceWatching: () => Promise<void>;
}

const DeviceContext = createContext<DeviceContextType | undefined>(undefined);

interface DeviceProviderProps {
    children: ReactNode;
}

export const DeviceProvider: React.FC<DeviceProviderProps> = ({ children }) => {
    const [devices, setDevices] = useState<DeviceInfo[]>([]);
    const [selectedDeviceIndex, setSelectedDeviceIndex] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isWatching, setIsWatching] = useState(false);

    // 获取当前选中的设备
    const selectedDevice = devices.length > 0 ? devices[selectedDeviceIndex] || null : null;

    /**
     * 刷新设备列表
     */
    const refreshDevices = useCallback(async () => {
        if (!window.electronAPI) {
            setError('Electron API 不可用');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // 检查设备连接
            const isConnected = await window.electronAPI.device.checkConnection();
            if (!isConnected) {
                setDevices([]);
                setSelectedDeviceIndex(0);
                setError('未检测到连接的设备');
                return;
            }

            // 获取所有设备信息
            const allDevices = await window.electronAPI.device.getAllDevices();

            // 确保allDevices是数组
            if (!Array.isArray(allDevices)) {
                console.error('getAllDevices返回的不是数组:', allDevices);
                setDevices([]);
                setSelectedDeviceIndex(0);
                setError('获取设备信息格式错误');
                return;
            }

            if (allDevices.length === 0) {
                setDevices([]);
                setSelectedDeviceIndex(0);
                setError('未获取到有效的设备信息');
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

            // 如果当前选择的设备索引超出范围，重置为0
            setSelectedDeviceIndex(prev => prev >= enhancedDevices.length ? 0 : prev);

            console.log('设备列表更新成功:', enhancedDevices);
        } catch (error) {
            console.error('刷新设备列表失败:', error);
            setError(`刷新设备列表失败: ${error}`);
            setDevices([]);
            setSelectedDeviceIndex(0);
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * 选择设备
     */
    const selectDevice = (device: DeviceInfo, index: number) => {
        if (index >= 0 && index < devices.length) {
            setSelectedDeviceIndex(index);
            console.log('选择设备:', device.brand, device.model, '(', device.serialNumber, ')');
        }
    };

    /**
     * 通过索引选择设备
     */
    const selectDeviceByIndex = (index: number) => {
        if (index >= 0 && index < devices.length) {
            setSelectedDeviceIndex(index);
            const device = devices[index];
            console.log('选择设备:', device.brand, device.model, '(', device.serialNumber, ')');
        }
    };

    /**
     * 通过序列号选择设备
     */
    const selectDeviceBySerial = (serialNumber: string) => {
        const index = devices.findIndex(device => device.serialNumber === serialNumber);
        if (index !== -1) {
            setSelectedDeviceIndex(index);
            const device = devices[index];
            console.log('选择设备:', device.brand, device.model, '(', device.serialNumber, ')');
        }
    };

    /**
     * 启动设备监听
     */
    const startDeviceWatching = useCallback(async () => {
        if (!window.electronAPI) {
            console.error('Electron API 不可用');
            return;
        }

        try {
            console.log('正在启动设备监听...');
            const result = await window.electronAPI.device.startWatching();

            if (result.success) {
                setIsWatching(true);
                console.log('设备监听启动成功:', result.message);
            } else {
                console.error('设备监听启动失败:', result.message);
            }
        } catch (error) {
            console.error('启动设备监听时发生错误:', error);
        }
    }, []);

    /**
     * 停止设备监听
     */
    const stopDeviceWatching = useCallback(async () => {
        if (!window.electronAPI) {
            console.error('Electron API 不可用');
            return;
        }

        try {
            console.log('正在停止设备监听...');
            const result = await window.electronAPI.device.stopWatching();

            if (result.success) {
                setIsWatching(false);
                console.log('设备监听已停止:', result.message);
            } else {
                console.error('停止设备监听失败:', result.message);
            }
        } catch (error) {
            console.error('停止设备监听时发生错误:', error);
        }
    }, []);

    // 设置设备变化事件监听器
    useEffect(() => {
        if (!window.electronAPI || !window.electronAPI.ipc) {
            return;
        }

        let refreshTimeout: NodeJS.Timeout | null = null;
        let lastEventTime = 0;
        let lastEventType: string | null = null;
        const DEBOUNCE_DELAY = 500; // 500ms防抖，更快响应
        const MIN_EVENT_INTERVAL = 200; // 200ms最小事件间隔，避免过于频繁
        const RECONNECT_WINDOW = 2000; // 2秒内的断开+连接视为重连

        const debouncedRefresh = (eventType: string) => {
            const now = Date.now();

            // 对于连接事件，使用更长的延迟让ADB服务完全启动
            const dynamicDelay = eventType === 'connected' ? 3000 : DEBOUNCE_DELAY;

            // 检测重连模式：短时间内的断开+连接
            if (lastEventType === 'disconnected' && eventType === 'connected' &&
                now - lastEventTime < RECONNECT_WINDOW) {
                console.log('🔄 [DeviceContext] 检测到设备重连，快速刷新');
                lastEventType = eventType;
                lastEventTime = now;
                // 对于重连，使用更短的延迟
                if (refreshTimeout) {
                    clearTimeout(refreshTimeout);
                }
                refreshTimeout = setTimeout(() => {
                    console.log('🔄 [DeviceContext] 执行重连后快速刷新...');
                    refreshDevices();
                    lastEventTime = Date.now();
                    refreshTimeout = null;
                }, 1000); // 重连时等待1秒，确保设备稳定
                return;
            }

            // 防止过于频繁的刷新
            if (now - lastEventTime < MIN_EVENT_INTERVAL && lastEventType === eventType) {
                return;
            }

            lastEventType = eventType;

            if (refreshTimeout) {
                clearTimeout(refreshTimeout);
            }

            refreshTimeout = setTimeout(() => {
                const action = lastEventType === 'disconnected' ? '设备断开' :
                    lastEventType === 'connected' ? '设备连接' : '设备变化';
                console.log(`🔄 [DeviceContext] 执行防抖设备列表刷新 (${action})...`);
                refreshDevices();
                lastEventTime = Date.now();
                refreshTimeout = null;
            }, dynamicDelay);
        };

        type DeviceChangedPayload = { type?: string } & Record<string, unknown>;
        const handleDeviceChange = (...args: unknown[]) => {
            // IPC事件格式：第一个有效负载通常在 args[0]
            const deviceEvent = args[0] as DeviceChangedPayload | undefined;
            console.log('📱 [DeviceContext] 收到设备变化事件:', deviceEvent);
            const eventType = typeof deviceEvent?.type === 'string' ? deviceEvent.type : 'unknown';
            console.log('📱 [DeviceContext] 事件类型:', eventType);
            console.log('📱 [DeviceContext] 完整参数:', { args });

            if (eventType !== 'unknown') {
                console.log('📱 [DeviceContext] 处理有效设备事件:', eventType);
                debouncedRefresh(eventType);
            } else {
                console.warn('📱 [DeviceContext] 收到无效的设备事件:', deviceEvent);
                debouncedRefresh('unknown');
            }
        };

        // 注册IPC事件监听器 - 只监听统一的设备变化事件
        window.electronAPI.ipc.on('device:change', handleDeviceChange);

        // 清理函数
        return () => {
            if (refreshTimeout) {
                clearTimeout(refreshTimeout);
            }
            window.electronAPI.ipc.removeListener('device:change', handleDeviceChange);
        };
    }, [refreshDevices]);

    // 组件挂载时获取设备列表并启动监听
    useEffect(() => {
        const initializeDeviceContext = async () => {
            // 首先刷新设备列表
            await refreshDevices();

            // 自动启动设备监听（适用于所有平台）
            try {
                console.log('🚀 [DeviceContext] 自动启动设备监听...');
                await startDeviceWatching();
            } catch (error) {
                console.warn('⚠️ [DeviceContext] 自动启动设备监听失败:', error);
            }
        };

        initializeDeviceContext();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // 只在组件挂载时执行一次

    const contextValue: DeviceContextType = {
        devices,
        selectedDevice,
        selectedDeviceIndex,
        isLoading,
        error,
        isWatching,
        refreshDevices,
        selectDevice,
        selectDeviceByIndex,
        selectDeviceBySerial,
        startDeviceWatching,
        stopDeviceWatching,
    };

    return (
        <DeviceContext.Provider value={contextValue}>
            {children}
        </DeviceContext.Provider>
    );
};

export default DeviceContext;
