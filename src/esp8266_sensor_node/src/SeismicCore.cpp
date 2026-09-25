#include "SeismicCore.h"
#include <math.h>

void SeismicCore::reset() {
    _dc_x = _dc_y = _dc_z = 0.0f;
    _is_calibrated = false;
    _is_first_read = true;
    _zcr_count = 0;
    _last_dyn_z = 0.0f;
    _zcr_timer = 0;
    _current_hz = 0;
    _sta_ema = 0.0f;
    _lta_ema = 0.0f;
    _telemetry_last_send = 0;
}

SeismicReading SeismicCore::update(float ax, float ay, float az, unsigned long now_ms) {
    SeismicReading r = {0.0f, 0.0f, 0, 0.0f, 0.0f, 0.0f, 0.0f};

    // Pembacaan pertama dipakai sebagai titik awal filter DC, supaya vektor
    // gravitasi tidak perlu meluruh dari nol — yang akan tampak seperti
    // guncangan hebat selama beberapa detik pertama setelah boot.
    if (_is_first_read) {
        _dc_x = ax;
        _dc_y = ay;
        _dc_z = az;
        _is_first_read = false;
        _is_calibrated = true;
    }

    _dc_x = (ax * SEIS_ALPHA_DC) + (_dc_x * (1.0f - SEIS_ALPHA_DC));
    _dc_y = (ay * SEIS_ALPHA_DC) + (_dc_y * (1.0f - SEIS_ALPHA_DC));
    _dc_z = (az * SEIS_ALPHA_DC) + (_dc_z * (1.0f - SEIS_ALPHA_DC));

    if (!_is_calibrated) return r;

    float dyn_x = ax - _dc_x;
    float dyn_y = ay - _dc_y;
    float dyn_z = az - _dc_z;

    // Zero-crossing pada sumbu Z. Dibagi dua karena satu siklus penuh
    // melintasi nol dua kali.
    if ((dyn_z > 0 && _last_dyn_z <= 0) || (dyn_z < 0 && _last_dyn_z >= 0))
        _zcr_count++;
    _last_dyn_z = dyn_z;

    if (now_ms - _zcr_timer >= SEIS_ZCR_WINDOW_MS) {
        _current_hz = _zcr_count / 2;
        _zcr_count = 0;
        _zcr_timer = now_ms;
    }

    float sq = dyn_x * dyn_x + dyn_y * dyn_y + dyn_z * dyn_z;
    float pga = sqrtf(sq) / 9.81f;
    float energy = pga * pga;
    float rms = sqrtf(sq / 3.0f) / 9.81f;

    _sta_ema = (energy * SEIS_ALPHA_STA) + (_sta_ema * (1.0f - SEIS_ALPHA_STA));
    _lta_ema = (energy * SEIS_ALPHA_LTA) + (_lta_ema * (1.0f - SEIS_ALPHA_LTA));

    float safe_lta = _lta_ema < SEIS_LTA_FLOOR ? SEIS_LTA_FLOOR : _lta_ema;

    r.pga = pga;
    r.sta_lta = _sta_ema / safe_lta;
    r.freq_hz = _current_hz;
    r.rms = rms;
    r.dyn_x = dyn_x;
    r.dyn_y = dyn_y;
    r.dyn_z = dyn_z;
    return r;
}

bool SeismicCore::shouldPublish(float pga, unsigned long now_ms) {
    bool spike = (pga > SEIS_SPIKE_PGA);
    unsigned long sejak = now_ms - _telemetry_last_send;
    return (spike && sejak >= SEIS_TELEMETRY_FAST_MS) || (sejak >= SEIS_TELEMETRY_SLOW_MS);
}

void SeismicCore::markPublished(unsigned long now_ms) {
    _telemetry_last_send = now_ms;
}

float SeismicCore::tiltAngle() const {
    if (!_is_calibrated) return 0.0f;
    return atan2f(-_dc_x, sqrtf(_dc_y * _dc_y + _dc_z * _dc_z)) * 180.0f / PI;
}

String SeismicCore::pose() const {
    if (!_is_calibrated) return "UNKNOWN";
    float t = fabsf(tiltAngle());
    if (t < 30.0f) return "FLAT";
    if (t > 60.0f) return "WALL";
    return "TILTED";
}
