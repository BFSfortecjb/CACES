/* =====================================================================
   CA_dossier_audit.js — Dossier d'audit d'une session (PDF unique, paysage) :
   identification (lieu, CDT / hors CDT, testeurs), tous les candidats y compris ajournés (théorie, pratique,
   photo, déclaration « testeur ≠ formateur »), examens d'adéquation (engin, conforme, saisie en bloc, observation),
   réclamations liées, extrait du journal. Ajouté au ZIP d'export + bouton « Dossier d'audit ».
   ===================================================================== */
async function genererDossierAuditPdf() {
  if (!window.jspdf) throw new Error('Bibliothèque PDF non chargée');
  const s = S.session, C = BFS_PDF;
  const [{ data: stags }, { data: adeqs }, { data: recl }, { data: jr }, { data: eng }] = await Promise.all([
    sb.from('stagiaires').select('id, nom, prenom, entreprise, photo_path').eq('session_id', s.id).order('nom'),
    sb.from('adequations_session').select('engin_id, testeur_id, date_examen, conforme, saisie_en_bloc, observation').eq('session_id', s.id),
    sb.from('reclamations').select('recue_le, objet, statut').eq('session_id', s.id),
    sb.from('journal_audit').select('created_at, acteur_nom, action, cible').eq('session_id', s.id).order('created_at', { ascending: false }).limit(60),
    sb.from('engins').select('id, designation, marque, modele, numero_serie'),
  ]);
  const ids = (stags || []).map(x => x.id);
  const [{ data: cats }, { data: eps }, { data: tirs }, { data: decls }] = ids.length ? await Promise.all([
    sb.from('stagiaire_categories').select('stagiaire_id, referentiel_code, categorie_code, theorie_validee, pratique_validee').in('stagiaire_id', ids),
    sb.from('epreuves_pratique').select('stagiaire_id, referentiel_code, categorie_code, score_global, reussi, testeur_id, date_passage').in('stagiaire_id', ids).eq('mode_essai', false).order('date_passage'),
    sb.from('qcm_tirages').select('stagiaire_id, referentiel_code, score_global_pct, reussi').in('stagiaire_id', ids).eq('statut', 'termine').order('date_debut'),
    sb.from('declarations_testeur').select('stagiaire_id').in('stagiaire_id', ids),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const nomF = id => { const f = (S.formateurs || []).find(x => x.id === id); return f ? `${f.nom || ''} ${f.prenom || ''}`.trim() : '—'; };
  const centre = (S.referentiel.centres || []).find(c => c.id === s.centre_examen_id);
  const lieu = s.lieu_type === 'client' ? 'Chez le client (hors CDT)' : `${centre ? centre.nom : (s.lieu || '—')} (CDT)`;
  const { jsPDF } = window.jspdf, doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  try { const logo = LOGO.data || await imageEnDataUrl('assets/logo_bfs.png'); doc.addImage(logo, 'PNG', 12, 6, 22, 12); } catch (_e) { /* facultatif */ }
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(...C.noir).text('DOSSIER D\'AUDIT DE SESSION — CACES®', 148, 13, { align: 'center' });
  doc.setDrawColor(...C.jaune).setLineWidth(0.8).line(118, 15, 178, 15); doc.setLineWidth(0.2);
  const testeurs = [...new Set((eps || []).map(e => e.testeur_id).filter(Boolean))].map(nomF).join(', ') || '—';
  const T = { margin: { left: 12, right: 12 }, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 1.8, valign: 'top' }, headStyles: { fillColor: C.jaune, textColor: C.noir, fontStyle: 'bold' } };
  doc.autoTable({ ...T, startY: 20, columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' } }, body: [
    ['Session', `${s.nom || ''}${s.numero_session_galaxy ? ' — Galaxy ' + s.numero_session_galaxy : ''}`], ['Entreprise', s.entreprise || '—'],
    ['Lieu / CDT', lieu], ['Testeur(s)', testeurs], ['Édité le', new Date().toLocaleDateString('fr-FR')]] });
  const corps = [];
  (stags || []).forEach(st => {
    const cs = (cats || []).filter(c => c.stagiaire_id === st.id);
    const photo = st.photo_path ? 'oui' : 'NON', decl = (decls || []).some(d => d.stagiaire_id === st.id) ? 'oui' : 'NON';
    (cs.length ? cs : [{ referentiel_code: '—', categorie_code: '' }]).forEach(c => {
      const t = (tirs || []).filter(x => x.stagiaire_id === st.id && x.referentiel_code === c.referentiel_code).pop();
      const e = (eps || []).filter(x => x.stagiaire_id === st.id && x.referentiel_code === c.referentiel_code && x.categorie_code === c.categorie_code).pop();
      const ok = c.theorie_validee === true && c.pratique_validee === true;
      corps.push([`${st.nom} ${st.prenom || ''}`.trim(), `${c.referentiel_code} ${c.categorie_code}`.trim(), t ? `${t.score_global_pct ?? '—'} %` : '—',
        e ? `${e.score_global ?? '—'}/100 (${nomF(e.testeur_id)})` : '—', photo, decl,
        { content: ok ? 'ADMIS' : (c.theorie_validee === false || c.pratique_validee === false ? 'AJOURNÉ' : 'EN COURS'), styles: { fontStyle: 'bold', textColor: ok ? C.vert : C.rouge } }]);
    });
  });
  doc.autoTable({ ...T, startY: doc.lastAutoTable.finalY + 5, head: [['Candidat', 'Réf. / cat.', 'Théorie', 'Pratique (testeur)', 'Photo', 'Décl. testeur≠formateur', 'Résultat']],
    body: corps.length ? corps : [[{ content: 'Aucun candidat', colSpan: 7 }]] });
  const E = id => { const x = (eng || []).find(y => y.id === id); return x ? [x.designation, x.marque, x.modele, x.numero_serie && 'n° ' + x.numero_serie].filter(Boolean).join(' ') : '—'; };
  doc.autoTable({ ...T, startY: doc.lastAutoTable.finalY + 5, head: [['Examen d\'adéquation — engin', 'Testeur', 'Date', 'Conforme', 'Saisie en bloc', 'Observation']],
    body: (adeqs || []).length ? adeqs.map(a => [E(a.engin_id), nomF(a.testeur_id), dateFr(a.date_examen), a.conforme ? 'oui' : 'NON', a.saisie_en_bloc ? 'oui' : 'non', a.observation || ''])
      : [[{ content: 'Aucun examen d\'adéquation enregistré', colSpan: 6 }]] });
  if ((recl || []).length) doc.autoTable({ ...T, startY: doc.lastAutoTable.finalY + 5, head: [['Réclamation reçue le', 'Objet', 'Statut']], body: recl.map(r => [dateFr(r.recue_le), r.objet, r.statut]) });
  doc.autoTable({ ...T, startY: doc.lastAutoTable.finalY + 5, styles: { ...T.styles, fontSize: 7.5, cellPadding: 1.3 }, head: [['Journal (60 dernières actions)', 'Acteur', 'Action', 'Cible']],
    body: (jr || []).length ? jr.map(j => [new Date(j.created_at).toLocaleString('fr-FR'), j.acteur_nom || '', j.action || '', j.cible || '']) : [[{ content: 'Journal vide', colSpan: 4 }]] });
  return { nom: `Dossier_audit_${(s.numero_session_galaxy || s.nom || 'session')}`.replace(/[^\w.-]+/g, '_') + '.pdf', base64: doc.output('datauristring').split(',')[1] };
}

async function telechargerDossierAudit() {
  try {
    const p = await genererDossierAuditPdf();
    const a = document.createElement('a'); a.href = 'data:application/pdf;base64,' + p.base64; a.download = p.nom; document.body.appendChild(a); a.click(); a.remove();
    toast('Dossier d\'audit téléchargé');
  } catch (e) { erreurSupabase('Dossier d\'audit', e); }
}
