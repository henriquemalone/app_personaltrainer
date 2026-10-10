// ================================================================
//  Treino v2 — PWA + Firebase (Auth, Firestore offline, AI Logic)
// ================================================================
export const VERSAO_APP = '2.3.0';
const FB = 'https://www.gstatic.com/firebasejs/12.19.0/';

import { firebaseConfig, RECAPTCHA_SITE_KEY, MODELO_IA, YOUTUBE_API_KEY } from './config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, updateProfile } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc,
  deleteDoc, onSnapshot, query, orderBy, limit, writeBatch, getDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

// ================= Utilidades =================
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };
const kgOuVazio = v => (v === '' || v == null) ? '' : num(v);
const fmtKg = n => (n === '' || n == null) ? '—' : (Math.round(n * 100) / 100).toString().replace('.', ',');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoje = () => ymd(new Date());
const somaDias = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const diasAte = v => Math.round((new Date(v + 'T00:00') - new Date(hoje() + 'T00:00')) / 864e5);
const fmtData = v => new Date(v + 'T00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'short', year:'numeric'});
const fmtDH = t => new Date(t).toLocaleDateString('pt-BR', {weekday:'short', day:'2-digit', month:'short'});
const repsBase = r => parseInt(String(r).match(/\d+/)?.[0] || '10', 10);
const mmss = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
const clone = o => JSON.parse(JSON.stringify(o));
function toast(m, ms = 2800) { const t = $('toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', ms); }
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const DEV = uid(); // id deste aparelho/aba, para ignorar o "eco" das próprias gravações

// ================= Firebase =================
const configurado = !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
let app, auth, db, aiModelCache = {};
if (configurado) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  if (RECAPTCHA_SITE_KEY) {
    import(FB + 'firebase-app-check.js').then(({ initializeAppCheck, ReCaptchaEnterpriseProvider }) => {
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
    }).catch(e => console.warn('App Check', e));
  }
}

// ================= Estado =================
const cfgPadrao = () => ({ backupDias: 14, ultimoBackup: null, avisoVisto: null, migrado: false });
const S = { user: null, perfil: { cfg: cfgPadrao() }, fichas: [], sessoes: [], avaliacoes: [], plano: null, diario: [], ativo: null, pronto: { fichas: false, sessoes: false, perfil: false, ativo: false, avaliacoes: false, plano: false, diario: false } };
let unsubs = [];
const uref = (...p) => doc(db, 'users', S.user.uid, ...p);
const ucol = (...p) => collection(db, 'users', S.user.uid, ...p);

// Gravações (Firestore enfileira offline e sincroniza sozinho)
const falhou = e => { console.error(e); toast('Erro ao salvar: ' + (e.code || e.message)); };
const salvarFicha_ = f => setDoc(uref('fichas', f.id), { ...clone(f), atualizadoEm: Date.now() }).catch(falhou);
const excluirFicha_ = id => deleteDoc(uref('fichas', id)).catch(falhou);
const salvarSessao_ = s => setDoc(uref('sessoes', s.id), clone(s)).catch(falhou);
const excluirSessao_ = id => deleteDoc(uref('sessoes', id)).catch(falhou);
const salvarCfg = () => setDoc(uref(), { cfg: S.perfil.cfg, nome: S.user.displayName || '' }, { merge: true }).catch(falhou);
let ativoT = null;
function salvarAtivo(imediato) {
  clearTimeout(ativoT);
  const run = () => setDoc(uref('estado', 'ativo'), S.ativo ? { sessao: clone(S.ativo), dev: DEV, em: Date.now() } : { sessao: null, dev: DEV, em: Date.now() }).catch(falhou);
  if (imediato) run(); else ativoT = setTimeout(run, 600);
}

function escutar() {
  unsubs.forEach(u => u()); unsubs = [];
  unsubs.push(onSnapshot(uref(), d => {
    if (!d.exists()) setDoc(uref(), { cfg: cfgPadrao(), nome: S.user.displayName || '', criadoEm: Date.now() }, { merge: true }).catch(falhou);
    const v = d.data() || {}; S.perfil = { ...v, cfg: { ...cfgPadrao(), ...(v.cfg || {}) } }; S.pronto.perfil = true; aoMudar('perfil');
  }, erroEscuta));
  unsubs.push(onSnapshot(ucol('fichas'), qs => {
    S.fichas = qs.docs.map(d => d.data()).sort((a, b) => String(a.letra).localeCompare(String(b.letra)));
    S.pronto.fichas = true; aoMudar('fichas');
  }, erroEscuta));
  unsubs.push(onSnapshot(query(ucol('sessoes'), orderBy('inicio', 'desc'), limit(400)), qs => {
    S.sessoes = qs.docs.map(d => d.data()); S.pronto.sessoes = true; aoMudar('sessoes');
  }, erroEscuta));
  unsubs.push(onSnapshot(query(ucol('avaliacoes'), orderBy('data', 'asc')), qs => {
    S.avaliacoes = qs.docs.map(d => d.data()); S.pronto.avaliacoes = true; aoMudar('avaliacoes');
  }, erroEscuta));
  unsubs.push(onSnapshot(uref('dieta', 'atual'), d => { S.plano = d.exists() ? d.data() : null; S.pronto.plano = true; aoMudar('plano'); }, erroEscuta));
  unsubs.push(onSnapshot(query(ucol('diario'), orderBy('data', 'desc'), limit(120)), qs => { S.diario = qs.docs.map(d => d.data()); S.pronto.diario = true; aoMudar('diario'); }, erroEscuta));
  unsubs.push(onSnapshot(uref('estado', 'ativo'), d => {
    const v = d.data();
    if (S.pronto.ativo && v && v.dev === DEV) return; // eco da própria gravação
    S.ativo = v?.sessao || null; S.pronto.ativo = true;
    if (S.ativo?.restEnd > Date.now()) retomarTimer(S.ativo.restEnd); else if (!S.ativo) pararTimerUI();
    aoMudar('ativo');
  }, erroEscuta));
}
function erroEscuta(e) { console.error(e); toast('Sem acesso aos dados: ' + (e.code || e.message), 5000); }
let primeiraCarga = true;
function aoMudar(o) {
  if (!Object.values(S.pronto).every(Boolean)) return;
  if (primeiraCarga) { primeiraCarga = false; if (S.ativo) rota = 'treino'; render(); checarAvisoValidade(); checarMigracao(); return; }
  if (['editar', 'prompt', 'auth', 'revisar', 'avaliacao', 'dietaTexto', 'dietaRevisar', 'dietaEditar'].includes(rota)) return;
  if (rota === 'dieta' && (o === 'diario' || o === 'plano') && document.getElementById('modal').classList.contains('show')) return; // não atrapalhar quem está digitando
  if (rota === 'treino' && S.ativo && o !== 'ativo') { $('navDot').style.display = 'block'; return; }
  const y = $('view').scrollTop; render(); $('view').scrollTop = y;
}

// ================= IA (Gemini via Firebase AI Logic) =================
async function modeloIA(schema) {
  const key = JSON.stringify(schema);
  if (aiModelCache[key]) return aiModelCache[key];
  const { getAI, getGenerativeModel, GoogleAIBackend } = await import(FB + 'firebase-ai.js');
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  return aiModelCache[key] = getGenerativeModel(ai, { model: MODELO_IA,
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0.2 } });
}
function erroIA(e) {
  const m = String(e?.message || e);
  if (!navigator.onLine) return 'Sem internet. A IA precisa de conexão.';
  if (/app.?check|attestation|401|403/i.test(m)) return 'Bloqueado pelo App Check. Confira a chave do reCAPTCHA no config.js e o domínio cadastrado.';
  if (/429|quota|rate/i.test(m)) return 'Limite gratuito da IA atingido. Tente de novo mais tarde.';
  return 'Erro na IA: ' + m.slice(0, 160);
}
const SCHEMA_SERIE = { type: 'object', properties: { reps: { type: 'string', description: 'Repetições, ex.: "10", "8-12", "falha"' }, kg: { type: 'number', description: 'Carga em kg; omitir se não informada' } }, required: ['reps'] };
const SCHEMA_IMPORT = { type: 'object', required: ['fichas'], properties: {
  validadeSemanas: { type: 'integer', description: 'Duração do programa em semanas, se informada' },
  fichas: { type: 'array', items: { type: 'object', required: ['letra', 'nome', 'exercicios'], properties: {
    letra: { type: 'string' }, nome: { type: 'string' },
    exercicios: { type: 'array', items: { type: 'object', required: ['nome', 'series', 'descansoSegundos', 'juntoComAnterior', 'substitutos'], properties: {
      nome: { type: 'string' },
      series: { type: 'array', items: SCHEMA_SERIE },
      descansoSegundos: { type: 'integer' },
      juntoComAnterior: { type: 'boolean', description: 'true se este exercício forma bi-set/tri-set/conjugado com o exercício anterior' },
      observacao: { type: 'string' },
      substitutos: { type: 'array', items: { type: 'string' }, description: 'Exatamente 3 exercícios que trabalham os mesmos músculos' } } } } } } } } };
const SCHEMA_DET = { type: 'object', required: ['itens'], properties: { itens: { type: 'array', items: { type: 'object',
  required: ['exercicio', 'substitutos', 'dicas', 'erros', 'principais', 'secundarios'], properties: {
    exercicio: { type: 'string' }, substitutos: { type: 'array', items: { type: 'string' } }, dicas: { type: 'array', items: { type: 'string' } },
    erros: { type: 'array', items: { type: 'string' } }, principais: { type: 'array', items: { type: 'string' } }, secundarios: { type: 'array', items: { type: 'string' } } } } } } };

async function iaImportar(texto) {
  const m = await modeloIA(SCHEMA_IMPORT);
  const prompt = `Você é um assistente de musculação. Converta o treino abaixo em fichas estruturadas.
Regras:
- Cada divisão (A, B, C, "Treino 1", "segunda"...) vira uma ficha. Use a letra informada; se não houver, use A, B, C... na ordem. "nome" = grupos musculares ou título da divisão.
- Nomes de exercícios em português do Brasil, padronizados (ex.: "Supino reto com barra", "Puxada frontal").
- "series": uma entrada por série. "4x10" = 4 séries com reps "10". "12/10/8" = 3 séries com reps diferentes. Se houver carga por série, coloque em kg em cada série; se houver uma carga só, repita em todas. Se não houver carga, omita kg.
- "descansoSegundos": use o informado (ex.: "1min30" = 90). Se não houver, use 60 para isoladores e 90 para compostos.
- "juntoComAnterior": true quando o texto indicar bi-set, tri-set, conjugado, "+", "junto com" ou superset com o exercício anterior.
- "substitutos": exatamente 3 alternativas comuns em academia que trabalham o mesmo músculo com padrão de movimento semelhante.
- "observacao": técnicas como drop-set, cadência, rest-pause; omita se não houver.
- Não invente exercícios que não estão no texto.

TREINO:
"""${texto}"""`;
  const r = await m.generateContent(prompt);
  return JSON.parse(r.response.text());
}
async function iaDetalhes(nomes) {
  const m = await modeloIA(SCHEMA_DET);
  const prompt = `Para cada exercício de musculação abaixo, responda em português do Brasil, na mesma ordem, mantendo o nome original em "exercicio":
- "substitutos": exatamente 3 exercícios comuns em academia que trabalhem o mesmo músculo com padrão de movimento semelhante (varie o equipamento: barra, halter, máquina, cabo).
- "dicas": 3 a 5 passos curtos e objetivos de execução correta (posição inicial, movimento, respiração/controle).
- "erros": 2 ou 3 erros comuns, curtos.
- "principais": músculos principais trabalhados (nomes anatômicos populares, ex.: "Peitoral maior", "Deltoide anterior").
- "secundarios": músculos auxiliares.
${nomes.map(n => '- ' + n).join('\n')}`;
  const r = await m.generateContent(prompt);
  const itens = JSON.parse(r.response.text()).itens || [], out = {};
  itens.forEach((it, k) => { const nome = nomes.find(n => n.toLowerCase() === String(it.exercicio).toLowerCase()) || (itens.length === nomes.length ? nomes[k] : null); if (!nome) return;
    out[nome.toLowerCase()] = { subs: (it.substitutos || []).slice(0, 3), dicas: (it.dicas || []).slice(0, 6), erros: (it.erros || []).slice(0, 4), principais: (it.principais || []).slice(0, 5), secundarios: (it.secundarios || []).slice(0, 6) }; });
  return out;
}
// Preenche substitutos, dicas e músculos faltantes (em segundo plano, 1 chamada por ficha)
async function completarSubstitutos(f) {
  if (!navigator.onLine) return;
  try {
    const nomes = [...new Set(f.itens.map(e => e.nome))]; const falt = [];
    for (const n of nomes) { const c = await lerCatalogo(n); const semSubs = f.itens.some(e => e.nome === n && !e.subs?.length);
      if (!c.dicas?.length || !c.principais || (semSubs && !c.subs?.length)) falt.push(n); }
    const mapa = falt.length ? await iaDetalhes(falt) : {};
    for (const n of falt) if (mapa[n.toLowerCase()]) gravarCatalogo(n, mapa[n.toLowerCase()]);
    const atual = S.fichas.find(x => x.id === f.id); if (!atual) return;
    let mudou = false;
    for (const e of atual.itens) if (!e.subs?.length) { const c = catCache[slug(e.nome)]; if (c?.subs?.length) { e.subs = c.subs; mudou = true; } }
    if (mudou) salvarFicha_(atual);
  } catch (e) { console.warn('detalhes', e); }
}

// ================= Modelo de ficha =================
// ficha: {id, letra, nome, validade, itens:[{id, nome, descanso, bi, obs, series:[{reps, kg}], subs:[]}]}
// bi=true => este exercício é feito junto com o anterior (bi-set / tri-set)
const novaSerie = (s) => ({ reps: s?.reps ?? '10', kg: s?.kg ?? '' });
const novoItem = () => ({ id: uid(), nome: '', descanso: 60, bi: false, obs: '', series: [novaSerie(), novaSerie(), novaSerie()], subs: [] });
function grupos(itens) { const g = []; itens.forEach((e, i) => { if (e.bi && g.length) g.at(-1).push(i); else g.push([i]); }); return g; }
const resumoSeries = ss => {
  const igual = ss.every(s => String(s.reps) === String(ss[0].reps) && String(s.kg) === String(ss[0].kg));
  if (igual) return `${ss.length} × ${ss[0].reps}${ss[0].kg !== '' && ss[0].kg != null ? ' · ' + fmtKg(ss[0].kg) + ' kg' : ''}`;
  return ss.map(s => `${s.reps}${s.kg !== '' && s.kg != null ? '×' + fmtKg(s.kg) : ''}`).join(' / ');
};
// Converte ficha da v1 (series/reps/carga) para v2
function fichaV1paraV2(f) {
  if (f.itens) return f;
  return { id: f.id || uid(), letra: f.letra, nome: f.nome, validade: f.validade || '',
    itens: (f.ex || []).map(e => ({ id: e.id || uid(), nome: e.nome, descanso: e.descanso ?? 60, bi: false, obs: '', subs: [],
      series: Array.from({ length: e.series || 3 }, () => ({ reps: String(e.reps ?? '10'), kg: e.carga === '' || e.carga == null ? '' : num(e.carga) })) })) };
}

// ================= Validade =================
function statusValidade(f) {
  if (!f.validade) return null;
  const d = diasAte(f.validade);
  if (d < 0) return { cls: 'bad', txt: `Venceu há ${-d} dia${d === -1 ? '' : 's'}`, d };
  if (d === 0) return { cls: 'bad', txt: 'Vence hoje', d };
  if (d <= 7) return { cls: 'warn', txt: `Vence em ${d} dia${d === 1 ? '' : 's'}`, d };
  return { cls: '', txt: `Válida até ${fmtData(f.validade)}`, d };
}
const vencidas = () => S.fichas.filter(f => f.validade && diasAte(f.validade) <= 0);
function checarAvisoValidade() {
  const v = vencidas(); if (!v.length || S.perfil.cfg.avisoVisto === hoje()) return;
  S.perfil.cfg.avisoVisto = hoje(); salvarCfg();
  openModal(`<h2>⏰ Hora de trocar o treino</h2>
    <p class="mut" style="margin-bottom:14px">${v.length === 1 ? 'Esta ficha chegou' : 'Estas fichas chegaram'} ao prazo de validade:</p>
    ${v.map(f => `<div class="row" style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="row left"><span class="tag">${esc(f.letra)}</span><div><b>${esc(f.nome)}</b><div class="mut">${statusValidade(f).txt}</div></div></div>
      <button class="btn sm ghost" onclick="A.closeModal();A.editar('${f.id}')">Editar</button></div>`).join('')}
    <div class="btns" style="margin-top:16px"><button class="btn ghost" style="flex:1" onclick="A.closeModal()">Lembrar amanhã</button>
    <button class="btn" style="flex:1" onclick="A.closeModal();A.go('prompt')">Novo treino por prompt</button></div>`);
}
function calLinks(f) {
  if (!f.validade) return '';
  const d = f.validade.replace(/-/g, ''); const x = new Date(f.validade + 'T00:00'); x.setDate(x.getDate() + 1);
  const g = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Trocar treino ' + f.letra + ' – ' + f.nome)}&dates=${d}/${ymd(x).replace(/-/g, '')}&details=${encodeURIComponent('A ficha ' + f.letra + ' chegou ao prazo de validade.')}`;
  return `<div class="btns" style="margin-top:10px"><a class="btn sm ghost" href="${g}" target="_blank" rel="noopener">+ Google Agenda</a>
    <button class="btn sm ghost" onclick="A.baixarICS('${f.id}')">+ Calendário (.ics)</button></div>`;
}
async function baixarICS(id) {
  const f = S.fichas.find(x => x.id === id); if (!f?.validade) return;
  const d = f.validade.replace(/-/g, '');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Treino//PT-BR', 'BEGIN:VEVENT', `UID:${f.id}-${d}@treino`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART:${d}T090000`, `DTEND:${d}T093000`,
    `SUMMARY:Trocar treino ${f.letra} – ${f.nome}`, 'DESCRIPTION:A ficha chegou ao prazo de validade.',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Hora de trocar o treino', 'TRIGGER:-PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  await compartilharArquivo(new File([ics], `trocar-treino-${f.letra}.ics`, { type: 'text/calendar' }));
}

// ================= Navegação =================
let rota = 'fichas', draft = null, abertos = new Set(), importado = null;
function go(v) { rota = v; render(); $('view').scrollTop = 0; }
function render() {
  if (!configurado) return vNaoConfigurado();
  if (!S.user) return vAuth();
  document.body.classList.remove('noauth');
  const emT = rota === 'treino' && !!S.ativo; document.body.classList.toggle('emtreino', emT); $('tBar').style.display = emT ? 'block' : 'none';
  if (!emT && exAberto) fecharExercicio(); if (tEnd) tick();
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === rota || (['editar', 'prompt', 'revisar'].includes(rota) && b.dataset.v === 'fichas') || (rota === 'avaliacao' && b.dataset.v === 'medidas') || (rota.startsWith('dieta') && b.dataset.v === 'dieta')));
  $('navDot').style.display = S.ativo ? 'block' : 'none';
  $('hdrBtn').style.visibility = rota === 'ajustes' ? 'hidden' : 'visible';
  ({ fichas: vFichas, editar: vEditar, prompt: vPrompt, revisar: vRevisar, treino: vTreino, evolucao: vEvolucao, medidas: vMedidas, avaliacao: vAvaliacao, dieta: vDieta, dietaTexto: vDietaTexto, dietaRevisar: vDietaRevisar, dietaEditar: vDietaEditar, ajustes: vAjustes })[rota]();
}
const setHdr = (sub, ttl) => { $('sub').textContent = sub; $('ttl').textContent = ttl; };

