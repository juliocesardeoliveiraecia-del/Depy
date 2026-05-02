-- ================================================================
-- DEPY — SUPABASE SETUP FINAL v4
-- Execute no SQL Editor do Supabase
-- Versão auditada e corrigida para produção
-- ================================================================

-- ── 1. TABELA USERS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT        NOT NULL UNIQUE,
  name       TEXT,
  plan       TEXT        NOT NULL DEFAULT 'free'
               CHECK (plan IN ('free','basic','pro','premium')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migração segura se tabela já existe
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='plan'
  ) THEN
    ALTER TABLE public.users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'
      CHECK (plan IN ('free','basic','pro','premium'));
  END IF;

  -- Remove coluna 'pro' redundante se existir
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='pro'
  ) THEN
    ALTER TABLE public.users DROP COLUMN pro;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='updated_at'
  ) THEN
    ALTER TABLE public.users
      ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS users_email_idx ON public.users(email);
CREATE INDEX IF NOT EXISTS users_plan_idx  ON public.users(plan);

-- Trigger updated_at automático
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 2. TABELA DEPY_LOGS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.depy_logs (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  mensagem         TEXT,
  resposta         TEXT,
  modelo           TEXT          NOT NULL DEFAULT 'fixed',
  tokens_estimados INTEGER       NOT NULL DEFAULT 0,
  custo_estimado   NUMERIC(12,8) NOT NULL DEFAULT 0,
  tempo_ms         INTEGER       NOT NULL DEFAULT 0,
  timestamp        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS depy_logs_user_idx ON public.depy_logs(user_id);
CREATE INDEX IF NOT EXISTS depy_logs_ts_idx   ON public.depy_logs(timestamp DESC);

-- ── 3. TABELA MP_EVENTS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mp_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       TEXT        NOT NULL UNIQUE,
  type           TEXT,
  action         TEXT,
  user_id        UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  plan_type      TEXT,
  mp_payment_id  TEXT,
  status         TEXT,
  raw_payload    JSONB,
  processed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mp_events_user_idx  ON public.mp_events(user_id);
CREATE INDEX IF NOT EXISTS mp_events_event_idx ON public.mp_events(event_id);

-- ── 4. RLS ───────────────────────────────────────────────────────
ALTER TABLE public.users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depy_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_events ENABLE ROW LEVEL SECURITY;

-- users: cada usuário acessa só o próprio registro
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_insert_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;

CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- depy_logs: usuário insere/lê próprios logs
-- service_role bypassa RLS automaticamente (para api/chat.js)
DROP POLICY IF EXISTS "logs_insert_own" ON public.depy_logs;
DROP POLICY IF EXISTS "logs_select_own" ON public.depy_logs;

CREATE POLICY "logs_insert_own" ON public.depy_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "logs_select_own" ON public.depy_logs
  FOR SELECT USING (auth.uid() = user_id);

-- FIX: mp_events precisa de WITH CHECK para INSERT funcionar
-- service_role bypassa RLS — esta policy é para outras roles
DROP POLICY IF EXISTS "mp_service_only" ON public.mp_events;
CREATE POLICY "mp_service_only" ON public.mp_events
  FOR ALL
  USING     (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 5. FUNCTION: activate_plan ───────────────────────────────────
-- FIX: proteção contra downgrade indevido
-- Ex: usuário Premium não pode ser rebaixado para Basic por bug no webhook
CREATE OR REPLACE FUNCTION public.activate_plan(
  p_user_id   UUID,
  p_plan_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_plan TEXT;
  v_plan_rank    INT;
  v_current_rank INT;
BEGIN
  -- Validar plano
  IF p_plan_type NOT IN ('basic','pro','premium') THEN
    RAISE EXCEPTION 'Invalid plan: %', p_plan_type;
  END IF;

  -- Busca plano atual
  SELECT plan INTO v_current_plan
  FROM public.users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- Hierarquia de planos (maior número = plano melhor)
  v_plan_rank := CASE p_plan_type
    WHEN 'basic'   THEN 1
    WHEN 'pro'     THEN 2
    WHEN 'premium' THEN 3
    ELSE 0
  END;

  v_current_rank := CASE v_current_plan
    WHEN 'basic'   THEN 1
    WHEN 'pro'     THEN 2
    WHEN 'premium' THEN 3
    ELSE 0
  END;

  -- FIX: só atualiza se novo plano for >= plano atual
  -- Evita downgrade acidental por bug no webhook
  IF v_plan_rank >= v_current_rank THEN
    UPDATE public.users
    SET plan = p_plan_type, updated_at = NOW()
    WHERE id = p_user_id;
  END IF;

  RETURN TRUE;
END;
$$;

-- ── 6. FUNCTION: cancel_plan ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_plan(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.users
  SET plan = 'free', updated_at = NOW()
  WHERE id = p_user_id;
  RETURN FOUND;
END;
$$;

-- ── 7. VIEW: custos por usuário ───────────────────────────────────
CREATE OR REPLACE VIEW public.user_costs AS
SELECT
  user_id,
  COUNT(*)                               AS total_interacoes,
  SUM(tokens_estimados)                  AS total_tokens,
  ROUND(SUM(custo_estimado)::NUMERIC, 6) AS custo_total_usd,
  MAX(timestamp)                         AS ultima_interacao
FROM public.depy_logs
GROUP BY user_id;

-- ── 8. FUNCTION: get_user_id_by_email ────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM public.users WHERE email = p_email LIMIT 1;
  RETURN v_id;
END;
$$;

