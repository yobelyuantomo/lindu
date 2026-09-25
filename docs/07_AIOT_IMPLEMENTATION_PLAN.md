# 07 — Rencana Implementasi AIoT (Assignment 3)

Dokumen ini adalah **task list eksekusi** untuk mewujudkan proposal
`04_Final/proposal/Proposal_Rancangan_Lindu-EEW_AIoT.docx` ke dalam kode.

Ditulis agar bisa dipakai langsung oleh sesi Claude Code baru: setiap task
menyebut berkas yang disentuh, apa yang harus berubah, dan kriteria selesai.

**Cara pakai:** kerjakan berurutan per fase. Centang `[x]` setelah kriteria
selesai terpenuhi. Jangan lompat ke Fase 2 sebelum Fase 0 dan 1 tuntas —
seluruh pekerjaan model bergantung pada kualitas data dari fase tersebut.

---

## Status Pengerjaan

> Berkas ini adalah **satu-satunya sumber kebenaran** untuk progres.
> Task pertama yang masih `[ ]` adalah titik lanjut. Setelah menyelesaikan
> sebuah task, centang `[x]` dan perbarui tiga baris di bawah ini.

| | |
|---|---|
| **Fase berjalan** | Fase 0–4 sebagian besar selesai; tersisa yang butuh data/perangkat keras |
| **Task berikutnya** | T2.3 (regresi magnitudo) → T5.x (pengujian) → T7/T8 |
| **Terakhir diperbarui** | 2026-09-25 — 14 task selesai lewat 15 PR |

### Yang memblokir, dan siapa yang bisa membukanya

| Blocker | Menahan | Pemegang |
|---|---|---|
| Ingester baru belum di-deploy | seluruh pengumpulan data | **user** |
| Perekaman fisik belum dimulai (T1.3) | Fase 2 pelatihan nyata, T5.4 | **user** |
| `scikit-learn` belum terpasang | validasi T2.1/T2.3 end-to-end | lingkungan |
| Perangkat ESP32 fisik | T6.2–T6.4 | **user** |

**Aksi user yang paling mendesak:**

```bash
cd prototype/grafana-stack && docker-compose up -d --build
```

Sebelum ini dijalankan, data yang masuk **tidak bisa dipakai melatih model**
sama sekali (lihat kotak peringatan di Fase 0). Setelah itu, mulai perekaman
sesuai `src/server/ml_training/RECORDING_PROTOCOL.md`.

### PR yang sudah ter-merge

`lindu#1` `lindu#2` — rencana, koreksi, bump pointer
`lindu_grafana#1` (T0.1/T0.2) `lindu_grafana#2` (T4.2)
`lindu_server#1` (T0.4/T0.6) `#2` (T1.5) `#3` (T1.1) `#4` (T1.2) `#5` (T1.4)
`#6` (T1.6) `#7` (T2.2) `#8` (T2.1/T2.4) `#9` (T3.1/T3.2) `#10` (T3.3/T3.4)
`#11` (T4.1)

Total 142 test lolos di submodule `lindu_server`.

**Titik awal:** pengerjaan dimulai dari rencana ini. Task tertunda, TODO, atau
catatan revisi peninggalan assignment sebelumnya — di komentar kode, branch lama,
maupun catatan lain — diabaikan dan tidak diangkat kembali kecuali user meminta.

---

## Aturan Kerja (WAJIB dibaca sebelum mengubah kode)

1. **Jalur rule-based tidak boleh dihapus.** Filter tiga lapis di
   `src/server/consensus.py:286` dan validasi fisika P-Wave tetap hidup.
   ML ditambahkan sebagai jalur paralel, bukan pengganti. Ini keputusan
   keselamatan, bukan preferensi gaya.
2. **ML tidak boleh membatalkan alarm rule-based.** Jika rule-based lolos
   dan ML menolak, sistem menahan aksi aktuator tetapi **tetap** mencatat dan
   menampilkan peringatan lokal. Tidak pernah diam total.
3. **Gagal model = kembali ke rule-based.** Setiap pemanggilan inferensi
   dibungkus try/except dengan timeout. Model gagal dimuat, versi tidak cocok,
   atau inferensi terlalu lama → sistem jalan seperti Assignment 2 dan mencatat
   kejadian tersebut.
4. **Jangan latih model di jalur real-time.** Pelatihan selalu offline.
   Server hanya memuat artefak model saat startup.
5. **Level 1 selesai lebih dulu.** Fase 0–5 memenuhi seluruh syarat minimum
   soal. Fase 6–8 adalah nilai tambah dan harus bisa dimatikan lewat
   konfigurasi tanpa merusak Level 1.

---

## Peta Sistem Saat Ini (hasil penelusuran kode)

Alur data existing yang jadi dasar seluruh task di bawah:

