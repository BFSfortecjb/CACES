// @ts-nocheck — dessin des PDF copié automatiquement depuis CA_carton.js (scripts/build_edge_secretariat.py) : ne pas modifier ici.
// =====================================================================
//  Edge Function BFS CACES — caces-envoyer-secretariat
//  Export « envoi au secrétariat » côté serveur (modèle Habelec) :
//   1. contrôle le compte (jeton de l'appelant) et la session (RLS) ;
//   2. régénère les PDF (carton CACES / autorisation de conduite) avec le MÊME code de dessin que le navigateur ;
//   3. sauvegarde les PDF sur le Drive (fonction caces-sauvegarder-drive) ;
//   4. envoie UN mail au secrétariat (fonction commune envoyer-mail), découpé si > 15 Mo de pièces jointes ;
//   5. journalise et écrit le statut sur la session ;
//   6. continue même si le navigateur est fermé (EdgeRuntime.waitUntil).
//  Contrat : POST { session_id, stagiaire_ids[], preuves?[{nom,base64}], copies_qcm?[{nom,base64}] (Drive seulement) }  → { ok:true, nb_envoyes, nb_fichiers, nb_echecs } | { ok:false, error }
// =====================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { jsPDF } from "npm:jspdf@2.5.1";
import QRCode from "npm:qrcode@1.5.3";

const URL_SB = Deno.env.get('SUPABASE_URL');
const CLE_ANON = Deno.env.get('SUPABASE_ANON_KEY');
const CLE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const SITE = 'https://bfsfortecjb.github.io/CACES/';
const URL_VERIFICATION = 'https://bfsfortecjb.github.io/CACES/#verification';
const DELAI_DRIVE_MS = 30_000, DELAI_MAIL_MS = 90_000, TAILLE_MAX_MAIL = 15_000_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

/*__CONSTANTES_CARTON__*/

/* ------------------------------ utilitaires ------------------------------ */
const dateFr = (iso: string) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }); };
const urlVerification = (numero: string) => URL_VERIFICATION + '?n=' + encodeURIComponent(numero);

function versBase64(u8: Uint8Array) {
  let s = ''; const pas = 0x8000;
  for (let i = 0; i < u8.length; i += pas) s += String.fromCharCode(...u8.subarray(i, i + pas));
  return btoa(s);
}
async function imageEnDataUrl(url: string) {
  const r = await fetch(url); if (!r.ok) throw new Error('Image introuvable : ' + url);
  const type = r.headers.get('content-type') || 'image/png';
  return `data:${type};base64,${versBase64(new Uint8Array(await r.arrayBuffer()))}`;
}
const imageFacultative = async (url: string) => { try { return await imageEnDataUrl(url); } catch (_e) { return null; } };
async function photoStockee(cu: any, path: string) {
  if (!path) return null;
  const { data, error } = await cu.storage.from('caces-photos-stagiaires').download(path);
  if (error || !data) return null;
  return `data:${data.type || 'image/jpeg'};base64,${versBase64(new Uint8Array(await data.arrayBuffer()))}`;
}

