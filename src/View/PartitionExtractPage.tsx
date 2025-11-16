import React, { useState } from "react";
import {
    LinkIcon,
    FolderOpenIcon,
    ArrowDownTrayIcon,
    TrashIcon,
    ClipboardIcon,
    AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/outline";

const commonPartitions = [
    "boot",
    "init_boot",
    "vendor_boot",
    "recovery",
    "dtbo",
    "vbmeta",
    "system",
    "vendor",
    "product",
    "system_ext",
];

const safeJoin = (dir: string, name: string) => {
    const sep = dir.includes("/") ? "/" : "\\";
    return `${dir.replace(/[\\/]+$/, "")}${sep}${name}`;
};

const PartitionExtractPage: React.FC = () => {
    const [urlOrPath, setUrlOrPath] = useState("");
    const [partition, setPartition] = useState("boot");
    const [output, setOutput] = useState("");
    const [log, setLog] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [timeoutMs, setTimeoutMs] = useState<number>(600000);
    const [verify, setVerify] = useState<boolean>(false);

    const append = (m: string) => setLog((l) => [...l, m]);
    const clearLog = () => setLog([]);
    const copyLog = async () => {
        try {
            await navigator.clipboard.writeText(log.join("\n"));
            append("已复制日志到剪贴板");
        } catch {
            append("复制失败，请手动选择");
        }
    };

    const pickFile = async () => {
        const p = await window.electronAPI.fs.selectFile([
            { name: "ZIP / Image / APK / payload", extensions: ["zip", "img", "bin", "apk", "*" as any] },
        ]);
        if (p) setUrlOrPath(p);
    };

    const pickOutput = async () => {
        const dir = await window.electronAPI.fs.selectDirectory();
        if (dir) setOutput(safeJoin(dir, `${partition}.img`));
    };

    const run = async () => {
        if (!urlOrPath || !partition || !output) {
            append("请填写完整参数");
            return;
        }
        setBusy(true);
        append(`开始提取: ${partition}`);
        try {
            const res = await window.electronAPI.ota.customExtract(
                urlOrPath,
                partition,
                output,
                { timeout: timeoutMs, verify }
            );
            if (res.success) append(`✅ 成功: ${output}`);
            else append(`❌ 失败: ${res.error}`);
        } catch (e) {
            append(`❌ 异常: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="h-full overflow-auto p-6 bg-gray-50 dark:bg-dark-bg-primary transition-colors duration-200">
            {/* 标题区，与其他页面保持一致留出齿轮空间 */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary mb-2 transition-colors duration-200">分区提取</h1>
                <p className="text-gray-600 dark:text-dark-text-secondary transition-colors duration-200">兼容 URL / 本地 ZIP / payload.bin / 直链文件</p>
            </div>

            {/* 表单卡片 */}
            <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-5 transition-colors duration-200">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    {/* URL/路径 */}
                    <label className="md:col-span-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary flex items-center gap-2 transition-colors duration-200">
                        <LinkIcon className="w-4 h-4" /> URL 或 本地路径
                    </label>
                    <input
                        className="md:col-span-8 border border-gray-300 dark:border-dark-border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary transition-colors duration-200"
                        value={urlOrPath}
                        onChange={(e) => setUrlOrPath(e.target.value)}
                        placeholder="https://... 或 D:\\firmware\\ota.zip"
                        disabled={busy}
                    />
                    <div className="md:col-span-2 flex gap-2">
                        <button
                            onClick={pickFile}
                            disabled={busy}
                            className="px-3 py-2 bg-gray-100 dark:bg-dark-bg-tertiary text-gray-800 dark:text-dark-text-primary rounded-lg border border-gray-300 dark:border-dark-border hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary/70 flex items-center gap-2 disabled:opacity-50 transition-colors duration-200"
                        >
                            <FolderOpenIcon className="w-4 h-4" /> 选择本地
                        </button>
                    </div>

                    {/* 分区名与常用分区 */}
                    <label className="md:col-span-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary transition-colors duration-200">分区名称</label>
                    <div className="md:col-span-10 grid grid-cols-1 gap-2">
                        <input
                            className="border border-gray-300 dark:border-dark-border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary transition-colors duration-200"
                            value={partition}
                            onChange={(e) => setPartition(e.target.value)}
                            placeholder="boot / vendor_boot / init_boot / ..."
                            disabled={busy}
                        />
                        <div className="flex flex-wrap gap-2">
                            {commonPartitions.map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => {
                                        setPartition(p);
                                        if (output) {
                                            const d = output.replace(/[\\/][^\\/]*$/, "");
                                            if (d) setOutput(safeJoin(d, `${p}.img`));
                                        }
                                    }}
                                    className={`px-2.5 py-1.5 rounded-full text-xs border transition-colors duration-200 ${partition === p
                                        ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700"
                                        : "bg-white dark:bg-dark-bg-primary text-gray-700 dark:text-dark-text-secondary border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary/50"
                                        }`}
                                    disabled={busy}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 输出路径 */}
                    <label className="md:col-span-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary transition-colors duration-200">输出路径</label>
                    <input
                        className="md:col-span-8 border border-gray-300 dark:border-dark-border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary transition-colors duration-200"
                        value={output}
                        onChange={(e) => setOutput(e.target.value)}
                        placeholder="D:\\output\\boot.img"
                        disabled={busy}
                    />
                    <div className="md:col-span-2 flex gap-2">
                        <button
                            onClick={pickOutput}
                            disabled={busy}
                            className="px-3 py-2 bg-gray-100 text-gray-800 rounded-lg border hover:bg-gray-200 flex items-center gap-2 disabled:opacity-50"
                        >
                            <FolderOpenIcon className="w-4 h-4" /> 选择目录
                        </button>
                    </div>
                </div>

                {/* 高级选项 */}
                <div className="mt-4">
                    <button
                        onClick={() => setShowAdvanced((s) => !s)}
                        className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-2"
                    >
                        <AdjustmentsHorizontalIcon className="w-4 h-4" /> {showAdvanced ? "隐藏高级选项" : "显示高级选项"}
                    </button>
                    {showAdvanced && (
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                            <label className="md:col-span-2 text-sm text-gray-700">超时 (ms)</label>
                            <input
                                type="number"
                                className="md:col-span-4 border border-gray-300 rounded-lg px-3 py-2"
                                value={timeoutMs}
                                onChange={(e) => setTimeoutMs(Number(e.target.value) || 0)}
                                disabled={busy}
                            />
                            <label className="md:col-span-2 text-sm text-gray-700">校验完整性</label>
                            <div className="md:col-span-4">
                                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={verify}
                                        onChange={(e) => setVerify(e.target.checked)}
                                        disabled={busy}
                                    />
                                    启用（可能增加耗时）
                                </label>
                            </div>
                        </div>
                    )}
                </div>

                {/* 操作区 */}
                <div className="mt-5 flex items-center gap-3">
                    <button
                        className={`px-4 py-2 rounded-lg text-white flex items-center gap-2 ${busy ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"
                            } disabled:opacity-50`}
                        onClick={run}
                        disabled={busy}
                    >
                        <ArrowDownTrayIcon className="w-4 h-4" />
                        {busy ? "处理中..." : "开始提取"}
                    </button>
                    <button
                        onClick={clearLog}
                        disabled={busy || log.length === 0}
                        className="px-3 py-2 bg-gray-100 text-gray-800 rounded-lg border hover:bg-gray-200 flex items-center gap-2 disabled:opacity-50"
                    >
                        <TrashIcon className="w-4 h-4" /> 清空日志
                    </button>
                    <button
                        onClick={copyLog}
                        disabled={log.length === 0}
                        className="px-3 py-2 bg-gray-100 text-gray-800 rounded-lg border hover:bg-gray-200 flex items-center gap-2 disabled:opacity-50"
                    >
                        <ClipboardIcon className="w-4 h-4" /> 复制日志
                    </button>
                    {busy && (
                        <div className="ml-2 inline-flex items-center gap-2 text-sm text-gray-500">
                            <span className="inline-block w-3 h-3 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                            正在处理，请稍候...
                        </div>
                    )}
                </div>
            </div>

            {/* 提示卡片 */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4 transition-colors duration-200">
                    <div className="text-sm text-gray-700 dark:text-dark-text-primary font-medium mb-2 transition-colors duration-200">使用提示</div>
                    <ul className="text-sm text-gray-600 dark:text-dark-text-secondary list-disc pl-5 space-y-1 transition-colors duration-200">
                        <li>OTA 包请直接选择 ZIP 或粘贴下载链接。</li>
                        <li>2SI/GKI 设备通常修补 init_boot 或 vendor_boot。</li>
                        <li>输出目录建议选择非系统盘、避免空格与特殊字符。</li>
                    </ul>
                </div>
                <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4 transition-colors duration-200">
                    <div className="text-sm text-gray-700 dark:text-dark-text-primary font-medium mb-2 transition-colors duration-200">日志</div>
                    <pre className="bg-gray-50 dark:bg-dark-bg-primary border border-gray-200 dark:border-dark-border rounded p-2 text-xs max-h-56 overflow-auto whitespace-pre-wrap break-all text-gray-900 dark:text-dark-text-primary transition-colors duration-200">
                        {log.length ? log.join("\n") : "暂无日志"}
                    </pre>
                </div>
            </div>
        </div>
    );
};

export default PartitionExtractPage;
