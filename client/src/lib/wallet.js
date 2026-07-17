import {
  StellarWalletsKit,
  WalletNetwork,
  FREIGHTER_ID,
  FreighterModule,
  AlbedoModule,
  xBullModule,
} from "@creit.tech/stellar-wallets-kit";
import {
  WalletConnectModule,
  WalletConnectAllowedMethods,
} from "@creit.tech/stellar-wallets-kit/modules/walletconnect.module";

// ============================================================
// Multi-wallet setup — Freighter, Albedo, xBull (desktop extension)
// + WalletConnect (mobile, QR code scan — Freighter Mobile, dll).
// GANTI "YOUR_WALLETCONNECT_PROJECT_ID" dengan Project ID asli dari
// https://cloud.reown.com (gratis, daftar pakai email, 1 project).
// Tanpa project ID yang valid, opsi WalletConnect di modal akan
// muncul tapi gagal connect saat diklik.
// ============================================================
export const kit = new StellarWalletsKit({
  network: WalletNetwork.TESTNET,
  selectedWalletId: FREIGHTER_ID,
  modules: [
    new FreighterModule(),
    new AlbedoModule(),
    new xBullModule(),
    new WalletConnectModule({
      url: "https://escrow.quantumpaychain.org",
      projectId: "af688e100b9324519591346a526e8080",
      method: WalletConnectAllowedMethods.SIGN,
      description: "Escrow AI — protokol escrow di Stellar dengan bantuan AI untuk resolusi sengketa",
      name: "Escrow AI",
      icons: ["https://escrow.quantumpaychain.org/favicon.ico"],
      network: WalletNetwork.TESTNET,
    }),
  ],
});

// ============================================================
// Error handling granular — 3 kasus wajib:
// wallet not found, rejected, insufficient balance
// ============================================================
export class WalletError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // "NOT_FOUND" | "REJECTED" | "INSUFFICIENT_BALANCE" | "UNKNOWN"
  }
}

export function classifyError(err) {
  const msg = (err?.message || String(err) || "").toLowerCase();

  if (
    msg.includes("not installed") ||
    msg.includes("not found") ||
    msg.includes("no wallet") ||
    msg.includes("extension not")
  ) {
    return new WalletError("NOT_FOUND", "Wallet tidak ditemukan — pastikan extension-nya sudah terpasang di browser.");
  }

  if (
    msg.includes("reject") ||
    msg.includes("declin") ||
    msg.includes("denied") ||
    msg.includes("user cancel") ||
    msg.includes("cancelled")
  ) {
    return new WalletError("REJECTED", "Transaksi dibatalkan — kamu menolak permintaan tanda tangan di wallet.");
  }

  if (
    msg.includes("insufficient") ||
    msg.includes("underfunded") ||
    msg.includes("balance") ||
    msg.includes("tx_insufficient")
  ) {
    return new WalletError("INSUFFICIENT_BALANCE", "Saldo tidak cukup untuk menyelesaikan transaksi ini.");
  }

  return new WalletError("UNKNOWN", err?.message || "Terjadi kesalahan tak terduga pada wallet.");
}

// ============================================================
// Connect — buka modal pilih wallet (multi-wallet)
// ============================================================
export function connectWallet() {
  return new Promise((resolve, reject) => {
    kit
      .openModal({
        modalTitle: "Pilih Wallet Stellar",
        onWalletSelected: async (option) => {
          try {
            kit.setWallet(option.id);
            const { address } = await kit.getAddress();
            resolve({ address, walletId: option.id, walletName: option.name });
          } catch (err) {
            reject(classifyError(err));
          }
        },
        onClosed: (err) => {
          if (err) reject(classifyError(err));
          // kalau modal ditutup tanpa pilih wallet, biarkan promise pending
          // (tidak reject) supaya tidak muncul error palsu
        },
      })
      .catch((err) => reject(classifyError(err)));
  });
}

// ============================================================
// Sign transaction — dipanggil dari stellar.js
// ============================================================
export async function signWithKit(xdr, { address, networkPassphrase }) {
  try {
    const { signedTxXdr } = await kit.signTransaction(xdr, { address, networkPassphrase });
    return signedTxXdr;
  } catch (err) {
    throw classifyError(err);
  }
}
