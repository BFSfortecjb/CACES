/* © Jérémy Bizeul / Vigie-lance — CACES® : autorisation de conduite (session de type « autorisation »).
   - Pratique allégée : un critère par point d'évaluation de la grille INRS de la catégorie, acquis / non acquis, réussite à 70 %,
     case « manœuvre éliminatoire ou dangereuse » (candidat ajourné). Enregistrée comme une épreuve pratique ordinaire.
   - Avis du testeur (PDF) : favorable / défavorable après la théorie (40 questions) ET la pratique. L'autorisation de conduite est délivrée
     par l'employeur : l'avis est consultatif. */
const SEUIL_PRATIQUE_ALLEGEE = 70;

/** Appelée par afficherPratique() quand la session est de type « autorisation ». */
async function afficherPratiqueAllegee(st, cat) {
  const zone = $('#pratique-contenu');
  zone.innerHTML = '<p class="chargement">Chargement…</p>';
  const { data: crit, error } = await sb.from('criteres_pratique').select('id, point_numero, theme_libelle, libelle, bareme_points, ordre')
    .eq('referentiel_code', cat.referentiel_code).eq('categorie_code', cat.categorie_code).not('theme_code', 'like', 'opt_%').order('ordre');
  if (error) return erreurSupabase('Lecture de la grille', error);
  const parPoint = new Map();
  (crit || []).forEach(c => { const k = c.point_numero ?? ('x' + c.id); if (!parPoint.has(k)) parPoint.set(k, { num: c.point_numero, theme: c.theme_libelle, libelle: c.libelle, criteres: [] }); parPoint.get(k).criteres.push(c); });
  const points = [...parPoint.values()];
  if (!points.length) { zone.innerHTML = '<p class="erreur-discrete">Aucune grille pour cette catégorie : à compléter par l\'administrateur.</p>'; return; }
  const etat = new Map();          // index -> true (acquis) | false (non acquis)
  zone.innerHTML = `<div class="carte"><p><b>Autorisation de conduite — évaluation allégée</b> · ${esc(cat.referentiel_code)} ${esc(cat.categorie_code)}</p>
    <p class="aide">${points.length} points d'évaluation (grille INRS). Réussite : ${SEUIL_PRATIQUE_ALLEGEE} % de points acquis, sans manœuvre éliminatoire ou dangereuse.</p>
    <table class="tableau"><thead><tr><th>#</th><th>Point d'évaluation</th><th>Acquis</th><th>Non acquis</th></tr></thead><tbody>
    ${points.map((p, i) => `<tr data-i="${i}"><td>${p.num ?? i + 1}</td><td><b>${esc(p.theme || '')}</b><div class="aide">${esc(p.libelle)}</div></td>
      <td><label><input type="radio" name="al${i}" value="1"> ✓</label></td><td><label><input type="radio" name="al${i}" value="0"> ✗</label></td></tr>`).join('')}</tbody></table>
    <label style="display:block;margin-top:8px"><input type="checkbox" id="al-elim"> <b>Manœuvre éliminatoire ou dangereuse</b> (candidat ajourné)</label>
    <div id="al-just" hidden><label>Justification (obligatoire en cas d'échec) <textarea id="al-just-txt" rows="3" style="width:100%"></textarea></label></div>
    <div class="verdict" id="al-verdict"></div>
    <div class="actions"><button class="principal" id="al-enreg">Enregistrer définitivement</button></div></div>`;
  const calc = () => {
    const ok = [...etat.values()].filter(Boolean).length, n = points.length, pct = Math.round(1000 * ok / n) / 10, elim = $('#al-elim').checked;
    const reussi = pct >= SEUIL_PRATIQUE_ALLEGEE && !elim && etat.size === n;
    $('#al-verdict').className = 'verdict ' + (etat.size < n ? '' : reussi ? 'ok' : 'ko');
    $('#al-verdict').textContent = `${ok} / ${n} acquis — ${pct} %${etat.size < n ? ` (${n - etat.size} à noter)` : reussi ? ' — ADMIS' : ' — NON ADMIS'}`;
    $('#al-just').hidden = !(etat.size === n && !reussi);
    return { ok, n, pct, elim, reussi };
  };
  $$('input[type=radio]', zone).forEach(r => r.addEventListener('change', () => { etat.set(Number(r.closest('tr').dataset.i), r.value === '1'); calc(); }));
  $('#al-elim').addEventListener('change', calc); calc();
  $('#al-enreg').addEventListener('click', async ev => {
    const r = calc();
    if (etat.size < points.length) return toast(`Il reste ${points.length - etat.size} point(s) à noter.`, 'erreur', 5000);
    const just = $('#al-just-txt').value.trim();
    if (!r.reussi && just.length < 10) { $('#al-just').hidden = false; return toast('Échec : la justification est obligatoire (au moins une phrase).', 'erreur', 6000); }
    if (!confirm(`${r.pct} % — ${r.reussi ? 'ADMIS' : 'NON ADMIS'}. L'enregistrement est définitif pour ce passage. Confirmer ?`)) return;
    ev.target.disabled = true;
    const job = {
      id: (crypto.randomUUID ? crypto.randomUUID() : null),
      epreuve: { stagiaire_id: st.id, session_id: S.session.id, referentiel_code: cat.referentiel_code, categorie_code: cat.categorie_code,
        formateur_id: equipeStagiaire(st).formateur_id, testeur_id: testeurDeLEpreuve(), mode_essai: false,
        engin_id: null, engin_secondaire_id: null, options: null, ut_options: 0,
        duree_prise_poste_s: 0, duree_production_s: 0, duree_fin_poste_s: 0,
        eliminatoires: r.elim ? [{ libelle: 'Manœuvre éliminatoire ou dangereuse', type: 'danger' }] : null,
        score_global: r.pct, reussi: r.reussi, justification_echec: r.reussi ? null : just, penalites: [] },
      resultats: points.flatMap((p, i) => p.criteres.map((c, j) => ({ critere_id: c.id, points_obtenus: etat.get(i) && j === 0 ? c.bareme_points : 0 }))),
      date_validation: r.reussi ? new Date().toISOString().slice(0, 10) : null,
      libelle: `${st.nom} ${st.prenom} — ${cat.referentiel_code} ${cat.categorie_code} — ${r.pct} % (autorisation)`,
    };
    try { await persisterEpreuve(job); toast('Résultat enregistré'); fermerModale(); rendreDetailSession($('#contenu')); }
    catch (e) {
      if (typeof erreurReseau === 'function' && erreurReseau(e)) { mettreEnFile(job); toast('Pas de connexion : résultat conservé sur cet appareil, envoi automatique au retour du réseau.', 'erreur', 10000); fermerModale(); rendreDetailSession($('#contenu')); return; }
      ev.target.disabled = false; erreurSupabase("Enregistrement de l'épreuve", e);
    }
  });
}

