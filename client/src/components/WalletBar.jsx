import { useState } from "react";
import { connectWallet, ARBITRATOR_ADDRESS } from "../lib/stellar.js";

function truncate(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 5)}…${addr.slice(-4)}`;
}

export default function WalletBar({ address, onConnected, onError }) {
  const [connecting, setConnecting] = useState(false);

  async function handleConnect() {
    console.log('1. Tombol ke-klik');
    setConnecting(true);
    try {
      console.log('2. Mulai connectWallet');
      const addr = await connectWallet();
      console.log('3. Berhasil dapat address:', addr);
      onConnected(addr);
    } catch (err) {
      console.error('ERROR:', err.message || err);
      onError(err.message || "Gagal connect wallet");
    } finally {
      setConnecting(false);
    }
  }

  if (!address) {
    return (
      <div className="wallet-bar">
        <button className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
          {connecting ? <span className="spinner" /> : "Connect Freighter"}
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
