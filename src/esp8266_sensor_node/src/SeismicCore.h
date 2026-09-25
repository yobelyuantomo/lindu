#ifndef SEISMIC_CORE_H
#define SEISMIC_CORE_H

#include <Arduino.h>

// ============================================================================
//  INTI ALGORITMA SEISMIK — SALINAN PERSIS DARI NODE ESP32
// ============================================================================
//
// Berkas ini menyalin perhitungan di src/esp32_sensor_node/src/SensorManager.cpp.
// Salinan, bukan berbagi kode, karena kedua chip memakai framework yang berbeda
// dan tidak ada cara membagi sumber di antara dua proyek PlatformIO tanpa
// membuat keduanya rapuh.
//
// ----------------------------------------------------------------------------
//  KENAPA KONSTANTA DI BAWAH TIDAK BOLEH BERBEDA SEDIKIT PUN
// ----------------------------------------------------------------------------
// STA/LTA dihitung dengan EMA PER SAMPEL, dan frekuensi dominan dari jumlah
// zero-crossing PER DETIK. Keduanya tidak punya satuan fisik yang mutlak —
// nilainya hanya bermakna relatif terhadap laju sampling yang menghasilkannya.
//
// Kalau node ini men-sampel pada laju berbeda, atau memakai alpha berbeda, ia
// akan melaporkan sta_lta dan freq_hz yang BERBEDA untuk guncangan fisik yang
// SAMA. Akibatnya:
//
//   1. Ambang rule-based (0.12 / 2.0 / 20 Hz) tidak lagi valid untuk node ini.
//   2. Dataset latih tercemar: classifier belajar membedakan MEREK CHIP,
//      bukan membedakan gempa dari getaran biasa.
//
// Yang paling berbahaya, keduanya tidak menimbulkan gejala apa pun. Metriknya
// akan terlihat bagus, dan barulah salah saat dipakai.
//
// Bila SensorManager.cpp di node ESP32 berubah, berkas ini WAJIB ikut diubah.
// Ada pemeriksa otomatis yang membandingkan keduanya:
//   src/server/test_konsistensi_firmware.py
// ============================================================================

//: Jarak antar pembacaan sensor. ESP32: `if (millis() - _last_read_time < 10)`
#define SEIS_SAMPLE_INTERVAL_MS 10

//: Filter EMA untuk memisahkan komponen gravitasi (DC) dari getaran.
#define SEIS_ALPHA_DC 0.002f

//: Bobot EMA energi jangka pendek dan jangka panjang.
#define SEIS_ALPHA_STA 0.1f
#define SEIS_ALPHA_LTA 0.005f

//: Lantai LTA, mencegah pembagian nol saat benar-benar hening.
#define SEIS_LTA_FLOOR 0.00001f

//: Jendela penghitungan zero-crossing.
#define SEIS_ZCR_WINDOW_MS 1000

//: Ambang PGA yang mempercepat pengiriman telemetri.
#define SEIS_SPIKE_PGA 0.12f

//: Laju pengiriman telemetri: cepat saat terpicu, lambat saat tenang.
#define SEIS_TELEMETRY_FAST_MS 100
#define SEIS_TELEMETRY_SLOW_MS 1000

struct SeismicReading {
    float pga;
    float sta_lta;
    int   freq_hz;
    float rms;
    float dyn_x;
    float dyn_y;
    float dyn_z;
};

class SeismicCore {
public:
    void reset();

    // Olah satu pembacaan akselerometer mentah (m/s^2).
    // Pemanggil bertanggung jawab menjaga jarak SEIS_SAMPLE_INTERVAL_MS.
    SeismicReading update(float ax, float ay, float az, unsigned long now_ms);

    // Apakah sudah waktunya mengirim telemetri?
    bool shouldPublish(float pga, unsigned long now_ms);
    void markPublished(unsigned long now_ms);

    float tiltAngle() const;
    String pose() const;
    bool calibrated() const { return _is_calibrated; }

private:
    float _dc_x = 0.0f, _dc_y = 0.0f, _dc_z = 0.0f;
    bool  _is_calibrated = false;
    bool  _is_first_read = true;

    int   _zcr_count = 0;
    float _last_dyn_z = 0.0f;
    unsigned long _zcr_timer = 0;
    int   _current_hz = 0;

    float _sta_ema = 0.0f;
    float _lta_ema = 0.0f;

    unsigned long _telemetry_last_send = 0;
};

#endif