/* ------------------------------ PDF (même dessin que le navigateur) ------------------------------ */
async function genererDocumentPdf(cu: any, ctx: any, stagiaireId: string, avecCarton: boolean) {
  const { S } = ctx;
  const { data: st, error } = await cu.from('stagiaires').select('id, nom, prenom, civilite, date_naissance, photo_path').eq('id', stagiaireId).single();
  if (error) throw new Error('Lecture du stagiaire : ' + error.message);
  const { data: toutes } = await cu.from('stagiaire_categories').select('referentiel_code, categorie_code, theorie_validee, pratique_validee').eq('stagiaire_id', stagiaireId);
  const cats = (toutes || []).filter((c: any) => c.theorie_validee === true && c.pratique_validee === true);
  if (!cats.length) return null;   // non éligible : ignoré en silence

  const libelleReferentiel = (code: string) => (S.referentiel.referentiels.find((r: any) => r.code === code) || {}).libelle || code;
  const libelleCategorie = (ref: string, code: string) => (S.referentiel.categories.find((c: any) => c.referentiel_code === ref && c.code === code) || {}).libelle || code;
  const nomFormateur = (id: string) => { const f = (S.formateurs || []).find((x: any) => x.id === id); return f ? ((f.nom || '') + ' ' + (f.prenom || '')).trim() || f.email : ''; };

  let certs: any = {};
  if (avecCarton) {
    for (const c of cats) {
      const { data, error: e } = await cu.rpc('caces_emettre_certificat', { p_stagiaire: stagiaireId, p_ref: c.referentiel_code, p_cat: c.categorie_code });
      if (e) throw new Error('Numérotation CACES : ' + e.message);
      certs[c.referentiel_code + '|' + c.categorie_code] = data;
    }
  }
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const nomComplet = `${st.nom} ${st.prenom}`.trim();
  const ne = st.date_naissance ? ` né(e) le ${dateFr(st.date_naissance)}` : '';
  const { data: logoOrg } = await cu.rpc('caces_logo_organisme');   // logo chargé dans Organisme (repli : logo BFS)
  const logo = (typeof logoOrg === 'string' && logoOrg.startsWith('data:image')) ? logoOrg : await imageEnDataUrl(SITE + 'assets/logo_bfs.png');
  const logoAm = avecCarton ? await imageFacultative(SITE + 'assets/logo_assurance_maladie.jpg') : null;
  const premierCert: any = Object.values(certs)[0];
  const qr = (avecCarton && premierCert) ? await QRCode.toDataURL(urlVerification(premierCert.numero), { errorCorrectionLevel: 'M', width: 300, margin: 1 }) : null;
  let signature = null, signataire = SIGNATAIRE_CARTON, agence = '', ctr: any = {};
  if (avecCarton) {
    const centres = S.referentiel.centres || [];
    const c = centres.find((x: any) => x.id === S.session?.centre_examen_id) || centres.find((x: any) => x.signataire) || {};
    if (c.signataire) signataire = c.signataire;
    agence = c.agence || ''; ctr = c;
    if (c.signature_cachet_path) signature = await photoStockee(cu, c.signature_cachet_path);
  }
  const photo = st.photo_path ? await photoStockee(cu, st.photo_path) : null;

/*__DESSIN_CARTON__*/
  const nomPdf = `${avecCarton ? 'Carton_CACES' : 'Autorisation_conduite'}_${st.nom}_${st.prenom}.pdf`.replace(/\s+/g, '_');
  return { nom: nomPdf, base64: doc.output('datauristring').split(',')[1] };
}

