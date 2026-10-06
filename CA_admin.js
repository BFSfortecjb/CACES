/* =====================================================================
   CA_admin.js — écrans d'administration :
   Banque de questions, Grilles pratiques (+ opérations éliminatoires),
   Catalogue FISE, Catégories / référentiels, Mots de passe, changement
   de mot de passe (Mon compte). Écriture réservée à l'admin par la base (RLS).
   ===================================================================== */
const AD = { banque: { ref: null, theme: '', q: '' }, grilles: { ref: null, cat: null }, fise: { ref: null } };

const optRefs = sel => S.referentiel.referentiels.map(r =>
  `<option value="${esc(r.code)}" ${r.code === sel ? 'selected' : ''}>${esc(r.code)} — ${esc(r.libelle)}</option>`).join('');
const zoneAdmin = () => $('#contenu');
const champ = (f, n) => f.elements[n];

/* ============================ Banque de questions ============================ */
async function rendreBanque(zone) {
  const b = AD.banque; if (!b.ref) b.ref = S.referentiel.referentiels[0]?.code;
  const themes = S.referentiel.themes.filter(t => t.referentiel_code === b.ref);
  const ids = themes.map(t => t.id);
  const { data, error } = await sb.from('questions_qcm').select('*').in('theme_id', ids.length ? ids : [0]).order('theme_id').order('code');
  if (error) return erreurSupabase('Lecture des questions', error);
  S._questions = data || [];
  const nbActives = id => S._questions.filter(q => q.theme_id === id && q.actif).length;
  const q = (b.q || '').toLowerCase();
  const liste = S._questions.filter(x => (!b.theme || String(x.theme_id) === String(b.theme)) && (!q || x.enonce.toLowerCase().includes(q)));
  zone.innerHTML = `
    <div class="barre-actions"><h2>Banque de questions</h2><button class="principal" onclick="modifierQuestion(null)">+ Question</button></div>
    <div class="formulaire"><div class="grille-2">
      <label>Référentiel <select onchange="AD.banque.ref=this.value;AD.banque.theme='';rendreBanque(zoneAdmin())">${optRefs(b.ref)}</select></label>
      <label>Recherche <input value="${esc(b.q)}" onchange="AD.banque.q=this.value;rendreBanque(zoneAdmin())"></label></div></div>
    <table class="tableau"><thead><tr><th>Thème</th><th>Questions actives</th><th>Barème officiel</th></tr></thead><tbody>
      ${themes.map(t => `<tr class="${String(b.theme) === String(t.id) ? 'ligne-active' : ''}">
        <td><button class="lien" onclick="AD.banque.theme='${t.id}';rendreBanque(zoneAdmin())">${esc(t.libelle)}</button></td>
        <td>${nbActives(t.id)}</td><td>${t.bareme_officiel_sur_100}${nbActives(t.id) !== t.bareme_officiel_sur_100 ? ' ⚠' : ''}</td></tr>`).join('')}</tbody></table>
    ${b.theme ? `<button class="lien" onclick="AD.banque.theme='';rendreBanque(zoneAdmin())">Tous les thèmes</button>` : ''}
    <p class="aide">${liste.length} question(s). Une question désactivée n'est plus tirée (les copies déjà corrigées sont conservées).</p>
    <table class="tableau"><thead><tr><th>Code</th><th>Énoncé</th><th>Réponse</th><th>Actif</th><th></th></tr></thead><tbody>
      ${liste.map(x => `<tr class="${x.actif ? '' : 'termine'}"><td>${esc(x.code || '')}</td><td>${esc(x.enonce)}</td>
        <td>${x.reponse ? 'Vrai' : 'Faux'}</td><td>${x.actif ? 'Oui' : 'Non'}</td>
        <td><button class="lien" onclick="modifierQuestion(${x.id})">Modifier</button></td></tr>`).join('')}</tbody></table>`;
}

