/* CONFIGURATION BFS CACES — clé anon/publique uniquement, jamais service_role */
const CONFIG = {
  SUPABASE_URL: 'https://dqraobwozowtnrieitkp.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_UhkImOyooXPnAqTCNMJ4wA_VVqscCmK',
  // Schéma dédié (Univers BFS) — à ajouter aux « Exposed schemas » (Project Settings › API)
  SUPABASE_SCHEMA: 'caces',
  // Adresse encodée dans le QR code du carton (le numéro est ajouté : ?n=...).
  // Tant que le site BFS n'a pas de page dédiée, c'est la page de vérification de l'appli.
  // Plus tard : 'https://bfs-prevention.fr/verification' (la page appellera la fonction caces_verifier_titre).
  URL_VERIFICATION: 'https://bfsfortecjb.github.io/CACES/#verification',
  NOM_APPLICATION: 'BFS CACES',
  DEBUG: false,
};

/* Numéro de version affiché en pied de page : permet de vérifier que le navigateur a bien la dernière version. */
const APP_VERSION = 'v64 — 07/10/2026';
(function () { const e = document.getElementById('version-appli'); if (e) e.textContent = 'Version ' + APP_VERSION; })();
