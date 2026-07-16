const API_BASE = import.meta.env.VITE_AI_API_URL || "http://localhost:3001";

// Analytics tracking — dikirim ke backend kita sendiri (bukan
// third-party service), disimpan sebagai bukti "proof of wallet
// interactions" dan dipakai buat summary di dashboard.
//
// Sengaja "fire and forget" (tidak di-await, tidak melempar error
// ke pemanggil) — analytics tidak boleh pernah mengganggu alur
// utama aplikasi walau gagal terkirim (misal backend lagi down).
export function trackEvent(event, walletAddress = null, metadata = {}) {
  try {
    fetch(`${API_BASE}/api/analytics/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, wallet_address: walletAddress, metadata }),
    }).catch(() => {
      // diam-diam diabaikan — analytics tidak kritikal untuk fungsi utama
    });
  } catch {
    // no-op
  }
}

export async function getAnalyticsSummary() {
  const res = await fetch(`${API_BASE}/api/analytics/summary`);
  if (!res.ok) throw new Error(`Gagal memuat analytics (${res.status})`);
  return res.json();
}

export async function submitFeedback({ walletAddress, rating, comment }) {
  const res = await fetch(`${API_BASE}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet_address: walletAddress, rating, comment }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Gagal mengirim feedback (${res.status})`);
  }
  return res.json();
}

export async function getFeedbackSummary() {
  const res = await fetch(`${API_BASE}/api/feedback/summary`);
  if (!res.ok) throw new Error(`Gagal memuat feedback (${res.status})`);
  return res.json();
}
