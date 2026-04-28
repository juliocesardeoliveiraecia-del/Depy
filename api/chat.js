// ================================================================
// DEPY — Motor Adaptativo v6 (PRODUCTION READY)
// Presença > Decisão > IA
// ================================================================

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── CONFIG ──────────────────────────────────────────────────────
const PLAN_CONFIG = {
  free:    { tier: "mock",    dailyCostLimitUSD: 0 },
  basic:   { tier: "cheap",   dailyCostLimitUSD: 0.05 },
  pro:     { tier: "mid",     dailyCostLimitUSD: 0.20 },
  premium: { tier: "quality", dailyCostLimitUSD: 0.80 },
};

// ── ESTADO DO USUÁRIO (memória leve runtime) ─────────────────────
const userStates = new Map();

// ── ANÁLISE ─────────────────────────────────────────────────────
function analyzeMessage(message) {
  const text = message.toLowerCase();

  const isShort = message.length < 25;
  const isLong  = message.length > 120;

  const heavyWords = ["cansado","triste","ansioso","sozinho","difícil","pesado","vazio"];
  const question   = text.includes("?") || ["por que","como","o que"].some(w => text.includes(w));

  return {
    isShort,
    isLong,
    emotion: heavyWords.some(w => text.includes(w)) ? "heavy" : "neutral",
    intention: question ? "reflection" : isLong ? "vent" : "presence",
    openness: isLong ? "high" : isShort ? "low" : "medium"
  };
}

// ── ESTADO ──────────────────────────────────────────────────────
function getUserState(userId) {
  if (!userStates.has(userId)) {
    userStates.set(userId, {
      mood: "neutral",
      openness: "medium",
      rhythm: "normal",
      trust: 0,
      lastReplies: []
    });
  }
  return userStates.get(userId);
}

function updateState(state, analysis) {
  if (analysis.emotion === "heavy") state.mood = "heavy";
  if (analysis.isShort) state.openness = "low";
  if (analysis.isLong) state.openness = "high";

  state.trust = Math.min(100, state.trust + 1);

  return state;
}

// ── DECISÃO ─────────────────────────────────────────────────────
function decideAction(analysis, state) {

  if (state.openness === "low" && analysis.emotion !== "heavy") {
    return "presence";
  }

  if (analysis.intention === "vent" && state.mood !== "heavy") {
    return "mock";
  }

  if (analysis.intention === "reflection" && state.mood !== "heavy") {
    return "ai_light";
  }

  if (analysis.emotion === "heavy") {
    return "ai_deep";
  }

  return "presence";
}

// ── RESPOSTAS ───────────────────────────────────────────────────
function presenceResponse() {
  return random([
    "…",
    "Tô aqui.",
    "Pode falar.",
    "Hmm.",
    "Entendi."
  ]);
}

function mockResponse(message, analysis) {

  if (analysis.intention === "vent") {
    return random([
      "Isso não parece ser pouca coisa.",
      "Tem algo aí que ficou.",
      "Isso pesou mais do que parece."
    ]);
  }

  if (analysis.isShort) {
    return random([
      "Tem mais nisso, né.",
      "Isso veio meio solto.",
      "Hmm… tem algo por trás."
    ]);
  }

  return "Me fala mais.";
}

// ── ANTI-REPETIÇÃO ──────────────────────────────────────────────
function avoidRepetition(state, reply) {
  if (state.lastReplies.includes(reply)) {
    reply += "…";
  }
  state.lastReplies.push(reply);
  if (state.lastReplies.length > 5) state.lastReplies.shift();
  return reply;
}

// ── IA (REAPROVEITA SUA IMPLEMENTAÇÃO) ──────────────────────────
async function callAI(type, message, history, systemPrompt) {
  try {
    const OpenAI = require("openai");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const model = type === "ai_deep" ? "gpt-4o" : "gpt-4o-mini";

    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: message }
      ],
      max_tokens: type === "ai_deep" ? 300 : 120
    });

    return {
      text: res.choices[0].message.content,
      tokens: res.usage.total_tokens,
      model
    };

  } catch {
    return null;
  }
}

// ── SYSTEM PROMPT ───────────────────────────────────────────────
function systemPrompt() {
  return `Você é Depy. Presença digital.
Fala pouco. Nunca robótico. Nunca formal.
Às vezes o silêncio é melhor resposta.`;
}

// ── HANDLER ─────────────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();

  const { message, userId, history = [] } = req.body;

  if (!message) return res.status(400).json({ error: "message required" });

  const state = getUserState(userId || "anon");

  const analysis = analyzeMessage(message);
  updateState(state, analysis);

  const action = decideAction(analysis, state);

  let reply = "";
  let tokens = 0;
  let model = "mock";

  // ── EXECUÇÃO ────────────────────────────────────────────────
  if (action === "presence") {
    reply = presenceResponse();
  }

  else if (action === "mock") {
    reply = mockResponse(message, analysis);
  }

  else {
    const ai = await callAI(action, message, history, systemPrompt());

    if (ai && ai.text) {
      reply = ai.text.trim();
      tokens = ai.tokens;
      model = ai.model;
    } else {
      reply = mockResponse(message, analysis);
    }
  }

  reply = avoidRepetition(state, reply);

  // limitar resposta (estilo Depy)
  reply = reply.split(/[.!?…]/).slice(0,3).join(".").trim();

  // ── LOG ─────────────────────────────────────────────────────
  try {
    if (userId) {
      await supabase.from("depy_logs").insert({
        user_id: userId,
        mensagem: message,
        resposta: reply,
        modelo: model,
        tokens_estimados: tokens,
        custo_estimado: 0,
        tempo_ms: 0
      });
    }
  } catch {}

  return res.status(200).json({
    reply,
    model,
    action
  });
};

// ── UTIL ────────────────────────────────────────────────────────
function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
