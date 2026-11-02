# DataFlow Control

Dashboard gelap berbahasa Indonesia untuk memantau, menjalankan, dan menghentikan workflow pada instance n8n yang di-host sendiri. API key n8n dan kredensial login hanya disimpan di server; browser tidak pernah menerimanya.

## Stack

- Node.js 20.19+ dengan ES Modules
- Express 4 dan dotenv
- React 18 + Vite 7 (JavaScript)
- Satu file CSS, tanpa framework UI atau state library

## Fitur utama

- Ringkasan statistik workflow dan 20 eksekusi terbaru, disegarkan otomatis setiap 15 detik.
- Toggle aktif/nonaktif workflow langsung dari tabel.
- **Jalankan** workflow dari dashboard, memakai sesi login n8n.
- **Pantau** eksekusi: progres tiap langkah, langkah yang sedang berjalan, dan yang masih mengantre, lengkap dengan penjelasan bahasa sehari-hari per langkah.
- **Berhenti** untuk menghentikan eksekusi yang sedang berjalan.
- Penjelasan AI (OpenRouter) setelah eksekusi selesai.
- Log realtime per workflow lewat SSE dan panel log di halaman utama.

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

   # Opsional
   OPENROUTER_API_KEY=api-key-openrouter
   N8N_EMAIL=email-akun-n8n
   N8N_PASSWORD=password-akun-n8n
   ```

   Buat API key di n8n melalui **Settings → n8n API → Create an API key**. Server menolak berjalan jika `N8N_URL`, `N8N_API_KEY`, atau `DASH_PASS` kosong.

   Variabel opsional:

   | Variabel | Dipakai untuk | Jika kosong |
   | --- | --- | --- |
   | `OPENROUTER_API_KEY` | Penjelasan AI setelah eksekusi selesai | Endpoint balas `503` |
   | `N8N_EMAIL` + `N8N_PASSWORD` | Tombol **Jalankan** (login UI n8n) | Endpoint balas `503` |

   `.env` hanya dibaca saat server start; restart server setiap kali nilainya berubah.

## Menjalankan

### Produksi (satu port, satu proses)

```powershell
npm run build   # sekali setiap ada perubahan frontend
npm start       # menjalankan server Express
```

Buka `http://localhost:3000`. Dua perintah itu **hanya menyalakan aplikasi ini**: Express sebagai backend sekaligus penyaji hasil build frontend dari `dist/`, dalam satu proses dan satu port. Tidak ada proses Vite terpisah, dan **n8n tidak ikut dinyalakan** — instance n8n harus sudah berjalan sendiri di alamat `N8N_URL`.

Karena frontend dan API berada di origin yang sama, tidak ada konfigurasi proxy atau CORS yang perlu disiapkan.

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
curl.exe -u admin:password-dashboard-yang-kuat -X POST http://localhost:3000/api/workflows/<id>/run
curl.exe -u admin:password-dashboard-yang-kuat -X POST http://localhost:3000/api/executions/<id>/stop
curl.exe -u admin:password-dashboard-yang-kuat "http://localhost:3000/api/executions/<id>/stream"
```

## Alur request

1. Browser memanggil `/api/...` pada server Express dengan Basic Auth.
2. Express memvalidasi kredensial menggunakan perbandingan hash SHA-256 yang timing-safe.
3. Express memanggil REST API n8n (`/api/v1/...`) dengan header `X-N8N-API-KEY`. ID workflow dan query `workflowId` di-encode sebelum masuk ke URL.
4. Respons n8n diteruskan sebagai JSON. Kegagalan koneksi atau respons non-2xx dari n8n diterjemahkan menjadi HTTP `502` dan `{ "error": "pesan" }` tanpa membocorkan API key.
5. Di produksi, semua route statis juga berada di belakang Basic Auth.

## Catatan keamanan

- `.env` diabaikan Git; jangan commit nilai rahasia.
- `N8N_PASSWORD` hanya dipakai server untuk membuat sesi login n8n dan tidak pernah dikirim ke browser; sesinya disimpan di memori proses.
- Gunakan HTTPS (reverse proxy) jika dashboard diakses melalui jaringan.
- Endpoint aktivasi memakai `POST`; tidak ada perubahan state melalui `GET`.
- `Cache-Control: no-store` dipasang pada seluruh route `/api`.
