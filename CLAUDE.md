# Lindu-EEW — Konteks Proyek

Sistem peringatan dini gempa (Earthquake Early Warning) berbasis IoT.
Dokumentasi arsitektur ada di `docs/01`–`docs/06`, ringkasan operasional di `README.md`.

## Pekerjaan yang sedang berjalan

Proyek sedang dalam tahap **Assignment 3 (Final Project)**: mengubah sistem
rule-based Assignment 2 menjadi sistem AIoT dengan integrasi Machine Learning.

**Sebelum mulai bekerja, baca `docs/07_AIOT_IMPLEMENTATION_PLAN.md` lebih dulu.**
Berkas itu adalah satu-satunya sumber kebenaran untuk status pengerjaan.

Alur kerja setiap sesi:

1. Baca `docs/07_AIOT_IMPLEMENTATION_PLAN.md`.
2. Cari task pertama yang masih `[ ]` (belum dicentang) — itulah titik lanjut.
   Kerjakan berurutan; jangan lompat fase.
3. Setelah sebuah task memenuhi kriteria "Selesai jika", ubah `[ ]` menjadi `[x]`
   pada berkas yang sama. Ini yang membuat sesi berikutnya tahu progresnya.
4. Kalau sebuah task berubah cakupannya di tengah jalan, perbarui teks task-nya,
   jangan simpan catatan progres di tempat lain.

Rancangan lengkap beserta alasannya ada di
`../proposal/Proposal_Rancangan_Lindu-EEW_AIoT.docx` (relatif terhadap repo ini).

## Batas cakupan

Titik awal pengerjaan adalah rencana di `docs/07_AIOT_IMPLEMENTATION_PLAN.md`.

Task tertunda, TODO, atau catatan revisi peninggalan assignment sebelumnya —
baik yang ada di komentar kode, branch lama, maupun catatan lain — **diabaikan**
dan tidak perlu diangkat kembali, kecuali user secara eksplisit memintanya.
Satu-satunya pengecualian: bila hal tersebut benar-benar memblokir task yang
sedang dikerjakan, sampaikan ke user dulu sebelum menyentuhnya.

## Aturan teknis yang mengikat

- Jalur deteksi rule-based (`src/server/consensus.py`) tidak boleh dihapus.
  ML ditambahkan sebagai jalur paralel, bukan pengganti — ini keputusan keselamatan.
- Model gagal dimuat atau inferensi melewati anggaran latensi → sistem otomatis
  kembali ke jalur rule-based dan mencatat alasannya.
- Pelatihan model selalu offline. Jangan pernah melatih di jalur real-time.
- `src/server/ml/feature_extractor.py` dipakai bersama oleh pelatihan dan
  inferensi. Satu sumber kebenaran, supaya tidak terjadi train/serve skew.