function vNaoConfigurado() {
  setHdr('Configuração pendente', 'Treino');
  $('view').innerHTML = `<div class="banner warn"><b>Firebase não configurado</b>Preencha o arquivo <code>config.js</code> com os dados do seu projeto Firebase (passo a passo no LEIA-ME.md) e publique de novo.</div>`;
}

// ================= Login / cadastro =================
let modoAuth = 'entrar';
function vAuth() {
  document.body.classList.add('noauth'); rota = 'auth';
  $('hdrBtn').style.visibility = 'hidden';
  setHdr('', modoAuth === 'criar' ? 'Criar conta' : modoAuth === 'senha' ? 'Recuperar senha' : 'Entrar');
  $('view').innerHTML = `<div class="auth">
    <div class="logo"><img src="icon-192.png" width="52" height="52" style="border-radius:14px" alt=""><div><b style="font-size:20px">Treino</b><div class="mut">Seus treinos, em qualquer celular</div></div></div>
    <form onsubmit="event.preventDefault();A.enviarAuth()">
      ${modoAuth === 'criar' ? `<label class="f">Nome</label><input class="in" id="aNome" autocomplete="name" required>` : ''}
      <label class="f">E-mail</label><input class="in" id="aEmail" type="email" autocomplete="email" required>
      ${modoAuth !== 'senha' ? `<label class="f">Senha</label><input class="in" id="aSenha" type="password" minlength="6" autocomplete="${modoAuth === 'criar' ? 'new-password' : 'current-password'}" required>` : ''}
      <button class="btn" id="aBtn" style="margin-top:18px">${modoAuth === 'criar' ? 'Criar conta' : modoAuth === 'senha' ? 'Enviar e-mail de recuperação' : 'Entrar'}</button>
    </form>
    <div style="margin-top:14px;text-align:center">
      ${modoAuth === 'entrar' ? `<button class="link ac" onclick="A.modo('criar')">Criar conta</button> · <button class="link" onclick="A.modo('senha')">Esqueci a senha</button>`
        : `<button class="link ac" onclick="A.modo('entrar')">Já tenho conta — entrar</button>`}
    </div></div>`;
}
const msgAuth = c => ({ 'auth/invalid-credential': 'E-mail ou senha incorretos.', 'auth/wrong-password': 'E-mail ou senha incorretos.', 'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/email-already-in-use': 'Já existe conta com este e-mail.', 'auth/weak-password': 'Senha fraca (mínimo 6 caracteres).', 'auth/invalid-email': 'E-mail inválido.',
  'auth/network-request-failed': 'Sem internet. O primeiro login precisa de conexão.', 'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.' }[c] || c);
async function enviarAuth() {
  const email = $('aEmail').value.trim(), senha = $('aSenha')?.value, b = $('aBtn'); b.disabled = true;
  try {
    if (modoAuth === 'entrar') await signInWithEmailAndPassword(auth, email, senha);
    else if (modoAuth === 'criar') { const c = await createUserWithEmailAndPassword(auth, email, senha); await updateProfile(c.user, { displayName: $('aNome').value.trim() }); }
    else { await sendPasswordResetEmail(auth, email); toast('E-mail enviado. Confira sua caixa de entrada e o spam.', 5000); modoAuth = 'entrar'; vAuth(); }
  } catch (e) { toast(msgAuth(e.code || e.message), 4000); b.disabled = false; }
}
async function sair() {
  if (S.ativo && !confirm('Há um treino em andamento. Ele fica salvo na nuvem. Sair mesmo assim?')) return;
  if (!confirm('Sair da conta neste aparelho?')) return;
  unsubs.forEach(u => u()); unsubs = []; await signOut(auth);
}

// ================= Fichas =================
function bannersGerais() {
  let h = '';
  if (!navigator.onLine) h += `<div class="banner info"><b>📴 Offline</b>Tudo continua funcionando; as alterações sincronizam quando a internet voltar.</div>`;
  if (atualizacaoPendente) h += `<div class="banner info"><b>🔄 Nova versão disponível</b><button class="btn sm" style="margin-top:8px" onclick="location.reload()">Atualizar agora</button></div>`;
  const venc = vencidas();
  if (venc.length) h += `<div class="banner bad"><b>⏰ Hora de trocar o treino</b>${venc.map(f => `Ficha ${esc(f.letra)} (${esc(f.nome)}) – ${statusValidade(f).txt.toLowerCase()}`).join('<br>')}</div>`;
  const sp = S.plano?.validade ? statusValidade(S.plano) : null;
  if (sp?.cls) h += `<div class="banner ${sp.cls}"><b>🍽 Plano alimentar</b>${sp.txt}. <button class="btn sm" style="margin-top:8px;display:block" onclick="A.go('dieta')">Abrir dieta</button></div>`;
  const prox = S.fichas.filter(f => statusValidade(f)?.cls === 'warn');
  if (prox.length) h += `<div class="banner warn"><b>Validade chegando</b>${prox.map(f => `Ficha ${esc(f.letra)} – ${statusValidade(f).txt.toLowerCase()}`).join('<br>')}</div>`;
  const bd = S.perfil.cfg.backupDias;
  if (bd > 0 && S.sessoes.length >= 5) { const ult = S.perfil.cfg.ultimoBackup; const d = ult ? Math.floor((Date.now() - ult) / 864e5) : null;
    if (d === null || d >= bd) h += `<div class="banner info"><b>💾 Backup extra</b>Seus dados já estão na nuvem; um arquivo de backup é uma garantia a mais. <button class="btn sm" style="margin-top:10px;display:block" onclick="A.exportar()">Exportar agora</button></div>`; }
  if (!standalone()) h += `<div class="banner info"><b>📲 Instale na tela inicial</b>${isIOS ? 'No Safari: Compartilhar → "Adicionar à Tela de Início".' : 'No Chrome: menu ⋮ → "Instalar app".'}</div>`;
  return h;
}
function vFichas() {
  setHdr(`Olá${S.user.displayName ? ', ' + S.user.displayName.split(' ')[0] : ''} · ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' })}`, 'Minhas fichas');
  let h = bannersGerais();
  if (S.ativo) h += `<div class="banner info"><b>Treino ${esc(S.ativo.letra)} em andamento</b><button class="btn sm" style="margin-top:8px" onclick="A.go('treino')">Continuar</button></div>`;
  if (!S.fichas.length) h += `<div class="empty"><b>Nenhuma ficha ainda</b>Cole seu treino em texto e o app monta tudo, ou crie manualmente.</div>`;
  h += S.fichas.map(f => {
    const st = statusValidade(f); const ult = S.sessoes.find(s => s.fichaId === f.id); const nbi = grupos(f.itens).filter(g => g.length > 1).length;
    return `<div class="card">
      <div class="row"><div class="row left" style="gap:12px;min-width:0"><span class="tag">${esc(f.letra)}</span>
        <div style="min-width:0"><b>${esc(f.nome)}</b><div class="mut">${f.itens.length} exercício${f.itens.length === 1 ? '' : 's'}${ult ? ' · último ' + fmtDH(ult.inicio) : ''}</div></div></div>
        <button class="icon-btn" aria-label="Editar" onclick="A.editar('${f.id}')"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button></div>
      <div class="btns" style="margin-top:10px">${st ? `<span class="chip ${st.cls}">${st.txt}</span>` : ''}${nbi ? `<span class="chip bi">${nbi} bi-set${nbi > 1 ? 's' : ''}</span>` : ''}</div>
      <div class="mut" style="margin:12px 0">${f.itens.map((e, i) => (e.bi ? ' + ' : (i ? ' · ' : '')) + esc(e.nome)).join('') || 'Sem exercícios'}</div>
      <button class="btn" ${f.itens.length ? '' : 'disabled'} onclick="A.iniciar('${f.id}')">Iniciar treino ${esc(f.letra)}</button>
    </div>`; }).join('');
  h += `<div class="btns"><button class="btn" style="flex:1" onclick="A.go('prompt')">✨ Cadastrar por texto</button><button class="btn ghost" style="flex:1" onclick="A.editar(null)">+ Ficha manual</button></div>`;
  $('view').innerHTML = h;
}
function proximaLetra(usadas) { const us = new Set(usadas || S.fichas.map(f => f.letra)); for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!us.has(c)) return c; return '?'; }

// ---------- Editor manual ----------
function editar(id) {
  const f = id ? S.fichas.find(x => x.id === id) : null;
  draft = f ? clone(f) : { id: null, letra: proximaLetra(), nome: '', validade: '', itens: [] };
  if (!draft.itens.length) draft.itens.push(novoItem());
  go('editar');
}
function vEditar() {
  setHdr(draft.id ? 'Editar ficha' : 'Nova ficha', draft.nome || 'Ficha ' + draft.letra);
  const st = draft.validade ? statusValidade(draft) : null;
  const salva = draft.id && S.fichas.find(f => f.id === draft.id)?.validade === draft.validade;
  const it = draft.itens;
  $('view').innerHTML = `
  <div class="card">
    <div style="display:grid;grid-template-columns:80px 1fr;gap:10px">
      <div><label class="f" style="margin-top:0">Letra</label><input class="in" maxlength="3" value="${esc(draft.letra)}" oninput="A.df('letra',this.value.toUpperCase())"></div>
      <div><label class="f" style="margin-top:0">Nome</label><input class="in" placeholder="Ex.: Peito e Tríceps" value="${esc(draft.nome)}" oninput="A.df('nome',this.value)"></div>
    </div>
    <label class="f">Prazo de validade (opcional)</label>
    <input type="date" class="in" value="${esc(draft.validade)}" onchange="A.df('validade',this.value,1)">
    <div class="btns" style="margin-top:8px">
      ${[4, 6, 8, 12].map(s => `<button class="btn sm ghost" onclick="A.df('validade','${somaDias(s * 7)}',1)">+${s} sem</button>`).join('')}
      ${draft.validade ? `<button class="btn sm ghost" onclick="A.df('validade','',1)">Sem prazo</button>` : ''}
    </div>
    ${st ? `<div class="mut" style="margin-top:10px">${st.txt}. O app avisa quando chegar a data.${salva ? ' Para ser avisado com o app fechado, adicione à agenda:' : ''}</div>${salva ? calLinks(draft) : ''}` : ''}
  </div>
  <div class="card"><b>Exercícios</b><div class="mut" style="margin-top:4px">Cada série pode ter repetições e carga próprias. Use 🔗 para juntar com o exercício anterior (bi-set).</div>
    <div style="margin-top:14px">
    ${it.map((e, i) => { const prox = it[i + 1]; const cls = i === 0 ? 'exedit first' : e.bi ? 'exedit bi' : 'exedit'; const head = !e.bi && prox?.bi ? ' bi-head' : '';
      return `<div class="${cls}${head}">
      ${i > 0 ? `<div class="linkbar" style="margin:0 0 10px"><button class="linkbtn ${e.bi ? 'on' : ''}" onclick="A.toggleBi(${i})">🔗 ${e.bi ? 'Junto com o anterior (bi-set)' : 'Juntar com o anterior'}</button></div>` : ''}
      <div class="row" style="margin-bottom:8px"><input class="in" placeholder="Nome do exercício" value="${esc(e.nome)}" oninput="A.d(${i},'nome',this.value)">
        <div class="btns" style="flex-wrap:nowrap;gap:4px">
          <button class="icon-btn sm" style="${i === 0 ? 'opacity:.3' : ''}" onclick="A.moverEx(${i},-1)">↑</button>
          <button class="icon-btn sm" style="${i === it.length - 1 ? 'opacity:.3' : ''}" onclick="A.moverEx(${i},1)">↓</button>
          <button class="icon-btn sm" style="color:var(--bad)" onclick="A.removerEx(${i})">✕</button></div></div>
      <div style="display:grid;grid-template-columns:110px 1fr;gap:8px">
        <div><span class="mut" style="font-size:11px">Descanso (s)</span><input class="in" style="padding:9px" inputmode="numeric" value="${esc(e.descanso)}" oninput="A.d(${i},'descanso',this.value)"></div>
        <div><span class="mut" style="font-size:11px">Observação</span><input class="in" style="padding:9px" placeholder="drop-set, cadência…" value="${esc(e.obs)}" oninput="A.d(${i},'obs',this.value)"></div>
      </div>
      <div class="sets"><span class="h">#</span><span class="h">Reps</span><span class="h">Carga (kg)</span><span></span>
        ${e.series.map((s, j) => `<span class="n">${j + 1}</span>
          <input class="in" value="${esc(s.reps)}" placeholder="10" oninput="A.ds(${i},${j},'reps',this.value)">
          <input class="in" inputmode="decimal" value="${s.kg === '' || s.kg == null ? '' : esc(String(s.kg).replace('.', ','))}" placeholder="—" oninput="A.ds(${i},${j},'kg',this.value)">
          <button class="icon-btn sm" style="color:var(--mut)" onclick="A.removerSerie(${i},${j})">✕</button>`).join('')}
      </div>
      <div class="row" style="margin-top:4px"><button class="link ac" style="white-space:nowrap" onclick="A.addSerieDraft(${i})">+ série</button>
        ${e.subs?.length ? `<span class="mut" style="font-size:12px;text-align:right">Subst.: ${e.subs.map(esc).join(', ')}</span>` : `<span class="mut" style="font-size:12px">substituições geradas ao salvar</span>`}</div>
    </div>`; }).join('')}
    </div>
    <button class="btn ghost" style="margin-top:14px" onclick="A.addEx()">+ Exercício</button>
  </div>
  <button class="btn" onclick="A.salvarFicha()">Salvar ficha</button>
  <div class="btns" style="margin-top:10px">
    <button class="btn ghost" style="flex:1" onclick="A.cancelarEdicao()">Cancelar</button>
    ${draft.id ? `<button class="btn bad" style="flex:1" onclick="A.excluirFicha('${draft.id}')">Excluir ficha</button>` : ''}
  </div>`;
}
const keepScroll = fn => { const y = $('view').scrollTop; fn(); $('view').scrollTop = y; };
const df = (k, v, re) => { draft[k] = v; if (re) keepScroll(vEditar); };
const d = (i, k, v) => { draft.itens[i][k] = v; };
const ds = (i, j, k, v) => { draft.itens[i].series[j][k] = v; };
const toggleBi = i => { draft.itens[i].bi = !draft.itens[i].bi; keepScroll(vEditar); };
function moverEx(i, dd) { const j = i + dd, it = draft.itens; if (j < 0 || j >= it.length) return; [it[i], it[j]] = [it[j], it[i]]; it[0].bi = false; keepScroll(vEditar); }
function removerEx(i) { draft.itens.splice(i, 1); if (draft.itens[0]) draft.itens[0].bi = false; keepScroll(vEditar); }
function addEx() { draft.itens.push(novoItem()); keepScroll(vEditar); }
function addSerieDraft(i) { const ss = draft.itens[i].series; ss.push(novaSerie(ss.at(-1))); keepScroll(vEditar); }
function removerSerie(i, j) { const ss = draft.itens[i].series; if (ss.length <= 1) return toast('O exercício precisa de pelo menos 1 série'); ss.splice(j, 1); keepScroll(vEditar); }
function cancelarEdicao() { draft = null; go('fichas'); }
function normalizarItem(e, i) {
  return { id: e.id || uid(), nome: String(e.nome || '').trim(), descanso: Math.max(0, Math.min(900, parseInt(e.descanso) || 0)), bi: i > 0 && !!e.bi, obs: String(e.obs || '').trim(),
    series: (e.series || []).map(s => ({ reps: String(s.reps ?? '').trim() || '10', kg: kgOuVazio(s.kg) })).slice(0, 20),
    subs: (e.subs || []).filter(x => typeof x === 'string' && x.trim()).slice(0, 3) };
}
function salvarFicha() {
  draft.nome = draft.nome.trim(); draft.letra = (draft.letra || '').trim() || proximaLetra();
  if (!draft.nome) return toast('Dê um nome para a ficha');
  const antigos = {}; (S.fichas.find(f => f.id === draft.id)?.itens || []).forEach(e => antigos[e.id] = e.nome);
  draft.itens = draft.itens.filter(e => e.nome.trim()).map((e, i) => { const n = normalizarItem(e, i); if (antigos[n.id] && antigos[n.id] !== n.nome) n.subs = []; return n; });
  if (!draft.itens.length) return toast('Adicione pelo menos um exercício');
  if (draft.itens.some(e => !e.series.length)) return toast('Todo exercício precisa de pelo menos 1 série');
  const antiga = draft.id ? S.fichas.find(f => f.id === draft.id) : null;
  const mudouValidade = !!draft.validade && antiga?.validade !== draft.validade;
  if (antiga && antiga.validade !== draft.validade) { S.perfil.cfg.avisoVisto = null; salvarCfg(); }
  if (!draft.id) draft.id = uid();
  const f = { id: draft.id, letra: draft.letra, nome: draft.nome, validade: draft.validade || '', itens: draft.itens, criadoEm: antiga?.criadoEm || Date.now() };
  const i = S.fichas.findIndex(x => x.id === f.id); if (i >= 0) S.fichas[i] = f; else S.fichas.push(f);
  salvarFicha_(f); draft = null; go('fichas'); toast('Ficha salva');
  completarSubstitutos(f);
  if (mudouValidade && diasAte(f.validade) > 0) ofertarAgenda(f);
}
function ofertarAgenda(f) {
  openModal(`<h2>Lembrete na agenda?</h2>
    <p class="mut">A ficha ${esc(f.letra)} vence em ${fmtData(f.validade)}. O app avisa quando você abrir; para ser avisado com o app fechado, adicione à sua agenda.</p>
    ${calLinks(f)}<div style="margin-top:16px"><button class="btn ghost" onclick="A.closeModal()">Agora não</button></div>`);
}
function excluirFicha(id) {
  if (!confirm('Excluir esta ficha? O histórico de treinos é mantido.')) return;
  S.fichas = S.fichas.filter(f => f.id !== id); excluirFicha_(id); draft = null; go('fichas');
}

