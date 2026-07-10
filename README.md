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
└── server/     Express — proxy panggilan Claude API (biar API key tidak ke-expose di browser)
```

## Prasyarat

- Node.js 18+ dan npm
- [Freighter wallet extension](https://www.freighter.app/) terpasang di browser, network di-set ke **Testnet**
- API key Anthropic (Claude) — dapatkan di https://console.anthropic.com/settings/keys

## Setup — Backend (AI recommendation service)

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env`, isi `ANTHROPIC_API_KEY` dengan API key asli kamu. Lalu jalankan:

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

## Deploy ke production

- **Frontend (`client/`)** → deploy ke [Vercel](https://vercel.com): import repo, set root directory ke `client`, tambahkan env var `VITE_AI_API_URL` mengarah ke URL backend yang sudah dideploy.
- **Backend (`server/`)** → deploy ke [Railway](https://railway.app) atau [Render](https://render.com): import repo, set root directory ke `server`, tambahkan env var `ANTHROPIC_API_KEY`.

**Jangan pernah commit file `.env`** — API key Anthropic harus tetap rahasia, hanya hidup di environment variable backend.

## Catatan teknis

- Semua panggilan tulis ke contract (`create_escrow`, `release_escrow`, `raise_dispute`, `resolve_dispute`) memerlukan signature dari Freighter — wallet pengguna yang menandatangani, bukan backend.
- Panggilan baca (`get_escrow`, `get_all_escrows`) hanya melakukan simulasi transaksi (tidak butuh signature/fee), memakai alamat arbitrator sebagai source simulasi karena sudah pasti ada di ledger.
- Rekomendasi AI berjalan lewat backend (`server/`) supaya API key Claude tidak pernah terekspos ke browser. Kalau panggilan API live gagal (rate limit, jaringan, dsb), backend otomatis mengembalikan respons fallback supaya demo tidak macet total.
