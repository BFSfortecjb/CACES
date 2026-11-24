/* =====================================================================
   CA_galaxy_synchro.js — synchronisation Galaxy → appli (jamais l'inverse) des stagiaires d'une session.
   Règles : Galaxy est la référence pour l'identité et les inscriptions ; un nom/prénom CORRIGÉ dans l'appli (pour le carton) est conservé :
   on le reconnaît car il diffère de ce que Galaxy avait la dernière fois (colonnes galaxy_nom / galaxy_prenom). Aucun résultat n'est touché,
   aucun stagiaire n'est supprimé (les annulés/absents de Galaxy sont seulement signalés). Interdit après clôture.
   ===================================================================== */
async function inscritsSynchroGalaxy(f) {
  try {
    const rep = await galaxy('get_sta_ins', { search: { convention_element_id: f.formation_id || f.id } }, 1, 400);
    const l = rep.result || [];
    if (l.length) return l.map(x => ({ galaxy_id: String(x.stagiaire_id), nom: String(x.nom || '').trim(), prenom: String(x.prenom || '').trim(),
      annule: String(x.annule) === '1', categories: categoriesGalaxy(x.categorie_suivi) }));
  } catch (_e) { /* repli ci-dessous */ }
  return (await inscritsGalaxy(f)).map(i => ({ ...i, annule: false }));
}

/** Présences Galaxy d'une formation : { galaxy_stagiaire_id: { 'AAAA-MM-JJ': [matin, après-midi] } } (true = présent).
 *  Une ligne Galaxy par demi-journée (dans l'ordre : matin puis après-midi) ; présent = temps réalisé > 00:00 ou signature. Une seule ligne = journée entière. */
async function presencesSynchroGalaxy(formationId) {
  const sortie = {};
  for (let page = 1; page <= 10; page++) {
    const rep = await galaxy('get_presence', { search: { convention_element_id: formationId } }, page, 400);
    const l = rep.result || [];
    l.forEach(x => {
      const g = String(x.id || ''), jour = String(x.date_formation || '').slice(0, 10); if (!g || !jour) return;
      const present = (String(x.realise || '00:00:00') !== '00:00:00') || !!(x.date_signature || x.date_signature_apres_midi);
      ((sortie[g] = sortie[g] || {})[jour] = sortie[g][jour] || []).push(present);
    });
    if (l.length < 400) break;
  }
  Object.values(sortie).forEach(j => Object.keys(j).forEach(d => { const a = j[d]; j[d] = a.length === 1 ? [a[0], a[0]] : [a[0], a[1]]; }));
  return sortie;
}

/** Intervenants de la formation (Galaxy) rapprochés des comptes de l'appli par nom + prénom (ou e-mail).
 *  Renvoie { lignes: [{nom, role, compte|null}], } ; rôle « testeur » si le rôle Galaxy contient « test », sinon « formateur ». */
async function intervenantsSynchroGalaxy(formationId) {
  const rep = await galaxy('get_formations', { search: { formation_id: formationId }, avec_liste_des_formateur: 1 }, 1, 5);
  const liste = ((rep.result || [])[0] || {}).liste_formateur || [];
  const norm = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
  return liste.map(i => {
    const cle = norm(i.nom) + '|' + norm(i.prenom);
    const trouves = (S.formateurs || []).filter(f => norm(f.nom) + '|' + norm(f.prenom) === cle || norm(f.prenom) + '|' + norm(f.nom) === cle);
    const compte = trouves.length === 1 ? trouves[0] : null;      // homonymes : jamais de rapprochement automatique
    return { nom: `${i.nom || ''} ${i.prenom || ''}`.trim(), role: /test/i.test(`${i.nom_role || ''} ${i.role || ''}`) ? 'testeur' : 'formateur', compte };
  });
}

