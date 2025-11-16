/**
 * 全局导航栏组件
 * 
 * 提供应用的主要导航功能，支持折叠/展开状态切换。
 * 默认为折叠状态，鼠标悬停时展开显示菜单选项。
 * 
 * @component GlobalNavigation
 * @description 全局导航栏 - 应用主要功能模块的入口
 * @author YanRain ToolBox Team
 * 
 * @features
 * - 折叠/展开状态管理
 * - 鼠标悬停自动展开
 * - 菜单项点击切换功能页面
 * - 当前页面高亮显示
 * - 平滑过渡动画
 * 
 * @usage
 * ```tsx
 * import GlobalNavigation from './components/Navigation/GlobalNavigation';
 * 
 * function App() {
 *   const [currentPage, setCurrentPage] = useState('home');
 *   
 *   return (
 *     <div className="app">
 *       <GlobalNavigation 
 *         currentPage={currentPage}
 *         onPageChange={setCurrentPage}
 *       />
 *       {/* 其他内容 *\/}
 *     </div>
 *   );
 * }
 * ```
 */

import React, { useState } from 'react';
import {
    HomeIcon,
    CubeIcon,
    WrenchScrewdriverIcon,
    DocumentTextIcon,
    Cog6ToothIcon,
    ArchiveBoxIcon,
    CommandLineIcon,
    BoltIcon
} from '@heroicons/react/24/outline';
import {
    HomeIcon as HomeIconSolid,
    CubeIcon as CubeIconSolid,
    WrenchScrewdriverIcon as WrenchScrewdriverIconSolid,
    DocumentTextIcon as DocumentTextIconSolid,
    ArchiveBoxIcon as ArchiveBoxIconSolid,
    CommandLineIcon as CommandLineIconSolid,
    BoltIcon as BoltIconSolid
} from '@heroicons/react/24/solid';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { ArrowDownTrayIcon as ArrowDownTrayIconSolid } from '@heroicons/react/24/solid';

/**
 * 菜单项接口定义
 */
interface MenuItem {
    /** 菜单项唯一标识 */
    id: string;
    /** 菜单项显示名称 */
    label: string;
    /** 菜单项图标 (outline 版本) */
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    /** 菜单项图标 (solid 版本，用于激活状态) */
    iconSolid: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    /** 菜单项描述 */
    description?: string;
}

/**
 * 导航栏组件属性接口
 */
interface GlobalNavigationProps {
    /** 当前激活页面 */
    currentPage: string;
    /** 页面切换回调函数 */
    onPageChange: (pageId: string) => void;
    /** 自定义样式类名 */
    className?: string;
}

/**
 * 菜单项配置
 */
const menuItems: MenuItem[] = [
    {
        id: 'home',
        label: '主页',
        icon: HomeIcon,
        iconSolid: HomeIconSolid,
        description: '应用主页和概览'
    },
    {
        id: 'backup',
        label: '镜像备份',
        icon: ArchiveBoxIcon,
        iconSolid: ArchiveBoxIconSolid,
        description: '设备分区镜像备份与导出'
    },
    {
        id: 'app-manager',
        label: '应用管理',
        icon: CubeIcon,
        iconSolid: CubeIconSolid,
        description: 'Android 应用安装、卸载、管理'
    },
    {
        id: 'boot-patch',
        label: 'Boot 修补',
        icon: WrenchScrewdriverIcon,
        iconSolid: WrenchScrewdriverIconSolid,
        description: 'Boot 镜像修补和 Root 权限'
    },
    {
        id: 'tools',
        label: '工具文件',
        icon: DocumentTextIcon,
        iconSolid: DocumentTextIconSolid,
        description: '系统工具和文件管理'
    }
    ,
    {
        id: 'shell',
        label: '命令行',
        icon: CommandLineIcon,
        iconSolid: CommandLineIconSolid,
        description: '直接执行 adb/fastboot/magiskboot 等命令'
    }
    ,
    {
        id: 'partition-extract',
        label: '分区提取',
        icon: ArrowDownTrayIcon,
        iconSolid: ArrowDownTrayIconSolid,
        description: '自定义分区提取（URL/本地ZIP）'
    }
    ,
    {
        id: 'fastboot-partition',
        label: 'Fastboot 分区',
        icon: BoltIcon,
        iconSolid: BoltIconSolid,
        description: '分区刷入/擦除（Fastboot）'
    }
];

