/**
 * 主页组件
 * 
 * 应用的主页和概览页面，展示设备状态、快速操作和系统信息。
 * 
 * @component HomePage
 * @description 应用主页 - 设备概览和快速操作入口
 * @author YanRain ToolBox Team
 */

import React from 'react';
import DeviceManager from '../components/Device/DeviceManager';
import DeviceSelector from '../components/Device/DeviceSelector';
import { useDevice } from '../hooks/useDevice';
import {
    CubeIcon,
    ArchiveBoxIcon,
    WrenchScrewdriverIcon,
    CommandLineIcon,
    CheckCircleIcon,
    XCircleIcon,
    SignalIcon
} from '@heroicons/react/24/outline';

/**
 * 主页组件属性接口
 */
interface HomePageProps {
    /** 页面切换回调函数 */
    onPageChange?: (pageId: string) => void;
}

/**
 * 主页组件
 * 
 * @returns React 组件
 */
const HomePage: React.FC<HomePageProps> = ({ onPageChange }) => {
    // 使用全局设备上下文
    const {
        selectedDevice
    } = useDevice();


    return (
        <div className="h-full bg-gray-50 dark:bg-dark-bg-primary overflow-auto transition-colors duration-200">

            {/* 主内容区域 */}
            <div className="p-2 space-y-6 min-h-full">


                {/* 设备信息面板 - 独占一行作为主体展示 */}
                <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border overflow-hidden transition-colors duration-200">
                    <div className="px-6 py-4 border-b border-gray-100 dark:border-dark-border">
                        <h2 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary transition-colors duration-200">设备信息</h2>
                        <p className="text-sm text-gray-500 dark:text-dark-text-secondary transition-colors duration-200">当前连接设备的详细信息和状态</p>
                    </div>
                    <div className="p-6">
                        <DeviceManager selectedDevice={selectedDevice} />
                    </div>
                </div>

                {/* 控制面板 - 三个卡片一行显示 */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 auto-rows-fr">

                    {/* 系统状态卡片 */}
                    <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6 transition-colors duration-200">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-4 transition-colors duration-200">系统状态</h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <SignalIcon className="w-4 h-4 text-gray-400" />
                                    <span className="text-sm text-gray-500">设备连接</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    {selectedDevice ? (
                                        <CheckCircleIcon className="w-4 h-4 text-green-500" />
                                    ) : (
                                        <XCircleIcon className="w-4 h-4 text-gray-400" />
                                    )}
                                    <span className={`text-sm font-medium ${selectedDevice ? 'text-green-600' : 'text-gray-400'}`}>
                                        {selectedDevice ? '已连接' : '未连接'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <WrenchScrewdriverIcon className="w-4 h-4 text-gray-400" />
                                    <span className="text-sm text-gray-500">Root 状态</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    {selectedDevice?.isRooted ? (
                                        <CheckCircleIcon className="w-4 h-4 text-green-500" />
                                    ) : (
                                        <XCircleIcon className="w-4 h-4 text-gray-400" />
                                    )}
                                    <span className={`text-sm font-medium ${selectedDevice?.isRooted ? 'text-green-600' : 'text-gray-400'}`}>
                                        {selectedDevice?.isRooted ? '已获取' : '未获取'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <CommandLineIcon className="w-4 h-4 text-gray-400" />
                                    <span className="text-sm text-gray-500">ADB 调试</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <CheckCircleIcon className="w-4 h-4 text-green-500" />
                                    <span className="text-sm font-medium text-green-600">已启用</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 快速操作卡片 */}
                    <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6 transition-colors duration-200">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-4 transition-colors duration-200">快速操作</h3>
                        <div className="space-y-3">
                            <button
                                onClick={() => onPageChange?.('app-manager')}
                                className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors duration-200"
                            >
                                <CubeIcon className="w-5 h-5" />
                                <span className="text-sm font-medium">应用管理</span>
                            </button>
                            <button
                                onClick={() => onPageChange?.('backup')}
                                className="w-full flex items-center gap-3 px-4 py-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors duration-200"
                            >
                                <ArchiveBoxIcon className="w-5 h-5" />
                                <span className="text-sm font-medium">镜像备份</span>
                            </button>
                            <button
                                onClick={() => onPageChange?.('boot-patch')}
                                className="w-full flex items-center gap-3 px-4 py-3 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors duration-200"
                            >
                                <WrenchScrewdriverIcon className="w-5 h-5" />
                                <span className="text-sm font-medium">Boot 修补</span>
                            </button>
                            <button
                                onClick={() => onPageChange?.('shell')}
                                className="w-full flex items-center gap-3 px-4 py-3 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors duration-200"
                            >
                                <CommandLineIcon className="w-5 h-5" />
                                <span className="text-sm font-medium">命令行工具</span>
                            </button>
                        </div>
                    </div>

                    {/* 设备连接卡片 */}
                    <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border overflow-hidden transition-colors duration-200">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-dark-border">
                            <h2 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary transition-colors duration-200">设备连接</h2>
                            <p className="text-sm text-gray-500 dark:text-dark-text-secondary transition-colors duration-200">管理和监控已连接的Android设备</p>
                        </div>
                        <div className="p-6">
                            <DeviceSelector />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HomePage;
