/* CA_comptes.js — onglet Comptes (admin) : formateurs / testeurs / admin / secrétariat.
   Un compte doit d'abord exister dans l'Univers BFS (Supabase Auth) ; ici on le
   rattache à BFS CACES par son e-mail (fonction rattacher_formateur_par_email). */
const LIBELLE_ROLE = { formateur: 'Formateur / testeur', admin: 'Administrateur', secretariat: 'Secrétariat' };

async function rendreComptes(zone) {
  await chargerFormateurs();
  const { data } = await sb.from('formateurs').select('*').order('nom');
  const liste = data || [];
  zone.innerHTML = `
    <div class="barre-actions"><h2>Comptes</h2>
      <button class="principal" onclick="ajouterCompte()">+ Rattacher un compte</button></div>
    <p class="aide">Chaque application BFS gère ses comptes : un compte de l'Univers BFS n'accède à BFS CACES
      que s'il est listé ici.</p>
    <table class="tableau"><thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Actif</th><th></th></tr></thead><tbody>
    ${liste.map(f => `<tr class="${f.actif === false ? 'termine' : ''}">
      <td>${esc(((f.nom || '') + ' ' + (f.prenom || '')).trim())}</td><td>${esc(f.email)}</td>
      <td>${esc(LIBELLE_ROLE[f.role] || f.role)}</td><td>${f.actif === false ? 'Non' : 'Oui'}</td>
      <td><button class="lien" onclick="modifierCompte('${esc(f.id)}')">Modifier</button></td></tr>`).join('')}
    </tbody></table>`;
  S._comptes = liste;
}

function ajouterCompte() {
  ouvrirModale('Rattacher un compte', `
    <form class="formulaire" id="form-compte">
      <label>E-mail du compte (déjà créé dans l'Univers BFS) <input type="email" name="email" required></label>
      <label>Nom <input name="nom" required></label>
      <label>Prénom <input name="prenom" required></label>
      <label>Rôle <select name="role">${Object.entries(LIBELLE_ROLE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <button class="principal" type="submit">Rattacher</button>
    </form>`);
  $('#form-compte').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    try {
      const r = await rpc('rattacher_formateur_par_email', { p_email: f.email.value.trim(),
        p_nom: f.nom.value.trim(), p_prenom: f.prenom.value.trim(), p_role: f.role.value });
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
      <label><input type="checkbox" name="actif" ${c.actif === false ? '' : 'checked'}> Compte actif</label>
      <button class="principal" type="submit">Enregistrer</button>
    </form>`);
  $('#form-compte').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    if (id === S.profil.id && (f.role.value !== 'admin' || !f.actif.checked))
      return toast('Tu ne peux pas retirer tes propres droits d\'administrateur.');
    const { error } = await sb.from('formateurs').update({ nom: f.nom.value.trim(),
      prenom: f.prenom.value.trim(), role: f.role.value, actif: f.actif.checked }).eq('id', id);
    if (error) return erreurSupabase('Modification', error);
    toast('Enregistré'); fermerModale(); router();
  });
}
