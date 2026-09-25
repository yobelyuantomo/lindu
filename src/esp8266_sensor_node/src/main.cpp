// Node sensor Lindu-EEW untuk ESP8266 (NodeMCU Amica / v2).
//
// Node ini HANYA sensor: LSM6DS3 (seismik) + BMP280 (atmosfer). Tidak ada
// aktuator, buzzer, NeoPixel, servo, gas, maupun PIR — semuanya tetap di node
// ESP32. Tujuannya satu: menyediakan node kedua supaya validasi fisika
// gelombang-P antar-node bisa berjalan, karena konsensus menolak bekerja
// dengan kurang dari dua node.
//
// Format payload MQTT sengaja dibuat identik dengan node ESP32, sehingga
// ingester, mesin konsensus, dan pipeline ML tidak perlu tahu perbedaan chip.

#include <Arduino.h>
#include <Wire.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266httpUpdate.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <WiFiManager.h>
#include <time.h>

#include "SeismicCore.h"
#include "NodeConfig.h"
#include <Adafruit_LSM6DS3.h>
#include <Adafruit_BMP280.h>

#define CURRENT_VERSION "v1.0.0-esp8266"

static NodeConfig config;
static SeismicCore seismic;
static Adafruit_LSM6DS3 lsm;
static Adafruit_BMP280 bmp;

static WiFiClient net;
static PubSubClient mqtt(net);

static bool sensor_ok = false;
static bool bmp_ok = false;

static unsigned long last_sample = 0;
static unsigned long last_status = 0;
static unsigned long last_reconnect = 0;

// ---------------------------------------------------------------------------
// Waktu
// ---------------------------------------------------------------------------

// Epoch presisi pecahan detik. Server memakainya untuk mengukur selisih waktu
// tiba gelombang antar-node, jadi presisi di bawah satu detik menentukan
// apakah validasi fisika P-Wave masuk akal atau tidak.
static double epochNow() {
    timeval tv;
    gettimeofday(&tv, nullptr);
    return (double)tv.tv_sec + (double)tv.tv_usec / 1000000.0;
}

static void setupTime() {
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    Serial.print(F("[NTP] Menyinkronkan waktu"));
    for (int i = 0; i < 40 && time(nullptr) < 100000; i++) {
        delay(250);
        Serial.print('.');
    }
    Serial.printf("\n[NTP] Epoch sekarang: %.3f\n", epochNow());
}

// ---------------------------------------------------------------------------
// MQTT
// ---------------------------------------------------------------------------

static void publishStatus(const char* status) {
    if (!mqtt.connected()) return;

    char topic[64];
    snprintf(topic, sizeof(topic), "lindu/sensor/%s/status", config.settings.node_id);

    StaticJsonDocument<384> doc;
    doc["status"] = status;
    doc["node_id"] = config.settings.node_id;
    doc["lat"] = config.settings.lat;
    doc["lon"] = config.settings.lon;
    doc["pose"] = seismic.pose();
    doc["tilt_angle"] = seismic.tiltAngle();
    doc["sensor_ok"] = sensor_ok;
    doc["fw_version"] = CURRENT_VERSION;
    doc["ota_status"] = "IDLE";
    doc["ts"] = epochNow();
    // Node ini tidak punya PIR maupun model edge. Dikirim eksplisit supaya
    // dashboard menampilkan "tidak tersedia", bukan mengira sensornya rusak.
    doc["motion_detected"] = (const char*)nullptr;
    doc["ml_model"] = "none";

    char buf[384];
    size_t n = serializeJson(doc, buf, sizeof(buf));
    mqtt.publish(topic, (const uint8_t*)buf, n, true);
}

static void publishTelemetry(const SeismicReading& r, float temp, float pres) {
    if (!mqtt.connected()) return;

    char topic[64];
    snprintf(topic, sizeof(topic), "lindu/sensor/%s/telemetry", config.settings.node_id);

    // Nama field WAJIB sama persis dengan node ESP32 — ingester dan
    // feature_extractor membacanya berdasarkan nama.
    StaticJsonDocument<512> doc;
    doc["node_id"] = config.settings.node_id;
    doc["ts"] = epochNow();
    doc["lat"] = config.settings.lat;
    doc["lon"] = config.settings.lon;
    doc["pga"] = r.pga;
    doc["sta_lta"] = r.sta_lta;
    doc["freq_hz"] = r.freq_hz;
    doc["ax"] = r.dyn_x;
    doc["ay"] = r.dyn_y;
    doc["az"] = r.dyn_z;
    if (temp > 0.0f) doc["temperature"] = temp;
    if (pres > 0.0f) doc["pressure"] = pres;
    // Node ini tidak punya aktuator maupun MQ-2. Field-nya sengaja TIDAK
    // dikirim, bukan dikirim bernilai nol — nol akan terbaca sebagai
    // "katup terbuka" dan "tidak ada gas", padahal yang benar adalah
    // "tidak punya perangkatnya".

    char buf[512];
    size_t n = serializeJson(doc, buf, sizeof(buf));
    mqtt.publish(topic, (const uint8_t*)buf, n);
}

