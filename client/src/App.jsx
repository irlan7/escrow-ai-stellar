import { useState } from "react";
import WalletBar from "./components/WalletBar.jsx";
import CreateEscrow from "./components/CreateEscrow.jsx";
import EscrowDetail from "./components/EscrowDetail.jsx";
import AllEscrows from "./components/AllEscrows.jsx";
import { CONTRACT_ID } from "./lib/stellar.js";

const TABS = [
  { id: "create", label: "Buat Escrow" },
  { id: "detail", label: "Lihat / Kelola Escrow" },
  { id: "all", label: "Semua Escrow" },
];

export default function App() {
  const [address, setAddress] = useState(null);
  const [tab, setTab] = useState("create");
  const [selectedId, setSelectedId] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(type, message, url) {
    setToast({ type, message, url });
    setTimeout(() => setToast(null), 8000);
  }

  function handleTxSuccess(result) {
    const idMsg =
      typeof result?.returnValue === "number" || typeof result?.returnValue === "bigint"
        ? ` (Escrow ID: ${result.returnValue})`
        : "";
    showToast("success", `Transaksi berhasil${idMsg}`, result.explorerUrl);
  }

  function handleError(message) {
    showToast("error", message);
  }

  function goToEscrow(id) {
    setSelectedId(id);
    setTab("detail");
  }

  return (
    <div className="app">
      <div className="header">
        <div className="brand">
          <div className="mark" />
          <div>
            <h1>Escrow AI</h1>
            <span className="tag">Stellar Soroban · Testnet</span>
          </div>
        </div>
        <WalletBar address={address} onConnected={setAddress} onError={handleError} />
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "create" && (
        <CreateEscrow address={address} onSuccess={handleTxSuccess} onError={handleError} />
      )}

      {tab === "detail" && (
        <EscrowDetail
          address={address}
          presetId={selectedId}
          onSuccess={handleTxSuccess}
          onError={handleError}
        />
      )}

      {tab === "all" && <AllEscrows onSelect={goToEscrow} onError={handleError} />}

      <p className="hint" style={{ textAlign: "center", marginTop: 30 }}>
        Contract ID: {CONTRACT_ID}
      </p>

      {toast && (
        <div className={`toast ${toast.type}`}>
          <div>{toast.message}</div>
          {toast.url && (
            <a href={toast.url} target="_blank" rel="noreferrer">
              Lihat di Stellar Expert →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
