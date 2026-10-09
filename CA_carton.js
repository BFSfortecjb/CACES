/* =====================================================================
   CA_carton.js — Documents remis au titulaire (PDF, jsPDF).
   Modèle : « carton CACES » recto/verso (partie haute, à découper) +
   « AUTORISATION DE CONDUITE » (partie basse), arrêté du 26/09/2025
   (art. R4323-56).
     - genererAutorisationPdf : partie basse seule (sessions « autorisation
       de conduite », ou à la demande pour un CACES).
     - genererCartonPdf (complet, avec n° de CACES) : phase numérotation.
   ===================================================================== */

const FAMILLE_ENGINS = { R482: 'engins de chantier', R482A: 'engins de chantier', R485: 'chariots de manutention automoteurs',
  R489: 'chariots de manutention automoteurs', R486: 'plates-formes élévatrices mobiles de personnel', R486A: 'plates-formes élévatrices mobiles de personnel' };

const blobVersDataUrl = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
async function imageEnDataUrl(url) {
  const r = await fetch(url); if (!r.ok) throw new Error('Image introuvable : ' + url);
  return blobVersDataUrl(await r.blob());
}

/** Catégories validées (théorie ET pratique) d'un stagiaire. */
async function categoriesValidees(stagiaireId) {
  const { data } = await sb.from('stagiaire_categories').select('referentiel_code, categorie_code, theorie_validee, pratique_validee')
    .eq('stagiaire_id', stagiaireId);
  return (data || []).filter(c => c.theorie_validee === true && c.pratique_validee === true);
}

/* Signataire du carton (à terme : Paramètres > Organisme). */
const SIGNATAIRE_CARTON = 'M.BOUA - Gérant';
const NUMERO_INRS = 'D-609-03';        // « Inscrit dans la base INRS sous le n° … » (verso du carton)
const SITE_WEB_BFS = 'www.bfs-prevention.fr';
const LIBELLE_OPTION = { telecommande: 'Télécommande', porte_engins: 'Porte-engins' };

/** QR code → data URL PNG (bibliothèque qrcodejs). */
function qrDataUrl(texte) {
  return new Promise(resolve => {
    try {
      const d = document.createElement('div');
      new QRCode(d, { text: texte, width: 300, height: 300, correctLevel: QRCode.CorrectLevel.M });
      setTimeout(() => { const c = d.querySelector('canvas'); resolve(c ? c.toDataURL('image/png') : null); }, 50);
    } catch (e) { resolve(null); }
  });
}

async function imageFacultative(url) { try { return await imageEnDataUrl(url); } catch (e) { return null; } }

async function genererAutorisationPdf(stagiaireId) { return genererDocumentPdf(stagiaireId, false); }
async function genererCartonPdf(stagiaireId) { return genererDocumentPdf(stagiaireId, true); }

/**
 * PDF A4 recto/verso. Avec carton : la moitié haute du recto est le carton CACES
 * (numéros attribués ici, une seule fois), la moitié basse l'autorisation de conduite.
 * Sans carton (session « autorisation ») : autorisation seule, pleine page.
 */
