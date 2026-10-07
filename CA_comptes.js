/* CA_comptes.js — onglet Comptes (admin) : formateurs / testeurs / admin / secrétariat.
   Un compte doit d'abord exister dans l'Univers BFS (Supabase Auth) ; ici on le
   rattache à BFS CACES par son e-mail (fonction rattacher_formateur_par_email). */
const LIBELLE_ROLE = { formateur: 'Formateur', admin: 'Administrateur', secretariat: 'Secrétariat' };

async function rendreComptes(zone) {
  await chargerFormateurs();
  const resume = (id, fonction) => { const n = (S.habilitations || []).filter(h => h.formateur_id === id && h.fonction === fonction).length; return n ? n + ' cat.' : 'toutes'; };
  const { data } = await sb.from('formateurs').select('*').order('nom');
  const liste = data || [];
  zone.innerHTML = `
    <div class="barre-actions"><h2>Comptes</h2>
      <button class="principal" onclick="ajouterCompte()">+ Rattacher un compte</button></div>
    <p class="aide">Chaque application BFS gère ses comptes : un compte de l'Univers BFS n'accède à BFS CACES
      que s'il est listé ici.</p>
    <table class="tableau"><thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Testeur</th><th>Catégories (formateur / testeur)</th><th>Actif</th><th></th></tr></thead><tbody>
    ${liste.map(f => `<tr class="${f.actif === false ? 'termine' : ''}">
      <td>${esc(((f.nom || '') + ' ' + (f.prenom || '')).trim())}</td><td>${esc(f.email)}</td>
      <td>${esc(LIBELLE_ROLE[f.role] || f.role)}</td><td>${f.role === 'secretariat' ? '—' : (f.est_testeur === false ? 'Non' : 'Oui')}</td><td>${f.role === 'secretariat' ? '—' : esc(resume(f.id, 'formateur') + ' / ' + (f.est_testeur === false ? '—' : resume(f.id, 'testeur')))}</td><td>${f.actif === false ? 'Non' : 'Oui'}</td>
      <td><button class="lien" onclick="modifierCompte('${esc(f.id)}')">Modifier</button></td></tr>`).join('')}
    </tbody></table>`;
  S._comptes = liste;
}

/** Cases « catégories habilitées » d'une fonction. Aucune case cochée = toutes les catégories. */
function casesHabilitations(fonction, id) {
  const coch = new Set((S.habilitations || []).filter(h => h.formateur_id === id && h.fonction === fonction).map(h => h.referentiel_code + '|' + h.categorie_code));
  return S.referentiel.referentiels.map(r => `<div class="groupe-symboles"><b>${esc(r.code)}</b>
    ${S.referentiel.categories.filter(c => c.referentiel_code === r.code).map(c => `<label class="case"><input type="checkbox" name="hab_${fonction}"
      value="${esc(r.code)}|${esc(c.code)}" ${coch.has(r.code + '|' + c.code) ? 'checked' : ''}> ${esc(c.code)}</label>`).join('')}</div>`).join('');
}
async function enregistrerHabilitations(id, form) {
  for (const fonction of ['formateur', 'testeur']) {
    const lignes = [...form.querySelectorAll(`input[name=hab_${fonction}]:checked`)].map(i => {
      const [referentiel_code, categorie_code] = i.value.split('|');
      return { formateur_id: id, fonction, referentiel_code, categorie_code };
    });
    const { error: e1 } = await sb.from('formateur_habilitations').delete().eq('formateur_id', id).eq('fonction', fonction);
    if (e1) throw e1;
    if (lignes.length) { const { error: e2 } = await sb.from('formateur_habilitations').insert(lignes); if (e2) throw e2; }
  }
}

function ajouterCompte() {
  ouvrirModale('Rattacher un compte', `
    <form class="formulaire" id="form-compte">
      <label>E-mail du compte (déjà créé dans l'Univers BFS) <input type="email" name="email" required></label>
      <label>Nom <input name="nom" required></label>
      <label>Prénom <input name="prenom" required></label>
      <label>Rôle <select name="role">${Object.entries(LIBELLE_ROLE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label class="case"><input type="checkbox" name="testeur" checked> Habilité testeur CACES® <span class="aide">(peut être affecté comme testeur d'une session ; à décocher pour un formateur qui ne teste pas)</span></label>
      <button class="principal" type="submit">Rattacher</button>
    </form>`);
  $('#form-compte').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    try {
      const r = await rpc('rattacher_formateur_par_email', { p_email: f.email.value.trim(),
        p_nom: f.nom.value.trim(), p_prenom: f.prenom.value.trim(), p_role: f.role.value, p_testeur: f.testeur.checked });
      toast(r === 'deja_rattache' ? 'Déjà rattaché' : 'Compte rattaché');
      fermerModale(); rendreComptes($('#contenu'));
    } catch (e) { erreurSupabase('Rattachement', e); }
  });
}

function modifierCompte(id) {
  const c = (S._comptes || []).find(x => x.id === id); if (!c) return;
  ouvrirModale('Modifier ' + (c.email || ''), `
    <form class="formulaire" id="form-compte">
      <label>Nom <input name="nom" value="${esc(c.nom || '')}" required></label>
      <label>Prénom <input name="prenom" value="${esc(c.prenom || '')}" required></label>
      <label>Rôle <select name="role">${Object.entries(LIBELLE_ROLE).map(([k, v]) => `<option value="${k}" ${k === c.role ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="case"><input type="checkbox" name="testeur" ${c.est_testeur === false ? '' : 'checked'}> Habilité testeur CACES®</label>
      <fieldset><legend>Catégories pour lesquelles il est habilité formateur</legend>
        <p class="aide">Aucune case cochée = toutes les catégories.</p>${casesHabilitations('formateur', id)}</fieldset>
      <fieldset id="fs-hab-testeur"><legend>Catégories pour lesquelles il est habilité testeur</legend>
        <p class="aide">Aucune case cochée = toutes les catégories.</p>${casesHabilitations('testeur', id)}</fieldset>
      <label><input type="checkbox" name="actif" ${c.actif === false ? '' : 'checked'}> Compte actif</label>
      <button class="principal" type="submit">Enregistrer</button>
    </form>`);
  $('#form-compte').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    if (id === S.profil.id && (f.role.value !== 'admin' || !f.actif.checked))
      return toast('Tu ne peux pas retirer tes propres droits d\'administrateur.');
    const { error } = await sb.from('formateurs').update({ nom: f.nom.value.trim(),
      prenom: f.prenom.value.trim(), role: f.role.value, actif: f.actif.checked, est_testeur: f.testeur.checked }).eq('id', id);
    if (error) return erreurSupabase('Modification', error);
    try { await enregistrerHabilitations(id, f); } catch (e) { return erreurSupabase('Enregistrement des habilitations', e); }
    toast('Enregistré'); fermerModale(); router();
  });
}
