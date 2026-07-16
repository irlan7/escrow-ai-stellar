import { useState } from "react";
import { submitFeedback } from "../lib/analytics.js";

export default function FeedbackWidget({ address }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    if (rating === 0) return;
    setLoading(true);
    try {
      await submitFeedback({ walletAddress: address, rating, comment });
      setSubmitted(true);
      setTimeout(() => {
        setOpen(false);
        setSubmitted(false);
        setRating(0);
        setComment("");
      }, 2000);
    } catch {
      // gagal kirim feedback bukan hal kritikal — cukup diam,
      // tombol tetap bisa dicoba lagi oleh user
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button className="feedback-fab" onClick={() => setOpen(true)}>
        💬 Feedback
      </button>
    );
  }

  return (
    <div className="feedback-panel">
      <div className="feedback-panel-header">
        <span>Gimana pengalaman kamu?</span>
        <button className="feedback-close" onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>

      {submitted ? (
        <p className="feedback-thanks">Terima kasih atas feedback-nya! 🙏</p>
      ) : (
        <>
          <div className="feedback-stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={`feedback-star ${n <= rating ? "active" : ""}`}
                onClick={() => setRating(n)}
                aria-label={`${n} bintang`}
              >
                ★
              </button>
            ))}
          </div>

          <textarea
            className="feedback-textarea"
            placeholder="Ceritakan pengalaman kamu pakai Escrow AI (opsional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />

          <button
            className="btn btn-primary btn-block"
            onClick={handleSubmit}
            disabled={rating === 0 || loading}
          >
            {loading ? <span className="spinner" /> : "Kirim Feedback"}
          </button>
        </>
      )}
    </div>
  );
}
