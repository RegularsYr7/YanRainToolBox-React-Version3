/**
 * 自定义标题栏组件
 *
 * 替代Electron默认标题栏，提供自定义的窗口控制功能。
 * 包含应用标题、窗口控制按钮（最小化、最大化、关闭）等。
 *
 * @component CustomTitleBar
 * @description 自定义标题栏 - Electron窗口控制
 * @author YanRain ToolBox Team
 *
 * @features
 * - 自定义窗口控制按钮
 * - 应用标题显示
 * - 拖拽移动窗口
 * - 最大化/还原状态切换
 * - 平滑动画过渡
 *
 * @usage
 * ```tsx
 * import CustomTitleBar from './components/TitleBar/CustomTitleBar';
 *
 * function App() {
 *   return (
 *     <div className="app">
 *       <CustomTitleBar />
 *       {/* 其他内容 *\/}
 *     </div>
 *   );
 * }
 * ```
 */

import React from 'react';
import { MinusIcon, SquaresPlusIcon, XMarkIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';

/**
 * 自定义标题栏组件属性接口
 */
interface CustomTitleBarProps {
    /** 应用标题 */
    title?: string;
    /** 自定义样式类名 */
    className?: string;
}

/**
 * 自定义标题栏组件
 *
 * @param props - 组件属性
 * @returns React 组件
 */
const CustomTitleBar: React.FC<CustomTitleBarProps> = ({
    title = 'YanRain ToolBox',
    className = ''
}) => {
    /**
     * 处理最小化按钮点击
     */
    const handleMinimize = () => {
        if (window.electronAPI) {
            window.electronAPI.window.minimize();
        }
    };

    /**
     * 处理最大化/还原按钮点击
     */
    const handleMaximize = async () => {
        if (window.electronAPI) {
            // window.electronAPI.window.maximize();
            // // 延迟更新状态，等待窗口状态改变
            // setTimeout(checkMaximizedState, 100);
        }
    };

    /**
     * 处理关闭按钮点击
     */
    const handleClose = () => {
        if (window.electronAPI) {
            window.electronAPI.window.close();
        }
    };


    return (
        <div className={`fixed top-0 left-0 right-0 z-50 h-10 bg-white/95 dark:bg-dark-bg-secondary/95 backdrop-blur-sm border-b border-gray-200/50 dark:border-dark-border/50 flex items-center justify-between select-none transition-colors duration-200 ${className}`}
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
            {/* 左侧：应用图标和标题 */}
            <div className="flex items-center px-4 space-x-2">
                {/* 应用图标 */}
                <div className="flex items-center justify-center w-5 h-5 rounded bg-gradient-to-br from-blue-500 to-purple-600 shadow-sm">
                    <WrenchScrewdriverIcon className="w-3 h-3 text-white" />
                </div>
                {/* 应用标题 */}
                <span className="text-sm font-medium text-gray-700 dark:text-dark-text-primary transition-colors duration-200">
                    {title}
                </span>
            </div>

            {/* 右侧：窗口控制按钮 */}
            <div className="flex items-center"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
                {/* 最小化按钮 */}
                <button
                    onClick={handleMinimize}
                    className="w-12 h-10 flex items-center justify-center text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary hover:bg-gray-100/50 dark:hover:bg-dark-bg-tertiary/50 transition-all duration-200 group"
                    title="最小化"
                    aria-label="最小化窗口"
                >
                    <MinusIcon className="w-4 h-4 group-hover:scale-110 transition-transform duration-200" />
                </button>

                {/* 最大化/还原按钮 */}
                <button
                    onClick={handleMaximize}
                    className="w-12 h-10 flex items-center justify-center text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary hover:bg-gray-100/50 dark:hover:bg-dark-bg-tertiary/50 transition-all duration-200 group"
                >
                    <SquaresPlusIcon className="w-4 h-4 group-hover:scale-110 transition-transform duration-200" />
                </button>

                {/* 关闭按钮 */}
                <button
                    onClick={handleClose}
                    className="w-12 h-10 flex items-center justify-center text-gray-600 dark:text-dark-text-secondary hover:text-white hover:bg-red-500 dark:hover:bg-red-600 transition-all duration-200 group"
                    title="关闭"
                    aria-label="关闭窗口"
                >
                    <XMarkIcon className="w-4 h-4 group-hover:scale-110 transition-transform duration-200" />
                </button>
            </div>
        </div>
    );
};

export default CustomTitleBar;
