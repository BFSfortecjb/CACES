/* =====================================================================
   CA_non_conformite.js — Fiche de non-conformité (PDF) éditée lors de l'examen d'adéquation (annexe 1, procédure n° 4).
   MODÈLE PROVISOIRE : aucune trame publique n'existe ; la mise en page sera alignée sur le modèle BFS dès qu'il sera fourni.
   Contenu : session, organisme, testeur, engin, points non conformes relevés, mesures décidées, signatures.
   ===================================================================== */
async function genererFicheNonConformite(engin, points, nc) {
  const s = S.session || {};
  const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const centre = (S.referentiel.centres || []).find(c => c.id === s.centre_examen_id) || (S.referentiel.centres || [])[0] || {};
  const testeur = (typeof testeurDeLEpreuve === 'function' && nomFormateur(testeurDeLEpreuve())) || (S.profil ? `${S.profil.nom || ''} ${S.profil.prenom || ''}`.trim() : '');
  const manquants = TOUS_POINTS_ADEQUATION.filter(k => !points[k]);
  const libelleDe = k => { for (const g of GROUPES_ADEQUATION) { const p = g.points.find(x => x[0] === k); if (p) return { lib: p[1], groupe: g.titre }; } return { lib: k, groupe: '' }; };
  const maintenant = new Date();
  const dateHeure = maintenant.toLocaleDateString('fr-FR') + ' à ' + maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const noir = () => doc.setTextColor(0, 0, 0), gris = () => doc.setTextColor(110, 110, 110);
  const boite = (x, y, w, h) => { doc.setDrawColor(0); doc.setLineWidth(0.3); doc.rect(x, y, w, h); };
  const ligne = (y, etiquette, valeur, x = 15, w = 180) => {
    boite(x, y, w, 8); doc.setFontSize(8); gris(); doc.text(etiquette, x + 2, y + 3.2); noir();
    doc.setFontSize(10); doc.text(String(valeur || '').slice(0, 95), x + 2, y + 7);
  };

  try { const logo = LOGO.data || await imageEnDataUrl('assets/logo_bfs.png'); doc.addImage(logo, 'PNG', 150, 8, 45, 24); } catch (_e) { /* logo facultatif */ }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('FICHE DE NON-CONFORMITÉ', 15, 20);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); gris();
  doc.text('Examen d\'adéquation — évaluation pratique CACES® (annexe 1, procédure n° 4)', 15, 26); noir();
  doc.setFontSize(8); gris(); doc.text('Modèle provisoire BFS CACES — édité le ' + dateHeure, 15, 31); noir();

  let y = 38;
  ligne(y, 'Organisme / agence', centre.agence || centre.nom || 'BFS'); y += 10;
  ligne(y, 'Session', s.nom || '', 15, 120); ligne(y, 'N° de session Galaxy', s.numero_session_galaxy || '', 137, 58); y += 10;
  ligne(y, 'Entreprise / site du test', s.entreprise || ''); y += 10;
  ligne(y, 'Testeur', testeur, 15, 120); ligne(y, 'Date et heure du constat', dateHeure, 137, 58); y += 10;
  const cats = [...new Set((s._categories || []).map(c => `${c.referentiel_code} ${c.categorie_code}`))].join(', ');
  ligne(y, 'Référentiel et catégories de la session', cats); y += 14;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Engin concerné', 15, y); doc.setFont('helvetica', 'normal'); y += 3;
  ligne(y, 'Désignation / type', engin.designation || '', 15, 90); ligne(y, 'Marque', engin.marque || '', 107, 44); ligne(y, 'Modèle', engin.modele || '', 153, 42); y += 10;
  ligne(y, 'N° de série', engin.numero_serie || '', 15, 90); ligne(y, 'Immatriculation / n° interne', engin.immatriculation || engin.numero_interne || '', 107, 88); y += 14;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Points non conformes relevés', 15, y); doc.setFont('helvetica', 'normal'); y += 3;
  const lignes = manquants.length ? manquants.map(k => libelleDe(k)) : [{ lib: '(aucun point coché comme non conforme)', groupe: '' }];
  const hauteur = Math.max(18, lignes.length * 6 + 4);
  boite(15, y, 180, hauteur); doc.setFontSize(10);
  lignes.forEach((l, i) => doc.text('☒ ' + l.lib + (l.groupe ? '  (' + l.groupe + ')' : ''), 18, y + 7 + i * 6, { maxWidth: 174 }));
  y += hauteur + 6;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Description de la non-conformité et observations', 15, y); doc.setFont('helvetica', 'normal'); y += 3;
  boite(15, y, 180, 30); y += 36;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Mesures décidées', 15, y); doc.setFont('helvetica', 'normal'); y += 6; doc.setFontSize(10);
  const coche = b => (b ? '☒' : '☐');
  [[nc && nc.traitee, 'Non-conformité traitée immédiatement'], [false, 'Référent technique / responsable de site appelé : nom ……………………………………'],
   [false, 'Test reporté'], [false, 'Test refusé sur cet engin'], [false, 'Engin remplacé par : ……………………………………………………']]
    .forEach(([b, l], i) => doc.text(`${coche(b)} ${l}`, 18, y + i * 6.5));
  y += 5 * 6.5 + 6;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Signatures', 15, y); doc.setFont('helvetica', 'normal'); y += 3;
  boite(15, y, 88, 32); boite(107, y, 88, 32); doc.setFontSize(8); gris();
  doc.text('Testeur (nom, date, signature)', 17, y + 4); doc.text('Responsable du site / de l\'entreprise (nom, date, signature)', 109, y + 4); noir();
  doc.setFontSize(7); gris(); doc.text('Document à conserver dans le dossier de la session.', 15, 288); noir();

  doc.save(`Fiche_non_conformite_${(s.nom || 'session').replace(/\s+/g, '_')}_${(engin.numero_serie || engin.marque || 'engin').toString().replace(/\s+/g, '_')}.pdf`);
}
