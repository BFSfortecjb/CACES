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

async function genererAutorisationPdf(stagiaireId) {
  if (!window.jspdf) return toast('Bibliothèque PDF non chargée (connexion ?).', 'erreur');
  const { data: st, error } = await sb.from('stagiaires').select('id, nom, prenom, date_naissance, photo_path').eq('id', stagiaireId).single();
  if (error) return erreurSupabase('Lecture du stagiaire', error);
  const cats = await categoriesValidees(stagiaireId);
  if (!cats.length) return toast('Aucune catégorie validée (théorie et pratique) pour ce stagiaire.', 'erreur', 6000);
  toast('Génération du PDF…');
  try {
    const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const nomComplet = `${st.nom} ${st.prenom}`.trim();
    const ne = st.date_naissance ? ` né(e) le ${dateFr(st.date_naissance)}` : '';
    const libelles = cats.map(c => `- ${c.referentiel_code} ${c.categorie_code} — ${libelleCategorie(c.referentiel_code, c.categorie_code)}`);
    const codesCat = cats.map(c => c.categorie_code).join('-');
    const famille = FAMILLE_ENGINS[cats[0].referentiel_code] || 'équipements de travail';
    const logo = await imageEnDataUrl('assets/logo_bfs.png');
    let photo = null;
    if (st.photo_path) { const u = await urlPhotoStagiaire(st.photo_path); if (u) photo = await imageEnDataUrl(u); }

    const boite = (x, y, w, h) => { doc.setDrawColor(0); doc.setLineWidth(0.3); doc.rect(x, y, w, h); };
    const noir = () => doc.setTextColor(0, 0, 0);

    /* ---------- Page 1 : recto ---------- */
    if (photo) doc.addImage(photo, 'JPEG', 15, 15, 30, 40); else { boite(15, 15, 30, 40); doc.setFontSize(8); doc.text('Photo', 30, 36, { align: 'center' }); }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); noir(); doc.text('AUTORISATION DE CONDUITE', 100, 30, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text('Conformément à l\'arrêté du 26 septembre 2025 (Art : R4323-56)', 100, 36, { align: 'center' });
    doc.addImage(logo, 'PNG', 158, 14, 38, 20.6);

    const ligne = (y, etiquette, texte) => {
      doc.setFontSize(11); doc.text(etiquette, 50, y + 9, { align: 'right' });
      boite(55, y, 140, 14); if (texte) doc.text(texte, 125, y + 9, { align: 'center' });
    };
    ligne(68, 'Je soussigné(e)', '');
    ligne(86, 'De l\'entreprise', (S.session?.entreprise || '').slice(0, 70));
    ligne(104, 'Atteste que', nomComplet + ne);

    doc.setFontSize(10.5);
    doc.text(doc.splitTextToSize(`• Ne présente pas de contre-indications médicales à la conduite des ${famille} le`, 130), 15, 134);
    doc.text('__/__/____', 195, 134, { align: 'right' });
    doc.text('• Est titulaire de ou des autorisations de conduite :', 15, 152);
    boite(15, 156, 180, 58);
    doc.setFontSize(9.5); doc.text(libelles.slice(0, 12), 18, 163);
    doc.setFontSize(10.5);
    doc.text('• A connaissance des lieux et des instructions à respecter sur le(s) site(s) d\'utilisation', 15, 226);
    doc.setFontSize(7.5); doc.setTextColor(110, 110, 110);
    doc.text('Document Recto/Verso. Toute copie doit comporter les 2 faces', 105, 285, { align: 'center' });

    /* ---------- Page 2 : verso ---------- */
    doc.addPage(); noir();
    doc.setFontSize(10.5); doc.text(`En foi de quoi j'autorise ${nomComplet} à conduire la ou les catégories ${codesCat}`, 15, 22);
    boite(15, 28, 180, 120);
    doc.setFontSize(9.5); doc.text(libelles, 18, 35);
    doc.setFontSize(10.5);
    doc.text('Autorisation de conduite délivrée le', 15, 163); doc.text('__/__/____', 150, 163);
    doc.text('Date limite de validité', 15, 174); doc.text('__/__/____', 150, 174);
    doc.setFontSize(8); doc.text('(Limite de validité à définir par l\'employeur)', 15, 180);
    doc.setFontSize(10);
    doc.text(['Signature de l\'employeur ou son délégataire', 'avec le cachet de l\'entreprise :'], 15, 192);
    doc.text(`Signature de ${nomComplet}`, 112, 197);
    boite(15, 202, 85, 45); boite(110, 202, 85, 45);
    doc.setFontSize(7.5); doc.setTextColor(110, 110, 110);
    doc.text('Document Recto/Verso. Toute copie doit comporter les 2 faces', 105, 285, { align: 'center' });

    doc.save(`Autorisation_conduite_${st.nom}_${st.prenom}.pdf`.replace(/\s+/g, '_'));
  } catch (e) { erreurSupabase('Génération du PDF', e); }
}
