/* =====================================================================
   CA_sessions.js — onglet Sessions et détail d'une session
   (même organisation qu'Habelec : liste → détail avec stagiaires)

   Séparation des rôles (appliquée aussi en base par RLS) :
     - le FORMATEUR de la session remplit la FISE et le suivi horomètre ;
     - le TESTEUR de la session fait le QCM théorique et la pratique ;
     - le testeur doit être une personne différente du formateur ;
     - l'administrateur peut tout.
   ===================================================================== */

const STATUTS_SESSION = {
  brouillon: 'Brouillon', ouverte: 'Ouverte', theorie_close: 'Théorie close',
  pratique_en_cours: 'Pratique en cours', cloturee: 'Clôturée',
};

/** Droits de l'utilisateur connecté sur la session ouverte (miroir des policies RLS). */
function droitsSession(s) {
  const admin = S.vision === 'admin';
  return {
    formateur: admin || s?.formateur_id === S.profil?.id || (s?._groupes || []).some(g => g.formateur_id === S.profil?.id),
    testeur: admin || s?.testeur_id === S.profil?.id || (s?._testeurs || []).includes(S.profil?.id),
    ecriture: S.profil?.role === 'admin' || S.profil?.role === 'formateur',
  };
}

/** Formateur d'un stagiaire : groupe 1 (groupe_id nul) = formateur de la session ; groupe 2 = formateur du groupe. */
function equipeStagiaire(st, s = S.session) {
  const g = st?.groupe_id ? (s?._groupes || []).find(x => x.id === st.groupe_id) : null;
  return { formateur_id: (st?.groupe_id ? g?.formateur_id : s?.formateur_id) || null };
}
/** Testeurs de la session : testeur principal + liste libre (jamais figés par groupe). */
const testeursSession = s => [...new Set([s?.testeur_id, ...(s?._testeurs || [])].filter(Boolean))];
/** Le testeur donné (par défaut : moi) peut-il tester ce stagiaire ? Testeur de la session, et pas le formateur du stagiaire. */
function peutTesterStagiaire(st, s = S.session, personne = S.profil?.id) {
  if (S.vision === 'admin' && personne === S.profil?.id) return true;
  if (!testeursSession(s).includes(personne)) return false;
  return equipeStagiaire(st, s).formateur_id !== personne || s?.type_session === 'autorisation' || peutCumuler(personne);
}
/** Testeur à enregistrer sur une épreuve : moi si je suis testeur de la session, sinon le testeur principal. */
const testeurDeLEpreuve = (s = S.session) => testeursSession(s).includes(S.profil?.id) ? S.profil.id : (s?.testeur_id || null);

/** Une même personne peut-elle être formateur ET testeur ? (autorisation de conduite, ou dérogation individuelle) */
const peutCumuler = id => !!(S.formateurs || []).find(f => f.id === id)?.cumul_formateur_testeur;
const cumulAutorise = (typeSession, formateurId) => typeSession === 'autorisation' || peutCumuler(formateurId);
const LIBELLE_TYPE_SESSION = { caces: 'CACES', autorisation: 'Autorisation de conduite' };

function genererCodeAcces(longueur = 6) {
  // Sans caractères ambigus (0/O, 1/I) : le code est dicté à voix haute en salle
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: longueur }, () => alpha[Math.floor(Math.random() * alpha.length)]).join('');
}