// ---------- Cadastro por texto (IA) ----------
let textoPrompt = '';
const EXEMPLO_PROMPT = `Treino A – Peito e tríceps (descanso 90s)
Supino reto 4x10 com 60kg
Supino inclinado halter 12/10/8 com 22, 24 e 26kg
Crucifixo máquina 3x12 + elevação lateral 3x15 (bi-set)
Tríceps corda 3x12 25kg

Treino B – Costas e bíceps
Puxada frontal 4x10
Remada curvada 3x8 50kg
Rosca direta 3x10 drop-set na última

Validade: 6 semanas`;
function vPrompt() {
  setHdr('Cole o treino em texto livre', 'Cadastrar por texto');
  $('view').innerHTML = `<div class="card">
    <div class="mut" style="margin-bottom:10px">Pode colar do WhatsApp, PDF do personal, anotação… A IA monta as fichas (com séries, cargas, descanso, bi-sets e 3 substituições por exercício). Você revisa antes de salvar.</div>
    <textarea class="in" id="pTxt" placeholder="${esc(EXEMPLO_PROMPT)}" oninput="A.setPrompt(this.value)">${esc(textoPrompt)}</textarea>
    <div class="row" style="margin-top:6px"><button class="link" onclick="A.usarExemplo()">Usar exemplo</button><span class="mut" style="font-size:12px">Não inclua dados de saúde.</span></div>
    <button class="btn" id="pBtn" style="margin-top:10px" onclick="A.gerarDoPrompt()">✨ Gerar fichas</button>
  </div>
  <button class="btn ghost" onclick="A.go('fichas')">Voltar</button>`;
}
const setPrompt = v => textoPrompt = v;
function usarExemplo() { textoPrompt = EXEMPLO_PROMPT; vPrompt(); }
function normalizarImport(r) {
  const fichas = (r.fichas || []).map((f, k) => ({ id: null, letra: String(f.letra || '').trim().toUpperCase().slice(0, 3) || 'ABCDEFGH'[k] || '?', nome: String(f.nome || '').trim() || 'Treino',
    validade: '', itens: (f.exercicios || []).map((e, i) => normalizarItem({ nome: e.nome, descanso: e.descansoSegundos ?? 60, bi: e.juntoComAnterior, obs: e.observacao,
      series: (e.series && e.series.length ? e.series : [{ reps: '10' }, { reps: '10' }, { reps: '10' }]).map(s => ({ reps: s.reps, kg: s.kg ?? '' })), subs: e.substitutos }, i)).filter(e => e.nome) }))
    .filter(f => f.itens.length);
  const sem = parseInt(r.validadeSemanas); const validade = sem > 0 && sem < 60 ? somaDias(sem * 7) : '';
  return { fichas, validade, substituir: true };
}
async function gerarDoPrompt() {
  const t = textoPrompt.trim(); if (t.length < 10) return toast('Cole o treino no campo de texto');
  if (!navigator.onLine) return toast('Sem internet. A IA precisa de conexão.');
  const b = $('pBtn'); b.disabled = true; b.innerHTML = '<span class="spin"></span>Montando fichas…';
  try {
    importado = normalizarImport(await iaImportar(t));
    if (!importado.fichas.length) throw new Error('Não encontrei exercícios no texto.');
    go('revisar');
  } catch (e) { console.error(e); toast(erroIA(e), 6000); b.disabled = false; b.textContent = '✨ Gerar fichas'; }
}
function vRevisar() {
  const I = importado; const letras = new Set(S.fichas.map(f => f.letra)); const conflito = I.fichas.filter(f => letras.has(f.letra));
  setHdr('Confira antes de salvar', `${I.fichas.length} ficha${I.fichas.length > 1 ? 's' : ''} encontrada${I.fichas.length > 1 ? 's' : ''}`);
  $('view').innerHTML = I.fichas.map(f => `<div class="card"><div class="row left" style="gap:12px"><span class="tag">${esc(f.letra)}</span><b>${esc(f.nome)}</b></div>
      <div style="margin-top:10px">${grupos(f.itens).map(g => `<div class="${g.length > 1 ? 'grp' : ''}" style="margin:10px 0">${g.length > 1 ? `<span class="chip bi">Bi-set</span>` : ''}
        ${g.map(i => { const e = f.itens[i]; return `<div style="margin-top:6px"><b style="font-size:15px">${esc(e.nome)}</b>
          <div class="mut">${resumoSeries(e.series)} · desc. ${e.descanso}s${e.obs ? ' · ' + esc(e.obs) : ''}</div>
          ${e.subs.length ? `<div class="mut" style="font-size:12px">Subst.: ${e.subs.map(esc).join(', ')}</div>` : ''}</div>`; }).join('')}</div>`).join('')}</div></div>`).join('') + `
    <div class="card"><label class="f" style="margin-top:0">Validade das fichas</label>
      <input type="date" class="in" value="${esc(I.validade)}" onchange="A.setImp('validade',this.value)">
      ${conflito.length ? `<label class="row left" style="margin-top:14px;gap:10px;font-size:14px"><input type="checkbox" ${I.substituir ? 'checked' : ''} onchange="A.setImp('substituir',this.checked)" style="width:20px;height:20px">
        Substituir as fichas atuais com a mesma letra (${conflito.map(f => f.letra).join(', ')})</label>` : ''}</div>
    <button class="btn" onclick="A.salvarImportado()">Salvar fichas</button>
    <div class="mut" style="text-align:center;margin:10px 0">Depois de salvar, dá para ajustar qualquer detalhe em ✏️ Editar.</div>
    <button class="btn ghost" onclick="A.go('prompt')">Voltar e ajustar o texto</button>`;
}
const setImp = (k, v) => importado[k] = v;
function salvarImportado() {
  const I = importado; const b = writeBatch(db); const usadas = S.fichas.map(f => f.letra);
  for (const f of I.fichas) {
    const ex = S.fichas.find(x => x.letra === f.letra);
    if (ex && I.substituir) { f.id = ex.id; f.criadoEm = ex.criadoEm || Date.now(); }
    else { f.id = uid(); f.criadoEm = Date.now(); if (ex) f.letra = proximaLetra(usadas); }
    usadas.push(f.letra); f.validade = I.validade || '';
    b.set(uref('fichas', f.id), { ...clone(f), atualizadoEm: Date.now() });
  }
  b.commit().catch(falhou);
  if (I.validade) { S.perfil.cfg.avisoVisto = null; salvarCfg(); }
  const n = I.fichas.length; importado = null; textoPrompt = ''; go('fichas'); toast(`${n} ficha${n > 1 ? 's' : ''} salva${n > 1 ? 's' : ''}`);
  I.fichas.forEach((f, k) => setTimeout(() => completarSubstitutos(f), 1500 + k * 1200)); // dicas, músculos e substituições faltantes
}

// ================= Treino ao vivo (passo a passo) =================
function ultimoDoExercicio(nome, preferida) {
  const n = String(nome).toLowerCase();
  if (preferida) { const e = preferida.ex.find(x => x.nome.toLowerCase() === n); if (e && e.sets.length) return e; }
  for (const s of S.sessoes) { const e = s.ex.find(x => x.nome.toLowerCase() === n); if (e && e.sets.length) return e; }
  return null;
}
const prevTxt = pe => pe ? pe.sets.map(s => `${fmtKg(s.kg)}×${s.reps}`) : [];
function setsIniciais(meta, pe) {
  return meta.map((m, j) => ({ kg: pe?.sets[j]?.kg ?? (m.kg !== '' && m.kg != null ? m.kg : (pe?.sets.at(-1)?.kg ?? '')), reps: pe?.sets[j]?.reps ?? repsBase(m.reps), done: false }));
}
function iniciar(id) {
  if (S.ativo && !confirm('Já existe um treino em andamento. Descartar e começar outro?')) return go('treino');
  const f = S.fichas.find(x => x.id === id); const ult = S.sessoes.find(s => s.fichaId === id);
  S.ativo = { fichaId: f.id, letra: f.letra, nome: f.nome, inicio: Date.now(), passo: 0, pulados: [],
    itens: f.itens.map(e => { const pe = ultimoDoExercicio(e.nome, ult);
      return { id: e.id, nome: e.nome, descanso: e.descanso, bi: !!e.bi, obs: e.obs || '', nota: e.nota || '', videoId: e.videoId || '', subs: e.subs || [],
        meta: clone(e.series), prev: prevTxt(pe), sets: setsIniciais(e.series, pe) }; }) };
  abaT = 0; salvarAtivo(true); go('treino'); wake(true);
}
let abaT = 0;
const passos = () => grupos(S.ativo.itens);
const passoFeito = g => g.every(i => S.ativo.itens[i].sets.every(s => s.done));
const rodadaFeita = (g, j) => g.every(i => !S.ativo.itens[i].sets[j] || S.ativo.itens[i].sets[j].done);
const nRodadas = g => Math.max(...g.map(i => S.ativo.itens[i].sets.length));
function rodadaAtual(g) { for (let j = 0; j < nRodadas(g); j++) if (!rodadaFeita(g, j)) return j; return -1; }
const LET = ['A', 'B', 'C', 'D'], COR = ['#a35ddc', '#3b82f6', '#f59e0b', '#14b8a6'];
const thumbHTML = (vid, letra, cor) => `<div class="thumb">${vid ? `<img src="https://i.ytimg.com/vi/${esc(vid)}/mqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">` : `<svg viewBox="0 0 24 24" width="40" fill="none" stroke="#8b929b" stroke-width="1.4"><circle cx="12" cy="5" r="2"/><path d="M12 7v7M12 9l-5 2M12 9l6-1M12 14l-3 6M12 14l3 6"/></svg>`}
  ${letra ? `<span class="badge" style="background:${cor}">${letra}</span>` : '<span class="play">▶</span>'}</div>`;

function vTreino() {
  const T = S.ativo;
  document.body.classList.toggle('emtreino', !!T);
  if (!T) { $('tBar').style.display = 'none'; setHdr('Escolha uma ficha', 'Treinar');
    $('view').innerHTML = S.fichas.length ? S.fichas.map(f => { const st = statusValidade(f); return `<div class="card"><div class="row"><div class="row left" style="gap:12px"><span class="tag">${esc(f.letra)}</span><div><b>${esc(f.nome)}</b><div class="mut">${f.itens.length} exercícios</div></div></div>
      <button class="btn sm" onclick="A.iniciar('${f.id}')">Iniciar</button></div>${st && st.cls ? `<div style="margin-top:10px"><span class="chip ${st.cls}">${st.txt}</span></div>` : ''}</div>`; }).join('')
      : `<div class="empty"><b>Nenhuma ficha</b>Crie uma ficha primeiro.</div><button class="btn" onclick="A.go('prompt')">✨ Cadastrar por texto</button>`;
    return; }
  $('tBar').style.display = 'block';
  const P = passos();
  if (T.passo >= P.length) return vFimTreino();
  const g = P[T.passo];
  const totalS = T.itens.reduce((a, e) => a + e.sets.length, 0), feitas = T.itens.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0);
  let h = `<div class="ttop"><button onclick="A.go('fichas')" aria-label="Minimizar">⌄</button><div><b>Treino ${esc(T.letra)} · ${esc(T.nome)}</b><small id="tClock"></small></div><button onclick="A.listaPassos()" aria-label="Exercícios">☰</button></div>
    <div class="tprog"><i style="width:${totalS ? feitas / totalS * 100 : 0}%"></i></div>`;
  if (g.length === 1) {
    const i = g[0], e = T.itens[i];
    h += `<div class="exhead" onclick="A.abrirExercicio(${i})">${thumbHTML(e.videoId)}<div style="flex:1;min-width:0"><div class="mut" style="font-size:12px">${T.passo + 1} / ${P.length}</div><h3>${esc(e.nome)}</h3></div><span class="info">ⓘ</span></div>`;
  } else {
    h += `<div class="combo"><div class="rows">${g.map((i, k) => { const e = T.itens[i]; return `<div class="r" onclick="A.abrirExercicio(${i})">${thumbHTML(e.videoId, LET[k], COR[k])}
      <div style="flex:1;min-width:0"><div class="mut" style="font-size:12px">${T.passo + 1} / ${P.length}</div><h3>${esc(e.nome)}</h3></div><span class="info">ⓘ</span></div>`; }).join('')}</div><div class="side">${g.length === 2 ? 'BI-SET' : 'TRI-SET'}</div></div>`;
  }
  const notas = g.filter(i => T.itens[i].obs);
  if (notas.length) h += `<div class="notes"><small>Notas do treino</small>${notas.map(i => `${g.length > 1 ? `<b>${esc(T.itens[i].nome)}:</b> ` : ''}${esc(T.itens[i].obs)}`).join('<br>')}</div>`;
  h += `<div class="tabs"><button class="${abaT === 0 ? 'on' : ''}" onclick="A.abaT(0)">Séries</button><button class="${abaT === 1 ? 'on' : ''}" onclick="A.abaT(1)">Comentários</button></div>`;
  if (abaT === 0) {
    const cur = rodadaAtual(g), desc = Math.max(...g.map(i => T.itens[i].descanso || 0));
    h += `<div class="tmeta">${g.length === 1 ? 'Meta: ' + esc(resumoSeries(T.itens[g[0]].meta)) : g.map((i, k) => LET[k] + ': ' + esc(resumoSeries(T.itens[i].meta))).join(' · ')}${desc ? ` · descanso ${desc}s${g.length > 1 ? ' após a rodada' : ''}` : ''}</div>
      <div class="rhead"><span></span><div class="ln"><span></span><span>kg</span><span></span><span>Reps</span><span></span></div></div>`;
    for (let j = 0; j < nRodadas(g); j++) {
      const feita = rodadaFeita(g, j);
      h += `<div class="round ${feita ? 'done' : j === cur ? 'cur' : ''}"><button class="n" onclick="A.toggleRodada(${j})">${feita ? '✓' : j + 1}</button><div class="box">${g.map((i, k) => { const s = T.itens[i].sets[j]; if (!s) return '';
        return `<div class="ln">${g.length > 1 ? `<span class="b" style="background:${COR[k]}">${LET[k]}</span>` : '<span></span>'}
          <input inputmode="decimal" value="${s.kg === '' ? '' : esc(String(s.kg).replace('.', ','))}" placeholder="kg" onchange="A.setSet(${i},${j},'kg',this.value)"><span class="x">×</span>
          <input inputmode="numeric" value="${esc(s.reps)}" onchange="A.setSet(${i},${j},'reps',this.value)">
          <button class="mini" onclick="A.menuSerie(${i},${j})">⋮</button><span></span><div class="pv">anterior: ${esc(T.itens[i].prev[j] || '—')}</div></div>`; }).join('')}</div></div>`;
    }
    h += `<button class="add" onclick="A.addRodada()">+ Adicionar ${g.length > 1 ? 'rodada' : 'série'}</button>`;
  } else {
    h += g.map((i, k) => `<label class="f">${g.length > 1 ? LET[k] + ' · ' : ''}${esc(T.itens[i].nome)}</label><textarea class="in" style="min-height:90px" placeholder="Anotação (ex.: banco no furo 3, pegada aberta)" oninput="A.setNota(${i},this.value)">${esc(T.itens[i].nota)}</textarea>`).join('')
      + `<div class="mut" style="margin-top:6px">Fica salva na ficha e aparece nos próximos treinos.</div>`;
  }
  $('view').innerHTML = h;
  atualizarBotaoTreino(); relogio(); prefetchPasso(g);
}
function atualizarBotaoTreino() {
  const T = S.ativo, b = $('tMain'); if (!T || !b) return; const P = passos();
  if (T.passo >= P.length) { b.textContent = 'Salvar treino'; b.className = 'btn tnext'; return; }
  const g = P[T.passo];
  if (passoFeito(g)) { const resta = P.some((x, k) => k !== T.passo && !passoFeito(x)); b.textContent = resta ? 'Próximo exercício →' : 'Finalizar treino ✓'; b.className = 'btn tnext'; }
  else { b.textContent = `Registrar série ${rodadaAtual(g) + 1}${g.length > 1 ? ' (' + g.map((_, k) => LET[k]).join(' + ') + ')' : ''}`; b.className = 'btn'; }
}
function relogio() { const el = $('tClock'); if (el && S.ativo) { const P = passos(); el.textContent = `${mmss(Math.floor((Date.now() - S.ativo.inicio) / 1000))} · exercício ${Math.min(S.ativo.passo + 1, P.length)} de ${P.length}`; } }
setInterval(() => { if (rota === 'treino' && S.ativo) relogio(); }, 1000);
function acaoTreino() {
  destravarAudio();
  const T = S.ativo; const P = passos();
  if (T.passo >= P.length) return finalizar();
  const g = P[T.passo];
  if (passoFeito(g)) return proximoPasso();
  const j = rodadaAtual(g); g.forEach(i => { const s = T.itens[i].sets[j]; if (s) s.done = true; });
  if (passoFeito(g)) { stopT(); toast(P.some(x => !passoFeito(x)) ? 'Exercício concluído! 💪' : 'Todas as séries concluídas! 💪'); }
  else { const d = Math.max(...g.map(i => T.itens[i].descanso || 0)); if (d > 0) startT(d); }
  salvarAtivo(); keepScroll(vTreino);
}
function proximoPasso() {
  const T = S.ativo, P = passos(); stopT(); abaT = 0;
  T.pulados = (T.pulados || []).filter(k => k !== T.passo);
  let n = P.findIndex((g, k) => k > T.passo && !passoFeito(g) && !T.pulados.includes(k));
  if (n < 0) n = P.findIndex(g => !passoFeito(g)); // volta aos pulados
  T.passo = n < 0 ? P.length : n; salvarAtivo(); go('treino');
}
function toggleRodada(j) {
  const g = passos()[S.ativo.passo]; const feita = rodadaFeita(g, j);
  g.forEach(i => { const s = S.ativo.itens[i].sets[j]; if (s) s.done = !feita; });
  salvarAtivo(); keepScroll(vTreino);
}
function setSet(i, j, k, v) { const s = S.ativo.itens[i].sets[j]; s[k] = k === 'kg' ? kgOuVazio(v) : (parseInt(v) || 0); salvarAtivo(); }
function addRodada() { const g = passos()[S.ativo.passo]; g.forEach(i => { const e = S.ativo.itens[i]; const l = e.sets.at(-1); e.sets.push({ kg: l ? l.kg : '', reps: l ? l.reps : 10, done: false }); }); salvarAtivo(); keepScroll(vTreino); }
function menuSerie(i, j) {
  const s = S.ativo.itens[i].sets[j];
  openModal(`<h2>Série ${j + 1} · ${esc(S.ativo.itens[i].nome)}</h2>
    <div class="mi" onclick="A.closeModal();A.toggleRodada(${j})"><span>${s.done ? '↺' : '✓'}</span>${s.done ? 'Desfazer registro' : 'Marcar como feita'}</div>
    <div class="mi bad" onclick="A.removerSerieT(${i},${j})"><span>✕</span>Remover esta série</div>
    <button class="btn ghost" style="margin-top:14px" onclick="A.closeModal()">Cancelar</button>`);
}
function removerSerieT(i, j) { const e = S.ativo.itens[i]; if (e.sets.length <= 1) return toast('O exercício precisa de pelo menos 1 série'); e.sets.splice(j, 1); e.prev.splice(j, 1); closeModal(); salvarAtivo(); keepScroll(vTreino); }
let notaT = null;
function setNota(i, v) {
  const e = S.ativo.itens[i]; e.nota = v; salvarAtivo(); clearTimeout(notaT);
  notaT = setTimeout(() => { const f = S.fichas.find(x => x.id === S.ativo?.fichaId); const fi = f?.itens.find(x => x.id === e.id); if (fi && fi.nota !== v) { fi.nota = v; salvarFicha_(f); } }, 800);
}
function menuTreino() {
  const T = S.ativo, P = passos(); if (T.passo >= P.length) return;
  const g = P[T.passo];
  openModal(`<h2>Opções</h2>
    ${g.map((i, k) => `<div class="mi" onclick="A.closeModal();A.abrirExercicio(${i})"><span>▶</span>Ver vídeo${g.length > 1 ? ' · ' + LET[k] : ''}</div>`).join('')}
    ${g.map((i, k) => `<div class="mi" onclick="A.closeModal();A.abrirSubs(${i})"><span>⇄</span>Trocar exercício${g.length > 1 ? ' ' + LET[k] + ' (' + esc(T.itens[i].nome) + ')' : ''}</div>`).join('')}
    <div class="mi" onclick="A.pularPasso()"><span>⏭</span>Pular exercício<span class="mut" style="margin-left:auto;width:auto">volta no fim</span></div>
    <div class="mi" onclick="A.closeModal();A.listaPassos()"><span>☰</span>Ver todos os exercícios</div>
    <div class="mi" onclick="A.closeModal();A.finalizar()"><span>✓</span>Encerrar treino e salvar</div>
    <div class="mi bad" onclick="A.closeModal();A.descartar()"><span>🗑</span>Descartar treino</div>`);
}
function pularPasso() {
  closeModal(); const T = S.ativo, P = passos(); stopT(); abaT = 0;
  T.pulados = [...new Set([...(T.pulados || []), T.passo])];
  let n = P.findIndex((g, k) => k > T.passo && !passoFeito(g) && !T.pulados.includes(k));
  if (n < 0) n = P.findIndex((g, k) => k !== T.passo && !passoFeito(g));
  T.passo = n < 0 ? P.length : n; salvarAtivo(); go('treino'); toast('Exercício pulado — fica pendente na lista');
}
function listaPassos() {
  const T = S.ativo, P = passos();
  openModal(`<h2>Exercícios do treino</h2><div class="mut" style="margin-bottom:8px">Toque para ir direto a um exercício.</div>` + P.map((g, k) => {
    const st = passoFeito(g) ? 'done' : k === T.passo ? 'cur' : (T.pulados || []).includes(k) ? 'skip' : '';
    return `<div class="li ${st}" onclick="A.irPasso(${k})"><div class="st">${st === 'done' ? '✓' : st === 'skip' ? '!' : k + 1}</div><div style="flex:1"><div>${g.map(i => esc(T.itens[i].nome)).join(' + ')}</div>
      <div class="mut" style="font-size:12px">${st === 'done' ? 'Concluído' : st === 'skip' ? 'Pulado' : st === 'cur' ? 'Em andamento' : esc(resumoSeries(T.itens[g[0]].meta))}</div></div></div>`; }).join('')
    + `<button class="btn ghost" style="margin-top:14px" onclick="A.closeModal()">Fechar</button>`);
}
function irPasso(k) { closeModal(); stopT(); abaT = 0; S.ativo.passo = k; salvarAtivo(); go('treino'); }
function vFimTreino() {
  const T = S.ativo, P = passos(); const pend = P.filter(g => !passoFeito(g)).length;
  const tot = T.itens.reduce((a, e) => a + e.sets.length, 0), f = T.itens.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0);
  $('view').innerHTML = `<div class="ttop"><button onclick="A.go('fichas')">⌄</button><div><b>Treino ${esc(T.letra)} · ${esc(T.nome)}</b><small id="tClock"></small></div><button onclick="A.listaPassos()">☰</button></div>
    <div class="empty" style="padding-top:50px"><div style="font-size:44px">💪</div><b style="font-size:22px;margin:10px 0">Treino concluído!</b>
    ${mmss(Math.floor((Date.now() - T.inicio) / 1000))} · ${f} de ${tot} séries${pend ? ` · ${pend} exercício${pend > 1 ? 's' : ''} não feito${pend > 1 ? 's' : ''}` : ''}</div>
    ${pend ? `<button class="btn ghost" onclick="A.irPasso(${P.findIndex(g => !passoFeito(g))})">Voltar aos pendentes</button>` : ''}`;
  atualizarBotaoTreino(); relogio();
}
function finalizar() {
  const T = S.ativo;
  const ex = T.itens.map(e => ({ nome: e.nome, bi: e.bi, sets: e.sets.filter(s => s.done).map(s => ({ kg: s.kg === '' ? 0 : num(s.kg), reps: parseInt(s.reps) || 0 })) })).filter(e => e.sets.length);
  if (!ex.length) { if (confirm('Nenhuma série foi registrada. Descartar o treino?')) descartar(true); return; }
  if (!confirm('Encerrar e salvar este treino?')) return;
  const sess = { id: uid(), fichaId: T.fichaId, letra: T.letra, nome: T.nome, inicio: T.inicio, fim: Date.now(), ex };
  S.sessoes.unshift(sess); salvarSessao_(sess);
  S.ativo = null; stopT(); wake(false); salvarAtivo(true); document.body.classList.remove('emtreino'); go('evolucao'); toast('Treino salvo 💪');
}
function descartar(sem) { if (!sem && !confirm('Descartar este treino sem salvar?')) return; S.ativo = null; stopT(); wake(false); salvarAtivo(true); document.body.classList.remove('emtreino'); go('treino'); }

