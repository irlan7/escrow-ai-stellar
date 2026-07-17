import { useState } from "react";
import { connectWallet, ARBITRATOR_ADDRESS } from "../lib/stellar.js";
import { trackEvent } from "../lib/analytics.js";

function truncate(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 5)}…${addr.slice(-4)}`;
}

export default function WalletBar({ address, onConnected, onError }) {
  const [connecting, setConnecting] = useState(false);

  async function handleConnect() {
    setConnecting(true);
    // Dicatat SEBELUM proses connect, supaya kita bisa hitung berapa
    // banyak orang MENCOBA connect (bukan cuma yang berhasil) — penting
    // untuk mendiagnosis di mana user drop-off, terutama untuk alur
    // WalletConnect di HP yang belum tentu selalu mulus.
    trackEvent("wallet_connect_attempted", null, {
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    });
    try {
      const addr = await connectWallet();
      onConnected(addr);
    } catch (err) {
      // WalletError punya `kind` (NOT_FOUND / REJECTED / INSUFFICIENT_BALANCE / UNKNOWN)
      // supaya pesan ke user selalu spesifik, bukan generik.
      trackEvent("wallet_connect_failed", null, { kind: err.kind || "UNKNOWN", message: err.message });
      onError(err.message || "Gagal connect wallet");
    } finally {
      setConnecting(false);
    }
  }

  if (!address) {
    return (
      <div className="wallet-bar">
        <button className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
          {connecting ? <span className="spinner" /> : "Connect Wallet"}
        </button>
      </div>
    );
  }

  const isArbitrator = address === ARBITRATOR_ADDRESS;

  return (
    <div className="wallet-bar">
      {isArbitrator && <span className="role-badge">ARBITRATOR</span>}
      <span className="address-chip">{truncate(address)}</span>
    </div>
  );
}