```
ESP32  NetworkManager::publishEvent()        src/esp32_sensor_node/src/NetworkManager.cpp:81
       → topic lindu/sensor/<node_id>/telemetry
       → field: pga, sta_lta, freq_hz, ax, ay, az, ts, lat, lon, temperature, pressure, uptime
                    │
        ┌───────────┴────────────┐
        ▼                        ▼
  ingester.py                consensus.py
  (grafana-stack)            (mesin konsensus)
  simpan SEMUA baris         filter 3 lapis dulu (line 286),
  → tabel sensor_telemetry   baris yang DITOLAK langsung return (line 288)
  TANPA kolom freq_hz        → tabel tb_sensor_telemetry
```

**Konsekuensi penting:** saat ini **tidak ada satu pun tabel yang menyimpan
`freq_hz` untuk sampel kelas negatif** (getaran non-gempa). `sensor_telemetry`
merekam semuanya tetapi tidak punya kolom `freq_hz`; `tb_sensor_telemetry`
punya `freq_hz` tetapi hanya menerima baris yang sudah lolos filter. Tanpa
perbaikan ini, dataset latih tidak akan pernah memiliki kelas negatif yang
lengkap. Itulah sebabnya Fase 0 ada dan harus dikerjakan lebih dulu.

### Keputusan: `sensor_telemetry` (jalur ingester) adalah sumber dataset

Hanya satu tabel yang dipakai sebagai sumber dataset ML, supaya tidak perlu
join antar dua tabel yang ditulis oleh dua proses berbeda dengan semantik waktu
berbeda pula (ingester memakai waktu terima di server, consensus memakai epoch
dari sensor — jendela sinyalnya tidak akan sejajar).

Yang dipilih adalah `sensor_telemetry`, dengan alasan:

1. Ingester sudah merekam **semua** pesan tanpa filter, jadi kelas positif dan
   negatif dua-duanya masuk secara alami.
2. Penulisannya sudah dibatch (flush 0,5 detik, `executemany`) dan berada
   **di luar jalur kritis alarm**. Menambah beban tulis ke `consensus.py`
   justru memperlambat proses yang memicu sirine.
3. Sudah memuat fitur lingkungan yang dibutuhkan proposal: `temperature`,
   `pressure`, `humidity`, `gas_raw`, `gas_alert`, `valve_status` — semuanya
   tidak ada di `tb_sensor_telemetry`.
4. Sudah punya `accel_x/y/z`, `pga`, dan `rms` (diisi dari `sta_lta`).
5. 13 dari 14 panel Grafana memang sudah membaca tabel ini.

Yang kurang hanya **dua kolom**: `freq_hz` dan timestamp asli dari sensor.
Itulah keseluruhan isi Fase 0 versi wajib.

**Verdict rule-based tidak perlu disimpan.** Filter tiga lapis adalah fungsi
murni dari `pga`, `sta_lta`, dan `freq_hz` — ketiganya tersimpan. Jadi label
"lolos/tidak lolos filter" cukup dihitung ulang saat ekspor dataset
(pakai fungsi yang sama dengan T2.2), bukan dipersistensi sebagai kolom.
Ini menghapus kebutuhan mengubah `consensus.py` sama sekali untuk urusan data.

### Kabar baik: telemetri tidak pernah di-purge

`README.md` §8.5 menyebut daemon penghapus **telemetri** berusia > 7 hari.
Daemon itu tidak ada. Yang benar-benar ada di `consensus.py` hanyalah
`DELETE FROM tb_node_logs WHERE ts < NOW() - INTERVAL '3 days'` — yang dihapus
adalah **log node**, bukan data telemetri. Tabel `sensor_telemetry`,
`tb_sensor_telemetry`, dan `tb_system_alerts` tidak pernah disentuh.

Artinya seluruh data seismik historis masih utuh dan aman dipakai melatih.
README-nya sendiri perlu dikoreksi, tetapi itu bukan urusan fase ini.

Sebagai catatan kehati-hatian: ada commit berjudul
`feat: add retention thread to auto-purge 7 day old telemetry` (af5a32b), tetapi
isi diff-nya sebenarnya connection pooling — tidak ada purge sama sekali di
dalamnya. Judul commit di repo ini tidak selalu mencerminkan isinya, jadi
verifikasi ke kode, jangan percaya pesan commit.

---

## Fase 0 — Perbaikan Fondasi Data

Hanya T0.1–T0.3 yang **wajib**. Sisanya (T0.4–T0.6) adalah bug asli yang
ditemukan saat penelusuran kode tetapi **tidak memblokir pekerjaan ML** —
dikerjakan hanya bila sempat, atau dilewati sama sekali.

- [ ] **T0.0 — Cek dulu berapa data yang sudah ada**
  - Sebelum menulis kode apa pun, jalankan di Postgres:
    `SELECT node_id, COUNT(*), MIN(time), MAX(time) FROM sensor_telemetry GROUP BY node_id;`
  - Ini menentukan bentuk Fase 1: kalau data historis sudah banyak, fokusnya
    ekspor dan pelabelan; kalau nyaris kosong, perekaman terkendali (T1.2/T1.3)
    jadi pekerjaan terbesar dan harus dimulai secepatnya karena butuh waktu nyata.
  - Catatan: data lama **tidak** terhapus otomatis (tidak ada purge di kode),
    jadi apa pun yang pernah masuk masih ada.
  - Selesai jika: jumlah baris per node tercatat di catatan kerja.

