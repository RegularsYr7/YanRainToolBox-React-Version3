/**
 * 工具信息管理组件
 * 
 * 用于管理和显示系统工具信息，包括工具路径检测、平台信息等。
 * 
 * @component ToolsInfoManager
 * @description 工具信息管理 - 多平台工具路径检测和管理
 * @author YanRain ToolBox Team
 * 
 * @features
 * - 多平台工具路径检测
 * - 工具可用性检查
 * - 平台信息显示
 * - 工具路径管理
 */

import React, { useState, useEffect } from 'react';
import {
    WrenchScrewdriverIcon,
    ArrowPathIcon,
    CheckCircleIcon,
    ExclamationCircleIcon
} from '@heroicons/react/24/outline';

interface ToolsInfo {
    platform: string;
    adbPath: string;
    fastbootPath: string;
    magiskbootPath: string;
    toolsExist: Record<string, boolean>;
}

interface ErrorInfo {
    error: string;
}

/**
 * 工具信息管理组件
 */
const ToolsInfoManager: React.FC = () => {
    const [toolsInfo, setToolsInfo] = useState<ToolsInfo | ErrorInfo | null>(null);
    const [loading, setLoading] = useState(true);

    /**
     * 测试平台工具
     */
    const testPlatformTools = async () => {
        setLoading(true);
        try {
            if (window.electronAPI) {
                // 测试工具路径获取
                const platform = await window.electronAPI.tools.getPlatform();
                const adbPath = await window.electronAPI.tools.getAdbPath();
                const fastbootPath = await window.electronAPI.tools.getFastbootPath();
                const magiskbootPath = await window.electronAPI.tools.getMagiskBootPath();
                const toolsExist = await window.electronAPI.tools.checkToolsExist();

                setToolsInfo({
                    platform,
                    adbPath,
                    fastbootPath,
                    magiskbootPath,
                    toolsExist,
                });
            }
        } catch (error) {
            console.error('平台工具测试失败:', error);
            setToolsInfo({ error: (error as Error).message });
        } finally {
            setLoading(false);
        }
    };

    // 组件挂载时测试工具
    useEffect(() => {
        testPlatformTools();
    }, []);

    if (loading) {
        return (
            <div className="bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-xl shadow-sm overflow-hidden transition-colors duration-200">
                <div className="flex items-center justify-center py-12">
                    <div className="flex items-center space-x-2 text-blue-600 dark:text-blue-400">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 dark:border-blue-400"></div>
                        <span className="text-lg font-medium">检测平台工具...</span>
                    </div>
                </div>
            </div>
        );
    }

    if (toolsInfo && 'error' in toolsInfo) {
        return (
            <div className="bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-xl shadow-sm overflow-hidden transition-colors duration-200">
                <div className="bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 px-6 py-4 border-b border-gray-200 dark:border-dark-border transition-colors duration-200">
                    <div className="flex items-center space-x-2">
                        <ExclamationCircleIcon className="w-6 h-6 text-red-600 dark:text-red-400" />
                        <h3 className="text-xl font-bold text-gray-800 dark:text-dark-text-primary transition-colors duration-200">工具检测错误</h3>
                    </div>
                </div>
                <div className="p-6">
                    <p className="text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/20 rounded p-3 font-mono text-sm transition-colors duration-200">
                        {toolsInfo.error}
                    </p>
                </div>
            </div>
        );
    }

    const info = toolsInfo as ToolsInfo;

    return (
        <div className="bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-xl shadow-sm overflow-hidden transition-colors duration-200">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 px-6 py-4 border-b border-gray-200 dark:border-dark-border transition-colors duration-200">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <WrenchScrewdriverIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                        <h3 className="text-xl font-bold text-gray-800 dark:text-dark-text-primary transition-colors duration-200">多平台工具路径检测</h3>
                    </div>
                    <button
                        onClick={testPlatformTools}
                        disabled={loading}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-white dark:bg-dark-bg-tertiary border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50"
                    >
                        <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        <span className="text-sm font-medium">刷新</span>
                    </button>
                </div>
            </div>

            <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* 平台信息 */}
                    <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 transition-colors duration-200">
                        <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">当前平台</div>
                        <div className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary transition-colors duration-200">{info?.platform}</div>
                    </div>

                    {/* 工具状态 */}
                    <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 transition-colors duration-200">
                        <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">工具状态</div>
                        <div className="flex items-center space-x-2">
                            {info?.toolsExist ? (
                                <>
                                    <CheckCircleIcon className="w-5 h-5 text-green-500 dark:text-green-400" />
                                    <span className="text-green-700 dark:text-green-400 font-semibold transition-colors duration-200">可用</span>
                                </>
                            ) : (
                                <>
                                    <ExclamationCircleIcon className="w-5 h-5 text-red-500 dark:text-red-400" />
                                    <span className="text-red-700 dark:text-red-400 font-semibold transition-colors duration-200">不可用</span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* ADB路径 */}
                    <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 col-span-1 md:col-span-2 lg:col-span-1 transition-colors duration-200">
                        <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">ADB路径</div>
                        <div className="text-sm text-gray-700 dark:text-gray-300 font-mono bg-white dark:bg-gray-800 rounded px-2 py-1 border dark:border-gray-600 truncate transition-colors duration-200" title={info?.adbPath}>
                            {info?.adbPath}
                        </div>
                    </div>

                    {/* Fastboot路径 */}
                    <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 transition-colors duration-200">
                        <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Fastboot路径</div>
                        <div className="text-sm text-gray-700 dark:text-gray-300 font-mono bg-white dark:bg-gray-800 rounded px-2 py-1 border dark:border-gray-600 truncate transition-colors duration-200" title={info?.fastbootPath}>
                            {info?.fastbootPath}
                        </div>
                    </div>

                    {/* MagiskBoot路径 */}
                    <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 transition-colors duration-200">
                        <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">MagiskBoot路径</div>
                        <div className="text-sm text-gray-700 dark:text-gray-300 font-mono bg-white dark:bg-gray-800 rounded px-2 py-1 border dark:border-gray-600 truncate transition-colors duration-200" title={info?.magiskbootPath}>
                            {info?.magiskbootPath}
                        </div>
                    </div>
                </div>

                {/* 工具说明 */}
                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700 transition-colors duration-200">
                    <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2 transition-colors duration-200">工具说明</h4>
                    <div className="space-y-1 text-sm text-blue-700 dark:text-blue-300 transition-colors duration-200">
                        <div><strong>ADB:</strong> Android Debug Bridge，用于与Android设备通信</div>
                        <div><strong>Fastboot:</strong> 刷机工具，用于在Fastboot模式下操作设备</div>
                        <div><strong>MagiskBoot:</strong> Magisk Boot镜像修补工具，用于获取Root权限</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ToolsInfoManager;