/* ====================== Liste des sessions ========================== */
async function rendreSessions(zone) {
  zone.innerHTML = '<p class="chargement">Chargement des sessions…</p>';
  const { data, error } = await sb.from('sessions_formation')
    .select('*, stagiaires(count), session_categories(referentiel_code, categorie_code)')
    .order('date_creation', { ascending: false });
  if (error) return erreurSupabase('Lecture des sessions', error);
  const peutEcrire = S.profil?.role === 'admin' || S.profil?.role === 'formateur';

  zone.innerHTML = `
    <details class="repliable" id="det-vgp" hidden><summary><b>VGP des engins du centre</b> <span id="sum-vgp"></span></summary><div id="alerte-vgp"></div></details>
    <details class="repliable" id="det-reperages"><summary><b>Repérages clients (visites préalables intra)</b> <span id="sum-reperages"></span></summary><div id="reperages"></div></details>
    <div class="barre-actions">
      <h2>Sessions de formation</h2>
      ${peutEcrire ? '<button class="principal" onclick="nouvelleSession()">+ Nouvelle session</button>' : ''}
    </div>
    <table class="tableau">
      <thead><tr><th>Intitulé</th><th>N° Galaxy</th><th>Entreprise</th><th>Début</th><th>Catégories</th>
        <th>Formateur</th><th>Testeur</th><th>Code d'accès</th><th>Statut</th><th>Stagiaires</th><th></th></tr></thead>
      <tbody>${(data || []).map(s => `
        <tr>
          <td><a href="#" onclick="ouvrirSession('${s.id}');return false">${esc(s.nom)}</a></td>
          <td>${esc(s.numero_session_galaxy)}</td>
          <td>${esc(s.entreprise)}</td>
          <td>${dateFr(s.date_debut)}</td>
          <td>${(s.session_categories || []).map(c =>
            `<span class="puce">${esc(c.referentiel_code)} ${esc(c.categorie_code)}</span>`).join(' ')}</td>
          <td>${esc(nomFormateur(s.formateur_id))}</td>
          <td>${esc(nomFormateur(s.testeur_id)) || '<i>à affecter</i>'}</td>
          <td><code class="code-acces">${esc(s.code_acces)}</code></td>
          <td><span class="etat ${s.statut === 'cloturee' ? 'cloturee' : s.statut === 'ouverte' ? 'ouverte' : ''}">${esc(STATUTS_SESSION[s.statut] || s.statut)}</span></td>
          <td>${s.stagiaires?.[0]?.count ?? 0}</td>
          <td>${S.vision === 'admin' ? `<button class="icone" title="Supprimer la session"
                onclick="supprimerSession('${s.id}')">🗑</button>` : ''}</td>
        </tr>`).join('') || '<tr><td colspan="11" class="vide">Aucune session pour le moment.</td></tr>'}
      </tbody>
    </table>`;
  if (typeof rendreReperages === 'function') rendreReperages($('#reperages'));
  if (typeof rendreAlerteVgp === 'function') rendreAlerteVgp($('#alerte-vgp'));
}

/* ====================== Création d'une session ====================== */
function optionsPersonnes(selectionne, exclureId, seulementTesteurs = false, categories = null) {
  const fonction = seulementTesteurs ? 'testeur' : 'formateur';
  return (S.formateurs || []).filter(f => f.id !== exclureId && f.role !== 'secretariat' && (!seulementTesteurs || f.est_testeur !== false)
      && (f.id === selectionne || !categories || habilite(f.id, fonction, categories))).map(f =>
    `<option value="${f.id}" ${f.id === selectionne ? 'selected' : ''}>${esc(((f.nom || '') + ' ' + (f.prenom || '')).trim() || f.email)}</option>`).join('');
}

function cases_categories(selection = []) {
  const sel = new Set(selection.map(c => c.referentiel_code + '|' + c.categorie_code));
  return S.referentiel.referentiels.map(r => `
    <div class="groupe-symboles"><b>${esc(r.code)} — ${esc(r.libelle)}</b>
      ${S.referentiel.categories.filter(c => c.referentiel_code === r.code).map(c => `
        <label class="case"><input type="checkbox" name="categorie" value="${esc(r.code)}|${esc(c.code)}"
          ${sel.has(r.code + '|' + c.code) ? 'checked' : ''}> ${esc(c.code)}
          <span class="aide">${esc(c.libelle)}</span></label>`).join('')}
    </div>`).join('');
}

