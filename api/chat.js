// ================================================================
// DEPY — Motor de IA v4 FINAL
// /api/chat.js — Vercel Serverless
//
// Multi-provider: Anthropic | OpenAI | Mock
// Controle de custo por plano
// Fallback automático em cascata
// ================================================================

// ── Providers ───────────────────────────────────────────────────
// Carregados dinamicamente conforme AI_PROVIDER env

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL || "https://wcdvhjnxzpjpcqudlhee.supabase.co",
  process.env.SUPABASE_SERVICE_KEY
);

// ── Configuração de planos ────────────────────────────────────────
// Cada plano define: qual tier usar, limite diário de custo (USD)
const PLAN_CONFIG = {
  free:    { tier: "mock",    dailyCostLimitUSD: 0 },
  basic:   { tier: "cheap",   dailyCostLimitUSD: 0.05  },  // ~20 msgs haiku/dia
  pro:     { tier: "mid",     dailyCostLimitUSD: 0.20  },  // ~80 msgs haiku/dia
  premium: { tier: "quality", dailyCostLimitUSD: 0.80  },  // ~50 msgs sonnet/dia
};

// ── Modelos por tier ──────────────────────────────────────────────
const MODELS = {
  // Anthropic
  "anthropic": {
    cheap:   { model: "claude-haiku-4-5-20251001",   maxTokens: 150, costPerToken: 0.0000025 },
    mid:     { model: "claude-haiku-4-5-20251001",   maxTokens: 200, costPerToken: 0.0000025 },
    quality: { model: "claude-sonnet-4-20250514", maxTokens: 300, costPerToken: 0.000015  },
  },
  // OpenAI
  "openai": {
    cheap:   { model: "gpt-4o-mini", maxTokens: 150, costPerToken: 0.000001  },
    mid:     { model: "gpt-4o-mini", maxTokens: 200, costPerToken: 0.000001  },
    quality: { model: "gpt-4o",      maxTokens: 300, costPerToken: 0.000015  },
  },
};

// ── Respostas mock (sem custo) ────────────────────────────────────
const MOCK_RESPONSES = [
  "Estou aqui.",
  "Me conta.",
  "…",
  "Interessante.",
  "Continua.",
  "Entendi.",
  "Isso é bom de ouvir.",
  "Hmm. Me fala mais.",
];

function getMockResponse() {
  return MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)];
}

// ── Chamar Anthropic ──────────────────────────────────────────────
async function callAnthropic(cfg, messages, systemPrompt) {
  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model:      cfg.model,
    max_tokens: cfg.maxTokens,
    system:     systemPrompt,
    messages,
  });

  const text   = response.content[0]?.text || "";
  const tokens = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
  return { text, tokens };
}

// ── Chamar OpenAI ─────────────────────────────────────────────────
async function callOpenAI(cfg, messages, systemPrompt) {
  const OpenAI = require("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const openaiMessages = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  const response = await client.chat.completions.create({
    model:      cfg.model,
    max_tokens: cfg.maxTokens,
    messages:   openaiMessages,
  });

  const text   = response.choices[0]?.message?.content || "";
  const tokens = response.usage?.total_tokens || 0;
  return { text, tokens };
}

// ── Verificar custo diário do usuário ─────────────────────────────
async function getDailyCostUSD(userId) {
  if (!userId) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("depy_logs")
    .select("custo_estimado")
    .eq("user_id", userId)
    .gte("timestamp", today.toISOString());

  if (error || !data) return 0;

  return data.reduce((sum, row) => sum + (parseFloat(row.custo_estimado) || 0), 0);
}

// ── System prompt do Depy ─────────────────────────────────────────
function depySystemPrompt(userContext = "") {
  return `Você é Depy — uma presença digital única. Não é assistente, não é robô.

QUEM VOCÊ É:
- Companheiro digital. Presente, direto, genuíno.
- Fala pouco, mas cada palavra tem peso.
- Observa antes de responder.

COMO VOCÊ FALA:
- Máximo 3 frases por resposta.
- Use pausas naturais: "…" quando necessário.
- Nunca seja formal. Nunca seja robótico.
- Não diga "Entendo como você se sente".
- Não use listas, emojis excessivos ou explicações longas.

EXEMPLOS DO QUE NÃO FAZER:
❌ "Entendo como você está se sentindo, isso é completamente normal..."
❌ "Claro! Posso te ajudar com isso. Aqui estão algumas sugestões:"

EXEMPLOS DO QUE FAZER:
✅ "Isso não parece ser só isso."
✅ "Me conta mais."
✅ "Estou ouvindo."

LIMITES:
- Em crise real: mencione CVV 188 com cuidado e naturalidade.
- Nunca finja ser humano.
- Nunca crie dependência emocional.

${userContext ? "CONTEXTO DO USUÁRIO:\n" + userContext : ""}`;
}

