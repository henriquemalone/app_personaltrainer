// ================================================================
//  Hyper Fit – assinaturas Mercado Pago (Cloud Run function)
//  Rotas:  POST /assinar   (app)  cria a assinatura com 7 dias grátis
//          POST /cancelar  (app)  cancela a assinatura
//          POST /cartao    (app)  troca o cartão
//          POST /sincronizar (app) confere a assinatura direto no Mercado Pago (reserva, caso um aviso se perca)
//          POST /webhook   (Mercado Pago) avisos de assinatura e pagamento
//  A chave secreta do Mercado Pago fica SÓ aqui (variável MP_ACCESS_TOKEN).
//  O resultado é gravado em acessos/{uid}, que o app lê para liberar o acesso.
// ================================================================
const functions = require('@google-cloud/functions-framework');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.firestore();

const MP = 'https://api.mercadopago.com';
const env = k => (process.env[k] || '').trim();
const PRECO = Number(env('PRECO') || 9.9);
const DIAS_TESTE = Number(env('DIAS_TESTE') || 7);
const GRACA = 3; // dias de tolerância depois da data de cobrança (tentativas do Mercado Pago)
const ORIGENS = (env('ORIGENS') || 'https://hypertreino.com.br,https://www.hypertreino.com.br').split(',').map(s => s.trim());
const ymd = d => new Date(d).toISOString().slice(0, 10);
const maisDias = (d, n) => new Date(new Date(d).getTime() + n * 864e5);

class Erro extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

async function mp(method, path, body) {
  const r = await fetch(MP + path, {
    method,
    headers: { Authorization: 'Bearer ' + env('MP_ACCESS_TOKEN'), 'Content-Type': 'application/json', 'X-Idempotency-Key': crypto.randomUUID() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('MP', method, path, r.status, JSON.stringify(j)); throw new Erro(j.message || `Mercado Pago respondeu ${r.status}`, 502); }
  return j;
}

async function usuario(req) {
  const h = req.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) throw new Erro('Faça login de novo', 401);
  try { return await admin.auth().verifyIdToken(h.slice(7)); } catch (e) { throw new Erro('Faça login de novo', 401); }
}

async function avisarEmail(texto, u) { // usa o mesmo Apps Script das sugestões (opcional)
  if (!env('EMAIL_URL')) return;
  try {
    await fetch(env('EMAIL_URL'), { method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ tipo: 'Assinatura', texto, email: u?.email || '', nome: u?.nome || '', versao: 'servidor', aparelho: '', em: Date.now() }) });
  } catch (e) { console.warn('email', e.message); }
}

// Atualiza acessos/{uid} a partir da assinatura do Mercado Pago
async function sincronizar(pre, extra = {}) {
  const uid = pre.external_reference; if (!uid) return null;
  const ref = db.doc('acessos/' + uid);
  const atual = (await ref.get()).data() || {};
  if (atual.tipo === 'vitalicio') return atual; // vitalício manual tem prioridade
  const d = { ...atual, tipo: 'assinante', fonte: 'mp', mpId: pre.id, mpStatus: pre.status, email: atual.email || pre.payer_email || '', em: Date.now(), ...extra };
  if (pre.next_payment_date) d.proxCobranca = ymd(pre.next_payment_date);
  if (pre.status === 'cancelled' && atual.mpStatus !== 'cancelled') {
    d.canceladoEm = Date.now();
    if (d.teste) d.ate = ymd(maisDias(Date.now(), -1)); // cancelou no teste: acesso termina agora, nada é cobrado
    // depois de pagar: mantém o acesso até o fim do período já pago (campo "ate")
  }
  await ref.set(d);
  return d;
}