function nouvelleSession() {
  ouvrirModale('Nouvelle session', `
    <form id="form-session" class="formulaire">
      <div class="grille-2">
        <label>Type de session
          <select name="type_session" id="type-session">
            <option value="caces">CACES (test + carton)</option>
            <option value="autorisation">Autorisation de conduite</option></select></label>
        <label>N° de session Galaxy <b id="galaxy-oblig">(obligatoire)</b>
          <input name="galaxy" id="galaxy-champ" required placeholder="Ex : 12345"></label>
        <label>Intitulé <input name="nom" required value="CACES — ${new Date().getFullYear()}"></label>
        <label>Entreprise (client) <input name="entreprise"></label>
        <label>Date de début <input type="date" name="date_debut" value="${new Date().toISOString().slice(0, 10)}"></label>
        <label>Date de fin <span class="aide">(si la formation dure plusieurs jours)</span> <input type="date" name="date_fin"></label>
        <label>Formateur de la session
          <select name="formateur_id">${optionsPersonnes(S.profil.id)}</select></label>
        <label>Testeur de la session <span class="aide" id="aide-testeur">(différent du formateur)</span>
          <select name="testeur_id"><option value="">— à affecter —</option>${optionsPersonnes(null, null, true)}</select></label>
        <label>Lieu de réalisation des tests
          <select name="lieu_choix">${S.referentiel.centres.map(c => `<option value="${c.id}">${esc(c.nom)}${c.agence ? ' — ' + esc(c.agence) : ''}</option>`).join('')}
            <option value="client">Chez le client (intra) — repérage client obligatoire</option></select></label>
        <label id="bloc-agence-org" hidden>Agence organisatrice (cachet, secrétariat)
          <select name="agence_org"><option value="">—</option>${S.referentiel.centres.map(c => `<option value="${c.id}">${esc(c.nom)}${c.agence ? ' — ' + esc(c.agence) : ''}</option>`).join('')}</select></label>
        <label class="case"><input type="checkbox" name="en_cdt"> Test en conditions de travail (CDT)</label>
      </div>
      <fieldset><legend>Catégories de CACES visées</legend>${cases_categories()}</fieldset>
      <div class="pied-modale">
        <button type="button" onclick="fermerModale()">Annuler</button>
        <button type="submit" class="principal">Créer la session</button>
      </div>
    </form>`);

  // Formateur et testeur proposés : ceux habilités pour toutes les catégories cochées
  const majPersonnes = () => {
    const cats = $$('#form-session input[name=categorie]:checked').map(i => { const [referentiel_code, categorie_code] = i.value.split('|'); return { referentiel_code, categorie_code }; });
    const ff = $('#form-session [name=formateur_id]'), tt = $('#form-session [name=testeur_id]');
    const f0 = ff.value || S.profil.id, t0 = tt.value;
    ff.innerHTML = optionsPersonnes(f0, null, false, cats);
    tt.innerHTML = '<option value="">— à affecter —</option>' + optionsPersonnes(t0, null, true, cats);
  };
  $$('#form-session input[name=categorie]').forEach(i => i.addEventListener('change', majPersonnes));
  $('#form-session [name=lieu_choix]').addEventListener('change', e => { $('#bloc-agence-org').hidden = e.target.value !== 'client'; });

  $('#type-session').addEventListener('change', e => {
    const aut = e.target.value === 'autorisation';
    $('#galaxy-champ').required = !aut;
    $('#galaxy-oblig').textContent = aut ? '(facultatif)' : '(obligatoire)';
    $('#aide-testeur').textContent = aut ? '(peut être le formateur)' : '(différent du formateur)';
    $('#form-session [name=nom]').value = (aut ? 'Autorisation de conduite — ' : 'CACES — ') + new Date().getFullYear();
  });
  $('#form-session').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    const categories = $$('#form-session input[name=categorie]:checked').map(i => {
      const [referentiel_code, categorie_code] = i.value.split('|');
      return { referentiel_code, categorie_code };
    });
    if (!categories.length) return toast('Coche au moins une catégorie visée', 'erreur');
    if (f.testeur_id.value && f.testeur_id.value === f.formateur_id.value && !cumulAutorise(f.type_session.value, f.formateur_id.value)) {
      return toast('Le testeur doit être une personne différente du formateur.', 'erreur', 6000);
    }
    try {
      const code = genererCodeAcces(), lieuClient = f.lieu_choix.value === 'client';
      const { data: s, error } = await sb.from('sessions_formation').insert({
        nom: f.nom.value.trim(), type_session: f.type_session.value, numero_session_galaxy: f.galaxy.value.trim() || null,
        entreprise: f.entreprise.value.trim() || null, date_debut: f.date_debut.value || null,
        formateur_id: f.formateur_id.value, testeur_id: f.testeur_id.value || null,
        centre_examen_id: lieuClient ? (f.agence_org.value ? Number(f.agence_org.value) : null) : Number(f.lieu_choix.value),
        lieu: lieuClient ? 'Chez le client (intra)' : ((S.referentiel.centres.find(c => c.id === Number(f.lieu_choix.value)) || {}).nom || null),
        lieu_type: lieuClient ? 'client' : 'centre', en_cdt: f.en_cdt.checked, code_acces: code, statut: 'brouillon',
      }).select().single();
      if (error) throw error;
      if (f.date_fin.value && f.date_debut.value && f.date_fin.value >= f.date_debut.value) {
        const jours = [], d0 = new Date(f.date_debut.value + 'T12:00:00'), d1 = new Date(f.date_fin.value + 'T12:00:00');
        for (let d = d0; d <= d1 && jours.length < 31; d.setDate(d.getDate() + 1))
          jours.push({ session_id: s.id, jour: d.toISOString().slice(0, 10), type: 'formation' });
        await sb.from('session_jours').insert(jours);
      }
      const { error: e2 } = await sb.from('session_categories')
        .insert(categories.map(c => ({ session_id: s.id, ...c })));
      if (e2) throw e2;
      fermerModale();
      toast('Session créée — code d\'accès ' + code);
      rendreSessions($('#contenu'));
    } catch (e) { erreurSupabase('Création de la session', e); }
  });
}

