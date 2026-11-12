/* =====================================================================
   CA_preuve.js — Preuve de test individuelle (PDF, chantier 24).
   Par stagiaire : identité, session, test théorique (note globale + par thème, admis/non admis),
   évaluation pratique par épreuve (engin, score /100, par thème, critère par critère, pénalités, fautes éliminatoires,
   justification d'échec, testeur), date et signature du testeur.
   Utilisée par : l'Export (ZIP) et l'envoi au secrétariat / Drive (PDF transmis à la fonction serveur).
   ===================================================================== */
async function preuveDonnees(stagiaireId) {
  const [st, tir, ep] = await Promise.all([
    sb.from('stagiaires').select('id, nom, prenom, civilite, date_naissance, entreprise, groupe_id').eq('id', stagiaireId).single(),
    sb.from('qcm_tirages').select('id, referentiel_code, date_debut, date_fin, score_global_pct, reussi, statut').eq('stagiaire_id', stagiaireId).eq('statut', 'termine').order('date_debut'),
    sb.from('epreuves_pratique').select('*').eq('stagiaire_id', stagiaireId).eq('mode_essai', false).order('date_passage'),
  ]);
  if (st.error) throw new Error(st.error.message);
  const tirages = tir.data || [], epreuves = ep.data || [];
  // Réponses par thème de chaque tirage
  const themes = {};
  if (tirages.length) {
    const { data: qs } = await sb.from('qcm_tirage_questions').select('tirage_id, correcte, questions_qcm(themes_referentiel(libelle))').in('tirage_id', tirages.map(t => t.id));
    (qs || []).forEach(q => {
      const lib = q.questions_qcm?.themes_referentiel?.libelle || 'Divers';
      const m = (themes[q.tirage_id] = themes[q.tirage_id] || {}); const x = (m[lib] = m[lib] || { ok: 0, n: 0 });
      x.n++; if (q.correcte) x.ok++;
    });
  }
  let res = [], crit = [];
  if (epreuves.length) {
    const r = await sb.from('epreuve_pratique_resultats').select('epreuve_id, critere_id, points_obtenus').in('epreuve_id', epreuves.map(e => e.id));
    res = r.data || [];
    const c = await sb.from('criteres_pratique').select('id, theme_code, theme_libelle, libelle, bareme_points, eliminatoire, ordre, point_numero')
      .in('id', [...new Set(res.map(x => x.critere_id))].length ? [...new Set(res.map(x => x.critere_id))] : [-1]);
    crit = c.data || [];
  }
  return { st: st.data, tirages, themes, epreuves, res, crit };
}

/* Mise en page calquée sur la preuve d'examen Habelec (CA_pdf Habelec) : couleurs BFS, tableaux autoTable,
   préconisations du testeur, bandeau final. */
const BFS_PDF = { jaune: [243, 171, 18], rouge: [178, 24, 26], vert: [27, 124, 60], orange: [201, 122, 22], gris: [70, 70, 69], noir: [8, 8, 8], grisClair: [244, 244, 243] };

