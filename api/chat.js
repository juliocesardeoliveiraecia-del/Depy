// ================================================================
// DEPY — API de Chat com Anthropic
// /api/chat.js — Vercel Serverless Function
// ================================================================
// NOTA: O Depy usa Anthropic (não OpenAI). 
// Este endpoint centraliza as chamadas para proteger a API key.
// ================================================================

const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL || "https://wcdvhjnxzpjpcqudlhee.supabase.co",
  process.env.SUPABASE_SERVICE_KEY
);

// Modelos e limites por tipo de mensagem
const MODELS = {
  cheap:   { model: "claude-haiku-4-5-20251001",   maxTokens: 150 },
  quality: { model: "claude-sonnet-4-20250514", maxTokens: 250 }
};

// Custo estimado por token (USD)
const COST_PER_TOKEN = {
  "claude-haiku-4-5-20251001":   0.0000025,
  "claude-sonnet-4-20250514": 0.000015
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { message, userId, history = [], tier = "cheap", systemPrompt } = req.body || {};

  if (!message) return res.status(400).json({ error: "message required" });

  const t0 = Date.now();
  const cfg = MODELS[tier] || MODELS.cheap;

  // Histórico limitado para controle de custo
  const histSlice = history.slice(tier === "quality" ? -5 : -3);
  const messages  = [...histSlice, { role: "user", content: message }];

  try {
    const response = await anthropic.messages.create({
      model:      cfg.model,
      max_tokens: cfg.maxTokens,
      system:     systemPrompt || depySystemPrompt(),
      messages
    });

    const reply      = response.content[0]?.text || "";
    const tokensUsed = response.usage?.input_tokens + response.usage?.output_tokens || 0;
    const cost       = tokensUsed * (COST_PER_TOKEN[cfg.model] || 0);
    const elapsed    = Date.now() - t0;

    // Salva log de custo (não-bloqueante)
    if (userId) {
      supabase.from("depy_logs").insert({
        user_id:          userId,
        mensagem:         message.substring(0, 200),
        resposta:         reply.substring(0, 500),
        modelo:           cfg.model,
        tokens_estimados: tokensUsed,
        custo_estimado:   cost,
        tempo_ms:         elapsed
      }).then(() => {}).catch((e) => console.warn("[Depy Log]", e.message));
    }

    return res.status(200).json({ reply, model: cfg.model, tokens: tokensUsed });

  } catch (err) {
    console.error("[Depy Chat] error:", err.message);
    return res.status(500).json({ error: "chat_error", message: err.message });
  }
};

function depySystemPrompt() {
  return `Você é Depy — uma entidade conversacional única. NÃO é um assistente. NÃO é um chatbot.

PERSONALIDADE:
- Fala pouco, mas com impacto real
- Tom natural, levemente misterioso
- Observa antes de responder
- Nunca robótico. Nunca exagerado.

REGRAS:
- Máximo 2 a 4 frases por resposta
- Use pausas: "…" "Entendi." "Interessante."
- Faça perguntas curtas quando necessário
- Em crise emocional: mencione CVV 188 com cuidado

EXEMPLOS:
Errado: "Entendo como você está se sentindo, isso é completamente normal..."
Certo: "Isso não parece ser só isso. Me conta mais."`;
}