function modifierQuestion(id) {
  const b = AD.banque, themes = S.referentiel.themes.filter(t => t.referentiel_code === b.ref);
  const x = id ? S._questions.find(q => q.id === id) : { theme_id: Number(b.theme) || themes[0]?.id, code: '', enonce: '', reponse: true, actif: true };
  ouvrirModale(id ? 'Modifier la question' : 'Nouvelle question', `<form class="formulaire" id="form-q">
    <label>Thème <select name="theme">${themes.map(t => `<option value="${t.id}" ${t.id === x.theme_id ? 'selected' : ''}>${esc(t.libelle)}</option>`).join('')}</select></label>
    <label>Code <input name="code" value="${esc(x.code || '')}"></label>
    <label>Énoncé <textarea name="enonce" rows="4" required>${esc(x.enonce)}</textarea></label>
    <label>Bonne réponse <select name="reponse"><option value="1" ${x.reponse ? 'selected' : ''}>Vrai</option><option value="0" ${x.reponse ? '' : 'selected'}>Faux</option></select></label>
    <label><input type="checkbox" name="actif" ${x.actif ? 'checked' : ''}> Question active</label>
    <button class="principal" type="submit">Enregistrer</button></form>`);
  $('#form-q').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target;
    const ligne = { theme_id: Number(f.theme.value), code: f.code.value.trim() || null, enonce: f.enonce.value.trim(), reponse: f.reponse.value === '1', actif: f.actif.checked };
    const { error } = id ? await sb.from('questions_qcm').update(ligne).eq('id', id) : await sb.from('questions_qcm').insert(ligne);
    if (error) return erreurSupabase('Enregistrement de la question', error);
    toast('Question enregistrée'); fermerModale(); rendreBanque(zoneAdmin());
  });
}

/* ============================ Grilles pratiques ============================ */
async function rendreGrilles(zone) {
  const g = AD.grilles; if (!g.ref) g.ref = S.referentiel.referentiels[0]?.code;
  const cats = S.referentiel.categories.filter(c => c.referentiel_code === g.ref);
  if (!cats.find(c => c.code === g.cat)) g.cat = cats[0]?.code;
  const crit = S.referentiel.criteres.filter(c => c.referentiel_code === g.ref && c.categorie_code === g.cat);
  const total = crit.reduce((a, c) => a + (c.bareme_points || 0), 0);
  const { data: elim } = await sb.from('operations_eliminatoires').select('*').eq('referentiel_code', g.ref).order('ordre');
  S._elim = elim || [];
  const themes = [...new Set(crit.map(c => c.theme_code))];
  zone.innerHTML = `
    <div class="barre-actions"><h2>Grilles pratiques</h2><button class="principal" onclick="modifierCritere(null)">+ Critère</button></div>
    <div class="formulaire"><div class="grille-2">
      <label>Référentiel <select onchange="AD.grilles.ref=this.value;AD.grilles.cat=null;rendreGrilles(zoneAdmin())">${optRefs(g.ref)}</select></label>
      <label>Catégorie <select onchange="AD.grilles.cat=this.value;rendreGrilles(zoneAdmin())">${cats.map(c =>
        `<option value="${esc(c.code)}" ${c.code === g.cat ? 'selected' : ''}>${esc(c.code)} — ${esc(c.libelle)}</option>`).join('')}</select></label></div></div>
    <p class="aide">${crit.length} critère(s) — total des points : <b>${total}</b> ${total === 100 ? '✔' : '⚠ (attendu : 100)'}.
      ${crit.some(c => !c.point_numero) ? '⚠ Des critères n\'ont pas de « point d\'évaluation » (n°) : la règle « > 0 par point » ne peut pas être appliquée.' : ''}</p>
    ${themes.map(t => `<h4 class="titre-theme">${esc(crit.find(c => c.theme_code === t).theme_libelle || t)}</h4>
      <table class="tableau"><thead><tr><th>Ordre</th><th>Critère</th><th>Pts</th><th>Point n°</th><th>Éliminatoire</th><th>En continu</th><th>Variante</th><th></th></tr></thead><tbody>
      ${crit.filter(c => c.theme_code === t).map(c => `<tr><td>${c.ordre}</td><td>${esc(c.libelle)}</td><td>${c.bareme_points}</td>
        <td>${c.point_numero ?? '—'}</td><td>${c.eliminatoire ? 'Oui' : ''}</td><td>${c.en_continu ? 'Oui' : ''}</td><td>${esc(c.variante || '')}</td>
        <td><button class="lien" onclick="modifierCritere(${c.id})">Modifier</button></td></tr>`).join('')}</tbody></table>`).join('')
      || '<p class="vide">Aucun critère pour cette catégorie : à saisir d\'après le référentiel (+ Critère).</p>'}
    <div class="carte"><h3>Opérations éliminatoires — ${esc(g.ref)}</h3>
      ${S._elim.map(e => `<div>${esc(e.libelle)} ${e.actif ? '' : '<i>(inactive)</i>'}
        <button class="lien" onclick="basculerElim(${e.id},${!e.actif})">${e.actif ? 'Désactiver' : 'Réactiver'}</button></div>`).join('') || '<i>Aucune.</i>'}
      <button onclick="ajouterElim()">+ Ajouter</button></div>`;
}

