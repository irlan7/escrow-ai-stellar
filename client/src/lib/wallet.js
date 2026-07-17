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
  WALLET_CONNECT_ID,
} from "@creit.tech/stellar-wallets-kit/modules/walletconnect.module";

// ============================================================
// Multi-wallet setup — Freighter, Albedo, xBull (desktop extension)
// + WalletConnect (mobile, QR code/deep-link — Freighter Mobile, dll).
// GANTI "YOUR_WALLETCONNECT_PROJECT_ID" dengan Project ID asli dari
// https://cloud.reown.com (gratis, daftar pakai email, 1 project).
// Tanpa project ID yang valid, opsi WalletConnect di modal akan
// muncul tapi gagal connect saat diklik.
//
// PENTING (UX fix): di HP, module extension desktop (Freighter,
// Albedo, xBull) SELALU muncul "Not available" — itu benar secara
// teknis (extension browser memang tidak ada di mobile), tapi bikin
// user bingung karena mereka punya app mobile-nya dan malah coba
// klik opsi yang salah. Solusinya: di device mobile, modul-modul
// itu disembunyikan total, cuma WalletConnect yang ditampilkan —
// jadi tidak ada opsi membingungkan yang "kelihatan ada tapi mati".
// ============================================================
const isMobileDevice =
  typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const walletConnectModule = new WalletConnectModule({
  url: "https://escrow.quantumpaychain.org",
  projectId: "af688e100b9324519591346a526e8080",
  method: WalletConnectAllowedMethods.SIGN,
  description: "Escrow AI — protokol escrow di Stellar dengan bantuan AI untuk resolusi sengketa",
  name: "Escrow AI",
  icons: ["https://escrow.quantumpaychain.org/favicon.ico"],
  network: WalletNetwork.TESTNET,
  // NOTE: sempat dicoba tambah `appKitOptions.featuredWalletIds` supaya
  // Freighter langsung tampil di daftar utama (tanpa perlu search), tapi
  // opsi itu menyebabkan crash/layar hitam di sebagian device mobile —
  // kemungkinan besar karena bentuk config-nya tidak didukung penuh oleh
  // versi library yang ter-install. Di-revert demi stabilitas — user
  // tetap bisa connect via "View all" -> cari "Freighter", cuma 1 langkah
  // ekstra, jauh lebih baik daripada app crash total.
});

const modules = isMobileDevice
  ? [walletConnectModule]
  : [new FreighterModule(), new AlbedoModule(), new xBullModule(), walletConnectModule];

export const kit = new StellarWalletsKit({
  network: WalletNetwork.TESTNET,
  // BUG YANG DIPERBAIKI: sebelumnya di-hardcode ke FREIGHTER_ID untuk
  // semua device. Di mobile, modul Freighter TIDAK terdaftar (lihat
  // `modules` di atas), jadi kit gagal construct total dengan error
  // 'Wallet id "freighter" is not supported' — ini yang menyebabkan
  // layar hitam/blank di banyak HP. selectedWalletId sekarang mengikuti
  // modul yang benar-benar terdaftar untuk device tersebut.
  selectedWalletId: isMobileDevice ? WALLET_CONNECT_ID : FREIGHTER_ID,
  modules,
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
