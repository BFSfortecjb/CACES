/* =====================================================================
   CA_horometre.js — suivi horomètre (temps de conduite en formation)
   Relevé par le FORMATEUR de la session. Un stagiaire peut avoir PLUSIEURS
   séances de conduite dans la même journée : aucune contrainte d'unicité par
   date en base ; l'écran regroupe par jour avec sous-total et cumul total.
   (L'horomètre ne figure pas sur la FISE papier : écran distinct.)
   ===================================================================== */

async function ouvrirHorometre(stagiaireId) {
  const { data: st, error } = await sb.from('stagiaires')
    .select('id, nom, prenom, session_id, stagiaire_categories(referentiel_code, categorie_code)')
    .eq('id', stagiaireId).single();
  if (error) return erreurSupabase('Lecture du stagiaire', error);
  ouvrirModale(`Suivi horomètre — ${st.nom} ${st.prenom}`, '<div id="horo-contenu"></div>');
  afficherHorometre(st);
}

const heures = v => (v === null || v === undefined) ? '—' : Number(v).toFixed(2) + ' h';

async function afficherHorometre(st) {
  const zone = $('#horo-contenu');
  zone.innerHTML = '<p class="chargement">Chargement…</p>';
  const { data, error } = await sb.from('suivi_horometre')
    .select('id, engin_libelle, referentiel_code, categorie_code, date_seance, releve_debut, releve_fin, duree_heures, observations')
    .eq('stagiaire_id', st.id).order('date_seance', { ascending: false }).order('id', { ascending: false });
  if (error) return erreurSupabase('Lecture de l\'horomètre', error);
  const releves = data || [];
  // Engins déclarés pour la session (Renseigner les engins) : sélection plutôt que saisie libre
  const { data: liens } = await sb.from('session_engins').select('engins(designation, marque, modele, numero_serie, categories)').eq('session_id', st.session_id);
  const enginsSession = (liens || []).map(l => l.engins).filter(Boolean);
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const parJour = {}; const jours = [];
  releves.forEach(r => { (parJour[r.date_seance] ||= (jours.push(r.date_seance), [])).push(r); });
  const total = releves.reduce((n, r) => n + (Number(r.duree_heures) || 0), 0);

  zone.innerHTML = `
    <form id="form-horo" class="formulaire">
      <div class="grille-2">
        <label>Catégorie <select name="cat"><option value="">—</option>
          ${(st.stagiaire_categories || []).map(c => `<option value="${esc(c.referentiel_code)}|${esc(c.categorie_code)}">
            ${esc(c.referentiel_code)} ${esc(c.categorie_code)}</option>`).join('')}</select></label>
        <label>Engin <select name="engin_choix">
          ${enginsSession.length ? '<option value="">— choisir un engin de la session —</option>' : '<option value="">Aucun engin déclaré dans la session</option>'}
          ${enginsSession.map(e => `<option value="${esc(libelleEngin(e))}" data-cats="${esc((e.categories || []).join(','))}">${esc(libelleEngin(e))}</option>`).join('')}
          <option value="__autre">Autre engin (saisie libre)…</option></select>
          <input name="engin" placeholder="Ex : Pelle CAT 305" hidden style="margin-top:6px"></label>
        <label>Date <input type="date" name="date" value="${aujourdhui}" required></label>
        <label>Observations <input name="obs"></label>
        <label>Relevé début <input type="number" step="0.1" name="debut" required></label>
        <label>Relevé fin <span class="aide">(laisser vide si la séance est en cours)</span> <input type="number" step="0.1" name="fin"></label>
      </div>
      <button class="principal" type="submit">+ Ajouter un relevé</button>
      <span class="aide">Plusieurs relevés possibles le même jour.</span>
    </form>
    ${jours.map(j => {
      const sous = parJour[j].reduce((n, r) => n + (Number(r.duree_heures) || 0), 0);
      return `<h4 class="titre-theme">${esc(dateFr(j))} — ${heures(sous)}</h4>
        <table class="tableau"><thead><tr><th>Engin</th><th>Catégorie</th><th>Début</th><th>Fin</th><th>Durée</th><th>Observations</th><th></th></tr></thead>
        <tbody>${parJour[j].map(r => `<tr><td>${esc(r.engin_libelle) || '—'}</td>
          <td>${r.referentiel_code ? esc(r.referentiel_code + ' ' + (r.categorie_code || '')) : '—'}</td>
          <td>${esc(r.releve_debut ?? '—')}</td><td>${r.releve_fin == null ? '<i>en cours</i>' : esc(r.releve_fin)}</td>
          <td>${r.releve_fin == null ? '—' : heures(r.duree_heures)}</td><td>${esc(r.observations)}</td>
          <td><button class="icone" title="Supprimer ce relevé" data-suppr="${r.id}">🗑</button></td></tr>`).join('')}
        </tbody></table>`;
    }).join('') || '<p class="aide">Aucun relevé pour l\'instant.</p>'}
    <p><b>Total toutes séances : ${heures(total)}</b></p>`;

  const fh = $('#form-horo');
  fh.engin_choix.addEventListener('change', () => { fh.engin.hidden = fh.engin_choix.value !== '__autre'; if (!fh.engin.hidden) fh.engin.focus(); });
  // Choisir une catégorie présélectionne l'engin de la session prévu pour cette catégorie (s'il n'y en a qu'un)
  fh.cat.addEventListener('change', () => {
    if (!fh.cat.value || fh.engin_choix.value) return;
    const [r, c] = fh.cat.value.split('|');
    const ok = [...fh.engin_choix.options].filter(o => o.dataset.cats && o.dataset.cats.split(',').includes(r + ' ' + c));
    if (ok.length === 1) fh.engin_choix.value = ok[0].value;
  });
  $('#form-horo').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    const debut = Number(f.debut.value), fin = f.fin.value === '' ? null : Number(f.fin.value);
    if (fin !== null && fin < debut) return toast('Le relevé de fin doit être supérieur ou égal au début.', 'erreur');
    try {
      await pointerHorometre({ stagiaireId: st.id, sessionId: st.session_id, engin: (f.engin_choix.value === '__autre' ? f.engin.value.trim() : f.engin_choix.value),
        cat: f.cat.value, debut, fin, date: f.date.value, obs: f.obs.value.trim() });
    } catch (e) { return erreurSupabase('Enregistrement du relevé', e); }
    afficherHorometre(st);
  });
  $$('#horo-contenu [data-suppr]').forEach(b => b.addEventListener('click', async () => {
    if (!confirmer('Supprimer ce relevé ?')) return;
    const { error: e } = await sb.from('suivi_horometre').delete().eq('id', Number(b.dataset.suppr));
    if (e) return erreurSupabase('Suppression du relevé', e);
    afficherHorometre(st);
  }));
}


