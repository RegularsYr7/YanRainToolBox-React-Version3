/**
 * 主题选择器组件
 * 
 * 提供深色模式、浅色模式和跟随系统的主题切换功能。
 * 
 * @component ThemeSelector
 * @description 主题选择器 - 支持白天、深夜、跟随系统三种模式
 * @author YanRain ToolBox Team
 */

import React from 'react';
import { useTheme } from '../../Context/ThemeContext';
import type { ThemeMode } from '../../Context/ThemeContext';
import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline';

/**
 * 主题选择器组件属性接口
 */
interface ThemeSelectorProps {
    /** 自定义类名 */
    className?: string;
}

/**
 * 主题选择器组件
 * 
 * @param props - 组件属性
 * @returns React 组件
 */
const ThemeSelector: React.FC<ThemeSelectorProps> = ({ className = '' }) => {
    const { theme, setTheme, resolvedTheme, isSystemTheme } = useTheme();

    // 调试主题状态（生产环境中可移除）
    // console.log('ThemeSelector debug:', { theme, resolvedTheme, isSystemTheme, documentClasses: document.documentElement.classList.toString() });

    // 主题选项配置
    const themeOptions: Array<{
        mode: ThemeMode;
        label: string;
        icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
        description: string;
    }> = [
            {
                mode: 'light',
                label: '白天模式',
                icon: SunIcon,
                description: '始终使用浅色主题'
            },
            {
                mode: 'dark',
                label: '深夜模式',
                icon: MoonIcon,
                description: '始终使用深色主题'
            },
            {
                mode: 'system',
                label: '跟随系统',
                icon: ComputerDesktopIcon,
                description: '根据系统设置自动切换'
            }
        ];

    /**
     * 处理主题切换
     * @param newTheme - 新主题模式
     */
    const handleThemeChange = (newTheme: ThemeMode) => {
        setTheme(newTheme);
    };

    return (
        <div
            className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-600 p-5 transition-colors duration-200 ${className}`}
            style={{
                backgroundColor: resolvedTheme === 'dark' ? '#1e293b' : 'white',
                borderColor: resolvedTheme === 'dark' ? '#475569' : '#e5e7eb',
                color: resolvedTheme === 'dark' ? '#f8fafc' : '#111827'
            }}
        >
            <div className="mb-4">
                <h3
                    className="text-lg font-medium text-gray-900 dark:text-slate-100 transition-colors duration-200"
                    style={{ color: resolvedTheme === 'dark' ? '#f8fafc' : '#111827' }}
                >
                    主题设置 {resolvedTheme === 'dark' ? '(深色模式)' : '(浅色模式)'}
                </h3>
                <p
                    className="text-sm text-gray-600 dark:text-slate-300 mt-1 transition-colors duration-200"
                    style={{ color: resolvedTheme === 'dark' ? '#cbd5e1' : '#4b5563' }}
                >
                    选择应用主题模式
                    {isSystemTheme && (
                        <span className="text-blue-600 dark:text-blue-400 ml-1">
                            (当前: {resolvedTheme === 'dark' ? '深色' : '浅色'})
                        </span>
                    )}
                </p>
            </div>


            <div className="space-y-3">
                {themeOptions.map((option) => {
                    const isSelected = theme === option.mode;
                    const Icon = option.icon;

                    return (
                        <button
                            key={option.mode}
                            onClick={() => handleThemeChange(option.mode)}
                            className={`
                                w-full flex items-start gap-3 p-3 rounded-lg border transition-all duration-200
                                ${isSelected
                                    ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500 hover:bg-gray-50 dark:hover:bg-slate-700/30'
                                }
                            `}
                        >
                            {/* 主题图标 */}
                            <div className={`
                                flex-shrink-0 p-2 rounded-lg transition-colors duration-200
                                ${isSelected
                                    ? 'bg-blue-100 dark:bg-blue-800/50 text-blue-600 dark:text-blue-400'
                                    : 'bg-gray-100 dark:bg-slate-600 text-gray-500 dark:text-slate-300'
                                }
                            `}>
                                <Icon className="w-5 h-5" />
                            </div>

                            {/* 主题信息 */}
                            <div className="flex-1 text-left">
                                <div className={`
                                    text-sm font-medium transition-colors duration-200
                                    ${isSelected
                                        ? 'text-blue-700 dark:text-blue-400'
                                        : 'text-gray-900 dark:text-slate-100'
                                    }
                                `}>
                                    {option.label}
                                </div>
                                <div className={`
                                    text-xs mt-1 transition-colors duration-200
                                    ${isSelected
                                        ? 'text-blue-600 dark:text-blue-300'
                                        : 'text-gray-500 dark:text-slate-400'
                                    }
                                `}>
                                    {option.description}
                                </div>
                            </div>

                            {/* 选中状态指示器 */}
                            {isSelected && (
                                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 mt-2.5" />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default ThemeSelector;