/* =====================================================================
 *  CA_repartition.js — vague 5
 *  #6 : échéances des testeurs (alerte à 6 mois ; l'admin voit tous les testeurs, un testeur voit la sienne ;
 *       un testeur échu est bloqué côté base : ni affectation, ni évaluation).
 *  #8 : répartition des stagiaires d'une session (ou d'un groupe) entre 2 testeurs (ou plus),
 *       automatique (équilibrée, formateur ≠ testeur) ou manuelle.
 * ===================================================================== */
const MAX_THEORIE_PAR_TESTEUR = 12;

/* ------------------------------ #6 échéances ------------------------------ */
function etatEcheanceTesteur(f) {
  if (!f.date_echeance_testeur) return null;
  const fin = new Date(f.date_echeance_testeur + 'T12:00:00'), auj = new Date(); auj.setHours(12, 0, 0, 0);
  const jours = Math.round((fin - auj) / 86400000);
  const nom = ((f.nom || '') + ' ' + (f.prenom || '')).trim() || f.email;
  if (jours < 0) return { niveau: 'echu', jours, texte: `${nom} : validité testeur ÉCHUE depuis le ${dateFr(f.date_echeance_testeur)}` };
  if (jours <= 183) return { niveau: 'bientot', jours, texte: `${nom} : validité testeur jusqu'au ${dateFr(f.date_echeance_testeur)} (${jours} j)` };
  return { niveau: 'ok', jours, texte: '' };
}
function alertesEcheancesTesteurs() {
  const admin = S.profil?.role === 'admin';
  const liste = (S.formateurs || []).filter(f => f.est_testeur !== false && f.role !== 'secretariat' && (admin || f.id === S.profil?.id));
  return liste.map(etatEcheanceTesteur).filter(e => e && e.niveau !== 'ok').sort((a, b) => a.jours - b.jours);
}
function rendreAlerteTesteurs(zone) {
  if (!zone) return;
  const a = alertesEcheancesTesteurs();
  zone.innerHTML = a.length ? `<div class="carte" style="border-left:4px solid ${a.some(x => x.niveau === 'echu') ? '#c0392b' : '#e67e22'}">
    <b>⚠ Échéances testeurs</b><ul>${a.map(x => `<li>${esc(x.texte)}</li>`).join('')}</ul>
    <p class="aide">Un testeur échu ne peut plus être affecté à une session ni évaluer.</p></div>` : '';
}

