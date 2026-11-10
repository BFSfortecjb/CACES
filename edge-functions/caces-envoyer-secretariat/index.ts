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

const FAMILLE_ENGINS = { R482: 'engins de chantier', R482A: 'engins de chantier', R485: 'chariots de manutention automoteurs',
  R489: 'chariots de manutention automoteurs', R486: 'plates-formes élévatrices mobiles de personnel', R486A: 'plates-formes élévatrices mobiles de personnel' };


/* Signataire du carton (à terme : Paramètres > Organisme). */
const SIGNATAIRE_CARTON = 'M.BOUA - Gérant';
const NUMERO_INRS = 'D-609-03';        // « Inscrit dans la base INRS sous le n° … » (verso du carton)
const SITE_WEB_BFS = 'www.bfs-prevention.fr';
const LIBELLE_OPTION = { telecommande: 'Télécommande', porte_engins: 'Porte-engins' };

/** Mention de famille imposée par l'annexe A6 de chaque recommandation (R482B, R485A, R486B, R489A). */
const MENTION_FAMILLE = { R482: 'R.482 – Engins de chantier', R485: 'R.485 – Gerbeurs à conducteur accompagnant',
  R486: 'R.486 – Plates-formes élévatrices mobiles de personnel', R489: 'R.489 – Chariots à conducteur porté' };
const mentionFamille = ref => MENTION_FAMILLE[String(ref).slice(0, 4)] || ref;