/* ------------------------------ appels inter-fonctions ------------------------------ */
async function appelFonction(nom: string, jwt: string, corps: unknown, delaiMs: number) {
  const r = await fetch(`${URL_SB}/functions/v1/${nom}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, apikey: CLE_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(corps), signal: AbortSignal.timeout(delaiMs),
  });
  let j: any = null; try { j = await r.json(); } catch (_e) { /* réponse non JSON */ }
  if (!r.ok && !j) throw new Error(`${nom} : HTTP ${r.status}`);
  return j || {};
}

/* ------------------------------ point d'entrée ------------------------------ */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Méthode non autorisée' }, 405);

  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ ok: false, error: 'Non authentifié' }, 401);
  let corps: any; try { corps = await req.json(); } catch (_e) { return json({ ok: false, error: 'Corps invalide' }, 400); }
  const sessionId = String(corps?.session_id || ''), ids: string[] = Array.isArray(corps?.stagiaire_ids) ? corps.stagiaire_ids.map(String) : [];
  if (!sessionId || !ids.length) return json({ ok: false, error: 'session_id et stagiaire_ids requis' }, 400);

  const opts = { db: { schema: 'caces' }, auth: { persistSession: false, autoRefreshToken: false } };
  const cu = createClient(URL_SB, CLE_ANON, { ...opts, global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: u, error: eu } = await cu.auth.getUser(jwt);
  if (eu || !u?.user) return json({ ok: false, error: 'Non authentifié' }, 401);
  const { data: role } = await cu.rpc('caces_role');
  if (role === null || role === undefined) return json({ ok: false, error: 'Compte non autorisé' }, 403);   // pas de profil CACES

  const { data: session } = await cu.from('sessions_formation').select('*').eq('id', sessionId).maybeSingle();
  if (!session) return json({ ok: false, error: 'Session introuvable' }, 404);
  const autorisation = session.type_session === 'autorisation';
  if (!autorisation && !(session.numero_session_galaxy || '').trim()) return json({ ok: false, error: 'N° de session Galaxy obligatoire' }, 400);
  const { data: prm } = await cu.from('parametres_application').select('email_secretariat').eq('id', 1).maybeSingle();
  const destinataire = (prm?.email_secretariat || '').trim();
  if (!destinataire) return json({ ok: false, error: 'Adresse du secrétariat non renseignée (Organisme)' }, 400);

  const service = createClient(URL_SB, CLE_SERVICE, opts);
  const maintenant = () => new Date().toISOString();
  const statut = (s: string, detail: any) => service.from('sessions_formation')
    .update({ envoi_secretariat_statut: s, envoi_secretariat_le: maintenant(), envoi_secretariat_detail: detail }).eq('id', sessionId);
  const journal = (action: string, detail: any) => cu.rpc('caces_journaliser_export', { p_session: sessionId, p_action: action, p_detail: detail });

  await journal('envoi_secretariat_demande', { nb_demandes: ids.length, destinataire });
  await statut('en_cours', { nb_demandes: ids.length });

  const travail = (async () => {
    const echecs: string[] = [], pieces: { nom: string, base64: string }[] = [];
    try {
      const [refs, cats, centres, formateurs] = await Promise.all([
        cu.from('referentiels').select('*'), cu.from('categories_referentiel').select('*'),
        cu.from('centres_examen').select('*').eq('actif', true), cu.from('formateurs').select('id, nom, prenom, email'),
      ]);
      const ctx = { S: { session, formateurs: formateurs.data || [],
        referentiel: { referentiels: refs.data || [], categories: cats.data || [], centres: centres.data || [] } } };
      const { data: valides } = await cu.from('stagiaires').select('id').eq('session_id', sessionId).in('id', ids);
      for (const { id } of (valides || [])) {
        try {
          const pdf = await genererDocumentPdf(cu, ctx, id, !autorisation);
          if (!pdf) continue;
          pieces.push(pdf);
          try {
            const j = await appelFonction('caces-sauvegarder-drive', jwt,
              { chemin: ['Sessions', session.nom, 'Titres'], nom_fichier: pdf.nom, mime_type: 'application/pdf', contenu_base64: pdf.base64 }, DELAI_DRIVE_MS);
            if (!j.ok) throw new Error(j.erreur || 'Drive refusé');
          } catch (e) { echecs.push('Drive — ' + pdf.nom + ' : ' + (e as Error).message); }
        } catch (e) { echecs.push('PDF — ' + id + ' : ' + (e as Error).message); }
      }
      if (!pieces.length) throw new Error('Aucun stagiaire éligible (théorie et pratique validées)');
      // Preuves de test (PDF générés par le navigateur, chantier 24) : Drive (dossier « Preuves ») + même mail
      const preuves: { nom: string, base64: string }[] = (Array.isArray(corps?.preuves) ? corps.preuves : [])
        .filter((p: any) => p && typeof p.nom === 'string' && typeof p.base64 === 'string' && /^[A-Za-z0-9+/=]+$/.test(p.base64)).slice(0, 200)
        .map((p: any) => ({ nom: p.nom.replace(/[^\w.\- ]+/g, '_').slice(0, 120), base64: p.base64 }));
      const copies: { nom: string, base64: string }[] = (Array.isArray(corps?.copies_qcm) ? corps.copies_qcm : [])
        .filter((p: any) => p && typeof p.nom === 'string' && typeof p.base64 === 'string' && /^[A-Za-z0-9+/=]+$/.test(p.base64)).slice(0, 200)
        .map((p: any) => ({ nom: p.nom.replace(/[^\w.\- ]+/g, '_').slice(0, 120), base64: p.base64 }));
      for (const p of copies) {   // copie du QCM : Drive seulement, pas dans le mail
        try {
          const j = await appelFonction('caces-sauvegarder-drive', jwt,
            { chemin: ['Sessions', session.nom, 'Copies QCM'], nom_fichier: p.nom, mime_type: 'application/pdf', contenu_base64: p.base64 }, DELAI_DRIVE_MS);
          if (!j.ok) throw new Error(j.erreur || 'Drive refusé');
        } catch (e) { echecs.push('Drive — ' + p.nom + ' : ' + (e as Error).message); }
      }
      for (const p of preuves) {
        pieces.push(p);
        try {
          const j = await appelFonction('caces-sauvegarder-drive', jwt,
            { chemin: ['Sessions', session.nom, 'Preuves'], nom_fichier: p.nom, mime_type: 'application/pdf', contenu_base64: p.base64 }, DELAI_DRIVE_MS);
          if (!j.ok) throw new Error(j.erreur || 'Drive refusé');
        } catch (e) { echecs.push('Drive — ' + p.nom + ' : ' + (e as Error).message); }
      }

      // Découpe en plusieurs mails au-delà de ~15 Mo de pièces jointes
      const lots: typeof pieces[] = []; let lot: typeof pieces = [], taille = 0;
      for (const p of pieces) {
        if (lot.length && taille + p.base64.length > TAILLE_MAX_MAIL) { lots.push(lot); lot = []; taille = 0; }
        lot.push(p); taille += p.base64.length;
      }
      if (lot.length) lots.push(lot);
      const agence = (centres.data || []).find((c: any) => c.id === session.centre_examen_id);
      for (let i = 0; i < lots.length; i++) {
        const suffixe = lots.length > 1 ? ` (${i + 1}/${lots.length})` : '';
        const sujet = (autorisation ? `Autorisations de conduite — ${session.nom}` : `CACES — session Galaxy ${session.numero_session_galaxy} — ${session.nom}`) + suffixe;
        const texte = `Bonjour,\n\nCi-joint ${lots[i].length} ${autorisation ? 'autorisation(s) de conduite' : 'carton(s) CACES'} (et preuves de test) de la session « ${session.nom} »`
          + (session.entreprise ? ` (${session.entreprise})` : '') + '.\n\nCordialement,\n' + (agence?.agence || 'BFS');
        const r = await appelFonction('envoyer-mail', jwt, { a: destinataire, sujet, texte, pieces_jointes: lots[i] }, DELAI_MAIL_MS);
        if (!(r.envoye === true || r.ok === true)) throw new Error('Mail refusé : ' + (r.erreur || r.error || 'réponse inattendue'));
      }
      const detail = { nb_envoyes: lots.length, nb_fichiers: pieces.length, nb_echecs: echecs.length, echecs: echecs.slice(0, 10), destinataire };
      await statut(echecs.length ? 'partiel' : 'reussi', detail);
      await journal('envoi_secretariat_reussi', detail);
      return { ok: true, nb_envoyes: lots.length, nb_fichiers: pieces.length, nb_echecs: echecs.length };
    } catch (e) {
      const detail = { erreur: (e as Error).message, nb_fichiers: pieces.length, echecs: echecs.slice(0, 10) };
      try { await statut('echec', detail); await journal('envoi_secretariat_echec', detail); } catch (_e) { /* best effort */ }
      return { ok: false, error: (e as Error).message };
    }
  })();
  // Le traitement va au bout même si le navigateur est fermé.
  try { (globalThis as any).EdgeRuntime?.waitUntil(travail); } catch (_e) { /* hors runtime Supabase */ }
  return json(await travail);
});
