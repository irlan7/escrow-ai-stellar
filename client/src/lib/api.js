const API_BASE = import.meta.env.VITE_AI_API_URL || "http://localhost:3001";

export async function getAIRecommendation({ description, disputeReason, amount }) {
  const res = await fetch(`${API_BASE}/api/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description, disputeReason, amount }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Gagal memuat rekomendasi AI (${res.status})`);
  }

  return res.json();
}
