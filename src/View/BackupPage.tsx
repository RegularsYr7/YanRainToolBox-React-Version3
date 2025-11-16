import React, { useEffect, useMemo, useState } from "react";
import { FolderOpenIcon, PlayIcon } from "@heroicons/react/24/outline";
import { useDevice } from "../hooks/useDevice";
import DeviceSelector from "../components/Device/DeviceSelector";

type BackupProgress = {
    stage?: string;
    progress?: number; // 0-100
    message?: string;
};

const BackupPage: React.FC = () => {
    const { selectedDevice } = useDevice();
    const [outputPath, setOutputPath] = useState("");
    const [deviceModel, setDeviceModel] = useState("");
    const [romVersion, setRomVersion] = useState("");
    const [running, setRunning] = useState(false);
    const [isRooted, setIsRooted] = useState<boolean | null>(null);
    const [progress, setProgress] = useState<BackupProgress>({ progress: 0 });
    const [logs, setLogs] = useState<string[]>([]);
    const [excludes, setExcludes] = useState<string[]>([]);

    const disabled = useMemo(() => {
        return running || !outputPath || !deviceModel || !romVersion || !selectedDevice;
    }, [running, outputPath, deviceModel, romVersion, selectedDevice]);

    useEffect(() => {
        // 根据当前选中设备预填
        if (selectedDevice) {
            setDeviceModel((prev) => prev || selectedDevice.model || "");
            setRomVersion((prev) => prev || selectedDevice.androidVersion || "");
            if (typeof selectedDevice.isRooted === "boolean") setIsRooted(selectedDevice.isRooted);
        }

        // 订阅进度
        const onProg = (p: BackupProgress) => {
            setProgress({ ...p });
            if (p?.message) setLogs((prev) => [...prev, p.message!].slice(-200));
        };
        try {
            (window as any).electronAPI.backup.onProgress(onProg);
        } catch { }
        return () => {
            try {
                (window as any).electronAPI.backup.removeProgressListener(onProg);
            } catch { }
        };
    }, [selectedDevice]);

    const handleSelectDir = async () => {
        try {
            const dir = await (window as any).electronAPI.fs.selectDirectory();
            if (dir) setOutputPath(dir);
        } catch (e) {
            setLogs((prev) => [...prev, `选择目录失败: ${e}`].slice(-200));
        }
    };

    const handleStart = async () => {
        if (disabled || !selectedDevice) return;
        setRunning(true);
        setLogs((prev) => [...prev, `开始备份 -> 设备:${deviceModel} ROM:${romVersion} 序列号:${selectedDevice.serialNumber}`].slice(-200));
        setProgress({ progress: 0, stage: "start" });
        try {
            const ok = await (window as any).electronAPI.backup.start(
                outputPath,
                deviceModel,
                romVersion,
                selectedDevice.serialNumber,
                { excludePartitions: excludes }
            );
            if (ok) {
                setLogs((prev) => [...prev, "备份完成"].slice(-200));
                setProgress((p) => ({ ...p, progress: 100, stage: "done" }));
            } else {
                setLogs((prev) => [...prev, "备份失败"].slice(-200));
                setProgress((p) => ({ ...p, stage: "error" }));
            }
        } catch (e) {
            setLogs((prev) => [...prev, `备份失败: ${e}`].slice(-200));
            setProgress((p) => ({ ...p, stage: "error" }));
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="h-full overflow-auto p-6 bg-gray-50 dark:bg-dark-bg-primary transition-colors duration-200">
            {/* 标题区，与其他页面保持一致 */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary transition-colors duration-200">镜像备份</h1>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1 transition-colors duration-200">对已 Root 的设备执行分区镜像备份，并生成可刷写脚本。</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 左侧配置卡片 */}
                <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-5 space-y-5 transition-colors duration-200">
                    {/* 分区排除选项 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">排除分区</label>
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                            {[
                                "userdata",
                                "metadata",
                                "cache",
                                "logfs",
                                "persist",
                                "cust",
                            ].map((name) => (
                                <label key={name} className="inline-flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={excludes.includes(name)}
                                        onChange={(e) => {
                                            setExcludes((prev) =>
                                                e.target.checked
                                                    ? Array.from(new Set([...prev, name]))
                                                    : prev.filter((x) => x !== name)
                                            );
                                        }}
                                    />
                                    <span>{name}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    {/* 设备选择器 */}
                    <DeviceSelector
                        title="选择要备份的设备"
                        compact={true}
                        className="border-0 p-0 bg-transparent shadow-none"
                    />
                    <div>
                        <label className="block text-sm font-medium text-gray-700">输出目录</label>
                        <div className="mt-1 flex gap-2">
                            <input
                                type="text"
                                value={outputPath}
                                onChange={(e) => setOutputPath(e.target.value)}
                                placeholder="选择备份输出的文件夹"
                                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                onClick={handleSelectDir}
                                className="px-3 py-2 text-sm rounded-lg bg-gray-100 border border-gray-300 hover:bg-gray-200 flex items-center gap-2"
                            >
                                <FolderOpenIcon className="w-4 h-4" /> 浏览...
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">设备型号</label>
                            <input
                                type="text"
                                value={deviceModel}
                                onChange={(e) => setDeviceModel(e.target.value)}
                                placeholder="例如：Xiaomi 12"
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">ROM 版本</label>
                            <input
                                type="text"
                                value={romVersion}
                                onChange={(e) => setRomVersion(e.target.value)}
                                placeholder="例如：OS1.0 / Android 14"
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    <div className="pt-2 space-y-2">
                        {!selectedDevice && (
                            <div className="text-xs text-orange-600">请先选择要备份的设备。</div>
                        )}
                        {isRooted === false && (
                            <div className="text-xs text-red-600">检测到设备未 Root，无法执行分区备份。</div>
                        )}
                        <button
                            onClick={handleStart}
                            disabled={disabled || isRooted === false}
                            className={`px-4 py-2 rounded-lg text-white text-sm flex items-center gap-2 ${disabled || isRooted === false ? "bg-gray-300 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}
                        >
                            <PlayIcon className="w-4 h-4" /> {running ? "备份进行中..." : "开始备份"}
                        </button>
                    </div>
                </div>

                {/* 右侧状态卡片 */}
                <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-5 space-y-4 transition-colors duration-200">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">进度</label>
                        <div className="mt-1 w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-600 transition-all"
                                style={{ width: `${Math.min(100, Math.max(0, progress.progress ?? 0))}%` }}
                            />
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                            {progress.stage ?? "等待开始"}（{Math.round(progress.progress ?? 0)}%）
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">日志</label>
                        <div className="mt-1 h-56 rounded-lg border border-gray-200 bg-gray-50 p-2 overflow-auto text-xs text-gray-700">
                            {logs.length === 0 ? (
                                <div className="text-gray-400">暂无日志</div>
                            ) : (
                                logs.map((l, i) => <div key={i} className="whitespace-pre-wrap">{l}</div>)
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BackupPage;