const handlers = {
  // ---------- app: criar assinatura com teste grátis ----------
  async assinar(req, res) {
    const u = await usuario(req);
    const { token, email } = req.body || {};
    if (!token) throw new Erro('Cartão não informado');
    const atual = (await db.doc('acessos/' + u.uid).get()).data() || {};
    if (atual.tipo === 'vitalicio') throw new Erro('Sua conta já tem acesso vitalício');
    if (atual.fonte === 'mp' && ['authorized', 'pending'].includes(atual.mpStatus)) throw new Erro('Você já tem uma assinatura ativa');
    const jaTestou = !!atual.mpId; // quem já fez o teste antes paga desde o início
    const inicio = jaTestou ? maisDias(Date.now(), 0.05) : maisDias(Date.now(), DIAS_TESTE);
    const pre = await mp('POST', '/preapproval', {
      reason: 'Hyper Fit – assinatura mensal',
      external_reference: u.uid,
      payer_email: env('TEST_PAYER_EMAIL') || email || u.email,
      card_token_id: token,
      auto_recurring: { frequency: 1, frequency_type: 'months', start_date: inicio.toISOString(), transaction_amount: PRECO, currency_id: 'BRL' },
      back_url: ORIGENS[0],
      status: 'authorized',
    });
    const fimTeste = pre.next_payment_date || inicio.toISOString();
    const d = await sincronizar(pre, { teste: !jaTestou, email: u.email || '', inicioTeste: Date.now(), ate: ymd(maisDias(fimTeste, GRACA)), ultimoPagamento: null });
    const users = (await db.doc('users/' + u.uid).get()).data() || {};
    avisarEmail(`Nova assinatura: ${u.email} (${jaTestou ? 'sem teste' : 'teste grátis até ' + ymd(maisDias(fimTeste, -1))}). 1ª cobrança em ${ymd(fimTeste)}.`, { email: u.email, nome: users.nome });
    res.json({ ok: true, acesso: d });
  },

  // ---------- app: cancelar ----------
  async cancelar(req, res) {
    const u = await usuario(req);
    const atual = (await db.doc('acessos/' + u.uid).get()).data() || {};
    if (!atual.mpId) throw new Erro('Nenhuma assinatura encontrada');
    const pre = await mp('PUT', '/preapproval/' + atual.mpId, { status: 'cancelled' });
    const d = await sincronizar(pre);
    avisarEmail(`Assinatura cancelada: ${u.email}${atual.teste ? ' (durante o teste, nada cobrado)' : ''}.`, { email: u.email });
    res.json({ ok: true, acesso: d });
  },

  // ---------- app: trocar cartão ----------
  async cartao(req, res) {
    const u = await usuario(req);
    const { token } = req.body || {}; if (!token) throw new Erro('Cartão não informado');
    const atual = (await db.doc('acessos/' + u.uid).get()).data() || {};
    if (!atual.mpId || atual.mpStatus === 'cancelled') throw new Erro('Nenhuma assinatura ativa');
    const pre = await mp('PUT', '/preapproval/' + atual.mpId, { card_token_id: token });
    const d = await sincronizar(pre, { ultimoPagamento: atual.ultimoPagamento === 'rejected' ? 'cartao-novo' : atual.ultimoPagamento || null });
    res.json({ ok: true, acesso: d });
  },

  // ---------- app: conferir a assinatura no Mercado Pago ----------
  async sincronizar(req, res) {
    const u = await usuario(req);
    const atual = (await db.doc('acessos/' + u.uid).get()).data() || {};
    if (!atual.mpId) return res.json({ ok: true, acesso: atual });
    const pre = await mp('GET', '/preapproval/' + atual.mpId);
    const cobradas = Number(pre.summarized?.charged_quantity || 0);
    let d;
    if (pre.status === 'authorized' && cobradas > Number(atual.cobrancas || 0) && pre.next_payment_date) // houve cobrança aprovada desde a última conferência
      d = await sincronizar(pre, { teste: false, cobrancas: cobradas, ultimoPagamento: 'approved', pagoEm: Date.now(), ate: ymd(maisDias(pre.next_payment_date, GRACA)) });
    else d = await sincronizar(pre);
    res.json({ ok: true, acesso: d });
  },

  // ---------- Mercado Pago: avisos ----------
  async webhook(req, res) {
    const b = req.body || {};
    const id = String(req.query['data.id'] || b.data?.id || '');
    const tipo = String(req.query.type || b.type || b.topic || '');
    if (env('MP_WEBHOOK_SECRET')) { // confere a assinatura secreta do aviso
      const sig = Object.fromEntries(String(req.get('x-signature') || '').split(',').map(p => p.trim().split('=')));
      const manifesto = `id:${id.toLowerCase()};request-id:${req.get('x-request-id') || ''};ts:${sig.ts};`;
      const esperado = crypto.createHmac('sha256', env('MP_WEBHOOK_SECRET')).update(manifesto).digest('hex');
      if (!sig.v1 || sig.v1.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(sig.v1), Buffer.from(esperado))) { console.warn('assinatura inválida', tipo, id); return res.status(401).send('assinatura inválida'); }
    }
    if (!id) return res.status(200).send('ok');
    if (tipo === 'subscription_preapproval') {
      await sincronizar(await mp('GET', '/preapproval/' + id));
    } else if (tipo === 'subscription_authorized_payment') {
      const ap = await mp('GET', '/authorized_payments/' + id);
      const pre = await mp('GET', '/preapproval/' + ap.preapproval_id);
      const st = ap.payment?.status || ap.status;
      if (st === 'approved') {
        const prox = pre.next_payment_date || maisDias(Date.now(), 31);
        const d = await sincronizar(pre, { teste: false, ultimoPagamento: 'approved', pagoEm: Date.now(), cobrancas: Number(pre.summarized?.charged_quantity || 0), ate: ymd(maisDias(prox, GRACA)) });
        if (d) avisarEmail(`Pagamento aprovado: R$ ${PRECO.toFixed(2).replace('.', ',')} de ${d.email}.`, { email: d.email });
      } else if (['rejected', 'cancelled'].includes(st)) {
        const d = await sincronizar(pre, { ultimoPagamento: 'rejected' });
        if (d) avisarEmail(`Pagamento recusado: ${d.email}. O Mercado Pago tenta de novo por alguns dias.`, { email: d.email });
      } else await sincronizar(pre);
    }
    res.status(200).send('ok');
  },
};

functions.http('api', async (req, res) => {
  const origem = req.get('Origin') || '';
  if (ORIGENS.includes(origem)) { res.set('Access-Control-Allow-Origin', origem); res.set('Vary', 'Origin'); }
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  const rota = req.path.replace(/^\/+|\/+$/g, '');
  const h = handlers[rota];
  if (!h || req.method !== 'POST') return res.status(404).json({ erro: 'rota não encontrada' });
  try { await h(req, res); }
  catch (e) { console.error(rota, e); res.status(e.status || 500).json({ erro: e.status ? e.message : 'Erro no servidor. Tente de novo.' }); }
});

module.exports = { sincronizar, handlers }; // para testes
