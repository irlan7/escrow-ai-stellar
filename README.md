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

## Deploy ke production — VPS (nginx sistem sudah ada)

Setup ini **tidak menjalankan reverse proxy sendiri** — container Escrow AI cuma bind ke `127.0.0.1` (port internal), lalu nginx sistem yang sudah berjalan di VPS (untuk project lain) ditambahkan satu file config baru untuk domain Escrow AI. Tidak menyentuh config domain/project lain sama sekali.

### Prasyarat di VPS
- Docker & Docker Compose sudah terpasang
- nginx sistem + certbot sudah berjalan (bukan di dalam Docker)
- Domain `escrow.quantumpaychain.org` (atau domain lain) sudah **diarahkan A record ke IP VPS ini**

### 1. Jalankan container (port internal saja)

```bash
git clone https://github.com/irlan7/escrow-ai-stellar.git
cd escrow-ai-stellar
cp .env.example .env
nano .env   # isi DOMAIN, CEREBRAS_API_KEY

docker compose up -d --build
```

Cek container jalan di port internal (bukan diekspos publik):

```bash
docker compose ps
curl http://127.0.0.1:8095   # harus balas HTML frontend
curl http://127.0.0.1:8096/health   # harus balas {"status":"ok",...}
```

### 2. Daftarkan domain ke nginx sistem

```bash
sudo cp deploy/escrow.quantumpaychain.org /etc/nginx/sites-available/escrow.quantumpaychain.org
sudo ln -s /etc/nginx/sites-available/escrow.quantumpaychain.org /etc/nginx/sites-enabled/
sudo nginx -t                    # wajib cek syntax dulu sebelum reload
sudo systemctl reload nginx
```

### 3. Aktifkan HTTPS lewat certbot (sama seperti domain lain di VPS ini)

```bash
sudo certbot --nginx -d escrow.quantumpaychain.org
```

Certbot otomatis menambahkan blok SSL + redirect HTTP→HTTPS ke file config, sama seperti domain lain (`dex.quantumpaychain.org`, dst) — tidak perlu setup manual.

Buka `https://escrow.quantumpaychain.org` — frontend di `/`, backend AI di `/api/*`.

### Update setelah perubahan kode

```bash
git pull
docker compose up -d --build
```
(Tidak perlu ulang langkah nginx/certbot — itu cuma sekali di awal.)

### Mirror di Vercel (opsional, untuk memenuhi permintaan panitia)

1. Import repo ke [vercel.com](https://vercel.com), root directory `client`
2. Env var `VITE_AI_API_URL` = `https://escrow.quantumpaychain.org` (backend yang sama, di-share dari VPS)
3. Deploy — URL `xxx.vercel.app` sebagai cadangan/bukti compliance

## Catatan teknis

- **Multi-wallet**: koneksi wallet lewat [StellarWalletsKit](https://stellarwalletskit.dev), mendukung Freighter, Albedo, dan xBull sekaligus lewat satu modal pilihan — bukan hardcode ke satu wallet.
- **Error handling granular**: kelas `WalletError` (di `client/src/lib/wallet.js`) mengklasifikasi error jadi 3 kategori dengan pesan spesifik — wallet tidak ditemukan, transaksi ditolak user, dan saldo tidak cukup.
- **Transaction status tracking**: setiap transaksi tulis (create/release/dispute/resolve) melewati tahapan eksplisit yang ditampilkan real-time di UI — `building → simulating → awaiting_signature → submitting → pending → success/failed` (lihat komponen `TransactionStatus.jsx`).
- **Event listening & state sync**: `client/src/lib/stellar.js` melakukan polling `getEvents()` dari Soroban RPC setiap 6 detik untuk memantau event on-chain sungguhan dari contract kita. Saat ada event baru terdeteksi, layar "Lihat/Kelola Escrow" dan "Semua Escrow" otomatis refresh datanya tanpa perlu klik manual — indikator "● live" muncul sebentar di header saat event terdeteksi.
- Semua panggilan tulis ke contract (`create_escrow`, `release_escrow`, `raise_dispute`, `resolve_dispute`) memerlukan signature dari wallet — wallet pengguna yang menandatangani, bukan backend.
- Panggilan baca (`get_escrow`, `get_all_escrows`) hanya melakukan simulasi transaksi (tidak butuh signature/fee), memakai alamat arbitrator sebagai source simulasi karena sudah pasti ada di ledger.
- Rekomendasi AI berjalan lewat backend (`server/`) memakai Cerebras (gratis) supaya API key tidak pernah terekspos ke browser. Kalau panggilan API live gagal, backend otomatis mengembalikan respons fallback supaya demo tidak macet total.
