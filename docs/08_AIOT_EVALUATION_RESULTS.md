# Hasil Evaluasi Sistem AIoT (Assignment 3)

*Dihasilkan otomatis oleh `ml_training/generate_report.py` pada 2026-09-25 07:18 UTC.*

*Jangan menyunting berkas ini dengan tangan — jalankan ulang generatornya
setiap kali model dilatih ulang, supaya angkanya tidak pernah berbeda dari
artefak yang sesungguhnya.*

> ⚠️ **CONTOH KELUARAN — angka di bawah berasal dari DATA SINTETIS yang dipakai untuk memvalidasi pipeline, BUKAN rekaman lapangan. Jalankan ulang generatornya setelah melatih pada data sungguhan.**

## 1. Ringkasan Perbandingan

Kedua sistem dievaluasi pada **split uji yang sama persis**, memakai
dataset dan pembagian yang identik.

| Metrik | Rule-based (Assignment 2) | ML (Assignment 3) | Selisih |
|---|---|---|---|
| Accuracy <br><sub>(lebih tinggi lebih baik)</sub> | 0.5000 | 1.0000 | +0.5000 ✅ |
| Macro F1 <br><sub>(lebih tinggi lebih baik)</sub> | 0.3333 | 1.0000 | +0.6667 ✅ |
| False positive rate <br><sub>(lebih rendah lebih baik)</sub> | 1.0000 | 0.0000 | -1.0000 ✅ |

Jumlah sampel uji: **12** jendela.

> **False positive rate adalah metrik yang paling menentukan** untuk sistem
> ini. Sirine yang berbunyi karena truk lewat merusak kepercayaan pengguna
> jauh lebih cepat daripada akurasi yang turun sedikit — dan begitu
> kepercayaan hilang, peringatan yang benar pun akan diabaikan.

## 2. Rincian per Kelas

### Rule-based

| Kelas | Precision | Recall | F1 | Sampel |
|---|---|---|---|---|
| `earthquake` | 0.5000 | 1.0000 | 0.6667 | 6 |
| `noise` | 0.0000 | 0.0000 | 0.0000 | 6 |

### ML

| Kelas | Precision | Recall | F1 | Sampel |
|---|---|---|---|---|
| `earthquake` | 1.0000 | 1.0000 | 1.0000 | 6 |
| `noise` | 1.0000 | 1.0000 | 1.0000 | 6 |

### Confusion matrix — Rule-based

| asli \ prediksi | `earthquake` | `noise` |
|---|---|---|
| **`earthquake`** | 6 | 0 |
| **`noise`** | 6 | 0 |

### Confusion matrix — ML

| asli \ prediksi | `earthquake` | `noise` |
|---|---|---|
| **`earthquake`** | 6 | 0 |
| **`noise`** | 0 | 6 |

## 3. Model

- **Jenis**: random_forest
- **Versi**: `20260925-070929`
- **Dipilih berdasarkan**: macro_f1 pada split val
- **Seed**: 42
- **Jumlah fitur**: 21
- **Baris latih / val / uji**: 144 / 12 / 12

### Fitur paling berpengaruh

| Fitur | Kepentingan |
|---|---|
| `sta_lta_std` | 0.1694 |
| `freq_mean` | 0.1289 |
| `sta_lta_mean` | 0.1288 |
| `freq_max` | 0.1279 |
| `hv_ratio` | 0.1257 |
| `sta_lta_max` | 0.1171 |
| `freq_min` | 0.1005 |
| `freq_std` | 0.0480 |
| `accel_mag_mean` | 0.0184 |
| `accel_mag_max` | 0.0156 |

## 4. Estimasi Dini Puncak Guncangan

Dari **1.0 detik pertama** sebuah kejadian,
seberapa kuat guncangan ini akan menjadi?

| Metrik | Persistensi | Model | Selisih |
|---|---|---|---|
| MAE (PGA, G) | 0.0473 | 0.0084 | -0.0389 ✅ |
| RMSE (PGA, G) | 0.0622 | 0.0113 | -0.0509 ✅ |
| MAE (magnitudo) | 0.0399 | 0.0067 | -0.0332 ✅ |

Kejadian latih / uji: 17 / 7

**Pembandingnya persistensi** — anggap puncak sama dengan PGA tertinggi yang
sudah terlihat di jendela awal. Itulah yang secara efektif dilakukan sistem
lama. Pembanding ini dipilih karena tidak diturunkan dari model mana pun,
berbeda dengan `tb_system_alerts.magnitude` yang justru dihasilkan formula
rule-based sendiri sehingga tidak sah dijadikan target.

**Model mengalahkan persistensi:** ya

## 5. Keterbatasan

Hal-hal berikut membatasi sejauh mana angka di atas boleh ditafsirkan.
Ditulis terus terang karena menyembunyikannya justru lebih merugikan saat
dipertanyakan.

1. **Kelas `earthquake` berasal dari peragaan**, bukan gempa tektonik
   sungguhan — meja getar dan simulasi Wokwi. Tidak ada gempa nyata yang
   terjadi selama masa proyek. Metrik sebagus apa pun tidak membuktikan
   sistem akan bekerja pada gempa sesungguhnya.

2. **Klasifikasi hanya dilakukan pada jendela yang terpicu** (ada sampel
   dengan PGA ≥ 0,12 G). Firmware mengirim telemetri 10 Hz saat terpicu dan
   1 Hz saat tenang, sehingga kepadatan sampel sendiri sudah mengkodekan
   lapisan pertama filter rule-based. Membatasi populasi ini mencegah model
   'menang' hanya dengan menghafal laju sampling. Konsekuensinya, angka di
   atas tidak berlaku untuk getaran tenang.

3. **Dataset berukuran kecil.** Split dilakukan per kejadian, bukan per
   baris, sehingga tidak ada kebocoran — tetapi jumlah kejadian yang sedikit
   membuat metrik uji punya ketidakpastian yang besar.

4. **Magnitudo tidak diprediksi secara langsung.** Tidak ada label magnitudo
   independen; satu-satunya yang tersedia dihasilkan oleh formula rule-based
   sendiri, sehingga melatih model untuk menirunya tidak bermakna.

5. **Model belum diberi wewenang atas aktuator.** Sistem berjalan dalam
   shadow mode: prediksi dicatat penuh tetapi jalur rule-based tetap yang
   menentukan. Lihat `ml_training/README.md` untuk prosedur melepasnya.

