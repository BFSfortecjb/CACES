/* =====================================================================
   CA_fise.js — Fiche Individuelle de Suivi et d'Évaluation (FISE)
   Remplie par le FORMATEUR de la session pendant la formation : statut
   A (Acquis) / E.C.A. (En cours d'acquisition) / N.A. (Non acquis) par
   capacité, puis avis favorable / défavorable à la présentation au test.
   Distincte du QCM et de la pratique, notés par le TESTEUR.

   Le catalogue est filtré par catégorie (fise_capacite_categories) : la
   version informatique n'affiche que les capacités applicables à la
   catégorie évaluée, contrairement à la fiche papier qui les regroupe toutes.
   ===================================================================== */

async function ouvrirFise(stagiaireId) {
  const { data: st, error } = await sb.from('stagiaires')
    .select('id, nom, prenom, stagiaire_categories(referentiel_code, categorie_code)')
    .eq('id', stagiaireId).single();
  if (error) return erreurSupabase('Lecture du stagiaire', error);
  const cats = st.stagiaire_categories || [];
  if (!cats.length) return toast('Ce stagiaire n\'a aucune catégorie visée.', 'erreur');

  ouvrirModale(`FISE — ${st.nom} ${st.prenom}`, `
    <div class="onglets-fise">${cats.map((c, i) => `<button type="button" class="${i === 0 ? 'principal' : ''}"
      data-cat="${i}">${esc(c.referentiel_code)} ${esc(c.categorie_code)}</button>`).join(' ')}</div>
    <div id="fise-contenu"></div>`);
  $$('.onglets-fise button').forEach(b => b.addEventListener('click', () => {
    $$('.onglets-fise button').forEach(x => x.classList.remove('principal'));
    b.classList.add('principal');
    afficherFise(st, cats[Number(b.dataset.cat)]);
  }));
  afficherFise(st, cats[0]);
}

async function afficherFise(st, cat) {
  const zone = $('#fise-contenu');
  zone.innerHTML = '<p class="chargement">Chargement…</p>';
  const ref = cat.referentiel_code, code = cat.categorie_code;
  const [caps, evals, avis] = await Promise.all([
    sb.from('fise_capacites')
      .select('id, theme_code, theme_libelle, libelle, ordre, fise_capacite_categories!inner(categorie_code)')
      .eq('referentiel_code', ref).eq('fise_capacite_categories.categorie_code', code).order('ordre'),
    sb.from('fise_evaluations').select('capacite_id, statut, observations')
      .eq('stagiaire_id', st.id).eq('categorie_code', code),
    sb.from('fise_avis').select('*').eq('stagiaire_id', st.id)
      .eq('referentiel_code', ref).eq('categorie_code', code).maybeSingle(),
  ]);
  if (caps.error) return erreurSupabase('Lecture du catalogue FISE', caps.error);
  const parCap = Object.fromEntries((evals.data || []).map(e => [e.capacite_id, e]));
  const liste = caps.data || [];
  if (!liste.length) {
    zone.innerHTML = `<p class="aide">Aucune capacité FISE saisie pour ${esc(ref)} ${esc(code)} dans le catalogue.</p>`;
    return;
  }

  let theme = null;
  const lignes = liste.map(c => {
    const e = parCap[c.id] || {};
    const entete = c.theme_code !== theme ? `<h4 class="titre-theme">${esc(c.theme_libelle)}</h4>` : '';
    theme = c.theme_code;
    return `${entete}<div class="ligne-fise" data-cap="${c.id}">
      <span class="libelle-fise">${esc(c.libelle)}</span>
      ${[['A', 'A'], ['ECA', 'E.C.A.'], ['NA', 'N.A.']].map(([v, l]) => `<label class="case">
        <input type="radio" name="f${c.id}" value="${v}" ${e.statut === v ? 'checked' : ''}> ${l}</label>`).join('')}
      <input type="text" class="obs-fise" placeholder="Observations" value="${esc(e.observations || '')}">
    </div>`;
  }).join('');
  const a = avis.data || {};
  zone.innerHTML = `${lignes}
    <div class="avis-fise">
      <b>Avis pour la présentation au test — ${esc(ref)} ${esc(code)}</b><br>
      <label class="case"><input type="radio" name="avis" value="favorable" ${a.avis === 'favorable' ? 'checked' : ''}> Favorable</label>
      <label class="case"><input type="radio" name="avis" value="defavorable" ${a.avis === 'defavorable' ? 'checked' : ''}> Défavorable</label>
      <textarea id="avis-motif" rows="2" placeholder="Motivation de l'avis défavorable"
        style="${a.avis === 'defavorable' ? '' : 'display:none'}">${esc(a.motivation_defavorable || '')}</textarea>
      <span id="fise-msg" class="aide"></span>
    </div>`;

  async function sauverLigne(ligne) {
    const coche = ligne.querySelector('input[type=radio]:checked');
    if (!coche) return;
    const { error } = await sb.from('fise_evaluations').upsert({
      stagiaire_id: st.id, capacite_id: Number(ligne.dataset.cap), categorie_code: code,
      statut: coche.value, observations: ligne.querySelector('.obs-fise').value || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'stagiaire_id,capacite_id,categorie_code' });
    if (error) erreurSupabase('Enregistrement FISE', error);
  }
  $$('.ligne-fise').forEach(l => l.addEventListener('change', () => sauverLigne(l)));

  async function sauverAvis() {
    const coche = zone.querySelector('input[name=avis]:checked');
    if (!coche) return;
    $('#avis-motif').style.display = coche.value === 'defavorable' ? '' : 'none';
    if (coche.value === 'defavorable' && !$('#avis-motif').value.trim()) {
      $('#fise-msg').textContent = 'Motivation obligatoire pour un avis défavorable.'; return;
    }
    const { error } = await sb.from('fise_avis').upsert({
      stagiaire_id: st.id, referentiel_code: ref, categorie_code: code, avis: coche.value,
      motivation_defavorable: coche.value === 'defavorable' ? $('#avis-motif').value.trim() : null,
      formateur_id: S.profil.id, date_avis: new Date().toISOString().slice(0, 10),
    }, { onConflict: 'stagiaire_id,referentiel_code,categorie_code' });
    if (error) return erreurSupabase('Enregistrement de l\'avis', error);
    $('#fise-msg').textContent = 'Avis enregistré.';
  }
  zone.querySelector('.avis-fise').addEventListener('change', sauverAvis);
}