/* ============ Avis du testeur (PDF) ============ */
async function avisTesteurPdf(stagiaireId) {
  if (!window.jspdf) return toast('Bibliothèque PDF non chargée (connexion ?).', 'erreur');
  const [{ data: st }, { data: cats }, { data: tirages }, { data: epr }] = await Promise.all([
    sb.from('stagiaires').select('id, nom, prenom, entreprise, date_naissance').eq('id', stagiaireId).single(),
    sb.from('stagiaire_categories').select('referentiel_code, categorie_code, theorie_validee, pratique_validee').eq('stagiaire_id', stagiaireId),
    sb.from('qcm_tirages').select('referentiel_code, score_global_pct, reussi, date_fin').eq('stagiaire_id', stagiaireId).eq('statut', 'termine').order('date_fin', { ascending: false }),
    sb.from('epreuves_pratique').select('referentiel_code, categorie_code, score_global, reussi, eliminatoires, date_passage, testeur_id').eq('stagiaire_id', stagiaireId).eq('mode_essai', false).order('date_passage', { ascending: false }),
  ]);
  if (!st) return toast('Stagiaire introuvable.', 'erreur');
  const lignes = (cats || []).map(c => {
    const t = (tirages || []).find(x => x.referentiel_code === c.referentiel_code), p = (epr || []).find(x => x.referentiel_code === c.referentiel_code && x.categorie_code === c.categorie_code);
    return { ref: c.referentiel_code, cat: c.categorie_code, t, p, ok: !!(t?.reussi && p?.reussi && !p?.eliminatoires) };
  });
  const complet = lignes.length && lignes.every(l => l.t && l.p), favorable = complet && lignes.every(l => l.ok);
  ouvrirModale('Avis du testeur — ' + st.nom + ' ' + st.prenom, `<form id="avis-f" class="formulaire">
    <p class="aide">${lignes.map(l => `${esc(l.ref)} ${esc(l.cat)} : théorie ${l.t ? (l.t.reussi ? 'réussie' : 'non réussie') + ' (' + l.t.score_global_pct + ' %)' : 'non passée'}, pratique ${l.p ? (l.p.reussi ? 'réussie' : 'non réussie') + ' (' + l.p.score_global + ' %)' : 'non passée'}`).join('<br>')}</p>
    ${complet ? '' : '<p class="erreur-discrete">Théorie et pratique ne sont pas terminées pour toutes les catégories : l\'avis ne peut pas être favorable.</p>'}
    <label>Avis <select name="avis"><option value="favorable" ${favorable ? 'selected' : ''} ${complet ? '' : 'disabled'}>Favorable</option><option value="defavorable" ${favorable ? '' : 'selected'}>Défavorable</option></select></label>
    <label>Motifs / observations <textarea name="motifs" rows="3" placeholder="Obligatoire si l'avis est défavorable"></textarea></label>
    <label>Engins / catégories concernés <input name="engins" value="${esc(lignes.map(l => l.ref + ' ' + l.cat).join(', '))}"></label>
    <div class="pied-modale"><button type="button" onclick="fermerModale()">Annuler</button><button class="principal">Générer le PDF</button></div></form>`);
  $('#avis-f').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target, avis = f.avis.value, motifs = f.motifs.value.trim();
    if (avis === 'defavorable' && motifs.length < 5) return toast('Indique le motif de l\'avis défavorable.', 'erreur');
    try { await dessinerAvisPdf(st, lignes, avis, motifs, f.engins.value.trim()); fermerModale(); } catch (err) { toast('Génération impossible : ' + (err.message || err), 'erreur'); }
  });
}