/* =====================================================================
   Pointage au relais : on pointe un stagiaire sur un engin avec le relevé de l'horomètre au moment où
   il monte dessus. Le pointage précédent encore ouvert sur le MÊME engin le MÊME jour est clôturé
   automatiquement avec ce même relevé (c'est l'heure de fin du précédent). En fin de journée, les
   pointages restants se clôturent à la main avec le dernier relevé de chaque engin.
   ===================================================================== */
async function pointerHorometre({ stagiaireId, sessionId, engin, cat, debut, fin, date, obs }) {
  const ferme = [];
  if (engin) {
    const { data: ouverts, error } = await sb.from('suivi_horometre').select('id, stagiaire_id, releve_debut')
      .eq('session_id', sessionId).eq('engin_libelle', engin).eq('date_seance', date).is('releve_fin', null);
    if (error) throw error;
    for (const o of ouverts || []) {
      if (o.releve_debut != null && debut < Number(o.releve_debut)) throw new Error('Ce relevé est inférieur au relevé de début du pointage précédent sur cet engin.');
      const { error: e } = await sb.from('suivi_horometre').update({ releve_fin: debut }).eq('id', o.id);
      if (e) throw e;
      ferme.push(o.stagiaire_id);
    }
  }
  const [ref, cate] = cat ? cat.split('|') : [null, null];
  const { error } = await sb.from('suivi_horometre').insert({
    stagiaire_id: stagiaireId, session_id: sessionId, formateur_id: S.profil.id, referentiel_code: ref, categorie_code: cate,
    engin_libelle: engin || null, date_seance: date, releve_debut: debut, releve_fin: fin ?? null, observations: obs || null });
  if (error) throw error;
  return ferme;
}