// ---------- Substituições ----------
function abrirSubs(i) {
  const e = S.ativo.itens[i];
  openModal(`<h2>Trocar exercício</h2><div class="mut" style="margin-bottom:8px">No lugar de <b style="color:var(--tx)">${esc(e.nome)}</b>:</div>
    <div id="subsLista">${listaSubs(i)}</div>
    <label class="f">Outro exercício</label>
    <div class="row"><input class="in" id="subOutro" placeholder="Digite o nome"><button class="btn sm" onclick="A.trocarOutro(${i})">Usar</button></div>
    <div class="mut" style="margin-top:12px;font-size:12px">"Hoje" troca só neste treino. "Na ficha" troca também nos próximos.</div>
    <button class="btn ghost" style="margin-top:14px" onclick="A.closeModal()">Cancelar</button>`);
}
function listaSubs(i) {
  const e = S.ativo.itens[i];
  if (!e.subs?.length) return `<div class="opt"><span class="mut">Sem sugestões salvas para este exercício.</span><button class="btn sm" id="gerarSubs" onclick="A.gerarSubs(${i})">✨ Gerar</button></div>`;
  return e.subs.map((n, k) => `<div class="opt"><b style="font-size:15px">${esc(n)}</b><div class="btns" style="flex-wrap:nowrap">
    <button class="btn sm ghost" onclick="A.trocar(${i},${k},false)">Hoje</button><button class="btn sm" onclick="A.trocar(${i},${k},true)">Na ficha</button></div></div>`).join('');
}
async function gerarSubs(i) {
  const e = S.ativo.itens[i], b = $('gerarSubs'); b.disabled = true; b.innerHTML = '<span class="spin"></span>';
  try {
    const det = await detalhesExercicio(e.nome, true); e.subs = det?.subs || [];
    if (!e.subs.length) throw new Error('sem sugestões');
    salvarAtivo();
    const f = S.fichas.find(x => x.id === S.ativo.fichaId); const fi = f?.itens.find(x => x.id === e.id && x.nome === e.nome);
    if (fi) { fi.subs = e.subs; salvarFicha_(f); }
    $('subsLista').innerHTML = listaSubs(i);
  } catch (err) { toast(erroIA(err), 5000); b.disabled = false; b.textContent = '✨ Gerar'; }
}
function trocarOutro(i) { const n = $('subOutro').value.trim(); if (!n) return toast('Digite o nome do exercício'); aplicarTroca(i, n, confirm('Trocar também na ficha (próximos treinos)?\nOK = na ficha · Cancelar = só hoje')); }
const trocar = (i, k, naFicha) => aplicarTroca(i, S.ativo.itens[i].subs[k], naFicha);
function aplicarTroca(i, novo, naFicha) {
  const e = S.ativo.itens[i], antigo = e.nome;
  e.nome = novo; e.subs = [antigo, ...e.subs.filter(x => x !== novo && x !== antigo)].slice(0, 3); e.videoId = '';
  const pe = ultimoDoExercicio(novo); e.prev = prevTxt(pe);
  e.sets.forEach((s, j) => { if (!s.done) s.kg = pe?.sets[j]?.kg ?? pe?.sets.at(-1)?.kg ?? ''; });
  salvarAtivo();
  if (naFicha) { const f = S.fichas.find(x => x.id === S.ativo.fichaId); const fi = f?.itens.find(x => x.id === e.id);
    if (fi) { fi.nome = novo; fi.subs = e.subs; fi.videoId = ''; fi.series = fi.series.map(s => ({ reps: s.reps, kg: '' })); salvarFicha_(f); } }
  closeModal(); keepScroll(vTreino); toast(`Trocado por ${novo}${naFicha ? ' (também na ficha)' : ' (só hoje)'}`);
}

// ================= Timer de descanso =================
let tEnd = 0, tInt = null, actx = null;
const emTreinoUI = () => rota === 'treino' && !!S.ativo;
function startT(s) { tEnd = Date.now() + s * 1000; if (S.ativo) { S.ativo.restEnd = tEnd; salvarAtivo(); } mostrarTimer(); }
function retomarTimer(end) { tEnd = end; mostrarTimer(); }
function mostrarTimer() { $('tmLbl').textContent = 'DESCANSO'; clearInterval(tInt); tInt = setInterval(tick, 250); tick(); }
function addT(s) { if (!tEnd) return; tEnd = Math.max(Date.now() + 1000, tEnd + s * 1000); if (S.ativo) { S.ativo.restEnd = tEnd; salvarAtivo(); } tick(); }
function pararTimerUI() { clearInterval(tInt); tInt = null; tEnd = 0; $('timer').classList.remove('show'); $('tRest').style.display = 'none'; }
function stopT() { pararTimerUI(); if (S.ativo?.restEnd) { delete S.ativo.restEnd; salvarAtivo(); } }
function tick() {
  const left = Math.ceil((tEnd - Date.now()) / 1000); if (left <= 0) return fimDescanso();
  const em = emTreinoUI(); $('timer').classList.toggle('show', !em); $('tRest').style.display = em ? 'flex' : 'none';
  $('tm').textContent = mmss(left); $('tRt').textContent = mmss(left);
}
function fimDescanso() {
  clearInterval(tInt); tInt = null; tEnd = 0; if (S.ativo?.restEnd) { delete S.ativo.restEnd; salvarAtivo(); }
  $('tmLbl').textContent = 'BORA!'; $('tm').textContent = '00:00'; $('tRt').textContent = 'BORA!';
  bip(); if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker?.controller)
    navigator.serviceWorker.ready.then(r => r.showNotification('Descanso acabou', { body: 'Próxima série!', tag: 'descanso', renotify: true, vibrate: [300, 150, 300], icon: 'icon-192.png' }));
  setTimeout(() => { if (!tInt) { $('timer').classList.remove('show'); $('tRest').style.display = 'none'; } }, 2500);
}
function destravarAudio() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} }
function bip() { try { if (!actx) return; const t0 = actx.currentTime;
  [0, 0.25, 0.5].forEach((dt, k) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.value = k === 2 ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(0.5, t0 + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.2);
    o.connect(g).connect(actx.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.22); }); } catch (e) {} }
let wl = null;
async function wake(on) { try { if (on && S.ativo && 'wakeLock' in navigator && !document.hidden) { if (!wl) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => wl = null); } }
  else if (!on && wl) { await wl.release(); wl = null; } } catch (e) {} }