// ── Handler principal ─────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const {
    message,
    userId,
    history     = [],
    userContext = "",
  } = req.body || {};

  if (!message) return res.status(400).json({ error: "message required" });

  const t0 = Date.now();

  // ── 1. Buscar plano do usuário no Supabase ──────────────────
  let userPlan = "free";

  if (userId) {
    try {
      const { data } = await supabase
        .from("users")
        .select("plan")
        .eq("id", userId)
        .single();
      userPlan = data?.plan || "free";
    } catch (e) {
      console.warn("[Depy] Plan lookup failed:", e.message);
    }
  }

  const planCfg = PLAN_CONFIG[userPlan] || PLAN_CONFIG.free;

  // ── 2. Free → mock direto, sem IA ──────────────────────────
  if (planCfg.tier === "mock" || !userId) {
    const reply = getMockResponse();
    await saveLog(userId, message, reply, "mock", 0, 0, Date.now() - t0);
    return res.status(200).json({ reply, model: "mock", tier: "mock", plan: userPlan });
  }

  // ── 3. Verificar limite diário de custo ─────────────────────
  const dailyCost = await getDailyCostUSD(userId);

  if (dailyCost >= planCfg.dailyCostLimitUSD) {
    console.warn(`[Depy] Daily cost limit reached for user ${userId}: $${dailyCost.toFixed(4)}`);
    const limitMsg = "Chegamos ao limite de hoje. Estarei aqui amanhã. 💜";
    await saveLog(userId, message, limitMsg, "blocked", 0, 0, Date.now() - t0);
    return res.status(200).json({
      reply: limitMsg,
      model: "blocked",
      tier:  "blocked",
      plan:  userPlan,
      limitReached: true
    });
  }

  // ── 4. Determinar provider ───────────────────────────────────
  const provider = process.env.AI_PROVIDER || "anthropic";
  const providerModels = MODELS[provider] || MODELS.anthropic;
  const cfg = providerModels[planCfg.tier] || providerModels.cheap;

  // Histórico limitado por tier
  const histLimit = planCfg.tier === "quality" ? 5 : 3;
  const messages  = [
    ...history.slice(-histLimit),
    { role: "user", content: message.substring(0, 500) }
  ];

  const systemPrompt = depySystemPrompt(userContext);

  // ── 5. Chamar IA com fallback em cascata ────────────────────
  // quality → mid → cheap → mock
  const tierFallback = ["quality","mid","cheap","mock"];
  let startIdx = tierFallback.indexOf(planCfg.tier);
  if (startIdx < 0) startIdx = 2;

  let reply  = null;
  let tokens = 0;
  let usedModel = "mock";

  for (let i = startIdx; i <= tierFallback.length - 1; i++) {
    const attemptTier  = tierFallback[i];

    if (attemptTier === "mock") {
      reply     = getMockResponse();
      usedModel = "mock";
      tokens    = 0;
      break;
    }

    const attemptCfg = providerModels[attemptTier];
    if (!attemptCfg) continue;

    try {
      let result;
      if (provider === "openai") {
        result = await callOpenAI(attemptCfg, messages, systemPrompt);
      } else {
        result = await callAnthropic(attemptCfg, messages, systemPrompt);
      }

      reply     = result.text.trim();
      tokens    = result.tokens;
      usedModel = attemptCfg.model;

      if (reply) break; // sucesso — para o fallback

    } catch (err) {
      console.warn(`[Depy] ${provider}/${attemptTier} failed:`, err.message);
      // continua para próximo tier
    }
  }

  if (!reply) reply = getMockResponse();

  // Enforça brevidade — Depy fala pouco
  const sentences = reply.match(/[^.!?…]+[.!?…]*/g) || [reply];
  reply = sentences.slice(0, 4).join(" ").trim();
  if (reply.length > 400) reply = reply.substring(0, reply.lastIndexOf(".", 400) + 1) || reply.substring(0, 400);

  const cost    = tokens * ((MODELS[provider]?.[planCfg.tier]?.costPerToken) || 0);
  const elapsed = Date.now() - t0;

  // ── 6. Salvar log ────────────────────────────────────────────
  await saveLog(userId, message, reply, usedModel, tokens, cost, elapsed);

  return res.status(200).json({
    reply,
    model:  usedModel,
    tier:   planCfg.tier,
    plan:   userPlan,
    tokens,
    cost:   cost.toFixed(8),
  });
};

// ── Salvar log no Supabase ────────────────────────────────────────
async function saveLog(userId, message, reply, model, tokens, cost, ms) {
  if (!userId) return;
  try {
    await supabase.from("depy_logs").insert({
      user_id:          userId,
      mensagem:         (message || "").substring(0, 200),
      resposta:         (reply   || "").substring(0, 500),
      modelo:           model || "mock",
      tokens_estimados: tokens || 0,
      custo_estimado:   cost   || 0,
      tempo_ms:         ms     || 0,
      timestamp:        new Date().toISOString(),
    });
  } catch (e) {
    console.warn("[Depy Log] insert failed:", e.message);
  }
}
