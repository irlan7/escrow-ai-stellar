import { useState, useEffect } from "react";
import WalletBar from "./components/WalletBar.jsx";
import CreateEscrow from "./components/CreateEscrow.jsx";
import EscrowDetail from "./components/EscrowDetail.jsx";
import AllEscrows from "./components/AllEscrows.jsx";
import TransactionStatus from "./components/TransactionStatus.jsx";
import FeedbackWidget from "./components/FeedbackWidget.jsx";
import { CONTRACT_ID, subscribeToContractEvents } from "./lib/stellar.js";
import { trackEvent } from "./lib/analytics.js";

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
  const [txStatus, setTxStatus] = useState(null); // {stage, detail}
  const [eventTick, setEventTick] = useState(0); // naik tiap ada event on-chain baru
  const [liveIndicator, setLiveIndicator] = useState(false);

  // Analytics — page_view sekali saat app pertama kali dibuka.
  useEffect(() => {
    trackEvent("page_view");
  }, []);

  // ------------------------------------------------------------
  // Event listening & real-time sync — polling getEvents() dari
  // contract kita. Setiap event baru (transfer dana, dsb) memicu
  // eventTick naik, yang di-dengarkan oleh EscrowDetail/AllEscrows
  // untuk auto-refresh data tanpa perlu klik manual.
  // ------------------------------------------------------------
  useEffect(() => {
    const unsubscribe = subscribeToContractEvents((ev) => {
      setEventTick((t) => t + 1);
      setLiveIndicator(true);
      setTimeout(() => setLiveIndicator(false), 2000);
    }, 6000);
    return unsubscribe;
  }, []);

  function handleWalletConnected(addr) {
    setAddress(addr);
    trackEvent("wallet_connect", addr);
  }

  function showToast(type, message, url) {
    setToast({ type, message, url });
    setTimeout(() => setToast(null), 8000);
  }

  function handleTxStatus(stage, detail) {
    setTxStatus({ stage, detail });
    if (stage === "success" || stage === "failed") {
      setTimeout(() => setTxStatus((cur) => (cur?.stage === stage ? null : cur)), 6000);
    }
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
            <span className="tag">
              Stellar Soroban · Testnet
              {liveIndicator && <span className="live-dot" title="Event on-chain baru terdeteksi"> ● live</span>}
            </span>
          </div>
        </div>
        <WalletBar address={address} onConnected={handleWalletConnected} onError={handleError} />
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
        <CreateEscrow
          address={address}
          onSuccess={handleTxSuccess}
          onError={handleError}
          onTxStatus={handleTxStatus}
        />
      )}

      {tab === "detail" && (
        <EscrowDetail
          address={address}
          presetId={selectedId}
          onSuccess={handleTxSuccess}
          onError={handleError}
          onTxStatus={handleTxStatus}
          eventTick={eventTick}
        />
      )}

      {tab === "all" && (
        <AllEscrows onSelect={goToEscrow} onError={handleError} eventTick={eventTick} />
      )}

      <p className="hint" style={{ textAlign: "center", marginTop: 30 }}>
        Contract ID: {CONTRACT_ID}
      </p>

      <TransactionStatus
        stage={txStatus?.stage}
        detail={txStatus?.detail}
        onDismiss={() => setTxStatus(null)}
      />

      <FeedbackWidget address={address} />

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
