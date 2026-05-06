// ================================================================
// DEPY — ENGINE v6 FINAL (ZERO DEPENDÊNCIA DE IA)
// /api/chat.js
// ================================================================

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ───────────────── CONFIG ─────────────────
const CONFIG = {
  MAX_MEMORY: 12,
  BOND_INCREMENT: 0.08,
  SILENCE_CHANCE: 0.12,
  MAX_RESPONSE: 280,
  INTERNET_ENABLED: true
};

// ───────────────── ESTADO GLOBAL ─────────────────
let GLOBAL_STATE = {};

// ───────────────── CRIAR ESTADO ─────────────────
function createState() {
  return {
    messages: [],
    emotions: [],
    bond: 0,
    profile: { talkative: 0, emotional: 0 }
  };
}

// ───────────────── PERCEPÇÃO ─────────────────
function perceive(msg) {
  const m = msg.toLowerCase();

  return {
    emotion:
      /triste|mal|sozinho|ansioso/.test(m) ? "low" :
      /feliz|ótimo/.test(m) ? "high" :
      "neutral",

    intent:
      m.includes("o que") || m.includes("como") ? "question" :
      msg.length < 15 ? "short" :
      msg.length > 100 ? "deep" :
      "normal"
  };
}

// ───────────────── ATUALIZA ESTADO ─────────────────
function updateState(state, msg, p) {
  state.messages.push(msg);
  if (state.messages.length > CONFIG.MAX_MEMORY) state.messages.shift();

  state.emotions.push(p.emotion);
  if (state.emotions.length > CONFIG.MAX_MEMORY) state.emotions.shift();

  if (msg.length > 80) state.profile.talkative++;
  if (p.emotion !== "neutral") state.profile.emotional++;

  state.bond += CONFIG.BOND_INCREMENT;
}

// ───────────────── DECISÃO ─────────────────
function decide(p) {
  if (Math.random() < CONFIG.SILENCE_CHANCE) return "silence";
  if (CONFIG.INTERNET_ENABLED && p.intent === "question") return "internet";
  if (p.emotion === "low") return "emotional";
  return "default";
}

// ───────────────── INTERNET ─────────────────
async function fetchInternet(q) {
  try {
    const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json`);
    const data = await res.json();
    return data.AbstractText || null;
  } catch {
    return null;
  }
}

// ───────────────── ESTILO DEP ─────────────────
function style(text, state, p) {
  if (!text) return "…";

  if (p.emotion === "low") return "Isso não parece leve…";

  if (state.bond > 3 && Math.random() > 0.6) {
    return "Você volta nisso…";
  }

  let out = text
    .replace(/segundo .*?\./gi, "")
    .replace(/é importante notar que/gi, "")
    .trim();

  if (out.length > CONFIG.MAX_RESPONSE) {
    out = out.substring(0, CONFIG.MAX_RESPONSE);
  }

  return out || "Hmm.";
}

// ───────────────── BASE ─────────────────
function base() {
  const r = [
    "Estou aqui.",
    "Me conta.",
    "Hmm.",
    "Entendi.",
    "Continua."
  ];
  return r[Math.floor(Math.random() * r.length)];
}

// ───────────────── MOTOR ─────────────────
async function generate(message, state) {
  const p = perceive(message);
  updateState(state, message, p);

  const decision = decide(p);

  if (decision === "silence") return "…";

  if (decision === "internet") {
    const data = await fetchInternet(message);
    return style(data || base(), state, p);
  }

  if (decision === "emotional") {
    return "Isso não parece ser só isso.";
  }

  return base();
}

// ───────────────── LOG ─────────────────
async function log(userId, msg, reply) {
  if (!userId) return;
  try {
    await supabase.from("depy_logs").insert({
      user_id: userId,
      mensagem: msg,
      resposta: reply,
      modelo: "depy-core",
      tokens_estimados: 0,
      custo_estimado: 0,
      tempo_ms: 0
    });
  } catch {}
}

// ───────────────── HANDLER ─────────────────
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { message, userId } = req.body || {};
  if (!message) return res.status(400).json({ error: "message required" });

  // estado por usuário
  if (!GLOBAL_STATE[userId]) {
    GLOBAL_STATE[userId] = createState();
  }

  const state = GLOBAL_STATE[userId];

  const reply = await generate(message, state);

  await log(userId, message, reply);

  return res.status(200).json({
    reply,
    model: "depy-core",
    plan: "local"
  });
};