// ---------------------------------------------------------------------------
// OTA
// ---------------------------------------------------------------------------

// ESP8266 punya Update.* dengan nama yang sama seperti ESP32; yang tidak ada
// hanya esp_ota_set_boot_partition, dan di sini pergantian slot ditangani
// sendiri oleh Update.end(). ESP8266httpUpdate membungkus seluruh alurnya.
//
// HTTPS dilayani BearSSL, yang menuntut ~16-22 KB RAM untuk buffer. Dari sisa
// heap saat berjalan itu terasa, jadi buffernya dikecilkan ke ukuran minimum
// yang masih sah (1 KB) dan sertifikatnya tidak diverifikasi. Untuk OTA dari
// server lokal, pakai http:// biasa — jauh lebih ringan dan tanpa risiko
// kehabisan memori di tengah unduhan.
static void jalankanOta(const char* url) {
    if (!url || !*url) {
        Serial.println(F("[OTA] URL kosong, dibatalkan"));
        return;
    }
    Serial.printf("[OTA] Mengunduh dari %s\n", url);
    Serial.printf("[OTA] Heap sebelum: %u byte\n", ESP.getFreeHeap());

    ESPhttpUpdate.rebootOnUpdate(true);
    t_httpUpdate_return hasil;

    if (strncmp(url, "https://", 8) == 0) {
        BearSSL::WiFiClientSecure aman;
        aman.setInsecure();
        aman.setBufferSizes(1024, 1024);
        hasil = ESPhttpUpdate.update(aman, url);
    } else {
        WiFiClient biasa;
        hasil = ESPhttpUpdate.update(biasa, url);
    }

    // Baris ini hanya tercapai bila pembaruan GAGAL — kalau berhasil,
    // perangkat sudah restart sebelum sampai sini.
    if (hasil == HTTP_UPDATE_FAILED) {
        Serial.printf("[OTA] GAGAL (%d): %s\n",
                      ESPhttpUpdate.getLastError(),
                      ESPhttpUpdate.getLastErrorString().c_str());
    } else if (hasil == HTTP_UPDATE_NO_UPDATES) {
        Serial.println(F("[OTA] Tidak ada pembaruan"));
    }
}

static void onMqttMessage(char* topic, byte* payload, unsigned int length) {
    StaticJsonDocument<384> doc;
    if (deserializeJson(doc, payload, length)) return;

    const char* cmd = doc["cmd"] | "";
    const char* target = doc["target_node"] | "all";
    if (strcmp(target, "all") != 0 && strcmp(target, config.settings.node_id) != 0) return;

    if (strcmp(cmd, "set_location") == 0) {
        config.settings.lat = doc["lat"] | config.settings.lat;
        config.settings.lon = doc["lon"] | config.settings.lon;
        config.save();
        Serial.printf("[CMD] Koordinat diperbarui: %.4f, %.4f\n",
                      config.settings.lat, config.settings.lon);
        publishStatus("online");
    } else if (strcmp(cmd, "identify") == 0) {
        // Tidak ada LED yang bisa dinyalakan; jawab lewat log agar operator
        // tetap mendapat konfirmasi bahwa node ini hidup dan mendengar.
        Serial.println(F("[CMD] IDENTIFY — node ESP8266 ini tidak punya LED"));
        publishStatus("online");
    } else if (strcmp(cmd, "force_update") == 0) {
        // URL boleh disertakan di perintah; bila tidak ada, tidak terjadi
        // apa-apa. Sengaja tanpa URL bawaan yang tertanam di firmware, supaya
        // tidak ada node yang bisa diarahkan mengunduh dari tempat tak terduga
        // hanya karena firmware-nya sudah lama.
        jalankanOta(doc["url"] | "");
    } else if (strcmp(cmd, "factory_reset") == 0) {
        Serial.println(F("[CMD] FACTORY RESET"));
        WiFiManager wm;
        wm.resetSettings();
        ESP.restart();
    }
    // trigger_siren, lock_door, enable_valve dan sejenisnya sengaja diabaikan:
    // node ini memang tidak punya aktuator apa pun.
}

static void reconnectMqtt() {
    if (millis() - last_reconnect < 5000) return;
    last_reconnect = millis();

    char will[64];
    snprintf(will, sizeof(will), "lindu/sensor/%s/status", config.settings.node_id);

    Serial.printf("[MQTT] Menyambung ke %s:%d ... ",
                  config.settings.mqtt_host, config.settings.mqtt_port);
    if (mqtt.connect(config.settings.node_id, nullptr, nullptr, will, 0, true,
                     "{\"status\":\"offline\"}")) {
        Serial.println(F("terhubung"));
        mqtt.subscribe("lindu/actuator/cmd/all");
        publishStatus("online");
    } else {
        Serial.printf("gagal (rc=%d)\n", mqtt.state());
    }
}

// ---------------------------------------------------------------------------
// Sensor
// ---------------------------------------------------------------------------

