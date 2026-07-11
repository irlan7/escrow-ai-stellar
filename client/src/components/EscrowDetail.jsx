import { useState, useEffect } from "react";
import {
  getEscrow,
  releaseEscrow,
  raiseDispute,
  resolveDispute,
  stroopsToUsdc,
  ARBITRATOR_ADDRESS,
} from "../lib/stellar.js";
import AIRecommendation from "./AIRecommendation.jsx";

function truncate(addr) {
  if (!addr) return "-";
  return `${addr.slice(0, 5)}…${addr.slice(-4)}`;
}

const STATUS_LABEL = {
  Pending: "PENDING",
  Disputed: "DISPUTED",
  Released: "RELEASED",
  Refunded: "REFUNDED",
};
const STATUS_CLASS = {
  Pending: "status-pending",
  Disputed: "status-disputed",
  Released: "status-released",
  Refunded: "status-refunded",
};

export default function EscrowDetail({ address, presetId, onError, onSuccess, onTxStatus, eventTick }) {
  const [escrowId, setEscrowId] = useState(presetId || "");
  const [escrow, setEscrow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [showDisputeForm, setShowDisputeForm] = useState(false);

  async function handleFetch(idOverride) {
    const id = idOverride ?? escrowId;
    if (!id) return;
    setLoading(true);
    setEscrow(null);
    try {
      const result = await getEscrow(id);
      setEscrow(result);
      setEscrowId(String(id));
    } catch (err) {
      onError(err.message || "Escrow tidak ditemukan");
    } finally {
      setLoading(false);
    }
  }

  // auto-fetch kalau dibuka dari tab "Semua Escrow"
  useState(() => {
    if (presetId) handleFetch(presetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId]);

  // Real-time sync: kalau ada event on-chain baru dari contract dan
  // escrow ini sedang ditampilkan, refresh otomatis tanpa perlu klik "Cari".
  useEffect(() => {
    if (eventTick > 0 && escrow?.id) {
      handleFetch(escrow.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventTick]);

  async function withAction(fn) {
    if (!address) {
      onError("Connect wallet dulu.");
      return;
    }
    setActionLoading(true);
    try {
      const result = await fn();
      onSuccess(result);
      await handleFetch(escrow.id);
      setShowDisputeForm(false);
      setDisputeReason("");
    } catch (err) {
      onError(err.message || "Aksi gagal");
    } finally {
      setActionLoading(false);
    }
  }

  const isBuyer = escrow && address === escrow.buyer;
  const isArbitrator = address === ARBITRATOR_ADDRESS;

  return (
    <div className="panel">
      <h2>Lihat & Kelola Escrow</h2>
      <p className="sub">Masukkan ID escrow untuk melihat status dan mengambil aksi.</p>

      <div className="field" style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <label>Escrow ID</label>
          <input
            type="number"
            placeholder="1"
            value={escrowId}
            onChange={(e) => setEscrowId(e.target.value)}
          />
        </div>
        <button className="btn btn-secondary" onClick={() => handleFetch()} disabled={loading}>
          {loading ? <span className="spinner" /> : "Cari"}
        </button>
      </div>

      {escrow && (
        <>
          <div style={{ marginTop: 10 }}>
            <span className={`status-pill ${STATUS_CLASS[escrow.status] || ""}`}>
              {STATUS_LABEL[escrow.status] || escrow.status}
            </span>
          </div>

          <div className="amount-hero">
            {stroopsToUsdc(escrow.amount)} <span style={{ fontSize: 16, color: "var(--ink-dim)" }}>USDC</span>
          </div>

          <div className="detail-row">
            <span className="k">Escrow ID</span>
            <span className="v">#{escrow.id}</span>
          </div>
          <div className="detail-row">
            <span className="k">Buyer</span>
            <span className="v">{truncate(escrow.buyer)}</span>
          </div>
          <div className="detail-row">
            <span className="k">Seller</span>
            <span className="v">{truncate(escrow.seller)}</span>
          </div>
          <div className="detail-row">
            <span className="k">Deskripsi</span>
            <span className="v" style={{ fontFamily: "var(--body)", textAlign: "right" }}>
              {escrow.description}
            </span>
          </div>
          {escrow.disputeReason && (
            <div className="detail-row">
              <span className="k">Alasan Dispute</span>
              <span className="v" style={{ fontFamily: "var(--body)", textAlign: "right" }}>
                {escrow.disputeReason}
              </span>
            </div>
          )}

          {/* ---- Pending: buyer bisa release atau dispute ---- */}
          {escrow.status === "Pending" && (
            <>
              {isBuyer ? (
                <div className="btn-row">
                  <button
                    className="btn btn-primary"
                    disabled={actionLoading}
                    onClick={() =>
                      withAction(() => releaseEscrow({ escrowId: escrow.id, caller: address }, onTxStatus))
                    }
                  >
                    ✅ Release Dana ke Seller
                  </button>
                  <button
                    className="btn btn-danger"
                    disabled={actionLoading}
                    onClick={() => setShowDisputeForm((v) => !v)}
                  >
                    ⚠️ Ajukan Dispute
                  </button>
                </div>
              ) : (
                <p className="hint">
                  Hanya buyer ({truncate(escrow.buyer)}) yang bisa release atau mengajukan dispute.
                </p>
              )}

              {showDisputeForm && (
                <div style={{ marginTop: 14 }}>
                  <div className="field">
                    <label>Alasan Dispute</label>
                    <textarea
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                      placeholder="Revisi kedua belum dikerjakan sesuai brief, sudah lewat 5 hari dari tenggat"
                    />
                  </div>
                  <button
                    className="btn btn-danger btn-block"
                    disabled={actionLoading || !disputeReason}
                    onClick={() =>
                      withAction(() =>
                        raiseDispute({ escrowId: escrow.id, caller: address, reason: disputeReason }, onTxStatus)
                      )
                    }
                  >
                    {actionLoading ? <span className="spinner" /> : "Kirim Dispute"}
                  </button>
                </div>
              )}
            </>
          )}

          {/* ---- Disputed: tampilkan AI recommendation + tombol arbitrator ---- */}
          {escrow.status === "Disputed" && (
            <>
              <AIRecommendation escrow={{ ...escrow, amount: stroopsToUsdc(escrow.amount) }} onError={onError} />

              {isArbitrator ? (
                <div className="btn-row">
                  <button
                    className="btn btn-secondary"
                    disabled={actionLoading}
                    onClick={() =>
                      withAction(() =>
                        resolveDispute({ escrowId: escrow.id, caller: address, releaseToSeller: false }, onTxStatus)
                      )
                    }
                  >
                    ↩ Refund ke Buyer
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={actionLoading}
                    onClick={() =>
                      withAction(() =>
                        resolveDispute({ escrowId: escrow.id, caller: address, releaseToSeller: true }, onTxStatus)
                      )
                    }
                  >
                    Release ke Seller
                  </button>
                </div>
              ) : (
                <p className="hint">
                  Keputusan akhir hanya bisa diambil oleh arbitrator ({truncate(ARBITRATOR_ADDRESS)}).
                </p>
              )}
            </>
          )}

          {(escrow.status === "Released" || escrow.status === "Refunded") && (
            <p className="hint" style={{ marginTop: 10 }}>
              Escrow ini sudah selesai — dana telah{" "}
              {escrow.status === "Released" ? "dilepas ke seller" : "dikembalikan ke buyer"}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