async function cloturerPointageHorometre(id, fin) {
  const { data: p } = await sb.from('suivi_horometre').select('releve_debut').eq('id', id).single();
  if (p && p.releve_debut != null && fin < Number(p.releve_debut)) throw new Error('Le relevé de fin doit être supérieur ou égal au relevé de début.');
  const { error } = await sb.from('suivi_horometre').update({ releve_fin: fin }).eq('id', id);
  if (error) throw error;
}

/** Écran de la session : pointer, voir ce qui est en cours, clôturer la journée. */
async function ouvrirHorometreSession() {
  const sess = S.session;
  ouvrirModale('⏱ Horomètre de la session', '<div id="horo-session"></div>');
  await afficherHorometreSession(sess);
}

async function afficherHorometreSession(sess) {
  const zone = $('#horo-session');
  zone.innerHTML = '<p class="chargement">Chargement…</p>';
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const [{ data: sts }, { data: liens }, { data: rel, error }] = await Promise.all([
    sb.from('stagiaires').select('id, nom, prenom, stagiaire_categories(referentiel_code, categorie_code)').eq('session_id', sess.id).order('nom'),
    sb.from('session_engins').select('engins(designation, marque, modele, numero_serie, categories)').eq('session_id', sess.id),
    sb.from('suivi_horometre').select('id, stagiaire_id, engin_libelle, date_seance, releve_debut, releve_fin, duree_heures, referentiel_code, categorie_code, created_at')
      .eq('session_id', sess.id).order('date_seance', { ascending: false }).order('created_at', { ascending: true }),
  ]);
  if (error) return erreurSupabase('Lecture de l\'horomètre', error);
  const engins = (liens || []).map(l => l.engins).filter(Boolean).map(libelleEngin);
  const nomSt = id => { const x = (sts || []).find(y => y.id === id); return x ? `${x.nom} ${x.prenom}` : '?'; };
  const ouverts = (rel || []).filter(r => r.releve_fin == null);
  const duJour = (rel || []).filter(r => r.date_seance === aujourdhui && r.releve_fin != null);
  const dernierReleve = e => { const l = (rel || []).filter(r => r.engin_libelle === e && r.date_seance === aujourdhui); const r = l[l.length - 1]; return r ? (r.releve_fin ?? r.releve_debut) : ''; };

  zone.innerHTML = `
    <form id="form-horo-s" class="formulaire"><div class="grille-2">
      <label>Engin <select name="engin" required><option value="">— choisir —</option>
        ${engins.map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join('')}</select></label>
      <label>Stagiaire qui monte sur l'engin <select name="st" required><option value="">— choisir —</option>
        ${(sts || []).map(x => `<option value="${x.id}">${esc(x.nom + ' ' + x.prenom)}</option>`).join('')}</select></label>
      <label>Catégorie <select name="cat"><option value="">—</option></select></label>
      <label>Relevé de l'horomètre maintenant <input type="number" step="0.1" name="debut" required></label></div>
      <button class="principal" type="submit">▶ Démarrer le pointage</button>
      <span class="aide">Le pointage précédent encore ouvert sur le même engin est clôturé avec ce relevé.</span></form>

    <h4 class="titre-theme">En cours (${ouverts.length})</h4>
    ${ouverts.length ? `<table class="tableau"><thead><tr><th>Engin</th><th>Stagiaire</th><th>Depuis</th><th>Relevé début</th><th>Clôturer avec le relevé</th><th></th></tr></thead><tbody>
      ${ouverts.map(r => `<tr class="${r.date_seance < aujourdhui ? 'inactif' : ''}"><td>${esc(r.engin_libelle || '—')}</td><td>${esc(nomSt(r.stagiaire_id))}</td>
        <td>${esc(dateFr(r.date_seance))}${r.date_seance < aujourdhui ? ' ⚠ à clôturer' : ''}</td><td>${esc(r.releve_debut ?? '—')}</td>
        <td><input type="number" step="0.1" data-fin="${r.id}" style="width:100px"></td>
        <td><button class="icone" data-clot="${r.id}" title="Clôturer ce pointage">✔ Clôturer</button></td></tr>`).join('')}</tbody></table>
      <button id="btn-clot-tout" type="button">Clôturer toute la journée (saisir le dernier relevé de chaque engin ci-dessus)</button>`
      : '<p class="aide">Aucun pointage en cours.</p>'}

    <h4 class="titre-theme">Pointages clôturés aujourd'hui</h4>
    ${duJour.length ? `<table class="tableau"><thead><tr><th>Engin</th><th>Stagiaire</th><th>Début</th><th>Fin</th><th>Durée</th></tr></thead><tbody>
      ${duJour.map(r => `<tr><td>${esc(r.engin_libelle || '—')}</td><td>${esc(nomSt(r.stagiaire_id))}</td><td>${esc(r.releve_debut ?? '—')}</td><td>${esc(r.releve_fin)}</td><td>${heures(r.duree_heures)}</td></tr>`).join('')}</tbody></table>`
      : '<p class="aide">Aucun pointage clôturé aujourd\'hui.</p>'}`;

  const f = $('#form-horo-s');
  f.st.addEventListener('change', () => {
    const x = (sts || []).find(y => y.id === f.st.value);
    f.cat.innerHTML = '<option value="">—</option>' + ((x && x.stagiaire_categories) || []).map(c => `<option value="${esc(c.referentiel_code)}|${esc(c.categorie_code)}">${esc(c.referentiel_code + ' ' + c.categorie_code)}</option>`).join('');
    if (f.cat.options.length === 2) f.cat.selectedIndex = 1;
  });
  f.engin.addEventListener('change', () => { if (!f.debut.value) f.debut.value = dernierReleve(f.engin.value); });
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    try {
      const ferme = await pointerHorometre({ stagiaireId: f.st.value, sessionId: sess.id, engin: f.engin.value, cat: f.cat.value,
        debut: Number(f.debut.value), date: aujourdhui });
      toast(ferme.length ? 'Pointage démarré — pointage précédent clôturé sur cet engin' : 'Pointage démarré');
      afficherHorometreSession(sess);
    } catch (e) { erreurSupabase('Pointage horomètre', e); }
  });
  $$('#horo-session [data-clot]').forEach(b => b.addEventListener('click', async () => {
    const v = $(`#horo-session [data-fin="${b.dataset.clot}"]`).value;
    if (v === '') return toast('Saisis le relevé de fin.', 'erreur');
    try { await cloturerPointageHorometre(Number(b.dataset.clot), Number(v)); afficherHorometreSession(sess); } catch (e) { erreurSupabase('Clôture du pointage', e); }
  }));
  $('#btn-clot-tout')?.addEventListener('click', async () => {
    const saisis = $$('#horo-session [data-fin]').filter(i => i.value !== '');
    if (!saisis.length) return toast('Saisis au moins un relevé de fin.', 'erreur');
    try { for (const i of saisis) await cloturerPointageHorometre(Number(i.dataset.fin), Number(i.value)); toast(`${saisis.length} pointage(s) clôturé(s)`); afficherHorometreSession(sess); }
    catch (e) { erreurSupabase('Clôture des pointages', e); }
  });
}
