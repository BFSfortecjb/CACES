/* =====================================================================
   sw.js — service worker de l'app shell (2026-08)

   Rôle unique : permettre à l'application de se CHARGER sans réseau (ex.
   onglet rouvert en atelier sans connexion). Les données (Supabase) ne
   passent PAS par ce service worker — c'est CA_offline.js qui gère leur
   mise en cache et leur synchronisation, à un niveau applicatif. Ici on ne
   met en cache que les fichiers same-origin de l'appli elle-même (JS/CSS/
   HTML), jamais les requêtes vers Supabase ni vers les CDN externes (dont
   le navigateur gère déjà le cache HTTP normalement).

   Règle commune Univers BFS : le dépôt est partagé entre plusieurs applis
   sur bfsfortecjb.github.io — CE fichier DOIT être enregistré avec
   `scope: './'` (voir CA_config.js / index.html), jamais '/', sous peine de
   prendre le contrôle des autres applis du portail.

   À faire à chaque déploiement qui change un fichier listé ci-dessous :
   incrémenter CACHE_VERSION, sans quoi les navigateurs déjà installés
   garderaient l'ancienne version en cache indéfiniment.
   ===================================================================== */

// 2026-09-04 : version bumpée (HE_entrainement.js ajouté, HE_core.js et
// HE_app.js modifiés pour le QCM de positionnement) — sans ce changement de
// nom, les navigateurs qui avaient déjà installé l'appli auraient continué
// à servir indéfiniment les anciens fichiers en cache (voir la règle
// ci-dessus), même après un rechargement forcé (Ctrl+F5 ne contourne PAS
// le service worker).
const CACHE_VERSION = 'caces-shell-v42';

const FICHIERS_APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './CA_config.js',
  './CA_debug.js',
  './CA_core.js',
  './CA_drive.js',
  './CA_photo.js',
  './CA_carton.js',
  './assets/logo_bfs.png',
  './assets/logo_assurance_maladie.jpg',
  './CA_documents.js',
  './CA_engins.js',
  './CA_organisme.js',
  './CA_fise.js',
  './CA_horometre.js',
  './CA_sessions.js',
  './CA_stagiaires.js',
  './CA_theorie.js',
  './CA_stagiaire.js',
  './CA_comptes.js',
  './CA_planning.js',
  './CA_secretariat.js',
  './CA_verification.js',
  './CA_parcours.js',
  './CA_adequation.js',
  './CA_pratique.js',
  './CA_testeurs.js',
  './CA_admin.js',
  './CA_app.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(FICHIERS_APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(noms => Promise.all(
        noms.filter(n => n !== CACHE_VERSION).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Seulement le same-origin, seulement en GET : jamais Supabase, jamais les
  // CDN externes, jamais les mutations (POST/PATCH/...).
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(reponseEnCache => {
      // Rafraîchit le cache en tâche de fond dès qu'une réponse réseau valide
      // arrive (stale-while-revalidate) — l'appli n'a pas besoin d'être à la
      // seconde près, mais un déploiement doit finir par se propager. waitUntil
      // garde le service worker actif le temps de cette écriture, même quand
      // on a déjà répondu depuis le cache ci-dessous.
      const rafraichissement = fetch(event.request).then(reponse => {
        if (reponse && reponse.ok) {
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, reponse.clone()));
        }
        return reponse;
      }).catch(() => null);
      event.waitUntil(rafraichissement);

      // Cache-first : réponse immédiate si on l'a déjà, sinon on attend le réseau.
      return reponseEnCache || rafraichissement || fetch(event.request);
    })
  );
});
