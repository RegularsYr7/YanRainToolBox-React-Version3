import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDevice } from "../hooks/useDevice";
import DeviceSelector from "../components/Device/DeviceSelector";

type QuickCommand = { label: string; cmd: string };
type QuickGroup = { id: string; name: string; items: QuickCommand[]; builtin?: boolean };

const LOCAL_KEY = "commandPage.customGroups.v1";

function uid() {
    return Math.random().toString(36).slice(2, 10);
}

function buildDefaultGroups(): QuickGroup[] {
    return [
        {
            id: "adb",
            name: "ADB 常用",
            builtin: true,
            items: [
                { label: "ADB 设备", cmd: "adb devices" },
                { label: "设备信息", cmd: "adb shell getprop ro.product.model && adb shell getprop ro.build.version.release" },
                { label: "重启系统", cmd: "adb reboot" },
                { label: "进 Fastboot", cmd: "adb reboot bootloader" },
                { label: "授权调试", cmd: "adb kill-server && adb start-server" },
            ],
        },
        {
            id: "fastboot",
            name: "Fastboot 常用",
            builtin: true,
            items: [
                { label: "Fastboot 设备", cmd: "fastboot devices" },
                { label: "重启到系统", cmd: "fastboot reboot" },
                { label: "重启到引导", cmd: "fastboot reboot bootloader" },
            ],
        },
        { id: "custom", name: "自定义", builtin: false, items: [] },
    ];
}

function loadGroups(): QuickGroup[] {
    try {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (!raw) return buildDefaultGroups();
        const parsed = JSON.parse(raw) as QuickGroup[];
        // 合并默认组（避免用户丢失内置组）
        const defaults = buildDefaultGroups();
        const map = new Map(parsed.map((g) => [g.id, g] as const));
        for (const g of defaults) if (!map.has(g.id)) map.set(g.id, g);
        return Array.from(map.values());
    } catch {
        return buildDefaultGroups();
    }
}

function saveGroups(groups: QuickGroup[]) {
    try {
        const keep = groups.filter((g) => !g.builtin || g.id === "custom");
        const defaults = buildDefaultGroups().filter((g) => g.builtin && g.id !== "custom");
        const merged = [
            ...defaults,
            ...keep.filter((g) => g.id !== "custom"),
            groups.find((g) => g.id === "custom")!,
        ].filter(Boolean) as QuickGroup[];
        localStorage.setItem(LOCAL_KEY, JSON.stringify(merged));
    } catch {
        // ignore
    }
}

function injectSerialToCommand(cmd: string, serial: string | undefined, enabled: boolean): string {
    if (!enabled || !serial) return cmd;
    // 已包含 -s 或 --serial 的情况不再注入
    if (/\s-(s|\-\-serial)\s/i.test(cmd)) return cmd;
    const re = /(^|\s)(?:\.\\|\.\/)?(adb|fastboot)(?:\.exe)?(?=\s|$)/i;
    const m = cmd.match(re);
    if (!m || m.index === undefined) return cmd;
    const pos = m.index + m[0].length;
    return cmd.slice(0, pos) + ` -s ${serial}` + cmd.slice(pos);
}

