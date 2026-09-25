import React from 'react';
import { Brain, AlertTriangle, ShieldCheck, EyeOff } from 'lucide-react';

// Ambang yang sama dengan ml/actuator_policy.py di server.
const CONF_WASPADA = 0.75;
const CONF_BAHAYA = 0.90;

const DECISION_LABEL = {
  confirmed: 'Rule-based & ML sepakat gempa',
  suspected_false_positive: 'Rule lolos, ML menyanggah',
  ml_early_detection: 'ML mendeteksi lebih dulu',
  normal: 'Tidak ada indikasi gempa',
  rule_only: 'ML tidak tersedia'
};

function warnaConfidence(confidence) {
  if (confidence == null) return 'text-gray-400';
  if (confidence >= CONF_BAHAYA) return 'text-red-400';
  if (confidence >= CONF_WASPADA) return 'text-orange-400';
  if (confidence >= 0.5) return 'text-yellow-400';
  return 'text-green-400';
}

/**
 * Menampilkan prediksi lapisan ML untuk satu node.
 *
 * Model bisa saja belum pernah di-deploy, jadi komponen ini harus tetap masuk
 * akal saat `prediction` undefined — bukan menghilang begitu saja, melainkan
 * menyatakan bahwa lapisan ML memang belum aktif.
 */
export default function MlPredictionPanel({ prediction }) {
  if (!prediction) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 text-gray-400 text-sm font-semibold mb-1">
          <Brain className="w-4 h-4" /> Lapisan Kecerdasan
        </div>
        <p className="text-gray-500 text-sm">
          Belum ada prediksi. Model belum di-deploy, atau node ini belum pernah
          terpicu sejak server menyala.
        </p>
      </div>
    );
  }

  const { label, confidence, decision, rulePassed, shadowMode, modelVersion, ts } = prediction;
  const gempa = label === 'earthquake';
  const persen = confidence == null ? null : Math.round(confidence * 100);

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-300 text-sm font-semibold">
          <Brain className="w-4 h-4" /> Lapisan Kecerdasan
        </div>
        {shadowMode && (
          <span
            className="flex items-center gap-1 text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded"
            title="Prediksi dicatat tetapi tidak diberi wewenang atas aktuator"
          >
            <EyeOff className="w-3 h-3" /> shadow
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-3">
        <span className={`text-xl font-bold ${gempa ? 'text-red-400' : 'text-green-400'}`}>
          {gempa ? 'GEMPA' : (label || 'tidak diketahui').toUpperCase()}
        </span>
        {persen != null && (
          <span className={`text-lg font-mono ${warnaConfidence(confidence)}`}>
            {persen}%
          </span>
        )}
      </div>

      {persen != null && (
        <div className="w-full bg-gray-700 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full ${
              confidence >= CONF_BAHAYA
                ? 'bg-red-400'
                : confidence >= CONF_WASPADA
                ? 'bg-orange-400'
                : 'bg-yellow-400'
            }`}
            style={{ width: `${persen}%` }}
          />
        </div>
      )}

      <div className="flex items-start gap-2 text-sm">
        {decision === 'suspected_false_positive' ? (
          <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
        ) : (
          <ShieldCheck className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
        )}
        <span className="text-gray-400">{DECISION_LABEL[decision] || decision}</span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 pt-1 border-t border-gray-700">
        <span>Rule-based: {rulePassed ? 'lolos' : 'tidak lolos'}</span>
        {modelVersion && <span>Model: {modelVersion}</span>}
        {ts && <span>{new Date(ts).toLocaleTimeString()}</span>}
      </div>
    </div>
  );
}