async function genererDocumentPdf(stagiaireId, avecCarton, opts = {}) {
  if (!window.jspdf) return toast('Bibliothèque PDF non chargée (connexion ?).', 'erreur');
  const { data: st, error } = await sb.from('stagiaires').select('id, nom, prenom, date_naissance, photo_path').eq('id', stagiaireId).single();
  if (error) return erreurSupabase('Lecture du stagiaire', error);
  const cats = await categoriesValidees(stagiaireId);
  if (!cats.length) return toast('Aucune catégorie validée (théorie et pratique) pour ce stagiaire.', 'erreur', 6000);

  let certs = {};
  if (avecCarton) {
    if (!opts.silencieux && !confirmer('Générer le carton attribue définitivement les numéros CACES aux catégories validées. Continuer ?')) return;
    try {
      for (const c of cats) {
        const { data, error: e } = await sb.rpc('caces_emettre_certificat',
          { p_stagiaire: stagiaireId, p_ref: c.referentiel_code, p_cat: c.categorie_code });
        if (e) throw new Error(e.message);
        certs[c.referentiel_code + '|' + c.categorie_code] = data;
      }
    } catch (e) { return erreurSupabase('Numérotation CACES', e); }
  }
  if (!opts.silencieux) toast('Génération du PDF…');
  try {
    const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const nomComplet = `${st.nom} ${st.prenom}`.trim();
    const ne = st.date_naissance ? ` né(e) le ${dateFr(st.date_naissance)}` : '';
    const logo = await imageEnDataUrl('assets/logo_bfs.png');
    const logoAm = avecCarton ? await imageFacultative('assets/logo_assurance_maladie.jpg') : null;
    const premierCert = Object.values(certs)[0];
    const qr = (avecCarton && premierCert && typeof QRCode !== 'undefined') ? await qrDataUrl(urlVerification(premierCert.numero)) : null;
    let signature = null, signataire = SIGNATAIRE_CARTON, agence = '', ctr = {};
    if (avecCarton) {
      const centres = S.referentiel?.centres || [];
      const c = centres.find(x => x.id === S.session?.centre_examen_id) || centres.find(x => x.signataire) || {};
      if (c.signataire) signataire = c.signataire;
      agence = c.agence || ''; ctr = c;
      if (c.signature_cachet_path) { const u = await urlPhotoStagiaire(c.signature_cachet_path); if (u) signature = await imageEnDataUrl(u); }
    }
    let photo = null;
    if (st.photo_path) { const u = await urlPhotoStagiaire(st.photo_path); if (u) photo = await imageEnDataUrl(u); }

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
        doc.setFontSize(9); bleu(); doc.text(`M. ${nomComplet}`.slice(0, 30), 29, 60, { align: 'center' }); noir();
        doc.setFontSize(7); doc.text('Date de naissance du titulaire', 29, 67, { align: 'center' });
        doc.setFontSize(9); bleu(); doc.text(st.date_naissance ? dateFr(st.date_naissance) : '', 29, 72, { align: 'center' }); noir();
        doc.setFontSize(7); doc.text('Signataire (en toutes lettres)', 29, 79, { align: 'center' });
        doc.setFontSize(9); bleu(); doc.text(signataire, 29, 84, { align: 'center' }); noir();
        doc.setFontSize(7); doc.text('Délivré par l\'agence' + (agence ? ' ' + agence : ''), 29, 91, { align: 'center', maxWidth: 40 });
        if (signature) doc.addImage(signature, 'JPEG', 12, 92, 34, 11);

        // tableau
        const X0 = 50, W = 148, cols = [10, 36, 44, 30, 28];           // CAT, Type, N°+options, testeur, dates
        boite(X0, 10, W, 7); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text(`CACES® ${ref.replace(/^R(\d{3}).*/, 'R.$1')} - ${libelleReferentiel(ref)}`.slice(0, 80), X0 + W / 2, 14.8, { align: 'center' });
        let y = 19; const xs = cols.reduce((a, w, i) => (a.push((a[i] || X0) + w), a), [X0]);
        doc.setFontSize(7); ['CAT', 'Type', 'N° du CACES® + Options', 'Testeur des épreuves pratiques', 'Obtention / échéance']
          .forEach((t, i) => doc.text(doc.splitTextToSize(t, cols[i] - 2), xs[i] + cols[i] / 2, y + 3, { align: 'center' }));
        doc.setFont('helvetica', 'normal'); y += 9;
        cr.slice(0, 5).forEach(c => {
          const ce = certs[ref + '|' + c.categorie_code] || {};
          boite(X0, y, W, 11); xs.slice(1, -1).forEach(x => doc.line(x, y, x, y + 11));
          doc.setFontSize(8); doc.text(c.categorie_code, xs[0] + cols[0] / 2, y + 6.5, { align: 'center' });
          doc.setFontSize(7); doc.text(doc.splitTextToSize(libelleCategorie(ref, c.categorie_code), cols[1] - 2), xs[1] + cols[1] / 2, y + 4.5, { align: 'center' });
          const opts = ref.startsWith('R482') ? ['telecommande', 'porte_engins'].map(o =>
            `${LIBELLE_OPTION[o]} ${(ce.options || []).includes(o) ? 'OUI' : 'NON'}`) : [];
          doc.setFontSize(7.5); bleu(); doc.text([ce.numero || '', ...opts], xs[2] + cols[2] / 2, y + 3.2, { align: 'center', lineHeightFactor: 1.1 });
          doc.text(nomFormateur(ce.testeur_id) || '', xs[3] + cols[3] / 2, y + 6.5, { align: 'center' });
          doc.text([dateFr(ce.date_delivrance), dateFr(ce.date_expiration)], xs[4] + cols[4] / 2, y + 4.5, { align: 'center' }); noir();
          y += 11;
        });
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
        doc.setFontSize(9); bleu(); doc.text(`M. ${nomComplet}`.slice(0, 40), 22, 20); noir();
        doc.setFontSize(7); doc.text('N° de CACES® obtenu(s)', 14, 32);
        doc.setFontSize(8.5); bleu(); doc.text(libelles.map(l => l.split(' — ')[0]).slice(0, 7), 18, 39); noir();
        doc.setFontSize(8.5); bleu(); doc.setFont('helvetica', 'bold'); doc.text(nomAg, 14, 72, { maxWidth: 80 });
        doc.setFont('helvetica', 'normal'); doc.text(adr, 14, 77); noir();
        doc.setFontSize(7); doc.text(`Inscrit dans la base INRS sous le n° ${NUMERO_INRS}`, 70, 92, { align: 'center' });
        doc.setFillColor(238, 238, 238); doc.setDrawColor(0); doc.rect(8, 95, 124, 9, 'FD');
        doc.setFontSize(6); doc.text(['Pour vérifier la validité de ce(s) CACES® [employeurs] ou pour éditer l\'attestation correspondante [titulaire]',
          'consulter la base de données CACES® sur le site : http://www.ameli.fr'], 70, 98.5, { align: 'center' });
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
    if (opts.retour) return { nom: nomPdf, base64: doc.output('datauristring').split(',')[1] };
    doc.save(nomPdf);
  } catch (e) { if (opts.retour) throw e; erreurSupabase('Génération du PDF', e); }
}
