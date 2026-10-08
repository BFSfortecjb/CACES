/* =====================================================================
   CA_planning.js — planning d'une session sur plusieurs jours :
   - jours de formation : saisis par le formateur
   - jours de test : définis par le testeur
   - répartition des épreuves (théorie par référentiel, pratique par
     catégorie) de chaque stagiaire sur les jours de test, avec la charge
     prévue (UT) du testeur jour par jour.
   Le contrôle bloquant reste celui de la base, sur la date réelle de l'épreuve.
   ===================================================================== */
async function joursSession(sessionId) {
  const { data } = await sb.from('session_jours').select('jour, type').eq('session_id', sessionId).order('jour');
  const r = { formation: [], test: [] };
  (data || []).forEach(j => r[j.type].push(j.jour));
  return r;
}

async function chargePrevueJour(testeurId, jour) {
  const [prm, p, r] = await Promise.all([
    sb.from('parametres_application').select('quota_ut_jour, quota_ut_pratique_jour').eq('id', 1).single(),
    sb.rpc('caces_charge_prevue', { p_testeur: testeurId, p_jour: jour }),
    sb.rpc('caces_charge_testeur', { p_testeur: testeurId, p_jour: jour }),
  ]);
  const quota = Number(prm.data?.quota_ut_jour ?? 7), quotaPrat = Number(prm.data?.quota_ut_pratique_jour ?? 6);
  const tot = Number(p.data?.[0]?.ut_total || 0), prat = Number(p.data?.[0]?.ut_pratique || 0);
  return { quota, quotaPrat, tot, prat, reel: Number(r.data?.[0]?.ut_total || 0), depasse: tot > quota || prat > quotaPrat };
}

async function ouvrirPlanning() {
  const s = S.session, d = droitsSession(s), cloturee = s.statut === 'cloturee';
  const jours = await joursSession(s.id);
  const { data: stags } = await sb.from('stagiaires')
    .select('id, nom, prenom, groupe_id, stagiaire_categories(referentiel_code, categorie_code, theorie_validee, pratique_validee)')
    .eq('session_id', s.id).order('nom');
  const { data: plan } = await sb.from('planning_tests').select('*')
    .in('stagiaire_id', (stags || []).map(x => x.id).concat(['00000000-0000-0000-0000-000000000000']));
  const stagParId = Object.fromEntries((stags || []).map(x => [x.id, x]));
  const cle = (id, ref, cat, ep) => `${id}|${ref}|${cat}|${ep}`;
  const choix = {}; (plan || []).forEach(p => { choix[cle(p.stagiaire_id, p.referentiel_code, p.categorie_code, p.epreuve)] = p.jour; });

  const chips = (liste, type, peut) => liste.map(j => `<span class="puce">${esc(dateFr(j))}
      ${peut ? `<button class="icone" title="Retirer ce jour" onclick="retirerJourSession('${type}','${j}')">✕</button>` : ''}</span>`).join(' ')
      || '<i>aucun</i>';
  const ajout = (type, peut) => peut ? `<input type="date" id="nouveau-jour-${type}">
      <button onclick="ajouterJourSession('${type}')">+ Ajouter</button>` : '';

  const optionsJours = valeur => `<option value="">— jour de début —</option>` +
    jours.test.map(j => `<option value="${j}" ${valeur === j ? 'selected' : ''}>${esc(dateFr(j))}</option>`).join('');
  const sel = (id, ref, cat, ep) => `<select ${peutTesterStagiaire(stagParId[id]) && !cloturee ? '' : 'disabled'}
      onchange="planifierEpreuve('${id}','${ref}','${cat}','${ep}',this.value)">${optionsJours(choix[cle(id, ref, cat, ep)])}</select>`;

  const lignes = (stags || []).map(st => {
    const cats = st.stagiaire_categories || [], refs = [...new Set(cats.map(c => c.referentiel_code))];
    const th = refs.map(r => cats.filter(c => c.referentiel_code === r).every(c => c.theorie_validee === true)
      ? `${esc(r)} : <i>validée</i>` : `${esc(r)} ${sel(st.id, r, '', 'theorie')}`).join('<br>');
    const pr = cats.map(c => c.pratique_validee === true ? `${esc(c.categorie_code)} : <i>validée</i>`
      : `${esc(c.categorie_code)} ${sel(st.id, c.referentiel_code, c.categorie_code, 'pratique')}`).join('<br>');
    return `<tr><td>${esc(st.nom)} ${esc(st.prenom)}</td><td>${th}</td><td>${pr}</td></tr>`;
  }).join('');

  ouvrirModale('📅 Planning de la session', `
    <p class="aide">Le formateur saisit les jours de formation ; le testeur choisit ses jours de test puis répartit les épreuves
      de chaque stagiaire pour respecter la limite d'UT par jour.</p>
    <div class="carte"><b>Jours de formation</b> ${d.formateur && !cloturee ? '(formateur)' : ''}<br>
      ${chips(jours.formation, 'formation', d.formateur && !cloturee)} ${ajout('formation', d.formateur && !cloturee)}</div>
    <div class="carte"><b>Jours de test</b> ${d.testeur && !cloturee ? '(testeur)' : ''}<br>
      ${chips(jours.test, 'test', d.testeur && !cloturee)} ${ajout('test', d.testeur && !cloturee)}
      <div id="charge-jours"></div></div>
    ${jours.test.length ? `<table class="tableau"><thead><tr><th>Stagiaire</th><th>Théorie (QCM)</th><th>Pratique</th></tr></thead>
      <tbody>${lignes || '<tr><td colspan="3" class="vide">Aucun stagiaire.</td></tr>'}</tbody></table>`
      : '<p class="aide">Ajoute au moins un jour de test pour répartir les épreuves.</p>'}`, { large: true });
  if (testeursSession(s).length) afficherChargeJours(s, jours.test.length ? jours.test : [s.date_debut].filter(Boolean));
}

