# Node Sensor ESP8266 (NodeMCU Amica)

Node **kedua** untuk Lindu-EEW. Hanya sensor — tidak ada aktuator sama sekali.

Alasan keberadaannya: mesin konsensus menolak bekerja dengan kurang dari dua
node (`consensus.py`: `if len(nodes) < 2: return`), sehingga validasi fisika
gelombang-P tidak pernah berjalan dengan satu node saja.

---

## Perangkat keras

| Komponen | NodeMCU | Catatan |
|---|---|---|
| LSM6DS3 SDA | D2 (GPIO4) | |
| LSM6DS3 SCL | D1 (GPIO5) | |
| BMP280 SDA | D2 (GPIO4) | berbagi bus |
| BMP280 SCL | D1 (GPIO5) | berbagi bus |
| VCC | 3V3 | **jangan 5V** |
| GND | GND | |

ESP8266 hanya punya satu bus I2C, tetapi LSM6DS3 (`0x6A`/`0x6B`) dan BMP280
(`0x76`/`0x77`) tidak bentrok alamat, jadi keduanya cukup berbagi satu bus.

Yang **tidak** dipasang di node ini: relay, servo, buzzer, NeoPixel, MQ-2, PIR.

---

## Membangun dan mem-flash

```bash
cd src/esp8266_sensor_node
pio run                 # bangun
pio run -t upload       # flash lewat USB (driver CP2102)
pio device monitor       # 115200 baud
```

Pemakaian sumber daya saat ini:

```
RAM   : 40.6%  (33.240 / 81.920 byte)
Flash : 50.6%  (528.447 / 1.044.464 byte)
```

Batas flash itu sudah memperhitungkan OTA, jadi ruangnya masih sangat lega.

---

## Konfigurasi pertama

1. Saat pertama menyala, node memancarkan WiFi `Lindu_<chipid>`.
2. Sambungkan HP/laptop ke situ; captive portal terbuka sendiri.
3. Isi: nama & sandi WiFi, **IP broker MQTT**, **Latitude**, **Longitude**.
4. Simpan. Node restart dan menyambung.

**Koordinat wajib diisi.** Tanpa keduanya server tidak bisa menghitung jarak
antar-node, dan node ini tidak akan pernah ikut konsensus — kehadirannya jadi
percuma. Portal karena itu dipaksa terbuka selama konfigurasi belum lengkap.

Konfigurasi disimpan di LittleFS (`/node.json`), bukan NVS — ESP8266 tidak
punya `Preferences`.

### Menempatkan node kedua

Konsensus mem-bypass validasi fisika bila jarak antar node < 0,1 km, dan itu
kondisi yang wajar untuk satu rumah. Untuk demo yang lebih meyakinkan, pisahkan
node sejauh mungkin selama masih satu jaringan WiFi, lalu isi koordinat yang
benar-benar berbeda.

---

## OTA

```json
{"cmd": "force_update", "target_node": "all", "url": "http://192.168.1.10/firmware.bin"}
```

Kirim ke topik `lindu/actuator/cmd/all`.

`http://` disarankan untuk server lokal: jauh lebih ringan. `https://` juga
didukung, tetapi BearSSL menuntut ~16–22 KB RAM untuk buffer TLS, dan
sertifikatnya tidak diverifikasi (`setInsecure()`).

Tidak ada URL bawaan yang tertanam di firmware — disengaja, supaya tidak ada
node yang bisa diarahkan mengunduh dari tempat tak terduga hanya karena
firmware-nya sudah lama.

---

## Perintah MQTT yang dikenali

| Perintah | Perilaku |
|---|---|
| `set_location` | Perbarui koordinat, disimpan permanen |
| `force_update` | OTA dari `url` yang disertakan |
| `factory_reset` | Hapus konfigurasi WiFi, restart |
| `identify` | Membalas lewat log serial (node ini tidak punya LED) |

`trigger_siren`, `lock_door`, `enable_valve` dan sejenisnya **diabaikan** —
node ini memang tidak punya aktuator.

---

## ⚠️ Kenapa konstanta seismiknya tidak boleh diubah sendirian

`SeismicCore.h` menyalin konstanta dari `src/esp32_sensor_node/src/SensorManager.cpp`:
interval 10 ms, `alpha_dc` 0,002, STA 0,1, LTA 0,005, jendela ZCR 1000 ms.

STA/LTA dihitung dengan EMA **per sampel** dan frekuensi dari zero-crossing
**per detik** — keduanya hanya bermakna relatif terhadap laju sampling. Node
dengan konstanta berbeda akan melaporkan `sta_lta` dan `freq_hz` yang berbeda
untuk guncangan fisik yang sama. Akibatnya ambang rule-based (0,12 / 2,0 /
20 Hz) tidak lagi valid, dan dataset latih tercemar: model belajar membedakan
merek chip, bukan membedakan gempa.

Tidak ada error yang muncul kalau ini terjadi. Karena itu ada pemeriksa
otomatis yang membandingkan kedua firmware:

```bash
cd ../server && pytest test_konsistensi_firmware.py
```

Jalankan setiap kali salah satu firmware diubah.

---

## Verifikasi setelah flash

```sql
SELECT node_id, COUNT(*), MAX(time)
FROM sensor_telemetry
WHERE freq_hz IS NOT NULL
GROUP BY node_id;
```

Harus muncul **dua** node dengan jumlah yang sama-sama bertambah. Setelah itu
konsensus bisa diuji: goyangkan kedua node dalam jendela 60 detik.