// ================= Tela do exercício (vídeo, execução, músculos) =================
// Catálogo compartilhado entre usuários: catalogo/{slug} = {nome, videos:[{id,t}], dicas[], erros[], principais[], secundarios[], subs[], em}
const slug = n => String(n).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'x';
const catCache = {};
async function lerCatalogo(nome) {
  const k = slug(nome); if (catCache[k]) return catCache[k];
  try { const d = await getDoc(doc(db, 'catalogo', k)); catCache[k] = d.exists() ? d.data() : { nome }; } catch (e) { catCache[k] = { nome }; }
  return catCache[k];
}
function gravarCatalogo(nome, dados) {
  const k = slug(nome); catCache[k] = { ...(catCache[k] || {}), ...dados, nome };
  setDoc(doc(db, 'catalogo', k), { ...dados, nome, em: Date.now() }, { merge: true }).catch(e => console.warn('catalogo', e));
}
async function buscarVideosYT(nome) {
  if (!YOUTUBE_API_KEY || !navigator.onLine) return [];
  const q = encodeURIComponent(`${nome} execução correta`);
  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&videoEmbeddable=true&safeSearch=strict&relevanceLanguage=pt&regionCode=BR&q=${q}&key=${YOUTUBE_API_KEY}`);
  if (!r.ok) throw new Error('YouTube ' + r.status + (r.status === 403 ? ' (chave/domínio ou cota)' : ''));
  const j = await r.json();
  return (j.items || []).filter(x => x.id?.videoId).map(x => ({ id: x.id.videoId, t: String(x.snippet?.title || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').slice(0, 120) }));
}
const buscandoVid = new Set();
async function garantirVideos(nome) {
  const c = await lerCatalogo(nome); if (c.videos?.length) return c.videos;
  const k = slug(nome); if (buscandoVid.has(k)) return []; buscandoVid.add(k);
  try { const v = await buscarVideosYT(nome); if (v.length) gravarCatalogo(nome, { videos: v }); return v; }
  catch (e) { console.warn(e); return []; } finally { buscandoVid.delete(k); }
}
async function detalhesExercicio(nome, forcar) {
  const c = await lerCatalogo(nome); if (c.dicas?.length && c.principais && !forcar) return c;
  if (!navigator.onLine) return c;
  const m = (await iaDetalhes([nome]))[nome.toLowerCase()]; if (m) gravarCatalogo(nome, m);
  return catCache[slug(nome)];
}
// pré-carrega vídeo do passo atual (thumbnail) sem travar a tela
function prefetchPasso(g) {
  g.forEach(async i => { const e = S.ativo?.itens[i]; if (!e || e.videoId) return;
    const v = await garantirVideos(e.nome); const e2 = S.ativo?.itens[i];
    if (v[0] && e2 && e2.nome === e.nome && !e2.videoId) { e2.videoId = v[0].id; salvarAtivo(); if (rota === 'treino') keepScroll(vTreino); } });
}
let exAberto = null, abaEx = 0;
function abrirExercicio(i) {
  const e = S.ativo.itens[i]; exAberto = { i, nome: e.nome }; abaEx = 0;
  $('exTela').classList.add('show'); renderExercicio();
  if (!e.videoId) garantirVideos(e.nome).then(v => { if (v[0] && exAberto?.nome === e.nome && !S.ativo.itens[i].videoId) { S.ativo.itens[i].videoId = v[0].id; salvarAtivo(); renderExercicio(); } });
  detalhesExercicio(e.nome).then(() => { if (exAberto?.nome === e.nome) renderExercicio(true); }).catch(() => {});
}
function fecharExercicio() { $('exTela').classList.remove('show'); $('exVideo').innerHTML = ''; exAberto = null; if (rota === 'treino') keepScroll(vTreino); }
function renderExercicio(soCorpo) {
  if (!exAberto || !S.ativo) return; const e = S.ativo.itens[exAberto.i]; const c = catCache[slug(e.nome)] || {};
  $('exNome').textContent = e.nome;
  if (!soCorpo) $('exVideo').innerHTML = e.videoId
    ? `<iframe src="https://www.youtube-nocookie.com/embed/${esc(e.videoId)}?playsinline=1&rel=0" title="Vídeo de execução" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
    : `<div class="semvid">${navigator.onLine ? (YOUTUBE_API_KEY ? '<span class="spin"></span>Buscando vídeo…' : 'Busca automática desativada (sem chave do YouTube).<br>') : 'Sem internet — o vídeo aparece quando conectar.'}
       <a class="btn sm ghost" style="margin-top:10px" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${encodeURIComponent(e.nome + ' execução')}">Buscar no YouTube</a></div>`;
  document.querySelectorAll('#exTabs button').forEach((b, k) => b.classList.toggle('on', k === abaEx));
  let h = '';
  if (abaEx === 0) {
    const n = e.nome.toLowerCase(); const pts = S.sessoes.filter(s => s.ex.some(x => x.nome.toLowerCase() === n)).slice(0, 12).reverse()
      .map(s => ({ t: s.inicio, v: Math.max(...s.ex.filter(x => x.nome.toLowerCase() === n).flatMap(x => x.sets.map(y => y.kg))), sets: s.ex.filter(x => x.nome.toLowerCase() === n).flatMap(x => x.sets) }));
    if (!pts.length) h = `<div class="mut">Ainda não há registros deste exercício. O gráfico aparece depois do primeiro treino.</div>`;
    else {
      const rec = Math.max(...pts.map(p => p.v));
      h = `<b>Carga máxima</b>${pts.length > 1 ? linhaSVG(pts.map(p => p.v), 'kg', pts.map(p => new Date(p.t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }))) : ''}
        <div class="mut">Recorde: ${fmtKg(rec)} kg</div>
        <div class="card" style="margin-top:12px"><b>Histórico</b><div class="mut" style="margin-top:6px;line-height:1.8">${[...pts].reverse().slice(0, 6).map(p => `${new Date(p.t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · ${p.sets.map(x => fmtKg(x.kg) + '×' + x.reps).join(', ')}`).join('<br>')}</div></div>`;
    }
  } else if (abaEx === 1) {
    h = c.dicas?.length ? `<b>Como fazer</b><ol class="dicas">${c.dicas.map(d => `<li>${esc(d)}</li>`).join('')}</ol>${c.erros?.length ? `<div class="card" style="margin-top:12px"><b>Erros comuns</b><div class="mut" style="margin-top:6px">${c.erros.map(esc).join(' · ')}</div></div>` : ''}<div class="mut" style="font-size:12px;margin-top:8px">Dicas geradas por IA — na dúvida, confirme com seu professor.</div>`
      : `<div class="mut">${navigator.onLine ? '<span class="spin"></span>Gerando dicas…' : 'Sem internet para gerar as dicas.'}</div>`;
  } else {
    const subs = e.subs?.length ? e.subs : (c.subs || []);
    h = c.principais ? `<b>Principais</b><div style="margin:6px 0 12px">${c.principais.map(m => `<span class="chip" style="background:#c6f43222;color:var(--ac);margin:2px">${esc(m)}</span>`).join('')}</div>
      ${c.secundarios?.length ? `<b>Secundários</b><div style="margin-top:6px">${c.secundarios.map(m => `<span class="chip" style="margin:2px">${esc(m)}</span>`).join('')}</div>` : ''}`
      : `<div class="mut">${navigator.onLine ? '<span class="spin"></span>Carregando…' : 'Sem internet.'}</div>`;
    if (subs.length) h += `<div class="mut" style="margin-top:16px">Substitutos: ${subs.map(esc).join(' · ')}</div>`;
  }
  $('exBody').innerHTML = h;
}
const abaExercicio = k => { abaEx = k; renderExercicio(true); };
async function trocarVideo() {
  if (!exAberto) return; const e = S.ativo.itens[exAberto.i]; const vids = await garantirVideos(e.nome);
  openModal(`<h2>Trocar vídeo</h2><div class="mut" style="margin-bottom:6px">Opções encontradas no YouTube:</div>
    ${vids.length ? vids.map(v => `<div class="vopt ${v.id === e.videoId ? 'on' : ''}" onclick="A.escolherVideo('${esc(v.id)}')"><img src="https://i.ytimg.com/vi/${esc(v.id)}/default.jpg" alt=""><div><div style="font-size:14px">${esc(v.t)}</div><div class="mut" style="font-size:12px">${v.id === e.videoId ? 'Em uso' : 'Toque para usar'}</div></div></div>`).join('')
      : `<div class="mut">${YOUTUBE_API_KEY ? 'Nenhum vídeo encontrado (ou sem internet).' : 'Busca automática desativada: falta a chave do YouTube no config.js.'}</div>`}
    <label class="f">Ou cole um link do YouTube (ex.: vídeo do seu professor)</label>
    <div class="row"><input class="in" id="vLink" placeholder="https://youtu.be/..."><button class="btn sm" onclick="A.escolherVideo(null)">Usar</button></div>
    <button class="btn ghost" style="margin-top:14px" onclick="A.closeModal()">Cancelar</button>`);
}
function idDoLink(u) { const m = String(u).match(/(?:youtu\.be\/|v=|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : (/^[A-Za-z0-9_-]{11}$/.test(u.trim()) ? u.trim() : null); }
function escolherVideo(id) {
  if (!id) { id = idDoLink($('vLink').value); if (!id) return toast('Link do YouTube inválido'); }
  const e = S.ativo.itens[exAberto.i]; e.videoId = id; salvarAtivo();
  const f = S.fichas.find(x => x.id === S.ativo.fichaId); f?.itens.forEach(x => { if (x.nome.toLowerCase() === e.nome.toLowerCase()) x.videoId = id; }); if (f) salvarFicha_(f);
  closeModal(); renderExercicio(); toast('Vídeo salvo para este exercício');
}

// ================= Evolução =================
let exSel = null;
const volume = s => s.ex.reduce((a, e) => a + e.sets.reduce((b, x) => b + x.kg * x.reps, 0), 0);
function vEvolucao() {
  setHdr('Histórico e progresso', 'Cargas');
  if (!S.sessoes.length) { $('view').innerHTML = `<div class="empty"><b>Sem treinos registrados</b>Finalize um treino para ver sua evolução aqui.</div>`; return; }
  const lim = Date.now() - 30 * 864e5, ant = Date.now() - 60 * 864e5;
  const mes = S.sessoes.filter(s => s.inicio >= lim), mesAnt = S.sessoes.filter(s => s.inicio >= ant && s.inicio < lim);
  const vM = mes.reduce((a, s) => a + volume(s), 0), vA = mesAnt.reduce((a, s) => a + volume(s), 0);
  const varP = vA ? Math.round((vM / vA - 1) * 100) : null;
  const nomes = [...new Set(S.sessoes.flatMap(s => s.ex.map(e => e.nome)))].sort((a, b) => a.localeCompare(b));
  if (!exSel || !nomes.includes(exSel)) exSel = nomes[0];
  $('view').innerHTML = `
    <div class="stats"><div class="stat"><b>${mes.length}</b><span class="mut">treinos (30d)</span></div>
      <div class="stat"><b>${vM >= 1000 ? fmtKg(Math.round(vM / 100) / 10) + 't' : Math.round(vM) + 'kg'}</b><span class="mut">volume (30d)</span></div>
      <div class="stat"><b>${varP === null ? '—' : (varP > 0 ? '+' : '') + varP + '%'}</b><span class="mut">vs. 30d ant.</span></div></div>
    <div class="card"><div class="row"><b>Carga máxima</b>
      <select onchange="A.setEx(this.value)">${nomes.map(k => `<option ${k === exSel ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
      <div id="ch" style="margin-top:14px"></div></div>
    <div class="card"><b>Sessões</b>
      ${S.sessoes.slice(0, 80).map(s => { const dur = Math.round((s.fim - s.inicio) / 60000), ns = s.ex.reduce((a, e) => a + e.sets.length, 0);
        return `<div class="sess" onclick="A.toggleSess('${s.id}')"><div class="row"><div><div>${esc(s.letra)} · ${esc(s.nome)}</div><div class="mut">${dur} min · ${ns} séries · ${Math.round(volume(s))} kg</div></div><span class="mut">${fmtDH(s.inicio)}</span></div>
        ${abertos.has(s.id) ? `<div class="det">${s.ex.map(e => `${e.bi ? '↳ ' : ''}<b style="color:var(--tx)">${esc(e.nome)}</b>: ${e.sets.map(x => fmtKg(x.kg) + '×' + x.reps).join(', ')}`).join('<br>')}
          <div><button class="link" style="color:var(--bad)" onclick="event.stopPropagation();A.excluirSessao('${s.id}')">Excluir sessão</button></div></div>` : ''}</div>`; }).join('')}
    </div>`;
  grafico();
}
const setEx = v => { exSel = v; grafico(); };
function toggleSess(id) { abertos.has(id) ? abertos.delete(id) : abertos.add(id); keepScroll(vEvolucao); }
function excluirSessao(id) { if (!confirm('Excluir esta sessão do histórico?')) return; S.sessoes = S.sessoes.filter(s => s.id !== id); excluirSessao_(id); keepScroll(vEvolucao); }
function grafico() {
  const pts = S.sessoes.filter(s => s.ex.some(e => e.nome === exSel)).slice(0, 20).reverse()
    .map(s => ({ t: s.inicio, v: Math.max(...s.ex.filter(e => e.nome === exSel).flatMap(e => e.sets.map(x => x.kg))) }));
  const el = $('ch'); if (!pts.length) { el.innerHTML = ''; return; }
  if (pts.length === 1) { el.innerHTML = `<div class="mut">Só 1 registro até agora: <b style="color:var(--tx)">${fmtKg(pts[0].v)} kg</b>. O gráfico aparece a partir do 2º treino.</div>`; return; }
  const dd = pts.map(p => p.v), W = 320, H = 170, p = 28, lo = Math.min(...dd), hi = Math.max(...dd), mg = Math.max(2, (hi - lo) * .15), mn = lo - mg, mx = hi + mg;
  const x = i => p + i * (W - p - 12) / (dd.length - 1), y = v => H - 22 - (v - mn) / (mx - mn) * (H - 40);
  const dm = t => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Carga máxima de ${esc(exSel)}">
    ${[0, .5, 1].map(t => { const v = mn + t * (mx - mn); return `<line x1="${p}" x2="${W - 12}" y1="${y(v)}" y2="${y(v)}" stroke="#2a2e33"/><text x="0" y="${y(v) + 4}" fill="#8b929b" font-size="10">${Math.round(v)}</text>`; }).join('')}
    <polyline points="${dd.map((v, i) => `${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="#c6f432" stroke-width="2.5" stroke-linejoin="round"/>
    ${dd.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="#0e0f11" stroke="#c6f432" stroke-width="2"/>`).join('')}
    <text x="${x(dd.length - 1)}" y="${y(dd.at(-1)) - 10}" fill="#f2f3f5" font-size="11" text-anchor="end">${fmtKg(dd.at(-1))} kg</text>
    <text x="${p}" y="${H - 4}" fill="#8b929b" font-size="10">${dm(pts[0].t)}</text>
    <text x="${W - 12}" y="${H - 4}" fill="#8b929b" font-size="10" text-anchor="end">${dm(pts.at(-1).t)}</text></svg>
    <div class="mut">${(() => { const v = dd.at(-1) - dd[0]; return (v >= 0 ? '+' : '') + fmtKg(v) + ' kg'; })()} nos últimos ${dd.length} treinos</div>`;
}

// ================= Ajustes / backup / migração =================
function vAjustes() {
  setHdr('Conta e dados', 'Ajustes');
  const c = S.perfil.cfg;
  const ult = c.ultimoBackup ? new Date(c.ultimoBackup).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca';
  const notif = 'Notification' in window ? Notification.permission : 'indisponível';
  $('view').innerHTML = `
  <div class="card"><b>Conta</b><div class="mut" style="margin:6px 0 12px">${esc(S.user.displayName || '')}<br>${esc(S.user.email)}</div>
    <button class="btn ghost" onclick="A.sair()">Sair da conta</button></div>
  <div class="card"><b>Perfil (para os cálculos de medidas)</b>
    <div class="fgrid" style="margin-top:10px"><div><label>Sexo</label><select class="in" id="pSexo" style="max-width:100%"><option value="">—</option><option value="M" ${corpo().sexo === 'M' ? 'selected' : ''}>Masculino</option><option value="F" ${corpo().sexo === 'F' ? 'selected' : ''}>Feminino</option></select></div>
      <div><label>Nascimento</label><input class="in" type="date" id="pNasc" value="${esc(corpo().nasc || '')}"></div>
      <div><label>Altura (cm)</label><input class="in" id="pAlt" inputmode="numeric" value="${esc(corpo().altura || '')}"></div></div>
    <div class="mut" style="margin:8px 0 10px;font-size:12px">Usado no IMC, na relação cintura/altura e no % de gordura por dobras.</div>
    <button class="btn ghost" onclick="A.salvarCorpo()">Salvar perfil</button></div>
  <div class="card"><b>Nuvem</b><div class="mut" style="margin-top:6px;line-height:1.7">
    Seus dados ficam salvos na sua conta e aparecem em qualquer celular em que você entrar.<br>
    Conexão: ${navigator.onLine ? 'online ✅' : 'offline (sincroniza quando voltar) ⚠️'}<br>
    Fichas: ${S.fichas.length} · Sessões: ${S.sessoes.length} · Avaliações: ${S.avaliacoes.length} · Dias de dieta: ${S.diario.length}</div></div>
  <div class="card"><b>Backup em arquivo</b><div class="mut" style="margin:6px 0 12px">Garantia extra além da nuvem. Último: ${ult}.</div>
    <button class="btn" onclick="A.exportar()">Exportar backup (.json)</button>
    <button class="btn ghost" style="margin-top:8px" onclick="document.getElementById('fileIn').click()">Importar backup (v1 ou v2)</button>
    <label class="f">Lembrar de exportar a cada</label>
    <select class="in" style="max-width:100%" onchange="A.setBackupDias(this.value)">
      ${[[0, 'Nunca'], [7, '7 dias'], [14, '14 dias'], [30, '30 dias']].map(([v, t]) => `<option value="${v}" ${c.backupDias === v ? 'selected' : ''}>${t}</option>`).join('')}
    </select></div>
  <div class="card"><b>Aparelho</b><div class="mut" style="margin-top:6px;line-height:1.7">
    Versão do app: ${VERSAO_APP}<br>Instalado na tela inicial: ${standalone() ? 'sim ✅' : 'não ⚠️'}<br>Notificação do timer (Android): ${notif === 'granted' ? 'ativa ✅' : notif}</div>
    ${'Notification' in window && Notification.permission === 'default' && !isIOS ? `<button class="btn ghost" style="margin-top:10px" onclick="Notification.requestPermission().then(()=>A.go('ajustes'))">Ativar notificação do timer</button>` : ''}
    <button class="btn ghost" style="margin-top:10px" onclick="A.verificarAtualizacao()">Verificar atualização</button></div>
  <div class="card"><b>Zona de perigo</b><div class="mut" style="margin:6px 0 12px">Apaga fichas e histórico da sua conta (em todos os aparelhos). Exporte um backup antes.</div>
    <button class="btn bad" onclick="A.apagarTudo()">Apagar todos os meus dados</button></div>
  <button class="btn ghost" onclick="A.go('fichas')">Voltar</button>`;
}
const setBackupDias = v => { S.perfil.cfg.backupDias = parseInt(v); salvarCfg(); };
async function compartilharArquivo(file) {
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: file.name }); return true; } }
  catch (e) { if (e.name === 'AbortError') return false; }
  const url = URL.createObjectURL(file); const a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000); return true;
}
async function exportar() {
  const nome = `treino-backup-${hoje().replace(/-/g, '')}.json`;
  const dados = { formato: 'treino-v2', exportadoEm: new Date().toISOString(), fichas: S.fichas, sessoes: S.sessoes, avaliacoes: S.avaliacoes, perfilCorpo: corpo(), plano: S.plano, diario: S.diario };
  if (await compartilharArquivo(new File([JSON.stringify(dados, null, 1)], nome, { type: 'application/json' }))) {
    S.perfil.cfg.ultimoBackup = Date.now(); salvarCfg(); toast('Backup gerado'); }
}
async function gravarEmLotes(ops) { // ops: [ [ref, data|null] ]
  for (let k = 0; k < ops.length; k += 400) { const b = writeBatch(db); ops.slice(k, k + 400).forEach(([r, v]) => v ? b.set(r, v) : b.delete(r)); await b.commit(); }
}
async function importarDados(d, origem) {
  const fichas = (d.fichas || []).map(fichaV1paraV2).map(f => ({ ...f, id: f.id || uid(), itens: f.itens.map(normalizarItem) }));
  const sessoes = (d.sessoes || []).filter(s => s && s.inicio && Array.isArray(s.ex)).map(s => ({ ...s, id: s.id || uid() }));
  const avals = (d.avaliacoes || []).filter(a => a && /^\d{4}-\d{2}-\d{2}$/.test(a.data)).map(a => ({ ...a, id: a.id || uid() }));
  await gravarEmLotes([...fichas.map(f => [uref('fichas', f.id), clone(f)]), ...sessoes.map(s => [uref('sessoes', s.id), clone(s)]), ...avals.map(a => [uref('avaliacoes', a.id), clone(a)])]);
  const dias = (d.diario || []).filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.data));
  if (dias.length) await gravarEmLotes(dias.map(x => [uref('diario', x.data), clone(x)]));
  if (d.plano && !S.plano) await setDoc(uref('dieta', 'atual'), clone(d.plano));
  if (d.perfilCorpo && !corpo().altura) { S.perfil.corpo = d.perfilCorpo; setDoc(uref(), { corpo: d.perfilCorpo }, { merge: true }).catch(falhou); }
  toast(`${origem}: ${fichas.length} fichas, ${sessoes.length} treinos${avals.length ? ' e ' + avals.length + ' avaliações' : ''} importados`, 4000);
  fichas.forEach(f => setTimeout(() => completarSubstitutos(f), 2000));
}
function importarArquivo(inp) {
  const f = inp.files[0]; inp.value = ''; if (!f) return;
  const r = new FileReader(); r.onload = async () => { try {
    const d = JSON.parse(r.result);
    if (!Array.isArray(d.fichas) || !Array.isArray(d.sessoes)) throw new Error('Arquivo não é um backup válido');
    if (!confirm(`Importar ${d.fichas.length} fichas e ${d.sessoes.length} treinos? Itens com o mesmo ID serão sobrescritos; os demais são mantidos.`)) return;
    await importarDados(d, 'Backup');
  } catch (e) { toast('Erro: ' + e.message, 4000); } }; r.readAsText(f);
}
async function apagarTudo() {
  if (!confirm('Apagar TODAS as fichas e o histórico da sua conta?')) return;
  if (!confirm('Tem certeza? Não dá para desfazer.')) return;
  await gravarEmLotes([...S.fichas.map(f => [uref('fichas', f.id), null]), ...S.sessoes.map(s => [uref('sessoes', s.id), null]), ...S.avaliacoes.map(a => [uref('avaliacoes', a.id), null]), ...S.diario.map(x => [uref('diario', x.data), null]), [uref('dieta', 'atual'), null]]);
  S.ativo = null; stopT(); salvarAtivo(true); go('fichas'); toast('Dados apagados');
}
// Dados da v1 (salvos só no aparelho) -> conta na nuvem
function lerV1() {
  return new Promise(res => { try {
    const r = indexedDB.open('treino-app'); r.onupgradeneeded = () => { r.transaction.abort(); res(null); };
    r.onsuccess = () => { const db1 = r.result; if (!db1.objectStoreNames.contains('kv')) return res(null);
      const q = db1.transaction('kv').objectStore('kv').get('state'); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); };
    r.onerror = () => res(null);
  } catch (e) { res(null); } });
}
async function checarMigracao() {
  if (S.perfil.cfg.migrado) return;
  const v1 = await lerV1();
  if (!v1 || (!v1.fichas?.length && !v1.sessoes?.length)) return;
  openModal(`<h2>Dados da versão anterior</h2>
    <p class="mut" style="margin-bottom:16px">Encontrei ${v1.fichas?.length || 0} fichas e ${v1.sessoes?.length || 0} treinos salvos neste celular. Enviar para sua conta na nuvem?</p>
    <button class="btn" onclick="A.migrar()">Enviar para minha conta</button>
    <button class="btn ghost" style="margin-top:8px" onclick="A.naoMigrar()">Não, ignorar</button>`);
}
async function migrar() { closeModal(); const v1 = await lerV1(); if (!v1) return; try { await importarDados(v1, 'Versão anterior'); S.perfil.cfg.migrado = true; salvarCfg(); } catch (e) { falhou(e); } }
function naoMigrar() { closeModal(); S.perfil.cfg.migrado = true; salvarCfg(); }


// ================= Medidas corporais =================
// avaliacao: {id, data:'YYYY-MM-DD', metodo, obs, peso, bf, bfFonte, agua, visc, musc, tmb, <circunferências>, dobras:{...}}
// M[k] = [rótulo, unidade, direção boa (1 sobe, -1 desce, 0 neutro), casas decimais]
const MED = {
  peso: ['Peso', 'kg', 0, 1], bf: ['% gordura', '%', -1, 1], magra: ['Massa magra', 'kg', 1, 1], gorda: ['Massa gorda', 'kg', -1, 1], imc: ['IMC', '', -1, 1],
  rcq: ['Relação cintura/quadril', '', -1, 2], rce: ['Relação cintura/altura', '', -1, 2],
  agua: ['Água corporal', '%', 1, 1], visc: ['Gordura visceral', 'nível', -1, 0], musc: ['Massa muscular esq.', 'kg', 1, 1], tmb: ['Taxa metabólica basal', 'kcal', 0, 0],
  pescoco: ['Pescoço', 'cm', 0, 1], ombro: ['Ombros', 'cm', 1, 1], torax: ['Tórax', 'cm', 0, 1], cintura: ['Cintura', 'cm', -1, 1], abdomen: ['Abdômen', 'cm', -1, 1], quadril: ['Quadril', 'cm', 0, 1],
  bracoRD: ['Braço relaxado D', 'cm', 1, 1], bracoRE: ['Braço relaxado E', 'cm', 1, 1], bracoCD: ['Braço contraído D', 'cm', 1, 1], bracoCE: ['Braço contraído E', 'cm', 1, 1],
  antD: ['Antebraço D', 'cm', 1, 1], antE: ['Antebraço E', 'cm', 1, 1], coxaD: ['Coxa D', 'cm', 1, 1], coxaE: ['Coxa E', 'cm', 1, 1], pantD: ['Panturrilha D', 'cm', 1, 1], pantE: ['Panturrilha E', 'cm', 1, 1] };
const MED_SEC = [['Composição corporal', ['peso', 'bf', 'magra', 'gorda', 'imc', 'rcq', 'rce']], ['Bioimpedância', ['agua', 'visc', 'musc', 'tmb']],
  ['Tronco', ['pescoco', 'ombro', 'torax', 'cintura', 'abdomen', 'quadril']], ['Membros superiores', ['bracoRD', 'bracoRE', 'bracoCD', 'bracoCE', 'antD', 'antE']],
  ['Membros inferiores', ['coxaD', 'coxaE', 'pantD', 'pantE']]];