/* ------------------------------ #8 répartition ------------------------------ */
async function ouvrirRepartitionTesteurs() {
  const s = S.session;
  const [{ data: stags, error }, { data: sts }, { data: grs }, { data: regles }] = await Promise.all([
    sb.from('stagiaires').select('id, nom, prenom, groupe_id, testeur_id, ordre, stagiaire_categories(referentiel_code, categorie_code)').eq('session_id', s.id).order('ordre').order('nom'),
    sb.from('session_testeurs').select('testeur_id').eq('session_id', s.id),
    sb.from('session_groupes').select('id, numero, formateur_id').eq('session_id', s.id),
    sb.from('session_testeur_categories').select('referentiel_code, categorie_code, testeur_id').eq('session_id', s.id),
  ]);
  if (error) return erreurSupabase('Lecture des stagiaires', error);
  const ids = [...new Set([s.testeur_id, ...(sts || []).map(x => x.testeur_id)].filter(Boolean))];
  const nomF = id => { const f = (S.formateurs || []).find(x => x.id === id); return f ? ((f.nom || '') + ' ' + (f.prenom || '')).trim() || f.email : '—'; };
  if (!ids.length) return toast('Aucun testeur sur cette session : ajoutez-en dans la fiche de la session.');
  const formateurDe = st => (grs || []).find(g => g.id === st.groupe_id)?.formateur_id || s.formateur_id;
  const peut = (t, st) => t !== formateurDe(st) || s.type_session === 'autorisation' || (S.formateurs || []).find(f => f.id === t)?.cumul_formateur_testeur;
  const aff = Object.fromEntries((stags || []).map(x => [x.id, x.testeur_id && ids.includes(x.testeur_id) ? x.testeur_id : '']));
  // Affectation par catégorie : { 'R489|3': testeur_id }
  const affCat = Object.fromEntries((regles || []).map(r => [r.referentiel_code + '|' + r.categorie_code, ids.includes(r.testeur_id) ? r.testeur_id : '']));
  const effectifCat = {};   // nombre de stagiaires visant chaque catégorie
  (stags || []).forEach(st => (st.stagiaire_categories || []).forEach(c => { const k = c.referentiel_code + '|' + c.categorie_code; effectifCat[k] = (effectifCat[k] || 0) + 1; }));
  const cles = Object.keys(effectifCat).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  const numGroupe = st => (grs || []).find(g => g.id === st.groupe_id)?.numero;

  const dessinerCat = () => {
    const charge = Object.fromEntries(ids.map(t => [t, 0])); cles.forEach(k => { if (affCat[k]) charge[affCat[k]] += effectifCat[k]; });
    $('#rep-cat').innerHTML = cles.map(k => `<tr><td><b>${esc(k.replace('|', ' '))}</b></td><td>${effectifCat[k]} stagiaire(s)</td>
      <td><select data-cat="${esc(k)}"><option value="">(non affectée)</option>${ids.map(t => `<option value="${t}" ${affCat[k] === t ? 'selected' : ''}>${esc(nomF(t))}</option>`).join('')}</select></td></tr>`).join('')
      || '<tr><td colspan="3" class="vide">Aucune catégorie visée.</td></tr>';
    $('#rep-cat-charge').innerHTML = ids.map(t => `<span class="prat-badge">${esc(nomF(t))} : ${charge[t]} test(s)</span>`).join(' ');
    $$('#rep-cat select').forEach(sel => sel.onchange = () => { affCat[sel.dataset.cat] = sel.value; dessinerCat(); });
  };
  const dessiner = () => {
    const nb = Object.fromEntries(ids.map(t => [t, 0])); Object.values(aff).forEach(t => { if (t) nb[t]++; });
    $('#rep-corps').innerHTML = (stags || []).map(st => `<tr><td>${esc(st.nom)} ${esc(st.prenom || '')}</td>
      <td>${numGroupe(st) ? 'Groupe ' + numGroupe(st) : '—'}</td>
      <td><select data-st="${st.id}"><option value="">(par défaut)</option>${ids.map(t => `<option value="${t}" ${aff[st.id] === t ? 'selected' : ''} ${peut(t, st) ? '' : 'disabled'}>${esc(nomF(t))}</option>`).join('')}</select></td></tr>`).join('');
    $('#rep-compte').innerHTML = ids.map(t => `<span class="prat-badge" style="${nb[t] > MAX_THEORIE_PAR_TESTEUR ? 'background:#c0392b;color:#fff' : ''}">${esc(nomF(t))} : ${nb[t]}</span>`).join(' ')
      + (ids.some(t => nb[t] > MAX_THEORIE_PAR_TESTEUR) ? `<p class="erreur">Plus de ${MAX_THEORIE_PAR_TESTEUR} candidats pour un testeur (limite théorie).</p>` : '');
    $$('#rep-corps select').forEach(sel => sel.onchange = () => { aff[sel.dataset.st] = sel.value; dessiner(); });
  };
  ouvrirModale('👥 Répartition des stagiaires entre testeurs', `
    <div class="carte" id="rep-mode"><b>Mode de répartition (au choix) :</b>
      <label class="case"><input type="radio" name="rep-mode" value="libre"> Libre — aucune affectation, chaque testeur de la session évalue qui il veut</label>
      <label class="case"><input type="radio" name="rep-mode" value="stagiaire"> Par stagiaire (les personnes)</label>
      <label class="case"><input type="radio" name="rep-mode" value="categorie"> Par catégorie (ex. un testeur prend toutes les cat. 5)</label>
      <label class="case"><input type="radio" name="rep-mode" value="les-deux"> Les deux (catégorie prioritaire, puis stagiaire)</label></div>
    <div id="rep-bloc-cat"><h4>Par catégorie</h4>
    <p class="aide">Un testeur prend une catégorie pour TOUS les stagiaires (ex. toutes les cat. 5). Priorité : catégorie > stagiaire > testeur principal. Un autre testeur ne pourra plus évaluer cette catégorie (l'administrateur le peut toujours).</p>
    <div id="rep-cat-charge"></div>
    <table class="tableau"><thead><tr><th>Catégorie</th><th>Effectif</th><th>Testeur</th></tr></thead><tbody id="rep-cat"></tbody></table>
    <div class="barre-actions"><button id="rep-cat-auto">⚖ Répartir les catégories automatiquement</button><button id="rep-cat-raz">Aucune affectation</button></div>
    </div>
    <div id="rep-bloc-st"><h4>Par stagiaire</h4>
    <p class="aide">« Par défaut » = le premier testeur autorisé de la session. Le formateur d'un stagiaire ne peut pas être son testeur (sauf cumul autorisé).</p>
    <div id="rep-compte"></div>
    <table class="tableau"><thead><tr><th>Stagiaire</th><th>Groupe</th><th>Testeur</th></tr></thead><tbody id="rep-corps"></tbody></table>
    <div class="barre-actions"><button id="rep-auto">⚖ Répartition automatique</button><button id="rep-raz">Tout par défaut</button></div></div>
    <div class="barre-actions"><button class="principal" id="rep-ok">Enregistrer</button></div>`, { large: true });
  // Mode initial déduit de ce qui existe déjà
  const aCat = Object.values(affCat).some(Boolean), aSt = Object.values(aff).some(Boolean);
  let mode = aCat && aSt ? 'les-deux' : aCat ? 'categorie' : aSt ? 'stagiaire' : 'libre';
  const majMode = () => {
    $$('input[name=rep-mode]').forEach(r => { r.checked = r.value === mode; });
    $('#rep-bloc-cat').hidden = !(mode === 'categorie' || mode === 'les-deux');
    $('#rep-bloc-st').hidden = !(mode === 'stagiaire' || mode === 'les-deux');
  };
  $$('input[name=rep-mode]').forEach(r => r.onchange = () => { mode = r.value; majMode(); });
  majMode();
  dessiner(); dessinerCat();
  $('#rep-cat-auto').onclick = () => {   // glouton : plus grosses catégories d'abord, vers le testeur le moins chargé
    const charge = Object.fromEntries(ids.map(t => [t, 0]));
    cles.slice().sort((a, b) => effectifCat[b] - effectifCat[a]).forEach(k => {
      const t = ids.slice().sort((a, b) => charge[a] - charge[b])[0]; affCat[k] = t; charge[t] += effectifCat[k];
    });
    dessinerCat();
  };
  $('#rep-cat-raz').onclick = () => { cles.forEach(k => affCat[k] = ''); dessinerCat(); };
  $('#rep-auto').onclick = () => {
    const nb = Object.fromEntries(ids.map(t => [t, 0]));
    (stags || []).forEach(st => {
      const ok = ids.filter(t => peut(t, st)).sort((a, b) => nb[a] - nb[b]);
      if (ok.length) { aff[st.id] = ok[0]; nb[ok[0]]++; } else aff[st.id] = '';
    });
    dessiner();
  };
  $('#rep-raz').onclick = () => { Object.keys(aff).forEach(k => aff[k] = ''); dessiner(); };
  $('#rep-ok').onclick = async () => {
    if (mode === 'libre' || mode === 'stagiaire') cles.forEach(k => affCat[k] = '');          // catégories non utilisées
    if (mode === 'libre' || mode === 'categorie') Object.keys(aff).forEach(k => aff[k] = ''); // stagiaires non utilisés
    for (const st of stags || []) {
      const v = aff[st.id] || null;
      if (v === (st.testeur_id || null)) continue;
      const { error: e } = await sb.from('stagiaires').update({ testeur_id: v }).eq('id', st.id);
      if (e) return erreurSupabase('Enregistrement de la répartition', e);
    }
    const anciennes = Object.fromEntries((regles || []).map(r => [r.referentiel_code + '|' + r.categorie_code, r.testeur_id]));
    for (const k of new Set([...cles, ...Object.keys(anciennes)])) {
      const [ref, cat] = k.split('|'), v = affCat[k] || '';
      if ((anciennes[k] || '') === v) continue;
      const q = v ? sb.from('session_testeur_categories').upsert({ session_id: s.id, referentiel_code: ref, categorie_code: cat, testeur_id: v })
        : sb.from('session_testeur_categories').delete().eq('session_id', s.id).eq('referentiel_code', ref).eq('categorie_code', cat);
      const { error: e2 } = await q; if (e2) return erreurSupabase('Enregistrement des catégories', e2);
    }
    await chargerRegleCategories(s);
    fermerModale(); toast('Répartition enregistrée');
  };
}

/* Règles « catégorie → testeur » de la session (chargées à l'ouverture de la session). */
async function chargerRegleCategories(s = S.session) {
  const { data } = await sb.from('session_testeur_categories').select('referentiel_code, categorie_code, testeur_id').eq('session_id', s.id);
  s._repartCat = Object.fromEntries((data || []).map(r => [r.referentiel_code + '|' + r.categorie_code, r.testeur_id]));
}
/** Testeur à qui la catégorie est affectée (null = libre). */
const testeurDeCategorie = (ref, cat, s = S.session) => (s?._repartCat || {})[ref + '|' + cat] || null;
