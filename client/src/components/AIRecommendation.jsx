import { useState } from "react";
import { getAIRecommendation } from "../lib/api.js";

export default function AIRecommendation({ escrow, onError }) {
  const [rec, setRec] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleFetch() {
    setLoading(true);
    setRec(null);
    try {
      const result = await getAIRecommendation({
        description: escrow.description,
        disputeReason: escrow.disputeReason,
        amount: escrow.amount,
      });
      setRec(result);
    } catch (err) {
      onError(err.message || "Gagal memuat rekomendasi AI");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ai-card">
      <div className="ai-title">
        <span className="glyph" />
        AI Recommendation
        {rec && <span className="conf">confidence {rec.confidence}%</span>}
      </div>

      {!rec && (
        <button className="btn btn-violet" onClick={handleFetch} disabled={loading}>
          {loading ? <span className="spinner" /> : "Minta Rekomendasi AI"}
        </button>
      )}

      {rec && (
        <>
          <div className="rec-line">
            → Rekomendasi:{" "}
            {rec.recommendation === "buyer" ? "Refund ke Buyer" : "Release ke Seller"}
          </div>
          <ul>
            {(rec.reasoning || []).map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
          <span className="ai-note">
            Rekomendasi AI, bukan keputusan final — arbitrator manusia yang memutuskan.
          </span>
        </>
      )}
    </div>
  );
}