async function afficherChargeJours(s, liste) {
  const zone = $('#charge-jours'); if (!zone) return;
  const testeurs = testeursSession(s);
  const resT = await Promise.all(testeurs.map(t => Promise.all(liste.map(j => chargePrevueJour(t, j)))));
  zone.innerHTML = '<table class="tableau"><thead><tr><th>Jour</th><th>Charge prévue du testeur</th><th>Réalisé</th></tr></thead><tbody>' +
    testeurs.map((t, k) => liste.map((j, i) => { const c = resT[k][i]; return `<tr><td>${testeurs.length > 1 ? esc(nomFormateur(t)) + ' — ' : ''}${esc(dateFr(j))}</td>
      <td><span class="etat ${c.depasse ? 'erreur' : ''}">${c.tot.toFixed(2)} / ${c.quota} UT</span>
        <span class="aide">dont ${c.prat.toFixed(2)} / ${c.quotaPrat} pratique</span>${c.depasse ? ' ⚠ trop chargé' : ''}</td>
      <td>${c.reel.toFixed(2)} UT</td></tr>`; }).join('')).join('') + '</tbody></table>';
}

async function ajouterJourSession(type) {
  const v = $('#nouveau-jour-' + type).value;
  if (!v) return toast('Choisis une date.', 'erreur');
  const { error } = await sb.from('session_jours').upsert({ session_id: S.session.id, jour: v, type });
  if (error) return erreurSupabase('Ajout du jour', error);
  ouvrirPlanning();
}

async function retirerJourSession(type, jour) {
  if (!confirmer('Retirer le ' + dateFr(jour) + ' ?')) return;
  const { error } = await sb.from('session_jours').delete().eq('session_id', S.session.id).eq('jour', jour).eq('type', type);
  if (error) return erreurSupabase('Retrait du jour', error);
  if (type === 'test') {            // les épreuves planifiées ce jour-là repassent sur « jour de début »
    const { data: stags } = await sb.from('stagiaires').select('id').eq('session_id', S.session.id);
    await sb.from('planning_tests').delete().eq('jour', jour).in('stagiaire_id', (stags || []).map(x => x.id));
  }
  ouvrirPlanning();
}

async function planifierEpreuve(stagiaireId, ref, cat, epreuve, jour) {
  const cle = { stagiaire_id: stagiaireId, referentiel_code: ref, categorie_code: cat, epreuve };
  const { error } = jour ? await sb.from('planning_tests').upsert({ ...cle, jour })
    : await sb.from('planning_tests').delete().match(cle);
  if (error) return erreurSupabase('Planification', error);
  const jours = await joursSession(S.session.id);
  if (testeursSession(S.session).length) afficherChargeJours(S.session, jours.test.length ? jours.test : [S.session.date_debut].filter(Boolean));
}