const CAMPOS_ENTRADA = ['peso', 'bf', 'agua', 'visc', 'musc', 'tmb', 'pescoco', 'ombro', 'torax', 'cintura', 'abdomen', 'quadril', 'bracoRD', 'bracoRE', 'bracoCD', 'bracoCE', 'antD', 'antE', 'coxaD', 'coxaE', 'pantD', 'pantE'];
const DOBRAS = [['peit', 'Peitoral'], ['axil', 'Axilar média'], ['tric', 'Tríceps'], ['subesc', 'Subescapular'], ['abd', 'Abdominal'], ['supra', 'Suprailíaca'], ['coxa', 'Coxa']];
const METODOS = ['Fita + balança', 'Bioimpedância', 'Dobras (adipômetro)', 'DEXA', 'Outro'];
const nOuNull = v => { if (v === '' || v == null) return null; const n = num(v); return n > 0 ? n : null; };
const corpo = () => S.perfil.corpo || {};
function idadeEm(dataISO) { const n = corpo().nasc; if (!n) return null; const a = new Date(dataISO + 'T00:00'), b = new Date(n + 'T00:00');
  let i = a.getFullYear() - b.getFullYear(); if (a.getMonth() < b.getMonth() || (a.getMonth() === b.getMonth() && a.getDate() < b.getDate())) i--; return i; }
