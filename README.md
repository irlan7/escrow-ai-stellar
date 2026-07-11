# Escrow AI — Frontend

Frontend + AI recommendation service untuk **Escrow AI**, protokol escrow on-chain di Stellar (Soroban) dengan lapisan rekomendasi AI saat terjadi dispute.

Terhubung ke smart contract yang sudah live di testnet:

```
Contract ID : CC2ABCGDBFMYMZFBDYTBDJBSIXOXFUO7D5U72M2ALVGHG3ZTIGMPUIM4
USDC (SAC)  : CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
Arbitrator  : GBYKGB7JKBF54BXVJ2JOVG6OE35GCRKNZK7M7RSMPJNFBT45WLAERR6K
Network     : Stellar Testnet
```

## Struktur folder

```
escrow-ai-frontend/
├── client/     React + Vite — UI buyer/seller/arbitrator, connect wallet Freighter
└── server/     Express — proxy panggilan Cerebras AI (biar API key tidak ke-expose di browser)
```

## Prasyarat

- Node.js 18+ dan npm
- Wallet Stellar apa saja yang didukung [StellarWalletsKit](https://stellarwalletskit.dev) — Freighter, Albedo, atau xBull, network di-set ke **Testnet**
- API key Cerebras (gratis) — dapatkan di https://cloud.ai.cerebras.ai/

## Setup — Backend (AI recommendation service)

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env`, isi `CEREBRAS_API_KEY` dengan API key asli kamu (gratis di cloud.ai.cerebras.ai). Lalu jalankan:

```bash
npm run dev
```

Server jalan di `http://localhost:3001`. Cek dengan buka `http://localhost:3001/health` — harus muncul `{"status":"ok",...}`.

## Setup — Frontend

Di terminal terpisah:

```bash
cd client
npm install
cp .env.example .env
npm run dev
```

Buka `http://localhost:5173` di browser (pastikan Freighter extension aktif).

## Alur testing

1. **Connect Freighter** — klik tombol di kanan atas, approve di popup Freighter
2. **Buat Escrow** — isi alamat seller, jumlah USDC, deskripsi → klik "Kunci Dana ke Escrow"
   - Wallet yang connect harus punya saldo USDC testnet + trustline (lihat bagian "Siapkan wallet test" di bawah)
3. **Lihat / Kelola Escrow** — masukkan escrow ID untuk lihat detail
   - Kalau status `Pending` dan wallet connect = buyer escrow itu → muncul tombol Release / Ajukan Dispute
   - Kalau status `Disputed` → muncul tombol "Minta Rekomendasi AI", lalu kalau wallet connect = alamat arbitrator → muncul tombol resolve
4. **Semua Escrow** — lihat daftar semua escrow yang pernah dibuat, klik baris untuk buka detailnya

## Siapkan wallet test (buyer perlu USDC testnet)

Wallet buyer butuh trustline + saldo USDC sebelum bisa `create_escrow`:

1. Buka [Stellar Lab Friendbot](https://lab.stellar.org/account/fund) → pilih asset USDC → klik "Add trustline" untuk alamat buyer kamu
2. Buka [Circle USDC Faucet](https://faucet.circle.com/) → pilih network Stellar → paste alamat buyer → minta token (20 USDC per request)

## Deploy ke production — VPS dengan Docker

Setup ini menjalankan frontend + backend + reverse proxy HTTPS otomatis (Caddy) dalam satu `docker compose up`, cocok untuk VPS (misal Singapura) dengan domain custom (`escrow.quantumpaychain.org`, dsb).

### Prasyarat di VPS
- Docker & Docker Compose terpasang (`curl -fsSL https://get.docker.com | sh`)
- Dua domain/subdomain sudah **diarahkan (A record) ke IP VPS ini** sebelum deploy — Caddy butuh ini untuk provisioning sertifikat HTTPS otomatis lewat Let's Encrypt:
  - `escrow.quantumpaychain.org` → frontend
  - `escrow-api.quantumpaychain.org` → backend/API
- Port 80 dan 443 terbuka di firewall VPS

### Langkah deploy

```bash
git clone https://github.com/irlan7/escrow-ai-stellar.git
cd escrow-ai-stellar   # sesuaikan kalau frontend ada di sub-folder repo

cp .env.example .env
nano .env   # isi DOMAIN_CLIENT, DOMAIN_API, dan CEREBRAS_API_KEY

docker compose up -d --build
```

Caddy otomatis provisioning sertifikat HTTPS begitu domain sudah resolve ke VPS ini — tunggu 1-2 menit di percobaan pertama. Cek status:

```bash
docker compose ps
docker compose logs -f caddy
```

Setelah jalan, buka `https://escrow.quantumpaychain.org` — harus langsung HTTPS otomatis, frontend terhubung ke backend di `https://escrow-api.quantumpaychain.org`.

### Update setelah perubahan kode

```bash
git pull
docker compose up -d --build
```

### Mirror di Vercel (opsional, untuk memenuhi permintaan panitia)

Panitia hackathon meminta deploy di Vercel. VPS dengan domain custom bisa jadi deployment utama, sambil tetap sediakan mirror sederhana di Vercel sebagai bukti compliance:

1. Import repo ini ke [vercel.com](https://vercel.com), set root directory ke `client`
2. Tambahkan environment variable `VITE_AI_API_URL` mengarah ke `https://escrow-api.quantumpaychain.org` (backend yang sama, di-share dari VPS)
3. Deploy — dapat URL `xxx.vercel.app` sebagai cadangan/bukti compliance

Backend cukup satu (di VPS), kedua frontend (VPS + Vercel) bisa memakainya bersama.

## Catatan teknis

- **Multi-wallet**: koneksi wallet lewat [StellarWalletsKit](https://stellarwalletskit.dev), mendukung Freighter, Albedo, dan xBull sekaligus lewat satu modal pilihan — bukan hardcode ke satu wallet.
- **Error handling granular**: kelas `WalletError` (di `client/src/lib/wallet.js`) mengklasifikasi error jadi 3 kategori dengan pesan spesifik — wallet tidak ditemukan, transaksi ditolak user, dan saldo tidak cukup.
- **Transaction status tracking**: setiap transaksi tulis (create/release/dispute/resolve) melewati tahapan eksplisit yang ditampilkan real-time di UI — `building → simulating → awaiting_signature → submitting → pending → success/failed` (lihat komponen `TransactionStatus.jsx`).
- **Event listening & state sync**: `client/src/lib/stellar.js` melakukan polling `getEvents()` dari Soroban RPC setiap 6 detik untuk memantau event on-chain sungguhan dari contract kita. Saat ada event baru terdeteksi, layar "Lihat/Kelola Escrow" dan "Semua Escrow" otomatis refresh datanya tanpa perlu klik manual — indikator "● live" muncul sebentar di header saat event terdeteksi.
- Semua panggilan tulis ke contract (`create_escrow`, `release_escrow`, `raise_dispute`, `resolve_dispute`) memerlukan signature dari wallet — wallet pengguna yang menandatangani, bukan backend.
- Panggilan baca (`get_escrow`, `get_all_escrows`) hanya melakukan simulasi transaksi (tidak butuh signature/fee), memakai alamat arbitrator sebagai source simulasi karena sudah pasti ada di ledger.
- Rekomendasi AI berjalan lewat backend (`server/`) memakai Cerebras (gratis) supaya API key tidak pernah terekspos ke browser. Kalau panggilan API live gagal, backend otomatis mengembalikan respons fallback supaya demo tidak macet total.
