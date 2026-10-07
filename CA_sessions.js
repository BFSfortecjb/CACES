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
    formateur: admin || s?.formateur_id === S.profil?.id,
    testeur: admin || s?.testeur_id === S.profil?.id,
    ecriture: S.profil?.role === 'admin' || S.profil?.role === 'formateur',
  };
}

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
    </table>
    <div id="alerte-vgp"></div>`;
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
        <label>Agence / centre de déroulement du test
          <select name="centre_examen_id"><option value="">—</option>
            ${S.referentiel.centres.map(c => `<option value="${c.id}">${esc(c.nom)}${c.agence ? ' — ' + esc(c.agence) : ''}</option>`).join('')}</select></label>
        <label>Lieu <input name="lieu" placeholder="Ex : Sèvremont"></label>
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
      const code = genererCodeAcces();
      const { data: s, error } = await sb.from('sessions_formation').insert({
        nom: f.nom.value.trim(), type_session: f.type_session.value, numero_session_galaxy: f.galaxy.value.trim() || null,
        entreprise: f.entreprise.value.trim() || null, date_debut: f.date_debut.value || null,
        formateur_id: f.formateur_id.value, testeur_id: f.testeur_id.value || null,
        centre_examen_id: f.centre_examen_id.value ? Number(f.centre_examen_id.value) : null,
        lieu: f.lieu.value.trim() || null, en_cdt: f.en_cdt.checked, code_acces: code, statut: 'brouillon',
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
  const d = droitsSession(s);

  const [{ data: stagiaires, error }, { data: cats }] = await Promise.all([
    sb.from('stagiaires').select('*, stagiaire_categories(referentiel_code, categorie_code, theorie_validee, pratique_validee)')
      .eq('session_id', s.id).order('ordre').order('nom'),
    sb.from('session_categories').select('referentiel_code, categorie_code').eq('session_id', s.id),
  ]);
  if (error) return erreurSupabase('Lecture des stagiaires', error);
  s._categories = cats || [];

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

    <div class="carte info-passation">
      <div><b>Code à dicter en salle</b><div class="code-geant">${esc(s.code_acces)}</div></div>
      <div><b>Adresse de connexion stagiaires</b><div><code>${esc(lien)}</code></div>
        <button class="lien" onclick="navigator.clipboard.writeText('${esc(lien)}');toast('Lien copié')">Copier le lien</button></div>
      <div><b>N° de session Galaxy</b><div>${esc(s.numero_session_galaxy) || '<i>non renseigné</i>'}</div>
        ${d.ecriture ? '<button class="lien" onclick="modifierNumeroGalaxy()">Modifier</button>' : ''}</div>
      <div><b>Lieu</b><div>${esc(s.lieu) || '<i>non renseigné</i>'}</div>
        ${d.ecriture ? '<button class="lien" onclick="modifierLieuSession()">Modifier</button>' : ''}</div>
      <div><b>Agence (cachet, secrétariat)</b><div>
        <select ${d.ecriture && !cloturee ? '' : 'disabled'} onchange="changerAgenceSession(this.value)">
          <option value="">— à choisir —</option>
          ${(S.referentiel.centres || []).map(c => `<option value="${c.id}" ${c.id === s.centre_examen_id ? 'selected' : ''}>${esc(c.nom)}${c.agence ? ' — ' + esc(c.agence) : ''}</option>`).join('')}</select></div></div>
      <div><b>Formateur (FISE, horomètre)</b><div>
        <select ${d.ecriture ? '' : 'disabled'} onchange="changerFormateurSession(this.value)">
          ${optionsPersonnes(s.formateur_id, null, false, s._categories)}</select></div></div>
      <div><b>Testeur (QCM, pratique)</b><div>
        <select ${d.ecriture ? '' : 'disabled'} onchange="changerTesteurSession(this.value)">
          <option value="">— à affecter —</option>${optionsPersonnes(s.testeur_id, null, true, s._categories)}</select></div></div>
      <details class="qr-repliable">
        <summary><b>QR code examen</b></summary>
        <div id="qr-passation"></div>
        <p id="qr-erreur" class="erreur-discrete" hidden></p>
      </details>
      <div><b>Catégories visées</b><div>${(cats || []).map(c =>
        `<span class="puce">${esc(c.referentiel_code)} ${esc(c.categorie_code)}</span>`).join(' ')}</div></div>
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
      <thead><tr><th>Nom</th><th>Prénom</th><th>Fonction</th><th>Catégories visées</th>
        <th>Actions</th></tr></thead>
      <tbody>${(stagiaires || []).map(st => ligneStagiaire(st, d)).join('')
        || '<tr><td colspan="5" class="vide">Aucun stagiaire. Ajoute-les un par un ou importe un fichier Excel.</td></tr>'}
      </tbody>
    </table>`;

  try {
    if (typeof QRCode === 'undefined') throw new Error('bibliothèque QRCode non chargée');
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
  return `<tr>
    <td>${esc(st.nom)}</td><td>${esc(st.prenom)}</td><td>${esc(st.fonction)}</td>
    <td>${puces}</td>
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