// Jackson & Pollock 7 dobras + equação de Siri
function bfDobras(dob, dataISO) {
  const vals = DOBRAS.map(([k]) => nOuNull(dob?.[k])); if (vals.some(v => v == null)) return null;
  const sx = corpo().sexo, id = idadeEm(dataISO); if (!sx || id == null) return null;
  const s = vals.reduce((a, b) => a + b, 0);
  const dc = sx === 'F' ? 1.097 - 0.00046971 * s + 0.00000056 * s * s - 0.00012828 * id : 1.112 - 0.00043499 * s + 0.00000055 * s * s - 0.00028826 * id;
  return Math.round((495 / dc - 450) * 10) / 10;
}
function derivar(a) {
  const r = { ...a }; const alt = num(corpo().altura) || null;
  if (r.peso && r.bf) { r.gorda = r.peso * r.bf / 100; r.magra = r.peso - r.gorda; }
  if (r.peso && alt) r.imc = r.peso / ((alt / 100) ** 2);
  if (r.cintura && r.quadril) r.rcq = r.cintura / r.quadril;
  if (r.cintura && alt) r.rce = r.cintura / alt;
  return r;
}
const fmtM = (k, v) => v == null || !isFinite(v) ? '—' : (Math.round(v * 10 ** MED[k][3]) / 10 ** MED[k][3]).toString().replace('.', ',');
const dtC = s => new Date(s + 'T00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
function deltaM(k, a, b) {
  if (a?.[k] == null || b?.[k] == null) return '<span class="mut">—</span>';
  const d = b[k] - a[k], dir = MED[k][2]; const zero = Math.abs(d) < 10 ** -MED[k][3] / 2;
  const cor = zero || dir === 0 ? 'var(--mut)' : (d * dir > 0 ? 'var(--ok)' : 'var(--bad)');
  const u = MED[k][1] && MED[k][1] !== 'nível' ? ' ' + MED[k][1] : '';
  return `<span style="color:${cor};font-size:12px;font-weight:600;white-space:nowrap">${zero ? '=' : (d > 0 ? '▲ ' : '▼ ') + fmtM(k, Math.abs(d)) + u}</span>`;
}
function linhaSVG(d, u, labels, casas = 1) {
  const W = 320, H = 160, p = 30, mn = Math.min(...d), mx = Math.max(...d), g = Math.max((mx - mn) * .15, mx * .01 || 1), lo = mn - g, hi = mx + g;
  const x = i => p + i * (W - p - 14) / Math.max(1, d.length - 1), y = v => H - 22 - (v - lo) / (hi - lo) * (H - 40);
  const f = v => (Math.round(v * 10 ** casas) / 10 ** casas).toString().replace('.', ',');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="margin-top:10px">
    ${[0, .5, 1].map(t => { const v = lo + t * (hi - lo); return `<line x1="${p}" x2="${W - 14}" y1="${y(v)}" y2="${y(v)}" stroke="#2a2e33"/><text x="0" y="${y(v) + 4}" fill="#8b929b" font-size="10">${f(v)}</text>`; }).join('')}
    <polyline points="${d.map((v, i) => `${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="#c6f432" stroke-width="2.5" stroke-linejoin="round"/>
    ${d.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="#0e0f11" stroke="#c6f432" stroke-width="2"/>`).join('')}
    <text x="${x(d.length - 1)}" y="${y(d.at(-1)) - 10}" fill="#f2f3f5" font-size="11" text-anchor="end">${f(d.at(-1))} ${esc(u)}</text>
    ${labels.length <= 8 ? labels.map((l, i) => `<text x="${x(i)}" y="${H - 4}" fill="#8b929b" font-size="10" text-anchor="middle">${l}</text>`).join('')
      : `<text x="${p}" y="${H - 4}" fill="#8b929b" font-size="10">${labels[0]}</text><text x="${W - 14}" y="${H - 4}" fill="#8b929b" font-size="10" text-anchor="end">${labels.at(-1)}</text>`}</svg>`;
}
let abaMed = 'resumo', medSel = 'bf', cmpA = null, cmpB = null, rascAv = null;
const avs = () => S.avaliacoes.map(derivar); // ordenadas por data (asc)
function vMedidas() {
  const L = avs();
  setHdr(L.length ? `${L.length} avaliaç${L.length > 1 ? 'ões' : 'ão'} · última ${dtC(L.at(-1).data)}` : 'Acompanhe sua composição corporal', 'Medidas');
  let h = '';
  const c = corpo();
  if (!c.altura || !c.sexo || !c.nasc) h += `<div class="banner info"><b>Complete seu perfil</b>Altura, sexo e nascimento são usados no IMC, na relação cintura/altura e no % de gordura por dobras. <button class="btn sm" style="margin-top:8px;display:block" onclick="A.go('ajustes')">Preencher perfil</button></div>`;
  if (!L.length) { $('view').innerHTML = h + `<div class="empty"><b>Nenhuma avaliação ainda</b>Registre peso, % de gordura e circunferências para acompanhar sua evolução.</div><button class="btn" onclick="A.novaAvaliacao()">+ Nova avaliação</button>`; return; }
  h += `<div class="seg">${[['resumo', 'Resumo'], ['grafico', 'Gráfico'], ['comparar', 'Comparar']].map(([k, t]) => `<button class="${abaMed === k ? 'on' : ''}" onclick="A.abaMed('${k}')">${t}</button>`).join('')}</div>`;
  const u = L.at(-1), p = L.length > 1 ? L.at(-2) : null, ini = L[0];
  if (abaMed === 'resumo') {
    const kp = ['peso', 'bf', 'magra', 'cintura'];
    h += `<div class="kpis">${kp.map(k => `<div class="kpi"><span class="mut">${MED[k][0]}</span><b>${fmtM(k, u[k])}<span class="mut" style="font-size:13px"> ${u[k] != null ? MED[k][1] : ''}</span></b>${p ? deltaM(k, p, u) + ` <span class="mut" style="font-size:11px">vs. ${dtC(p.data)}</span>` : '<span class="mut" style="font-size:11px">1ª avaliação</span>'}</div>`).join('')}</div>`;
    if (L.length > 1) {
      const ks = ['peso', 'bf', 'gorda', 'magra', 'cintura', 'abdomen', 'quadril', 'bracoCD', 'coxaD', 'imc'].filter(k => ini[k] != null && u[k] != null);
      h += `<div class="card"><div class="row"><b>Desde o início</b><span class="mut">${dtC(ini.data)} → ${dtC(u.data)}</span></div>
        <table class="cmp">${ks.map(k => `<tr><td>${MED[k][0]}</td><td>${fmtM(k, ini[k])} → ${fmtM(k, u[k])}</td><td>${deltaM(k, ini, u)}</td></tr>`).join('')}</table></div>`;
    }
    h += `<div class="card"><b>Avaliações</b>${[...L].reverse().map(a => `<div class="sess" onclick="A.editarAvaliacao('${a.id}')"><div class="row"><div><div>${dtC(a.data)} · ${esc(a.metodo || '')}</div>
      <div class="mut">${[a.peso != null ? fmtM('peso', a.peso) + ' kg' : '', a.bf != null ? fmtM('bf', a.bf) + '% gordura' + (a.bfFonte === 'dobras' ? ' (dobras)' : '') : '', a.cintura != null ? 'cintura ' + fmtM('cintura', a.cintura) + ' cm' : ''].filter(Boolean).join(' · ')}</div></div><span class="mut">✎</span></div></div>`).join('')}</div>`;
  } else if (abaMed === 'grafico') {
    const disp = MED_SEC.map(([s, ks]) => [s, ks.filter(k => L.some(a => a[k] != null))]).filter(([, ks]) => ks.length);
    if (!disp.some(([, ks]) => ks.includes(medSel))) medSel = disp[0]?.[1][0];
    const pts = L.filter(a => a[medSel] != null);
    h += `<div class="card"><div class="row"><b>Evolução</b><select onchange="A.medSel(this.value)">${disp.map(([s, ks]) => `<optgroup label="${s}">${ks.map(k => `<option value="${k}" ${k === medSel ? 'selected' : ''}>${MED[k][0]}</option>`).join('')}</optgroup>`).join('')}</select></div>
      ${pts.length > 1 ? linhaSVG(pts.map(a => a[medSel]), MED[medSel][1], pts.map(a => new Date(a.data + 'T00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })), MED[medSel][3])
        + `<div class="mut">Variação total: ${deltaM(medSel, pts[0], pts.at(-1))}</div>` : `<div class="mut" style="margin-top:10px">Registre essa medida em pelo menos 2 avaliações para ver o gráfico.</div>`}</div>`;
  } else {
    if (cmpA == null || cmpA >= L.length) cmpA = 0; if (cmpB == null || cmpB >= L.length) cmpB = L.length - 1;
    const a = L[cmpA], b = L[cmpB], opts = s => L.map((x, i) => `<option value="${i}" ${i === s ? 'selected' : ''}>${dtC(x.data)}</option>`).join('');
    h += `<div class="card"><div class="row"><select onchange="A.cmp('a',this.value)">${opts(cmpA)}</select><span class="mut">vs.</span><select onchange="A.cmp('b',this.value)">${opts(cmpB)}</select></div>
      <table class="cmp" style="margin-top:8px"><tr><th>Medida</th><th>${dtC(a.data)}</th><th>${dtC(b.data)}</th><th>Dif.</th></tr>
      ${MED_SEC.map(([s, ks]) => { const vis = ks.filter(k => a[k] != null || b[k] != null); return vis.length ? `<tr class="sec"><td colspan="4">${s}</td></tr>` + vis.map(k => `<tr><td>${MED[k][0]}</td><td>${fmtM(k, a[k])}</td><td>${fmtM(k, b[k])}</td><td>${deltaM(k, a, b)}</td></tr>`).join('') : ''; }).join('')}</table>
      <div class="mut" style="margin-top:10px;font-size:12px">Verde = evolução positiva (gordura ↓, massa magra ↑, braço ↑). Cinza = medida neutra (depende do seu objetivo).</div></div>`;
  }
  h += `<button class="btn" onclick="A.novaAvaliacao()">+ Nova avaliação</button>`;
  $('view').innerHTML = h;
}
function novaAvaliacao() { rascAv = { id: null, data: hoje(), metodo: S.avaliacoes.at(-1)?.metodo || METODOS[0], obs: '', dobras: {} }; go('avaliacao'); }
function editarAvaliacao(id) { const a = S.avaliacoes.find(x => x.id === id); if (!a) return; rascAv = clone(a); rascAv.dobras = rascAv.dobras || {}; go('avaliacao'); }
function vAvaliacao() {
  const r = rascAv; setHdr(r.id ? 'Editar avaliação' : 'Preencha só o que tiver medido', r.id ? dtC(r.data) : 'Nova avaliação');
  const val = v => v == null ? '' : esc(String(v).replace('.', ','));
  const campo = k => `<div><label>${MED[k][0]}${MED[k][1] ? ' (' + MED[k][1] + ')' : ''}</label><input class="in" inputmode="decimal" value="${val(r[k])}" oninput="A.av('${k}',this.value)"></div>`;
  const temDobras = DOBRAS.some(([k]) => r.dobras[k]);
  $('view').innerHTML = `<div class="card">
    <div class="fgrid"><div><label>Data</label><input class="in" type="date" value="${esc(r.data)}" max="${hoje()}" onchange="A.av('data',this.value)"></div>
      <div><label>Método</label><select class="in" style="max-width:100%" onchange="A.av('metodo',this.value)">${METODOS.map(m => `<option ${m === r.metodo ? 'selected' : ''}>${m}</option>`).join('')}</select></div></div>
    <details open><summary>Composição corporal</summary><div class="fgrid" style="margin-top:10px">${campo('peso')}${campo('bf')}</div>
      <div class="calc" id="avCalc"></div></details>
    <details ${temDobras ? 'open' : ''}><summary>Dobras cutâneas (opcional)</summary>
      <div class="mut" style="margin:8px 0">Com as 7 dobras (mm) e o perfil preenchido, o app calcula o % de gordura (Jackson &amp; Pollock 7 dobras + Siri). Se você também digitar o % de gordura acima, vale o digitado.</div>
      <div class="fgrid">${DOBRAS.map(([k, n]) => `<div><label>${n} (mm)</label><input class="in" inputmode="decimal" value="${val(r.dobras[k])}" oninput="A.avDobra('${k}',this.value)"></div>`).join('')}</div></details>
    <details ${['agua', 'visc', 'musc', 'tmb'].some(k => r[k] != null) ? 'open' : ''}><summary>Bioimpedância (opcional)</summary><div class="fgrid" style="margin-top:10px">${['agua', 'visc', 'musc', 'tmb'].map(campo).join('')}</div></details>
    <details ${r.id ? 'open' : ''}><summary>Tronco (cm)</summary><div class="fgrid" style="margin-top:10px">${['pescoco', 'ombro', 'torax', 'cintura', 'abdomen', 'quadril'].map(campo).join('')}</div></details>
    <details ${r.id ? 'open' : ''}><summary>Membros (cm)</summary><div class="fgrid" style="margin-top:10px">${['bracoRD', 'bracoRE', 'bracoCD', 'bracoCE', 'antD', 'antE', 'coxaD', 'coxaE', 'pantD', 'pantE'].map(campo).join('')}</div></details>
    <details ${r.obs ? 'open' : ''}><summary>Observações</summary><textarea class="in" style="min-height:70px;margin-top:10px" placeholder="Ex.: medido em jejum, pela manhã" oninput="A.av('obs',this.value)">${esc(r.obs)}</textarea></details>
  </div>
  <button class="btn" onclick="A.salvarAvaliacao()">Salvar avaliação</button>
  <div class="btns" style="margin-top:10px"><button class="btn ghost" style="flex:1" onclick="A.go('medidas')">Cancelar</button>
    ${r.id ? `<button class="btn bad" style="flex:1" onclick="A.excluirAvaliacao('${r.id}')">Excluir</button>` : ''}</div>`;
  calcAv();
}
function av(k, v) { rascAv[k] = ['data', 'metodo', 'obs'].includes(k) ? v : v; if (k === 'peso' || k === 'bf' || k === 'data') calcAv(); }
function avDobra(k, v) { rascAv.dobras[k] = v; calcAv(); }
function calcAv() {
  const el = $('avCalc'); if (!el) return; const r = rascAv;
  const peso = nOuNull(r.peso), bfDig = nOuNull(r.bf), bfD = bfDobras(r.dobras, r.data), bf = bfDig ?? bfD; const alt = num(corpo().altura) || null;
  const p = [];
  if (bfD != null) p.push(`% gordura por dobras: <b>${fmtM('bf', bfD)}%</b>${bfDig != null ? ' (usando o digitado)' : ''}`);
  else if (DOBRAS.some(([k]) => r.dobras[k]) && (!corpo().sexo || !corpo().nasc)) p.push('Preencha sexo e nascimento no perfil para calcular por dobras.');
  if (peso && alt) p.push(`IMC <b>${fmtM('imc', peso / ((alt / 100) ** 2))}</b>`);
  if (peso && bf) p.push(`Massa gorda <b>${fmtM('gorda', peso * bf / 100)} kg</b> · Massa magra <b>${fmtM('magra', peso * (1 - bf / 100))} kg</b>`);
  el.innerHTML = p.length ? p.join('<br>') : 'Massa magra, massa gorda e IMC são calculados automaticamente.';
}
function salvarAvaliacao() {
  const r = rascAv; if (!r.data) return toast('Informe a data');
  const a = { id: r.id || uid(), data: r.data, metodo: r.metodo || '', obs: String(r.obs || '').trim(), criadoEm: r.criadoEm || Date.now(), atualizadoEm: Date.now(), dobras: {} };
  for (const k of CAMPOS_ENTRADA) a[k] = nOuNull(r[k]);
  for (const [k] of DOBRAS) { const v = nOuNull(r.dobras?.[k]); if (v != null) a.dobras[k] = v; }
  a.bfFonte = a.bf != null ? 'digitado' : null;
  if (a.bf == null) { const b = bfDobras(a.dobras, a.data); if (b != null) { a.bf = b; a.bfFonte = 'dobras'; } }
  if (CAMPOS_ENTRADA.every(k => a[k] == null)) return toast('Preencha pelo menos uma medida');
  if (a.bf != null && (a.bf < 2 || a.bf > 70)) return toast('% de gordura fora do esperado (2–70%). Confira o valor.');
  const i = S.avaliacoes.findIndex(x => x.id === a.id); if (i >= 0) S.avaliacoes[i] = a; else S.avaliacoes.push(a);
  S.avaliacoes.sort((x, y) => x.data.localeCompare(y.data));
  setDoc(uref('avaliacoes', a.id), a).catch(falhou); rascAv = null; abaMed = 'resumo'; go('medidas'); toast('Avaliação salva');
}
function excluirAvaliacao(id) {
  if (!confirm('Excluir esta avaliação?')) return;
  S.avaliacoes = S.avaliacoes.filter(a => a.id !== id); deleteDoc(uref('avaliacoes', id)).catch(falhou); rascAv = null; go('medidas');
}
function salvarCorpo() {
  const c = { sexo: $('pSexo').value, nasc: $('pNasc').value, altura: nOuNull($('pAlt').value) };
  if (c.altura && (c.altura < 100 || c.altura > 230)) return toast('Altura em centímetros (ex.: 178)');
  S.perfil.corpo = c; setDoc(uref(), { corpo: c }, { merge: true }).catch(falhou); toast('Perfil salvo');
}


// ================= Dieta =================
// plano: users/{uid}/dieta/atual = {nome, validade, criadoEm, metas:{kcal,p,c,g,agua(L)}, refeicoes:[{id,h,n,itens:[{id,nome,qtd,kcal,p,c,g,subs[]}]}]}
// diário: users/{uid}/diario/{YYYY-MM-DD} = {data, ref:{[refId]:'done'|'skip'}, trocas:{[refId_itemId]:texto}, agua, extras:[{id,desc,kcal,p,c,g}]}
const SCHEMA_DIETA = { type: 'object', required: ['nome', 'refeicoes', 'metas'], properties: {
  nome: { type: 'string', description: 'Nome/objetivo do plano, ex.: "Hipertrofia"' },
  validadeSemanas: { type: 'integer' },
  metas: { type: 'object', required: ['kcal', 'proteina', 'carboidrato', 'gordura'], properties: { kcal: { type: 'number' }, proteina: { type: 'number' }, carboidrato: { type: 'number' }, gordura: { type: 'number' }, aguaLitros: { type: 'number' } } },
  refeicoes: { type: 'array', items: { type: 'object', required: ['nome', 'itens'], properties: { horario: { type: 'string', description: 'HH:MM' }, nome: { type: 'string' },
    itens: { type: 'array', items: { type: 'object', required: ['nome', 'quantidade', 'kcal', 'proteina', 'carboidrato', 'gordura', 'substitutos'], properties: {
      nome: { type: 'string' }, quantidade: { type: 'string' }, kcal: { type: 'number' }, proteina: { type: 'number' }, carboidrato: { type: 'number' }, gordura: { type: 'number' },
      substitutos: { type: 'array', items: { type: 'string' } } } } } } } } } };
const SCHEMA_ESTIMA = { type: 'object', required: ['itens'], properties: { itens: { type: 'array', items: { type: 'object', required: ['nome', 'kcal', 'proteina', 'carboidrato', 'gordura'],
  properties: { nome: { type: 'string' }, kcal: { type: 'number' }, proteina: { type: 'number' }, carboidrato: { type: 'number' }, gordura: { type: 'number' } } } } } };
async function iaImportarDieta(texto) {
  const m = await modeloIA(SCHEMA_DIETA);
  const r = await m.generateContent(`Você é um assistente de nutrição. Converta o plano alimentar abaixo em dados estruturados, em português do Brasil.
Regras:
- Uma entrada em "refeicoes" por refeição, na ordem do dia, com "horario" (HH:MM) se informado.
- Cada alimento com "quantidade" como está no plano (ex.: "150 g", "2 fatias", "1 concha").
- "kcal", "proteina", "carboidrato", "gordura" (g): use os valores do plano se existirem; senão, estime com base em tabelas de composição de alimentos brasileiras (TACO).
- "substitutos": as opções de substituição que o plano lista para aquele alimento, já com quantidade (ex.: "80 g de tapioca"). Se o plano não listar, devolva lista vazia. Não invente substituições.
- "metas": use as metas do plano; se não houver, some os itens. "aguaLitros" só se o plano informar.
- Não invente alimentos que não estão no texto.

PLANO:
"""${texto}"""`);
  return JSON.parse(r.response.text());
}
async function iaEstimar(texto) {
  const m = await modeloIA(SCHEMA_ESTIMA);
  const r = await m.generateContent(`Estime calorias e macronutrientes (g) de cada alimento descrito abaixo, em porções típicas brasileiras quando a quantidade não for informada. Use referências como a tabela TACO. Responda em português do Brasil.
"""${texto}"""`);
  return (JSON.parse(r.response.text()).itens || []).map(x => ({ nome: String(x.nome), kcal: Math.round(num(x.kcal)), p: Math.round(num(x.proteina)), c: Math.round(num(x.carboidrato)), g: Math.round(num(x.gordura)) }));
}
const r0 = v => Math.round(num(v));
const somaMac = arr => arr.reduce((a, x) => ({ kcal: a.kcal + r0(x.kcal), p: a.p + r0(x.p), c: a.c + r0(x.c), g: a.g + r0(x.g) }), { kcal: 0, p: 0, c: 0, g: 0 });
const plano = () => S.plano;
const diaDoc = d => S.diario.find(x => x.data === d) || { data: d, ref: {}, trocas: {}, agua: 0, extras: [] };
function metaAguaL() { const m = plano()?.metas?.agua; if (m) return m; const p = [...S.avaliacoes].reverse().find(a => a.peso)?.peso; return p ? Math.round(p * 0.035 * 4) / 4 : 3; }
function consumoDia(d) {
  const P = plano(), D = diaDoc(d); const t = { kcal: 0, p: 0, c: 0, g: 0 };
  (P?.refeicoes || []).forEach(rf => { if (D.ref?.[rf.id] === 'done') { const s = somaMac(rf.itens); for (const k in t) t[k] += s[k]; } });
  const e = somaMac(D.extras || []); for (const k in t) t[k] += e[k];
  return t;
}
function adesaoDia(d) { const P = plano(); const n = P?.refeicoes?.length || 0; if (!n) return null; const D = S.diario.find(x => x.data === d); if (!D) return null;
  const f = P.refeicoes.filter(r => D.ref?.[r.id] === 'done').length; const marc = P.refeicoes.filter(r => D.ref?.[r.id]).length; return marc ? Math.round(f / n * 100) : null; }
let diaSel = null, abaDieta = 'hoje', refAberta = null, salvarDiaT = null;
function salvarDia(D) {
  const i = S.diario.findIndex(x => x.data === D.data); if (i >= 0) S.diario[i] = D; else S.diario.unshift(D);
  clearTimeout(salvarDiaT); salvarDiaT = setTimeout(() => setDoc(uref('diario', D.data), { ...clone(D), em: Date.now() }).catch(falhou), 400);
}
const statusPlano = () => plano()?.validade ? statusValidade(plano()) : null;
function anel(v, max) { const r = 42, c = 2 * Math.PI * r, f = max ? Math.min(v / max, 1) : 0;
  return `<svg viewBox="0 0 96 96" width="96" height="96"><circle cx="48" cy="48" r="${r}" fill="none" stroke="#1f2226" stroke-width="9"/><circle cx="48" cy="48" r="${r}" fill="none" stroke="${v > max * 1.08 ? '#ffb020' : '#c6f432'}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c * f} ${c}" transform="rotate(-90 48 48)"/></svg>`; }
function vDieta() {
  const P = plano(); if (!diaSel) diaSel = hoje();
  const st = statusPlano();
  setHdr(P ? `Plano: ${P.nome}${P.validade ? ' · ' + (st.cls ? st.txt.toLowerCase() : 'até ' + dtC(P.validade)) : ''}` : 'Seu plano alimentar', 'Dieta');
  let h = '';
  if (!P) { $('view').innerHTML = `<div class="empty"><b>Nenhum plano alimentar</b>Cole o plano da sua nutricionista e o app monta as refeições, quantidades, substituições e metas.</div>
      <button class="btn" onclick="A.go('dietaTexto')">✨ Cadastrar plano por texto</button><button class="btn ghost" style="margin-top:8px" onclick="A.editarPlano()">+ Criar manualmente</button>`; return; }
  if (st?.cls === 'bad') h += `<div class="banner bad"><b>⏰ Hora de renovar o plano alimentar</b>${st.txt}. <button class="btn sm" style="margin-top:8px;display:block" onclick="A.go('dietaTexto')">Cadastrar novo plano</button></div>`;
  h += `<div class="seg">${[['hoje', 'Hoje'], ['plano', 'Plano'], ['hist', 'Histórico']].map(([k, t]) => `<button class="${abaDieta === k ? 'on' : ''}" onclick="A.abaDieta('${k}')">${t}</button>`).join('')}</div>`;
  if (abaDieta === 'hoje') {
    const D = diaDoc(diaSel), t = consumoDia(diaSel), M = P.metas || {}, copos = Math.round(metaAguaL() / 0.25);
    const ehHoje = diaSel === hoje();
    h += `<div class="datenav"><button onclick="A.mudaDia(-1)">‹</button><b>${ehHoje ? 'Hoje · ' : ''}${new Date(diaSel + 'T00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}</b><button onclick="A.mudaDia(1)" ${ehHoje ? 'disabled style="opacity:.3"' : ''}>›</button></div>
    <div class="card"><div class="kcal"><div class="ring">${anel(t.kcal, M.kcal)}<div><span><b>${t.kcal}</b><br><small>de ${r0(M.kcal)} kcal</small></span></div></div>
      <div style="flex:1">${[['Proteína', 'p', '#7aa7ff'], ['Carboidrato', 'c', '#ffb020'], ['Gordura', 'g', '#ff7ab6']].map(([n, k, cor]) => `<div class="mrow"><div class="row"><span>${n}</span><span class="mut">${t[k]} / ${r0(M[k])} g</span></div><div class="mbar"><i style="width:${M[k] ? Math.min(t[k] / M[k] * 100, 100) : 0}%;background:${cor}"></i></div></div>`).join('')}</div></div>
      <div class="row" style="margin-top:14px"><b style="font-size:14px">💧 Água</b><span class="mut">${fmtKg((D.agua || 0) * 0.25)} / ${fmtKg(copos * 0.25)} L</span></div>
      <div class="agua">${Array.from({ length: Math.max(copos, D.agua || 0) }, (_, i) => `<button class="copo ${i < (D.agua || 0) ? 'on' : ''}" onclick="A.agua(${i})" aria-label="Copo ${i + 1}"></button>`).join('')}</div>
      <div class="mut" style="font-size:11px;margin-top:6px">Cada copo = 250 ml${P.metas?.agua ? '' : ' · meta: 35 ml por kg (aba Medidas)'}</div></div>`;
    h += P.refeicoes.map(rf => { const s = somaMac(rf.itens), est = D.ref?.[rf.id] || '';
      return `<div class="meal ${est}"><div class="mh" onclick="A.abreRef('${rf.id}')"><button class="ck" onclick="event.stopPropagation();A.marcaRef('${rf.id}','done')" aria-label="Comi">${est === 'skip' ? '!' : '✓'}</button>
        <div class="t"><b>${esc(rf.n)}</b><div class="mut">${esc(rf.h || '')}${rf.h ? ' · ' : ''}${rf.itens.length} itens${est === 'skip' ? ' · <span style="color:var(--warn)">pulada</span>' : ''}</div></div>
        <div class="k">${s.kcal} kcal<div class="mut" style="font-weight:400">P${s.p} C${s.c} G${s.g}</div></div></div>
        ${refAberta === rf.id ? `<div class="items">${rf.itens.map(it => { const tr = D.trocas?.[rf.id + '_' + it.id];
          return `<div class="it ${tr ? 'troc' : ''}"><div style="flex:1;min-width:0"><div class="nm">${esc(tr || it.nome)}</div><div class="q">${tr ? 'substituição · original: ' + esc(it.nome) : esc(it.qtd) + ' · ' + r0(it.kcal) + ' kcal'}</div></div>${it.subs?.length ? `<button class="sw" onclick="A.subsAlimento('${rf.id}','${it.id}')">⇄ Trocar</button>` : ''}</div>`; }).join('')}
          <div class="mbtns"><button class="btn sm ghost" onclick="A.marcaRef('${rf.id}','skip')">Pulei</button><button class="btn sm ghost" style="flex:1" onclick="A.comiOutra('${rf.id}')">✨ Comi outra coisa</button><button class="btn sm" onclick="A.marcaRef('${rf.id}','done',true)">Comi ✓</button></div></div>` : ''}</div>`; }).join('');
    if (D.extras?.length) h += `<div class="card"><b>Fora do plano</b>${D.extras.map(e => `<div class="row" style="margin-top:8px;font-size:14px"><span style="flex:1">${esc(e.desc)}</span><span class="mut">${r0(e.kcal)} kcal</span><button class="mini" onclick="A.removeExtra('${e.id}')" aria-label="Remover">✕</button></div>`).join('')}</div>`;
    h += `<button class="btn ghost" onclick="A.comiOutra(null)">+ Registrar algo fora do plano</button>`;
  } else if (abaDieta === 'plano') {
    const tot = somaMac(P.refeicoes.flatMap(r => r.itens)), M = P.metas || {};
    h += `<div class="card"><div class="row"><div><b>${esc(P.nome)}</b><div class="mut">${P.refeicoes.length} refeições · ${tot.kcal} kcal · P${tot.p} C${tot.c} G${tot.g}</div></div><button class="icon-btn" onclick="A.editarPlano()" aria-label="Editar">✎</button></div>
      ${st ? `<div style="margin-top:10px"><span class="chip ${st.cls}">${st.txt}</span></div>` : ''}</div>
      <div class="card"><b>Metas diárias</b><div class="mut" style="margin-top:6px;line-height:1.7">${r0(M.kcal)} kcal · Proteína ${r0(M.p)} g · Carboidrato ${r0(M.c)} g · Gordura ${r0(M.g)} g · Água ${fmtKg(metaAguaL())} L</div></div>
      ${P.refeicoes.map(rf => `<div class="card"><div class="row"><b>${esc(rf.h ? rf.h + ' · ' : '')}${esc(rf.n)}</b><span class="mut">${somaMac(rf.itens).kcal} kcal</span></div>
        <div class="mut" style="margin-top:6px;line-height:1.6">${rf.itens.map(it => `${esc(it.nome)} (${esc(it.qtd)})${it.subs?.length ? ` <span style="color:var(--ac)">· ${it.subs.length} subst.</span>` : ''}`).join('<br>')}</div></div>`).join('')}
      <div class="btns"><button class="btn" style="flex:1" onclick="A.go('dietaTexto')">✨ Novo plano por texto</button><button class="btn ghost" style="flex:1" onclick="A.editarPlano()">✎ Editar</button></div>`;
  } else {
    const dias = Array.from({ length: 14 }, (_, k) => { const d = new Date(); d.setDate(d.getDate() - 13 + k); return ymd(d); });
    const comReg = dias.filter(d => S.diario.some(x => x.data === d));
    const ades = comReg.map(adesaoDia).filter(v => v != null), medA = ades.length ? Math.round(ades.reduce((a, b) => a + b, 0) / ades.length) : null;
    const kc = comReg.map(d => consumoDia(d)), med = k => kc.length ? Math.round(kc.reduce((a, x) => a + x[k], 0) / kc.length) : null;
    const ag = comReg.map(d => (diaDoc(d).agua || 0) * 0.25), medAg = ag.length ? ag.reduce((a, b) => a + b, 0) / ag.length : null;
    h += `<div class="kpis3"><div class="kpi"><b>${medA == null ? '—' : medA + '%'}</b><span class="mut">adesão média</span></div><div class="kpi"><b>${med('kcal') ?? '—'}</b><span class="mut">kcal/dia</span></div><div class="kpi"><b>${medAg == null ? '—' : fmtKg(Math.round(medAg * 10) / 10) + ' L'}</b><span class="mut">água/dia</span></div></div>
      <div class="card"><b>Adesão ao plano</b><div class="mut">% das refeições do plano cumpridas por dia</div>
      <div class="days">${dias.map(d => { const v = adesaoDia(d); return `<div><i style="height:${v == null ? 3 : Math.max(v * .95, 3)}px;background:${v == null ? 'var(--card2)' : v >= 90 ? 'var(--ok)' : v >= 70 ? 'var(--warn)' : 'var(--bad)'}"></i>${new Date(d + 'T00:00').getDate()}</div>`; }).join('')}</div></div>`;
    if (med('p') != null && P.metas?.p) { const pc = Math.round(med('p') / P.metas.p * 100); h += `<div class="card"><b>Proteína média</b><div class="row" style="margin-top:6px"><span class="mut">${med('p')} g/dia · meta ${r0(P.metas.p)} g</span><span style="font-weight:600;color:${pc >= 95 ? 'var(--ok)' : 'var(--warn)'}">${pc}%</span></div><div class="mbar" style="margin-top:6px"><i style="width:${Math.min(pc, 100)}%;background:#7aa7ff"></i></div></div>`; }
    const ini = P.criadoEm ? ymd(new Date(P.criadoEm)) : null; const av = ini ? S.avaliacoes.filter(a => a.data >= ini) : [];
    const antes = ini ? [...S.avaliacoes].reverse().find(a => a.data < ini) : null; const a0 = antes || av[0], a1 = av.at(-1);
    if (a0 && a1 && a0 !== a1) { const d0 = derivar(a0), d1 = derivar(a1);
      h += `<div class="card"><b>Dieta × corpo</b><div class="mut" style="margin-top:6px;line-height:1.7">Desde o início do plano (${dtC(ini)}):<br>${['peso', 'bf', 'cintura'].filter(k => d0[k] != null && d1[k] != null).map(k => `${MED[k][0]}: <b style="color:var(--tx)">${fmtM(k, d0[k])} → ${fmtM(k, d1[k])}</b> ${deltaM(k, d0, d1)}`).join('<br>')}</div></div>`; }
    else h += `<div class="card"><b>Dieta × corpo</b><div class="mut" style="margin-top:6px">Registre avaliações na aba Medidas durante o plano para ver a evolução aqui.</div></div>`;
    const pul = {}; S.diario.filter(x => dias.includes(x.data)).forEach(x => Object.entries(x.ref || {}).forEach(([k, v]) => { if (v === 'skip') pul[k] = (pul[k] || 0) + 1; }));
    const top = Object.entries(pul).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => { const rf = P.refeicoes.find(r => r.id === k); return rf ? `${esc(rf.n)} (${n}×)` : null; }).filter(Boolean);
    if (top.length) h += `<div class="card"><b>Refeições mais puladas</b><div class="mut" style="margin-top:6px">${top.join(' · ')}</div></div>`;
  }
  $('view').innerHTML = h;
}
function mudaDia(dd) { const d = new Date(diaSel + 'T00:00'); d.setDate(d.getDate() + dd); const n = ymd(d); if (n > hoje()) return; diaSel = n; refAberta = null; vDieta(); }
function aguaClick(i) { const D = clone(diaDoc(diaSel)); D.agua = i < (D.agua || 0) ? i : i + 1; salvarDia(D); keepScroll(vDieta); }
function abreRef(id) { refAberta = refAberta === id ? null : id; keepScroll(vDieta); }
function marcaRef(id, v, avancar) {
  const D = clone(diaDoc(diaSel)); D.ref = D.ref || {}; D.ref[id] = D.ref[id] === v && !avancar ? null : v; if (!D.ref[id]) delete D.ref[id]; salvarDia(D);
  if (avancar) { const rs = plano().refeicoes; const k = rs.findIndex(r => r.id === id); refAberta = rs.slice(k + 1).find(r => !D.ref[r.id])?.id || null; }
  keepScroll(vDieta);
}
function subsAlimento(rid, iid) {
  const rf = plano().refeicoes.find(r => r.id === rid), it = rf.itens.find(x => x.id === iid), D = diaDoc(diaSel), tr = D.trocas?.[rid + '_' + iid];
  openModal(`<h2>Trocar ${esc(it.nome)} (${esc(it.qtd)})</h2><div class="mut" style="margin-bottom:6px">Substituições do seu plano:</div>
    ${it.subs.map((s, k) => `<div class="opt" style="cursor:pointer" onclick="A.trocaAlimento('${rid}','${iid}',${k})"><span>${esc(s)}</span><span class="mut">usar ›</span></div>`).join('')}
    ${tr ? `<div class="opt" style="cursor:pointer" onclick="A.trocaAlimento('${rid}','${iid}',-1)"><span>Voltar ao original</span></div>` : ''}
    <div class="mut" style="font-size:12px;margin-top:10px">A troca vale só para este dia. As calorias consideradas são as do item original (substituições do plano são equivalentes).</div>
    <button class="btn ghost" style="margin-top:14px" onclick="A.closeModal()">Cancelar</button>`);
}
function trocaAlimento(rid, iid, k) {
  const D = clone(diaDoc(diaSel)); D.trocas = D.trocas || {}; const it = plano().refeicoes.find(r => r.id === rid).itens.find(x => x.id === iid);
  if (k < 0) delete D.trocas[rid + '_' + iid]; else D.trocas[rid + '_' + iid] = it.subs[k];
  salvarDia(D); closeModal(); keepScroll(vDieta);
}
let estimativa = null;
function comiOutra(rid) {
  estimativa = null;
  openModal(`<h2>${rid ? 'Comi outra coisa' : 'Fora do plano'}</h2><div class="mut" style="margin-bottom:10px">Descreva o que comeu (com quantidades, se souber). A IA estima calorias e macros.</div>
    <textarea class="in" id="estTxt" style="min-height:100px" placeholder="Ex.: 2 fatias de pizza de calabresa e 1 lata de coca zero"></textarea>
    <button class="btn" id="estBtn" style="margin-top:10px" onclick="A.estimar(${rid ? `'${rid}'` : 'null'})">✨ Estimar</button><div id="estOut"></div>`);
}
async function estimar(rid) {
  const t = $('estTxt').value.trim(); if (t.length < 3) return toast('Descreva o que você comeu');
  if (!navigator.onLine) return toast('Sem internet. A estimativa precisa de conexão.');
  const b = $('estBtn'); b.disabled = true; b.innerHTML = '<span class="spin"></span>Estimando…';
  try {
    const itens = await iaEstimar(t); if (!itens.length) throw new Error('Não consegui identificar alimentos.');
    const s = somaMac(itens); estimativa = { desc: t.slice(0, 140), ...s, rid };
    $('estOut').innerHTML = `<div class="calc"><b>Estimativa</b><br>${itens.map(x => `${esc(x.nome)} ≈ ${x.kcal} kcal · P${x.p} C${x.c} G${x.g}`).join('<br>')}<br><b>Total ≈ ${s.kcal} kcal</b> · <span class="mut">valores aproximados</span></div>
      <div class="btns" style="margin-top:10px"><button class="btn ghost" style="flex:1" onclick="A.closeModal()">Cancelar</button><button class="btn" style="flex:1" onclick="A.registrarExtra()">Registrar</button></div>`;
    b.style.display = 'none';
  } catch (e) { toast(erroIA(e), 5000); b.disabled = false; b.textContent = '✨ Estimar'; }
}
function registrarExtra() {
  if (!estimativa) return; const D = clone(diaDoc(diaSel)); D.extras = D.extras || [];
  D.extras.push({ id: uid(), desc: estimativa.desc, kcal: estimativa.kcal, p: estimativa.p, c: estimativa.c, g: estimativa.g });
  if (estimativa.rid) { D.ref = D.ref || {}; D.ref[estimativa.rid] = 'skip'; }
  salvarDia(D); estimativa = null; closeModal(); keepScroll(vDieta); toast('Registrado');
}
function removeExtra(id) { const D = clone(diaDoc(diaSel)); D.extras = (D.extras || []).filter(e => e.id !== id); salvarDia(D); keepScroll(vDieta); }

// ---------- Cadastro do plano por texto ----------
let textoDieta = '', dietaImport = null;
function vDietaTexto() {
  setHdr('Cole o plano da nutricionista', 'Novo plano alimentar');
  $('view').innerHTML = `<div class="card"><div class="mut" style="margin-bottom:10px">Pode colar o texto do PDF ou do WhatsApp. A IA monta refeições, quantidades, calorias/macros, substituições e metas. Você revisa antes de salvar.</div>
    <textarea class="in" placeholder="Café da manhã (7h): 3 ovos mexidos, 2 fatias de pão integral, 1 banana.&#10;Substituições: pão → 80 g de tapioca ou 40 g de aveia…&#10;Almoço: 150 g de arroz, 1 concha de feijão, 150 g de frango…&#10;Meta: 2400 kcal, 180 g de proteína" oninput="A.setTextoDieta(this.value)">${esc(textoDieta)}</textarea>
    <div class="mut" style="font-size:12px;margin-top:6px">Não inclua diagnósticos, exames ou condições de saúde — o texto é enviado à IA do Google.</div>
    <button class="btn" id="dBtn" style="margin-top:10px" onclick="A.gerarDieta()">✨ Gerar plano</button></div>
    <button class="btn ghost" onclick="A.go('dieta')">Voltar</button>`;
}
async function gerarDieta() {
  const t = textoDieta.trim(); if (t.length < 15) return toast('Cole o plano alimentar no campo de texto');
  if (!navigator.onLine) return toast('Sem internet. A IA precisa de conexão.');
  const b = $('dBtn'); b.disabled = true; b.innerHTML = '<span class="spin"></span>Montando plano…';
  try {
    const r = await iaImportarDieta(t);
    const refeicoes = (r.refeicoes || []).map(rf => ({ id: uid(), h: String(rf.horario || '').slice(0, 5), n: String(rf.nome || 'Refeição').trim(),
      itens: (rf.itens || []).map(it => ({ id: uid(), nome: String(it.nome).trim(), qtd: String(it.quantidade || '').trim(), kcal: r0(it.kcal), p: r0(it.proteina), c: r0(it.carboidrato), g: r0(it.gordura),
        subs: (it.substitutos || []).filter(x => typeof x === 'string' && x.trim()).slice(0, 6) })).filter(it => it.nome) })).filter(rf => rf.itens.length);
    if (!refeicoes.length) throw new Error('Não encontrei refeições no texto.');
    const tot = somaMac(refeicoes.flatMap(x => x.itens)), M = r.metas || {};
    const sem = parseInt(r.validadeSemanas);
    dietaImport = { nome: String(r.nome || 'Plano alimentar').trim(), validade: sem > 0 && sem < 60 ? somaDias(sem * 7) : '', refeicoes,
      metas: { kcal: r0(M.kcal) || tot.kcal, p: r0(M.proteina) || tot.p, c: r0(M.carboidrato) || tot.c, g: r0(M.gordura) || tot.g, agua: num(M.aguaLitros) || null } };
    go('dietaRevisar');
  } catch (e) { console.error(e); toast(erroIA(e), 6000); b.disabled = false; b.textContent = '✨ Gerar plano'; }
}
function vDietaRevisar() {
  const I = dietaImport; setHdr('Confira antes de salvar', I.nome);
  const tot = somaMac(I.refeicoes.flatMap(r => r.itens));
  $('view').innerHTML = `<div class="card"><b>Metas diárias</b><div class="mut" style="margin-top:6px">${I.metas.kcal} kcal · P ${I.metas.p} g · C ${I.metas.c} g · G ${I.metas.g} g${I.metas.agua ? ' · Água ' + fmtKg(I.metas.agua) + ' L' : ''}</div>
      <div class="mut" style="font-size:12px;margin-top:4px">Soma dos itens: ${tot.kcal} kcal · P${tot.p} C${tot.c} G${tot.g}</div></div>
    ${I.refeicoes.map(rf => `<div class="card"><div class="row"><b>${esc(rf.h ? rf.h + ' · ' : '')}${esc(rf.n)}</b><span class="mut">${somaMac(rf.itens).kcal} kcal</span></div>
      ${rf.itens.map(it => `<div style="margin-top:8px"><div style="font-size:14px">${esc(it.nome)} <span class="mut">(${esc(it.qtd)})</span></div><div class="mut" style="font-size:12px">${it.kcal} kcal · P${it.p} C${it.c} G${it.g}${it.subs.length ? ' · subst.: ' + it.subs.map(esc).join(', ') : ''}</div></div>`).join('')}</div>`).join('')}
    <div class="card"><label class="f" style="margin-top:0">Validade do plano</label><input type="date" class="in" value="${esc(I.validade)}" onchange="A.setDietaImp('validade',this.value)"></div>
    ${plano() ? `<div class="mut" style="text-align:center;margin-bottom:10px">Este plano substitui o atual ("${esc(plano().nome)}"). O histórico de dias é mantido.</div>` : ''}
    <button class="btn" onclick="A.salvarDietaImport()">Salvar plano</button>
    <button class="btn ghost" style="margin-top:8px" onclick="A.go('dietaTexto')">Voltar e ajustar o texto</button>`;
}
function salvarPlano(P) {
  const novo = { ...clone(P), criadoEm: P.criadoEm || Date.now(), atualizadoEm: Date.now() };
  S.plano = novo; setDoc(uref('dieta', 'atual'), novo).catch(falhou);
}
function salvarDietaImport() {
  if (plano() && !confirm('Substituir o plano alimentar atual?')) return;
  salvarPlano({ ...dietaImport, criadoEm: Date.now() }); dietaImport = null; textoDieta = ''; abaDieta = 'hoje'; go('dieta'); toast('Plano alimentar salvo');
}
// ---------- Editor manual ----------
let rascPlano = null;
function editarPlano() {
  rascPlano = plano() ? clone(plano()) : { nome: '', validade: '', metas: { kcal: '', p: '', c: '', g: '', agua: '' }, refeicoes: [{ id: uid(), h: '07:00', n: 'Café da manhã', itens: [] }] };
  go('dietaEditar');
}
function vDietaEditar() {
  const R = rascPlano; setHdr(plano() ? 'Editar plano' : 'Novo plano', R.nome || 'Plano alimentar');
  const v = x => x == null ? '' : esc(String(x).replace('.', ','));
  $('view').innerHTML = `<div class="card"><label class="f" style="margin-top:0">Nome do plano</label><input class="in" value="${esc(R.nome)}" placeholder="Ex.: Hipertrofia" oninput="A.dp('nome',this.value)">
    <label class="f">Validade</label><input type="date" class="in" value="${esc(R.validade || '')}" onchange="A.dp('validade',this.value)">
    <label class="f">Metas diárias</label><div class="fgrid">${[['kcal', 'Calorias (kcal)'], ['p', 'Proteína (g)'], ['c', 'Carboidrato (g)'], ['g', 'Gordura (g)'], ['agua', 'Água (L)']].map(([k, n]) => `<div><label>${n}</label><input class="in" inputmode="decimal" value="${v(R.metas?.[k])}" oninput="A.dm('${k}',this.value)"></div>`).join('')}</div>
    <button class="link ac" onclick="A.metasDosItens()">Calcular metas pela soma dos itens</button></div>
    ${R.refeicoes.map((rf, i) => `<div class="card"><div style="display:grid;grid-template-columns:76px 1fr 34px;gap:8px;align-items:end">
        <div><span class="mut" style="font-size:11px">Horário</span><input class="in" style="padding:9px" value="${esc(rf.h)}" placeholder="07:00" oninput="A.dr(${i},'h',this.value)"></div>
        <div><span class="mut" style="font-size:11px">Refeição</span><input class="in" style="padding:9px" value="${esc(rf.n)}" oninput="A.dr(${i},'n',this.value)"></div>
        <button class="icon-btn sm" style="color:var(--bad)" onclick="A.remRef(${i})">✕</button></div>
      ${rf.itens.map((it, j) => `<div class="exedit"><div class="row" style="margin-bottom:6px"><input class="in" style="padding:9px" value="${esc(it.nome)}" placeholder="Alimento" oninput="A.di(${i},${j},'nome',this.value)"><button class="icon-btn sm" style="color:var(--mut)" onclick="A.remItem(${i},${j})">✕</button></div>
        <div class="grid5">${[['qtd', 'Qtd.'], ['kcal', 'kcal'], ['p', 'P'], ['c', 'C'], ['g', 'G']].map(([k, n]) => `<div><span>${n}</span><input class="in" ${k === 'qtd' ? '' : 'inputmode="decimal"'} value="${k === 'qtd' ? esc(it.qtd) : v(it[k])}" oninput="A.di(${i},${j},'${k}',this.value)"></div>`).join('')}</div>
        <input class="in" style="padding:9px;margin-top:6px;font-size:13px" value="${esc((it.subs || []).join('; '))}" placeholder="Substituições (separe com ;)" oninput="A.di(${i},${j},'subs',this.value)"></div>`).join('')}
      <button class="link ac" onclick="A.addItem(${i})">+ alimento</button></div>`).join('')}
    <button class="btn ghost" onclick="A.addRef()">+ Refeição</button>
    <button class="btn" style="margin-top:10px" onclick="A.salvarPlanoManual()">Salvar plano</button>
    <div class="btns" style="margin-top:10px"><button class="btn ghost" style="flex:1" onclick="A.go('dieta')">Cancelar</button>${plano() ? `<button class="btn bad" style="flex:1" onclick="A.excluirPlano()">Excluir plano</button>` : ''}</div>`;
}
const dp = (k, v) => { rascPlano[k] = v; };
const dm = (k, v) => { rascPlano.metas = rascPlano.metas || {}; rascPlano.metas[k] = v; };
const dr = (i, k, v) => { rascPlano.refeicoes[i][k] = v; };
const di = (i, j, k, v) => { rascPlano.refeicoes[i].itens[j][k] = k === 'subs' ? v.split(';').map(x => x.trim()).filter(Boolean) : v; };
function addItem(i) { rascPlano.refeicoes[i].itens.push({ id: uid(), nome: '', qtd: '', kcal: '', p: '', c: '', g: '', subs: [] }); keepScroll(vDietaEditar); }
function remItem(i, j) { rascPlano.refeicoes[i].itens.splice(j, 1); keepScroll(vDietaEditar); }
function addRef() { rascPlano.refeicoes.push({ id: uid(), h: '', n: 'Refeição', itens: [] }); keepScroll(vDietaEditar); }
function remRef(i) { if (!confirm('Remover esta refeição?')) return; rascPlano.refeicoes.splice(i, 1); keepScroll(vDietaEditar); }
function metasDosItens() { const t = somaMac(rascPlano.refeicoes.flatMap(r => r.itens)); rascPlano.metas = { ...(rascPlano.metas || {}), kcal: t.kcal, p: t.p, c: t.c, g: t.g }; keepScroll(vDietaEditar); }
function salvarPlanoManual() {
  const R = rascPlano; R.nome = String(R.nome || '').trim(); if (!R.nome) return toast('Dê um nome ao plano');
  R.refeicoes = R.refeicoes.map(rf => ({ id: rf.id || uid(), h: String(rf.h || '').trim().slice(0, 5), n: String(rf.n || 'Refeição').trim(),
    itens: rf.itens.filter(it => String(it.nome).trim()).map(it => ({ id: it.id || uid(), nome: String(it.nome).trim(), qtd: String(it.qtd || '').trim(), kcal: r0(it.kcal), p: r0(it.p), c: r0(it.c), g: r0(it.g), subs: it.subs || [] })) }))
    .filter(rf => rf.itens.length);
  if (!R.refeicoes.length) return toast('Adicione pelo menos uma refeição com alimentos');
  const t = somaMac(R.refeicoes.flatMap(r => r.itens)), M = R.metas || {};
  R.metas = { kcal: r0(M.kcal) || t.kcal, p: r0(M.p) || t.p, c: r0(M.c) || t.c, g: r0(M.g) || t.g, agua: num(M.agua) || null };
  salvarPlano(R); rascPlano = null; abaDieta = 'plano'; go('dieta'); toast('Plano salvo');
}
function excluirPlano() { if (!confirm('Excluir o plano alimentar? O histórico de dias é mantido.')) return; S.plano = null; deleteDoc(uref('dieta', 'atual')).catch(falhou); rascPlano = null; go('dieta'); }

// ================= Modal =================
function openModal(h) { $('sheet').innerHTML = h; $('modal').classList.add('show'); }
function closeModal() { $('modal').classList.remove('show'); }

// ================= Atualização automática (service worker) =================
let atualizacaoPendente = false, swReg = null;
if ('serviceWorker' in navigator) {
  const tinhaControle = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(r => swReg = r).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaControle) return; // primeira instalação
    if (['treino', 'editar', 'prompt', 'revisar', 'avaliacao', 'dietaTexto', 'dietaRevisar', 'dietaEditar'].includes(rota)) { atualizacaoPendente = true; toast('Nova versão baixada — será aplicada ao voltar para Fichas.', 4000); }
    else location.reload();
  });
}
async function verificarAtualizacao() {
  if (!swReg) return toast('Atualização automática indisponível neste navegador');
  try { await swReg.update(); toast(swReg.installing || swReg.waiting ? 'Atualizando…' : `Você já está na versão mais recente (${VERSAO_APP})`); } catch (e) { toast('Sem conexão para verificar'); }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  swReg?.update().catch(() => {});
  if (S.ativo) wake(true); if (tEnd) tick();
  if (S.user && rota === 'fichas') { if (atualizacaoPendente) return location.reload(); render(); checarAvisoValidade(); }
});
window.addEventListener('online', () => { if (rota === 'fichas' || rota === 'ajustes') render(); });
window.addEventListener('offline', () => { if (rota === 'fichas' || rota === 'ajustes') render(); });