function modifierCritere(id) {
  const g = AD.grilles;
  const x = id ? S.referentiel.criteres.find(c => c.id === id) : { theme_code: '', theme_libelle: '', libelle: '', bareme_points: 1, eliminatoire: false, ordre: 0, point_numero: '', en_continu: false, variante: '' };
  const themesExist = [...new Set(S.referentiel.criteres.filter(c => c.referentiel_code === g.ref && c.categorie_code === g.cat).map(c => c.theme_code))];
  ouvrirModale(id ? 'Modifier le critère' : 'Nouveau critère', `<form class="formulaire" id="form-c">
    <div class="grille-2">
    <label>Code du thème <input name="theme_code" list="themes-liste" required value="${esc(x.theme_code)}"></label>
    <datalist id="themes-liste">${themesExist.map(t => `<option value="${esc(t)}">`).join('')}</datalist>
    <label>Libellé du thème <input name="theme_libelle" value="${esc(x.theme_libelle || '')}"></label>
    <label>Ordre <input type="number" name="ordre" value="${x.ordre}"></label>
    <label>Points <input type="number" name="pts" min="0" required value="${x.bareme_points}"></label>
    <label>Point d'évaluation n° <input type="number" name="pn" value="${x.point_numero ?? ''}"></label>
    <label>Variante <input name="variante" value="${esc(x.variante || '')}" placeholder="vide = toutes"></label></div>
    <label>Critère <textarea name="libelle" rows="3" required>${esc(x.libelle)}</textarea></label>
    <label><input type="checkbox" name="elim" ${x.eliminatoire ? 'checked' : ''}> Éliminatoire</label>
    <label><input type="checkbox" name="cont" ${x.en_continu ? 'checked' : ''}> Évalué en continu</label>
    <button class="principal" type="submit">Enregistrer</button>
    ${id ? '<button type="button" class="danger" id="suppr-c">Supprimer</button>' : ''}</form>`);
  $('#form-c').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target;
    const ligne = { referentiel_code: g.ref, categorie_code: g.cat, theme_code: f.theme_code.value.trim(), theme_libelle: f.theme_libelle.value.trim() || null,
      libelle: f.libelle.value.trim(), bareme_points: Number(f.pts.value), eliminatoire: f.elim.checked, en_continu: f.cont.checked,
      ordre: Number(f.ordre.value) || 0, point_numero: f.pn.value ? Number(f.pn.value) : null, variante: f.variante.value.trim() || null };
    const { error } = id ? await sb.from('criteres_pratique').update(ligne).eq('id', id) : await sb.from('criteres_pratique').insert(ligne);
    if (error) return erreurSupabase('Enregistrement du critère', error);
    await chargerReferentiel(); toast('Critère enregistré'); fermerModale(); rendreGrilles(zoneAdmin());
  });
  const s = $('#suppr-c'); if (s) s.onclick = async () => {
    if (!confirmer('Supprimer ce critère ? (impossible s\'il a déjà été utilisé dans une évaluation)')) return;
    const { error } = await sb.from('criteres_pratique').delete().eq('id', id);
    if (error) return erreurSupabase('Suppression', error);
    await chargerReferentiel(); fermerModale(); rendreGrilles(zoneAdmin());
  };
}

async function basculerElim(id, actif) {
  const { error } = await sb.from('operations_eliminatoires').update({ actif }).eq('id', id);
  if (error) return erreurSupabase('Mise à jour', error); rendreGrilles(zoneAdmin());
}
async function ajouterElim() {
  const l = prompt('Libellé de l\'opération éliminatoire :'); if (!l || !l.trim()) return;
  const ordre = (S._elim.reduce((m, e) => Math.max(m, e.ordre || 0), 0)) + 1;
  const { error } = await sb.from('operations_eliminatoires').insert({ referentiel_code: AD.grilles.ref, libelle: l.trim(), ordre });
  if (error) return erreurSupabase('Ajout', error); rendreGrilles(zoneAdmin());
}

