import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const cerebras = new OpenAI({
  apiKey: process.env.CEREBRAS_API_KEY,
  baseURL: "https://api.cerebras.ai/v1",
});

const MODEL = process.env.CEREBRAS_MODEL || "llama-3.3-70b";

function fallbackRecommendation(disputeReason) {
  return {
    recommendation: "buyer",
    confidence: 70,
    reasoning: [
      "Tidak dapat menghubungi layanan AI secara live saat ini",
      "Rekomendasi fallback berdasarkan pola umum: dispute yang menyebutkan keterlambatan tenggat cenderung mendukung buyer",
      `Alasan dispute yang diajukan: "${(disputeReason || "").slice(0, 120)}"`,
    ],
    fallback: true,
  };
}

app.post("/api/recommend", async (req, res) => {
  const { description, disputeReason, amount } = req.body || {};

  if (!disputeReason) {
    return res.status(400).json({ error: "disputeReason wajib diisi" });
  }

  const prompt = `Kamu adalah asisten yang membantu arbitrator escrow marketplace menganalisis sengketa transaksi antara buyer dan seller. Kamu TIDAK membuat keputusan final — tugasmu hanya memberi rekomendasi terstruktur berdasarkan informasi yang diberikan. Keputusan akhir selalu diambil oleh arbitrator manusia.

Detail transaksi:
- Deskripsi transaksi: ${description || "(tidak ada deskripsi)"}
- Jumlah: ${amount || "?"} USDC
- Alasan dispute yang diajukan: ${disputeReason}

Analisis secara objektif berdasarkan informasi di atas saja (jangan mengarang bukti yang tidak disebutkan). Balas HANYA dalam format JSON valid berikut, tanpa teks lain, tanpa markdown code fence:
{
  "recommendation": "buyer" atau "seller",
  "confidence": <angka 0-100>,
  "reasoning": ["poin singkat 1", "poin singkat 2", "poin singkat 3"]
}`;

  try {
    const completion = await cerebras.chat.completions.create({
      model: MODEL,
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = completion.choices?.[0]?.message?.content ?? "{}";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.recommendation || typeof parsed.confidence !== "number") {
      throw new Error("Format respons AI tidak sesuai");
    }

    res.json(parsed);
  } catch (err) {
    console.error("AI recommendation error:", err.message);
    res.json(fallbackRecommendation(disputeReason));
  }
});

app.get("/", (_req, res) => {
  res.send("Escrow AI recommendation service is running.");
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", model: MODEL, provider: "cerebras" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Escrow AI recommendation service running on port ${PORT} (Cerebras: ${MODEL})`);
});
