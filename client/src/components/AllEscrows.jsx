import { useState } from "react";
import { getAllEscrows, stroopsToUsdc } from "../lib/stellar.js";

const STATUS_CLASS = {
  Pending: "status-pending",
  Disputed: "status-disputed",
  Released: "status-released",
  Refunded: "status-refunded",
};

export default function AllEscrows({ onSelect, onError }) {
  const [escrows, setEscrows] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleLoad() {
    setLoading(true);
    try {
      const result = await getAllEscrows();
      setEscrows(result);
    } catch (err) {
      onError(err.message || "Gagal memuat daftar escrow");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel">
      <h2>Semua Escrow</h2>
      <p className="sub">Daftar seluruh escrow yang tercatat di contract.</p>

      <button className="btn btn-secondary" onClick={handleLoad} disabled={loading}>
        {loading ? <span className="spinner" /> : "Muat Semua Escrow"}
      </button>

      {escrows && escrows.length === 0 && (
        <p className="empty-state">Belum ada escrow yang dibuat.</p>
      )}

      {escrows && escrows.length > 0 && (
        <table className="escrow-table" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Deskripsi</th>
              <th>Jumlah</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {escrows.map((e) => (
              <tr key={e.id} className="clickable" onClick={() => onSelect(e.id)}>
                <td>#{e.id}</td>
                <td style={{ fontFamily: "var(--body)" }}>{e.description}</td>
                <td>{stroopsToUsdc(e.amount)} USDC</td>
                <td>
                  <span className={`status-pill ${STATUS_CLASS[e.status] || ""}`}>{e.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