/* ============================ Catalogue FISE ============================ */
async function rendreCatalogueFise(zone) {
  const F = AD.fise; if (!F.ref) F.ref = S.referentiel.referentiels[0]?.code;
  const [cap, lien] = await Promise.all([
    sb.from('fise_capacites').select('*').eq('referentiel_code', F.ref).order('theme_code').order('ordre'),
    sb.from('fise_capacite_categories').select('*')]);
  if (cap.error) return erreurSupabase('Lecture du catalogue FISE', cap.error);
  S._fise = cap.data || []; S._fiseLiens = lien.data || [];
  const themes = [...new Set(S._fise.map(c => c.theme_code))];
  zone.innerHTML = `
    <div class="barre-actions"><h2>Catalogue FISE</h2><button class="principal" onclick="modifierCapacite(null)">+ Capacité</button></div>
    <label>Référentiel <select onchange="AD.fise.ref=this.value;rendreCatalogueFise(zoneAdmin())">${optRefs(F.ref)}</select></label>
    ${themes.map(t => `<h4 class="titre-theme">${esc(S._fise.find(c => c.theme_code === t).theme_libelle)}</h4>
      <table class="tableau"><thead><tr><th>Ordre</th><th>Capacité évaluée</th><th>Catégories</th><th></th></tr></thead><tbody>
      ${S._fise.filter(c => c.theme_code === t).map(c => `<tr><td>${c.ordre}</td><td>${esc(c.libelle)}</td>
        <td>${S._fiseLiens.filter(l => l.capacite_id === c.id).map(l => esc(l.categorie_code)).join(', ') || 'toutes ?'}</td>
        <td><button class="lien" onclick="modifierCapacite(${c.id})">Modifier</button></td></tr>`).join('')}</tbody></table>`).join('')
      || '<p class="vide">Aucune capacité.</p>'}`;
}

function modifierCapacite(id) {
  const F = AD.fise, cats = S.referentiel.categories.filter(c => c.referentiel_code === F.ref);
  const x = id ? S._fise.find(c => c.id === id) : { theme_code: '', theme_libelle: '', libelle: '', ordre: 0 };
  const cochees = new Set(S._fiseLiens.filter(l => l.capacite_id === id).map(l => l.categorie_code));
  const themes = [...new Map(S._fise.map(c => [c.theme_code, c.theme_libelle])).entries()];
  ouvrirModale(id ? 'Modifier la capacité' : 'Nouvelle capacité', `<form class="formulaire" id="form-f">
    <label>Thème <select name="theme" onchange="this.form.nt.hidden=this.value!=='__new'">${themes.map(([c, l]) =>
      `<option value="${esc(c)}" ${c === x.theme_code ? 'selected' : ''}>${esc(l)}</option>`).join('')}<option value="__new">+ Nouveau thème…</option></select>
      <input name="nt" hidden placeholder="Code|Libellé du nouveau thème"></label>
    <label>Capacité <textarea name="libelle" rows="3" required>${esc(x.libelle)}</textarea></label>
    <label>Ordre <input type="number" name="ordre" value="${x.ordre}"></label>
    <fieldset><legend>Catégories concernées</legend>${cats.map(c => `<label class="case"><input type="checkbox" name="cat" value="${esc(c.code)}" ${cochees.has(c.code) ? 'checked' : ''}> ${esc(c.code)}</label>`).join('')}</fieldset>
    <button class="principal" type="submit">Enregistrer</button>
    ${id ? '<button type="button" class="danger" id="suppr-f">Supprimer</button>' : ''}</form>`);
  $('#form-f').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target;
    let tc = f.theme.value, tl = (themes.find(t => t[0] === tc) || [])[1];
    if (tc === '__new') { const [c, l] = f.nt.value.split('|'); if (!c || !l) return toast('Format : code|libellé', 'erreur'); tc = c.trim(); tl = l.trim(); }
    const ligne = { referentiel_code: F.ref, theme_code: tc, theme_libelle: tl, libelle: f.libelle.value.trim(), ordre: Number(f.ordre.value) || 0 };
    try {
      let cid = id;
      if (id) { const { error } = await sb.from('fise_capacites').update(ligne).eq('id', id); if (error) throw error; }
      else { const { data, error } = await sb.from('fise_capacites').insert(ligne).select().single(); if (error) throw error; cid = data.id; }
      await sb.from('fise_capacite_categories').delete().eq('capacite_id', cid);
      const liens = $$('input[name=cat]:checked', f).map(i => ({ capacite_id: cid, categorie_code: i.value }));
      if (liens.length) { const { error } = await sb.from('fise_capacite_categories').insert(liens); if (error) throw error; }
      toast('Capacité enregistrée'); fermerModale(); rendreCatalogueFise(zoneAdmin());
    } catch (e) { erreurSupabase('Enregistrement', e); }
  });
  const s = $('#suppr-f'); if (s) s.onclick = async () => {
    if (!confirmer('Supprimer cette capacité du catalogue ?')) return;
    const { error } = await sb.from('fise_capacites').delete().eq('id', id);
    if (error) return erreurSupabase('Suppression', error); fermerModale(); rendreCatalogueFise(zoneAdmin());
  };
}

