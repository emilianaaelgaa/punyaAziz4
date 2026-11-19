# RM SME Toolkit — aplikasi offline untuk pekerjaan administratif RM SME

Aplikasi ini berbasis browser dan bisa berjalan **100% offline**. Cukup buka `index.html` di Microsoft Edge atau Google Chrome.
Tidak perlu instalasi, hak admin, Python, server, maupun koneksi internet. Semua data nasabah diproses dan disimpan
**hanya di laptop Anda**.

| # | Modul | Fungsi |
|---|-------|--------|
| 1 | **Rekap Mutasi Rekening Koran** | Membaca PDF e-statement, PDF hasil scan (OCR), CSV, dan Excel. Mengelompokkan debit/kredit, membuang transaksi contra, lalu menghitung omzet bersih per bulan dan rata-rata saldo harian. Ada validasi saldo baris per baris. |
| 2 | **Pengingat Jatuh Tempo** | Daftar tenggat fasilitas, asuransi agunan, covenant, dan dokumen legal. Bisa diekspor ke kalender Outlook (.ics) dengan pengingat H-60/H-30/H-7/H-0 yang ikut tersinkron ke HP. |
| 3 | **Generator NAK & Call Report** | Isi satu lembar data debitur (atau impor dari Excel), lalu buat draf Word dengan satu klik. Rasio keuangan dihitung otomatis. Bisa memakai templat Word format kantor sendiri. |
| 4 | **Kalkulator Kelayakan** | Menghitung indikasi plafon maksimal dari DSCR, LTV agunan, dan kebutuhan modal kerja, plus simulasi angsuran. Tersedia juga versi Excel untuk HP. |
| 5 | **Ekstraksi Legalitas** | Mengambil NIB, NPWP, nomor/tanggal akta, notaris, SK Kemenkumham, KBLI, pengurus, dan komposisi saham dari PDF atau foto (OCR offline). |
| 6 | **Analisa Keuangan & Rasio Kredit** | Membaca laporan keuangan (PDF, PDF scan, foto, Excel) secara otomatis, lalu menilai 25+ rasio kredit dengan acuan yang bisa diatur. Juga menghitung proforma setelah fasilitas baru (DSCR, ICR, DER, Debt/EBITDA, LTV) dan membandingkan omzet rekening koran dengan penjualan di laporan keuangan. |

Modul saling terhubung. Hasil modul 1 dan 5 bisa dikirim ke modul 3 dengan tombol **"Kirim ke Generator NAK"**.
Modul 3 dan 6 memakai profil debitur yang sama, sehingga hasil penilaian rasio otomatis masuk ke dokumen NAK.

---

## Cara memakai

