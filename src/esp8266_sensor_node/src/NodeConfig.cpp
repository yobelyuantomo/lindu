#include "NodeConfig.h"
#include <ArduinoJson.h>
#include <LittleFS.h>

static const char* CONFIG_PATH = "/node.json";

void NodeConfig::applyDefaults() {
    // node_id diturunkan dari chip id agar unik tanpa perlu diketik manual,
    // dan tetap sama setiap kali boot. Formatnya disamakan dengan node ESP32
    // (node_<hex>) supaya keduanya terlihat seragam di dashboard.
    snprintf(settings.node_id, sizeof(settings.node_id), "node_%08x", ESP.getChipId());
    settings.mqtt_host[0] = '\0';
    settings.mqtt_port = 1883;
    settings.lat = 0.0;
    settings.lon = 0.0;
}

bool NodeConfig::begin() {
    applyDefaults();

    if (!LittleFS.begin()) {
        Serial.println(F("[CFG] LittleFS gagal dimuat, memformat..."));
        LittleFS.format();
        if (!LittleFS.begin()) {
            Serial.println(F("[CFG] LittleFS tetap gagal. Konfigurasi tidak akan tersimpan."));
            return false;
        }
    }

    File f = LittleFS.open(CONFIG_PATH, "r");
    if (!f) return false;

    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, f);
    f.close();
    if (err) {
        Serial.printf("[CFG] node.json rusak (%s); memakai nilai bawaan\n", err.c_str());
        return false;
    }

    strlcpy(settings.mqtt_host, doc["mqtt_host"] | "", sizeof(settings.mqtt_host));
    settings.mqtt_port = doc["mqtt_port"] | 1883;
    settings.lat = doc["lat"] | 0.0;
    settings.lon = doc["lon"] | 0.0;
    if (doc.containsKey("node_id"))
        strlcpy(settings.node_id, doc["node_id"], sizeof(settings.node_id));

    // Koordinat wajib: tanpa keduanya, server tidak bisa memvalidasi fisika
    // rambat gelombang-P dan node ini tidak akan pernah ikut konsensus.
    bool lengkap = settings.mqtt_host[0] != '\0' && (settings.lat != 0.0 || settings.lon != 0.0);
    Serial.printf("[CFG] Dimuat: %s @ %s:%d (%.4f, %.4f)%s\n",
                  settings.node_id, settings.mqtt_host, settings.mqtt_port,
                  settings.lat, settings.lon, lengkap ? "" : "  <-- BELUM LENGKAP");
    return lengkap;
}

bool NodeConfig::save() {
    StaticJsonDocument<512> doc;
    doc["node_id"] = settings.node_id;
    doc["mqtt_host"] = settings.mqtt_host;
    doc["mqtt_port"] = settings.mqtt_port;
    doc["lat"] = settings.lat;
    doc["lon"] = settings.lon;

    File f = LittleFS.open(CONFIG_PATH, "w");
    if (!f) {
        Serial.println(F("[CFG] Gagal membuka node.json untuk ditulis"));
        return false;
    }
    bool ok = serializeJson(doc, f) > 0;
    f.close();
    Serial.println(ok ? F("[CFG] Konfigurasi tersimpan") : F("[CFG] Gagal menulis konfigurasi"));
    return ok;
}