// ================= Inicialização =================
window.A = { go, editar, df, d, ds, toggleBi, moverEx, removerEx, addEx, addSerieDraft, removerSerie, cancelarEdicao, salvarFicha, excluirFicha,
  setPrompt, usarExemplo, gerarDoPrompt, setImp, salvarImportado, iniciar, setSet, finalizar, descartar,
  acaoTreino, toggleRodada, addRodada, menuSerie, removerSerieT, setNota, menuTreino, pularPasso, listaPassos, irPasso,
  abrirExercicio, fecharExercicio, abaExercicio, trocarVideo, escolherVideo, abaT: k => { abaT = k; keepScroll(vTreino); },
  abrirSubs, gerarSubs, trocar, trocarOutro, addT, stopT, setEx, toggleSess, excluirSessao, exportar, importarArquivo, setBackupDias,
  apagarTudo, migrar, naoMigrar, openModal, closeModal, baixarICS, sair, enviarAuth, verificarAtualizacao,
  novaAvaliacao, editarAvaliacao, av, avDobra, salvarAvaliacao, excluirAvaliacao, salvarCorpo,
  abaMed: k => { abaMed = k; vMedidas(); }, medSel: k => { medSel = k; keepScroll(vMedidas); }, cmp: (q, v) => { if (q === 'a') cmpA = +v; else cmpB = +v; keepScroll(vMedidas); },
  abaDieta: k => { abaDieta = k; refAberta = null; vDieta(); }, mudaDia, agua: aguaClick, abreRef, marcaRef, subsAlimento, trocaAlimento, comiOutra, estimar, registrarExtra, removeExtra,
  setTextoDieta: v => { textoDieta = v; }, gerarDieta, setDietaImp: (k, v) => { dietaImport[k] = v; }, salvarDietaImport, editarPlano, dp, dm, dr, di, addItem, remItem, addRef, remRef, metasDosItens, salvarPlanoManual, excluirPlano,
  modo: m => { modoAuth = m; vAuth(); } };

if (!configurado) render();
else onAuthStateChanged(auth, u => {
  S.user = u;
  if (!u) { unsubs.forEach(x => x()); unsubs = []; S.fichas = []; S.sessoes = []; S.avaliacoes = []; S.plano = null; S.diario = []; S.ativo = null; document.body.classList.remove('emtreino'); $('tBar').style.display = 'none'; pararTimerUI(); modoAuth = 'entrar'; render(); return; }
  document.body.classList.remove('noauth'); rota = 'fichas'; primeiraCarga = true;
  S.pronto = { fichas: false, sessoes: false, perfil: false, ativo: false, avaliacoes: false, plano: false, diario: false };
  setHdr('', 'Treino'); $('view').innerHTML = '<div class="empty"><span class="spin"></span>Carregando seus treinos…</div>';
  escutar();
});