async function dessinerAvisPdf(st, lignes, avis, motifs, engins) {
  const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4' }), s = S.session || {};
  const logo = await imageEnDataUrl('assets/logo_bfs.png').catch(() => null);
  if (logo) { try { doc.addImage(logo, 'PNG', 15, 10, 30, 12); } catch (e) {} }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('AVIS DU TESTEUR — AUTORISATION DE CONDUITE', 105, 32, { align: 'center' });
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  let y = 46;
  const l = (t, g = false) => { doc.setFont('helvetica', g ? 'bold' : 'normal'); doc.text(t, 15, y); y += 7; };
  l('Candidat : ' + st.nom + ' ' + st.prenom + (st.date_naissance ? ' — né(e) le ' + dateFr(st.date_naissance) : ''), true);
  if (st.entreprise || s.entreprise) l('Entreprise : ' + (st.entreprise || s.entreprise));
  l('Session : ' + (s.nom || '') + (s.date_debut ? ' — ' + dateFr(s.date_debut) : ''));
  l('Engins / catégories concernés : ' + (engins || '—'));
  y += 3; doc.setFont('helvetica', 'bold'); doc.text('Résultats', 15, y); y += 6; doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  lignes.forEach(x => {
    doc.text(`${x.ref} ${x.cat} — Théorie : ${x.t ? (x.t.reussi ? 'satisfaisante' : 'non satisfaisante') + ' (' + x.t.score_global_pct + ' %)' : 'non passée'}  |  Pratique : ${x.p ? (x.p.reussi ? 'satisfaisante' : 'non satisfaisante') + ' (' + x.p.score_global + ' %)' : 'non passée'}${x.p?.eliminatoires ? ' — manœuvre éliminatoire' : ''}`, 15, y); y += 6;
  });
  y += 6; doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.setTextColor(avis === 'favorable' ? 27 : 178, avis === 'favorable' ? 124 : 24, avis === 'favorable' ? 60 : 26);
  doc.text(avis === 'favorable' ? 'AVIS FAVORABLE' : 'AVIS DÉFAVORABLE', 15, y); doc.setTextColor(0, 0, 0); y += 8;
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  if (motifs) { const t = doc.splitTextToSize('Motifs / observations : ' + motifs, 180); doc.text(t, 15, y); y += 5 * t.length + 3; }
  y += 4; doc.setFontSize(9); doc.setTextColor(90);
  const m = doc.splitTextToSize("Cet avis est consultatif. L'autorisation de conduite est délivrée par l'employeur, sous sa responsabilité, après vérification de l'aptitude médicale, de la connaissance des lieux et des instructions à respecter.", 180);
  doc.text(m, 15, y); y += 5 * m.length;
  doc.setTextColor(0); doc.setFontSize(10);
  const testeur = (typeof testeurDeLEpreuve === 'function' && testeurDeLEpreuve()) || S.profil?.id;
  y = Math.max(y + 16, 200);
  doc.text('Fait le ' + dateFr(new Date().toISOString().slice(0, 10)), 15, y);
  doc.text('Testeur : ' + (typeof nomFormateur === 'function' ? nomFormateur(testeur) : ''), 15, y + 6);
  doc.text('Signature :', 120, y);
  try {   // signature enregistrée dans « Mes documents » du testeur (si elle existe)
    const { data: d } = await sb.from('documents_personnels').select('fichier_path').eq('personne_id', testeur).eq('type', 'signature').eq('actuelle', true).limit(1).maybeSingle();
    if (d) { const { data: u } = await sb.storage.from('caces-personnel').createSignedUrl(d.fichier_path, 120); if (u?.signedUrl) { const img = await imageEnDataUrl(u.signedUrl); doc.addImage(img, 'PNG', 120, y + 2, 50, 20); } }
  } catch (e) { /* signature facultative : à signer à la main */ }
  doc.save(`Avis_testeur_${st.nom}_${st.prenom}.pdf`.replace(/\s+/g, '_'));
}