async function supprimerSession(id) {
  if (!confirmer('Supprimer définitivement cette session et tous ses résultats ?')) return;
  const { error } = await sb.from('sessions_formation').delete().eq('id', id);
  if (error) return erreurSupabase('Suppression', error);
  toast('Session supprimée');
  rendreSessions($('#contenu'));
}

async function ouvrirSession(id) {
  const { data, error } = await sb.from('sessions_formation').select('*').eq('id', id).single();
  if (error) return erreurSupabase('Ouverture de la session', error);
  S.session = data; S.ecran = 'session';
  ecranFormateur($('#ecran'));
}

/* ====================== Modifications de la session ================== */
async function modifierChampSession(champ, valeur, libelle) {
  const { error } = await sb.from('sessions_formation').update({ [champ]: valeur }).eq('id', S.session.id);
  if (error) return erreurSupabase('Modification — ' + libelle, error);
  S.session[champ] = valeur;
}

async function modifierNumeroGalaxy() {
  const v = prompt('N° de session Galaxy :', S.session.numero_session_galaxy || '');
  if (v === null || v.trim() === '') return;
  await modifierChampSession('numero_session_galaxy', v.trim(), 'n° Galaxy');
  rendreDetailSession($('#contenu'));
}

async function modifierLieuSession() {
  const v = prompt('Lieu de la session :', S.session.lieu || '');
  if (v === null) return;
  await modifierChampSession('lieu', v.trim() || null, 'lieu');
  rendreDetailSession($('#contenu'));
}

async function modifierCategoriesSession() {
  const sess = S.session;
  ouvrirModale('Catégories de la session', `
    <form id="form-cats" class="formulaire">
      <fieldset><legend>Catégories de CACES visées</legend>${cases_categories(sess._categories || [])}</fieldset>
      <p class="aide">Les catégories déjà attribuées aux stagiaires et leurs résultats ne sont pas modifiés : à régler stagiaire par stagiaire. Le formateur et le testeur doivent être habilités pour les catégories choisies.</p>
      <div class="pied-modale"><button type="button" onclick="fermerModale()">Annuler</button><button type="submit" class="principal">Enregistrer</button></div>
    </form>`);
  $('#form-cats').addEventListener('submit', async ev => {
    ev.preventDefault();
    const choix = $$('#form-cats input[name=categorie]').filter(i => i.checked).map(i => { const [r, c] = i.value.split('|'); return { referentiel_code: r, categorie_code: c }; });
    if (!choix.length) return toast('Choisis au moins une catégorie', 'erreur');
    try {
      const cle = c => c.referentiel_code + '|' + c.categorie_code, nouv = new Set(choix.map(cle)), anc = new Set((sess._categories || []).map(cle));
      for (const c of sess._categories || []) if (!nouv.has(cle(c))) {
        const { error } = await sb.from('session_categories').delete().eq('session_id', sess.id).eq('referentiel_code', c.referentiel_code).eq('categorie_code', c.categorie_code);
        if (error) throw error;
      }
      const ajout = choix.filter(c => !anc.has(cle(c))).map(c => ({ session_id: sess.id, ...c }));
      if (ajout.length) { const { error } = await sb.from('session_categories').insert(ajout); if (error) throw error; }
      fermerModale(); toast('Catégories mises à jour'); rendreDetailSession($('#contenu'));
    } catch (e) { erreurSupabase('Modification des catégories', e); }
  });
}

async function changerAgenceSession(id) {
  await modifierChampSession('centre_examen_id', id ? Number(id) : null, 'agence');
  toast('Agence de la session mise à jour');
  rendreDetailSession($('#contenu'));
}

async function changerFormateurSession(id) {
  if (id && id === S.session.testeur_id && !cumulAutorise(S.session.type_session, id)) {
    toast('Le formateur ne peut pas être aussi le testeur de la session.', 'erreur', 6000);
    return rendreDetailSession($('#contenu'));
  }
  await modifierChampSession('formateur_id', id, 'formateur');
  toast('Formateur de la session mis à jour');
  rendreDetailSession($('#contenu'));
}

