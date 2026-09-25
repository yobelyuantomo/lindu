import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useMqtt } from './hooks/useMqtt';
import MapPanel from './components/MapPanel';
import TopOverlay from './components/TopOverlay';
import HistorySidebar from './components/HistorySidebar';
import AlarmBanner from './components/AlarmBanner';
import GasAlertBanner from './components/GasAlertBanner';
import LocalShakeToast from './components/LocalShakeToast';
import NodeDetailModal from './components/NodeDetailModal';
import CommandCenterPanel from './components/CommandCenterPanel';

function App() {
  const { isConnected, activeNodes, quakeDatabase, liveAlarm, setLiveAlarm, localMode, setLocalMode, localShakeEvents, mlPredictions, sendCommand } = useMqtt();
  const [selectedQuake, setSelectedQuake] = useState(null);
  const [focusedNode, setFocusedNode] = useState(null);
  const [detailNode, setDetailNode] = useState(null);
  const [flyToUserTrigger, setFlyToUserTrigger] = useState(0);
  
  const [userLat, setUserLat] = useState(35.6895);
  const [userLon, setUserLon] = useState(139.6917);
  const [locationName, setLocationName] = useState("Tokyo, Japan");

  // Koordinat node sensor (ESP) yang tersimpan, dipakai sebagai sumber lokasi utama
  const nodeCoord = useMemo(() => {
    const node = Object.values(activeNodes).find(
      (n) => typeof n.lat === 'number' && typeof n.lon === 'number' && Number.isFinite(n.lat) && Number.isFinite(n.lon)
    );
    return node ? { lat: node.lat, lon: node.lon } : null;
  }, [activeNodes]);

  const hasNodeCoord = useRef(false);

  // Prioritas 1: pakai lat/lon dari node ESP yang sudah terdaftar
  useEffect(() => {
    if (nodeCoord) {
      hasNodeCoord.current = true;
      setUserLat(nodeCoord.lat);
      setUserLon(nodeCoord.lon);
    }
  }, [nodeCoord]);

  // Prioritas 2: fallback ke lokasi browser HANYA jika belum ada node ESP yang melapor
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!hasNodeCoord.current) {
            setUserLat(pos.coords.latitude);
            setUserLon(pos.coords.longitude);
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, []);

  useEffect(() => {
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLat}&lon=${userLon}&zoom=10`)
      .then(res => res.json())
      .then(data => {
        if (data && data.address) {
          const city = data.address.city || data.address.town || data.address.state || "Lokasi Tidak Diketahui";
          const country = data.address.country || "";
          setLocationName(`${city}, ${country}`);
        }
      })
      .catch(() => setLocationName("Lokasi Aktif"));
  }, [userLat, userLon]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-900 font-sans antialiased text-white">
      <MapPanel 
        activeNodes={activeNodes} 
        focusedNode={focusedNode}
        displayQuake={liveAlarm || selectedQuake || (quakeDatabase.length > 0 ? quakeDatabase[0] : null)} 
        quakeDatabase={quakeDatabase} 
        userLat={userLat}
        userLon={userLon}
        flyToUserTrigger={flyToUserTrigger}
      />

      {/* Left Sidebar Layout */}
      <div className="absolute left-6 top-6 bottom-6 w-80 flex flex-col gap-4 z-[1000] pointer-events-none">
        <TopOverlay
          isConnected={isConnected}
          activeNodesCount={Object.keys(activeNodes).length}
          locationName={locationName}
          onFlyToLocation={() => setFlyToUserTrigger((n) => n + 1)}
        />
        <HistorySidebar 
          history={quakeDatabase} 
          activeNodes={activeNodes}
          onSelectQuake={setSelectedQuake} 
          onFocusNode={setFocusedNode}
          onOpenDetail={setDetailNode}
        />
      </div>
      

      {/* Right Sidebar Layout */}
      <div className="absolute right-6 top-6 bottom-6 flex flex-col gap-4 z-[1000] pointer-events-none items-end">
        <CommandCenterPanel 
          activeNodes={activeNodes} 
          sendCommand={sendCommand} 
        />
      </div>
      
      <LocalShakeToast events={localShakeEvents} />

      <GasAlertBanner activeNodes={activeNodes} sendCommand={sendCommand} />

      <AlarmBanner
        liveAlarm={liveAlarm}
        userLat={userLat}
        userLon={userLon}
        onDismiss={() => {
          // "Abaikan Peringatan" harus mengembalikan aktuator ke kondisi normal juga,
          // bukan cuma menutup banner - trigger_siren memaksa valve terkunci tertutup
          // dan pintu terbuka (evakuasi), dan itu tidak pernah reset sendiri.
          // HARUS pakai cancel_alarm (bukan enable_valve+lock_door terpisah): selama
          // window global_alarm_until masih aktif, firmware memaksa is_door_locked=false
          // di setiap loop tick, jadi lock_door langsung ditimpa balik dalam ~20ms.
          // cancel_alarm menol-kan global_alarm_until secara atomik agar reset permanen.
          sendCommand('cancel_alarm');
          setLiveAlarm(null);
        }}
      />

      {detailNode && (
        <NodeDetailModal 
          nodeId={detailNode} 
          nodeData={activeNodes[detailNode]} 
          mlPrediction={mlPredictions[detailNode]} 
          quakeDatabase={quakeDatabase} 
          onClose={() => setDetailNode(null)} 
        />
      )}
    </div>
  );
}

export default App;
