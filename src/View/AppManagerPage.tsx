/**
 * 应用管理页面组件
 * 
 * 提供 Android 应用的安装、卸载、启用/禁用等管理功能。
 * 
 * @component AppManagerPage
 * @description 应用管理页面 - Android 应用管理工具
 * @author YanRain ToolBox Team
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    DevicePhoneMobileIcon,
    ArrowPathIcon,
    PlayIcon,
    StopIcon,
    XCircleIcon,
    EyeIcon,
    EyeSlashIcon,
    ArrowDownTrayIcon,
    TrashIcon,
    DocumentArrowDownIcon,
    MagnifyingGlassIcon
} from '@heroicons/react/24/outline';

// 使用 preload.ts 中定义的 ApplicationInfo 接口
import type { ApplicationInfo } from '../types/electron-types';
// 导入设备管理 Hook
import { useDevice } from '../hooks/useDevice';
// 导入设备选择器组件
import DeviceSelector from '../components/Device/DeviceSelector';
import { nowMs } from '../Electron/utils/timing';

// 扩展 ApplicationInfo 接口以包含额外的 UI 状态
interface ExtendedAppInfo extends ApplicationInfo {
    versionCode: string; // 版本代码
    isSystemApp: boolean; // 是否为系统应用
    isEnabled: boolean; // 是否启用
    installTime: string; // 安装时间
    updateTime: string; // 更新时间  
    apkPath: string; // APK路径
}

// 按设备序列号缓存应用列表，避免页面返回后重复读取
const appListCache: Map<string, { apps: ExtendedAppInfo[]; updatedAt: number }> = new Map();

/**
 * 获取操作按钮配置 - 移到组件外部以提高性能
 */
const getOperationButtons = (app: ExtendedAppInfo) => [
    {
        operation: 'start' as AppOperation,
        label: '运行',
        icon: PlayIcon,
        color: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
    },
    {
        operation: 'stop' as AppOperation,
        label: '停止',
        icon: StopIcon,
        color: 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
    },
    {
        operation: app.isEnabled ? 'disable' : 'enable' as AppOperation,
        label: app.isEnabled ? '禁用' : '启用',
        icon: app.isEnabled ? EyeSlashIcon : EyeIcon,
        color: app.isEnabled ? 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100' : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
    },
    {
        operation: 'freeze' as AppOperation,
        label: '冻结',
        icon: XCircleIcon,
        color: 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'
    },
    {
        operation: 'unfreeze' as AppOperation,
        label: '解冻',
        icon: EyeIcon,
        color: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
    },
    {
        operation: 'extract' as AppOperation,
        label: '提取',
        icon: ArrowDownTrayIcon,
        color: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
    },
    {
        operation: 'uninstall' as AppOperation,
        label: '卸载',
        icon: TrashIcon,
        color: 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
    },
    {
        operation: 'uninstall_keep_data' as AppOperation,
        label: '保留数据卸载',
        icon: DocumentArrowDownIcon,
        color: 'bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100'
    },
    {
        operation: 'clear_data' as AppOperation,
        label: '清除数据',
        icon: TrashIcon,
        color: 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
    }
];

// 应用操作类型
type AppOperation =
    | 'start'
    | 'stop'
    | 'enable'
    | 'disable'
    | 'freeze'
    | 'unfreeze'
    | 'extract'
    | 'uninstall'
    | 'uninstall_keep_data'
    | 'clear_data';

/**
 * 应用管理页面组件
 * 
 * @returns React 组件
 */
