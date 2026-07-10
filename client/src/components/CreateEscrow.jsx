import { useState } from "react";
import { createEscrow } from "../lib/stellar.js";

export default function CreateEscrow({ address, onSuccess, onError }) {
  const [seller, setSeller] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!address) {
      onError("Connect wallet dulu sebagai buyer sebelum membuat escrow.");
      return;
    }
    if (!seller || !amount || !description) {
      onError("Semua field wajib diisi.");
      return;
    }

    setLoading(true);
    try {
      const result = await createEscrow({
        buyer: address,
        seller: seller.trim(),
        amount,
        description,
      });
      onSuccess(result, result.returnValue);
      setSeller("");
      setAmount("");
      setDescription("");
    } catch (err) {
      onError(err.message || "Gagal membuat escrow");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel">
      <h2>Buat Escrow Baru</h2>
      <p className="sub">
        Kunci dana USDC untuk transaksi dengan seller. Dana baru dilepas saat kamu
        konfirmasi selesai, atau lewat resolusi dispute oleh arbitrator.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Alamat Wallet Seller</label>
          <input
            type="text"
            placeholder="GDLT..."
            value={seller}
            onChange={(e) => setSeller(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Jumlah (USDC)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="5.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Deskripsi Transaksi</label>
          <textarea
            placeholder="Jasa desain logo untuk UMKM di Malang — 2x revisi"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <p className="hint">
          Dana akan terkunci di smart contract Soroban hingga transaksi selesai atau
          sengketa diajukan.
        </p>

        <div className="btn-row">
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? <span className="spinner" /> : "🔒 Kunci Dana ke Escrow"}
          </button>
        </div>
      </form>
    </div>
  );
}
