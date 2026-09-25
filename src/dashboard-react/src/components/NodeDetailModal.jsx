import React from 'react';
import { X, Activity, Signal, Zap, Clock, MapPin, Cpu, CheckCircle } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import MlPredictionPanel from './MlPredictionPanel';

export default function NodeDetailModal({ nodeId, nodeData, quakeDatabase, mlPrediction, onClose }) {
  // Ambil histori gempa spesifik untuk node ini
  const nodeHistory = quakeDatabase.filter(q => q.triggering_nodes?.some(n => n.id === nodeId));
  
  // Data dummy/mock untuk melengkapi UI ala Geoshake
  const uptime = "1h 41m";
  const heap = "8081 KB";
  const firmware = "lindu-esp32-v2";
  const pose = "Flat · 1.2°";
  const currentActivity = "0.016 m/s²";

  // Dummy Chart Data (Helicorder / Noise)
  const chartData = {
    labels: Array.from({ length: 60 }, (_, i) => i),
    datasets: [{
      label: 'Live Activity (RMS)',
      data: Array.from({ length: 60 }, () => Math.random() * 0.05),
      borderColor: '#3b82f6',
      borderWidth: 1,
      tension: 0.1,
      pointRadius: 0
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      y: { display: false, min: 0, max: 0.2 },
      x: { display: false }
    },
    plugins: { legend: { display: false } }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 flex justify-center items-start overflow-y-auto backdrop-blur-sm p-4 md:p-10">
      <div className="bg-gray-900 border border-gray-700 w-full max-w-4xl rounded-xl shadow-2xl flex flex-col relative overflow-hidden">
        
        {/* Header */}
        <div className="bg-gray-800 p-6 flex justify-between items-start border-b border-gray-700">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              Station {nodeId} <span className="text-gray-500 font-normal">· Lindu.id T1</span>
            </h1>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-400">
              <span className="flex items-center gap-1 text-green-400 font-bold bg-green-400/10 px-2 py-1 rounded">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span> online
              </span>
              <span className="flex items-center gap-1"><Signal className="w-4 h-4" /> -74 dBm</span>
              <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> up {uptime}</span>
              <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {nodeData?.lat.toFixed(4)}, {nodeData?.lon.toFixed(4)}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-full transition-colors text-gray-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Main Column */}
          <div className="md:col-span-2 flex flex-col gap-6">
            
            {/* Live Activity Box */}
            <div className="bg-gray-800 rounded-lg p-5 border border-gray-750 shadow-inner">
              <h2 className="text-gray-400 text-sm font-semibold mb-1 uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4" /> Live Activity
              </h2>
              <div className="text-3xl font-mono text-white mb-4">
                Calm <span className="text-gray-500 text-lg">· listening</span>
                <div className="flex gap-6 mt-2">
                  <div>
                    <div className="text-gray-500 text-xs font-sans tracking-wide uppercase">RMS (Energi)</div>
                    <div className="text-blue-400 text-lg font-bold">0.006 <span className="text-sm">G</span></div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs font-sans tracking-wide uppercase">PGA (Puncak)</div>
                    <div className="text-red-400 text-lg font-bold">0.021 <span className="text-sm">G</span></div>
                  </div>
                </div>
              </div>
              <div className="h-24 w-full bg-black/30 rounded border border-gray-700 p-2">
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>

            <MlPredictionPanel prediction={mlPrediction} />


            {/* Helicorder (24 Hours Mockup) */}
            <div className="bg-gray-800 rounded-lg p-5 border border-gray-750">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-gray-400 text-sm font-semibold uppercase tracking-wider">
                  Helicorder
                </h2>
                <div className="text-xs text-gray-500">◀ Last 24 hours ▶</div>
              </div>
              <div className="text-[10px] text-gray-500 mb-2 flex gap-2">
                <span>Each row = 1 hour · newest at bottom</span>
                <span className="ml-auto flex gap-2">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-500/50"></span> light</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-yellow-500/80"></span> moderate</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500"></span> strong</span>
                </span>
              </div>
              
              <div className="flex flex-col gap-[2px] bg-gray-900 p-2 rounded border border-gray-700">
                {Array.from({ length: 24 }).map((_, hourIdx) => (
                  <div key={hourIdx} className="w-full h-2 flex gap-[1px]">
                    {Array.from({ length: 60 }).map((_, minIdx) => {
                      // Generate some synthetic noise
                      let noiseClass = "bg-blue-500/20";
                      
                      // Inject a random moderate earthquake somewhere in the middle of the day
                      if (hourIdx === 14 && minIdx > 20 && minIdx < 23) noiseClass = "bg-yellow-500/80";
                      
                      // Inject a strong earthquake (from history) at a specific time
                      if (hourIdx === 22 && minIdx > 45 && minIdx < 49) noiseClass = "bg-red-500";
                      
                      return <div key={minIdx} className={`flex-1 ${noiseClass}`}></div>;
                    })}
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-gray-500 text-center">
                PGA envelope (1 Hz), not a raw seismogram
              </div>
            </div>

            {/* Recent Activity (Events) */}

            <div className="bg-gray-800 rounded-lg p-5 border border-gray-750">
              <h2 className="text-gray-400 text-sm font-semibold mb-4 uppercase tracking-wider">
                Recent Activity ({nodeHistory.length})
              </h2>
              {nodeHistory.length === 0 ? (
                <div className="text-gray-500 italic py-4 text-center">No catalogued earthquake has come within this station's reach since it came online.</div>
              ) : (
                <div className="space-y-4">
                  {nodeHistory.map((quake, idx) => {
                    const myNode = quake.triggering_nodes.find(n => n.id === nodeId);
                    const severity = myNode.pga > 0.5 ? 'text-red-500' : myNode.pga > 0.2 ? 'text-orange-500' : 'text-yellow-500';
                    const severityText = myNode.pga > 0.5 ? 'strong' : myNode.pga > 0.2 ? 'moderate' : 'light';
                    
                    return (
                      <div key={idx} className="border-l-2 border-gray-600 pl-4 py-2 hover:bg-gray-750/50 transition-colors">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className={`font-bold ${severity} capitalize`}>Local vibration · {severityText}</div>
                            <div className="text-gray-400 text-sm">{quake.time} · M {quake.magnitude}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono text-white bg-gray-700 px-2 py-0.5 rounded text-sm">pga {myNode.pga}</div>
                            <div className="text-gray-500 text-xs mt-1">sta/lta 6.1</div>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-blue-400 flex gap-2">
                          <button className="hover:underline">SAC: [X⬇]</button>
                          <button className="hover:underline">[Y⬇]</button>
                          <button className="hover:underline">[Z⬇]</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column (Tech Specs) */}
          <div className="flex flex-col gap-6">
            <div className="bg-gray-800 rounded-lg p-5 border border-gray-750">
              <h2 className="text-gray-400 text-sm font-semibold mb-4 uppercase tracking-wider flex items-center gap-2">
                <Cpu className="w-4 h-4" /> Technical Details
              </h2>
              <div className="space-y-4 text-sm">
                <div>
                  <div className="text-gray-500 mb-1">Data availability</div>
                  <div className="text-white flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-400"/> 99.9% of the window covered</div>
                </div>
                <div className="pt-3 border-t border-gray-700">
                  <div className="text-gray-500 mb-1">Sensor Pose</div>
                  <div className="text-white">{pose}</div>
                  <div className="text-xs text-gray-500 mt-1">Measured from gravity vector.</div>
                </div>
                <div className="pt-3 border-t border-gray-700">
                  <div className="text-gray-500 mb-1">Firmware</div>
                  <div className="text-white font-mono">{firmware}</div>
                </div>
                <div className="pt-3 border-t border-gray-700">
                  <div className="text-gray-500 mb-1">Free Heap</div>
                  <div className="text-white font-mono">{heap}</div>
                </div>
                <div className="pt-3 border-t border-gray-700">
                  <div className="text-gray-500 mb-1">First Seen</div>
                  <div className="text-white">Today</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