const CommandPage: React.FC = () => {
    const { selectedDevice } = useDevice();
    const [command, setCommand] = useState("adb version");
    const [useToolsCwd, setUseToolsCwd] = useState(true);
    const [replaceTools, setReplaceTools] = useState(false);
    const [autoSerial, setAutoSerial] = useState(true);
    const [running, setRunning] = useState(false);
    const [output, setOutput] = useState("");
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState<number | null>(null);
    const [pid, setPid] = useState<string | null>(null);
    const [showHistory, setShowHistory] = useState<boolean>(false);
    const [autoScroll, setAutoScroll] = useState<boolean>(true);
    const outputRef = useRef<HTMLPreElement | null>(null);

    const [groups, setGroups] = useState<QuickGroup[]>(() => loadGroups());
    const [activeGroupId, setActiveGroupId] = useState<string>(() => loadGroups()[0]?.id ?? "adb");
    const activeGroup = useMemo(() => groups.find((g) => g.id === activeGroupId) ?? groups[0], [groups, activeGroupId]);

    useEffect(() => {
        saveGroups(groups);
    }, [groups]);

    const stop = async () => {
        if (pid) await window.electronAPI.tools.shellKill(pid);
    };

    const run = async () => {
        if (!command.trim()) return;
        setRunning(true);
        setOutput("");
        try {
            // 流式执行
            const toRun = injectSerialToCommand(command, selectedDevice?.serialNumber, autoSerial);
            const { id } = await window.electronAPI.tools.shellRunStream(toRun, {
                useToolsCwd,
                replaceTools,
                timeout: 30 * 60 * 1000,
            });
            setPid(id);
            setOutput(`$ ${toRun}\n\n`);
            const offData = window.electronAPI.tools.onShellData(({ id: got, data }) => {
                if (got !== id) return;
                setOutput((prev) => prev + data);
            });
            const offExit = window.electronAPI.tools.onShellExit(({ id: got, code }) => {
                if (got !== id) return;
                setOutput((prev) => prev + `\n\n(exit ${code ?? ""})`);
                offData();
                offExit();
                setPid(null);
                setRunning(false);
            });
            setHistory((prev) => [command, ...prev.filter((c) => c !== command)].slice(0, 20));
            setHistoryIndex(null);
        } catch (e) {
            setOutput(String(e));
            setRunning(false);
        }
    };

    // 输出自动滚动到底部
    useEffect(() => {
        if (!autoScroll) return;
        const el = outputRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [output, autoScroll]);

    // ESC 停止
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && pid) stop();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pid]);

    return (
        <div className="h-full overflow-auto p-6 bg-gray-50 dark:bg-dark-bg-primary transition-colors duration-200">
            <div className="mx-auto max-w-5xl">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary transition-colors duration-200">命令行执行器</h2>
                    <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1 transition-colors duration-200">默认在当前系统的工具目录下执行（无需写 .\\adb.exe 或 ./adb）。</p>
                </div>

                {/* 设备选择器 */}
                <DeviceSelector
                    title="目标设备"
                    compact={true}
                    className="mb-6"
                />

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                    {/* 左侧：输入/选项/历史 */}
                    <div className="lg:col-span-2 space-y-4">
                        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border shadow-sm p-4 space-y-4 transition-colors duration-200">
                            <div>
                                <div className="text-sm text-gray-600 dark:text-dark-text-secondary mb-1 transition-colors duration-200">输入命令</div>
                                <div className="flex gap-2">
                                    <input
                                        className="flex-1 border border-gray-300 dark:border-dark-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary transition-colors duration-200"
                                        placeholder="例如：adb reboot"
                                        value={command}
                                        onChange={(e) => setCommand(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) run();
                                            if (e.key === "ArrowUp" && history.length) {
                                                const idx = historyIndex ?? -1;
                                                const next = Math.min(idx + 1, history.length - 1);
                                                setHistoryIndex(next);
                                                setCommand(history[next]);
                                            }
                                            if (e.key === "ArrowDown" && history.length) {
                                                const idx = historyIndex ?? 0;
                                                const next = Math.max(idx - 1, -1);
                                                setHistoryIndex(next >= 0 ? next : null);
                                                setCommand(next >= 0 ? history[next] : "");
                                            }
                                        }}
                                    />
                                    <button
                                        className={`px-4 py-2 rounded-lg text-white transition-colors duration-200 ${running ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800"}`}
                                        onClick={run}
                                        disabled={running}
                                        title="Ctrl/Cmd + Enter 也可执行"
                                    >
                                        {running ? "执行中..." : "执行"}
                                    </button>
                                    <button
                                        className={`px-4 py-2 rounded-lg border transition-colors duration-200 ${pid ? "border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20" : "border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-secondary"}`}
                                        onClick={stop}
                                        disabled={!pid}
                                        title="Esc 也可停止"
                                    >
                                        停止
                                    </button>
                                </div>
                                <div className="text-xs text-gray-500 dark:text-dark-text-tertiary mt-1 transition-colors duration-200">提示：Ctrl/Cmd + Enter 执行，Esc 停止</div>
                            </div>

                            {/* 快捷命令分组 */}
                            <div className="space-y-2">
                                <div className="flex flex-wrap gap-2">
                                    {groups.map((g) => (
                                        <button
                                            key={g.id}
                                            className={`px-2 py-1 text-xs rounded-md border ${g.id === activeGroupId
                                                ? "bg-blue-50 border-blue-300 text-blue-700"
                                                : "border-gray-300 text-gray-700 hover:bg-gray-50"
                                                }`}
                                            onClick={() => setActiveGroupId(g.id)}
                                        >
                                            {g.name}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {activeGroup?.items.map((q) => (
                                        <button
                                            key={q.label + q.cmd}
                                            className="px-3 py-1.5 text-xs rounded-md border border-gray-300 hover:bg-gray-50"
                                            onClick={() => setCommand(q.cmd)}
                                            title={q.cmd}
                                        >
                                            {q.label}
                                        </button>
                                    ))}
                                    {activeGroup && !activeGroup.builtin && (
                                        <button
                                            className="px-3 py-1.5 text-xs rounded-md border border-dashed border-gray-300 text-gray-600 hover:bg-gray-50"
                                            onClick={() => {
                                                const label = prompt("快捷命令名称");
                                                if (!label) return;
                                                const cmd = prompt("输入命令，例如: adb shell getprop ro.serialno");
                                                if (!cmd) return;
                                                setGroups((prev) =>
                                                    prev.map((g) => (g.id === activeGroup.id ? { ...g, items: [...g.items, { label, cmd }] } : g))
                                                );
                                            }}
                                        >
                                            + 添加命令
                                        </button>
                                    )}
                                </div>

                                {activeGroup && !activeGroup.builtin && activeGroup.items.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {activeGroup.items.map((q, idx) => (
                                            <button
                                                key={`del-${idx}`}
                                                className="px-2 py-1 text-[11px] rounded-md border border-red-300 text-red-600 hover:bg-red-50"
                                                onClick={() =>
                                                    setGroups((prev) =>
                                                        prev.map((g) => (g.id === activeGroup.id ? { ...g, items: g.items.filter((_, i) => i !== idx) } : g))
                                                    )
                                                }
                                                title={`删除 ${q.label}`}
                                            >
                                                删除 {q.label}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* 自定义分组新增 */}
                                {activeGroupId === "custom" && (
                                    <div className="flex gap-2 pt-1">
                                        <button
                                            className="px-2 py-1 text-xs rounded-md border border-gray-300 hover:bg-gray-50"
                                            onClick={() => {
                                                const name = prompt("新建分组名称");
                                                if (!name) return;
                                                const id = uid();
                                                setGroups((prev) => [...prev, { id, name, items: [], builtin: false }]);
                                                setActiveGroupId(id);
                                            }}
                                        >
                                            + 新建分组
                                        </button>
                                        {activeGroup && activeGroup.id !== "custom" && !activeGroup.builtin && (
                                            <button
                                                className="px-2 py-1 text-xs rounded-md border border-red-300 text-red-600 hover:bg-red-50"
                                                onClick={() => {
                                                    if (!confirm(`删除分组 “${activeGroup.name}”？`)) return;
                                                    setGroups((prev) => prev.filter((g) => g.id !== activeGroup.id));
                                                    setActiveGroupId("adb");
                                                }}
                                            >
                                                删除当前分组
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* 选项 */}
                            <div className="flex items-center gap-4 text-sm text-gray-700 dark:text-dark-text-secondary transition-colors duration-200">
                                <label className="inline-flex items-center gap-2">
                                    <input type="checkbox" checked={useToolsCwd} onChange={(e) => setUseToolsCwd(e.target.checked)} />
                                    在工具目录下执行
                                </label>
                                <label className="inline-flex items-center gap-2">
                                    <input type="checkbox" checked={replaceTools} onChange={(e) => setReplaceTools(e.target.checked)} />
                                    替换工具名为绝对路径
                                </label>
                                <label className="inline-flex items-center gap-2">
                                    <input type="checkbox" checked={!!autoSerial} onChange={(e) => setAutoSerial(e.target.checked)} />
                                    自动注入序列号 -s {selectedDevice?.serialNumber ? `(${selectedDevice.serialNumber})` : "(无设备)"}
                                </label>
                            </div>
                        </div>

                        {/* 历史命令（可折叠） */}
                        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border shadow-sm transition-colors duration-200">
                            <div className="flex items-center justify-between px-4 py-3">
                                <div className="text-sm text-gray-700 dark:text-dark-text-primary transition-colors duration-200">历史命令</div>
                                <button className="text-xs text-blue-600 dark:text-blue-400 hover:underline transition-colors duration-200" onClick={() => setShowHistory((s) => !s)}>
                                    {showHistory ? "收起" : "展开"}
                                </button>
                            </div>
                            {showHistory && (
                                <div className="px-4 pb-3 max-h-64 overflow-auto divide-y divide-gray-100">
                                    {history.length === 0 ? (
                                        <div className="text-xs text-gray-400 py-2">暂无历史</div>
                                    ) : (
                                        history.map((h) => (
                                            <button
                                                key={h}
                                                className="w-full text-left py-2 text-sm hover:bg-gray-50 px-2 rounded"
                                                onClick={() => setCommand(h)}
                                            >
                                                {h}
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 右侧：输出 */}
                    <div className="lg:col-span-3">
                        <div className="bg-[#0b0f16] rounded-xl border border-gray-800 shadow-inner flex flex-col h-[48vh]">
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
                                        <input
                                            type="checkbox"
                                            className="accent-blue-500"
                                            checked={autoScroll}
                                            onChange={(e) => setAutoScroll(e.target.checked)}
                                        />
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

export default CommandPage;
