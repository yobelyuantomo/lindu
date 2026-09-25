import { useState, useEffect, useRef } from 'react';
import mqtt from 'mqtt';

// Sama dengan ambang batas is_earthquake_spike di firmware (SensorManager.cpp)
const LOCAL_SHAKE_PGA_THRESHOLD = 0.12;
// Sama dengan durasi local_alarm_until di firmware (main.cpp), dipakai sebagai cooldown notifikasi per node
const LOCAL_SHAKE_COOLDOWN_MS = 5000;

export function useMqtt() {
  const [client, setClient] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeNodes, setActiveNodes] = useState({});
  const [quakeDatabase, setQuakeDatabase] = useState([]);
  const [liveAlarm, setLiveAlarm] = useState(null);
  const [localMode, setLocalMode] = useState(false);
  const [localShakeEvents, setLocalShakeEvents] = useState([]);
  // Prediksi lapisan ML per node. Kosong selama model belum di-deploy —
  // seluruh komponen yang memakainya harus aman menghadapi undefined.
  const [mlPredictions, setMlPredictions] = useState({});
  const lastShakeFiredAt = useRef({});

  useEffect(() => {
    const host = window.location.hostname || 'localhost';
    
    // Fetch History from PostgreSQL via REST API
    fetch(`http://${host}:5050/api/history`)
      .then(res => res.json())
      .then(data => {
        const formatted = data.reverse().map((q, i) => ({
          id: 'db-' + i + '-' + Date.now(),
          time: q.time,
          lat: q.lat,
          lon: q.lon,
          radius: q.radius,
          magnitude: q.magnitude,
          desc: q.desc,
          triggering_nodes: q.triggering_nodes || q.nodes,
          telemetry_series: {} 
        }));
        setQuakeDatabase(formatted);
      })
      .catch(err => console.error("Gagal mengambil riwayat gempa:", err));

    const mqttClient = mqtt.connect(`ws://${host}:9001`);

    mqttClient.on('connect', () => {
      console.log('Connected to MQTT via WS');
      setIsConnected(true);
      mqttClient.subscribe('lindu/actuator/cmd/all');
      mqttClient.subscribe('lindu/sensor/+/telemetry');
      mqttClient.subscribe('lindu/sensor/+/status');
      mqttClient.subscribe('lindu/sensor/+/event');
      mqttClient.subscribe('lindu/external/alert');
      mqttClient.subscribe('lindu/ml/prediction/+');
    });

    mqttClient.on('message', (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        const parts = topic.split('/');
        
        // Simpan metrics/status
        if (parts[1] === 'sensor' && parts[3] === 'status') {
           const nodeId = parts[2];
           setActiveNodes(prev => ({
              ...prev,
              [nodeId]: {
                  ...prev[nodeId],
                  status: payload.status,
                  fw_version: payload.fw_version,
                  ota_status: payload.ota_status,
                  latency_ms: payload.latency_ms,
                  sensor_ok: payload.sensor_ok
              }
           }));
        }

        if (parts[1] === 'sensor' && parts[3] === 'telemetry') {
          const nodeId = parts[2];
          setActiveNodes(prev => ({
            ...prev,
            [nodeId]: {
              id: nodeId,
              lat: payload.lat,
              lon: payload.lon,
              pga: payload.pga,
              gas_alert: payload.gas_alert ?? false,
              gas_raw: payload.gas_raw ?? null,
              valve_status: payload.valve_status ?? prev[nodeId]?.valve_status ?? 'UNKNOWN',
              door_status: payload.door_status ?? prev[nodeId]?.door_status ?? 'UNAVAILABLE',
              last_seen: Date.now(),
              // Pertahankan data status jika ada
              status: prev[nodeId]?.status || 'online',
              fw_version: prev[nodeId]?.fw_version || 'UNKNOWN',
              ota_status: prev[nodeId]?.ota_status || 'IDLE',
              latency_ms: prev[nodeId]?.latency_ms || 0,
              sensor_ok: prev[nodeId]?.sensor_ok ?? true
            }
          }));

          // Getaran lokal terdeteksi (sama seperti trigger local_alarm di firmware).
          // Notifikasi ini murni deduksi dari nilai PGA, bukan alarm gempa resmi/terkonfirmasi.
          if (payload.pga > LOCAL_SHAKE_PGA_THRESHOLD) {
            const now = Date.now();
            const lastFired = lastShakeFiredAt.current[nodeId] || 0;
            if (now - lastFired > LOCAL_SHAKE_COOLDOWN_MS) {
              lastShakeFiredAt.current[nodeId] = now;
              setLocalShakeEvents(prev => [
                ...prev.slice(-4),
                { id: `${nodeId}-${now}`, nodeId, pga: payload.pga, ts: now }
              ]);
            }
          }
        }

        // Prediksi lapisan ML (lindu/ml/prediction/<node_id>).
        // Sengaja di topik terpisah dari alarm supaya node firmware lama tidak
        // ikut memprosesnya — lihat TOPIC_ML_PREDICTION di consensus.py.
        if (parts[1] === 'ml' && parts[2] === 'prediction') {
          const nodeId = parts[3];
          setMlPredictions(prev => ({
            ...prev,
            [nodeId]: {
              label: payload.label,
              confidence: payload.confidence,
              decision: payload.decision,
              rulePassed: payload.rule_passed,
              shadowMode: payload.shadow_mode,
              modelVersion: payload.model_version,
              ts: payload.ts ? payload.ts * 1000 : Date.now()
            }
          }));
        }

        if (parts[1] === 'actuator' && parts[2] === 'cmd' && parts[3] === 'all') {
          // Hanya payload alarm gempa (trigger_siren) yang memicu/mengisi liveAlarm.
          // Perintah aktuator lain (lock/unlock/identify/dll) tidak boleh menyentuhnya.
          if (payload.cmd === 'trigger_siren') {
            setLiveAlarm((prev) => ({ ...(prev || {}), ...payload }));
          }
        }

      } catch (e) {
        console.error("Parse error:", e);
      }
    });

    setClient(mqttClient);

    return () => {
      mqttClient.end();
    };
  }, []);

  const sendCommand = (cmd, targetNode = 'all') => {
      if (client && isConnected) {
          const payload = JSON.stringify({ cmd, target_node: targetNode });
          client.publish('lindu/actuator/cmd/all', payload);
          console.log(`Sent MQTT Command: ${cmd} to ${targetNode}`);
      } else {
          console.error("Cannot send command, MQTT not connected.");
      }
  };

  return {
    isConnected,
    activeNodes,
    quakeDatabase,
    liveAlarm,
    setLiveAlarm,
    localMode,
    setLocalMode,
    localShakeEvents,
    mlPredictions,
    sendCommand
  };
}