static void setupSensors() {
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);

    // LSM6DS3 (0x6A) dan BMP280 (0x76) berbagi satu-satunya bus I2C milik
    // ESP8266. Alamatnya tidak bentrok, jadi ini aman.
    sensor_ok = lsm.begin_I2C(0x6A, &Wire) || lsm.begin_I2C(0x6B, &Wire);
    if (sensor_ok) {
        // Disamakan dengan node ESP32.
        lsm.setAccelRange(LSM6DS_ACCEL_RANGE_8_G);
        lsm.setAccelDataRate(LSM6DS_RATE_1_66K_HZ);
        Serial.println(F("[SENSOR] LSM6DS3 siap"));
    } else {
        Serial.println(F("[SENSOR] LSM6DS3 TIDAK TERDETEKSI"));
    }

    bmp_ok = bmp.begin(0x76) || bmp.begin(0x77);
    Serial.println(bmp_ok ? F("[SENSOR] BMP280 siap") : F("[SENSOR] BMP280 tidak terdeteksi"));
}

// ---------------------------------------------------------------------------
// Setup & loop
// ---------------------------------------------------------------------------

void setup() {
    Serial.begin(115200);
    delay(200);
    Serial.println(F("\n=== Lindu-EEW Node ESP8266 " CURRENT_VERSION " ==="));

    bool terkonfigurasi = config.begin();

    WiFiManager wm;
    char mqtt_host[64];
    char mqtt_port[8];
    char lat_buf[24];
    char lon_buf[24];
    strlcpy(mqtt_host, config.settings.mqtt_host, sizeof(mqtt_host));
    snprintf(mqtt_port, sizeof(mqtt_port), "%d", config.settings.mqtt_port);
    snprintf(lat_buf, sizeof(lat_buf), "%.6f", config.settings.lat);
    snprintf(lon_buf, sizeof(lon_buf), "%.6f", config.settings.lon);

    WiFiManagerParameter p_host("host", "IP MQTT Broker", mqtt_host, sizeof(mqtt_host));
    WiFiManagerParameter p_port("port", "Port MQTT", mqtt_port, sizeof(mqtt_port));
    WiFiManagerParameter p_lat("lat", "Latitude", lat_buf, sizeof(lat_buf));
    WiFiManagerParameter p_lon("lon", "Longitude", lon_buf, sizeof(lon_buf));
    wm.addParameter(&p_host);
    wm.addParameter(&p_port);
    wm.addParameter(&p_lat);
    wm.addParameter(&p_lon);

    char ap_name[32];
    snprintf(ap_name, sizeof(ap_name), "Lindu_%s", config.settings.node_id + 5);

    // Portal dipaksa terbuka bila konfigurasi belum lengkap, supaya node tidak
    // pernah berjalan tanpa koordinat — tanpa itu ia tidak bisa ikut konsensus
    // dan kehadirannya percuma.
    bool ok = terkonfigurasi ? wm.autoConnect(ap_name) : wm.startConfigPortal(ap_name);
    if (!ok) {
        Serial.println(F("[WIFI] Gagal tersambung, restart..."));
        ESP.restart();
    }

    strlcpy(config.settings.mqtt_host, p_host.getValue(), sizeof(config.settings.mqtt_host));
    config.settings.mqtt_port = atoi(p_port.getValue());
    config.settings.lat = atof(p_lat.getValue());
    config.settings.lon = atof(p_lon.getValue());
    config.save();

    Serial.printf("[WIFI] Tersambung: %s\n", WiFi.localIP().toString().c_str());
    setupTime();
    setupSensors();
    seismic.reset();

    mqtt.setServer(config.settings.mqtt_host, config.settings.mqtt_port);
    mqtt.setCallback(onMqttMessage);
    mqtt.setBufferSize(MQTT_MAX_PACKET_SIZE);
}

void loop() {
    if (WiFi.status() != WL_CONNECTED) {
        delay(100);
        return;
    }
    if (!mqtt.connected()) reconnectMqtt();
    mqtt.loop();

    unsigned long now = millis();

    // Jarak antar pembacaan HARUS sama dengan node ESP32 — lihat catatan
    // panjang di SeismicCore.h.
    if (now - last_sample >= SEIS_SAMPLE_INTERVAL_MS) {
        last_sample = now;

        if (sensor_ok) {
            sensors_event_t a, g, t;
            lsm.getEvent(&a, &g, &t);
            SeismicReading r = seismic.update(a.acceleration.x, a.acceleration.y,
                                              a.acceleration.z, now);

            if (seismic.shouldPublish(r.pga, now)) {
                float temp = bmp_ok ? bmp.readTemperature() : 0.0f;
                float pres = bmp_ok ? bmp.readPressure() / 100.0f : 0.0f;
                publishTelemetry(r, temp, pres);
                seismic.markPublished(now);
            }
        }
    }

    if (now - last_status >= 10000) {
        last_status = now;
        publishStatus("online");
    }

    // ESP8266 single-core: yield wajib agar tumpukan WiFi mendapat giliran.
    // Tanpa ini watchdog akan me-reset perangkat.
    yield();
}
