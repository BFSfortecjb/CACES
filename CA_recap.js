/* =====================================================================
   CA_recap.js — Chantier 24 (suite) : modèle Habelec
   - Récapitulatif de session (1 page : une ligne par stagiaire × catégorie, résultat + recommandation du testeur) → mail + Drive + ZIP
   - Copie du QCM par stagiaire (toutes les questions, réponse donnée / attendue) → Drive + ZIP seulement (pas dans le mail)
   ===================================================================== */
async function genererRecapSessionPdf() {
  if (!window.jspdf) throw new Error('Bibliothèque PDF non chargée');
  const s = S.session, C = BFS_PDF;
  const { data: stags } = await sb.from('stagiaires').select('id, nom, prenom, civilite, entreprise').eq('session_id', s.id).order('nom');
  const ids = (stags || []).map(x => x.id); if (!ids.length) return null;
  const [{ data: cats }, { data: eps }, { data: tirs }] = await Promise.all([
    sb.from('stagiaire_categories').select('stagiaire_id, referentiel_code, categorie_code, theorie_validee, pratique_validee').in('stagiaire_id', ids),
    sb.from('epreuves_pratique').select('stagiaire_id, referentiel_code, categorie_code, score_global, reussi, justification_echec, date_passage').in('stagiaire_id', ids).eq('mode_essai', false).order('date_passage'),
    sb.from('qcm_tirages').select('stagiaire_id, referentiel_code, score_global_pct, reussi').in('stagiaire_id', ids).eq('statut', 'termine').order('date_debut'),
  ]);
  const { jsPDF } = window.jspdf, doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  try { const logo = LOGO.data || await imageEnDataUrl('assets/logo_bfs.png'); doc.addImage(logo, 'PNG', 12, 6, 22, 12); } catch (_e) { /* facultatif */ }
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(...C.noir).text('RÉCAPITULATIF DE SESSION — CACES®', 148, 13, { align: 'center' });
  doc.setDrawColor(...C.jaune).setLineWidth(0.8).line(118, 15, 178, 15); doc.setLineWidth(0.2);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...C.gris)
    .text(`${s.nom || ''}${s.numero_session_galaxy ? ' — Galaxy ' + s.numero_session_galaxy : ''}${s.entreprise ? ' — ' + s.entreprise : ''}`, 148, 20, { align: 'center' });
  const corps = [];
  (stags || []).forEach(st => {
    (cats || []).filter(c => c.stagiaire_id === st.id).forEach(c => {
      const t = (tirs || []).filter(x => x.stagiaire_id === st.id && x.referentiel_code === c.referentiel_code).pop();
      const e = (eps || []).filter(x => x.stagiaire_id === st.id && x.referentiel_code === c.referentiel_code && x.categorie_code === c.categorie_code).pop();
      const ok = c.theorie_validee === true && c.pratique_validee === true;
      corps.push([`${st.nom} ${st.prenom || ''}`.trim(), `${c.referentiel_code} ${c.categorie_code}`,
        t ? `${t.score_global_pct ?? '—'} %` : (c.theorie_validee ? 'validée' : '—'),
        e ? `${e.score_global ?? '—'}/100` : (c.pratique_validee ? 'validée' : '—'),
        { content: ok ? 'ADMIS' : 'NON ADMIS', styles: { fontStyle: 'bold', textColor: ok ? C.vert : C.rouge } },
        ok ? '' : (e?.justification_echec || '')]);
    });
  });
  doc.autoTable({ startY: 25, margin: { left: 12, right: 12 }, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 1.8, valign: 'top' },
    headStyles: { fillColor: C.jaune, textColor: C.noir, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 28 }, 2: { cellWidth: 24, halign: 'center' }, 3: { cellWidth: 24, halign: 'center' }, 4: { cellWidth: 26, halign: 'center' } },
    head: [['Stagiaire', 'Référentiel / cat.', 'Théorie', 'Pratique', 'Résultat', 'Recommandation du testeur']],
    body: corps.length ? corps : [[{ content: 'Aucun résultat enregistré', colSpan: 6 }]] });
  const nbOk = corps.filter(l => l[4].content === 'ADMIS').length;
  doc.setFontSize(8.5).setTextColor(...C.gris).text(`${nbOk}/${corps.length} catégorie(s) validée(s) — édité le ${new Date().toLocaleDateString('fr-FR')}`, 12, doc.lastAutoTable.finalY + 6);
  return { nom: `Recapitulatif_session_${(s.numero_session_galaxy || s.nom || 'session')}`.replace(/[^\w.-]+/g, '_') + '.pdf', base64: doc.output('datauristring').split(',')[1] };
}

/** Copie du QCM terminé d'un stagiaire (une section par test terminé). */
async function genererCopieQcmPdf(stagiaireId) {
  if (!window.jspdf) throw new Error('Bibliothèque PDF non chargée');
  const C = BFS_PDF;
  const [{ data: st }, { data: tirs }] = await Promise.all([
    sb.from('stagiaires').select('nom, prenom').eq('id', stagiaireId).single(),
    sb.from('qcm_tirages').select('id, referentiel_code, date_debut, score_global_pct, reussi').eq('stagiaire_id', stagiaireId).eq('statut', 'termine').order('date_debut'),
  ]);
  if (!tirs?.length) return null;
  const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(...C.noir).text('COPIE DU TEST THÉORIQUE — CACES®', 105, 14, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(10).text(`${st.nom} ${st.prenom || ''}`.trim(), 105, 20, { align: 'center' });
  let y = 26;
  const rep = b => b === true ? 'Vrai' : b === false ? 'Faux' : '—';
  for (const t of tirs) {
    const { data: qs } = await sb.from('qcm_tirage_questions').select('ordre, reponse_stagiaire, correcte, questions_qcm(enonce, reponse)').eq('tirage_id', t.id).order('ordre');
    doc.autoTable({ startY: y, margin: { left: 12, right: 12 }, theme: 'grid', styles: { fontSize: 7.5, cellPadding: 1.4, valign: 'middle' },
      headStyles: { fillColor: C.jaune, textColor: C.noir, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 2: { cellWidth: 20, halign: 'center' }, 3: { cellWidth: 20, halign: 'center' }, 4: { cellWidth: 9, halign: 'center' } },
      head: [[{ content: `${(S.referentiel.referentiels.find(r => r.code === t.referentiel_code) || {}).libelle || t.referentiel_code} — ${t.score_global_pct ?? '—'} % — ${t.reussi ? 'ADMIS' : 'NON ADMIS'}`, colSpan: 5, styles: { halign: 'left' } }],
        ['N°', 'Question', 'Réponse', 'Attendu', '']],
      body: (qs || []).map(q => [q.ordre, q.questions_qcm?.enonce || '', rep(q.reponse_stagiaire), rep(q.questions_qcm?.reponse),
        { content: q.correcte ? '✔' : 'X', styles: { textColor: q.correcte ? C.vert : C.rouge, fontStyle: 'bold' } }]) });
    y = doc.lastAutoTable.finalY + 6;
  }
  return { nom: `${st.nom}_${st.prenom || ''}_copie_QCM.pdf`.replace(/\s+/g, '_').replace(/[^\w.-]+/g, '_'), base64: doc.output('datauristring').split(',')[1] };
}
async function genererCopiesQcm(ids) {
  const out = [];
  for (const id of ids) { try { const p = await genererCopieQcmPdf(id); if (p) out.push(p); } catch (e) { console.warn('Copie QCM', id, e); } }
  return out;
}
