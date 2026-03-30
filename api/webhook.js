import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  "https://wcdvhjnxzpjpcqudlhee.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("ok");
  }

  try {
    const body = req.body;

    // pega userId que vamos enviar no pagamento
    const userId = body?.data?.external_reference;

    if (userId) {
      await supabase
        .from("users")
        .update({ pro: true })
        .eq("id", userId);

      console.log("PRO ativado:", userId);
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: true });
  }
}
