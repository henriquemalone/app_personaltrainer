// Service worker do Treino v2
// Estratégia: arquivos do app = rede primeiro (sempre a versão mais nova quando online),
// com cópia em cache para funcionar offline. Bibliotecas do Firebase = cache primeiro (URLs versionadas).
const CACHE = 'treino-v2.2';
const FB = 'https://www.gstatic.com/firebasejs/12.19.0/';
const APP = ['./', './index.html', './app.js', './config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-512-maskable.png', './apple-touch-icon.png'];
const LIBS = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js', 'firebase-ai.js', 'firebase-app-check.js'].map(f => FB + f);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all([c.addAll(APP), ...LIBS.map(u => c.add(new Request(u, { mode: 'cors' })).catch(() => {}))]))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
function redePrimeiro(req, chave) {
  const rede = fetch(req, { cache: 'no-cache' }).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(chave || req, c)); } return r; });
  const limite = new Promise(res => setTimeout(res, 3500)); // academia com sinal ruim: usa o cache após 3,5s
  return Promise.race([rede, limite.then(() => caches.match(chave || req).then(r => r || rede))])
    .catch(() => caches.match(chave || req));
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.href.startsWith(FB)) { e.respondWith(caches.match(req).then(r => r || fetch(req).then(x => { const c = x.clone(); caches.open(CACHE).then(k => k.put(req, c)); return x; }))); return; }
  if (url.origin !== location.origin) return; // Firestore, Auth, IA: direto para a rede
  if (req.mode === 'navigate') { e.respondWith(redePrimeiro(req, './index.html')); return; }
  e.respondWith(redePrimeiro(req));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./')));
});
