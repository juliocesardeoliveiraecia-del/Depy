# Depy — Seu Companheiro Digital

Companhia digital com chat IA, planos pagos e backend Supabase.

## Estrutura do Projeto

```
/
├── index.html          → App principal (18 telas)
├── app.js              → JavaScript completo
├── style.css           → CSS completo
├── manifest.json       → PWA config
├── service-worker.js   → Cache offline
├── icon-192.png        → Ícone 192px
├── icon-512.png        → Ícone 512px
├── vercel.json         → Config Vercel + rotas API
├── SUPABASE_SETUP.sql  → SQL completo do banco
├── README.md           → Este arquivo
└── api/
    ├── chat.js         → Endpoint chat Anthropic
    └── webhook.js      → Webhook Mercado Pago
```

## Setup Completo

### 1. Supabase
1. Abra [supabase.com](https://supabase.com) → seu projeto
2. Vá em **SQL Editor**
3. Cole e execute `SUPABASE_SETUP.sql`
4. Anote: **Project URL** e **service_role key**

### 2. Vercel — Variáveis de Ambiente
Vá em: **Settings → Environment Variables**

| Variável | Onde encontrar |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → service_role |
| `MP_ACCESS_TOKEN` | Mercado Pago → Credenciais de produção |

> ⚠️ `SUPABASE_SERVICE_KEY` nunca deve aparecer no frontend

### 3. Mercado Pago — Webhook
1. Acesse: MP Dashboard → Suas integrações → Webhooks
2. URL: `https://depy-app.vercel.app/api/webhook`
3. Eventos: `payment` + `subscription_preapproval`

### 4. Deploy
```
GitHub → push → Vercel detecta → deploy automático (~60s)
```

## Planos

| Plano | Mensagens | Preço |
|---|---|---|
| Gratuito | 10 totais (acesso inicial) | Grátis |
| Básico | 500/mês | R$ 20 |
| Pro ⭐ | 1.000/mês | R$ 40 |
| Premium | 2.000/mês | R$ 80 |

## IDs Mercado Pago

| Plano | preapproval_plan_id |
|---|---|
| Básico | `1bbb0e9547834d48be979d5a999fd3bc` |
| Pro | `5adce0811ff746668764283d5a98258d` |
| Premium | `8a0a8c144090431fa4494cd8db4e45b0` |

## Checklist de Lançamento

- [ ] SQL executado no Supabase
- [ ] `ANTHROPIC_API_KEY` configurada no Vercel
- [ ] `SUPABASE_SERVICE_KEY` configurada no Vercel
- [ ] `MP_ACCESS_TOKEN` configurada no Vercel
- [ ] Webhook configurado no MP com URL correta
- [ ] Deploy feito no GitHub → Vercel
- [ ] Teste de pagamento real realizado

## Empresa
© 2026 JCO Company — Depy é uma marca registrada.
