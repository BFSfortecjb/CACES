// =====================================================================
//  Edge Function BFS CACES — caces-galaxy  (chantier 21, étape 1 : LECTURE)
//  Passerelle serveur vers l'API Galaxy v2.0 : la clé API reste dans les secrets Supabase (jamais dans le navigateur).
//  Secrets requis : GALAXY_API_KEY, GALAXY_NUM_ENTREPRISE (Supabase > Edge Functions > Secrets).
//  Contrat : POST { methode, parametres?, page?, nombre? } avec le jeton de l'utilisateur connecté (compte BFS CACES autorisé).
//     → { ok:true, reponse:<JSON Galaxy> } | { ok:false, error }
//  Seules des fonctions de LECTURE en liste blanche sont acceptées (aucune écriture vers Galaxy à ce stade).
//  L'étape « sonde » (admin) sert à observer les vraies réponses pour écrire ensuite l'import session/stagiaires/présences.
// =====================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_SB = Deno.env.get('SUPABASE_URL')!, CLE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const CLE_GALAXY = Deno.env.get('GALAXY_API_KEY'), NUM_GALAXY = Deno.env.get('GALAXY_NUM_ENTREPRISE');
const URL_GALAXY = 'https://www.logiciel-galaxy.fr/works/api.php';
const LECTURES = new Set(['get_formations', 'get_sta_ins', 'get_stagiaires', 'get_presence', 'get_presence_stagiaire',
  'get_type_document', 'get_documents_stagiaire', 'get_intervenants', 'get_clients']);

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

/** Aplati { search: { champ: { op: val } } } en search[champ][op]=val (format attendu par Galaxy). */
function aplatir(obj: any, prefixe = '', sortie: [string, string][] = []) {
  for (const [k, v] of Object.entries(obj || {})) {
    const cle = prefixe ? `${prefixe}[${k}]` : k;
    if (v !== null && typeof v === 'object') aplatir(v, cle, sortie); else sortie.push([cle, String(v)]);
  }
  return sortie;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Méthode non autorisée' }, 405);
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ ok: false, error: 'Non authentifié' }, 401);
  let corps: any; try { corps = await req.json(); } catch (_e) { return json({ ok: false, error: 'Corps invalide' }, 400); }

  const cu = createClient(URL_SB, CLE_ANON, { db: { schema: 'caces' }, auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: u, error: eu } = await cu.auth.getUser(jwt);
  if (eu || !u?.user) return json({ ok: false, error: 'Non authentifié' }, 401);
  const { data: role } = await cu.rpc('caces_role');
  if (role !== 'admin' && role !== 'formateur') return json({ ok: false, error: 'Réservé aux formateurs et administrateurs' }, 403);

  if (!CLE_GALAXY || !NUM_GALAXY) return json({ ok: false, error: 'Secrets Galaxy non configurés (GALAXY_API_KEY, GALAXY_NUM_ENTREPRISE).' }, 503);
  const methode = String(corps?.methode || '');
  if (!LECTURES.has(methode)) return json({ ok: false, error: 'Fonction Galaxy non autorisée : ' + methode }, 400);

  const form = new URLSearchParams({ method: methode });
  aplatir(corps?.parametres).forEach(([k, v]) => form.append(k, v));
  if (corps?.page) form.set('page', String(Math.max(1, Number(corps.page) || 1)));
  form.set('nombre', String(Math.min(400, Math.max(1, Number(corps?.nombre) || 100))));

  try {
    const r = await fetch(`${URL_GALAXY}?num_entreprise=${encodeURIComponent(NUM_GALAXY)}`, {
      method: 'POST', headers: { Authorization: `Bearer ${CLE_GALAXY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form, signal: AbortSignal.timeout(25_000) });
    const texte = await r.text(); let rep: any = null; try { rep = JSON.parse(texte); } catch (_e) { /* non JSON */ }
    if (!r.ok || !rep) return json({ ok: false, error: `Galaxy a répondu HTTP ${r.status}`, extrait: texte.slice(0, 300) }, 502);
    if (rep.erreur) return json({ ok: false, error: 'Galaxy : ' + rep.erreur }, 502);
    return json({ ok: true, reponse: rep });
  } catch (e) { return json({ ok: false, error: 'Galaxy injoignable : ' + (e as Error).message }, 504); }
});
