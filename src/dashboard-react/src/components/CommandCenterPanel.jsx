import React, { useState } from 'react';
import { Shield, Unlock, Lightbulb, DownloadCloud, TerminalSquare, Flame, DoorOpen, DoorClosed, PanelRightClose, PanelRightOpen } from 'lucide-react';

export default function CommandCenterPanel({ activeNodes, sendCommand }) {
    const nodes = Object.values(activeNodes);
    const [collapsed, setCollapsed] = useState(false);

    if (collapsed) {
        return (
            <button
                onClick={() => setCollapsed(false)}
                className="bg-gray-900/90 text-blue-400 border border-blue-500/50 rounded-l-xl shadow-2xl backdrop-blur-sm pointer-events-auto px-2 py-4 flex flex-col items-center gap-2 hover:bg-gray-800 transition"
                title="Buka Command Center"
            >
                <PanelRightOpen size={18} />
                <span className="text-[10px] font-bold [writing-mode:vertical-rl] tracking-wider">COMMAND CENTER</span>
            </button>
        );
    }

    return (
        <div className="bg-gray-900/90 p-5 rounded-xl border border-blue-500/50 pointer-events-auto shadow-2xl backdrop-blur-sm w-96 max-h-[85vh] overflow-y-auto flex flex-col pointer-events-auto">
            <h2 className="text-xl font-bold text-blue-400 mb-4 border-b border-blue-500/30 pb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2"><TerminalSquare size={20} /> Command Center</span>
                <button
                    onClick={() => setCollapsed(true)}
                    className="text-gray-400 hover:text-white transition"
                    title="Minimize Command Center"
                >
                    <PanelRightClose size={18} />
                </button>
            </h2>

            <div className="space-y-4 flex-1">
                {nodes.length === 0 ? (
                    <div className="text-center text-gray-500 text-sm py-10">Belum ada data sensor.</div>
                ) : (
                    nodes.map(n => (
                        <div key={n.id} className="bg-black/60 p-3 rounded-lg border border-gray-700">
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-mono font-bold text-white">{n.id}</span>
                                <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded bg-gray-800 ${n.status === 'online' ? 'text-green-400' : 'text-red-400'}`}>
                                    {n.status || 'ONLINE'}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] mb-3">
                                <div className="text-gray-400">Versi: <span className="text-white font-mono">{n.fw_version || 'UNKNOWN'}</span></div>
                                <div className="text-gray-400">OTA: <span className={`font-mono ${n.ota_status && n.ota_status.includes('ERROR') ? 'text-red-500' : (n.ota_status === 'IDLE' ? 'text-gray-400' : 'text-yellow-400 animate-pulse')}`}>{n.ota_status || 'IDLE'}</span></div>
                                <div className="text-gray-400">Latensi: <span className="text-white">{n.latency_ms || 0} ms</span></div>
                                <div className="text-gray-400">Sensor: <span className={n.sensor_ok !== false ? 'text-green-400' : 'text-red-500'}>{n.sensor_ok !== false ? 'OK' : 'FAIL'}</span></div>
                                <div className="text-gray-400">Valve: <span className={n.valve_status === 'DISABLED' ? 'text-red-500' : 'text-green-400'}>{n.valve_status || 'UNKNOWN'}</span></div>
                                <div className="text-gray-400">Pintu: <span className={n.door_status === 'LOCKED' ? 'text-yellow-400' : 'text-green-400'}>{n.door_status || 'UNAVAILABLE'}</span></div>
                            </div>
                            {n.gas_alert && (
                                <div className="flex items-center gap-1 text-[10px] font-bold text-orange-300 bg-orange-900/50 border border-orange-600 rounded px-2 py-1 mb-2">
                                    <Flame size={12} /> KEBOCORAN GAS TERDETEKSI{typeof n.gas_raw === 'number' ? ` (${n.gas_raw})` : ''}
                                </div>
                            )}

                            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Valve Gas/Air</p>
                            <div className="flex gap-2 mb-3">
                                <button onClick={() => sendCommand('disable_valve', n.id)} className="flex-1 flex justify-center items-center gap-1 bg-red-900/50 hover:bg-red-700 text-red-200 text-[10px] py-1.5 rounded border border-red-700 transition">
                                    <Shield size={12} /> Lock
                                </button>
                                <button
                                    onClick={() => {
                                        if (!n.gas_alert || confirm(`Node ${n.id} masih melaporkan kebocoran gas. Pastikan area sudah AMAN sebelum membuka valve kembali. Lanjutkan?`)) {
                                            sendCommand('enable_valve', n.id);
                                        }
                                    }}
                                    className="flex-1 flex justify-center items-center gap-1 bg-green-900/50 hover:bg-green-700 text-green-200 text-[10px] py-1.5 rounded border border-green-700 transition"
                                >
                                    <Unlock size={12} /> Unlock
                                </button>
                            </div>

                            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Pintu (Solenoid Door Lock)</p>
                            <div className="flex gap-2 mb-3">
                                <button onClick={() => sendCommand('lock_door', n.id)} className="flex-1 flex justify-center items-center gap-1 bg-yellow-900/50 hover:bg-yellow-700 text-yellow-200 text-[10px] py-1.5 rounded border border-yellow-700 transition">
                                    <DoorClosed size={12} /> Lock
                                </button>
                                <button onClick={() => sendCommand('unlock_door', n.id)} className="flex-1 flex justify-center items-center gap-1 bg-green-900/50 hover:bg-green-700 text-green-200 text-[10px] py-1.5 rounded border border-green-700 transition">
                                    <DoorOpen size={12} /> Unlock
                                </button>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => sendCommand('identify', n.id)} className="flex-1 flex justify-center items-center gap-1 bg-gray-800 hover:bg-gray-600 text-white text-[10px] py-1.5 rounded border border-gray-600 transition">
                                    <Lightbulb size={12} /> Identify
                                </button>
                                <button onClick={() => sendCommand('force_update', n.id)} className="flex-1 flex justify-center items-center gap-1 bg-blue-900/50 hover:bg-blue-700 text-blue-200 text-[10px] py-1.5 rounded border border-blue-700 transition">
                                    <DownloadCloud size={12} /> OTA
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-700">
                <button onClick={() => sendCommand('force_update', 'all')} className="w-full flex justify-center items-center gap-2 bg-purple-900/50 hover:bg-purple-700 text-purple-200 text-xs py-2.5 rounded border border-purple-700 transition font-bold">
                    <DownloadCloud size={14} /> UPDATE SEMUA NODE (GLOBAL)
                </button>
            </div>
        </div>
    );
}
