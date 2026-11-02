# DataFlow Control

Dashboard gelap berbahasa Indonesia untuk memantau dan mengaktifkan/menonaktifkan workflow pada instance n8n yang di-host sendiri. API key n8n hanya disimpan di server; browser tidak pernah menerimanya.

## Stack

- Node.js 20.19+ dengan ES Modules
- Express 4 dan dotenv
- React 18 + Vite 7 (JavaScript)
- Satu file CSS, tanpa framework UI atau state library

## Setup

1. Pastikan Node.js 20.19 atau lebih baru dan instance n8n dapat diakses.
2. Instal dependensi:

   ```powershell
   npm install
   ```

3. Salin konfigurasi contoh, lalu isi nilainya:

   ```powershell
   Copy-Item .env.example .env
   ```

   ```dotenv
   N8N_URL=http://localhost:5678
   N8N_API_KEY=api-key-dari-n8n
   DASH_USER=admin
   DASH_PASS=password-dashboard-yang-kuat
   PORT=3000
   ```

   Buat API key di n8n melalui **Settings → n8n API → Create an API key**. Server menolak berjalan jika `N8N_URL`, `N8N_API_KEY`, atau `DASH_PASS` kosong.

## Menjalankan

### Produksi (satu port)

```powershell
npm run build
npm start
```

Buka `http://localhost:3000`. Express melindungi dan menyajikan `dist/`, sehingga frontend dan API berada di origin yang sama.

### Pengembangan (hot reload)

Jalankan dua terminal:

```powershell
# Terminal 1 - backend di :3000
npm run dev:server
```

```powershell
# Terminal 2 - Vite di :5173
npm run dev:client
```

Buka `http://localhost:5173`. Vite meneruskan `/api` ke `http://localhost:3000`, termasuk header Basic Auth.

## Cara mengetes

1. Buka aplikasi; browser harus meminta Basic Auth. Kredensial salah harus menghasilkan `401`.
2. Pastikan kartu statistik, daftar workflow, dan 20 eksekusi terbaru tampil.
3. Klik nama workflow untuk memfilter log eksekusi; klik nama yang sama lagi untuk mereset filter.
4. Klik toggle workflow saat filter aktif. Filter tidak boleh berubah dan hanya baris terkait yang menampilkan status pending.
5. Tunggu 15 detik; jam “Diperbarui” dan data harus menyegarkan otomatis.
6. Hentikan n8n sementara. Dashboard harus menampilkan banner error, dan endpoint proxy mengembalikan HTTP `502` dengan `{ "error": "..." }`.
7. Kecilkan viewport ke lebar ponsel. Tidak boleh ada overflow halaman; tabel eksekusi dapat digeser horizontal.

Uji endpoint langsung:

```powershell
curl.exe -u admin:password-dashboard-yang-kuat http://localhost:3000/api/workflows
curl.exe -u admin:password-dashboard-yang-kuat "http://localhost:3000/api/executions"
curl.exe -u admin:password-dashboard-yang-kuat -X POST http://localhost:3000/api/workflows/<id>/activate
```

## Alur request

1. Browser memanggil `/api/...` pada server Express dengan Basic Auth.
2. Express memvalidasi kredensial menggunakan perbandingan hash SHA-256 yang timing-safe.
3. Express memanggil REST API n8n (`/api/v1/...`) dengan header `X-N8N-API-KEY`. ID workflow dan query `workflowId` di-encode sebelum masuk ke URL.
4. Respons n8n diteruskan sebagai JSON. Kegagalan koneksi atau respons non-2xx dari n8n diterjemahkan menjadi HTTP `502` dan `{ "error": "pesan" }` tanpa membocorkan API key.
5. Di produksi, semua route statis juga berada di belakang Basic Auth.

## Catatan keamanan

- `.env` diabaikan Git; jangan commit nilai rahasia.
- Gunakan HTTPS (reverse proxy) jika dashboard diakses melalui jaringan.
- Endpoint aktivasi memakai `POST`; tidak ada perubahan state melalui `GET`.
- `Cache-Control: no-store` dipasang pada seluruh route `/api`.