/* ============================ Catégories et référentiels ============================ */
function rendreCategories(zone) {
  const refs = S.referentiel.referentiels, cats = S.referentiel.categories;
  zone.innerHTML = `<div class="barre-actions"><h2>Catégories et référentiels</h2></div>
    ${refs.map(r => `<div class="carte"><h3>${esc(r.code)} — ${esc(r.libelle)} ${r.actif === false ? '<i>(inactif)</i>' : ''}
        <button class="lien" onclick="modifierReferentiel('${esc(r.code)}')">Modifier</button></h3>
      <p class="aide">Validité ${r.duree_validite_mois} mois · seuil théorie ${r.seuil_reussite_global_pct} % · UT théorie ${r.ut_theorique}</p>
      <table class="tableau"><thead><tr><th>Code</th><th>Libellé</th><th>UT pratique</th><th>Temps de référence</th><th></th></tr></thead><tbody>
      ${cats.filter(c => c.referentiel_code === r.code).map(c => `<tr><td>${esc(c.code)}</td><td>${esc(c.libelle)}</td><td>${c.ut_pratique}</td><td>${c.temps_reference_min ? c.temps_reference_min + ' min' : '<i>non défini</i>'}</td>
        <td><button class="lien" onclick="modifierCategorie('${esc(r.code)}','${esc(c.code)}')">Modifier</button></td></tr>`).join('')}</tbody></table>
      <button onclick="modifierCategorie('${esc(r.code)}',null)">+ Catégorie</button></div>`).join('')}`;
}

function modifierReferentiel(code) {
  const r = S.referentiel.referentiels.find(x => x.code === code);
  ouvrirModale('Référentiel ' + code, `<form class="formulaire" id="form-r">
    <label>Libellé <input name="lib" required value="${esc(r.libelle)}"></label>
    <label>Durée de validité (mois) <input type="number" name="mois" value="${r.duree_validite_mois}"></label>
    <label>Seuil de réussite théorie (%) <input type="number" name="seuil" value="${r.seuil_reussite_global_pct}"></label>
    <label>UT théorie <input type="number" step="0.1" name="ut" value="${r.ut_theorique}"></label>
    <label><input type="checkbox" name="actif" ${r.actif === false ? '' : 'checked'}> Référentiel actif</label>
    <button class="principal" type="submit">Enregistrer</button></form>`);
  $('#form-r').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target;
    const { error } = await sb.from('referentiels').update({ libelle: f.lib.value.trim(), duree_validite_mois: Number(f.mois.value),
      seuil_reussite_global_pct: Number(f.seuil.value), ut_theorique: Number(f.ut.value), actif: f.actif.checked }).eq('code', code);
    if (error) return erreurSupabase('Enregistrement', error);
    await chargerReferentiel(); fermerModale(); rendreCategories(zoneAdmin());
  });
}