/** Options à imprimer (annexe A6/3). « OUI/NON » obligatoire pour chaque option prévue ; certaines catégories sont toujours « OUI ». */
function optionsCarton(ref, cat, ce) {
  const a = (ce && ce.options) || [], f = String(ref).slice(0, 4), oui = b => (b ? 'OUI' : 'NON');
  if (f === 'R482') {
    const lignes = [];
    if (/^[A-G]/.test(cat)) lignes.push(`Télécommande : ${oui(a.includes('telecommande'))}`);
    if (cat === 'A' || cat === 'G') lignes.push('Porte-engins : OUI');
    else if (/^[B-F]/.test(cat)) lignes.push(`Porte-engins : ${oui(a.includes('porte_engins'))}`);
    return lignes;
  }
  if (f === 'R486') return [cat === 'C' ? 'Porte-engins : OUI' : `Porte-engins : ${oui(a.includes('porte_engins'))}`];
  return [];
}
const MENTION_AIPR = 'Ce(s) CACES® ne permet(tent) pas la délivrance d\'une AIPR';


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

    const boite = (x, y, w, h) => { doc.setDrawColor(0); doc.setLineWidth(0.3); doc.rect(x, y, w, h); };
    const noir = () => doc.setTextColor(0, 0, 0);
    const bleu = () => doc.setTextColor(0, 112, 192);
    const gris = () => doc.setTextColor(110, 110, 110);

    // Un jeu de 2 pages par référentiel
    const refs = [...new Set(cats.map(c => c.referentiel_code))];
    refs.forEach((ref, idx) => {
      if (idx > 0) doc.addPage();
      const cr = cats.filter(c => c.referentiel_code === ref);
      const libelles = cr.map(c => {
        const ce = certs[ref + '|' + c.categorie_code];
        return `- ${ce ? ce.numero : ref + ' ' + c.categorie_code} — ${libelleCategorie(ref, c.categorie_code)}`;
      });
      const codesCat = cr.map(c => c.categorie_code).join('-');
      const famille = FAMILLE_ENGINS[ref] || 'équipements de travail';
      noir(); doc.setFont('helvetica', 'normal');

      /* ---------- Recto : carton (moitié haute) ---------- */
      const oy = avecCarton ? 108 : 0;            // décalage de l'autorisation
      const k = avecCarton ? 0.8 : 1;              // compression verticale
      const Y = y => oy + (y - 15) * k + (avecCarton ? 0 : 15);
      if (avecCarton) {
        if (photo) doc.addImage(photo, 'JPEG', 14, 10, 30, 40); else { boite(14, 10, 30, 40); doc.setFontSize(8); doc.text('Photo', 29, 31, { align: 'center' }); }
        doc.setFontSize(7); doc.text('Titulaire (en toutes lettres)', 29, 55, { align: 'center' });
        doc.setFontSize(9); bleu(); doc.text(`${st.civilite === 'Mme' ? 'Mme' : 'M.'} ${nomComplet}`.slice(0, 30), 29, 60, { align: 'center' }); noir();
        doc.setFontSize(7); doc.text('Date de naissance du titulaire', 29, 67, { align: 'center' });
        doc.setFontSize(9); bleu(); doc.text(st.date_naissance ? dateFr(st.date_naissance) : '', 29, 72, { align: 'center' }); noir();
        doc.setFontSize(7); doc.text('Signataire (en toutes lettres)', 29, 79, { align: 'center' });
        doc.setFontSize(9); bleu(); doc.text(signataire, 29, 84, { align: 'center' }); noir();
        doc.setFontSize(7); doc.text('Délivré par l\'agence' + (agence ? ' ' + agence : ''), 29, 91, { align: 'center', maxWidth: 40 });
        if (signature) doc.addImage(signature, 'JPEG', 12, 92, 34, 11);

        // tableau
        const X0 = 50, W = 148, cols = [10, 36, 44, 30, 28];           // CAT, Type, N°+options, testeur, dates
        boite(X0, 10, W, 7); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text(`CACES® ${mentionFamille(ref)}`.slice(0, 80), X0 + W / 2, 14.8, { align: 'center' });
        let y = 19; const xs = cols.reduce((a, w, i) => (a.push((a[i] || X0) + w), a), [X0]);
        doc.setFontSize(7); ['CAT', 'Type', 'N° du CACES® + Options', 'Testeur des épreuves pratiques', 'Obtention / échéance']
          .forEach((t, i) => doc.text(doc.splitTextToSize(t, cols[i] - 2), xs[i] + cols[i] / 2, y + 3, { align: 'center' }));
        doc.setFont('helvetica', 'normal'); y += 9;
        cr.slice(0, 5).forEach(c => {
          const ce = certs[ref + '|' + c.categorie_code] || {};
          boite(X0, y, W, 11); xs.slice(1, -1).forEach(x => doc.line(x, y, x, y + 11));
          doc.setFontSize(8); doc.text(c.categorie_code, xs[0] + cols[0] / 2, y + 6.5, { align: 'center' });
          doc.setFontSize(7); doc.text(doc.splitTextToSize(libelleCategorie(ref, c.categorie_code), cols[1] - 2), xs[1] + cols[1] / 2, y + 4.5, { align: 'center' });
          const opts = optionsCarton(ref, c.categorie_code, ce);
          doc.setFontSize(7.5); bleu(); doc.text([ce.numero || '', ...opts], xs[2] + cols[2] / 2, y + 3.2, { align: 'center', lineHeightFactor: 1.1 });
          doc.text(nomFormateur(ce.testeur_id) || '', xs[3] + cols[3] / 2, y + 6.5, { align: 'center' });
          doc.text([dateFr(ce.date_delivrance), dateFr(ce.date_expiration)], xs[4] + cols[4] / 2, y + 4.5, { align: 'center' }); noir();
          y += 11;
        });
        doc.setFontSize(6.5); doc.text(MENTION_AIPR, X0, 90); doc.setFontSize(7);
        if (qr) {
          doc.addImage(qr, 'PNG', 179, 84, 19, 19);
          doc.setFontSize(6); doc.text('Vérifier ce titre', 188.5, 83, { align: 'center' });
        }
        doc.setFontSize(6.5); gris(); doc.text('Document Recto/Verso. Toute copie doit comporter les 2 faces', 205, 105, { angle: 90 }); noir();        doc.setLineDash([1.5, 1.2], 0); doc.setDrawColor(90); doc.line(0, 108, 210, 108); doc.setLineDash([], 0); doc.setDrawColor(0);
      }

      /* ---------- Recto : autorisation de conduite ---------- */
      const X = avecCarton ? { photoY: 112, titreY: 124 } : { photoY: 15, titreY: 30 };
      if (photo) doc.addImage(photo, 'JPEG', 15, X.photoY, 26, 34.7); else { boite(15, X.photoY, 26, 34.7); doc.setFontSize(8); doc.text('Photo', 28, X.photoY + 18, { align: 'center' }); }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text('AUTORISATION DE CONDUITE', 100, X.titreY, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      doc.text('Conformément à l\'arrêté du 26 septembre 2025 (Art : R4323-56)', 100, X.titreY + 6, { align: 'center' });
      doc.addImage(logo, 'PNG', 158, X.photoY - 1, 38, 20.6);

      const ligne = (y, etiquette, texte) => {
        doc.setFontSize(11); doc.text(etiquette, 50, y + 8, { align: 'right' });
        boite(55, y, 140, 12); if (texte) doc.text(texte, 125, y + 8, { align: 'center' });
      };
      const base = avecCarton ? 160 : 68, pas = avecCarton ? 16 : 18;
      ligne(base, 'Je soussigné(e)', '');
      ligne(base + pas, 'De l\'entreprise', (S.session?.entreprise || '').slice(0, 70));
      ligne(base + 2 * pas, 'Atteste que', nomComplet + ne);

      const b2 = base + 3 * pas + 8, ec = avecCarton ? 0.8 : 1;
      doc.setFontSize(10.5);
      doc.text(doc.splitTextToSize(`• Ne présente pas de contre-indications médicales à la conduite des ${famille} le`, 130), 15, b2);
      doc.text('__/__/____', 195, b2, { align: 'right' });
      doc.text('• Est titulaire de ou des autorisations de conduite :', 15, b2 + 14 * ec);
      const hb = avecCarton ? 38 : 58;
      boite(15, b2 + 17 * ec, 180, hb);
      doc.setFontSize(9.5); doc.text(libelles.slice(0, 12), 18, b2 + 17 * ec + 6);
      doc.setFontSize(10.5);
      doc.text('• A connaissance des lieux et des instructions à respecter sur le(s) site(s) d\'utilisation', 15, b2 + 17 * ec + hb + 8);
      doc.setFontSize(7.5); gris(); doc.text('Document Recto/Verso. Toute copie doit comporter les 2 faces', 105, 292, { align: 'center' });

      /* ---------- Verso ---------- */
      doc.addPage(); noir();
      let vy = 0;                                   // décalage du bas du verso (le haut porte le verso du carton)
      if (avecCarton) {
        vy = 96;
        const nomAg = (agence || 'BFS').slice(0, 60);
        const adr = String(ctr.adresse || '').split(/\n|,\s*/).filter(Boolean).slice(0, 3);
        // colonne gauche
        doc.setFontSize(7); doc.text('Titulaire (en toutes lettres)', 14, 12);
        doc.setFontSize(9); bleu(); doc.text(`${st.civilite === 'Mme' ? 'Mme' : 'M.'} ${nomComplet}`.slice(0, 40), 22, 20); noir();
        doc.setFontSize(7); doc.text('N° de CACES® obtenu(s)', 14, 32);
        doc.setFontSize(8.5); bleu(); doc.text(libelles.map(l => l.split(' — ')[0]).slice(0, 7), 18, 39); noir();
        doc.setFontSize(8.5); bleu(); doc.setFont('helvetica', 'bold'); doc.text(nomAg, 14, 72, { maxWidth: 80 });
        doc.setFont('helvetica', 'normal'); doc.text(adr, 14, 77); noir();
        doc.setFontSize(7); doc.text(`Inscrit dans la base INRS sous le n° ${NUMERO_INRS}`, 70, 92, { align: 'center' });
        doc.setFillColor(238, 238, 238); doc.setDrawColor(0); doc.rect(8, 95, 124, 9, 'FD');
        doc.setFontSize(6); doc.text(['Pour vérifier l\'authenticité de ce(s) CACES®, scanner le QR code ci-contre',
          'ou consulter le site : https://bfsfortecjb.github.io/CACES/#verification'], 70, 98.5, { align: 'center' });
        doc.setFontSize(6.5); gris(); doc.text('Document Recto/Verso. Toute copie doit comporter les 2 faces', 136, 104, { angle: 90 }); noir();
        // colonne droite
        doc.addImage(logo, 'PNG', 150, 8, 40, 21.7);
                doc.setFontSize(7); doc.text(adr, 170, 38, { align: 'center' });
        gris(); doc.setFontSize(7.5);
        const coord = []; if (ctr.telephone) coord.push('Tél : ' + ctr.telephone); if (ctr.email_secretariat) coord.push('Mail : ' + ctr.email_secretariat); coord.push('Site Web : ' + SITE_WEB_BFS);
        doc.text(coord, 170, 38 + adr.length * 3.6 + 3, { align: 'center', lineHeightFactor: 1.5 }); noir();
        doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text('CACES®', 170, 70, { align: 'center' }); doc.setFont('helvetica', 'normal');
        gris(); doc.setFontSize(6.5); doc.text(['La marque CACES® est protégée par un dépôt à', 'l\'INPI sous le numéro 03.3237295'], 170, 77, { align: 'center', lineHeightFactor: 1.4 }); noir();
        if (logoAm) doc.addImage(logoAm, 'JPEG', 155, 87, 30, 14);
        doc.setLineDash([1.5, 1.2], 0); doc.setDrawColor(90); doc.line(0, 108, 210, 108); doc.setLineDash([], 0); doc.setDrawColor(0);
        // repères de pliage en 3 volets égaux (la couverture BFS occupe le dernier tiers, centrée à x = 170)
        doc.setDrawColor(90); [8 + 194 / 3, 8 + 2 * 194 / 3].forEach(x => doc.line(x, 105, x, 108)); doc.setDrawColor(0);
      }
      doc.setFontSize(10.5); doc.text(`En foi de quoi j'autorise ${nomComplet} à conduire la ou les catégories ${codesCat}`, 15, 22 + vy);
      boite(15, 28 + vy, 180, avecCarton ? 64 : 120);
      doc.setFontSize(9.5); doc.text(libelles, 18, 35 + vy);
      doc.setFontSize(10.5);
      const dy = avecCarton ? vy - 60 : 0;
      doc.text('Autorisation de conduite délivrée le', 15, 163 + dy); doc.text('__/__/____', 150, 163 + dy);
      doc.text('Date limite de validité', 15, 174 + dy); doc.text('__/__/____', 150, 174 + dy);
      doc.setFontSize(8); doc.text('(Limite de validité à définir par l\'employeur)', 15, 180 + dy);
      doc.setFontSize(10);
      doc.text(['Signature de l\'employeur ou son délégataire', 'avec le cachet de l\'entreprise :'], 15, 192 + dy);
      doc.text(`Signature de ${nomComplet}`, 112, 197 + dy);
      boite(15, 202 + dy, 85, avecCarton ? 40 : 45); boite(110, 202 + dy, 85, avecCarton ? 40 : 45);
      doc.setFontSize(7.5); gris(); doc.text('Document Recto/Verso. Toute copie doit comporter les 2 faces', 105, 285, { align: 'center' });
    });


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
