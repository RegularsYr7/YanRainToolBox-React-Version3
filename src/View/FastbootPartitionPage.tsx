import React, { useEffect, useRef, useState } from "react";
import { FolderOpenIcon, BoltIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useDevice } from "../hooks/useDevice";
import DeviceSelector from "../components/Device/DeviceSelector";

const COMMON_PARTITIONS = [
    "boot",
    "init_boot",
    "vendor_boot",
    "recovery",
    "dtbo",
    "vbmeta",
    "vbmeta_system",
    "vbmeta_vendor",
    "dtb",
    "super",
] as const;

const FastbootPartitionPage: React.FC = () => {
    const { selectedDevice } = useDevice();

    const [imagePath, setImagePath] = useState("");
    const [partition, setPartition] = useState<string>("boot");
    const [erasePartitionName, setErasePartitionName] = useState<string>("dtbo");
    const [output, setOutput] = useState("");
    const [autoScroll, setAutoScroll] = useState(true);
    const [running, setRunning] = useState(false);
    const outputRef = useRef<HTMLPreElement | null>(null);

    const serial = selectedDevice?.serialNumber;

    useEffect(() => {
        if (!autoScroll) return;
        const el = outputRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [output, autoScroll]);

    const detectFastboot = async () => {
        if (!serial) return setOutput((p) => p + "\n(无设备)\n");
        const res = await window.electronAPI.device.detectMode(serial);
        setOutput((p) => p + `\n检测连接: ${res.message}\n`);
    };

    const pickImage = async () => {
        const file = await window.electronAPI.fs.selectFile([
            { name: "Image", extensions: ["img", "bin", "img.ext4", "mbn"] },
            { name: "All", extensions: ["*"] },
        ] as any);
        if (!file) {
            setOutput((p) => p + "\n(已取消选择文件)\n");
            return;
        }
        setImagePath(file as unknown as string);
        setOutput((p) => p + `\n已选择镜像: ${file}\n`);
    };

    const runFlash = async () => {
        if (!serial) {
            setOutput((p) => p + "\n(无设备)\n");
            return;
        }
        if (!imagePath) {
            setOutput((p) => p + "\n请先选择镜像文件\n");
            return;
        }
        if (!partition) {
            setOutput((p) => p + "\n请先填写分区名称\n");
            return;
        }
        // 友好提示当前连接模式
        try {
            const mode = await window.electronAPI.device.detectMode(serial);
            if (mode.mode !== "fastboot") {
                setOutput((p) => p + `\n提示: 当前为 ${mode.mode} 模式，可能导致命令失败\n`);
            }
        } catch { }
        setRunning(true);
        setOutput((p) => p + `\n$ fastboot -s ${serial} flash ${partition} ${imagePath}\n`);
        const { code, output } = await window.electronAPI.fastboot.flash(
            serial,
            partition,
            imagePath
        );
        setOutput((p) => p + output + `\n(exit ${code})\n`);
        setRunning(false);
    };

    const runErase = async () => {
        if (!serial) {
            setOutput((p) => p + "\n(无设备)\n");
            return;
        }
        if (!erasePartitionName) {
            setOutput((p) => p + "\n请先填写要擦除的分区名称\n");
            return;
        }
        try {
            const mode = await window.electronAPI.device.detectMode(serial);
            if (mode.mode !== "fastboot") {
                setOutput((p) => p + `\n提示: 当前为 ${mode.mode} 模式，可能导致命令失败\n`);
            }
        } catch { }
        setRunning(true);
        setOutput((p) => p + `\n$ fastboot -s ${serial} erase ${erasePartitionName}\n`);
        const { code, output } = await window.electronAPI.fastboot.erase(
            serial,
            erasePartitionName
        );
        setOutput((p) => p + output + `\n(exit ${code})\n`);
        setRunning(false);
    };

    const getvar = async (name: string) => {
        if (!serial) return setOutput((p) => p + "\n(无设备)\n");
        const { code, output: out } = await window.electronAPI.fastboot.getvar(
            serial,
            name
        );
        setOutput((p) => p + `$ fastboot -s ${serial} getvar ${name}\n` + out + `\n(exit ${code})\n`);
    };

    return (
        <div className="h-full overflow-auto p-6 bg-gray-50 dark:bg-dark-bg-primary transition-colors duration-200">
            <div className="mx-auto max-w-5xl">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary transition-colors duration-200">Fastboot 分区管理</h2>
                    <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1 transition-colors duration-200">刷入/擦除分区镜像，仅适用于 Fastboot 模式。</p>
                </div>

                {/* 设备选择器 */}
                <div className="mb-6">
                    <DeviceSelector
                        title="选择Fastboot设备"
                        className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700"
                    />
                    <div className="mt-3 flex justify-center">
                        <button
                            onClick={detectFastboot}
                            className="px-4 py-2 bg-orange-600 dark:bg-orange-700 text-white rounded-lg hover:bg-orange-700 dark:hover:bg-orange-800 flex items-center gap-2 transition-colors duration-200"
                        >
                            <BoltIcon className="w-4 h-4" />
                            检测 Fastboot 模式
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                    {/* 左：刷入区 */}
                    <div className="lg:col-span-2 space-y-4">
                        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border shadow-sm p-4 space-y-3 transition-colors duration-200">
                            <div className="text-sm text-gray-700 dark:text-dark-text-primary font-medium transition-colors duration-200">预制分区刷入</div>
                            <div className="flex flex-wrap gap-2">
                                {COMMON_PARTITIONS.map((p) => (
                                    <button
                                        key={p}
                                        className={`px-2 py-1 text-xs rounded-md border transition-colors duration-200 ${partition === p ? "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400" : "border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-secondary hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary/50"}`}
                                        onClick={() => setPartition(p)}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-dark-text-secondary transition-colors duration-200">选择镜像文件</div>
                            <div className="flex gap-2">
                                <input
                                    className="flex-1 border border-gray-300 dark:border-dark-border rounded-lg px-3 py-2 bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary transition-colors duration-200"
                                    placeholder="选择分区镜像文件 (.img/.bin)"
                                    value={imagePath}
                                    onChange={(e) => setImagePath(e.target.value)}
                                />
                                <button className="px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary/50 flex items-center gap-2 text-gray-700 dark:text-dark-text-secondary transition-colors duration-200" onClick={pickImage}>
                                    <FolderOpenIcon className="w-4 h-4" /> 选择
                                </button>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    className={`px-4 py-2 rounded-lg text-white transition ${running ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"} disabled:opacity-50 disabled:cursor-not-allowed`}
                                    onClick={runFlash}
                                    disabled={running || !imagePath}
                                    title="刷入所选镜像到当前分区"
                                >
                                    <BoltIcon className="w-4 h-4 inline mr-1" /> 刷入 {partition}
                                </button>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border shadow-sm p-4 space-y-3 transition-colors duration-200">
                            <div className="text-sm text-gray-700 dark:text-dark-text-primary font-medium transition-colors duration-200">自定义分区镜像刷入</div>
                            <div className="flex gap-2">
                                <input
                                    className="flex-1 border rounded-lg px-3 py-2"
                                    placeholder="分区名称，如: system_a"
                                    value={partition}
                                    onChange={(e) => setPartition(e.target.value)}
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    className={`px-4 py-2 rounded-lg text-white transition ${running ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"} disabled:opacity-50 disabled:cursor-not-allowed`}
                                    onClick={runFlash}
                                    disabled={running || !imagePath || !partition}
                                >
                                    刷入
                                </button>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border shadow-sm p-4 space-y-3 transition-colors duration-200">
                            <div className="text-sm text-gray-700 dark:text-dark-text-primary font-medium transition-colors duration-200">分区擦除</div>
                            <div className="flex gap-2">
                                <input
                                    className="flex-1 border rounded-lg px-3 py-2"
                                    placeholder="分区名称，如: metadata"
                                    value={erasePartitionName}
                                    onChange={(e) => setErasePartitionName(e.target.value)}
                                />
                                <button
                                    className="px-3 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    onClick={runErase}
                                    disabled={running || !erasePartitionName}
                                >
                                    <TrashIcon className="w-4 h-4" /> 擦除
                                </button>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border shadow-sm p-4 space-y-3 transition-colors duration-200">
                            <div className="text-sm text-gray-700 dark:text-dark-text-primary font-medium transition-colors duration-200">常用查询</div>
                            <div className="flex flex-wrap gap-2">
                                {(["product", "current-slot", "is-userspace"] as const).map((v) => (
                                    <button key={v} className="px-3 py-1.5 text-xs rounded-md border border-gray-300 hover:bg-gray-50" onClick={() => getvar(v)}>
                                        getvar {v}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 右：输出区 */}
                    <div className="lg:col-span-3">
                        <div className="bg-[#0b0f16] rounded-xl border border-gray-800 shadow-inner flex flex-col h-[70vh]">
                            <div className="px-4 py-2 text-xs text-gray-400 border-b border-gray-800 flex items-center justify-between">
                                <div>输出</div>
                                <div className="flex items-center gap-2">
                                    <button
                                        className="px-2 py-1 rounded border border-gray-700 text-gray-300 hover:bg-gray-800 text-xs"
                                        onClick={() => navigator.clipboard?.writeText(output)}
                                        disabled={!output}
                                    >
                                        复制
                                    </button>
                                    <button
                                        className="px-2 py-1 rounded border border-gray-700 text-gray-300 hover:bg-gray-800 text-xs"
                                        onClick={() => setOutput("")}
                                        disabled={running}
                                    >
                                        清空
                                    </button>
                                    <label className="inline-flex items-center gap-1 text-xs text-gray-300">
                                        <input type="checkbox" className="accent-blue-500" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
                                        自动滚动
                                    </label>
                                </div>
                            </div>
                            <pre ref={outputRef} className="text-[13px] leading-6 text-green-200 p-4 overflow-auto whitespace-pre-wrap break-words flex-1">
                                {output || "(无输出)"}
                            </pre>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FastbootPartitionPage;