async function ouvrirSynchroGalaxy() {
  const s = S.session;
  if (s.statut === 'cloturee' || s.cloturee) return toast('Session clôturée : synchronisation impossible.', 'erreur');
  if (!s.numero_session_galaxy) return toast('Renseigne d\'abord le n° de session Galaxy.', 'erreur');
  ouvrirModale('Synchroniser depuis Galaxy', '<p class="chargement">Lecture de Galaxy…</p>');
  try {
    const form = await formationGalaxy(s.numero_session_galaxy);
    if (!form) { fermerModale(); return toast('Aucune formation avec ce numéro dans Galaxy.', 'erreur', 6000); }
    const [gal, { data: apps }] = await Promise.all([inscritsSynchroGalaxy(form),
      sb.from('stagiaires').select('id, nom, prenom, galaxy_stagiaire_id, galaxy_nom, galaxy_prenom').eq('session_id', s.id).order('nom')]);
    const U = x => String(x || '').trim().toUpperCase(), P = x => String(x || '').trim();
    const parGal = new Map(gal.map(g => [g.galaxy_id, g]));
    const lignes = [];
    for (const a of (apps || []).filter(x => x.galaxy_stagiaire_id)) {
      const g = parGal.get(a.galaxy_stagiaire_id);
      if (!g || g.annule) { lignes.push({ type: 'absent', a, txt: g ? 'Inscription annulée dans Galaxy' : 'Plus inscrit dans Galaxy' }); continue; }
      const derN = a.galaxy_nom ?? a.nom, derP = a.galaxy_prenom ?? a.prenom;
      const corrige = U(a.nom) !== U(derN) || P(a.prenom) !== P(derP);          // corrigé dans l'appli
      const gChange = U(g.nom) !== U(derN) || P(g.prenom) !== P(derP);          // modifié dans Galaxy depuis la dernière fois
      const identique = U(g.nom) === U(a.nom) && P(g.prenom) === P(a.prenom);
      if (identique) { if (gChange) lignes.push({ type: 'maj_ref', a, g }); continue; }                       // même valeur : on met juste la référence à jour
      if (!corrige) lignes.push({ type: 'maj', a, g });                                                      // Galaxy a changé, appli intacte
      else if (!gChange) lignes.push({ type: 'garde', a, g });                                               // correction locale conservée
      else lignes.push({ type: 'conflit', a, g });                                                           // les deux ont changé
    }
    // Catégories : on AJOUTE celles de Galaxy qui manquent dans l'appli (jamais de retrait ; les résultats ne sont pas touchés).
    const refGx = referentielGalaxy(form.nom_produit), catsConnues = new Set((S.referentiel.categories || []).map(c => c.referentiel_code + '|' + c.code));
    const [{ data: catsApp }, { data: catsSess }] = await Promise.all([
      (apps || []).length ? sb.from('stagiaire_categories').select('stagiaire_id, referentiel_code, categorie_code').in('stagiaire_id', (apps || []).map(a => a.id)) : { data: [] },
      sb.from('session_categories').select('referentiel_code, categorie_code').eq('session_id', s.id)]);
    const dejaCat = new Set((catsApp || []).map(c => `${c.stagiaire_id}|${c.referentiel_code}|${c.categorie_code}`));
    const sessCat = new Set((catsSess || []).map(c => c.referentiel_code + '|' + c.categorie_code));
    const catsAjout = [];
    if (refGx && !/autorisation/i.test(form.nom_produit || '')) {
      (apps || []).filter(a => a.galaxy_stagiaire_id).forEach(a => {
        const g = parGal.get(a.galaxy_stagiaire_id); if (!g || g.annule) return;
        const manque = [...new Set((g.categories || []).map(k => cleCategorieGalaxy(refGx, k)))].filter(c => catsConnues.has(c) && !dejaCat.has(a.id + '|' + c));
        if (manque.length) catsAjout.push({ a, cles: manque });
      });
    }
    let interv = [], intervErr = null;
    try { interv = await intervenantsSynchroGalaxy(form.formation_id || s.numero_session_galaxy); } catch (e) { intervErr = e.message; }
    const testeursApp = new Set(testeursSession(s)), intervAjout = interv.filter(i => i.compte && i.role === 'testeur' && !testeursApp.has(i.compte.id));
    const formAChanger = interv.filter(i => i.compte && i.role === 'formateur' && i.compte.id !== s.formateur_id);
    const intervInconnus = interv.filter(i => !i.compte);
    const testeursGalaxy = new Set(interv.filter(i => i.compte && i.role === 'testeur').map(i => i.compte.id));
    const testeursAbsents = [...testeursApp].filter(id => interv.length && !testeursGalaxy.has(id));
    let presGal = {}, presErr = null;
    try { presGal = await presencesSynchroGalaxy(form.formation_id || s.numero_session_galaxy); } catch (e) { presErr = e.message; }
    const idsApp = (apps || []).map(a => a.id);
    const [{ data: presApp }, { data: jours }] = await Promise.all([
      idsApp.length ? sb.from('presences_stagiaires').select('stagiaire_id, jour, demi').in('stagiaire_id', idsApp) : { data: [] },
      sb.from('session_jours').select('jour').eq('session_id', s.id)]);
    const joursSession = new Set((jours || []).map(j => j.jour)), dejaApp = new Set((presApp || []).map(p => `${p.stagiaire_id}|${p.jour}|${p.demi}`));
    const presAjout = [], presRetrait = [], presHorsPlanning = new Set();
    (apps || []).filter(a => a.galaxy_stagiaire_id && presGal[a.galaxy_stagiaire_id]).forEach(a => {
      Object.entries(presGal[a.galaxy_stagiaire_id]).forEach(([jour, [m, ap]]) => {
        if (!joursSession.has(jour)) { presHorsPlanning.add(jour); return; }
        [['matin', m], ['apres_midi', ap]].forEach(([demi, pr]) => {
          const cle = `${a.id}|${jour}|${demi}`, ici = dejaApp.has(cle);
          if (pr && !ici) presAjout.push({ a, jour, demi }); else if (!pr && ici) presRetrait.push({ a, jour, demi });
        });
      });
    });
    const connus = new Set((apps || []).map(a => a.galaxy_stagiaire_id));
    const nouveaux = gal.filter(g => !g.annule && !connus.has(g.galaxy_id));
    const aTraiter = lignes.filter(l => l.type === 'maj' || l.type === 'conflit' || l.type === 'maj_ref');
    const ligneHtml = (l, i) => {
      const lib = { maj: '<span class="etat avertissement">Modifié dans Galaxy</span>', conflit: '<span class="etat ko">Modifié des deux côtés</span>',
        garde: '<span class="etat ok">Corrigé dans l\'appli (conservé)</span>', maj_ref: '<span class="etat neutre">Déjà identique</span>', absent: `<span class="etat ko">${esc(l.txt || '')}</span>` }[l.type];
      const act = l.type === 'maj' ? `<label class="case"><input type="checkbox" data-i="${i}" checked> Prendre Galaxy</label>`
        : l.type === 'conflit' ? `<label class="case"><input type="checkbox" data-i="${i}"> Prendre Galaxy (sinon on garde l'appli)</label>` : '';
      return `<tr><td>${esc(l.a.nom)} ${esc(l.a.prenom)}</td><td>${l.g ? esc(l.g.nom + ' ' + l.g.prenom) : '—'}</td><td>${lib}</td><td>${act}</td></tr>`;
    };
    const nbPres = presAjout.length + presRetrait.length;
    const rien = !lignes.some(l => l.type !== 'maj_ref') && !nouveaux.length && !nbPres && !intervAjout.length && !formAChanger.length && !catsAjout.length;
    ouvrirModale(`Synchroniser depuis Galaxy — ${esc(form.nom_produit || '')}`, `
      <p class="aide">Galaxy → appli uniquement. Un nom corrigé dans l'appli est conservé tant que tu ne choisis pas de reprendre celui de Galaxy. Aucun résultat n'est modifié, aucun stagiaire supprimé.</p>
      ${rien ? '<p>✔ Tout est à jour : rien à synchroniser.</p>' : `
      <table class="tableau"><thead><tr><th>Appli</th><th>Galaxy</th><th>État</th><th></th></tr></thead><tbody>
        ${lignes.filter(l => l.type !== 'maj_ref').map((l) => ligneHtml(l, lignes.indexOf(l))).join('')}
        ${nouveaux.map(g => `<tr><td>—</td><td>${esc(g.nom + ' ' + g.prenom)}</td><td><span class="etat avertissement">Nouvel inscrit Galaxy</span></td>
          <td><label class="case"><input type="checkbox" data-nv="${esc(g.galaxy_id)}" checked> Ajouter</label></td></tr>`).join('')}
      </tbody></table>`}
      ${catsAjout.length ? `<h4>Catégories</h4>${catsAjout.map((x, k) => `<p><label class="case"><input type="checkbox" data-ca="${k}" checked>
        Ajouter à <b>${esc(x.a.nom)} ${esc(x.a.prenom)}</b> : ${x.cles.map(c => `<span class="etat avertissement">${esc(c.replace('|', ' '))}</span>`).join(' ')}
        ${x.cles.some(c => !sessCat.has(c)) ? '<span class="aide">(catégorie ajoutée aussi à la session)</span>' : ''}</label></p>`).join('')}` : ''}
      <h4>Intervenants (Galaxy)</h4>
      ${intervErr ? `<p class="aide"><b>Lecture des intervenants impossible</b> (${esc(intervErr)}).</p>` : `
      <p class="aide">Galaxy : ${interv.map(i => `${esc(i.nom)} (${i.role})${i.compte ? '' : ' — <b>pas de compte dans l\'appli</b>'}`).join(' ; ') || 'aucun intervenant'}.</p>
      ${intervAjout.map((i, k) => `<p><label class="case"><input type="checkbox" data-ta="${k}" checked> Ajouter <b>${esc(i.nom)}</b> comme testeur de la session</label></p>`).join('')}
      ${formAChanger.map((i, k) => `<p><label class="case"><input type="checkbox" data-fo="${k}"> Remplacer le formateur de la session par <b>${esc(i.nom)}</b> (actuel : ${esc(nomFormateur(s.formateur_id)) || '—'})</label></p>`).join('')}
      ${testeursAbsents.length ? `<p class="aide">Testeur(s) de l'appli absent(s) de Galaxy (conservé(s)) : ${testeursAbsents.map(id => esc(nomFormateur(id))).join(', ')}.</p>` : ''}
      ${intervInconnus.length ? `<p class="aide">Sans compte BFS CACES : ${intervInconnus.map(i => esc(i.nom)).join(', ')} — à créer par l'administrateur si besoin.</p>` : ''}`}
      ${presErr ? `<p class="aide"><b>Présences : lecture Galaxy impossible</b> (${esc(presErr)}).</p>` : (nbPres ? `
      <p><label class="case"><input type="checkbox" id="sy-pres" checked> <b>Présences</b> : ${presAjout.length} demi-journée(s) à cocher, ${presRetrait.length} à décocher d'après Galaxy</label></p>
      <p class="aide">${[...new Set([...presAjout, ...presRetrait].map(x => `${esc(x.a.nom)} ${esc(x.a.prenom)} (${esc(dateFr(x.jour))})`))].slice(0, 12).join(' ; ')}${nbPres > 12 ? '…' : ''}</p>` : '<p class="aide">Présences : identiques à Galaxy.</p>')}
      ${presHorsPlanning.size ? `<p class="aide">Jours présents dans Galaxy mais absents du planning de l'appli (ignorés) : ${[...presHorsPlanning].map(j => esc(dateFr(j))).join(', ')}.</p>` : ''}
      <div class="pied-modale"><button type="button" onclick="fermerModale()">Fermer</button>
        <button class="principal" id="btn-synchro-galaxy" ${rien && !aTraiter.length ? 'disabled' : ''}>Appliquer la sélection</button></div>
      <p id="msg-synchro" class="aide"></p>`);
    $('#btn-synchro-galaxy')?.addEventListener('click', async () => {
      const msg = $('#msg-synchro'); $('#btn-synchro-galaxy').disabled = true; let n = 0;
      try {
        for (const l of lignes.filter(x => x.type === 'maj_ref')) {                       // références à jour, sans changer l'appli
          await sb.from('stagiaires').update({ galaxy_nom: U(l.g.nom), galaxy_prenom: P(l.g.prenom) }).eq('id', l.a.id);
        }
        for (const c of $$('input[data-i]')) {
          const l = lignes[Number(c.dataset.i)], maj = { galaxy_nom: U(l.g.nom), galaxy_prenom: P(l.g.prenom) };   // la référence Galaxy avance dans tous les cas
          if (c.checked) { maj.nom = U(l.g.nom); maj.prenom = P(l.g.prenom); n++; }
          const { error } = await sb.from('stagiaires').update(maj).eq('id', l.a.id); if (error) throw error;
        }
        for (const c of $$('input[data-ca]:checked')) {
          const x = catsAjout[Number(c.dataset.ca)];
          const nouvCS = x.cles.filter(k => !sessCat.has(k)).map(k => { const [referentiel_code, categorie_code] = k.split('|'); return { session_id: s.id, referentiel_code, categorie_code }; });
          if (nouvCS.length) { const { error } = await sb.from('session_categories').insert(nouvCS); if (error) throw error; nouvCS.forEach(r => sessCat.add(r.referentiel_code + '|' + r.categorie_code)); }
          const lignesSC = x.cles.map(k => { const [referentiel_code, categorie_code] = k.split('|'); return { stagiaire_id: x.a.id, referentiel_code, categorie_code }; });
          const { error } = await sb.from('stagiaire_categories').insert(lignesSC); if (error) throw error; n += lignesSC.length;
        }
        for (const c of $$('input[data-ta]:checked')) {
          const i = intervAjout[Number(c.dataset.ta)];
          const r = !s.testeur_id ? await sb.from('sessions_formation').update({ testeur_id: i.compte.id }).eq('id', s.id)
            : await sb.from('session_testeurs').insert({ session_id: s.id, testeur_id: i.compte.id });
          if (r.error) throw r.error; n++;
        }
        for (const c of $$('input[data-fo]:checked')) {
          const { error } = await sb.from('sessions_formation').update({ formateur_id: formAChanger[Number(c.dataset.fo)].compte.id }).eq('id', s.id); if (error) throw error; n++;
        }
        if ($('#sy-pres')?.checked) {
          for (const x of presRetrait) { const { error } = await sb.from('presences_stagiaires').delete().match({ stagiaire_id: x.a.id, jour: x.jour, demi: x.demi }); if (error) throw error; }
          if (presAjout.length) { const { error } = await sb.from('presences_stagiaires').upsert(presAjout.map(x => ({ stagiaire_id: x.a.id, jour: x.jour, demi: x.demi }))); if (error) throw error; }
          n += presAjout.length + presRetrait.length;
        }
        const catsConnues = new Set((S.referentiel.categories || []).map(c => c.referentiel_code + '|' + c.code)), ref = referentielGalaxy(form.nom_produit);
        for (const c of $$('input[data-nv]:checked')) {
          const g = gal.find(x => x.galaxy_id === c.dataset.nv); if (!g) continue;
          const { data, error } = await sb.from('stagiaires').insert({ session_id: s.id, nom: U(g.nom), prenom: P(g.prenom), galaxy_stagiaire_id: g.galaxy_id,
            galaxy_nom: U(g.nom), galaxy_prenom: P(g.prenom), code_acces_individuel: codeIndividuel() }).select().single();
          if (error) throw error;
          const ch = (g.categories || []).map(k => cleCategorieGalaxy(ref, k)).filter(k => catsConnues.has(k)).map(k => { const [referentiel_code, categorie_code] = k.split('|'); return { referentiel_code, categorie_code }; });
          await synchroniserCategoriesStagiaire(data.id, ch.length ? ch : (s._categories || [])); n++;
        }
        fermerModale(); toast(`Synchronisation : ${n} changement(s) appliqué(s)`); rendreDetailSession($('#contenu'));
      } catch (e) { msg.textContent = ''; $('#btn-synchro-galaxy').disabled = false; erreurSupabase('Synchronisation Galaxy', e); }
    });
  } catch (e) { fermerModale(); erreurSupabase('Lecture Galaxy', e); }
}

/** À appeler quand un nom/prénom est corrigé à la main : rien à faire (la différence avec galaxy_nom suffit à le protéger). */
