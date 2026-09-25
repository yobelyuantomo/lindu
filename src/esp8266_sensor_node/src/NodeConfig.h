#ifndef NODE_CONFIG_H
#define NODE_CONFIG_H

#include <Arduino.h>

// Penyimpanan konfigurasi node di LittleFS.
//
// ESP32 memakai Preferences (NVS); ESP8266 tidak punya itu. LittleFS dipilih
// ketimbang EEPROM karena isinya bisa dibaca sebagai JSON biasa saat menelusuri
// masalah, dan tidak perlu menghitung offset byte secara manual.

struct NodeSettings {
    char node_id[32];
    char mqtt_host[64];
    int  mqtt_port;
    double lat;
    double lon;
};

class NodeConfig {
public:
    // Mengembalikan false bila belum pernah dikonfigurasi, sehingga pemanggil
    // tahu harus membuka captive portal.
    bool begin();
    bool save();

    NodeSettings settings;

private:
    void applyDefaults();
};

#endif
