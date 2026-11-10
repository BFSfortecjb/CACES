// =====================================================================
//  Edge Function BFS CACES — caces-acces-tablette
//  Évaluation sur tablette : le testeur a scanné un QR code (jeton secret) et saisit son code testeur (4 chiffres).
//  1. valide jeton + code en base (fonction caces_valider_acces_tablette, exécutable uniquement par le service_role) ;
//  2. si c'est bon, génère un jeton de connexion à usage unique pour ce testeur (aucun mot de passe) ;
//  3. le navigateur de la tablette ouvre alors la session du testeur (verifyOtp).
//  Contrat : POST { jeton, code } → { ok:true, token_hash, session_id } | { ok:false, error }
//  verify_jwt = false (la tablette n'est pas encore connectée) ; la sécurité repose sur jeton + code (5 essais maximum).
// =====================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Méthode non autorisée' }, 405);
  let corps: any; try { corps = await req.json(); } catch (_e) { return json({ ok: false, error: 'Corps invalide' }, 400); }
  const jeton = String(corps?.jeton || '').trim(), code = String(corps?.code || '').trim();
  if (!/^[0-9a-f]{20,80}$/.test(jeton) || !/^[0-9]{4}$/.test(code)) return json({ ok: false, error: 'Lien ou code invalide.' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'caces' }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.rpc('caces_valider_acces_tablette', { p_jeton: jeton, p_code: code });
  if (error) return json({ ok: false, error: 'Validation impossible.' }, 500);
  const r = Array.isArray(data) ? data[0] : data;
  if (!r?.ok) return json({ ok: false, error: r?.erreur || 'Accès refusé.' }, 401);

  const lien = await admin.auth.admin.generateLink({ type: 'magiclink', email: r.email });
  const hash = lien?.data?.properties?.hashed_token;
  if (lien.error || !hash) return json({ ok: false, error: 'Ouverture de session impossible.' }, 500);
  return json({ ok: true, token_hash: hash, session_id: r.session_id });
});