/* ====================== Groupes (2 maximum) ====================== */
async function scinderSession() {
  if (!confirmer('Scinder la session en 2 groupes ? Le formateur actuel reste celui du groupe 1 ; tu affectes ensuite le formateur du groupe 2. Les testeurs restent libres : ajoute-les dans « Autres testeurs » (chacun peut tester tous les stagiaires sauf les siens).')) return;
  const { error } = await sb.from('session_groupes').insert({ session_id: S.session.id, numero: 2 });
  if (error) return erreurSupabase('Création du groupe 2', error);
  toast('Groupe 2 créé : affecte son formateur, puis répartis les stagiaires');
  rendreDetailSession($('#contenu'));
}
async function changerEquipeGroupe(champ, id) {
  const g = S.session._groupes[0]; if (!g) return;
  const { error } = await sb.from('session_groupes').update({ [champ]: id || null }).eq('id', g.id);
  if (error) { erreurSupabase('Formateur du groupe 2', error); return rendreDetailSession($('#contenu')); }
  toast('Formateur du groupe 2 mis à jour');
  rendreDetailSession($('#contenu'));
}
async function ajouterTesteurSession(id) {
  if (!id) return;
  if (testeursSession(S.session).includes(id)) { toast('Déjà testeur de la session.', 'erreur'); return rendreDetailSession($('#contenu')); }
  const { error } = await sb.from('session_testeurs').insert({ session_id: S.session.id, testeur_id: id });
  if (error) erreurSupabase('Ajout d\'un testeur', error); else toast('Testeur ajouté');
  rendreDetailSession($('#contenu'));
}
async function retirerTesteurSession(id) {
  if (!confirmer('Retirer ce testeur de la session ? Ses résultats déjà enregistrés sont conservés.')) return;
  const { error } = await sb.from('session_testeurs').delete().eq('session_id', S.session.id).eq('testeur_id', id);
  if (error) erreurSupabase('Retrait du testeur', error); else toast('Testeur retiré');
  rendreDetailSession($('#contenu'));
}
async function supprimerGroupe2() {
  if (!confirmer('Supprimer le groupe 2 ? Ses stagiaires repassent dans le groupe 1.')) return;
  const { error } = await sb.from('session_groupes').delete().eq('session_id', S.session.id);
  if (error) return erreurSupabase('Suppression du groupe 2', error);
  toast('Groupe 2 supprimé');
  rendreDetailSession($('#contenu'));
}
async function changerGroupeStagiaire(stagiaireId, valeur) {
  const g = (S.session._groupes || [])[0];
  const { error } = await sb.from('stagiaires').update({ groupe_id: valeur === '2' && g ? g.id : null }).eq('id', stagiaireId);
  if (error) erreurSupabase('Changement de groupe', error);
  rendreDetailSession($('#contenu'));
}

async function changerTesteurSession(id) {
  if (id && id === S.session.formateur_id && !cumulAutorise(S.session.type_session, id)) {
    toast('Le testeur doit être une personne différente du formateur.', 'erreur', 6000);
    return rendreDetailSession($('#contenu'));
  }
  await modifierChampSession('testeur_id', id || null, 'testeur');
  toast('Testeur de la session mis à jour');
  rendreDetailSession($('#contenu'));
}

async function basculerOuverture() {
  const s = S.session;
  const statut = s.statut === 'ouverte' ? 'brouillon' : 'ouverte';
  await modifierChampSession('statut', statut, 'statut');
  if (statut === 'ouverte') await modifierChampSession('date_ouverture', new Date().toISOString(), 'ouverture');
  rendreDetailSession($('#contenu'));
}

async function cloturerSession() {
  if (!confirmer('Clôturer la session ? Elle sera verrouillée et les données personnelles pourront être purgées selon le délai réglé en Organisme.')) return;
  await modifierChampSession('statut', 'cloturee', 'statut');
  await modifierChampSession('date_cloture', new Date().toISOString(), 'clôture');
  rendreDetailSession($('#contenu'));
}

/* ====================== Code couleur par catégorie =================== */
// null = pas encore évalué ; true/false = réussi / échoué (jamais confondus).
function classeCategorie(sc) {
  const t = sc?.theorie_validee, p = sc?.pratique_validee;
  if (t === null || t === undefined) return 'titre-gris-clair';
  if (p === null || p === undefined) return t ? 'titre-vert-clair' : 'titre-rouge-clair';
  if (t && p) return 'titre-vert-fonce';
  if (!t && !p) return 'titre-rouge-fonce';
  if (!t && p) return 'titre-orange-fonce';
  return 'titre-orange-clair';
}
const LIBELLE_CLASSE_TITRE = {
  'titre-gris-clair': 'En attente (pas encore évalué)',
  'titre-vert-clair': 'Théorie réussie, pratique en attente',
  'titre-rouge-clair': 'Théorie échouée',
  'titre-vert-fonce': 'Théorie et pratique réussies',
  'titre-rouge-fonce': 'Théorie et pratique échouées',
  'titre-orange-fonce': 'Théorie échouée, pratique réussie',
  'titre-orange-clair': 'Théorie réussie, pratique échouée',
};