const AppManagerPage: React.FC = () => {
    const [apps, setApps] = useState<ExtendedAppInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'system' | 'user'>('all');
    const [operationLoading, setOperationLoading] = useState<string | null>(null);
    const [debugInfo, setDebugInfo] = useState<string>('');
    const [visibleCount, setVisibleCount] = useState(20); // 限制显示数量
    const [loadingMore, setLoadingMore] = useState(false); // 加载更多状态
    const fetchingRef = useRef(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // 使用全局设备上下文
    const {
        devices,
        selectedDevice,
        refreshDevices
    } = useDevice();

    /**
     * 获取设备应用列表
     */
    const getAppList = useCallback(async (forceRefresh: boolean = false) => {
        if (fetchingRef.current) return;
        fetchingRef.current = true;
        if (!selectedDevice) {
            setDebugInfo('请先选择设备');
            setApps([]);
            fetchingRef.current = false;
            return;
        }

        if (!window.electronAPI) {
            console.error('Electron API 不可用');
            setDebugInfo('Electron API 不可用');
            return;
        }

        setLoading(true);
        const t0 = nowMs();
        setDebugInfo(`正在获取设备 ${selectedDevice.brand} ${selectedDevice.model} (${selectedDevice.serialNumber}) 的应用列表...`);

        // 若存在缓存且非强制刷新，直接展示缓存
        if (!forceRefresh) {
            const cached = appListCache.get(selectedDevice.serialNumber);
            if (cached) {
                setApps(cached.apps);
                setDebugInfo(`已从缓存加载 ${cached.apps.length} 个应用（上次更新 ${new Date(cached.updatedAt).toLocaleTimeString()}）`);
                setLoading(false);
                fetchingRef.current = false;
                return;
            }
        }

        try {
            console.log('开始获取应用列表，当前选择设备:', selectedDevice);

            // 获取应用列表，传递设备序列号
            const applicationList = await window.electronAPI.app.getApplications(selectedDevice.serialNumber);
            const dt = Math.round(nowMs() - t0);
            console.log('从 API 获取的原始数据:', applicationList);
            console.log('应用数量:', applicationList?.length || 0);

            if (!applicationList || applicationList.length === 0) {
                console.warn('API 返回空的应用列表');
                setDebugInfo(`设备 ${selectedDevice.brand} ${selectedDevice.model} 的应用列表为空（用时 ${dt} ms），这可能是因为：
1. 设备上没有安装应用
2. 后端服务未正确实现多设备支持
3. ADB 权限问题`);
                setApps([]);
                return;
            }

            // 将 ApplicationInfo 转换为 ExtendedAppInfo
            const extendedApps: ExtendedAppInfo[] = applicationList.map(app => ({
                ...app,
                appName: app.name, // 映射 name 到 appName
                versionName: app.version, // 映射 version 到 versionName
                versionCode: app.targetSdk, // 使用 targetSdk 作为 versionCode
                isSystemApp: app.packageName.startsWith('com.android.') || app.packageName.startsWith('android.'),
                isEnabled: true, // 默认启用状态，实际需要通过额外API检查
                installTime: app.installDate,
                updateTime: app.installDate, // 暂时使用安装日期
                apkPath: `/data/app/${app.packageName}/base.apk` // 默认路径
            }));

            setApps(extendedApps);
            // 写入缓存
            appListCache.set(selectedDevice.serialNumber, { apps: extendedApps, updatedAt: Date.now() });
            setDebugInfo(`成功获取 ${extendedApps.length} 个应用，用时 ${dt} ms（已缓存）`);
            console.log('获取应用列表成功:', extendedApps);
        } catch (error) {
            console.error('获取应用列表失败:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);

            if (errorMessage.includes('more than one device/emulator')) {
                setDebugInfo(`多设备检测错误: 检测到多个设备连接，但后端服务暂不支持指定设备获取应用列表。请确保只连接一个设备，或等待后端服务升级支持多设备。`);
            } else {
                setDebugInfo(`获取应用列表失败: ${errorMessage}`);
            }
            setApps([]);
        } finally {
            setLoading(false);
            fetchingRef.current = false;
        }
    }, [selectedDevice]);

    // 监听设备变化并重新获取应用列表
    useEffect(() => {
        if (selectedDevice) {
            getAppList();
        } else {
            setApps([]);
            setDebugInfo('请选择一个设备来查看应用列表');
        }
    }, [selectedDevice, getAppList]);

    // 组件初始化时刷新设备列表
    useEffect(() => {
        if (devices.length === 0) {
            refreshDevices();
        }
    }, [devices.length, refreshDevices]);

    /**
     * 执行应用操作
     */
    const handleAppOperation = async (packageName: string, operation: AppOperation) => {
        if (!selectedDevice) {
            console.error('没有选择设备');
            return;
        }

        if (!window.electronAPI) {
            console.error('Electron API 不可用');
            return;
        }

        setOperationLoading(`${packageName}-${operation}`);
        try {
            const deviceSerial = selectedDevice.serialNumber;

            switch (operation) {
                case 'start': {
                    const ok = await window.electronAPI.app.start(packageName, deviceSerial);
                    console.log(`启动应用: ${packageName} -> ${ok}`);
                    // 启动应用不改变列表状态，不刷新
                    break;
                }
                case 'stop': {
                    const ok = await window.electronAPI.app.stop(packageName, deviceSerial);
                    console.log(`停止应用: ${packageName} -> ${ok}`);
                    // 停止应用不改变列表状态，不刷新
                    break;
                }
                case 'enable':
                    await window.electronAPI.app.enableApplication(packageName, deviceSerial);
                    console.log(`启用应用: ${packageName} (设备: ${deviceSerial})`);
                    break;
                case 'disable':
                    await window.electronAPI.app.disableApplication(packageName, deviceSerial);
                    console.log(`禁用应用: ${packageName} (设备: ${deviceSerial})`);
                    break;
                case 'freeze': {
                    const ok = await window.electronAPI.app.freeze(packageName, deviceSerial);
                    console.log(`冻结应用: ${packageName} -> ${ok}`);
                    // 冻结后本地立即标记为未启用，立刻出现“解冻”按钮
                    if (ok) {
                        setApps(prev => {
                            const next = prev.map(a => a.packageName === packageName ? { ...a, isEnabled: false } : a);
                            if (selectedDevice) {
                                appListCache.set(selectedDevice.serialNumber, { apps: next, updatedAt: Date.now() });
                            }
                            return next;
                        });
                    }
                    break;
                }
                case 'unfreeze': {
                    const ok = await window.electronAPI.app.unfreeze(packageName, deviceSerial);
                    console.log(`解冻应用: ${packageName} -> ${ok}`);
                    // 解冻后本地立即标记为已启用，隐藏“解冻”按钮
                    if (ok) {
                        setApps(prev => {
                            const next = prev.map(a => a.packageName === packageName ? { ...a, isEnabled: true } : a);
                            if (selectedDevice) {
                                appListCache.set(selectedDevice.serialNumber, { apps: next, updatedAt: Date.now() });
                            }
                            return next;
                        });
                    }
                    break;
                }
                case 'extract': {
                    // 选择保存目录并生成默认文件名
                    const dir = await window.electronAPI.fs.selectDirectory();
                    if (!dir) break;
                    const filename = `${packageName}.apk`;
                    const output = `${dir}\\${filename}`;
                    const ok = await window.electronAPI.app.extractApk(packageName, output, deviceSerial);
                    console.log(`提取安装包: ${packageName} -> ${ok} 保存至 ${output}`);
                    // 提取不改变列表状态，不刷新
                    break;
                }
                case 'uninstall':
                    await window.electronAPI.app.uninstallApplication(packageName, false, deviceSerial);
                    console.log(`卸载应用: ${packageName} (设备: ${deviceSerial})`);
                    break;
                case 'uninstall_keep_data':
                    await window.electronAPI.app.uninstallApplication(packageName, true, deviceSerial);
                    console.log(`保留数据卸载应用: ${packageName} (设备: ${deviceSerial})`);
                    break;
                case 'clear_data':
                    await window.electronAPI.app.clearApplicationData(packageName, deviceSerial);
                    console.log(`清除应用数据: ${packageName} (设备: ${deviceSerial})`);
                    break;
                default:
                    console.warn('未知操作类型:', operation);
                    return;
            }

            // 对会改变状态的操作才刷新列表
            const shouldRefresh = ['enable', 'disable', 'uninstall', 'uninstall_keep_data', 'clear_data', 'freeze', 'unfreeze'].includes(operation);
            if (shouldRefresh) {
                setTimeout(() => {
                    if (selectedDevice) {
                        appListCache.delete(selectedDevice.serialNumber);
                        getAppList(true);
                    } else {
                        getAppList(true);
                    }
                }, 800);
            }

        } catch (error) {
            console.error(`${operation} 操作失败:`, error);
        } finally {
            setOperationLoading(null);
        }
    };

    /**
     * 过滤应用列表 - 使用useMemo优化性能
     */
    const filteredApps = useMemo(() => {
        const filtered = apps.filter(app => {
            const matchesSearch = app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                app.packageName.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesFilter = filterType === 'all' ||
                (filterType === 'system' && app.isSystemApp) ||
                (filterType === 'user' && !app.isSystemApp);

            return matchesSearch && matchesFilter;
        });

        // 只显示前N个应用以提高性能
        return filtered.slice(0, visibleCount);
    }, [apps, searchTerm, filterType, visibleCount]);

    // 检查是否还有更多应用可以显示
    const hasMoreApps = useMemo(() => {
        const allFiltered = apps.filter(app => {
            const matchesSearch = app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                app.packageName.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesFilter = filterType === 'all' ||
                (filterType === 'system' && app.isSystemApp) ||
                (filterType === 'user' && !app.isSystemApp);
            return matchesSearch && matchesFilter;
        });
        return allFiltered.length > visibleCount;
    }, [apps, searchTerm, filterType, visibleCount]);



    /**
     * 处理滚动触底加载更多
     */
    const handleScroll = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container || loadingMore) return;

        const { scrollTop, scrollHeight, clientHeight } = container;
        const scrollPosition = scrollTop + clientHeight;
        const threshold = scrollHeight - 100; // 距离底部100px时触发

        if (scrollPosition >= threshold && hasMoreApps) {
            setLoadingMore(true);
            setTimeout(() => {
                setVisibleCount(prev => prev + 20);
                setLoadingMore(false);
            }, 300); // 添加一点延迟，让用户感知到加载过程
        }
    }, [loadingMore, hasMoreApps]);

    // 添加滚动监听器
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, [handleScroll]);

    // 搜索条件变化时重置显示数量
    useEffect(() => {
        setVisibleCount(20);
    }, [searchTerm, filterType]);

    // 组件加载时获取应用列表（优先缓存）
    useEffect(() => {
        getAppList();
    }, [getAppList]);

    return (
        <div className="h-full flex flex-col p-4 bg-gray-50 dark:bg-dark-bg-primary transition-colors duration-200">
            {/* 页面标题 */}
            <div className="mb-4 flex-shrink-0">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary mb-2 transition-colors duration-200">
                    应用管理
                </h1>
                <p className="text-gray-600 dark:text-dark-text-secondary transition-colors duration-200">
                    Android 应用安装、卸载、启用/禁用管理工具
                </p>

                {/* 调试信息显示 */}
                {debugInfo && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                        <div className="flex items-start">
                            <svg className="w-5 h-5 text-blue-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                            <div className="flex-1">
                                <p className="whitespace-pre-wrap">{debugInfo}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 控制栏 */}
            <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4 mb-4 flex-shrink-0 transition-colors duration-200">
                {/* 设备选择器组件 */}
                <DeviceSelector
                    title="选择设备进行应用管理"
                    className="mb-4 bg-gray-50 dark:bg-dark-bg-primary"
                    compact={true}
                />

                {/* 多设备警告 */}
                {devices.length > 1 && (
                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                        <div className="flex items-start">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <h3 className="text-sm font-medium text-yellow-800">
                                    检测到多个设备
                                </h3>
                                <div className="mt-2 text-sm text-yellow-700">
                                    <p>
                                        当前连接了 {devices.length} 个设备。由于后端服务限制，应用管理功能可能无法正常工作。
                                        建议只保留一个设备连接，或等待后端服务升级支持多设备操作。
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div className="flex flex-col sm:flex-row gap-4 flex-1">
                        {/* 搜索框 */}
                        <div className="relative flex-1 max-w-md">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="搜索应用名称或包名..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>

                        {/* 筛选器 */}
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value as 'all' | 'system' | 'user')}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="all">全部应用</option>
                            <option value="user">用户应用</option>
                            <option value="system">系统应用</option>
                        </select>
                    </div>

                    {/* 刷新按钮 */}
                    <button
                        onClick={() => getAppList(true)}
                        disabled={loading}
                        className="flex items-center space-x-2 px-4 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                    >
                        <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        <span>刷新列表</span>
                    </button>
                </div>
            </div>

            {/* 应用列表 - 独立滚动区域 */}
            <div className="flex-1 overflow-hidden min-h-0">
                <div
                    ref={scrollContainerRef}
                    className="h-full overflow-y-auto bg-white rounded-lg shadow-sm border border-gray-200 scrollbar-custom"
                    style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: '#cbd5e1 #f1f5f9'
                    }}
                >
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="flex items-center space-x-2 text-blue-600">
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                                <span>获取应用列表中...</span>
                            </div>
                        </div>
                    ) : filteredApps.length === 0 ? (
                        <div className="text-center py-12">
                            <DevicePhoneMobileIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                            <p className="text-gray-500">没有找到匹配的应用</p>
                            <p className="text-gray-400 text-sm mt-1">请检查设备连接或调整搜索条件</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-200">
                            {filteredApps.map((app) => (
                                <div key={app.packageName} className="p-6">
                                    <div className="flex items-start justify-between">
                                        {/* 应用信息 */}
                                        <div className="flex-1">
                                            <div className="flex items-center space-x-3 mb-2">
                                                <h3 className="text-lg font-semibold text-gray-900">
                                                    {app.name}
                                                </h3>
                                                <div className="flex items-center space-x-2">
                                                    {app.isSystemApp && (
                                                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                                                            系统应用
                                                        </span>
                                                    )}
                                                    <span className={`px-2 py-1 text-xs rounded-full ${app.isEnabled
                                                        ? 'bg-green-100 text-green-700'
                                                        : 'bg-red-100 text-red-700'
                                                        }`}>
                                                        {app.isEnabled ? '已启用' : '已禁用'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-600">
                                                <div>
                                                    <span className="font-medium">应用名称:</span>
                                                    <br />
                                                    {app.name}
                                                </div>
                                                <div>
                                                    <span className="font-medium">包名:</span>
                                                    <br />
                                                    <span className="font-mono text-xs">{app.packageName}</span>
                                                </div>
                                                <div>
                                                    <span className="font-medium">版本:</span>
                                                    <br />
                                                    {app.version} ({app.versionCode})
                                                </div>
                                                <div>
                                                    <span className="font-medium">安装时间:</span>
                                                    <br />
                                                    {app.installTime}
                                                </div>
                                                <div>
                                                    <span className="font-medium">更新时间:</span>
                                                    <br />
                                                    {app.updateTime}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 操作按钮 */}
                                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                                        {getOperationButtons(app).map(({ operation, label, icon: Icon, color }) => (
                                            <button
                                                key={operation}
                                                onClick={() => handleAppOperation(app.packageName, operation)}
                                                disabled={operationLoading === `${app.packageName}-${operation}`}
                                                className={`flex items-center justify-center space-x-1 px-2 py-1.5 border rounded-lg transition-colors disabled:opacity-50 text-xs ${color}`}
                                            >
                                                {operationLoading === `${app.packageName}-${operation}` ? (
                                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></div>
                                                ) : (
                                                    <Icon className="w-3 h-3" />
                                                )}
                                                <span className="truncate">{label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 触底加载提示 */}
                    {!loading && (
                        <div className="p-4 text-center border-t border-gray-200">
                            {loadingMore ? (
                                <div className="flex items-center justify-center space-x-2 text-blue-600">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                    <span className="text-sm">正在加载更多应用...</span>
                                </div>
                            ) : hasMoreApps ? (
                                <p className="text-sm text-gray-500">
                                    向下滑动加载更多应用 ({apps.filter(app => {
                                        const matchesSearch = app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                            app.packageName.toLowerCase().includes(searchTerm.toLowerCase());
                                        const matchesFilter = filterType === 'all' ||
                                            (filterType === 'system' && app.isSystemApp) ||
                                            (filterType === 'user' && !app.isSystemApp);
                                        return matchesSearch && matchesFilter;
                                    }).length - visibleCount} 个剩余)
                                </p>
                            ) : filteredApps.length > 0 ? (
                                <p className="text-sm text-gray-400">已加载全部应用</p>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AppManagerPage;
