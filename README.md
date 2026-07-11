# Escrow AI — Frontend

Frontend + AI recommendation service for **Escrow AI**, an on-chain escrow protocol on Stellar (Soroban) with an AI recommendation layer for dispute resolution.

Connected to a smart contract already live on testnet:
Contract ID : CC2ABCGDBFMYMZFBDYTBDJBSIXOXFUO7D5U72M2ALVGHG3ZTIGMPUIM4
USDC (SAC)  : CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
Arbitrator  : GBYKGB7JKBF54BXVJ2JOVG6OE35GCRKNZK7M7RSMPJNFBT45WLAERR6K
Network     : Stellar Testnet
## Submission details

- **Live demo**: https://escrow.quantumpaychain.org
- **Deployed contract address**: [`CC2ABCGDBFMYMZFBDYTBDJBSIXOXFUO7D5U72M2ALVGHG3ZTIGMPUIM4`](https://stellar.expert/explorer/testnet/contract/CC2ABCGDBFMYMZFBDYTBDJBSIXOXFUO7D5U72M2ALVGHG3ZTIGMPUIM4) (Stellar Testnet)
- **Sample transaction** (`create_escrow` call, verifiable on Stellar Expert): [`d881345172492fa5267bf96d78b3473d8ab973d804290ef8a45145686f9b072c`](https://stellar.expert/explorer/testnet/tx/d881345172492fa5267bf96d78b3473d8ab973d804290ef8a45145686f9b072c)
- **Wallet options available** (StellarWalletsKit multi-wallet modal):

  ![Wallet selection modal - Freighter, Albedo, xBull](./docs/wallet-options.png)

## Folder structure
escrow-ai-frontend/
├── client/     React + Vite — buyer/seller/arbitrator UI, multi-wallet connect
└── server/     Express — proxies Cerebras AI calls (keeps the API key off the browser)
## Prerequisites

- Node.js 18+ and npm
- Any Stellar wallet supported by [StellarWalletsKit](https://stellarwalletskit.dev) — Freighter, Albedo, or xBull, network set to **Testnet**
- A free Cerebras API key — get one at https://cloud.ai.cerebras.ai/

## Setup — Backend (AI recommendation service)

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env` and set `CEREBRAS_API_KEY` to your real API key (free at cloud.ai.cerebras.ai). Then run:

```bash
npm run dev
```

The server runs on `http://localhost:3001`. Verify by opening `http://localhost:3001/health` — it should return `{"status":"ok",...}`.

## Setup — Frontend

In a separate terminal:

```bash
cd client
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173` in your browser (make sure a supported wallet extension is active).

## Testing flow

1. **Connect Wallet** — click the button top-right, pick a wallet in the modal (Freighter/Albedo/xBull), approve in the wallet popup
2. **Create Escrow** — fill in the seller address, USDC amount, description → click "Lock Funds into Escrow"
   - The connected wallet needs testnet USDC balance + a trustline (see "Set up a test wallet" below)
3. **View / Manage Escrow** — enter an escrow ID to see its details
   - If status is `Pending` and the connected wallet is that escrow's buyer → Release / Raise Dispute buttons appear
   - If status is `Disputed` → an "Get AI Recommendation" button appears; if the connected wallet is the arbitrator address → resolve buttons appear
4. **All Escrows** — browse every escrow ever created, click a row to open its details

## Set up a test wallet (buyer needs testnet USDC)

The buyer wallet needs a trustline + USDC balance before it can call `create_escrow`:

1. Open [Stellar Lab Friendbot](https://lab.stellar.org/account/fund) → select the USDC asset → click "Add trustline" for your buyer address
2. Open the [Circle USDC Faucet](https://faucet.circle.com/) → select the Stellar network → paste the buyer address → request tokens (20 USDC per request)

## Deploying to production — VPS (existing system nginx)

This setup **does not run its own reverse proxy** — the Escrow AI containers only bind to `127.0.0.1` (internal ports). The system nginx already running on the VPS (serving other projects) gets one new config file for the Escrow AI domain. No other domain/project config is touched.

### VPS prerequisites
- Docker & Docker Compose installed
- System nginx + certbot already running (outside Docker)
- The domain `escrow.quantumpaychain.org` (or your own) already has an **A record pointing to this VPS's IP**

### 1. Run the containers (internal ports only)

```bash
git clone https://github.com/irlan7/escrow-ai-stellar.git
cd escrow-ai-stellar
cp .env.example .env
nano .env   # set DOMAIN, CEREBRAS_API_KEY

docker compose up -d --build
```

Verify the containers are running on internal ports (not exposed publicly):

```bash
docker compose ps
curl http://127.0.0.1:8095   # should return the frontend's HTML
curl http://127.0.0.1:8096/health   # should return {"status":"ok",...}
```

### 2. Register the domain with the system nginx

```bash
sudo cp deploy/escrow.quantumpaychain.org /etc/nginx/sites-available/escrow.quantumpaychain.org
sudo ln -s /etc/nginx/sites-available/escrow.quantumpaychain.org /etc/nginx/sites-enabled/
sudo nginx -t                    # always check syntax before reloading
sudo systemctl reload nginx
```

### 3. Enable HTTPS via certbot (same as every other domain on this VPS)

```bash
sudo certbot --nginx -d escrow.quantumpaychain.org
```

Certbot automatically appends the SSL block + HTTP→HTTPS redirect to the config file, exactly like the other domains on this VPS (`dex.quantumpaychain.org`, etc.) — no manual setup needed.

Open `https://escrow.quantumpaychain.org` — frontend at `/`, AI backend at `/api/*`.

### Updating after a code change

```bash
git pull
docker compose up -d --build
```
(No need to repeat the nginx/certbot steps — those are one-time setup.)

### Vercel mirror (optional, to satisfy the organizers' request)

1. Import this repo into [vercel.com](https://vercel.com), root directory `client`
2. Set env var `VITE_AI_API_URL` = `https://escrow.quantumpaychain.org` (same backend, shared from the VPS)
3. Deploy — the `xxx.vercel.app` URL serves as a backup / compliance proof

## Technical notes

- **Multi-wallet**: wallet connection goes through [StellarWalletsKit](https://stellarwalletskit.dev), supporting Freighter, Albedo, and xBull at once via a single selection modal — not hardcoded to one wallet.
- **Granular error handling**: the `WalletError` class (in `client/src/lib/wallet.js`) classifies errors into 3 categories with specific messages — wallet not found, transaction rejected by user, and insufficient balance.
- **Transaction status tracking**: every write transaction (create/release/dispute/resolve) goes through explicit stages shown live in the UI — `building → simulating → awaiting_signature → submitting → pending → success/failed` (see the `TransactionStatus.jsx` component).
- **Event listening & state sync**: `client/src/lib/stellar.js` polls `getEvents()` from the Soroban RPC every 6 seconds to watch for real on-chain events from our contract. When a new event is detected, the "View/Manage Escrow" and "All Escrows" screens auto-refresh their data with no manual click needed — a brief "● live" indicator appears in the header when an event is detected.
- All contract write calls (`create_escrow`, `release_escrow`, `raise_dispute`, `resolve_dispute`) require a wallet signature — the user's wallet signs, never the backend.
- Read calls (`get_escrow`, `get_all_escrows`) only simulate a transaction (no signature/fee needed), using the arbitrator address as the simulation source since it's guaranteed to exist on the ledger.
- The AI recommendation runs through the backend (`server/`) using Cerebras (free tier) so the API key is never exposed to the browser. If the live API call fails, the backend automatically returns a fallback response so the demo never fully breaks.
