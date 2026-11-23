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
    const rien = !lignes.some(l => l.type !== 'maj_ref') && !nouveaux.length;
    ouvrirModale(`Synchroniser depuis Galaxy — ${esc(form.nom_produit || '')}`, `
      <p class="aide">Galaxy → appli uniquement. Un nom corrigé dans l'appli est conservé tant que tu ne choisis pas de reprendre celui de Galaxy. Aucun résultat n'est modifié, aucun stagiaire supprimé.</p>
      ${rien ? '<p>✔ Tout est à jour : rien à synchroniser.</p>' : `
      <table class="tableau"><thead><tr><th>Appli</th><th>Galaxy</th><th>État</th><th></th></tr></thead><tbody>
        ${lignes.filter(l => l.type !== 'maj_ref').map((l) => ligneHtml(l, lignes.indexOf(l))).join('')}
        ${nouveaux.map(g => `<tr><td>—</td><td>${esc(g.nom + ' ' + g.prenom)}</td><td><span class="etat avertissement">Nouvel inscrit Galaxy</span></td>
          <td><label class="case"><input type="checkbox" data-nv="${esc(g.galaxy_id)}" checked> Ajouter</label></td></tr>`).join('')}
      </tbody></table>`}
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
        const catsConnues = new Set((S.referentiel.categories || []).map(c => c.referentiel_code + '|' + c.code)), ref = referentielGalaxy(form.nom_produit);
        for (const c of $$('input[data-nv]:checked')) {
          const g = gal.find(x => x.galaxy_id === c.dataset.nv); if (!g) continue;
          const { data, error } = await sb.from('stagiaires').insert({ session_id: s.id, nom: U(g.nom), prenom: P(g.prenom), galaxy_stagiaire_id: g.galaxy_id,
            galaxy_nom: U(g.nom), galaxy_prenom: P(g.prenom), code_acces_individuel: codeIndividuel() }).select().single();
          if (error) throw error;
          const ch = (g.categories || []).map(k => ref + '|' + k).filter(k => catsConnues.has(k)).map(k => { const [referentiel_code, categorie_code] = k.split('|'); return { referentiel_code, categorie_code }; });
          await synchroniserCategoriesStagiaire(data.id, ch.length ? ch : (s._categories || [])); n++;
        }
        fermerModale(); toast(`Synchronisation : ${n} changement(s) appliqué(s)`); rendreDetailSession($('#contenu'));
      } catch (e) { msg.textContent = ''; $('#btn-synchro-galaxy').disabled = false; erreurSupabase('Synchronisation Galaxy', e); }
    });
  } catch (e) { fermerModale(); erreurSupabase('Lecture Galaxy', e); }
}

/** À appeler quand un nom/prénom est corrigé à la main : rien à faire (la différence avec galaxy_nom suffit à le protéger). */
