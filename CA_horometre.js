/* =====================================================================
   CA_horometre.js — suivi horomètre (temps de conduite en formation)
   Relevé par le FORMATEUR de la session. Un stagiaire peut avoir PLUSIEURS
   séances de conduite dans la même journée : aucune contrainte d'unicité par
   date en base ; l'écran regroupe par jour avec sous-total et cumul total.
   (L'horomètre ne figure pas sur la FISE papier : écran distinct.)
   ===================================================================== */

async function ouvrirHorometre(stagiaireId) {
  const { data: st, error } = await sb.from('stagiaires')
    .select('id, nom, prenom, stagiaire_categories(referentiel_code, categorie_code)')
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
        <label>Engin <input name="engin" placeholder="Ex : Pelle CAT 305"></label>
        <label>Date <input type="date" name="date" value="${aujourdhui}" required></label>
        <label>Observations <input name="obs"></label>
        <label>Relevé début <input type="number" step="0.1" name="debut" required></label>
        <label>Relevé fin <input type="number" step="0.1" name="fin" required></label>
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
          <td>${esc(r.releve_debut ?? '—')}</td><td>${esc(r.releve_fin ?? '—')}</td>
          <td>${heures(r.duree_heures)}</td><td>${esc(r.observations)}</td>
          <td><button class="icone" title="Supprimer ce relevé" data-suppr="${r.id}">🗑</button></td></tr>`).join('')}
        </tbody></table>`;
    }).join('') || '<p class="aide">Aucun relevé pour l\'instant.</p>'}
    <p><b>Total toutes séances : ${heures(total)}</b></p>`;

  $('#form-horo').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    const debut = Number(f.debut.value), fin = Number(f.fin.value);
    if (fin < debut) return toast('Le relevé de fin doit être supérieur ou égal au début.', 'erreur');
    const [ref, cat] = f.cat.value ? f.cat.value.split('|') : [null, null];
    const { data: sess } = await sb.from('stagiaires').select('session_id').eq('id', st.id).single();
    const { error: e } = await sb.from('suivi_horometre').insert({
      stagiaire_id: st.id, session_id: sess.session_id, formateur_id: S.profil.id,
      referentiel_code: ref, categorie_code: cat, engin_libelle: f.engin.value.trim() || null,
      date_seance: f.date.value, releve_debut: debut, releve_fin: fin, observations: f.obs.value.trim() || null,
    });
    if (e) return erreurSupabase('Enregistrement du relevé', e);
    afficherHorometre(st);
  });
  $$('#horo-contenu [data-suppr]').forEach(b => b.addEventListener('click', async () => {
    if (!confirmer('Supprimer ce relevé ?')) return;
    const { error: e } = await sb.from('suivi_horometre').delete().eq('id', Number(b.dataset.suppr));
    if (e) return erreurSupabase('Suppression du relevé', e);
    afficherHorometre(st);
  }));
}