function modifierCategorie(ref, code) {
  const c = code ? S.referentiel.categories.find(x => x.referentiel_code === ref && x.code === code) : { code: '', libelle: '', ut_pratique: 1, temps_reference_min: null };
  ouvrirModale(code ? `Catégorie ${ref} ${code}` : 'Nouvelle catégorie ' + ref, `<form class="formulaire" id="form-cat">
    <label>Code <input name="code" required value="${esc(c.code)}" ${code ? 'readonly' : ''}></label>
    <label>Libellé <input name="lib" required value="${esc(c.libelle)}"></label>
    <label>UT pratique <input type="number" step="0.1" name="ut" value="${c.ut_pratique}"></label>
    <label>Temps de référence de l'épreuve (minutes, durée totale T1+T2+T3) <input type="number" name="tref" min="0" value="${c.temps_reference_min ?? ''}" placeholder="vide = pas de contrôle"></label>
    <p class="aide">Au-delà de 130 % de ce temps, la règle officielle impose la note 0 au(x) point(s) concerné(s) (échec à l'évaluation pratique).</p>
    <button class="principal" type="submit">Enregistrer</button></form>`);
  $('#form-cat').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target;
    const ligne = { libelle: f.lib.value.trim(), ut_pratique: Number(f.ut.value), temps_reference_min: f.tref.value ? Number(f.tref.value) : null };
    const { error } = code ? await sb.from('categories_referentiel').update(ligne).eq('referentiel_code', ref).eq('code', code)
      : await sb.from('categories_referentiel').insert({ referentiel_code: ref, code: f.code.value.trim(), ...ligne });
    if (error) return erreurSupabase('Enregistrement', error);
    await chargerReferentiel(); fermerModale(); rendreCategories(zoneAdmin());
  });
}

/* ============================ Mots de passe ============================ */
async function rendreMotsDePasse(zone) {
  zone.innerHTML = '<p class="aide">Chargement…</p>';
  const { data, error } = await sb.from('formateurs').select('id, nom, prenom, email, role').order('nom');
  if (error) return erreurSupabase('Chargement des comptes', error);
  zone.innerHTML = `<div class="barre-actions"><h2>Mots de passe</h2></div>
    <p class="aide">Envoie à la personne un e-mail contenant un lien pour choisir elle-même un nouveau mot de passe.
      Le mot de passe actuel n'est jamais affiché ni connu de personne.</p>
    <table class="tableau"><thead><tr><th>Nom</th><th>Prénom</th><th>E-mail</th><th>Rôle</th><th></th></tr></thead><tbody>
      ${(data || []).map(f => `<tr><td>${esc(f.nom)}</td><td>${esc(f.prenom)}</td><td>${esc(f.email || '—')}</td><td>${esc(LIBELLE_ROLE?.[f.role] || f.role)}</td>
        <td>${f.email ? `<button data-mail="${esc(f.email)}" class="reinit">🔑 Envoyer un lien de réinitialisation</button>` : '—'}</td></tr>`).join('')}</tbody></table>`;
  $$('.reinit', zone).forEach(b => b.addEventListener('click', async () => {
    const email = b.dataset.mail;
    if (!confirmer(`Envoyer un e-mail de réinitialisation à ${email} ?`)) return;
    b.disabled = true;
    try {
      const { error: e } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (e) throw e; toast('E-mail envoyé à ' + email);
    } catch (e) { erreurSupabase('Réinitialisation', e); } finally { b.disabled = false; }
  }));
}

/* ============================ Mon compte : changer son mot de passe ============================ */
(function () {
  const base = typeof rendreMonCompte === 'function' ? rendreMonCompte : null;
  window.rendreMonCompte = function (zone) {
    if (base) base(zone);
    zone.insertAdjacentHTML('beforeend', `<div class="carte"><h3>Changer mon mot de passe</h3>
      <form class="formulaire" id="form-mdp">
        <label>Nouveau mot de passe (8 caractères minimum) <input type="password" name="m1" minlength="8" required autocomplete="new-password"></label>
        <label>Confirmer <input type="password" name="m2" minlength="8" required autocomplete="new-password"></label>
        <button class="principal" type="submit">Changer</button></form></div>`);
    $('#form-mdp', zone).addEventListener('submit', async ev => {
      ev.preventDefault(); const f = ev.target;
      if (f.m1.value !== f.m2.value) return toast('Les deux mots de passe sont différents.', 'erreur');
      const { error } = await sb.auth.updateUser({ password: f.m1.value });
      if (error) return erreurSupabase('Changement du mot de passe', error);
      f.reset(); toast('Mot de passe modifié');
    });
  };
})();
