const STAGE_LABEL = {
  building: "Menyusun transaksi…",
  simulating: "Mensimulasikan…",
  awaiting_signature: "Menunggu tanda tangan wallet…",
  submitting: "Mengirim ke network…",
  pending: "Pending — menunggu konfirmasi ledger…",
  success: "Berhasil dikonfirmasi",
  failed: "Gagal",
};

const STAGE_ORDER = ["building", "simulating", "awaiting_signature", "submitting", "pending", "success"];

export default function TransactionStatus({ stage, detail, onDismiss }) {
  if (!stage) return null;

  const isFailed = stage === "failed";
  const isSuccess = stage === "success";
  const currentIdx = STAGE_ORDER.indexOf(stage);

  return (
    <div className={`tx-status ${isFailed ? "tx-failed" : isSuccess ? "tx-success" : "tx-pending"}`}>
      <div className="tx-status-header">
        <span className="tx-status-dot" />
        <span className="tx-status-label">{STAGE_LABEL[stage] || stage}</span>
        {(isSuccess || isFailed) && (
          <button className="tx-status-close" onClick={onDismiss}>
            ✕
          </button>
        )}
      </div>

      {!isFailed && !isSuccess && (
        <div className="tx-progress-track">
          {STAGE_ORDER.slice(0, 5).map((s, i) => (
            <div key={s} className={`tx-progress-seg ${i <= currentIdx ? "filled" : ""}`} />
          ))}
        </div>
      )}

      {isSuccess && detail && (
        <a
          href={`https://stellar.expert/explorer/testnet/tx/${detail}`}
          target="_blank"
          rel="noreferrer"
          className="tx-status-link"
        >
          Lihat di Stellar Expert →
        </a>
      )}

      {isFailed && detail && <div className="tx-status-detail">{detail}</div>}
    </div>
  );
}
