/* CONFIGURATION BFS CACES — clé anon/publique uniquement, jamais service_role */
const CONFIG = {
  SUPABASE_URL: 'https://dqraobwozowtnrieitkp.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_UhkImOyooXPnAqTCNMJ4wA_VVqscCmK',
  // Schéma dédié (Univers BFS) — à ajouter aux « Exposed schemas » (Project Settings › API)
  SUPABASE_SCHEMA: 'caces',
  NOM_APPLICATION: 'BFS CACES',
  DEBUG: false,
};

/* Numéro de version affiché en pied de page : permet de vérifier que le navigateur a bien la dernière version. */
const APP_VERSION = 'v24 — 06/10/2026';
(function () { const e = document.getElementById('version-appli'); if (e) e.textContent = 'Version ' + APP_VERSION; })();