/**
 * 全局导航栏组件
 * 
 * @param props - 组件属性
 * @returns React 组件
 */
const GlobalNavigation: React.FC<GlobalNavigationProps> = ({
    currentPage,
    onPageChange,
    className = ''
}) => {
    // 导航栏展开状态
    const [isExpanded, setIsExpanded] = useState(false);

    /**
     * 处理菜单项点击事件
     * @param pageId - 页面 ID
     */
    const handleMenuItemClick = (pageId: string) => {
        onPageChange(pageId);
        // 点击后可以选择是否收起导航栏
        // setIsExpanded(false);
    };

    // 侧边栏使用点击切换，不再需要鼠标悬停事件

    return (
        <div className={`
            h-full bg-white dark:bg-dark-bg-secondary border-r border-gray-200 dark:border-dark-border flex flex-col
            transition-all duration-300 ease-in-out
            ${isExpanded ? 'w-64' : 'w-16'}
            ${className}
        `}>
            {/* 头部区域 - Logo 和标题 */}
            <div className="flex items-center px-5 py-3 border-b border-gray-100 dark:border-dark-border">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0">
                        <Cog6ToothIcon
                            className="w-6 h-6 text-blue-600 dark:text-blue-400 cursor-pointer transition-transform duration-300 hover:rotate-90"
                            onClick={() => setIsExpanded(!isExpanded)}
                        />
                    </div>
                    {isExpanded && (
                        <div className="flex-1 min-w-0">
                            <h1 className="text-sm font-semibold text-gray-900 dark:text-dark-text-primary truncate transition-colors duration-200">
                                YanRain ToolBox
                            </h1>
                            <p className="text-xs text-gray-500 dark:text-dark-text-tertiary truncate transition-colors duration-200">
                                Android 工具箱
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* 菜单项列表 */}
            <nav className="flex-1 overflow-y-auto px-3 py-4">
                <div className="space-y-1">
                    {menuItems.map((item) => {
                        const isActive = currentPage === item.id;
                        const IconComponent = isActive ? item.iconSolid : item.icon;

                        return (
                            <button
                                key={item.id}
                                onClick={() => handleMenuItemClick(item.id)}
                                className={`
                                    w-full group flex items-center
                                    ${isExpanded ? 'gap-3 px-3 text-left' : 'justify-center px-2'}
                                    py-2.5 rounded-lg
                                    transition-all duration-200
                                    ${isActive
                                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-700'
                                        : 'text-gray-600 dark:text-dark-text-secondary hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary/50 hover:text-gray-900 dark:hover:text-dark-text-primary'
                                    }
                                `}
                                title={!isExpanded ? item.label : item.description}
                            >
                                {/* 菜单图标 */}
                                <IconComponent
                                    className={`
                                        w-5 h-5 flex-shrink-0 transition-colors duration-200
                                        ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-dark-text-tertiary group-hover:text-gray-700 dark:group-hover:text-dark-text-secondary'}
                                    `}
                                />

                                {/* 菜单标签 - 仅在展开时显示 */}
                                {isExpanded && (
                                    <div className="flex-1 min-w-0">
                                        <div className={`
                                            text-sm font-medium truncate transition-colors duration-200
                                            ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-gray-700 dark:text-dark-text-secondary group-hover:text-gray-900 dark:group-hover:text-dark-text-primary'}
                                        `}>
                                            {item.label}
                                        </div>

                                        {/* 菜单描述 */}
                                        {item.description && (
                                            <div className={`
                                                text-xs truncate mt-0.5 transition-colors duration-200
                                                ${isActive ? 'text-blue-500 dark:text-blue-300' : 'text-gray-500 dark:text-dark-text-tertiary'}
                                            `}>
                                                {item.description}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 激活状态指示器 - 仅在展开时显示 */}
                                {isActive && isExpanded && (
                                    <div className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 flex-shrink-0" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </nav>

            {/* 底部信息 */}
            <div className="px-3 py-4 border-t border-gray-100 dark:border-dark-border">
                {isExpanded ? (
                    <div className="text-center">
                        <div className="text-xs text-gray-400 dark:text-dark-text-tertiary transition-colors duration-200">YanRain ToolBox v3.0.0</div>

                    </div>
                ) : (
                    <div className="flex justify-center">
                        <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-dark-text-tertiary"></div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GlobalNavigation;