### Wajib

- [x] **T0.1 — Tambah kolom `freq_hz` dan `sensor_ts` ke `sensor_telemetry`**
      *(selesai 2026-09-25)*
  - Berkas: `prototype/grafana-stack/postgres/init.sql`
  - Kolom ditambahkan pada `CREATE TABLE` **dan** sebagai
    `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, mengikuti pola `gas_raw`/`gas_alert`
    yang sudah ada (init.sql hanya jalan sekali saat volume dibuat, jadi ALTER wajib
    agar volume Postgres lama ikut dapat kolomnya).
  - `sensor_ts` menyimpan epoch asli dari node. Kolom `time` yang sudah ada berisi
    waktu **terima di server**, yang tidak cukup untuk menyusun jendela sinyal 1–2
    detik secara benar.
  - Selesai jika: kolom muncul di volume Postgres lama maupun baru. ✅

- [x] **T0.2 — Ingester menulis `freq_hz` dan `sensor_ts`**
      *(selesai 2026-09-25)*
  - Berkas: `prototype/grafana-stack/ingester/ingester.py`
  - `freq_hz` diambil dengan default `None`, **bukan `0`** — supaya baris tanpa
    frekuensi bisa dibuang saat ekspor dataset, bukan diam-diam dianggap 0 Hz.
  - `sensor_ts` memakai `sent_ts` yang sebelumnya sudah dihitung untuk latensi
    lalu dibuang begitu saja.
  - Urutan kolom pada `executemany` sudah diverifikasi cocok 16/16 dengan urutan
    tuple `telemetry_buffer.append(...)`. Ini sumber bug paling umum di berkas ini —
    verifikasi ulang setiap kali menambah kolom.
  - Selesai jika: baris baru di `sensor_telemetry` punya `freq_hz` terisi. ✅

> ### ⚠️ Konsekuensi T0.1/T0.2 terhadap jadwal
>
> `freq_hz` adalah **fitur wajib** classifier dan **tidak bisa diimputasi** —
> frekuensi dominan tidak dapat direkonstruksi dari PGA/STA-LTA yang sudah
> tersimpan. Akibatnya:
>
> **Seluruh baris `sensor_telemetry` yang direkam sebelum perbaikan ini tidak
> dapat dipakai melatih classifier** dan harus dibuang saat ekspor dataset
> (`WHERE freq_hz IS NOT NULL`).
>
> Artinya jam nol pengumpulan data adalah saat ingester versi baru ini benar-benar
> ter-deploy — bukan saat node mulai dipasang. **Deploy ulang stack Grafana
> secepatnya**, karena setiap hari tertunda adalah sehari data yang terbuang:
>
> ```bash
> cd prototype/grafana-stack && docker-compose up -d --build
> ```
>
> Verifikasi setelah deploy:
> ```sql
> SELECT COUNT(*) FROM sensor_telemetry WHERE freq_hz IS NOT NULL;
> ```
> Angkanya harus bertambah seiring waktu. Kalau tetap 0, ingester belum
> ter-rebuild atau node tidak mengirim `freq_hz`.

- [x] **T0.3 — ~~Rekam sampel yang DITOLAK filter di `consensus.py`~~ DIBATALKAN**
      *(dianalisis 2026-09-25 — tidak diperlukan, dan sebagian sudah ada upstream)*
  - Rencana awal: ubah `consensus.py` agar menyimpan juga baris yang ditolak
    filter, plus kolom `passed_rule`.
  - **Tidak jadi dikerjakan**, karena tiga alasan:
    1. `main` submodule `lindu_server` **sudah** memindahkan `save_telemetry()`
       ke atas filter (commit `a9130d3`), jadi `tb_sensor_telemetry` sekarang
       memang menerima kelas negatif juga. Pointer submodule di repo induk
       sempat tertinggal 7 commit sehingga hal ini tidak terlihat saat rencana
       ini pertama disusun.
    2. `ingester.py` juga merekam **semua** pesan telemetri tanpa filter.
    3. Verdict rule-based adalah **fungsi murni** dari `pga`, `sta_lta`, dan
       `freq_hz` — ketiganya tersimpan. Jadi label lolos/tidak-lolos cukup
       dihitung ulang saat ekspor dataset memakai fungsi yang sama dengan T2.2,
       tidak perlu dipersistensi sebagai kolom.
  - `sensor_telemetry` tetap dipilih sebagai sumber dataset tunggal, karena
    hanya tabel itu yang memuat fitur lingkungan (suhu, tekanan, gas) sekaligus
    fitur seismik — sehingga tidak perlu join lintas tabel sama sekali.

### Opsional — bug asli, tetapi tidak memblokir pekerjaan ML

Tiga item berikut adalah cacat nyata yang ditemukan saat penelusuran kode, namun
**tidak memengaruhi pembangunan dataset maupun keabsahan evaluasi**. Kerjakan
bila sempat; melewatinya tidak berisiko terhadap requirement soal.

- [x] **T0.4 — Bersihkan insert mati ke `tb_telemetry`** *(selesai — lindu_server#1)*
  - Berkas: `src/server/consensus.py` sekitar baris 317–338
  - Blok ini melakukan `INSERT INTO tb_telemetry`, tabel yang **tidak pernah
    dibuat** di `init_db()`. Error-nya ditelan `except: pass`, jadi selama ini
    gagal diam-diam. Blok `if "/telemetry"` ini juga duplikat dari `elif`
    di baris 275.
  - Hapus insert mati tersebut, pertahankan logika *live refinement*
    episentrum di bawahnya.
  - *Kenapa tidak blocking:* insert-nya memang tidak pernah berhasil, jadi tidak
    ada data yang hilang karenanya. Nilainya murni kebersihan kode — mencegah
    orang lain "memperbaikinya" dengan membuat `tb_telemetry`, yang akan
    melahirkan tabel telemetri ketiga dan mengaburkan mana sumber dataset.
  - Selesai jika: tidak ada lagi referensi ke `tb_telemetry`, refinement
    episentrum masih berfungsi (uji dengan `simulate_e2e.py`).

- [x] **T0.5 — ~~Perbaiki typo `/api/cmd`~~ DIBATALKAN** *(sudah diperbaiki upstream)*
  - `mqtt_mqtt_client.publish(...)` ternyata sudah dibetulkan di `main` submodule
    `lindu_server` sebelum sempat dikerjakan. Terlihat setelah pointer submodule
    yang tertinggal 7 commit di-bump.

- [x] **T0.6 — Perketat default `freq_hz`** *(selesai — lindu_server#1)*
  - Berkas: `src/server/consensus.py:280,286`
  - `payload.get("freq_hz", 0)` menghasilkan 0 bila field hilang, dan
    `0 <= 20` membuat filter **lolos**. Node dengan firmware lama karena itu
    otomatis dianggap gempa.
  - Perlakukan `freq_hz` yang hilang sebagai tidak valid (tolak + catat warning).
  - **Penempatan penting:** pengecekan ditaruh **setelah** `save_telemetry()`,
    bukan sebelumnya. Kalau di atas, baris itu ikut hilang dari logging dan kita
    kehilangan data latih — yang boleh dilewati hanya jalur konsensus/alarm.
  - *Kenapa tidak blocking:* seluruh firmware yang beredar mengirim `freq_hz`
    (lihat `NetworkManager.cpp:91`), jadi jalur bug ini praktis tidak pernah
    tereksekusi. Ia juga tidak mencemari perbandingan ML vs rule-based, karena
    baris tanpa `freq_hz` memang dibuang dari dataset (lihat T1.1) sehingga
    baseline tidak pernah dievaluasi pada kondisi tersebut.
  - Selesai jika: payload tanpa `freq_hz` tidak memicu konsensus.

---

## Fase 1 — Dataset dan Rekayasa Fitur

- [x] **T1.1 — Skrip ekspor dataset** *(selesai — lindu_server#3)*
  - Berkas baru: `src/ml-training/export_dataset.py`
  - Sumbernya **hanya `sensor_telemetry`** (lihat keputusan di Fase 0). Jangan
    join dengan `tb_sensor_telemetry` — dua tabel itu ditulis oleh proses berbeda
    dengan semantik waktu berbeda, jendelanya tidak akan sejajar.
    `tb_system_alerts` tetap dipakai, tetapi hanya untuk **pelabelan** (T1.4),
    bukan sebagai sumber fitur.
  - Kolom yang diekspor: `sensor_ts`, `time`, `node_id`, `pga`, `rms` (= sta_lta),
    `freq_hz`, `accel_x/y/z`, `temperature`, `pressure`, `humidity`,
    `gas_raw`, `gas_alert`.
  - **Wajib `WHERE freq_hz IS NOT NULL`** — baris sebelum perbaikan T0.1/T0.2
    tidak punya frekuensi dan tidak boleh diimputasi. Cetak berapa baris yang
    terbuang karena filter ini supaya jelas berapa data yang benar-benar usable.
  - Hitung kolom turunan `passed_rule` **di sini** (bukan dari database) memakai
    fungsi yang sama dengan T2.2, supaya definisi rule-based hanya ada di satu tempat.
  - Selesai jika: `data/raw/telemetry_export_<tanggal>.csv` terbentuk, dan jumlah
    barisnya cocok dengan
    `SELECT COUNT(*) FROM sensor_telemetry WHERE freq_hz IS NOT NULL;`

- [x] **T1.2 — Protokol perekaman kelas negatif** *(selesai — lindu_server#4)*
  - Berkas baru: `src/ml-training/RECORDING_PROTOCOL.md`
  - Definisikan skenario terkendali: berjalan, melompat, memukul meja,
    membanting pintu, kendaraan lewat, bor/konstruksi ringan. Untuk tiap sesi
    catat: node_id, waktu mulai/selesai (epoch), label, dan catatan kondisi.
  - Selesai jika: minimal 6 skenario terekam, tiap skenario ≥ 30 jendela sinyal.

- [ ] **T1.3 — Perekaman kelas positif (gempa)**
  - Gunakan meja getar sederhana dan/atau profil sinyal gempa pada Wokwi.
  - Catat dengan format log yang sama seperti T1.2.
  - Catatan jujur untuk laporan: kejadian gempa alami hampir pasti nihil
    selama masa proyek. Keterbatasan ini **wajib** ditulis di bab Limitasi,
    jangan disembunyikan.
  - Selesai jika: kelas positif punya ≥ 100 jendela sinyal.

- [x] **T1.4 — Pelabelan dataset** *(selesai — lindu_server#5)*
  - Berkas baru: `src/ml-training/label_dataset.py`
  - Labeli berdasarkan rentang waktu sesi perekaman (T1.2/T1.3) dan
    korelasi dengan `tb_system_alerts` untuk kejadian yang tervalidasi konsensus.
  - Kelas: `earthquake`, `noise`, `gas_leak` (khusus node varian Classic).
  - Selesai jika: distribusi label tercetak dan tidak ada baris tanpa label.

- [x] **T1.5 — Ekstraksi fitur per jendela** *(selesai — lindu_server#2)*
  - Berkas baru: `src/server/ml/feature_extractor.py`
  - **Penting:** modul ini dipakai bersama oleh pelatihan (offline) dan
    inferensi (runtime). Satu sumber kebenaran, supaya tidak terjadi
    train/serve skew.
  - Jendela 1–2 detik. Fitur sesuai Tabel 6 proposal: amplitudo (PGA maks,
    PGA rata-rata, RMS, crest factor), energi (energi kumulatif, durasi di atas
    ambang, laju kenaikan amplitudo), frekuensi (freq dominan, sebaran pita),
    rasio (STA/LTA sesaat dan puncak, waktu menuju puncak), lingkungan
    (delta tekanan, gas_raw).
  - Selesai jika: ada unit test yang memberi vektor fitur berdimensi tetap
    untuk jendela sintetis yang diketahui hasilnya.

- [x] **T1.6 — Augmentasi dan dataset final** *(selesai — lindu_server#6)*
  - Berkas baru: `src/ml-training/build_dataset.py`
  - Augmentasi kelas minoritas: penskalaan amplitudo, pergeseran waktu,
    penambahan derau terkendali. Augmentasi **hanya** pada subset latih.
  - Pembagian 70/15/15 **berbasis kejadian (event-wise), bukan per baris** —
    jendela dari satu kejadian yang sama tidak boleh tersebar ke train dan test
    sekaligus (kebocoran data).
  - Selesai jika: `data/processed/dataset_v1.csv` + `dataset_meta.json`
    (berisi jumlah per kelas, daftar fitur, seed, dan aturan split).

---

## Fase 2 — Pelatihan Model (Level 1)

- [x] **T2.1 — Baseline klasifikasi** *(selesai — lindu_server#8)*
  - Berkas baru: `src/ml-training/train_classifier.py`
  - Random Forest dan XGBoost. Class weighting untuk ketidakseimbangan kelas.
    Hyperparameter search lewat cross-validation **pada subset latih saja**.
  - Seed tetap, dicatat di metadata.
  - Selesai jika: tercetak accuracy, precision, recall, F1 per kelas, dan
    confusion matrix pada subset uji.

- [x] **T2.2 — Baseline rule-based sebagai pembanding** *(selesai — lindu_server#7)*
  - Berkas baru: `src/ml-training/evaluate_baseline.py`
  - Implementasikan ulang filter tiga lapis (`pga >= 0.12 and sta_lta >= 2.0
    and freq_hz <= 20`) sebagai fungsi, lalu jalankan pada subset uji **yang
    sama persis**.
  - Selesai jika: tabel perbandingan ML vs rule-based tersimpan sebagai CSV.
    Ini adalah bukti utama untuk butir (h) requirement soal — jangan dilewat.

- [ ] **T2.3 — Regresi estimasi magnitudo**
  - Berkas baru: `src/ml-training/train_magnitude.py`
  - Target: proxy magnitudo dari kejadian tervalidasi di `tb_system_alerts`.
  - Pembanding: formula existing `5.0 + 1.5*log10(pga/0.1)`
    (`consensus.py:537` dan `:365`).
  - Selesai jika: MAE dan RMSE kedua metode tersaji berdampingan.

- [x] **T2.4 — Ekspor artefak model** *(selesai — lindu_server#8)*
  - Keluaran ke `src/server/ml/models/`: berkas model (joblib), dan
    `model_meta.json` berisi versi, daftar fitur berurutan, tanggal latih,
    metrik uji, serta hash dataset.
  - Selesai jika: artefak bisa dimuat ulang di proses Python terpisah dan
    menghasilkan prediksi identik pada input yang sama.

---

## Fase 3 — Integrasi Server (Level 1)

- [x] **T3.1 — Modul inferensi** *(selesai — lindu_server#9)*
  - Berkas baru: `src/server/ml/inference_engine.py`
  - API minimal: `load_models()`, `predict(payload) -> {label, confidence,
    magnitude_pred, model_version, latency_ms}`.
  - Muat model sekali saat startup. Validasi bahwa daftar fitur di
    `model_meta.json` cocok dengan keluaran `feature_extractor.py`; bila tidak
    cocok, tolak memuat dan aktifkan mode rule-based murni.
  - Selesai jika: unit test membuktikan fallback aman saat berkas model
    tidak ada, rusak, atau versinya tidak cocok.

- [x] **T3.2 — Buffer jendela per node** *(selesai — lindu_server#9)*
  - Berkas: `src/server/ml/inference_engine.py`
  - Telemetri datang per pesan, sedangkan fitur butuh jendela 1–2 detik.
    Siapkan ring buffer per `node_id` dengan batas ukuran tetap
    (hindari kebocoran memori saat node banyak).
  - Selesai jika: buffer tidak tumbuh tanpa batas pada uji beban 10 menit.

- [x] **T3.3 — Panggil inferensi dari pipeline konsensus** *(selesai — lindu_server#10)*
  - Berkas: `src/server/consensus.py`, di `on_message` sekitar baris 275–315
  - Jalankan inferensi **berdampingan** dengan `is_real_quake`, lalu gabungkan
    sesuai Tabel 4 proposal (matriks keputusan gabungan).
  - Jalur rule-based tidak boleh menunggu hasil inferensi — anggaran latensi
    ditetapkan (mis. 50 ms); lewat dari itu, hasil ML diabaikan untuk siklus
    tersebut dan dicatat.
  - Selesai jika: log menampilkan kedua keputusan pada setiap telemetri yang
    relevan, dan `simulate_e2e.py` tetap lulus.

- [x] **T3.4 — Skema database untuk prediksi** *(selesai — lindu_server#10)*
  - Berkas: `src/server/consensus.py` (`init_db`), `prototype/grafana-stack/postgres/init.sql`
  - Tabel baru `tb_ml_predictions`: ts, node_id, label, confidence,
    magnitude_pred, anomaly_score, lead_time_pred, model_version,
    latency_ms, rule_passed, decision_taken.
  - Ikuti pola `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` untuk kompatibilitas
    volume lama.
  - Selesai jika: setiap prediksi tercatat dan bisa di-query dari Grafana.

- [ ] **T3.5 — Estimasi magnitudo ML berdampingan**
  - Berkas: `src/server/consensus.py` pada `fire_alarm()` (baris 516) dan
    blok live refinement (baris ~365)
  - Tambahkan `magnitude_ml` ke `alarm_payload` **tanpa membuang** field
    `magnitude` existing. Konsumen lama (firmware, dashboard React) tidak boleh
    rusak karena field baru.
  - Selesai jika: payload MQTT memuat kedua nilai dan node lama tetap normal.

---

## Fase 4 — Aktuator dan Dashboard (Level 1)

- [x] **T4.1 — Kebijakan aktuator bertingkat** *(selesai — lindu_server#11)*
  - Berkas: `src/server/consensus.py` (penyusunan `alarm_payload`)
  - Implementasikan 4 tingkat sesuai Tabel 5 proposal: Siaga (0,50–0,75),
    Waspada (0,75–0,90), Bahaya (>0,90 atau lead-time < 5 s), Kritis
    (>0,90 + magnitudo tinggi).
  - Ambang disimpan sebagai konstanta bernama di satu tempat, bukan angka
    tersebar di banyak baris.
  - Selesai jika: tiap tingkat bisa dipicu dan terverifikasi di log + aktuator.

- [x] **T4.2 — Panel Grafana baru** *(selesai — lindu_grafana#2)*
  - Berkas: `prototype/grafana-stack/grafana/dashboards/seismic.json`
  - Tambah panel: Label Prediksi, Confidence Gauge, Tren Prediksi Historis,
    dan Rule-Based vs ML. Panel Assignment 2 **tetap dipertahankan seluruhnya**
    (requirement soal: dashboard yang sama, ditingkatkan).
  - Selesai jika: dashboard ter-provision otomatis dari `docker-compose up -d`
    tanpa langkah manual.

- [ ] **T4.3 — Dashboard React**
  - Berkas: `src/dashboard-react/src/components/` (+ `hooks/useMqtt.js`)
  - Tampilkan label prediksi dan confidence pada banner/alarm dan modal node.
  - Tangani payload tanpa field ML (node atau server versi lama) secara aman.
  - Selesai jika: UI tidak pecah saat field ML tidak ada.

---

## Fase 5 — Pengujian dan Evaluasi (Level 1)

- [ ] **T5.1 — Unit test modul ML**
  - Berkas baru: `src/server/test_inference.py`
  - Cakup: ekstraksi fitur, fallback model gagal, penanganan timeout,
    matriks keputusan gabungan.
  - Selesai jika: lulus di CI (`.github/workflows/test.yml`).

- [ ] **T5.2 — Uji end-to-end**
  - Berkas: `src/server/simulate_e2e.py` (perluas)
  - Skenario: gempa valid, noise berenergi tinggi, confidence rendah
    (aksi harus ditahan), dan model tidak tersedia.
  - Selesai jika: keempat skenario menghasilkan keputusan yang diharapkan.

- [ ] **T5.3 — Uji fallback**
  - Simulasikan berkas model hilang, metadata rusak, versi tidak cocok, dan
    inferensi melebihi anggaran latensi.
  - Selesai jika: sistem tetap mendeteksi gempa lewat jalur rule-based dan
    mencatat alasan fallback.

- [ ] **T5.4 — Laporan perbandingan**
  - Berkas baru: `docs/08_AIOT_EVALUATION_RESULTS.md`
  - Isi: tabel metrik, confusion matrix, MAE/RMSE magnitudo, ablation study
    per kelompok fitur, dan catatan keterbatasan dataset.
  - Selesai jika: seluruh angka pada laporan akademik bisa ditelusuri ke
    berkas ini.

> **Sampai titik ini seluruh syarat minimum soal sudah terpenuhi.**
> Fase berikutnya adalah Level 2 dan bersifat opsional terhadap kelulusan
> requirement.

---

## Fase 6 — Level 2A: TinyML di Edge

- [ ] **T6.1 — Kuantisasi model**
  - Berkas baru: `src/ml-training/export_tflite.py`
  - Konversi ke TensorFlow Lite, kuantisasi integer 8-bit.
  - Target: ukuran < 100 KB, dan penurunan akurasi < 5% dibanding model server.
  - Selesai jika: laporan ukuran dan akurasi pasca-kuantisasi tersedia.

- [ ] **T6.2 — Runtime inferensi di firmware**
  - Berkas: `src/esp32_sensor_node/src/` (modul baru, mis. `MLInference.cpp/.h`),
    `platformio.ini` untuk dependensi TFLite Micro.
  - Jalankan sebagai task terpisah di **Core 0**. Core 1 (sampling seismik
    1000 Hz) tidak boleh terganggu — ini prinsip arsitektur existing, lihat
    `docs/02_HARDWARE_FIRMWARE.md`.
  - Selesai jika: latensi inferensi < 50 ms dan laju sampling tidak turun.

- [ ] **T6.3 — Tingkatkan Lone Wolf Mode**
  - Berkas: `src/esp32_sensor_node/src/main.cpp`
  - Saat MQTT terputus, keputusan memakai model, bukan sekadar ambang
    `PGA > 0.60`. Pertahankan ambang lama sebagai fallback bila model gagal.
  - Fase ini menyentuh `main.cpp` dan butuh rebuild + OTA ke node.
  - Selesai jika: node terisolasi bisa membedakan gempa dari getaran kuat
    non-seismik pada uji terkendali.

- [ ] **T6.4 — Distribusi model lewat OTA**
  - Berkas: `src/esp32_sensor_node/src/OTAUpdater.cpp`
  - Manfaatkan mekanisme OTA yang sudah ada; sertakan versi model pada
    payload status agar terlihat di panel fleet.
  - Selesai jika: pembaruan model bisa dilakukan tanpa akses fisik ke node.

---

## Fase 7 — Level 2B: Anomali dan Lead-Time

- [ ] **T7.1 — Model deteksi anomali**
  - Berkas baru: `src/ml-training/train_anomaly.py`
  - Autoencoder ringan atau Isolation Forest, dilatih **hanya** pada data
    getaran normal. Baseline dibentuk per node agar node di area ramai tidak
    dibandingkan dengan node di ruang tenang.
  - Selesai jika: ROC-AUC dilaporkan dan pola tak dikenal terdeteksi pada
    uji tahan (hold-out).

- [ ] **T7.2 — Skor anomali sebagai indikator kesehatan sensor**
  - Berkas: `src/server/ml/inference_engine.py`
  - Anomali persisten pada satu node ditandai sebagai dugaan sensor bermasalah
    atau pemasangan bergeser, bukan sebagai kejadian seismik.
  - Selesai jika: kondisi ini tampil terpisah di dashboard.

- [ ] **T7.3 — Model lead-time**
  - Berkas baru: `src/ml-training/train_leadtime.py`
  - Target dilabeli retrospektif: selisih waktu antara deteksi awal dan
    waktu PGA puncak pada rekaman kejadian.
  - Posisikan sebagai proof-of-concept; laporkan keterbatasan datanya
    secara eksplisit.
  - Selesai jika: MAE dalam detik dilaporkan pada data simulasi.

- [ ] **T7.4 — Panel lead-time dan anomali**
  - Berkas: `seismic.json` dan dashboard React.
  - Hitung mundur lead-time dan deret waktu skor anomali beserta ambangnya.
  - Selesai jika: kedua panel tampil dan sinkron dengan `tb_ml_predictions`.

---

## Fase 8 — Level 2C: Explainability dan MLOps

- [ ] **T8.1 — SHAP**
  - Berkas: `src/server/ml/inference_engine.py`
  - Hitung kontribusi fitur untuk keputusan bertingkat Bahaya/Kritis saja
    (SHAP mahal; jangan dijalankan pada setiap telemetri).
  - Simpan sebagai JSONB di `tb_ml_predictions`.
  - Selesai jika: dashboard menampilkan alasan singkat keputusan terakhir.

- [ ] **T8.2 — Shadow mode**
  - Berkas: `src/server/ml/inference_engine.py` + konfigurasi env
  - Flag `ML_SHADOW_MODE=true`: prediksi dicatat penuh tetapi **tidak**
    memicu aktuator. Ini mode default saat pertama kali deploy.
  - Selesai jika: dengan flag aktif, tidak ada satu pun perintah aktuator
    berasal dari jalur ML, sementara barisnya tetap masuk database.

- [ ] **T8.3 — Pemantauan drift**
  - Berkas baru: `src/server/ml/drift_monitor.py`
  - Bandingkan distribusi fitur dan confidence periode berjalan terhadap
    baseline latih. Jalankan sebagai daemon thread, mengikuti pola
    auto-purge yang sudah ada di sistem.
  - Selesai jika: indikator drift tampil di panel Kesehatan Model.

- [ ] **T8.4 — Panel kesehatan model**
  - Berkas: `seismic.json`
  - Versi model aktif, latensi inferensi, status shadow mode, jumlah fallback,
    dan indikator drift.
  - Selesai jika: seluruh metrik terisi dari data nyata, bukan nilai statis.

- [ ] **T8.5 — Pipeline pelatihan ulang**
  - Berkas baru: `src/ml-training/README.md`
  - Dokumentasikan satu perintah dari data mentah hingga artefak model,
    dengan seed tetap dan dataset terversi.
  - Selesai jika: orang lain bisa mereproduksi metrik yang dilaporkan.

---

## Fase 9 — Deliverable Akademik

- [ ] **T9.1 — Laporan PDF** mengikuti struktur template soal (Introduction,
      System Analysis and Design, System Implementation, Dashboard and Data
      Acquisition, System Testing and Results, Discussion, Conclusion, Appendices).
- [ ] **T9.2 — Dataset CSV final** + dokumentasi skema dan proses pelabelan.
- [ ] **T9.3 — Tautan proyek Wokwi** dan dokumentasi rangkaian.
- [ ] **T9.4 — Video demo 3–5 menit**: deteksi, prediksi, respons aktuator,
      dashboard, dan perbandingan dengan sistem rule-based.
- [ ] **T9.5 — Rapikan repositori**: README diperbarui dengan bagian AIoT,
      `docs/` konsisten, dan artefak model ikut ter-commit atau terdokumentasi
      cara memperolehnya.

---

## Ringkasan Struktur Berkas Baru

> **Catatan repo:** `src/server`, `src/esp32_sensor_node`, dan
> `prototype/grafana-stack` masing-masing adalah **submodule git terpisah**
> (`lindu_server`, `lindu_node`, `lindu_grafana`). Perubahan di dalamnya
> di-PR ke repo submodule-nya sendiri, lalu pointer-nya di-bump lewat PR
> terpisah di repo induk.

Seluruh kode Python — pelatihan maupun runtime — diletakkan di dalam submodule
`src/server`. Ini disengaja: `feature_extractor.py` dipakai bersama oleh
keduanya, dan menaruhnya di repo berbeda akan memaksa akal-akalan import
lintas repo yang rapuh.

```
src/server/                      # submodule: lindu_server
├── ml/
│   ├── feature_extractor.py     # dipakai training DAN runtime
│   ├── inference_engine.py
│   ├── drift_monitor.py             (L2)
│   └── models/                  # artefak + model_meta.json
├── ml_training/                 # offline, tidak ikut runtime
│   ├── export_dataset.py
│   ├── label_dataset.py
│   ├── build_dataset.py
│   ├── train_classifier.py
│   ├── train_magnitude.py
│   ├── train_anomaly.py             (L2)
│   ├── train_leadtime.py            (L2)
│   ├── export_tflite.py             (L2)
│   ├── evaluate_baseline.py
│   ├── RECORDING_PROTOCOL.md
│   └── README.md
├── test_inference.py
└── consensus.py                 # titik integrasi (sudah ada)

src/esp32_sensor_node/src/       # submodule: lindu_node
└── MLInference.cpp/.h               (L2)
```

---

## Urutan Pengerjaan yang Disarankan

```
Fase 0 (blocker data)  →  Fase 1 (dataset)  →  Fase 2 (model)
     →  Fase 3 (integrasi)  →  Fase 4 (aktuator + dashboard)
     →  Fase 5 (evaluasi)   ═══ syarat minimum soal TERPENUHI ═══
     →  Fase 6 (TinyML)  →  Fase 7 (anomali + lead-time)
     →  Fase 8 (MLOps)   →  Fase 9 (deliverable)
```

Fase 0 dan 1 memakan waktu paling lama namun paling menentukan kualitas hasil.
Jangan tergoda mempercepatnya dengan dataset seadanya — metrik yang bagus di
atas dataset yang bocor tidak bernilai apa pun saat diuji dosen.
