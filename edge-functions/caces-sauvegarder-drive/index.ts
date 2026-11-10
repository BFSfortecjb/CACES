// =====================================================================
//  Edge Function BFS CACES — sauvegarde de fichiers sur Google Drive
//  (adaptée de habelec-sauvegarder-drive ; OAuth utilisateur uniquement)
//
//  Appelée depuis l'appli (sb.functions.invoke('caces-sauvegarder-drive')) :
//    { chemin: ['Sessions', 'Nom de session', 'Engins'],   // sous-dossiers sous le dossier « CACES »
//      nom_fichier: 'vgp.jpg', mime_type: 'image/jpeg', contenu_base64: '...' }
//  Réponse : { ok: true, fichier_id, lien, dossier_id } ou { ok: false, erreur }.
//
//  Sécurité :
//   - l'appelant doit être un compte CACES de rôle formateur ou admin (vérifié
//     avec SON jeton, via caces.caces_role()) ;
//   - les secrets Google (table caces.config_drive, sans aucune policy de
//     lecture) ne sont lus qu'ici, avec la clé service_role côté serveur ;
//   - aucun secret n'est jamais renvoyé ni écrit dans les logs.
//  Best-effort : répond toujours 200 avec { ok:false, erreur } si le problème
//  ne vient pas d'une requête malformée.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const SCHEMA = 'caces';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reponse = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const PARAMS_PARTAGES = 'supportsAllDrives=true&includeItemsFromAllDrives=true';
const echapper = (nom: string) => nom.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const nettoyerNom = (n: string) => n.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 120);

async function jetonAcces(c: { id: string; secret: string; refresh: string }) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', client_id: c.id, client_secret: c.secret, refresh_token: c.refresh,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error('Renouvellement du jeton Google : ' + (json.error_description || json.error || 'réponse inattendue'));
  }
  return json.access_token as string;
}

async function dossier(jeton: string, nom: string, parentId: string) {
  const q = `name = '${echapper(nom)}' and '${parentId}' in parents `
    + `and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const liste = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&${PARAMS_PARTAGES}&corpora=allDrives`,
    { headers: { Authorization: `Bearer ${jeton}` } });
  const lj = await liste.json();
  if (lj.files?.length) return lj.files[0].id as string;
  const cree = await fetch('https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nom, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const cj = await cree.json();
  if (!cree.ok) throw new Error('Création du dossier Drive impossible');
  return cj.id as string;
}

async function fichierExistant(jeton: string, nom: string, dossierId: string) {
  const q = `name = '${echapper(nom)}' and '${dossierId}' in parents and trashed = false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&${PARAMS_PARTAGES}&corpora=allDrives`,
    { headers: { Authorization: `Bearer ${jeton}` } });
  const j = await res.json();
  return (j.files?.[0]?.id as string) || null;
}

async function envoyer(jeton: string, o: { nom: string; dossierId: string; mime: string; base64: string; existantId: string | null }) {
  const octets = Uint8Array.from(atob(o.base64), c => c.charCodeAt(0));
  if (o.existantId) {
    const r = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${o.existantId}?uploadType=media&fields=id,webViewLink&supportsAllDrives=true`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': o.mime }, body: octets });
    const j = await r.json();
    if (!r.ok) throw new Error('Mise à jour du fichier Drive impossible');
    return j as { id: string; webViewLink: string };
  }
  const frontiere = 'caces_' + crypto.randomUUID();
  const enc = new TextEncoder();
  const morceaux = [
    enc.encode(`--${frontiere}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: o.nom, parents: [o.dossierId] })}\r\n`),
    enc.encode(`--${frontiere}\r\nContent-Type: ${o.mime}\r\n\r\n`),
    octets,
    enc.encode(`\r\n--${frontiere}--`),
  ];
  const corps = new Uint8Array(morceaux.reduce((n, m) => n + m.length, 0));
  let off = 0;
  for (const m of morceaux) { corps.set(m, off); off += m.length; }
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': `multipart/related; boundary=${frontiere}` },
    body: corps,
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Création du fichier Drive impossible');
  return j as { id: string; webViewLink: string };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return reponse({ ok: false, erreur: 'Méthode non autorisée' }, 405);

  let body: { chemin?: string[]; nom_fichier?: string; mime_type?: string; contenu_base64?: string };
  try { body = await req.json(); } catch { return reponse({ ok: false, erreur: 'Corps JSON invalide' }, 400); }
  const { chemin, nom_fichier, mime_type, contenu_base64 } = body;
  if (!Array.isArray(chemin) || !nom_fichier || !contenu_base64) {
    return reponse({ ok: false, erreur: 'Paramètres manquants (chemin, nom_fichier, contenu_base64)' }, 400);
  }
  if (contenu_base64.length > 14_000_000) return reponse({ ok: false, erreur: 'Fichier trop volumineux (10 Mo max)' }, 400);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    // 1. Contrôle d'accès avec le jeton DE L'APPELANT
    const sbUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      db: { schema: SCHEMA },
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
    });
    const { data: role } = await sbUser.rpc('caces_role');
    if (role !== 'formateur' && role !== 'admin') return reponse({ ok: false, erreur: 'Accès refusé' }, 403);

    // 2. Secrets Google : lecture serveur uniquement
    const sbAdmin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: SCHEMA } });
    const { data: cfg, error: errCfg } = await sbAdmin.from('config_drive').select('*').eq('id', 1).single();
    if (errCfg) return reponse({ ok: false, erreur: 'Lecture de la configuration Drive impossible (droits du rôle service_role sur le schéma caces) : ' + errCfg.message });
    if (!cfg?.drive_client_id || !cfg?.drive_client_secret || !cfg?.drive_refresh_token) {
      return reponse({ ok: false, erreur: 'Connexion Google absente : exécuter copie_connexion_drive_habelec.sql' });
    }
    if (!cfg?.drive_dossier_racine_id) {
      return reponse({ ok: false, erreur: 'ID du dossier « CACES » non renseigné (onglet Organisme)' });
    }
    const jeton = await jetonAcces({ id: cfg.drive_client_id, secret: cfg.drive_client_secret, refresh: cfg.drive_refresh_token });

    // 3. Arborescence sous le dossier « CACES », puis dépôt du fichier
    let parent = cfg.drive_dossier_racine_id as string;
    for (const nom of chemin.map(nettoyerNom).filter(Boolean)) parent = await dossier(jeton, nom, parent);
    const nom = nettoyerNom(nom_fichier);
    const existant = await fichierExistant(jeton, nom, parent);
    const f = await envoyer(jeton, { nom, dossierId: parent, mime: mime_type || 'application/octet-stream', base64: contenu_base64, existantId: existant });
    return reponse({ ok: true, fichier_id: f.id, lien: f.webViewLink, dossier_id: parent });
  } catch (e) {
    return reponse({ ok: false, erreur: String((e as Error)?.message || e) });
  }
});