/* ====================== Détail d'une session ========================= */
async function rendreDetailSession(zone) {
  const s = S.session;
  zone.innerHTML = '<p class="chargement">Chargement…</p>';

  const [{ data: stagiaires, error }, { data: cats }, { data: groupes }] = await Promise.all([
    sb.from('stagiaires').select('*, stagiaire_categories(referentiel_code, categorie_code, theorie_validee, pratique_validee)')
      .eq('session_id', s.id).order('ordre').order('nom'),
    sb.from('session_categories').select('referentiel_code, categorie_code').eq('session_id', s.id),
    sb.from('session_groupes').select('*').eq('session_id', s.id).order('numero'),
  ]);
  if (error) return erreurSupabase('Lecture des stagiaires', error);
  s._categories = cats || [];
  s._groupes = groupes || [];
  s._testeurs = ((await sb.from('session_testeurs').select('testeur_id').eq('session_id', s.id)).data || []).map(x => x.testeur_id);
  const d = droitsSession(s);

  const engins = typeof resumeEnginsSession === 'function' ? await resumeEnginsSession(s.id) : { nb: 0, rouges: 0 };
  const bandeauUt = (typeof bandeauChargeTesteur === 'function' && s.type_session !== 'autorisation') ? await bandeauChargeTesteur(s) : '';
  const lien = location.origin + location.pathname + '#stagiaire?code=' + encodeURIComponent(s.code_acces);
  const cloturee = s.statut === 'cloturee';

  zone.innerHTML = `
    <button class="lien" onclick="retour('sessions')">← Toutes les sessions</button>
    <div class="barre-actions">
      <h2>${esc(s.nom)} <span class="prat-badge">${esc(LIBELLE_TYPE_SESSION[s.type_session] || 'CACES')}</span></h2>
      <div>
        ${!cloturee && d.ecriture ? `<button class="principal" onclick="basculerOuverture()">
          ${s.statut === 'ouverte' ? '⏸ Fermer l\'accès stagiaires' : '▶ Ouvrir l\'accès stagiaires'}</button>` : ''}
        ${!cloturee && d.ecriture ? `<button title="Verrouille la session" onclick="cloturerSession()">🔒 Clôturer la session</button>`
          : (cloturee ? '<span class="etat cloturee">🔒 Session clôturée</span>' : '')}
      </div>
    </div>

    <div class="carte fiche-session">
      <section class="bloc">
        <h4>Accès stagiaires</h4>
        <div class="acces-stagiaires">
          <div class="champ"><span class="etiquette">Code à dicter en salle</span><div class="code-geant">${esc(s.code_acces)}</div></div>
          <div class="champ champ-large"><span class="etiquette">Adresse de connexion</span><div><code>${esc(lien)}</code></div>
            <button class="lien" onclick="navigator.clipboard.writeText('${esc(lien)}');toast('Lien copié')">Copier le lien</button></div>
          <details class="qr-repliable">
            <summary><b>QR code examen</b></summary>
            <div id="qr-passation"></div>
            <p id="qr-erreur" class="erreur-discrete" hidden></p>
          </details>
        </div>
      </section>

      <section class="bloc">
        <h4>Session</h4>
        <div class="grille-champs">
          <div class="champ"><span class="etiquette">N° de session Galaxy</span>
            <div class="valeur">${esc(s.numero_session_galaxy) || '<i>non renseigné</i>'}
              ${d.ecriture ? '<button class="lien" onclick="modifierNumeroGalaxy()">Modifier</button>' : ''}</div></div>
          <div class="champ"><span class="etiquette">Lieu des tests</span>
            <select ${d.ecriture && !cloturee ? '' : 'disabled'} onchange="changerLieuSession(this.value)">
              ${(S.referentiel.centres || []).map(c => `<option value="${c.id}" ${s.lieu_type !== 'client' && c.id === s.centre_examen_id ? 'selected' : ''}>${esc(c.nom)}${c.agence ? ' — ' + esc(c.agence) : ''}</option>`).join('')}
              <option value="client" ${s.lieu_type === 'client' ? 'selected' : ''}>Chez le client (intra)</option></select>
            ${s.lieu_type === 'client' ? '<div id="visite-statut"></div><button class="principal" onclick="ouvrirVisitePrealable()">📋 Repérage client</button>' : ''}</div>
          ${s.lieu_type === 'client' ? `<div class="champ"><span class="etiquette">Agence organisatrice (cachet, secrétariat)</span>
            <select ${d.ecriture && !cloturee ? '' : 'disabled'} onchange="changerAgenceSession(this.value)">
              <option value="">— à choisir —</option>
              ${(S.referentiel.centres || []).map(c => `<option value="${c.id}" ${c.id === s.centre_examen_id ? 'selected' : ''}>${esc(c.nom)}${c.agence ? ' — ' + esc(c.agence) : ''}</option>`).join('')}</select></div>` : ''}
          <div class="champ"><span class="etiquette">Catégories visées</span>
            <div class="valeur">${s._categories.map(c => `<span class="puce">${esc(c.referentiel_code)} ${esc(c.categorie_code)}</span>`).join(' ') || '<i>aucune</i>'}
              ${d.ecriture && !cloturee ? '<button class="lien" onclick="modifierCategoriesSession()">Modifier</button>' : ''}</div></div>
        </div>
      </section>

      <section class="bloc">
        <h4>Équipe</h4>
        <div class="grille-champs">
          <div class="champ"><span class="etiquette">Formateur${s._groupes.length ? ' — groupe 1' : ''} <small>(FISE, horomètre)</small></span>
            <select ${d.ecriture ? '' : 'disabled'} onchange="changerFormateurSession(this.value)">
              ${optionsPersonnes(s.formateur_id, null, false, s._categories)}</select></div>
          ${s._groupes.length ? s._groupes.map(g => `<div class="champ"><span class="etiquette">Formateur — groupe 2 <small>(FISE, horomètre)</small></span>
            <select ${d.ecriture && !cloturee ? '' : 'disabled'} onchange="changerEquipeGroupe('formateur_id', this.value)">
              <option value="">— à affecter —</option>${optionsPersonnes(g.formateur_id, null, false, s._categories)}</select>
            ${d.ecriture && !cloturee ? '<button class="lien" onclick="supprimerGroupe2()">Supprimer le groupe 2</button>' : ''}</div>`).join('')
            : (d.ecriture && !cloturee && s.type_session === 'caces' ? '<div class="champ"><span class="etiquette">Groupes</span><button onclick="scinderSession()" title="Répartit les stagiaires en 2 groupes, chacun avec son formateur ; les testeurs restent libres (sauf pour leurs propres stagiaires)">✂ Scinder en 2 groupes</button></div>' : '')}
          <div class="champ"><span class="etiquette">Testeur principal <small>(QCM, pratique)</small></span>
            <select ${d.ecriture ? '' : 'disabled'} onchange="changerTesteurSession(this.value)">
              <option value="">— à affecter —</option>${optionsPersonnes(s.testeur_id, null, true, s._categories)}</select></div>
          <div class="champ"><span class="etiquette">Autres testeurs</span>
            <div class="valeur">${(s._testeurs || []).map(t => `<span class="puce">${esc(nomFormateur(t))}${d.ecriture && !cloturee ? ` <button class="icone" title="Retirer" onclick="retirerTesteurSession('${t}')">✕</button>` : ''}</span>`).join(' ') || '<i>aucun</i>'}</div>
            ${d.ecriture && !cloturee ? `<select onchange="ajouterTesteurSession(this.value)"><option value="">+ Ajouter un testeur…</option>${optionsPersonnes(null, null, true, s._categories)}</select>` : ''}
            <div class="aide">Tous les stagiaires, sauf ceux dont il est le formateur.</div></div>
        </div>
      </section>
    </div>

    ${bandeauUt}
    <div class="carte">
      <b>🚜 Engins utilisés :</b> ${engins.nb}${engins.rouges ? ` <span class="etat erreur">${engins.rouges} non conforme(s)</span>` : ''}
      <button onclick="appelModule('ouvrirEnginsSession')">Renseigner les engins</button>
      ${d.formateur ? `<button onclick="appelModule('ouvrirHorometreSession')">⏱ Horomètre (pointage)</button>` : ''}
      <button onclick="appelModule('ouvrirDocumentsSession')">📎 Documents de la session</button>
      <button onclick="appelModule('ouvrirPlanning')">📅 Planning (jours de formation / de test)</button>
      ${d.ecriture ? `<button onclick="appelModule('envoyerSecretariat')">✉️ Envoi au secrétariat</button>` : ''}
    </div>
    <div class="barre-actions">
      <h3>Stagiaires (${(stagiaires || []).length})</h3>
      <div>
        <button onclick="modeleExcelStagiaires()" title="Télécharger un modèle Excel">⬇ Modèle Excel</button>
        ${!cloturee && d.ecriture ? `<label class="bouton-fichier" title="Importer une liste de stagiaires">⬆ Importer Excel
          <input type="file" accept=".xlsx,.xls,.csv" hidden onchange="importerStagiairesExcel(this)"></label>
        <button class="principal" onclick="editerStagiaire(null)">+ Ajouter</button>` : ''}
      </div>
    </div>

    <table class="tableau">
      <thead><tr><th>Nom</th><th>Prénom</th><th>Fonction</th><th>Catégories visées</th>${s._groupes.length ? '<th>Groupe</th>' : ''}
        <th>Actions</th></tr></thead>
      <tbody>${(stagiaires || []).map(st => ligneStagiaire(st, d)).join('')
        || '<tr><td colspan="6" class="vide">Aucun stagiaire. Ajoute-les un par un ou importe un fichier Excel.</td></tr>'}
      </tbody>
    </table>`;

  try {
    if (typeof QRCode === 'undefined') throw new Error('bibliothèque QRCode non chargée');
    if (s.lieu_type === 'client') statutVisiteHtml(s).then(h => { const z = $('#visite-statut'); if (z) z.innerHTML = h; });
    $('#qr-passation').innerHTML = '';
    new QRCode($('#qr-passation'), { text: lien, width: 140, height: 140 });
  } catch (e) { const p = $('#qr-erreur'); if (p) { p.hidden = false; p.textContent = 'QR code indisponible : ' + e.message; } }
}

