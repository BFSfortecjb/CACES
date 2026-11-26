/* © 2026 BFS HSE — Jérémy Bizeul / Vigie-lance. */
'use strict';
// À INCRÉMENTER à chaque mise en ligne, sinon les téléphones gardent l'ancienne version.
const VERSION_CACHE = 'hse-v12';
const COQUILLE = ['./', 'index.html', 'HS_style.css', 'HS_debug.js', 'HS_config.js', 'HS_core.js', 'HS_alertes.js',
  'HS_vehicules.js', 'HS_pleins.js', 'HS_catalogue_epi.js', 'HS_epi.js', 'HS_controles.js', 'HS_pdf.js', 'HS_plateau.js', 'HS_composition.js', 'HS_corbeille.js', 'HS_competences.js', 'HS_app.js', 'manifest.json', 'icons/HS_icon-192.png', 'icons/HS_icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION_CACHE).then(c => c.addAll(COQUILLE))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('hse-') && k !== VERSION_CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // Jamais de cache pour l'authentification ni les données, ni pour les autres domaines
  if (e.request.method !== 'GET' || u.origin !== location.origin || /\/(auth|rest|storage)\//.test(u.pathname)) return;
  e.respondWith(fetch(e.request).then(r => {
    const copie = r.clone(); caches.open(VERSION_CACHE).then(c => c.put(e.request, copie)); return r;
  }).catch(() => caches.match(e.request)));
});
