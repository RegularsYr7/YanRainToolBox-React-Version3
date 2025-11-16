/**
 * Boot 修补页面组件
 * 
 * 提供 Boot 镜像的 Magisk 修补和验证功能。
 * 
 * @component BootPatchPage
 * @description Boot 修补页面 - Boot 镜像处理工具
 * @author YanRain ToolBox Team
 */

import React, { useMemo, useState } from 'react';

/**
 * Boot 修补页面组件
 * 
 * @returns React 组件
 */
const BootPatchPage: React.FC = () => {
    // 源选择：zip/url/img
    const [sourceMode, setSourceMode] = useState<'zip' | 'url' | 'img'>('zip');
    const [zipPath, setZipPath] = useState<string>('');
    const [directImgPath, setDirectImgPath] = useState<string>('');
    const [sourceUrl, setSourceUrl] = useState<string>('');

    const [partition, setPartition] = useState<'boot' | 'init_boot'>('boot');
    const [autoDetect, setAutoDetect] = useState<boolean>(true);
    const [magiskPath, setMagiskPath] = useState<string>('');

    const [outputDir, setOutputDir] = useState<string>(''); // 仅 URL 模式需要
    const computedOutputPath = useMemo(() => {
        if (sourceMode === 'img') return directImgPath;
        if (sourceMode === 'zip' && zipPath) {
            const idx = Math.max(zipPath.lastIndexOf('\\'), zipPath.lastIndexOf('/'));
            const dir = idx >= 0 ? zipPath.slice(0, idx) : '.';
            return `${dir}\\${partition}.img`;
        }
        if (sourceMode === 'url' && outputDir) {
            return `${outputDir}\\${partition}.img`;
        }
        return '';
    }, [sourceMode, zipPath, directImgPath, outputDir, partition]);

    const [running, setRunning] = useState(false);
    const [status, setStatus] = useState<string>('');
    const verify = async () => {
        try {
            const imgPath = sourceMode === 'img' ? directImgPath : computedOutputPath;
            if (!imgPath) throw new Error('请先选择或生成镜像');
            const info = await window.electronAPI.boot.inspect(imgPath);
            const msg = `magic=${info.magic}, size=${info.size}B` + (info.kernelSize !== undefined ? `, kernel=${info.kernelSize}` : '') + (info.ramdiskSize !== undefined ? `, ramdisk=${info.ramdiskSize}` : '') + (info.note ? ` | ${info.note}` : '');
            setStatus(`验证：${msg}`);
            window.electronAPI.notification.show('镜像验证', msg);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatus(`验证失败：${msg}`);
            window.electronAPI.notification.show('镜像验证失败', msg);
        }
    };

    const pickZip = async () => {
        const p = await window.electronAPI.fs.selectFile([
            { name: 'ZIP Files', extensions: ['zip'] },
            { name: 'All Files', extensions: ['*'] },
        ]);
        if (p) setZipPath(p);
    };

    const pickImg = async () => {
        const p = await window.electronAPI.fs.selectFile([
            { name: 'Image Files', extensions: ['img'] },
            { name: 'All Files', extensions: ['*'] },
        ]);
        if (p) setDirectImgPath(p);
    };

    const pickMagisk = async () => {
        const p = await window.electronAPI.fs.selectFile([
            { name: 'Magisk Package', extensions: ['apk', 'zip'] },
            { name: 'All Files', extensions: ['*'] },
        ]);
        if (p) setMagiskPath(p);
    };

    const pickOutputDir = async () => {
        const d = await window.electronAPI.fs.selectDirectory();
        if (d) setOutputDir(d);
    };

    const start = async () => {
        try {
            setStatus('');
            setRunning(true);

            if (!magiskPath) {
                throw new Error('请先选择 Magisk 安装包(.apk 或 .zip)');
            }

            // 1) 确定要修补的镜像路径
            let imgPath = '';
            if (sourceMode === 'img') {
                if (!directImgPath) throw new Error('请选择待修补的镜像文件');
                imgPath = directImgPath;
            } else {
                // 提取到输出目录
                const source = sourceMode === 'zip' ? zipPath : sourceUrl.trim();
                if (!source) throw new Error(sourceMode === 'zip' ? '请选择 ZIP 文件' : '请输入 OTA/ZIP 链接');

                // 计算输出目录
                const getDirFromPath = (p: string) => {
                    const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
                    return i >= 0 ? p.slice(0, i) : '.';
                };
                const baseDir = sourceMode === 'zip' ? getDirFromPath(zipPath) : outputDir;
                if (!baseDir) throw new Error('请选择输出目录');

                // 自动/手动分区尝试
                const tries: Array<'init_boot' | 'boot'> = autoDetect ? ['init_boot', 'boot'] : [partition];
                let lastErr = '';
                let chosen: 'init_boot' | 'boot' | null = null;
                for (const p of tries) {
                    const outPath = `${baseDir}\\${p}.img`;
                    setStatus(`正在提取分区镜像: ${p}...`);
                    const res = await window.electronAPI.ota.extractPartitionFromUrl(
                        source,
                        p,
                        outPath,
                        { verify: false }
                    );
                    if (res.success) {
                        imgPath = outPath;
                        chosen = p;
                        break;
                    }
                    lastErr = res.error || '提取失败';
                }
                if (!chosen) {
                    throw new Error(autoDetect ? `自动识别失败（尝试 init_boot/boot）: ${lastErr}` : lastErr || '分区提取失败');
                }
                // 同步 UI 上的分区选择，便于用户感知
                if (chosen !== partition) {
                    setPartition(chosen);
                }
            }

            // 2) 调用修补
            setStatus('正在修补 Boot 镜像...');
            const result = await window.electronAPI.boot.patch(imgPath, magiskPath);
            setStatus(`完成：${result}`);
            window.electronAPI.notification.show('Boot 修补', `成功：${result}`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setStatus(`错误：${msg}`);
            window.electronAPI.notification.show('Boot 修补失败', msg);
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="h-full overflow-auto p-6 bg-gray-50 dark:bg-dark-bg-primary transition-colors duration-200">
            {/* 页面标题 */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary mb-2 transition-colors duration-200">
                    Boot 修补
                </h1>
                <p className="text-gray-600 dark:text-dark-text-secondary transition-colors duration-200">
                    Boot 镜像修补工具 - 使用 Magisk 获得 Root 权限
                </p>
            </div>

            {/* 警告提示 */}
            <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4 transition-colors duration-200">
                <div className="flex items-start">
                    <div className="flex-shrink-0">
                        <svg className="w-5 h-5 text-amber-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div className="ml-3">
                        <h3 className="text-sm font-medium text-amber-800">
                            重要提醒
                        </h3>
                        <p className="text-sm text-amber-700 mt-1">
                            Boot 修补是高风险操作，请在操作前备份原始 boot.img 文件。不当操作可能导致设备无法启动。
                        </p>
                    </div>
                </div>
            </div>

            {/* 功能区域 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 源选择 */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">来源与分区</h3>
                    <div className="space-y-3">
                        <div className="flex gap-3">
                            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={sourceMode === 'zip'} onChange={() => setSourceMode('zip')} />本地 ZIP</label>
                            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={sourceMode === 'url'} onChange={() => setSourceMode('url')} />URL</label>
                            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={sourceMode === 'img'} onChange={() => setSourceMode('img')} />直接镜像</label>
                        </div>
                        {sourceMode === 'zip' && (
                            <div className="space-y-2">
                                <div className="flex gap-2">
                                    <button onClick={pickZip} className="px-3 py-2 bg-blue-600 text-white rounded">选择 ZIP</button>
                                    <span className="text-sm text-gray-700 truncate" title={zipPath}>{zipPath || '未选择'}</span>
                                </div>
                                <p className="text-xs text-gray-500">
                                    输出: {autoDetect
                                        ? (zipPath ? `${zipPath.slice(0, Math.max(zipPath.lastIndexOf('\\'), zipPath.lastIndexOf('/')) >= 0 ? Math.max(zipPath.lastIndexOf('\\'), zipPath.lastIndexOf('/')) : 0)}\\init_boot.img 或 ...\\boot.img` : '—')
                                        : (computedOutputPath || '—')}
                                </p>
                            </div>
                        )}
                        {sourceMode === 'url' && (
                            <div className="space-y-2">
                                <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="输入 OTA/ZIP/IMG URL" className="w-full px-3 py-2 border rounded" />
                                <div className="flex gap-2 items-center">
                                    <button onClick={pickOutputDir} className="px-3 py-2 bg-blue-600 text-white rounded">选择输出目录</button>
                                    <span className="text-sm text-gray-700 truncate" title={outputDir}>{outputDir || '未选择'}</span>
                                </div>
                                <p className="text-xs text-gray-500">输出: {autoDetect ? (outputDir ? `${outputDir}\\init_boot.img 或 ${outputDir}\\boot.img` : '—') : (computedOutputPath || '—')}</p>
                            </div>
                        )}
                        {sourceMode === 'img' && (
                            <div className="flex gap-2 items-center">
                                <button onClick={pickImg} className="px-3 py-2 bg-blue-600 text-white rounded">选择 IMG</button>
                                <span className="text-sm text-gray-700 truncate" title={directImgPath}>{directImgPath || '未选择'}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                            <label className="text-sm text-gray-700">分区:</label>
                            <select value={partition} onChange={(e) => setPartition(e.target.value as 'boot' | 'init_boot')} className="px-3 py-2 border rounded" disabled={autoDetect}>
                                <option value="boot">boot</option>
                                <option value="init_boot">init_boot (Android 13+)</option>
                            </select>
                            <label className="flex items-center gap-2 text-sm ml-2">
                                <input type="checkbox" checked={autoDetect} onChange={(e) => setAutoDetect(e.target.checked)} />
                                自动识别（优先 init_boot，其次 boot）
                            </label>
                        </div>
                    </div>
                </div>

                {/* Magisk 选择 */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Magisk 包</h3>
                    <div className="space-y-3">
                        <div className="flex gap-2 items-center">
                            <button onClick={pickMagisk} className="px-3 py-2 bg-emerald-600 text-white rounded">选择 Magisk APK/ZIP</button>
                            <span className="text-sm text-gray-700 truncate" title={magiskPath}>{magiskPath || '未选择'}</span>
                        </div>
                        <div className="text-xs text-gray-500 p-3 bg-gray-50 rounded border">
                            <p>支持官方/Alpha/Delta 版本（.apk 或 .zip）</p>
                        </div>
                    </div>
                </div>

                {/* 执行区 */}
                <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">开始修补</h3>
                    <p className="text-gray-600 text-sm mb-4">自动提取分区（如需）并执行 Magisk 修补</p>
                    <div className="flex gap-3 items-center">
                        <button onClick={start} disabled={running} className={`flex-1 py-3 px-6 rounded-lg font-medium text-white ${running ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}>
                            {running ? '处理中…' : '一键提取并修补'}
                        </button>
                        <button onClick={verify} className="px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">验证镜像</button>
                        <div className="text-sm text-gray-700 min-h-[1.5rem]">{status}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BootPatchPage;