/** Ligne stagiaire : les boutons réservés à l'autre rôle sont grisés (la base les refuserait de toute façon). */
function ligneStagiaire(st, d) {
  const puces = (st.stagiaire_categories || []).map(sc => {
    const cl = classeCategorie(sc);
    return `<span class="puce ${cl}" title="${esc(LIBELLE_CLASSE_TITRE[cl])}">${esc(sc.referentiel_code)} ${esc(sc.categorie_code)}</span>`;
  }).join(' ') || '<i>aucune</i>';
  const btn = (autorise, icone, titre, appel, raison) => `<button class="icone" ${autorise ? '' : 'disabled'}
      title="${esc(autorise ? titre : titre + ' — ' + raison)}" onclick="${appel}">${icone}</button>`;
  const id = st.id;
  const admin = S.vision === 'admin', eq = equipeStagiaire(st);
  d = { ...d, formateur: admin || eq.formateur_id === S.profil?.id, testeur: peutTesterStagiaire(st) };
  const groupes = S.session?._groupes || [];
  const celluleGroupe = !groupes.length ? '' : `<td><select ${d.ecriture && S.session.statut !== 'cloturee' ? '' : 'disabled'} onchange="changerGroupeStagiaire('${id}', this.value)">
      <option value="1" ${st.groupe_id ? '' : 'selected'}>Groupe 1</option><option value="2" ${st.groupe_id ? 'selected' : ''}>Groupe 2</option></select></td>`;
  return `<tr>
    <td>${esc(st.nom)}</td><td>${esc(st.prenom)}</td><td>${esc(st.fonction)}</td>
    <td>${puces}</td>${celluleGroupe}
    <td class="actions">
      ${btn(d.formateur, '📋', 'FISE — évaluation en formation (formateur)', `appelModule('ouvrirFise','${id}')`, 'réservé au formateur de la session')}
      ${btn(d.formateur, '⏱', 'Suivi horomètre (formateur)', `appelModule('ouvrirHorometre','${id}')`, 'réservé au formateur de la session')}
      ${btn(d.testeur, '📝', 'QCM théorique (testeur)', `appelModule('ouvrirTheorieProtegee','${id}')`, 'réservé au testeur de la session')}
      ${btn(d.testeur, '🔧', 'Évaluation pratique (testeur)', `appelModule('ouvrirPratiqueProtegee','${id}')`, 'réservé au testeur de la session')}
      <button class="icone" title="Plus d'actions"
        onclick="ouvrirActionsStagiaire('${id}', '${escJs(st.nom)}', '${escJs(st.prenom)}')">👁</button>
    </td></tr>`;
}

/** Appelle un module livré dans un fichier séparé ; message clair s'il n'est pas encore là. */
function appelModule(nom, ...args) {
  if (typeof window[nom] === 'function') return window[nom](...args);
  toast('Cet écran est en cours de construction.', 'erreur');
}

/** Les écrans testeur ne s'ouvrent qu'après saisie du code testeur. */
async function ouvrirTheorieProtegee(stagiaireId) {
  const sid = S.session.id;
  if (!(await exigerCodeTesteur(sid))) return;
  appelModule('ouvrirTheorie', stagiaireId);
}
async function ouvrirPratiqueProtegee(stagiaireId) {
  const sid = S.session.id;
  if (!(await exigerCodeTesteur(sid))) return;
  appelModule('ouvrirPratique', stagiaireId);
}
