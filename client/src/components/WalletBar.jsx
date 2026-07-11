import { useState } from "react";
import { connectWallet, ARBITRATOR_ADDRESS } from "../lib/stellar.js";

function truncate(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 5)}…${addr.slice(-4)}`;
}

export default function WalletBar({ address, onConnected, onError }) {
  const [connecting, setConnecting] = useState(false);

  async function handleConnect() {
    setConnecting(true);
    try {
      const addr = await connectWallet();
      onConnected(addr);
    } catch (err) {
      // WalletError punya `kind` (NOT_FOUND / REJECTED / INSUFFICIENT_BALANCE / UNKNOWN)
      // supaya pesan ke user selalu spesifik, bukan generik.
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
