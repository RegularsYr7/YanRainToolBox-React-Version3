/**
 * 工具文件页面组件
 * 
 * 提供系统工具路径管理、多设备信息管理和文件操作功能。
 * 
 * @component ToolsPage
 * @description 工具文件页面 - 系统工具和多设备管理
 * @author YanRain ToolBox Team
 */

import React from 'react';
import ToolsInfoManager from '../components/Tools/ToolsInfoManager';
import MultiDeviceManager from '../components/Device/MultiDeviceManager';
import DeviceWatcherStatus from '../components/Device/DeviceWatcherStatus';
import ThemeSelector from '../components/Theme/ThemeSelector';

/**
 * 工具文件页面组件
 * 
 * @returns React 组件
 */
const ToolsPage: React.FC = () => {
    return (
        <div className="h-full overflow-auto p-6 space-y-6 bg-gray-50 dark:bg-dark-bg-primary transition-colors duration-200">
            {/* 页面标题 */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary mb-2 transition-colors duration-200">
                    工具文件管理
                </h1>
                <p className="text-gray-600 dark:text-dark-text-secondary transition-colors duration-200">
                    系统工具路径管理、多设备信息管理和文件操作工具
                </p>
            </div>

            {/* 主题设置 */}
            <ThemeSelector />

            {/* 工具信息管理 */}
            <ToolsInfoManager />

            {/* 设备监听状态 */}
            <DeviceWatcherStatus />

            {/* 多设备信息管理 */}
            <MultiDeviceManager />
        </div>
    );
};

export default ToolsPage;