1. Salin seluruh folder `rm-sme-toolkit` ke laptop kerja, misalnya ke `Documents\RM SME Toolkit\`.
   Folder `vendor` wajib ikut tersalin karena berisi mesin PDF, Excel, Word, dan OCR.
2. Klik dua kali `index.html`. Bila terbuka di browser lain, klik kanan lalu pilih *Open with → Microsoft Edge*.
3. (Opsional) Buat shortcut `index.html` di desktop.
4. Untuk mencoba tanpa data nasabah, gunakan tombol **"Coba dengan contoh data fiktif"** atau file di folder `contoh/`
   (semua nama dan angka di sana rekaan).

Browser yang sudah diuji: Chromium/Edge/Chrome versi terbaru. Firefox kemungkinan juga bisa, tetapi belum diuji.

### Modul 1 — Rekening koran
- Unggah satu atau beberapa file sekaligus. Bila nasabah punya beberapa rekening, unggah semuanya. Transfer antar
  rekening sendiri (nilai sama, arah berlawanan, dalam jendela ±3 hari) otomatis ditandai **contra**.
- Isi *nama pemilik/pengurus/afiliasi & nomor rekening sendiri*. Transaksi yang keterangannya memuat teks itu
  otomatis dianggap contra.
- Transaksi berkata kunci "pindah buku/overbooking" **tidak** langsung dibuang, hanya ditandai *perlu cek*, karena pindah buku
  bisa saja ke pihak ketiga.
- **Kredit bersih (omzet)** = total kredit − contra − bunga/jasa giro − pencairan kredit − koreksi/reversal.
- **Rata-rata saldo harian** = rata-rata saldo akhir hari untuk setiap hari kalender. Hari tanpa transaksi memakai saldo hari sebelumnya.
- **Validasi saldo:** setiap baris dicek dengan rumus *saldo sebelumnya + kredit − debit = saldo tercetak*. Baris yang
  tidak cocok (salah baca atau ada baris hilang) diberi warna merah beserta selisihnya. Ini cara cepat memastikan hasil baca akurat.
- Kategori dan tanda contra bisa diubah manual per transaksi, dan ringkasan langsung dihitung ulang.
- Ekspor Excel berisi sheet Ringkasan, Rekap Bulanan (gabungan dan per rekening), Transaksi, dan Saldo Harian.

### Modul 2 — Pengingat
- Tambah item manual atau **Impor Excel** (unduh templatnya dulu).
- **📅 Ekspor ke Outlook (.ics)**, lalu impor ke Outlook:
  - Outlook klasik: *File → Open & Export → Import/Export → Import an iCalendar (.ics)*.
  - Outlook baru/Web: *Kalender → Tambahkan kalender → Unggah dari file*.
  Pengingat akan muncul di laptop dan di aplikasi Outlook HP walau toolkit ini tidak sedang dibuka.
- Opsional: panduan Power Automate untuk notifikasi Teams otomatis tersedia di bagian bawah tab (berjalan di tenant M365 kantor).

### Modul 3 — Generator dokumen
- Templat bawaan: **Call Report** dan **Kerangka NAK** (`templates/`).
- **Memakai format kantor sendiri:** buka templat NAK/Call Report resmi Anda di Word, ketik tag seperti `{nama_perusahaan}`,
  `{plafon}`, `{current_ratio_3}` di tempat yang diinginkan, lalu unggah lewat *Tambah templat sendiri*. Daftar tag lengkap
  ada di tombol *Lihat daftar tag yang tersedia*. Untuk tabel pengurus, tulis `{#pengurus}{nama}` di sel pertama dan
  `{saham}{/pengurus}` di sel terakhir pada satu baris tabel.
- **Lembar ringkasan Excel:** unduh, isi di Excel, lalu impor kembali. Data debitur juga bisa disimpan sebagai profil.

### Modul 6 — Analisa keuangan & rasio kredit
- **Baca laporan keuangan otomatis:** tarik file PDF, PDF scan, foto, atau Excel. Neraca dan laba rugi boleh berupa file terpisah.
  Aplikasi mengenali nama akun yang umum (Indonesia/Inggris), satuan (rupiah, ribuan, jutaan), dan urutan kolom tahun.
  Hasilnya ditampilkan dulu untuk diperiksa sebelum diterapkan.
- **Cek konsistensi otomatis:** total aset = liabilitas + ekuitas, aset lancar ≤ total aset, dan lain-lain. Pemeriksaan ini menangkap salah baca OCR dan salah ketik.
- **Rasio yang dinilai (per periode, dengan acuan & status ✓/✗, plus tren):**
  - *Pertumbuhan & profitabilitas:* pertumbuhan penjualan, GPM, OPM, NPM, ROA, ROE
  - *Likuiditas:* current ratio, quick ratio, cash ratio, modal kerja bersih
  - *Solvabilitas & leverage:* DER, gearing (utang bank/ekuitas), debt to asset, Debt/EBITDA
  - *Kemampuan bayar:* EBITDA, ICR, DSCR
  - *Aktivitas:* DSO, DIO, DPO, trade cycle, TATO, kebutuhan modal kerja
- **Proforma setelah fasilitas baru:** angsuran baru, DSCR, ICR, DER, Debt/EBITDA, LTV, coverage agunan, plafon KMK ÷ kebutuhan modal kerja,
  mutasi rekening koran ÷ penjualan laporan keuangan, dan saldo rata-rata ÷ angsuran.
  Untuk perpanjangan/take over, isi outstanding dan kewajiban fasilitas lama agar tidak terhitung dua kali.
- **Acuan bawaan adalah acuan umum analisa kredit, bukan ketentuan resmi** (mis. DSCR ≥ 1,25x, DER ≤ 2,5x, current ratio ≥ 1,0x,
  ICR ≥ 1,5x, Debt/EBITDA ≤ 4x, LTV ≤ 80%). Semua acuan bisa diubah di *Pengaturan → Acuan rasio penilaian kredit*.
- Untuk laporan interim (mis. Januari–Juni), isi jumlah bulan agar rasio disetahunkan.

### Modul 4 — Kalkulator
- Plafon indikatif = nilai **terkecil** dari: kemampuan bayar (DSCR), agunan (nilai × LTV), dan kebutuhan modal kerja (khusus KMK).
- Parameter DSCR minimum, LTV per jenis agunan, porsi pembiayaan, dan pembulatan bisa diatur di **Pengaturan**.
  **Nilai bawaan hanyalah contoh. Wajib disesuaikan dengan ketentuan kredit SME yang berlaku.**
- **Di HP:** buka `excel/Kalkulator-Kelayakan.xlsx` dengan Excel Mobile (misalnya lewat OneDrive kantor). Rumusnya sama.

### Modul 5 — Legalitas
- PDF digital (misalnya NIB dari OSS) dibaca langsung. PDF scan dan foto dibaca dengan OCR bahasa Indonesia yang tertanam di aplikasi.
  Pemuatan pertama ±2–5 detik, lalu ±5–20 detik per halaman.
- Teks hasil baca bisa dikoreksi, lalu klik *Baca ulang teks*. Semua hasil bisa diedit, disalin (tempel ke Excel), atau diekspor.
- Tips foto: lurus, terang, tanpa bayangan, resolusi ≥ 300 dpi untuk hasil scan.

---

## Keamanan data

- **Koneksi keluar diblokir di level browser.** `index.html` memasang *Content-Security-Policy* `connect-src blob: data:`
  sehingga fetch/XHR/WebSocket/beacon ke alamat mana pun ditolak sebelum keluar dari laptop. Mesin OCR juga berjalan di
  dalam worker yang semua akses jaringannya dimatikan. Klik lencana **🔒 Offline** untuk menjalankan uji isolasi jaringan.
- **Tidak ada unggahan, telemetri, maupun CDN.** Semua pustaka tersimpan di folder `vendor/`.
- **Lokasi data:** file yang Anda unggah hanya dibaca di memori dan tidak disalin ke mana pun. Daftar pengingat, profil debitur, templat sendiri,
  dan pengaturan disimpan di penyimpanan lokal browser (localStorage) di laptop ini.
  Data bisa dihapus kapan saja di *Pengaturan → Hapus semua data*. Gunakan *Ekspor backup* untuk memindahkan data ke laptop lain.
- File hasil (Excel/Word/.ics) tersimpan di folder Unduhan. Perlakukan sesuai klasifikasi data nasabah.
- Sebelum dipakai untuk data nasabah sungguhan, **mintalah reviu/izin dari unit TI atau keamanan informasi** sesuai kebijakan yang berlaku.
- **Laptop pribadi:** aplikasinya berjalan sama persis, tetapi menyimpan data nasabah di perangkat pribadi umumnya diatur ketat oleh kebijakan bank.
  Selama masih di laptop pribadi, gunakan data contoh/fiktif. Data nasabah asli baru diproses di laptop kantor atau setelah ada izin.

## Keterbatasan

- Pembaca rekening koran bersifat **generik**. Pembaca mengenali baris bertanggal, nominal, dan saldo, lalu memverifikasinya dengan saldo berjalan.
  Format bank yang tidak biasa (misalnya kolom terpecah aneh, atau tanpa saldo) mungkin perlu disesuaikan. Indikator *Validasi saldo* akan memberi tahu bila ada masalah.
- OCR tidak sempurna. Angka yang salah baca tertangkap oleh validasi saldo, tetapi nama dan nomor pada dokumen legal tetap wajib dicek manual.
- Ekstraksi legalitas berbasis pola teks. Akta dengan redaksi yang tidak umum mungkin tidak semua datanya terbaca.
- Pembaca laporan keuangan mengenali nama akun yang lazim. Akun dengan nama tidak biasa bisa luput dan perlu diisi manual (ditandai "tidak ditemukan" saat pemeriksaan).
- Kalkulator memberi **indikasi**, bukan keputusan kredit.

## Struktur folder

```
rm-sme-toolkit/
├── index.html                 ← buka file ini
├── assets/app.css
├── js/                        ← kode aplikasi (per modul)
├── vendor/                    ← pustaka offline (pdf.js, SheetJS, docxtemplater, PizZip, Tesseract + data bahasa Indonesia)
├── templates/                 ← templat Word bawaan (bisa diedit)
├── excel/Kalkulator-Kelayakan.xlsx
├── contoh/                    ← file contoh FIKTIF untuk mencoba
└── tools/                     ← skrip pembuat vendor/templat/contoh (untuk pengembang)
```

## Untuk pengembang

Semua file di `vendor/`, `templates/`, `excel/`, dan `contoh/` sudah jadi. Skrip di `tools/` hanya diperlukan bila ingin membuat ulang:

```bash
npm install pdfjs-dist@3.11.174 xlsx@0.18.5 pizzip docxtemplater tesseract.js@5 tesseract.js-core@5 @tesseract.js-data/ind
node tools/build-ocr-engine.js ./node_modules   # vendor/ocr-engine.js (worker + WASM + data bahasa, satu file)
python3 tools/build-templates.py                # templates/*.docx + js/templates-data.js
python3 tools/build-excel-calculator.py         # excel/Kalkulator-Kelayakan.xlsx
python3 tools/make-samples.py                   # contoh/* + tools/samples-expected.json
```

Catatan teknis: browser memblokir Web Worker dan `fetch()` dari `file://`. Karena itu pdf.js berjalan dengan *fake worker*
di thread utama, sedangkan Tesseract dijalankan dari Blob URL yang berisi worker, core WASM, dan data bahasa sekaligus.

## Lisensi pihak ketiga

| Pustaka | Lisensi |
|---------|---------|
| pdf.js 3.11 (Mozilla) | Apache-2.0 |
| SheetJS Community Edition 0.18 | Apache-2.0 |
| docxtemplater | MIT |
| PizZip | MIT (dual MIT/GPL-3.0, dipakai di bawah MIT) |
| tesseract.js 5 & tesseract.js-core | Apache-2.0 |
| Data bahasa Tesseract `ind` (tessdata_best int) | Apache-2.0 |
