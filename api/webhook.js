// ================================================================
// DEPY — Webhook Mercado Pago FINAL v3
// /api/webhook.js — Vercel Serverless
// FIX: validação de assinatura MP para segurança
// ================================================================

const { createClient } = require("@supabase/supabase-js");
const https = require("https");
const crypto = require("crypto");

const supabase = createClient(
  process.env.SUPABASE_URL || "https://wcdvhjnxzpjpcqudlhee.supabase.co",
  process.env.SUPABASE_SERVICE_KEY
);

const PLAN_MAP = {
  "1bbb0e9547834d48be979d5a999fd3bc": "basic",
  "5adce0811ff746668764283d5a98258d": "pro",
  "8a0a8c144090431fa4494cd8db4e45b0": "premium"
};

// ── Validação de assinatura do Mercado Pago ──────────────────────
// Documentação: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
function validateMPSignature(req) {
  // Se não tiver MP_WEBHOOK_SECRET configurado, pula validação (dev mode)
  if (!process.env.MP_WEBHOOK_SECRET) {
    console.warn("[Depy WH] ⚠️  MP_WEBHOOK_SECRET não configurado — validação ignorada");
    return true;
  }

  try {
    const xSignature   = req.headers["x-signature"] || "";
    const xRequestId   = req.headers["x-request-id"] || "";
    const dataId       = req.query?.["data.id"] || req.body?.data?.id || "";

    // Extrai ts e v1 do header x-signature
    const parts = {};
    xSignature.split(",").forEach(part => {
      const [k, v] = part.trim().split("=");
      if (k && v) parts[k] = v;
    });

    if (!parts.ts || !parts.v1) return false;

    // Monta string para validação
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${parts.ts};`;
    const expected = crypto
      .createHmac("sha256", process.env.MP_WEBHOOK_SECRET)
      .update(manifest)
      .digest("hex");

    return expected === parts.v1;
  } catch (e) {
    console.error("[Depy WH] Signature error:", e.message);
    return false;
  }
}

// ── Fetch MP API ─────────────────────────────────────────────────
function mpGet(path) {
  return new Promise((resolve, reject) => {
    https.get(
      {
        hostname: "api.mercadopago.com",
        path,
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          "User-Agent": "Depy/1.0"
        }
      },
      (res) => {
        let raw = "";
        res.on("data", c => (raw += c));
        res.on("end", () => {
          try { resolve(JSON.parse(raw)); }
          catch (e) { reject(new Error(`MP parse error: ${raw.slice(0,100)}`)); }
        });
      }
    ).on("error", reject);
  });
}

function planFromId(id) {
  return PLAN_MAP[id] || "pro";
}

// Resolve userId: UUID direto ou fallback por email
async function resolveUserId(extRef) {
  if (!extRef) return null;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(extRef)) return extRef;

  const { data } = await supabase.rpc("get_user_id_by_email", { p_email: extRef });
  return data || null;
}

// ── Handler principal ────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // FIX: validar assinatura antes de processar
  if (!validateMPSignature(req)) {
    console.error("[Depy WH] ❌ Invalid signature — request rejected");
    return res.status(200).json({ ok: false, reason: "invalid_signature" });
    // Retorna 200 para MP não retentar, mas não processa
  }

  const body    = req.body || {};
  const eventId = req.headers["x-request-id"]
    || `${body.type}-${body.data?.id}-${body.date_created || Date.now()}`;

  console.log("[Depy WH]", body.type, body.action, body.data?.id);

  try {
    // Anti-duplicidade via UNIQUE constraint no banco
    const { data: dup } = await supabase
      .from("mp_events")
      .select("id")
      .eq("event_id", eventId)
      .maybeSingle();

    if (dup) {
      console.log("[Depy WH] Duplicate:", eventId);
      return res.status(200).json({ ok: true, dup: true });
    }

    const type   = body.type   || "";
    const action = body.action || "";
    const dataId = body.data?.id;

    let userId   = null;
    let planType = "pro";
    let status   = null;
    let mpPayId  = null;

    // ── EVENTO: pagamento ──────────────────────────────────────
    if (type === "payment" && dataId) {
      const pay = await mpGet(`/v1/payments/${dataId}`);
      mpPayId = String(dataId);
      status  = pay.status;

      console.log("[Depy WH] Payment:", { status, ext: pay.external_reference });

      if (status === "approved" && pay.external_reference) {
        userId = await resolveUserId(pay.external_reference);

        // Detecta plano pela assinatura vinculada
        const subId = pay.preapproval_id;
        if (subId) {
          const sub = await mpGet(`/preapproval/${subId}`);
          planType = planFromId(sub.preapproval_plan_id);
        }

        if (userId) await activatePlan(userId, planType);
      }
    }

    // ── EVENTO: assinatura ─────────────────────────────────────
    else if (type === "subscription_preapproval" && dataId) {
      const sub = await mpGet(`/preapproval/${dataId}`);
      status   = sub.status;
      planType = planFromId(sub.preapproval_plan_id);

      console.log("[Depy WH] Subscription:", { status, plan: planType, ext: sub.external_reference });

      if (sub.external_reference) {
        userId = await resolveUserId(sub.external_reference);
        if (userId) {
          if (status === "authorized")                     await activatePlan(userId, planType);
          else if (status === "cancelled" || status === "paused") await cancelPlan(userId);
        }
      }
    }

    // Registra evento
    await supabase.from("mp_events").insert({
      event_id:      eventId,
      type,
      action,
      user_id:       userId,
      plan_type:     planType,
      mp_payment_id: mpPayId,
      status,
      raw_payload:   body
    });

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("[Depy WH] Error:", err.message);
    return res.status(200).json({ ok: false, err: err.message });
  }
};

async function activatePlan(userId, planType) {
  console.log(`[Depy] activate ${planType} → ${userId}`);
  // Usa RPC com proteção de downgrade no banco
  const { error } = await supabase.rpc("activate_plan", {
    p_user_id:   userId,
    p_plan_type: planType
  });
  if (error) throw error;
}

async function cancelPlan(userId) {
  console.log(`[Depy] cancel → ${userId}`);
  const { error } = await supabase.rpc("cancel_plan", { p_user_id: userId });
  if (error) throw error;
}