/** Génère la preuve de test d'un stagiaire. Retourne { nom, base64 } (ou null si rien à prouver). */
async function genererPreuveTestPdf(stagiaireId) {
  if (!window.jspdf) throw new Error('Bibliothèque PDF non chargée');
  const d = await preuveDonnees(stagiaireId);
  if (!d.tirages.length && !d.epreuves.length) return null;
  const s = S.session || {};
  const { jsPDF } = window.jspdf, doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const C = BFS_PDF, largeur = 210, marge = 15, largeurUtile = largeur - 2 * marge, hauteurPage = 297;
  const nomT = id => { const f = (S.formateurs || []).find(x => x.id === id); return f ? `${f.nom || ''} ${f.prenom || ''}`.trim() : ''; };
  const libRef = c => (S.referentiel.referentiels.find(r => r.code === c)?.libelle) || c;
  const seuilRef = c => S.referentiel.referentiels.find(r => r.code === c)?.seuil_reussite_global_pct;
  const nomComplet = `${d.st.civilite ? d.st.civilite + ' ' : ''}${d.st.nom} ${d.st.prenom || ''}`.trim();
  let y = marge;

  try { const logo = LOGO.data || await imageEnDataUrl('assets/logo_bfs.png'); doc.addImage(logo, 'PNG', marge, y - 3, 22, 12); } catch (_e) { /* logo facultatif */ }
  doc.setTextColor(...C.noir).setFont('helvetica', 'bold').setFontSize(15);
  doc.text('PREUVE DE TEST — CACES®', largeur / 2, y, { align: 'center' });
  y += 3; doc.setDrawColor(...C.jaune).setLineWidth(0.8).line(largeur / 2 - 30, y, largeur / 2 + 30, y); doc.setLineWidth(0.2);
  y += 5; doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...C.gris);
  doc.text('Session : ' + (s.nom || '') + (s.numero_session_galaxy ? ' — Galaxy ' + s.numero_session_galaxy : ''), largeur / 2, y, { align: 'center' });
  y += 4; doc.setFontSize(7.5); doc.text('Document annexé au titre CACES® — recommandations CNAM', largeur / 2, y, { align: 'center' });
  y += 8;

  const testeurs = [...new Set(d.epreuves.map(e => nomT(e.testeur_id)).filter(Boolean))];
  doc.autoTable({ startY: y, margin: { left: marge, right: marge }, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 2.2 },
    columnStyles: { 0: { cellWidth: 32, fontStyle: 'bold' } },
    body: [['ENTREPRISE', d.st.entreprise || s.entreprise || '—'], ['CANDIDAT', nomComplet + (d.st.date_naissance ? ' — né(e) le ' + dateFr(d.st.date_naissance) : '')],
      ['TESTEUR', testeurs.join(', ') || '—']] });
  y = doc.lastAutoTable.finalY + 4;

  // Test théorique : une ligne par référentiel, détail par thème
  if (d.tirages.length) {
    doc.autoTable({ startY: y, margin: { left: marge, right: marge }, theme: 'grid', styles: { fontSize: 8, cellPadding: 1.8, valign: 'middle' },
      headStyles: { fillColor: C.jaune, textColor: C.noir, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: largeurUtile * 0.55 }, 1: { cellWidth: largeurUtile * 0.45, halign: 'center' } },
      head: [[{ content: 'TEST THÉORIQUE', styles: { halign: 'left' } }, 'Résultat']],
      body: d.tirages.flatMap(t => {
        const ok = t.reussi === true, sg = seuilRef(t.referentiel_code);
        return [[{ content: libRef(t.referentiel_code) + (t.date_debut ? ' — ' + dateFr(t.date_debut) : ''), styles: { fillColor: C.grisClair, fontStyle: 'bold' } },
            { content: `${t.score_global_pct ?? '—'} %${sg ? ' (seuil ' + sg + ' %)' : ''} — ${ok ? 'ADMIS' : 'NON ADMIS'}`, styles: { fillColor: C.grisClair, fontStyle: 'bold', textColor: ok ? C.vert : C.rouge } }],
          ...Object.entries(d.themes[t.id] || {}).map(([lib, x]) => {
            const pct = x.n ? Math.round(100 * x.ok / x.n) : 0;
            return [lib, { content: `${x.ok}/${x.n} (${pct} %)`, styles: { textColor: pct >= 50 ? C.vert : C.rouge } }];
          })];
      }) });
    y = doc.lastAutoTable.finalY + 4;
  }

  // Test pratique : un groupe par épreuve (bandeau + critères), jamais coupé entre deux pages
  let enteteFaite = false;
  for (const e of d.epreuves) {
    const lignes = d.res.filter(r => r.epreuve_id === e.id).map(r => ({ ...r, c: d.crit.find(c => c.id === r.critere_id) })).filter(r => r.c)
      .sort((a, b) => (a.c.ordre || 0) - (b.c.ordre || 0));
    const eng = e.engin_id ? (await sb.from('engins').select('designation, marque, modele, numero_serie').eq('id', e.engin_id).maybeSingle()).data : null;
    const reussi = e.reussi === true;
    const durees = [e.duree_prise_poste_s && `prise de poste ${Math.round(e.duree_prise_poste_s / 60)} min`, e.duree_production_s && `production ${Math.round(e.duree_production_s / 60)} min`, e.duree_fin_poste_s && `fin de poste ${Math.round(e.duree_fin_poste_s / 60)} min`].filter(Boolean);
    const sous = [eng && [eng.designation, eng.marque, eng.modele, eng.numero_serie && 'n° ' + eng.numero_serie].filter(Boolean).join(' '),
      e.options?.length && 'Options : ' + e.options.join(', '), durees.length && durees.join(' — ')].filter(Boolean).join('\n');
    const corps = [[{ content: `${e.referentiel_code} ${e.categorie_code}${e.date_passage ? ' — ' + dateFr(e.date_passage) : ''}${sous ? '\n' + sous : ''}`, styles: { fillColor: C.grisClair, fontStyle: 'bold' } },
        { content: `${e.score_global ?? '—'}/100\n${reussi ? 'ADMIS' : 'NON ADMIS'}`, styles: { fillColor: C.grisClair, fontStyle: 'bold', halign: 'right', textColor: reussi ? C.vert : C.rouge } }]];
    let theme = '';
    lignes.forEach(r => {
      if (r.c.theme_libelle !== theme) { theme = r.c.theme_libelle; corps.push([{ content: theme || r.c.theme_code, colSpan: 2, styles: { fontStyle: 'bold', textColor: C.gris } }]); }
      const zero = r.points_obtenus === 0;
      corps.push([`${r.c.point_numero ? r.c.point_numero + '. ' : ''}${r.c.libelle}${r.c.eliminatoire && zero ? '  (ÉLIMINATOIRE)' : ''}`,
        { content: `${r.points_obtenus}/${r.c.bareme_points}`, styles: { halign: 'right', fontStyle: 'bold', textColor: zero ? C.rouge : (r.points_obtenus === r.c.bareme_points ? C.vert : C.orange) } }]);
    });
    if (Array.isArray(e.penalites) && e.penalites.length) corps.push([{ content: 'Pénalités : ' + e.penalites.map(p => `${p.libelle} (−${p.points})`).join(' ; '), colSpan: 2, styles: { textColor: C.orange } }]);
    if (Array.isArray(e.eliminatoires) && e.eliminatoires.length) corps.push([{ content: 'Fautes éliminatoires : ' + e.eliminatoires.map(x => typeof x === 'string' ? x : (x.libelle || JSON.stringify(x))).join(' ; '), colSpan: 2, styles: { textColor: C.rouge, fontStyle: 'bold' } }]);
    if (y + 8 + Math.min(corps.length, 14) * 6.2 > hauteurPage - marge) { doc.addPage(); y = marge; enteteFaite = false; }
    doc.autoTable({ startY: y, margin: { left: marge, right: marge }, theme: 'grid', styles: { fontSize: 8, cellPadding: 1.8, valign: 'middle' },
      headStyles: { fillColor: C.jaune, textColor: C.noir, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: largeurUtile * 0.8 }, 1: { cellWidth: largeurUtile * 0.2 } },
      head: enteteFaite ? undefined : [[{ content: 'TEST PRATIQUE', styles: { halign: 'left' } }, { content: 'points', styles: { halign: 'right', fontSize: 6.5 } }]],
      body: corps });
    y = doc.lastAutoTable.finalY; enteteFaite = true;
  }
  y += 4;

  // Préconisations du testeur (justification d'échec saisie lors de l'évaluation)
  const avecPreco = d.epreuves.filter(e => e.justification_echec);
  if (avecPreco.length) {
    doc.autoTable({ startY: y, margin: { left: marge, right: marge }, theme: 'grid', styles: { fontSize: 8, cellPadding: 2.2, valign: 'top' },
      headStyles: { fillColor: C.rouge, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: largeurUtile * 0.25, fontStyle: 'bold', textColor: C.rouge }, 1: { cellWidth: largeurUtile * 0.75 } },
      head: [['PRÉCONISATION(S) DU TESTEUR', '']],
      body: avecPreco.map(e => [`${e.referentiel_code} ${e.categorie_code}`, e.justification_echec]) });
    y = doc.lastAutoTable.finalY + 4;
  }

  // Bandeau final : épreuves pratiques validées / total (et théorie)
  const nbOk = d.epreuves.filter(e => e.reussi === true).length, nb = d.epreuves.length;
  const theorieOk = d.tirages.length ? d.tirages.every(t => t.reussi === true) : null;
  const tout = nb ? (nbOk === nb && theorieOk !== false) : theorieOk === true;
  const [couleur, texte] = tout ? [C.vert, nb ? `${nbOk}/${nb} ÉPREUVE(S) PRATIQUE(S) VALIDÉE(S) — THÉORIE ${theorieOk === false ? 'NON ' : ''}VALIDÉE` : 'THÉORIE VALIDÉE']
    : (nbOk === 0 && theorieOk !== true) ? [C.rouge, 'AUCUNE ÉPREUVE VALIDÉE'] : [C.orange, 'VALIDATION PARTIELLE — VOIR PRÉCONISATION(S)'];
  if (y + 14 > hauteurPage - marge) { doc.addPage(); y = marge; }
  doc.setFillColor(...couleur); doc.rect(marge, y, largeurUtile, 12, 'F');
  doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(10.5); doc.text(texte, largeur / 2, y + 7.5, { align: 'center' });
  y += 17; doc.setTextColor(...C.gris).setFont('helvetica', 'normal').setFontSize(8);
  doc.text(`Édité le ${new Date().toLocaleDateString('fr-FR')} — signature du testeur :`, marge, y);
  doc.setDrawColor(0).rect(marge, y + 2, 70, 16);
  const nom = `${d.st.nom}_${d.st.prenom || ''}_preuve_test.pdf`.replace(/\s+/g, '_').replace(/[^\w.-]+/g, '_');
  return { nom, base64: doc.output('datauristring').split(',')[1] };
}

/** Preuves de test de plusieurs stagiaires (ignore silencieusement ceux sans test). */
async function genererPreuvesTest(ids) {
  const out = [];
  for (const id of ids) { try { const p = await genererPreuveTestPdf(id); if (p) out.push(p); } catch (e) { console.warn('Preuve de test', id, e); } }
  return out;
}
