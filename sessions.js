// © 2026 Admin Formation — Jérémy Bizeul — SARL Prévisecours. Tous droits réservés.
// sessions.js — écran Sessions : liste, création, et détail d'une session
// (inscription de stagiaires avec dédoublonnage, FISE = grille de
// certification, évaluation de satisfaction). Un formateur ne voit et ne peut
// modifier (statut, FISE, évaluation) que les sessions où il est assigné —
// la RLS sur sessions_formation/session_participants l'impose déjà côté base,
// cet écran adapte simplement l'affichage (pas de bouton "nouvelle session"
// ni de suppression de participant pour un formateur).

// Les 10 critères du questionnaire de satisfaction (repris tels quels de
// l'onglet "BDstagiaire" du classeur Excel).
const QUESTIONS_SATISFACTION = [
  "Qualité de l'organisation",
  "Clarté des objectifs",
  "Qualité du formateur",
  "Pertinence des méthodes pédagogiques du formateur",
  "Le formateur donne l'envie d'apprendre",
  "Qualité du matériel",
  "La formation correspondait-elle à mes attentes",
  "Etes-vous prêt à mettre en œuvre ces gestes et techniques",
  "La durée de la formation m'a paru adaptée",
  "Le rythme de la formation m'a paru adapté",
];

const PEUT_GERER_SESSIONS = () => ['admin', 'gestionnaire', 'super_admin'].includes(S.vision);

// Origines de financement d'une session, alignées sur le cadre C du Bilan
// Pédagogique et Financier (BPF) — permet de répartir automatiquement les
// produits de l'organisme par origine lors du calcul du BPF (voir bpf.js).
const ORIGINES_FINANCEMENT = [
  { groupe: 'Entreprise / particulier', options: [
    { valeur: 'entreprise', libelle: 'Entreprise (salariés)' },
    { valeur: 'particulier', libelle: 'Particulier (à ses frais)' },
  ]},
  { groupe: 'Organismes gestionnaires des fonds de la formation (OPCO...)', options: [
    { valeur: 'apprentissage', libelle: 'Contrat d\'apprentissage' },
    { valeur: 'professionnalisation', libelle: 'Contrat de professionnalisation' },
    { valeur: 'alternance_pro', libelle: 'Promotion ou reconversion par alternance' },
    { valeur: 'transition_pro', libelle: 'Projet de transition professionnelle' },
    { valeur: 'cpf', libelle: 'Compte personnel de formation (CPF)' },
    { valeur: 'recherche_emploi', libelle: 'Dispositif personnes en recherche d\'emploi' },
    { valeur: 'tns', libelle: 'Dispositif travailleurs non-salariés' },
    { valeur: 'plan_competences', libelle: 'Plan de développement des compétences / autre dispositif' },
  ]},
  { groupe: 'Pouvoirs publics', options: [
    { valeur: 'agents_publics', libelle: 'Formation d\'agents publics' },
    { valeur: 'instances_europeennes', libelle: 'Instances européennes' },
    { valeur: 'etat', libelle: 'État' },
    { valeur: 'collectivites', libelle: 'Conseil régional / collectivité' },
    { valeur: 'france_travail', libelle: 'France Travail (ex Pôle emploi)' },
    { valeur: 'autres_publics', libelle: 'Autres ressources publiques' },
  ]},
  { groupe: 'Autre', options: [
    { valeur: 'autre_organisme', libelle: 'Autre organisme de formation (y compris CFA)' },
    { valeur: 'autres_produits', libelle: 'Autres produits de formation professionnelle' },
  ]},
];

function libelleOrigineFinancement(valeur) {
  for (const g of ORIGINES_FINANCEMENT) {
    const o = g.options.find(o => o.valeur === valeur);
    if (o) return o.libelle;
  }
  return valeur;
}

// Statuts existants sur sessions_formation, dans l'ordre d'affichage du filtre.
const STATUTS_SESSION = ['planifiee', 'confirmee', 'en_cours', 'terminee', 'annulee'];

// Toutes les sessions chargées une fois par passage sur l'écran, puis
// filtrées côté client (recherche texte + statut + période) pour une
// recherche instantanée sans aller-retour serveur à chaque frappe.
window.__sessionsToutes = [];

async function ecranSessions(vue) {
  vue.innerHTML = `
    <div class="carte" style="display:flex;justify-content:space-between;align-items:center;">
      <h2 style="margin:0;">Sessions</h2>
      ${PEUT_GERER_SESSIONS() ? '<button class="bouton" onclick="ecranNouvelleSession($(\'#vue\'))">+ Nouvelle session</button>' : ''}
    </div>
    <div class="carte">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
        <div style="flex:2;min-width:200px;">
          <label for="filtre-texte">Rechercher</label>
          <input id="filtre-texte" placeholder="Client, formation, lieu…" oninput="filtrerEtAfficherSessions()">
        </div>
        <div style="flex:1;min-width:150px;">
          <label for="filtre-statut">Statut</label>
          <select id="filtre-statut" onchange="filtrerEtAfficherSessions()">
            <option value="">Tous</option>
            ${STATUTS_SESSION.map(s => `<option value="${s}">${esc(s)}</option>`).join('')}
          </select>
        </div>
        <div style="flex:1;min-width:140px;">
          <label for="filtre-date-debut">Du</label>
          <input id="filtre-date-debut" type="date" onchange="filtrerEtAfficherSessions()">
        </div>
        <div style="flex:1;min-width:140px;">
          <label for="filtre-date-fin">Au</label>
          <input id="filtre-date-fin" type="date" onchange="filtrerEtAfficherSessions()">
        </div>
        <div>
          <label>&nbsp;</label>
          <div style="display:flex;flex-direction:column;gap:2px;padding:4px 0;">
            <label for="filtre-sans-stagiaire" style="display:flex;align-items:center;gap:6px;font-weight:normal;white-space:nowrap;margin:0;">
              <input type="checkbox" id="filtre-sans-stagiaire" style="width:auto;" onchange="filtrerEtAfficherSessions()">
              Sans stagiaire uniquement
            </label>
            <label for="filtre-sans-formateur" style="display:flex;align-items:center;gap:6px;font-weight:normal;white-space:nowrap;margin:0;">
              <input type="checkbox" id="filtre-sans-formateur" style="width:auto;" onchange="filtrerEtAfficherSessions()">
              Sans formateur uniquement
            </label>
          </div>
        </div>
        <div>
          <button class="bouton" style="background:#eee;color:#333;" onclick="reinitialiserFiltresSessions()">Réinitialiser</button>
        </div>
      </div>
      <p style="font-size:12px;color:#55636c;margin:8px 0 0;">"Sans stagiaire uniquement" aide à repérer les sessions vides créées par erreur (ex. doublons d'un import) — ouvre la session puis utilise "Supprimer" pour la retirer. "Sans formateur uniquement" liste les sessions à compléter (voir aussi l'outil d'assignation rapide ci-dessous, qui porte lui sur toutes les sessions sans formateur, indépendamment de ce filtre).</p>
      <div id="bulk-suppression-zone"></div>
      <div id="bulk-formateur-zone"></div>
    </div>
    <div id="doublons-sessions-zone"></div>
    <div class="carte"><div id="liste-sessions">Chargement…</div></div>`;

  const requeteSessions = (colOperation) => supa.from('sessions_formation')
      .select(`id, numero_session, date_debut, date_fin, lieu, statut, formateur_id, formation_id, ${colOperation}created_at, formations_catalogue(denomination), session_clients(clients(raison_sociale)), session_participants(count)`)
      .order('date_debut', { ascending: false })
      .limit(300);
  const [reponseSessions, { data: formateurs }] = await Promise.all([
    requeteSessions('operation_id, '),
    supa.from('profils').select('id, nom, prenom, formateur_externe').eq('actif', true).order('nom'),
  ]);

  let { data, error } = reponseSessions;
  // Patch « opérations » pas encore passé dans Supabase : on recharge sans la colonne plutôt que de bloquer la liste.
  if (error && /operation_id/.test(error.message || '')) ({ data, error } = await requeteSessions(''));
  const zone = $('#liste-sessions');
  if (error) { DEBUG.erreur('ecranSessions', error); zone.textContent = 'Erreur de chargement.'; return; }
  (data || []).forEach(s => {
    s.__nomsClients = (s.session_clients || []).map(sc => sc.clients?.raison_sociale).filter(Boolean);
    s.__nbStagiaires = s.session_participants?.[0]?.count || 0;
  });
  window.__sessionsToutes = data || [];
  window.__sessionsFormateursDisponibles = formateurs || [];
  filtrerEtAfficherSessions();
  rendreDoublonsSessions();
  if (PEUT_GERER_SESSIONS() && typeof chargerSuiviEspaceClient === 'function') {
    chargerSuiviEspaceClient().then(m => { window.__suiviEC = m; filtrerEtAfficherSessions(); });
  }
}

function reinitialiserFiltresSessions() {
  $('#filtre-texte').value = '';
  $('#filtre-statut').value = '';
  $('#filtre-date-debut').value = '';
  $('#filtre-date-fin').value = '';
  $('#filtre-sans-stagiaire').checked = false;
  $('#filtre-sans-formateur').checked = false;
  filtrerEtAfficherSessions();
}

// Tri de la liste des sessions — colonne cliquée dans l'en-tête, cliquer à
// nouveau inverse le sens. Par défaut : date la plus récente d'abord (ordre
// déjà renvoyé par la requête).
window.__sessionsTri = { colonne: 'date_debut', sens: 'desc' };

const SESSIONS_COLONNES_TRI = {
  numero_session: { libelle: 'N°', valeur: s => s.numero_session || '' },
  date_debut: { libelle: 'Date', valeur: s => s.date_debut || '' },
  formation: { libelle: 'Formation', valeur: s => s.formations_catalogue?.denomination || '' },
  clients: { libelle: 'Client(s)', valeur: s => (s.__nomsClients || []).join(', ') },
  stagiaires: { libelle: 'Stagiaires', valeur: s => s.__nbStagiaires || 0, numerique: true, alignDroite: true },
  statut: { libelle: 'Statut', valeur: s => s.statut || '' },
};

function trierSessionsPar(colonne) {
  const tri = window.__sessionsTri;
  if (tri.colonne === colonne) tri.sens = tri.sens === 'asc' ? 'desc' : 'asc';
  else { tri.colonne = colonne; tri.sens = colonne === 'date_debut' ? 'desc' : 'asc'; }
  filtrerEtAfficherSessions();
}

function filtrerEtAfficherSessions() {
  const zone = $('#liste-sessions');
  if (!zone) return;

  const texte = ($('#filtre-texte')?.value || '').trim().toLowerCase();
  const statut = $('#filtre-statut')?.value || '';
  const dateDebut = $('#filtre-date-debut')?.value || '';
  const dateFin = $('#filtre-date-fin')?.value || '';
  const sansStagiaire = $('#filtre-sans-stagiaire')?.checked || false;
  const sansFormateur = $('#filtre-sans-formateur')?.checked || false;

  const data = (window.__sessionsToutes || []).filter(s => {
    if (statut && s.statut !== statut) return false;
    if (dateDebut && s.date_debut < dateDebut) return false;
    if (dateFin && s.date_debut > dateFin) return false;
    if (sansStagiaire && s.__nbStagiaires > 0) return false;
    if (sansFormateur && s.formateur_id) return false;
    if (texte) {
      const cible = [
        s.numero_session || '',
        (s.__nomsClients || []).join(' '),
        s.formations_catalogue?.denomination || '',
        s.lieu || '',
      ].join(' ').toLowerCase();
      if (!cible.includes(texte)) return false;
    }
    return true;
  });

  rendreZoneSuppressionGroupee();
  rendreZoneAssignationFormateurGroupee();

  if (data.length === 0) { zone.innerHTML = '<p style="color:#55636c;">Aucune session ne correspond à ces critères.</p>'; return; }

  const tri = window.__sessionsTri;
  const { valeur, numerique } = SESSIONS_COLONNES_TRI[tri.colonne] || SESSIONS_COLONNES_TRI.date_debut;
  data.sort((a, b) => {
    const va = valeur(a), vb = valeur(b);
    const cmp = numerique ? va - vb : String(va).localeCompare(String(vb), 'fr');
    return tri.sens === 'asc' ? cmp : -cmp;
  });

  const enTete = (colonne) => {
    const def = SESSIONS_COLONNES_TRI[colonne];
    const actif = tri.colonne === colonne;
    const fleche = actif ? (tri.sens === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th style="padding:6px 8px;cursor:pointer;user-select:none;white-space:nowrap;${def.alignDroite ? 'text-align:right;' : ''}${actif ? 'color:#0a5c8a;' : ''}" onclick="trierSessionsPar('${colonne}')">${esc(def.libelle)}${fleche}</th>`;
  };

  zone.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead><tr style="text-align:left;color:#55636c;font-size:12px;">
      ${enTete('numero_session')}${enTete('date_debut')}${enTete('formation')}${enTete('clients')}${enTete('stagiaires')}${enTete('statut')}${PEUT_GERER_SESSIONS() ? '<th style="padding:6px 8px;">Espace client</th>' : ''}
    </tr></thead>
    <tbody>${data.map(s => `
      <tr style="border-top:1px solid #eee;cursor:pointer;${s.__nbStagiaires === 0 ? 'background:#fdf6e8;' : ''}" onclick="ouvrirSession('${s.id}')">
        <td style="padding:6px 8px;color:#55636c;font-variant-numeric:tabular-nums;">${esc(s.numero_session || '—')}</td>
        <td style="padding:6px 8px;">${formatDateFr(s.date_debut)}</td>
        <td style="padding:6px 8px;">${esc(s.formations_catalogue?.denomination || '')}</td>
        <td style="padding:6px 8px;">${(s.__nomsClients || []).length ? esc(s.__nomsClients.join(', ')) : '<span style="font-size:11px;background:#fdeeee;color:#b3261e;border-radius:10px;padding:1px 8px;">Sans client</span>'}</td>
        <td style="padding:6px 8px;text-align:right;${s.__nbStagiaires === 0 ? 'color:#b3261e;font-weight:600;' : ''}">${s.__nbStagiaires}</td>
        <td style="padding:6px 8px;">${esc(s.statut)}</td>
        ${PEUT_GERER_SESSIONS() ? `<td style="padding:6px 8px;">${celluleEspaceClientSession(s.id)}</td>` : ''}
      </tr>`).join('')}
    </tbody></table>`;
}

function rendreZoneSuppressionGroupee() {
  const zone = $('#bulk-suppression-zone');
  if (!zone) return;
  if (!PEUT_GERER_SESSIONS()) { zone.innerHTML = ''; return; }

  const cibles = (window.__sessionsToutes || []).filter(s => s.statut === 'terminee' && s.__nbStagiaires === 0);
  if (cibles.length === 0) { zone.innerHTML = ''; return; }

  zone.innerHTML = `
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid #eee;">
      <button class="bouton" style="background:#fdeeee;color:#b3261e;" onclick="ouvrirConfirmationSuppressionGroupee()">
        Supprimer les ${cibles.length} session(s) terminée(s) sans stagiaire
      </button>
    </div>
    <div id="suppression-groupee-zone"></div>`;
}

function sessionsSansFormateurDansPlage() {
  const debut = $('#bulk-formateur-date-debut')?.value || '';
  const fin = $('#bulk-formateur-date-fin')?.value || '';
  return (window.__sessionsToutes || []).filter(s => {
    if (s.formateur_id) return false;
    if (debut && s.date_debut < debut) return false;
    if (fin && s.date_debut > fin) return false;
    return true;
  });
}

function rendreZoneAssignationFormateurGroupee() {
  const zone = $('#bulk-formateur-zone');
  if (!zone) return;
  if (!PEUT_GERER_SESSIONS()) { zone.innerHTML = ''; return; }
  if (S.organisation && S.organisation.assignation_rapide_formateur_active === false) { zone.innerHTML = ''; return; }

  const toutesSansFormateur = (window.__sessionsToutes || []).filter(s => !s.formateur_id);
  const formateurs = window.__sessionsFormateursDisponibles || [];
  if (toutesSansFormateur.length === 0 || formateurs.length === 0) { zone.innerHTML = ''; return; }

  zone.innerHTML = `
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid #eee;">
      <p style="font-size:13px;font-weight:600;margin:0 0 6px;">
        Assigner un formateur à <span id="bulk-formateur-compte">${toutesSansFormateur.length}</span> session(s) sans formateur
      </p>
      <p style="font-size:12px;color:#55636c;margin:0 0 8px;">
        Ce nombre porte sur toutes tes sessions sans formateur — il ne tient pas compte des filtres de recherche/statut/dates au-dessus (indépendant, par exemple, de "Sans stagiaire uniquement"). Seules les dates "Du"/"Au" ci-dessous le restreignent.
      </p>
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
        <div>
          <label for="bulk-formateur-select">Formateur</label>
          <select id="bulk-formateur-select" style="min-width:220px;">
            ${formateurs.map(f => `<option value="${f.id}">${esc(f.prenom + ' ' + f.nom)}${f.formateur_externe ? ' (externe)' : ''}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="bulk-formateur-date-debut">Du</label>
          <input id="bulk-formateur-date-debut" type="date" oninput="rafraichirCompteFormateurGroupe()" onchange="rafraichirCompteFormateurGroupe()">
        </div>
        <div>
          <label for="bulk-formateur-date-fin">Au</label>
          <input id="bulk-formateur-date-fin" type="date" oninput="rafraichirCompteFormateurGroupe()" onchange="rafraichirCompteFormateurGroupe()">
        </div>
        <button class="bouton" onclick="assignerFormateurGroupe()">Assigner</button>
      </div>
      <p style="font-size:12px;color:#55636c;margin:6px 0 0;">
        Laisse les dates vides pour prendre toutes les sessions sans formateur, ou précise une période (date de début de session) pour ne cibler que celles-là.
        Vérifie ensuite au cas par cas si plusieurs formateurs étaient réellement concernés. Désactivable dans l'onglet Organisme → Outils.
      </p>
    </div>`;
}

function rafraichirCompteFormateurGroupe() {
  const compte = $('#bulk-formateur-compte');
  if (compte) compte.textContent = sessionsSansFormateurDansPlage().length;
}

async function assignerFormateurGroupe() {
  const formateurId = $('#bulk-formateur-select')?.value;
  if (!formateurId) return;
  const cibles = sessionsSansFormateurDansPlage();
  if (cibles.length === 0) { toast('Aucune session sans formateur sur cette période.', 'erreur'); return; }
  if (!confirm(`Assigner ce formateur à ${cibles.length} session(s) sans formateur ?`)) return;

  const ids = cibles.map(s => s.id);
  const { error } = await supa.from('sessions_formation').update({ formateur_id: formateurId }).in('id', ids);
  if (error) { DEBUG.erreur('assignerFormateurGroupe', error); toast('Erreur : ' + error.message, 'erreur'); return; }
  toast(`Formateur assigné à ${cibles.length} session(s).`);
  ecranSessions($('#vue'));
}

// ============================================================================
// DOUBLONS DE SESSIONS (ex. import rejoué après une première tentative en
// échec) — détection automatique, revue manuelle obligatoire (jamais de
// fusion automatique) puis fusion via la fonction RPC fusionner_sessions,
// qui reporte stagiaires/clients/documents/envois sur la session conservée.
// Même principe que la détection de doublons de l'écran Stagiaires.
// ============================================================================

// Clé de regroupement : même formation, mêmes dates, même lieu, mêmes
// client(s) — le cas typique d'un import rejoué (échec réseau, double clic…)
// qui recrée à l'identique la même session.
function sesCleDoublon(s) {
  const lieu = (s.lieu || '').trim().toLowerCase();
  const clients = (s.__nomsClients || []).slice().sort((a, b) => a.localeCompare(b)).join('|').toLowerCase();
  return `${s.formation_id}|${s.date_debut}|${s.date_fin}|${lieu}|${clients}`;
}

function detecterDoublonsSessions(liste) {
  const groupes = {};
  liste.forEach(s => {
    if (!s.formation_id || !s.date_debut) return;
    if (s.operation_id) return;   // les créneaux d'une opération se ressemblent par construction : jamais des doublons
    const cle = sesCleDoublon(s);
    (groupes[cle] = groupes[cle] || []).push(s);
  });
  return Object.values(groupes).filter(g => g.length > 1);
}

function rendreDoublonsSessions() {
  const zone = $('#doublons-sessions-zone');
  if (!zone) return;
  if (!PEUT_GERER_SESSIONS()) { zone.innerHTML = ''; return; }

  const groupes = detecterDoublonsSessions(window.__sessionsToutes || []);
  window.__groupesDoublonsSessions = groupes;

  if (!groupes.length) { zone.innerHTML = ''; return; }

  zone.innerHTML = `
    <div class="carte" style="border-color:#eda100;background:#fff9ec;">
      <h3 style="margin-top:0;">Doublons de sessions détectés (${groupes.length} groupe${groupes.length > 1 ? 's' : ''})</h3>
      <p style="font-size:12px;color:#55636c;margin:0 0 10px;">
        Même formation, mêmes dates, même lieu et même(s) client(s) — probablement le même import rejoué deux fois. Choisis la fiche à conserver dans chaque groupe avant de fusionner ; rien n'est fusionné automatiquement. La fusion reporte sur la fiche conservée les stagiaires inscrits, les clients rattachés, les documents générés et les envois email des fiches fusionnées, puis supprime ces dernières.
      </p>
      ${groupes.map((g, gi) => sesRendreGroupeDoublon(g, gi)).join('')}
    </div>`;
}

function sesRendreGroupeDoublon(groupe, gi) {
  // Par défaut : la session qui a le plus de stagiaires inscrits, puis la
  // plus ancienne (created_at) — la plus probable d'être la "vraie" session.
  const parDefaut = groupe.slice().sort((a, b) => {
    if (b.__nbStagiaires !== a.__nbStagiaires) return b.__nbStagiaires - a.__nbStagiaires;
    return (a.created_at || '').localeCompare(b.created_at || '');
  })[0];

  return `
    <div style="border-top:1px solid #eee;padding-top:10px;margin-top:10px;">
      <p style="font-size:13px;font-weight:600;margin:0 0 6px;">
        ${esc(groupe[0].formations_catalogue?.denomination || 'Formation')} — ${formatDateFr(groupe[0].date_debut)}${groupe[0].lieu ? ' — ' + esc(groupe[0].lieu) : ''}
      </p>
      ${groupe.map(s => `
        <label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;">
          <input type="radio" name="ses-doublon-${gi}" value="${s.id}" style="width:auto;" ${s.id === parDefaut.id ? 'checked' : ''}>
          <span>N° ${esc(s.numero_session || '—')} — ${esc((s.__nomsClients || []).join(', ') || 'sans client')} — ${s.__nbStagiaires} stagiaire(s) — statut : ${esc(s.statut)}</span>
        </label>`).join('')}
      <button class="bouton" style="padding:5px 10px;font-size:12px;margin-top:6px;" onclick="fusionnerGroupeSessions(${gi})">Fusionner ce groupe</button>
    </div>`;
}

async function fusionnerGroupeSessions(gi) {
  const groupe = (window.__groupesDoublonsSessions || [])[gi];
  if (!groupe) { toast('Groupe introuvable — recharge la page.', 'erreur'); return; }
  const survivant = document.querySelector(`input[name="ses-doublon-${gi}"]:checked`)?.value;
  if (!survivant) { toast('Choisis la session à conserver.', 'erreur'); return; }
  const doublons = groupe.map(s => s.id).filter(id => id !== survivant);
  if (!confirm(`Fusionner ${doublons.length} session(s) dans la session conservée ? Les stagiaires, clients, documents et envois des sessions fusionnées seront reportés sur la session conservée, puis ces sessions seront supprimées. Cette action est irréversible.`)) return;

  const { error } = await supa.rpc('fusionner_sessions', { p_survivant: survivant, p_doublons: doublons });
  if (error) { DEBUG.erreur('fusionnerGroupeSessions', error); toast('Erreur : ' + error.message, 'erreur'); return; }
  toast('Sessions fusionnées.');
  ecranSessions($('#vue'));
}

function ouvrirConfirmationSuppressionGroupee() {
  const cibles = (window.__sessionsToutes || []).filter(s => s.statut === 'terminee' && s.__nbStagiaires === 0);
  const zone = $('#suppression-groupee-zone');
  zone.innerHTML = `
    <div class="carte" style="border-color:#b3261e;background:#fdeeee;margin-top:10px;">
      <h3 style="margin-top:0;color:#b3261e;">Supprimer ${cibles.length} session(s) terminée(s) sans stagiaire</h3>
      <p style="font-size:13px;">Cette action supprime définitivement ces sessions (${cibles.map(s => esc(s.numero_session || '—')).join(', ')}) et les documents associés enregistrés. Utile pour retirer les doublons créés par un import raté.</p>
      <label for="supp-groupee-texte">Pour confirmer, tape <strong>SUPPRESSION</strong> en toutes lettres ci-dessous :</label>
      <input id="supp-groupee-texte" placeholder="SUPPRESSION">
      <button class="bouton" id="supp-groupee-valider" style="margin-top:10px;background:#b3261e;" disabled>Confirmer la suppression</button>
      <button class="bouton" style="margin-top:10px;margin-left:8px;background:#eee;color:#333;" onclick="$('#suppression-groupee-zone').innerHTML=''">Annuler</button>
      <div class="erreur" id="supp-groupee-erreur"></div>
    </div>`;

  const champ = $('#supp-groupee-texte');
  const bouton = $('#supp-groupee-valider');
  champ.oninput = () => { bouton.disabled = champ.value.trim() !== 'SUPPRESSION'; };

  bouton.onclick = async () => {
    if (champ.value.trim() !== 'SUPPRESSION') return;
    bouton.disabled = true;
    bouton.textContent = 'Suppression…';
    const ids = cibles.map(s => s.id);
    const { error } = await supa.from('sessions_formation').delete().in('id', ids);
    if (error) { DEBUG.erreur('supprimerSessionsGroupe', error); $('#supp-groupee-erreur').textContent = 'Erreur : ' + error.message; bouton.disabled = false; bouton.textContent = 'Confirmer la suppression'; return; }
    toast(`${cibles.length} session(s) supprimée(s).`);
    ecranSessions($('#vue'));
  };
}

// ============================================================================
// CRÉATION D'UNE SESSION
// ============================================================================

let __nsCompteurLigneClient = 0;

async function ecranNouvelleSession(vue) {
  const { data: clients } = await supa.from('clients').select('id, raison_sociale').eq('actif', true).order('raison_sociale');
  const { data: formations } = await supa.from('formations_catalogue').select('id, code, categorie, denomination, prix, prix_individuel, prix_groupe').eq('actif', true).order('categorie').order('denomination');
  const { data: formateurs } = await supa.from('profils').select('id, nom, prenom, formateur_externe').eq('actif', true).order('nom');

  const parCategorie = {};
  (formations || []).forEach(f => { (parCategorie[f.categorie] = parCategorie[f.categorie] || []).push(f); });
  window.__nsClientsDisponibles = clients || [];
  window.__nsFormations = formations || [];
  __nsCompteurLigneClient = 0;

  vue.innerHTML = `
    <div class="carte" style="max-width:620px;">
      <h2 style="margin-top:0;">Nouvelle session</h2>

      <label for="ns-formation">Formation</label>
      <select id="ns-formation">
        <option value="">— Choisir —</option>
        ${Object.entries(parCategorie).map(([cat, fs]) => `
          <optgroup label="${esc(cat)}">
            ${fs.map(f => `<option value="${f.id}">${esc(f.denomination)} (${esc(f.code)})</option>`).join('')}
          </optgroup>`).join('')}
      </select>
      <div id="ns-tarif-zone" style="display:none;">
        <label for="ns-tarif">Tarif</label>
        <select id="ns-tarif">
          <option value="individuel">Individuel</option>
          <option value="groupe">Groupe</option>
        </select>
      </div>

      <label for="ns-lieu">Lieu</label>
      <input id="ns-lieu" placeholder="Chez le client, ou adresse du centre">

      <div style="display:flex;gap:10px;">
        <div style="flex:1;">
          <label for="ns-date-debut">Date de début</label>
          <input id="ns-date-debut" type="date">
        </div>
        <div style="flex:1;">
          <label for="ns-date-fin">Date de fin</label>
          <input id="ns-date-fin" type="date">
        </div>
      </div>

      <label style="margin-top:14px;">Horaires</label>
      <p style="font-size:12px;color:#55636c;margin:2px 0 8px;">Facultatif — repris automatiquement sur la Convention et la Convocation.</p>
      <div style="display:flex;gap:10px;">
        <div style="flex:1;">
          <label for="ns-heure-debut" style="font-weight:normal;font-size:12px;">Début</label>
          <input id="ns-heure-debut" type="time">
        </div>
        <div style="flex:1;">
          <label for="ns-pause-debut" style="font-weight:normal;font-size:12px;">Pause déjeuner de</label>
          <input id="ns-pause-debut" type="time">
        </div>
        <div style="flex:1;">
          <label for="ns-pause-fin" style="font-weight:normal;font-size:12px;">à</label>
          <input id="ns-pause-fin" type="time">
        </div>
        <div style="flex:1;">
          <label for="ns-heure-fin" style="font-weight:normal;font-size:12px;">Fin</label>
          <input id="ns-heure-fin" type="time">
        </div>
      </div>

      <label style="margin-top:14px;">Client(s) de la session</label>
      <p style="font-size:12px;color:#55636c;margin:2px 0 8px;">Une session peut réunir plusieurs entreprises (formation mutualisée) — chacune avec son propre tarif, pré-rempli depuis le catalogue mais modifiable.</p>
      <div id="ns-clients-lignes"></div>
      <datalist id="ns-clients-liste">
        ${(clients || []).map(c => `<option data-id="${c.id}" value="${esc(c.raison_sociale)}">`).join('')}
      </datalist>
      <button class="bouton" style="background:#eee;color:#333;font-size:13px;padding:6px 12px;margin-top:6px;" onclick="ajouterLigneClientSession()">+ Ajouter un client</button>

      <label for="ns-formateur" style="margin-top:14px;">Formateur</label>
      <select id="ns-formateur">
        <option value="">— Aucun / à définir —</option>
        ${(formateurs || []).map(f => `<option value="${f.id}" ${S.profil.role === 'formateur' && f.id === S.profil.id ? 'selected' : ''}>${esc(f.prenom + ' ' + f.nom)}${f.formateur_externe ? ' (externe)' : ''}</option>`).join('')}
      </select>
      <p style="font-size:12px;color:#55636c;margin:2px 0 0;">Sert au calcul des heures de formation par formateur (BPF cadre D et E) — assigne-le même s'il n'est pas encore connu de tous les stagiaires.</p>

      <label for="ns-modalite" style="margin-top:14px;">Modalité</label>
      <select id="ns-modalite">
        <option value="presentiel" selected>Présentiel</option>
        <option value="distanciel">Distanciel (classe virtuelle, e-learning…)</option>
        <option value="mixte">Mixte</option>
      </select>

      <label for="ns-origine" style="margin-top:14px;">Origine du financement</label>
      <select id="ns-origine">
        ${ORIGINES_FINANCEMENT.map(g => `
          <optgroup label="${esc(g.groupe)}">
            ${g.options.map(o => `<option value="${o.valeur}" ${o.valeur === 'entreprise' ? 'selected' : ''}>${esc(o.libelle)}</option>`).join('')}
          </optgroup>`).join('')}
      </select>
      <label style="display:flex;align-items:center;gap:6px;font-weight:normal;margin-top:8px;">
        <input type="checkbox" id="ns-sous-traitance" style="width:auto;">
        Session confiée par un autre organisme de formation (sous-traitance reçue)
      </label>
      <p style="font-size:12px;color:#55636c;margin:2px 0 0;">Sert au calcul automatique du Bilan Pédagogique et Financier (BPF) annuel.</p>

      <button class="bouton" id="ns-valider" style="margin-top:16px;">Créer la session</button>
      <button class="bouton" style="margin-top:16px;margin-left:8px;background:#eee;color:#333;" onclick="allerA('sessions')">Annuler</button>
      <div class="erreur" id="ns-erreur"></div>
    </div>`;

  ajouterLigneClientSession();

  const prixDeLaFormationChoisie = () => {
    const f = (formations || []).find(x => x.id === $('#ns-formation').value);
    if (!f) return null;
    if (f.prix_individuel != null || f.prix_groupe != null) {
      return $('#ns-tarif').value === 'groupe' ? f.prix_groupe : f.prix_individuel;
    }
    return f.prix;
  };

  const appliquerPrixSurLignesClientVides = () => {
    const prix = prixDeLaFormationChoisie();
    if (prix != null) $$('.ns-client-prix').forEach(input => { if (!input.value) input.value = prix; });
  };

  $('#ns-formation').onchange = (e) => {
    const f = (formations || []).find(x => x.id === e.target.value);
    const aDeuxTarifs = f && (f.prix_individuel != null || f.prix_groupe != null);
    $('#ns-tarif-zone').style.display = aDeuxTarifs ? '' : 'none';
    appliquerPrixSurLignesClientVides();
  };

  // Ne remplace que les lignes client encore vides (comme au choix initial
  // de la formation) — une ligne déjà modifiée à la main n'est pas écrasée.
  $('#ns-tarif').onchange = appliquerPrixSurLignesClientVides;

  $('#ns-valider').onclick = async () => {
    const formationId = $('#ns-formation').value;
    const dateDebut = $('#ns-date-debut').value;
    const dateFin = $('#ns-date-fin').value || dateDebut;
    const lieu = $('#ns-lieu').value.trim();
    const origineFinancement = $('#ns-origine').value;
    const sousTraitanceRecue = $('#ns-sous-traitance').checked;

    if (!formationId || !dateDebut) { $('#ns-erreur').textContent = 'Formation et date de début obligatoires.'; return; }

    const lignesClients = lireLignesClientSession();
    if (lignesClients.erreur) { $('#ns-erreur').textContent = lignesClients.erreur; return; }
    if (!lignesClients.valides.length) { $('#ns-erreur').textContent = 'Au moins un client est obligatoire (il sert aux conventions, à l\'espace client et au Passeport de prévention).'; return; }

    // Un seul jeu d'horaires pour toute la session (Convention/Convocation
    // n'affichent que le premier élément du tableau) — non stocké du tout si
    // rien n'a été renseigné.
    const heureDebut = $('#ns-heure-debut').value;
    const pauseDebut = $('#ns-pause-debut').value;
    const pauseFin = $('#ns-pause-fin').value;
    const heureFin = $('#ns-heure-fin').value;
    const horaires = (heureDebut || pauseDebut || pauseFin || heureFin)
      ? [{ debut: heureDebut || null, pause_debut: pauseDebut || null, pause_fin: pauseFin || null, fin: heureFin || null }]
      : [];

    const premier = lignesClients.valides[0];
    const { data, error } = await supa.from('sessions_formation').insert({
      organisation_id: S.organisation.id,
      formation_id: formationId,
      client_id: premier ? premier.clientId : null,     // client "principal" pour compatibilité — la vérité est dans session_clients
      lieu: lieu || null,
      date_debut: dateDebut,
      date_fin: dateFin,
      horaires,
      prix_unitaire: premier ? premier.prix : null,
      modalite: $('#ns-modalite').value,
      origine_financement: origineFinancement,
      sous_traitance_recue: sousTraitanceRecue,
      formateur_id: $('#ns-formateur').value || null,
    }).select().single();

    if (error) { DEBUG.erreur('creerSession', error); $('#ns-erreur').textContent = 'Erreur : ' + error.message; return; }

    if (lignesClients.valides.length) {
      const { error: errClients } = await supa.from('session_clients').insert(
        lignesClients.valides.map(l => ({
          organisation_id: S.organisation.id,
          session_id: data.id,
          client_id: l.clientId,
          prix_unitaire: l.prix,
          numero_devis: l.devis,
        }))
      );
      if (errClients) { DEBUG.erreur('creerSessionClients', errClients); toast('Session créée, mais erreur sur les clients : ' + errClients.message, 'erreur'); }
    }

    toast('Session créée.');
    ouvrirSession(data.id);
  };
}

function ajouterLigneClientSession() {
  const id = ++__nsCompteurLigneClient;
  const zone = $('#ns-clients-lignes');
  const ligne = document.createElement('div');
  ligne.className = 'ns-ligne-client';
  ligne.dataset.id = id;
  ligne.style.cssText = 'display:flex;gap:8px;align-items:flex-end;margin-bottom:8px;';
  ligne.innerHTML = `
    <div style="flex:2;">
      <input class="ns-client-input" list="ns-clients-liste" placeholder="Rechercher un client…">
    </div>
    <div style="flex:1;">
      <input class="ns-client-prix" type="number" step="0.01" placeholder="Tarif (€)">
    </div>
    <div style="flex:1;">
      <input class="ns-client-devis" placeholder="N° devis">
    </div>
    <button type="button" class="bouton" style="background:#fdeeee;color:#b3261e;padding:8px 10px;" onclick="this.closest('.ns-ligne-client').remove()">✕</button>`;
  zone.appendChild(ligne);
}

function lireLignesClientSession() {
  const lignes = $$('.ns-ligne-client');
  const valides = [];
  for (const ligne of lignes) {
    const texte = $('.ns-client-input', ligne).value.trim();
    if (!texte) continue;
    const option = $$('#ns-clients-liste option').find(o => o.value === texte);
    if (!option) return { erreur: `Client "${texte}" introuvable dans la liste — choisis-le parmi les suggestions.` };
    const clientId = option.dataset.id;
    if (valides.some(v => v.clientId === clientId)) return { erreur: `Le client "${texte}" est renseigné plusieurs fois.` };
    const prixTxt = $('.ns-client-prix', ligne).value;
    valides.push({
      clientId,
      prix: prixTxt ? Number(prixTxt) : null,
      devis: $('.ns-client-devis', ligne).value.trim() || null,
    });
  }
  return { valides };
}

// ============================================================================
// DÉTAIL D'UNE SESSION — participants, FISE, évaluations
// ============================================================================

async function ouvrirSession(id) {
  if (typeof fsChargerPolices === 'function') fsChargerPolices().catch(() => {});   // police Carlito pour la convocation
  S.ongletActif = 'sessions';
  S.categorieActive = (typeof categorieDeLOnglet === 'function' && categorieDeLOnglet('sessions')?.id) || S.categorieActive;
  rendreMenuLateral();
  rendreSousOnglets();
  const vue = $('#vue');
  vue.innerHTML = '<div class="carte">Chargement…</div>';

  const { data: session, error } = await supa
    .from('sessions_formation')
    .select('*, formations_catalogue(*)')
    .eq('id', id)
    .single();

  if (error) { DEBUG.erreur('ouvrirSession', error); vue.innerHTML = '<div class="carte">Session introuvable ou accès refusé.</div>'; return; }

  const [{ data: participants }, { data: sessionClients }, { data: formateursDisponibles }, { data: sessionOrigine }, { data: sessionsSuivantes }] = await Promise.all([
    supa.from('session_participants').select('*, stagiaires(civilite, nom, prenom, date_naissance), clients(raison_sociale, ville)').eq('session_id', id),
    supa.from('session_clients').select('*, clients(raison_sociale, ville)').eq('session_id', id).order('created_at'),
    PEUT_GERER_SESSIONS() ? supa.from('profils').select('id, nom, prenom, formateur_externe').eq('actif', true).order('nom') : Promise.resolve({ data: [] }),
    session.session_origine_id
      ? supa.from('sessions_formation').select('id, numero_session, date_debut, date_fin, motif_report, commentaire_report').eq('id', session.session_origine_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supa.from('sessions_formation').select('id, numero_session, date_debut, date_fin').eq('session_origine_id', id),
  ]);
  const sessionSuivante = (sessionsSuivantes || [])[0] || null;

  window.__sessionClients = sessionClients || [];
  const nomsClients = (sessionClients || []).map(sc => sc.clients?.raison_sociale).filter(Boolean);

  // Nom du formateur réellement assigné à la session (pas celui qui génère
  // le document) — utilisé comme signataire sur l'AFF, le Certificat de
  // réalisation et la Feuille de présence. Repli sur le représentant de
  // l'organisme si non trouvé (ex. formateur sans droits de gestion, la
  // liste n'est alors pas chargée).
  const formateurAssigne = (formateursDisponibles || []).find(f => f.id === session.formateur_id);
  session.__formateurNom = formateurAssigne ? `${formateurAssigne.prenom} ${formateurAssigne.nom}` : null;

  vue.innerHTML = `
    <div class="carte" style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <h2 style="margin:0 0 4px;">${esc(session.formations_catalogue?.denomination || '')} <span style="color:#55636c;font-weight:normal;font-size:14px;">— n° ${esc(session.numero_session || '—')}</span></h2>
        <p style="margin:0;color:#55636c;font-size:14px;">
          ${formatDateFr(session.date_debut)}${session.date_fin !== session.date_debut ? ' → ' + formatDateFr(session.date_fin) : ''}
          — ${esc(session.lieu || 'lieu non renseigné')}
          — ${esc(nomsClients.join(', ') || 'sans client')}
          — statut : ${esc(session.statut)}
        </p>
        <div id="sess-horaires" style="margin-top:8px;font-size:13px;color:#55636c;">${htmlHorairesSession(session, false)}</div>
        ${PEUT_GERER_SESSIONS() && (session.formations_catalogue?.declaration_forprev ?? /secour/i.test(session.formations_catalogue?.categorie || '')) ? `
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px;font-size:13px;color:#55636c;">
          <span>ForePrev — n° de session :</span>
          <input id="sess-forprev" value="${esc(session.numero_forprev || '')}" placeholder="n° ForePrev" style="width:170px;margin:0;padding:4px 8px;">
          <span>déclarée le :</span>
          <input type="date" id="sess-forprev-date" value="${esc(session.date_declaration_forprev || '')}" style="width:150px;margin:0;padding:4px 8px;">
          <button class="bouton" style="padding:4px 12px;font-size:13px;margin:0;" onclick="enregistrerForprevSession('${session.id}')">Enregistrer</button>
        </div>` : ''}
      </div>
      <div style="text-align:right;">
        <button class="bouton" style="background:#eee;color:#333;" onclick="allerA('sessions')">← Retour</button>
        ${PEUT_GERER_SESSIONS() && !sessionSuivante ? `
        <button class="bouton" style="margin-left:8px;" onclick="ouvrirReportSession('${session.id}')">Modifier la date</button>` : ''}
        ${PEUT_GERER_SESSIONS() && (session.statut !== 'terminee' || (participants || []).length === 0) ? `
        <button class="bouton" style="background:#fdeeee;color:#b3261e;margin-left:8px;" onclick="ouvrirConfirmationSuppression('${session.id}', ${(participants || []).length})">Supprimer</button>` : ''}
      </div>
    </div>

    ${rendreHistoriqueDates(session, sessionOrigine, sessionSuivante)}
    <div id="report-zone"></div>
    <div id="suppression-zone"></div>

    ${PEUT_GERER_SESSIONS() ? `
    <div class="carte">
      <h3 style="margin-top:0;">Clients de la session</h3>
      <p style="font-size:12px;color:#55636c;margin:0 0 10px;">Chaque client a son propre tarif — utile pour une formation mutualisée entre plusieurs entreprises.</p>
      <div id="sess-clients-liste"></div>
      <div style="display:flex;gap:8px;align-items:flex-end;margin-top:10px;">
        <div style="flex:2;">
          <label for="sess-client-nouveau">Ajouter un client</label>
          <input id="sess-client-nouveau" list="sess-clients-liste-datalist" placeholder="Rechercher un client…">
          <datalist id="sess-clients-liste-datalist"></datalist>
        </div>
        <div style="flex:1;"><label for="sess-client-nouveau-prix">Tarif (€)</label><input id="sess-client-nouveau-prix" type="number" step="0.01"></div>
        <div style="flex:1;"><label for="sess-client-nouveau-devis">N° devis</label><input id="sess-client-nouveau-devis"></div>
        <button class="bouton" style="padding:8px 14px;" onclick="ajouterClientSessionExistante('${session.id}')">Ajouter</button>
      </div>
    </div>

    <div class="carte">
      <h3 style="margin-top:0;">Financement et formateur</h3>
      <label for="sess-formateur">Formateur</label>
      <select id="sess-formateur" style="max-width:420px;">
        <option value="">— Aucun / à définir —</option>
        ${(formateursDisponibles || []).map(f => `<option value="${f.id}" ${f.id === session.formateur_id ? 'selected' : ''}>${esc(f.prenom + ' ' + f.nom)}${f.formateur_externe ? ' (externe)' : ''}</option>`).join('')}
      </select>
      <p style="font-size:12px;color:#55636c;margin:2px 0 8px;">Sert au calcul des heures par formateur (BPF cadres D et E).</p>
      <label for="sess-modalite">Modalité</label>
      <select id="sess-modalite" style="max-width:420px;">
        <option value="presentiel" ${session.modalite === 'presentiel' ? 'selected' : ''}>Présentiel</option>
        <option value="distanciel" ${session.modalite === 'distanciel' ? 'selected' : ''}>Distanciel (classe virtuelle, e-learning…)</option>
        <option value="mixte" ${session.modalite === 'mixte' ? 'selected' : ''}>Mixte</option>
      </select>
      <label for="sess-origine">Origine du financement</label>
      <select id="sess-origine" style="max-width:420px;">
        ${ORIGINES_FINANCEMENT.map(g => `
          <optgroup label="${esc(g.groupe)}">
            ${g.options.map(o => `<option value="${o.valeur}" ${o.valeur === session.origine_financement ? 'selected' : ''}>${esc(o.libelle)}</option>`).join('')}
          </optgroup>`).join('')}
      </select>
      <label style="display:flex;align-items:center;gap:6px;font-weight:normal;margin-top:8px;">
        <input type="checkbox" id="sess-sous-traitance" style="width:auto;" ${session.sous_traitance_recue ? 'checked' : ''}>
        Session confiée par un autre organisme de formation (sous-traitance reçue)
      </label>
      <button class="bouton" style="padding:6px 14px;font-size:13px;margin-top:10px;" onclick="enregistrerFinancementSession('${session.id}')">Enregistrer</button>
      <p style="font-size:12px;color:#55636c;margin:8px 0 0;">Sert au calcul automatique du Bilan Pédagogique et Financier (BPF) annuel.</p>
    </div>` : ''}

    <div class="carte">
      <h3 style="margin-top:0;">Documents de la session</h3>
      ${session.operation_id ? `<p style="margin:0 0 8px;font-size:13px;">Cette session est un <b>créneau d'une opération</b> : la convention est commune à toute l'opération.</p>
        <button class="bouton" style="margin:0 8px 8px 0;" onclick="ouvrirOperation('${session.operation_id}')">Ouvrir l'opération (convention, planning)</button>` :
      (sessionClients && sessionClients.length) ?
        sessionClients.map(sc => `<button class="bouton" style="margin:0 8px 8px 0;" onclick="genererConventionPourClient('${sc.client_id}')">Convention — ${esc(sc.clients?.raison_sociale || '')}</button>`).join('')
        : `<button class="bouton" style="margin:0 8px 8px 0;" onclick="genererConvention(window.__sessionCourante, window.__participantsCourants)">Convention</button>`}
      <button class="bouton" style="margin:0 0 8px;" onclick="genererFeuillePresence(window.__sessionCourante, window.__participantsCourants)">Feuille d'émargement</button>
      ${PEUT_GERER_SESSIONS() ? `<button class="bouton" style="margin:0 0 8px 8px;" onclick="genererFicheSynthese(window.__sessionCourante, window.__participantsCourants)">Feuille de synthèse (A3, usage interne)</button>` : ''}
      ${PEUT_GERER_SESSIONS() ? `<button class="bouton" style="margin:0 0 8px 8px;" onclick="ouvrirExportPasseport('${session.id}')">Export Passeport de prévention</button>` : ''}
      ${grilleSstType(session) ? `<button class="bouton" style="margin:0 0 8px 8px;" onclick="genererGrillesSstSession(window.__sessionCourante, window.__participantsCourants)">Grilles de certification ${grilleSstType(session) === 'mac' ? 'MAC SST' : 'SST'} (un PDF par stagiaire)</button>` : ''}
      <p style="font-size:12px;color:#55636c;margin:8px 0 0;">Chaque client a sa propre Convention (tarif et liste de stagiaires qui lui sont rattachés). La feuille d'émargement n'a pas de modèle papier de référence confirmé — mise en page à ajuster si besoin.</p>
    </div>

    ${PEUT_GERER_SESSIONS() ? '<div class="carte" id="passeport-session" data-ouvert="0" style="display:none;"></div>' : ''}
    ${PEUT_GERER_SESSIONS() ? '<div class="carte" id="espace-client-session"></div>' : ''}

    <div class="carte">
      <h3 style="margin-top:0;">Téléchargement groupé et envoi au client</h3>
      <p style="font-size:12px;color:#55636c;margin:0 0 8px;">Sélectionne les documents à télécharger en une fois (ZIP) ou à envoyer par email au client.</p>
      <div id="selection-documents">Chargement…</div>
    </div>

    <div class="carte" id="qr-emarg-zone"></div>
    <div class="carte" id="qr-eval-zone"></div>
    <div class="carte" id="positionnement-session"></div>
    <div class="carte" id="synthese-zone"></div>

    <div class="carte">
      <h3 style="margin-top:0;">Participants</h3>
      <div id="participants-liste"></div>
      ${PEUT_GERER_SESSIONS() ? `
      <div style="margin-top:16px;border-top:1px solid #eee;padding-top:16px;">
        ${sessionClients && sessionClients.length > 1 ? `
        <label for="sp-client">Entreprise cliente du stagiaire à ajouter</label>
        <select id="sp-client">
          ${sessionClients.map(sc => `<option value="${sc.client_id}">${esc(sc.clients?.raison_sociale || '')}</option>`).join('')}
        </select>` : ''}
        <label for="sp-recherche">Ajouter un stagiaire (recherche par nom / prénom)</label>
        <input id="sp-recherche" placeholder="Nom ou prénom…">
        <div id="sp-resultats" style="margin-top:8px;"></div>
      </div>` : ''}
    </div>`;

  window.__repliEtat = {};   // nouvelle session : on repart des valeurs par défaut
  rendreParticipants(session, participants || []);
  rendreQrEvaluation(session);
  rendreQrEmargement(session);
  if (typeof rendrePositionnementSession === 'function') rendrePositionnementSession();
  window.__emargementsSession = undefined;
  rendreSelectionDocuments(session, participants || []);
  rendreSuiviEspaceClientSession(session);
  appliquerSectionsRepliables(session, sessionClients, participants || []);

  if (PEUT_GERER_SESSIONS()) {
    rendreClientsSession(session.id, window.__sessionClients);
    let timer;
    $('#sp-recherche').oninput = (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => rechercherStagiaires(e.target.value.trim(), session), 250);
    };
  }
}

// Génère la Convention de formation pour UN client de la session (chaque
// client a sa propre Convention — tarif et annexe limités à ses stagiaires).
function genererConventionPourClient(clientId) {
  const clientEntry = (window.__sessionClients || []).find(sc => sc.client_id === clientId);
  if (!clientEntry) { toast('Client introuvable pour cette session.', 'erreur'); return; }
  genererConvention(window.__sessionCourante, window.__participantsCourants, false, clientEntry);
}

// Détermine le client actuellement sélectionné pour l'ajout d'un stagiaire à
// une session (le sélecteur s'il y a plusieurs clients, sinon le seul client
// de la session, sinon aucun).
function clientSelectionnePourAjout(session) {
  const selecteur = $('#sp-client');
  if (selecteur) return selecteur.value || null;
  const clients = window.__sessionClients || [];
  return clients.length === 1 ? clients[0].client_id : null;
}

// ============================================================================
// CLIENTS DE LA SESSION (une session peut en réunir plusieurs, chacun avec
// son propre tarif — voir session_clients).
// ============================================================================

function rendreClientsSession(sessionId, sessionClients) {
  const zone = $('#sess-clients-liste');
  if (!zone) return;

  if (!sessionClients.length) {
    zone.innerHTML = '<p style="color:#55636c;font-size:13px;">Aucun client rattaché à cette session pour l\'instant.</p>';
  } else {
    zone.innerHTML = sessionClients.map(sc => `
      <div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid #eee;font-size:13px;">
        <strong style="flex:2;">${esc(sc.clients?.raison_sociale || '')}</strong>
        <input type="number" step="0.01" class="sc-prix" data-scid="${sc.id}" value="${sc.prix_unitaire != null ? sc.prix_unitaire : ''}" placeholder="Tarif (€)" style="flex:1;">
        <input class="sc-devis" data-scid="${sc.id}" value="${esc(sc.numero_devis || '')}" placeholder="N° devis" style="flex:1;">
        <button class="bouton" style="padding:5px 10px;font-size:12px;" onclick="enregistrerClientSession('${sc.id}')">Enregistrer</button>
        <button class="bouton" style="padding:5px 10px;font-size:12px;background:#fdeeee;color:#b3261e;" onclick="retirerClientSession('${sc.id}', '${sessionId}')">Retirer</button>
      </div>`).join('');
  }

  // Datalist "ajouter un client" : uniquement les clients pas encore dans la session.
  const dejaPresents = new Set(sessionClients.map(sc => sc.client_id));
  supa.from('clients').select('id, raison_sociale').eq('actif', true).order('raison_sociale').then(({ data }) => {
    const dl = $('#sess-clients-liste-datalist');
    if (dl) dl.innerHTML = (data || []).filter(c => !dejaPresents.has(c.id)).map(c => `<option data-id="${c.id}" value="${esc(c.raison_sociale)}">`).join('');
  });
}

async function enregistrerClientSession(sessionClientId) {
  const prixInput = document.querySelector(`.sc-prix[data-scid="${sessionClientId}"]`);
  const devisInput = document.querySelector(`.sc-devis[data-scid="${sessionClientId}"]`);
  const { error } = await supa.from('session_clients').update({
    prix_unitaire: prixInput.value ? Number(prixInput.value) : null,
    numero_devis: devisInput.value.trim() || null,
  }).eq('id', sessionClientId);
  if (error) { DEBUG.erreur('enregistrerClientSession', error); toast('Erreur : ' + error.message, 'erreur'); return; }
  toast('Tarif client mis à jour.');
}

async function retirerClientSession(sessionClientId, sessionId) {
  const { error } = await supa.from('session_clients').delete().eq('id', sessionClientId);
  if (error) { DEBUG.erreur('retirerClientSession', error); toast('Erreur : ' + error.message, 'erreur'); return; }
  toast('Client retiré de la session.');
  ouvrirSession(sessionId);
}

async function ajouterClientSessionExistante(sessionId) {
  const texte = $('#sess-client-nouveau').value.trim();
  const option = $$('#sess-clients-liste-datalist option').find(o => o.value === texte);
  if (!option) { toast('Choisis un client dans la liste des suggestions.', 'erreur'); return; }

  const { error } = await supa.from('session_clients').insert({
    organisation_id: S.organisation.id,
    session_id: sessionId,
    client_id: option.dataset.id,
    prix_unitaire: $('#sess-client-nouveau-prix').value ? Number($('#sess-client-nouveau-prix').value) : null,
    numero_devis: $('#sess-client-nouveau-devis').value.trim() || null,
  });
  if (error) {
    if (error.code === '23505') { toast('Ce client est déjà rattaché à cette session.', 'erreur'); return; }
    DEBUG.erreur('ajouterClientSessionExistante', error); toast('Erreur : ' + error.message, 'erreur'); return;
  }
  toast('Client ajouté à la session.');
  ouvrirSession(sessionId);
}

// Horaires de la session (convocation) : affichés en lecture seule, avec un bouton « Modifier » (admin / gestionnaire).
function htmlHorairesSession(session, edition) {
  const h = (session.horaires && session.horaires[0]) || {};
  const fh = v => { const m = /^(\d{1,2}):(\d{2})/.exec(v || ''); return m ? `${m[1].padStart(2, '0')}h${m[2]}` : ''; };
  const t = v => esc(String(v || '').slice(0, 5));
  if (edition) return `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;">
      <span>Horaires — début :</span><input type="time" id="sess-h-debut" value="${t(h.debut)}" style="width:105px;margin:0;padding:4px 8px;">
      <span>pause de :</span><input type="time" id="sess-h-pause-debut" value="${t(h.pause_debut)}" style="width:105px;margin:0;padding:4px 8px;">
      <span>à :</span><input type="time" id="sess-h-pause-fin" value="${t(h.pause_fin)}" style="width:105px;margin:0;padding:4px 8px;">
      <span>fin :</span><input type="time" id="sess-h-fin" value="${t(h.fin)}" style="width:105px;margin:0;padding:4px 8px;">
      <button class="bouton" style="padding:4px 12px;font-size:13px;margin:0;" onclick="enregistrerHorairesSession('${session.id}')">Enregistrer</button>
      <button class="bouton" style="padding:4px 12px;font-size:13px;margin:0;background:#eee;color:#333;" onclick="annulerHorairesSession()">Annuler</button>
    </div>`;
  const aucun = !(h.debut || h.pause_debut || h.pause_fin || h.fin);
  const texte = aucun ? '<em>non renseignés</em>'
    : `${fh(h.debut) || '—'} → ${fh(h.fin) || '—'}${(h.pause_debut || h.pause_fin) ? ` (pause déjeuner ${fh(h.pause_debut) || '—'} – ${fh(h.pause_fin) || '—'})` : ''}`;
  return `<span>Horaires de la session : <strong style="color:#1c2b36;">${texte}</strong></span>
    ${PEUT_GERER_SESSIONS() ? `<button class="bouton" style="padding:3px 10px;font-size:12px;margin:0 0 0 8px;" onclick="modifierHorairesSession()">${aucun ? 'Renseigner' : 'Modifier'}</button>` : ''}`;
}
function modifierHorairesSession() { $('#sess-horaires').innerHTML = htmlHorairesSession(window.__sessionCourante, true); }
function annulerHorairesSession() { $('#sess-horaires').innerHTML = htmlHorairesSession(window.__sessionCourante, false); }

async function enregistrerHorairesSession(sessionId) {
  const h = { debut: $('#sess-h-debut').value || null, pause_debut: $('#sess-h-pause-debut').value || null, pause_fin: $('#sess-h-pause-fin').value || null, fin: $('#sess-h-fin').value || null };
  const horaires = (h.debut || h.pause_debut || h.pause_fin || h.fin) ? [h] : [];
  const { error } = await supa.from('sessions_formation').update({ horaires }).eq('id', sessionId);
  if (error) { DEBUG.erreur('enregistrerHorairesSession', error); toast('Erreur : ' + error.message, 'erreur'); return; }
  toast('Horaires enregistrés.');
  window.__sessionCourante.horaires = horaires;
  annulerHorairesSession();
}

async function enregistrerForprevSession(sessionId) {
  const numero = $('#sess-forprev').value.trim() || null;
  const date = $('#sess-forprev-date').value || null;
  const { error } = await supa.from('sessions_formation').update({ numero_forprev: numero, date_declaration_forprev: date }).eq('id', sessionId);
  if (error) { DEBUG.erreur('enregistrerForprevSession', error); toast('Erreur : ' + error.message, 'erreur'); return; }
  toast('ForePrev enregistré.');
  if (window.__sessionCourante) { window.__sessionCourante.numero_forprev = numero; window.__sessionCourante.date_declaration_forprev = date; }
}

async function enregistrerFinancementSession(sessionId) {
  const origine = $('#sess-origine').value;
  const sousTraitance = $('#sess-sous-traitance').checked;
  const modalite = $('#sess-modalite').value;
  const formateurId = $('#sess-formateur')?.value || null;
  const charge = { origine_financement: origine, sous_traitance_recue: sousTraitance, modalite, formateur_id: formateurId };
  const { error } = await supa.from('sessions_formation').update(charge).eq('id', sessionId);
  if (error) { DEBUG.erreur('enregistrerFinancementSession', error); toast('Erreur : ' + error.message, 'erreur'); return; }
  toast('Financement mis à jour.');
  if (window.__sessionCourante) {
    window.__sessionCourante.origine_financement = origine;
    window.__sessionCourante.sous_traitance_recue = sousTraitance;
    window.__sessionCourante.modalite = modalite;
    window.__sessionCourante.formateur_id = formateurId;
  }
}

function ouvrirConfirmationSuppression(sessionId, nbStagiaires) {
  const zone = $('#suppression-zone');
  zone.innerHTML = `
    <div class="carte" style="border-color:#b3261e;background:#fdeeee;">
      <h3 style="margin-top:0;color:#b3261e;">Supprimer cette session</h3>
      <p style="font-size:13px;">Cette action supprime définitivement la session, ses inscriptions et les documents associés enregistrés.${nbStagiaires > 0 ? '' : ' Cette session ne compte aucun stagiaire — c\'est sans risque, notamment pour retirer un doublon créé par erreur lors d\'un import.'}</p>
      <label for="supp-texte">Pour confirmer, tape <strong>SUPPRESSION</strong> en toutes lettres ci-dessous :</label>
      <input id="supp-texte" placeholder="SUPPRESSION">
      <button class="bouton" id="supp-valider" style="margin-top:10px;background:#b3261e;" disabled>Confirmer la suppression</button>
      <button class="bouton" style="margin-top:10px;margin-left:8px;background:#eee;color:#333;" onclick="$('#suppression-zone').innerHTML=''">Annuler</button>
      <div class="erreur" id="supp-erreur"></div>
    </div>`;

  const champ = $('#supp-texte');
  const bouton = $('#supp-valider');
  champ.oninput = () => { bouton.disabled = champ.value.trim() !== 'SUPPRESSION'; };

  bouton.onclick = async () => {
    if (champ.value.trim() !== 'SUPPRESSION') return;
    const { error } = await supa.from('sessions_formation').delete().eq('id', sessionId);
    if (error) { DEBUG.erreur('supprimerSession', error); $('#supp-erreur').textContent = 'Erreur : ' + error.message; return; }
    toast('Session supprimée.');
    allerA('sessions');
  };
}

// ============================================================================
// SECTIONS REPLIABLES de la fiche session
// Un clic sur le titre d'une carte la replie / la déplie. Les cartes dont les
// informations sont déjà renseignées (clients, formateur + financement…) sont
// repliées d'office, avec un résumé affiché à côté du titre. L'état choisi par
// l'utilisateur est conservé tant qu'il reste sur la même session (y compris
// quand une carte est redessinée, ex. la synthèse après un enregistrement).
// ============================================================================
function rendreRepliable(carte, cle, replieParDefaut, resume) {
  if (!carte) return;
  const h = carte.querySelector(':scope > h3');
  if (!h || h.dataset.repliable) return;
  window.__repliEtat = window.__repliEtat || {};
  if (!(cle in window.__repliEtat)) window.__repliEtat[cle] = !!replieParDefaut;

  const corps = document.createElement('div');
  corps.className = 'repliable-corps';
  while (h.nextSibling) corps.appendChild(h.nextSibling);
  carte.appendChild(corps);
  carte.dataset.repliableCle = cle;

  const titre = h.innerHTML;
  h.dataset.repliable = '1';
  h.style.cursor = 'pointer';
  h.style.userSelect = 'none';
  const maj = () => {
    const replie = window.__repliEtat[cle];
    corps.style.display = replie ? 'none' : '';
    h.style.marginBottom = replie ? '0' : '';
    h.innerHTML = `<span style="display:inline-block;width:16px;color:#55636c;">${replie ? '▸' : '▾'}</span>${titre}` +
      (replie && resume ? ` <span style="font-weight:normal;font-size:12px;color:#55636c;margin-left:8px;">${resume}</span>` : '');
  };
  h.onclick = () => { window.__repliEtat[cle] = !window.__repliEtat[cle]; maj(); };
  carte._majRepli = maj;
  maj();
}

function basculerToutesSections(replie) {
  document.querySelectorAll('[data-repliable-cle]').forEach(c => {
    window.__repliEtat[c.dataset.repliableCle] = replie;
    if (c._majRepli) c._majRepli();
  });
}

// Applique le repli aux cartes de la fiche session (appelée à la fin du rendu).
function appliquerSectionsRepliables(session, sessionClients, participants, formateurs) {
  const carteParTitre = titre => Array.from(document.querySelectorAll('#vue .carte > h3')).find(h => h.textContent.trim() === titre)?.parentElement;
  const echap = s => esc(s || '');

  const noms = (sessionClients || []).map(sc => sc.clients?.raison_sociale).filter(Boolean);
  rendreRepliable(carteParTitre('Clients de la session'), 'clients', noms.length > 0, echap(noms.join(', ')));

  const formateur = session.__formateurNom || null;
  const origine = session.origine_financement
    ? ORIGINES_FINANCEMENT.flatMap(g => g.options).find(o => o.valeur === session.origine_financement)?.libelle
    : null;
  const modalites = { presentiel: 'Présentiel', distanciel: 'Distanciel', mixte: 'Mixte' };
  rendreRepliable(carteParTitre('Financement et formateur'), 'financement', !!(formateur && origine),
    echap([formateur, modalites[session.modalite], origine].filter(Boolean).join(' · ')));

  rendreRepliable(carteParTitre('Documents de la session'), 'documents', true, 'Convention, feuille d\'émargement');
  rendreRepliable(carteParTitre('Téléchargement groupé et envoi au client'), 'groupe', true, 'ZIP / envoi par email');

  // Barre « Tout déplier / Tout replier » avant la première carte repliable.
  const premiere = document.querySelector('[data-repliable-cle]');
  if (premiere && !document.getElementById('barre-repli')) {
    const barre = document.createElement('div');
    barre.id = 'barre-repli';
    barre.style.cssText = 'text-align:right;font-size:12px;margin:-6px 0 8px;';
    barre.innerHTML = '<a href="#" onclick="basculerToutesSections(false);return false;">Tout déplier</a> · <a href="#" onclick="basculerToutesSections(true);return false;">Tout replier</a>';
    premiere.parentElement.insertBefore(barre, premiere);
  }
}

// ============================================================================
// REPORT / CHANGEMENT DE DATE D'UNE SESSION
// Report (client, indisponibilité, annulée puis reprogrammée, autre) : la
// session d'origine est conservée (annulée, ancien numéro et ancienne date)
// et une nouvelle session est créée avec la nouvelle date et un nouveau
// numéro (RPC reporter_session). Erreur de saisie : correction sur place.
// ============================================================================
const MOTIFS_REPORT = [
  { valeur: 'client', libelle: 'Reportée à la demande du client' },
  { valeur: 'indisponibilite', libelle: 'Reportée (formateur / salle indisponible)' },
  { valeur: 'annulee_reprogrammee', libelle: 'Annulée puis reprogrammée' },
  { valeur: 'erreur_saisie', libelle: "Correction d'une erreur de saisie" },
  { valeur: 'autre', libelle: 'Autre motif (à préciser)' },
];
const libelleMotifReport = v => (MOTIFS_REPORT.find(m => m.valeur === v) || {}).libelle || v || '';

function plageDatesCourte(s) {
  return formatDateFr(s.date_debut) + (s.date_fin && s.date_fin !== s.date_debut ? ' → ' + formatDateFr(s.date_fin) : '');
}

// Bandeau d'historique affiché en haut de la fiche : lien vers la session
// d'origine / la session de reprogrammation, et corrections de date faites
// sur place.
function rendreHistoriqueDates(session, origine, suivante) {
  const lignes = [];
  if (origine) {
    lignes.push(`Reprogrammation de la session n° <a href="#" onclick="ouvrirSession('${origine.id}');return false;">${esc(origine.numero_session || '—')}</a>
      (prévue le ${esc(plageDatesCourte(origine))}) — motif : ${esc(libelleMotifReport(origine.motif_report))}${origine.commentaire_report ? ' (' + esc(origine.commentaire_report) + ')' : ''}.`);
  }
  if (suivante) {
    lignes.push(`Cette session a été <strong>reportée</strong> (${esc(libelleMotifReport(session.motif_report))}${session.commentaire_report ? ' — ' + esc(session.commentaire_report) : ''}) :
      voir la nouvelle session n° <a href="#" onclick="ouvrirSession('${suivante.id}');return false;">${esc(suivante.numero_session || '—')}</a> du ${esc(plageDatesCourte(suivante))}.`);
  }
  (Array.isArray(session.historique_dates) ? session.historique_dates : []).forEach(h => {
    lignes.push(`Date corrigée le ${esc(new Date(h.le).toLocaleDateString('fr-FR'))}${h.par_nom ? ' par ' + esc(h.par_nom) : ''} :
      ${esc(h.ancienne_date_debut ? formatDateFr(h.ancienne_date_debut) : '—')} (n° ${esc(h.ancien_numero || '—')}) → ${esc(h.nouveau_numero || '—')}${h.commentaire ? ' — ' + esc(h.commentaire) : ''}.`);
  });
  if (!lignes.length) return '';
  return `<div class="carte" style="background:#fff8e6;border:1px solid #f0d58c;font-size:13px;">
    ${lignes.map(l => `<div style="padding:2px 0;">${l}</div>`).join('')}
  </div>`;
}

function ouvrirReportSession(sessionId) {
  const s = window.__sessionCourante;
  if (!s || s.id !== sessionId) { toast('Recharge la session puis réessaie.', 'erreur'); return; }
  // Une session terminée ne peut qu'être corrigée sur place (pas reportée).
  const motifsPossibles = s.statut === 'terminee' ? MOTIFS_REPORT.filter(m => m.valeur === 'erreur_saisie') : MOTIFS_REPORT;

  $('#report-zone').innerHTML = `
    <div class="carte" style="max-width:620px;">
      <h3 style="margin-top:0;">Modifier la date de la session</h3>
      <p style="font-size:13px;color:#55636c;margin:0 0 10px;">Actuellement : ${esc(plageDatesCourte(s))} — n° ${esc(s.numero_session || '—')}</p>
      <div style="display:flex;gap:10px;">
        <div style="flex:1;"><label for="rp-debut">Nouvelle date de début</label><input id="rp-debut" type="date"></div>
        <div style="flex:1;"><label for="rp-fin">Nouvelle date de fin</label><input id="rp-fin" type="date"></div>
      </div>
      <label for="rp-motif">Motif</label>
      <select id="rp-motif">
        ${motifsPossibles.map(m => `<option value="${m.valeur}">${esc(m.libelle)}</option>`).join('')}
      </select>
      <label for="rp-commentaire">Précision <span id="rp-commentaire-oblig" style="font-weight:normal;color:#55636c;">(facultatif)</span></label>
      <input id="rp-commentaire" placeholder="ex. demande de la DRH, formateur malade…">
      <p id="rp-explication" style="font-size:12px;color:#55636c;margin:8px 0 0;"></p>
      <button class="bouton" id="rp-valider" style="margin-top:12px;">Valider</button>
      <button class="bouton" style="margin-top:12px;margin-left:8px;background:#eee;color:#333;" onclick="$('#report-zone').innerHTML=''">Annuler</button>
      <div class="erreur" id="rp-erreur"></div>
    </div>`;

  const majExplication = () => {
    const motif = $('#rp-motif').value;
    $('#rp-commentaire-oblig').textContent = motif === 'autre' ? '(obligatoire)' : '(facultatif)';
    $('#rp-explication').textContent = motif === 'erreur_saisie'
      ? "La date est corrigée sur cette même session. Le numéro est recalculé si le mois change, et l'ancienne date est conservée dans l'historique de la fiche."
      : "La session actuelle est conservée avec son ancienne date et son numéro, et passe en « annulée ». Une nouvelle session est créée avec la nouvelle date et un nouveau numéro (mêmes formation, client(s), formateur, lieu, tarifs et stagiaires). Les documents déjà générés restent sur l'ancienne session : il faudra régénérer ceux de la nouvelle.";
  };
  $('#rp-motif').onchange = majExplication;
  majExplication();

  $('#rp-valider').onclick = async () => {
    const debut = $('#rp-debut').value;
    const fin = $('#rp-fin').value || debut;
    const motif = $('#rp-motif').value;
    const commentaire = $('#rp-commentaire').value.trim();
    if (!debut) { $('#rp-erreur').textContent = 'Indique la nouvelle date de début.'; return; }
    if (fin < debut) { $('#rp-erreur').textContent = 'La date de fin ne peut pas précéder la date de début.'; return; }
    if (motif === 'autre' && !commentaire) { $('#rp-erreur').textContent = 'Précise le motif.'; return; }
    if (motif !== 'erreur_saisie' && !confirm(`Reporter cette session au ${formatDateFr(debut)} ? L'actuelle sera conservée (annulée) et une nouvelle session sera créée.`)) return;

    $('#rp-valider').disabled = true;
    const { data: nouvelleId, error } = await supa.rpc('reporter_session', {
      p_session: sessionId, p_date_debut: debut, p_date_fin: fin, p_motif: motif, p_commentaire: commentaire || null,
    });
    if (error) {
      DEBUG.erreur('reporterSession', error);
      $('#rp-erreur').textContent = 'Erreur : ' + error.message;
      $('#rp-valider').disabled = false;
      return;
    }
    toast(motif === 'erreur_saisie' ? 'Date corrigée.' : 'Session reportée — nouvelle session créée.');
    ouvrirSession(nouvelleId);
  };
}

function rendreParticipants(session, participants) {
  // Mémorisés tout de suite (avant le retour anticipé ci-dessous) : les
  // boutons Convention/Convocation/AFF/Certificat de l'écran s'appuient sur
  // window.__sessionCourante et window.__participantsCourants même quand la
  // session n'a encore aucun stagiaire inscrit.
  window.__participantsCourants = participants;
  window.__sessionCourante = session;

  rendreSynthese();
  const zone = $('#participants-liste');
  if (participants.length === 0) { zone.innerHTML = '<p style="color:#55636c;">Aucun stagiaire inscrit.</p>'; return; }

  zone.innerHTML = participants.map(p => `
    <div class="carte" style="margin-bottom:10px;background:#fafbfc;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <strong>${esc(p.stagiaires?.prenom)} ${esc(p.stagiaires?.nom)}</strong>
        <select data-pid="${p.id}" class="sp-statut" style="width:auto;">
          ${['inscrit','present','absent','certifie','non_certifie'].map(s => `<option value="${s}" ${s === p.statut ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <button class="bouton" style="padding:5px 10px;font-size:12px;" onclick="toggleFise('${p.id}')">FISE / compétences</button>
        <button class="bouton" style="padding:5px 10px;font-size:12px;" onclick="toggleEvaluation('${p.id}')">Évaluation stagiaire</button>
        ${grilleSstType(window.__sessionCourante) ? `<button class="bouton" style="padding:5px 10px;font-size:12px;" onclick="toggleGrilleSst('${p.id}')">Grille ${grilleSstType(window.__sessionCourante) === 'mac' ? 'MAC SST' : 'SST'}</button>` : ''}
        <button class="bouton" style="padding:5px 10px;font-size:12px;background:#eee;color:#333;" onclick="genererConvocation(window.__sessionCourante, window.__participantsCourants.find(x=>x.id==='${p.id}'))">Convocation</button>
        <button class="bouton" style="padding:5px 10px;font-size:12px;background:#eee;color:#333;" onclick="genererAFF(window.__sessionCourante, window.__participantsCourants.find(x=>x.id==='${p.id}'))">AFF</button>
        <button class="bouton" style="padding:5px 10px;font-size:12px;background:#eee;color:#333;" onclick="genererCertificatRealisation(window.__sessionCourante, window.__participantsCourants.find(x=>x.id==='${p.id}'))">Certificat</button>
      </div>
      <div id="fise-${p.id}" style="display:none;margin-top:12px;"></div>
      <div id="eval-${p.id}" style="display:none;margin-top:12px;"></div>
      <div id="grille-${p.id}" style="display:none;margin-top:12px;"></div>
    </div>`).join('');

  $$('.sp-statut').forEach(sel => {
    sel.onchange = async () => {
      const { error } = await supa.from('session_participants').update({ statut: sel.value }).eq('id', sel.dataset.pid);
      if (error) { DEBUG.erreur('maj statut participant', error); toast('Erreur : ' + error.message, 'erreur'); return; }
      const pp = window.__participantsCourants.find(x => x.id === sel.dataset.pid);
      if (pp) pp.statut = sel.value;
      rendreSynthese();
      toast('Statut mis à jour.');
    };
  });
}

// Échelle à 3 niveaux pour la grille de certification FISE (utilisée sur
// l'AFF). Remplace l'ancienne échelle à 2 niveaux (Acquise/Reste à
// acquérir, stockée en booléen) — GRADE_COMPAT convertit à la volée les
// grilles déjà enregistrées dans l'ancien format.
const GRADES_FISE = [
  { valeur: 'acquis', libelle: 'A' },
  { valeur: 'eca', libelle: 'ECA' },
  { valeur: 'non_acquis', libelle: 'NA' },
];
const gradeFiseCompat = a => a === true ? 'acquis' : a === false ? 'non_acquis' : a;

function toggleFise(participantId) {
  const zone = $('#fise-' + participantId);
  const visible = zone.style.display !== 'none';
  $$('[id^="fise-"], [id^="eval-"], [id^="grille-"]').forEach(z => z.style.display = 'none');
  if (visible) return;

  const p = window.__participantsCourants.find(x => x.id === participantId);
  const competences = window.__sessionCourante.formations_catalogue?.competences || [];
  const grille = Array.isArray(p.grille_certification) && p.grille_certification.length ? p.grille_certification
    : competences.map(c => ({ libelle: c.libelle, acquis: null }));

  zone.innerHTML = `
    <div style="border-top:1px solid #e0e0e0;padding-top:10px;">
      <p style="font-size:12px;color:#55636c;margin:0 0 8px;">FISE — compétences visées par la formation. A = Acquis, ECA = En cours d'acquisition, NA = Non acquis.</p>
      ${grille.map((c, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 0;font-size:13px;">
          <span style="flex:1;">${esc(c.libelle)}</span>
          <div style="display:flex;gap:12px;">
            ${GRADES_FISE.map(g => `
              <label style="display:flex;align-items:center;gap:4px;font-weight:normal;">
                <input type="radio" name="fise-grade-${i}" class="fise-champ" data-idx="${i}" value="${g.valeur}" style="width:auto;" ${gradeFiseCompat(c.acquis) === g.valeur ? 'checked' : ''}>
                ${g.libelle}
              </label>`).join('')}
          </div>
        </div>`).join('')}
      <button class="bouton" style="margin-top:10px;padding:6px 12px;font-size:13px;" onclick="enregistrerFise('${participantId}')">Enregistrer</button>
    </div>`;
  zone.style.display = 'block';
  zone.dataset.grille = JSON.stringify(grille);
}

async function enregistrerFise(participantId) {
  const zone = $('#fise-' + participantId);
  const grille = JSON.parse(zone.dataset.grille);
  $$('.fise-champ:checked', zone).forEach(input => {
    const i = Number(input.dataset.idx);
    grille[i].acquis = input.value;
  });
  const { error } = await supa.from('session_participants').update({ grille_certification: grille }).eq('id', participantId);
  if (error) { DEBUG.erreur('enregistrerFise', error); toast('Erreur : ' + error.message, 'erreur'); return; }
  const pf = window.__participantsCourants.find(x => x.id === participantId);
  if (pf) pf.grille_certification = grille;
  rendreSynthese();
  toast('FISE enregistrée.');
}

function toggleEvaluation(participantId) {
  const zone = $('#eval-' + participantId);
  const visible = zone.style.display !== 'none';
  $$('[id^="fise-"], [id^="eval-"], [id^="grille-"]').forEach(z => z.style.display = 'none');
  if (visible) return;

  const p = window.__participantsCourants.find(x => x.id === participantId);
  const reponses = p.evaluation_satisfaction || {};

  zone.innerHTML = `
    <div style="border-top:1px solid #e0e0e0;padding-top:10px;">
      <p style="font-size:12px;color:#55636c;margin:0 0 8px;">Évaluation de satisfaction (note de 1 à 4).</p>
      ${QUESTIONS_SATISFACTION.map(q => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 0;font-size:13px;">
          <span style="flex:1;">${esc(q)}</span>
          <select data-q="${esc(q)}" class="eval-champ" style="width:70px;">
            <option value="">—</option>
            ${[1,2,3,4].map(n => `<option value="${n}" ${reponses[q] == n ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </div>`).join('')}
      <label for="eval-commentaire-${participantId}" style="margin-top:8px;">Commentaire du stagiaire (facultatif)</label>
      <textarea id="eval-commentaire-${participantId}" rows="3" placeholder="Remarques libres du stagiaire sur la formation…">${esc(p.commentaire_evaluation || '')}</textarea>
      <button class="bouton" style="margin-top:10px;padding:6px 12px;font-size:13px;" onclick="enregistrerEvaluation('${participantId}')">Enregistrer</button>
    </div>`;
  zone.style.display = 'block';
}

async function enregistrerEvaluation(participantId) {
  const zone = $('#eval-' + participantId);
  const reponses = {};
  let total = 0, n = 0;
  $$('.eval-champ', zone).forEach(sel => {
    if (sel.value) { reponses[sel.dataset.q] = Number(sel.value); total += Number(sel.value); n++; }
  });
  const noteMoyenne = n ? Math.round((total / n) * 100) / 100 : null;
  const commentaire = ($('#eval-commentaire-' + participantId).value || '').trim() || null;
  const { error } = await supa.from('session_participants')
    .update({ evaluation_satisfaction: reponses, note_moyenne: noteMoyenne, commentaire_evaluation: commentaire })
    .eq('id', participantId);
  if (error) { DEBUG.erreur('enregistrerEvaluation', error); toast('Erreur : ' + error.message, 'erreur'); return; }
  const p = (window.__participantsCourants || []).find(x => x.id === participantId);
  if (p) { p.evaluation_satisfaction = reponses; p.note_moyenne = noteMoyenne; p.commentaire_evaluation = commentaire; }
  toast('Évaluation enregistrée.');
  rendreSynthese();
}

// ============================================================================
// SYNTHÈSE DES ÉVALUATIONS DE LA SESSION (satisfaction + réussite)
// ============================================================================

// ----------------------------------------------------------------------------
// Évaluation par QR code : le stagiaire scanne, choisit son nom et répond sur
// son téléphone (page publique evaluation.html, protégée par un jeton propre à
// la session, ouverte du dernier jour de la session à +7 jours).
// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------
// Émargement par QR code : un seul QR par session (quel que soit le nombre de
// clients). Le stagiaire signe au doigt par demi-journée sur emargement.html ;
// le formateur (connecté) signe depuis la même page. À la fin, on sort une
// feuille d'émargement signée PAR CLIENT (confidentialité vis-à-vis des OPCO).
// ----------------------------------------------------------------------------
function urlEmargement(session) {
  return new URL('emargement.html', location.href).href.split('?')[0] + '?t=' + session.token_emargement;
}

async function rendreQrEmargement(session) {
  const zone = $('#qr-emarg-zone');
  if (!zone) return;
  if (!session.token_emargement || typeof qrcode !== 'function') {
    zone.innerHTML = '<h3 style="margin-top:0;">Émargement par QR code</h3><p style="color:#55636c;font-size:13px;">Indisponible : le patch SQL « émargement par QR code » n\'a pas encore été exécuté dans Supabase.</p>';
    return;
  }
  const url = urlEmargement(session);
  const clients = window.__sessionClients || [];
  const boutonsClients = clients.length
    ? clients.map(c => `<button class="bouton" style="padding:6px 12px;font-size:13px;margin:0 6px 6px 0;" onclick="genererFeuilleEmargementSignee('${c.client_id}')">Feuille signée — ${esc(c.clients?.raison_sociale || 'client')}</button>`).join('') +
      (clients.length > 1 ? `<button class="bouton" style="padding:6px 12px;font-size:13px;margin:0 6px 6px 0;background:#eee;color:#333;" onclick="genererFeuilleEmargementSignee(null)">Feuille complète (usage interne)</button>` : '')
    : `<button class="bouton" style="padding:6px 12px;font-size:13px;" onclick="genererFeuilleEmargementSignee(null)">Feuille signée (PDF)</button>`;
  zone.innerHTML = `
    <h3 style="margin-top:0;">Émargement par QR code</h3>
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;">
      <img src="${qrDataUrl(url, 5)}" alt="QR code d'émargement" style="width:150px;height:150px;border:1px solid #d7dee3;border-radius:6px;">
      <div style="flex:1;min-width:260px;font-size:13px;">
        <p style="margin:0 0 8px;">Un seul QR code pour toute la session. Chaque stagiaire scanne, choisit son nom et signe au doigt, matin et après-midi. Le formateur, connecté à l'application, ouvre la même page et choisit « Je suis le formateur ».</p>
        <p style="margin:0 0 8px;color:#55636c;">Ouvert du ${esc(formatDateFr(session.date_debut))} au ${esc(formatDateFr(session.date_fin || session.date_debut))}. Signatures horodatées, impossibles à modifier.</p>
        <p id="emarg-compteur" style="margin:0 0 10px;font-weight:600;">Signatures reçues : …</p>
        <button class="bouton" style="padding:6px 12px;font-size:13px;" onclick="telechargerAfficheEmargement()">Affiche du QR code (PDF)</button>
        <button class="bouton" style="padding:6px 12px;font-size:13px;background:#eee;color:#333;margin-left:6px;" onclick="navigator.clipboard.writeText('${esc(url)}').then(()=>toast('Lien copié.'))">Copier le lien</button>
        <button class="bouton" style="padding:6px 12px;font-size:13px;background:#eee;color:#333;margin-left:6px;" onclick="window.open('${esc(url)}','_blank')">Émarger (formateur) / tester</button>
        <div style="margin-top:14px;border-top:1px solid #eee;padding-top:10px;">
          <strong style="font-size:13px;color:#55636c;">Feuilles d'émargement signées — une par client</strong>
          <p style="font-size:12px;color:#55636c;margin:4px 0 8px;">Chaque feuille ne contient que les stagiaires du client concerné : à envoyer à l'OPCO sans divulguer les autres entreprises.</p>
          ${boutonsClients}
        </div>
      </div>
    </div>`;
  rendreRepliable(zone, 'qr-emargement', true, 'QR code, affiche, feuilles signées par client');

  const { data } = await supa.from('emargements').select('role').eq('session_id', session.id);
  const c = $('#emarg-compteur');
  if (c) c.textContent = `Signatures reçues : ${(data || []).filter(e => e.role === 'stagiaire').length} stagiaire(s), ${(data || []).filter(e => e.role === 'formateur').length} formateur`;
}

async function genererFeuilleEmargementSignee(clientId) {
  const session = window.__sessionCourante;
  const { data, error } = await supa.from('emargements').select('*').eq('session_id', session.id);
  if (error) { DEBUG.erreur('genererFeuilleEmargementSignee', error); toast('Erreur : ' + error.message, 'erreur'); return; }
  const clientEntry = clientId ? (window.__sessionClients || []).find(c => c.client_id === clientId) : null;
  genererFeuillePresence(session, window.__participantsCourants, false, { emargements: data || [], clientEntry });
}

function telechargerAfficheEmargement() {
  const s = window.__sessionCourante;
  const doc = new jsPDF({ compress: true });
  if (typeof ajouterLogoEnTete === 'function') ajouterLogoEnTete(doc);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(10, 92, 138);
  doc.text('Émargement', 105, 50, { align: 'center' });
  doc.setFontSize(13); doc.setTextColor(20, 20, 20);
  doc.text(doc.splitTextToSize(s.formations_catalogue?.denomination || '', 170), 105, 62, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text(plageDatesCourte(s), 105, 76, { align: 'center' });
  doc.addImage(qrDataUrl(urlEmargement(s), 10), 'PNG', 55, 90, 100, 100);
  doc.setFontSize(13);
  doc.text('Scannez ce QR code avec votre téléphone,', 105, 205, { align: 'center' });
  doc.text('choisissez votre nom et signez, matin et après-midi.', 105, 213, { align: 'center' });
  telechargerOuOuvrir(doc, nomFichierDoc('Affiche emargement QR', s, null));
}

function urlEvaluation(session) {
  return new URL('evaluation.html', location.href).href.split('?')[0] + '?t=' + session.token_evaluation;
}

// QR code aux couleurs de Prévisecours (rouge #E52231 / bleu #2473B5, croix au centre), niveau de
// correction d'erreur élevé (H) pour que le logo central ne gêne pas la lecture. Rendu PNG sur canvas.
// opts.simple = true : QR noir classique (secours).
function qrDataUrl(texte, taille, opts) {
  opts = opts || {};
  const qr = qrcode(0, opts.simple ? 'M' : 'H');
  qr.addData(texte);
  qr.make();
  const n = qr.getModuleCount(), marge = 2, px = taille || 8;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = (n + 2 * marge) * px;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const ROUGE = '#E52231', BLEU = '#2473B5', moitie = n / 2;
  const quadrant = (r, c) => ((r < moitie) === (c < moitie)) ? BLEU : ROUGE;   // haut-gauche et bas-droite bleus, autres rouges
  const oeil = (r, c) => {                                                      // position dans un des 3 repères (7x7), sinon null
    const coins = [[0, 0], [0, n - 7], [n - 7, 0]];
    for (const [r0, c0] of coins) if (r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7) return { r: r - r0, c: c - c0 };
    return null;
  };
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!qr.isDark(r, c)) continue;
    let couleur = opts.simple ? '#000' : quadrant(r, c);
    const o = oeil(r, c);
    if (!opts.simple && o && o.r >= 2 && o.r <= 4 && o.c >= 2 && o.c <= 4) couleur = (couleur === BLEU ? ROUGE : BLEU);  // centre du repère : couleur inverse
    ctx.fillStyle = couleur;
    ctx.fillRect((c + marge) * px, (r + marge) * px, px, px);
  }
  if (!opts.simple) {
    // Croix Prévisecours au centre : moitié haute/gauche rouge, moitié basse/droite bleue, séparées par une fine diagonale blanche
    const L = canvas.width, centre = L / 2, boite = L * 0.27, S = L * 0.20, t = S / 3;
    ctx.fillStyle = '#fff'; ctx.fillRect(centre - boite / 2, centre - boite / 2, boite, boite);
    const croix = (couleur, clip) => {
      ctx.save();
      if (clip) { ctx.beginPath(); ctx.moveTo(centre + S, centre - S); ctx.lineTo(centre + S, centre + S); ctx.lineTo(centre - S, centre + S); ctx.closePath(); ctx.clip(); }
      ctx.fillStyle = couleur;
      ctx.fillRect(centre - t / 2, centre - S / 2, t, S);
      ctx.fillRect(centre - S / 2, centre - t / 2, S, t);
      ctx.restore();
    };
    croix(ROUGE, false); croix(BLEU, true);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, L * 0.008);
    ctx.beginPath(); ctx.moveTo(centre + S / 2, centre - S / 2); ctx.lineTo(centre - S / 2, centre + S / 2); ctx.stroke();
  }
  return canvas.toDataURL('image/png');
}

function rendreQrEvaluation(session) {
  const zone = $('#qr-eval-zone');
  if (!zone) return;
  if (!session.token_evaluation || typeof qrcode !== 'function') {
    zone.innerHTML = '<h3 style="margin-top:0;">Évaluation par QR code</h3><p style="color:#55636c;font-size:13px;">Indisponible : le patch SQL « évaluation par QR code » n\'a pas encore été exécuté dans Supabase.</p>';
    return;
  }
  const url = urlEvaluation(session);
  const fin = session.date_fin || session.date_debut;
  const limite = new Date(fin + 'T12:00:00'); limite.setDate(limite.getDate() + 7);
  zone.innerHTML = `
    <h3 style="margin-top:0;">Évaluation par QR code</h3>
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;">
      <img src="${qrDataUrl(url, 5)}" alt="QR code d'évaluation" style="width:150px;height:150px;border:1px solid #d7dee3;border-radius:6px;">
      <div style="flex:1;min-width:240px;font-size:13px;">
        <p style="margin:0 0 8px;">Les stagiaires scannent ce QR code avec leur téléphone, choisissent leur nom et remplissent l'évaluation de satisfaction. Les réponses arrivent dans la synthèse ci-dessous.</p>
        <p style="margin:0 0 8px;color:#55636c;">Ouvert du ${esc(formatDateFr(fin))} (dernier jour de la session) au ${esc(limite.toLocaleDateString('fr-FR'))}. Chaque stagiaire ne peut répondre qu'une fois.</p>
        <button class="bouton" style="padding:6px 12px;font-size:13px;" onclick="telechargerAfficheQr('${session.id}')">Télécharger l'affiche (PDF)</button>
        <button class="bouton" style="padding:6px 12px;font-size:13px;background:#eee;color:#333;margin-left:6px;" onclick="copierLienEvaluation()">Copier le lien</button>
        <button class="bouton" style="padding:6px 12px;font-size:13px;background:#eee;color:#333;margin-left:6px;" onclick="window.open('${esc(url)}','_blank')">Tester</button>
      </div>
    </div>`;
  rendreRepliable(zone, 'qr-evaluation', true, 'QR code, affiche, lien');
}

async function copierLienEvaluation() {
  const s = window.__sessionCourante;
  try { await navigator.clipboard.writeText(urlEvaluation(s)); toast('Lien copié.'); }
  catch (e) { prompt('Copie ce lien :', urlEvaluation(s)); }
}

function telechargerAfficheQr() {
  const s = window.__sessionCourante;
  const doc = new jsPDF({ compress: true });
  if (typeof ajouterLogoEnTete === 'function') ajouterLogoEnTete(doc);
  const f = s.formations_catalogue;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(10, 92, 138);
  doc.text('Votre avis compte !', 105, 50, { align: 'center' });
  doc.setFontSize(13); doc.setTextColor(20, 20, 20);
  doc.text(doc.splitTextToSize(f?.denomination || '', 170), 105, 62, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text(plageDatesCourte(s), 105, 76, { align: 'center' });
  doc.addImage(qrDataUrl(urlEvaluation(s), 10), 'PNG', 55, 90, 100, 100);
  doc.setFontSize(13);
  doc.text('Scannez ce QR code avec votre téléphone', 105, 205, { align: 'center' });
  doc.text("pour évaluer la formation (2 minutes).", 105, 213, { align: 'center' });
  doc.setFontSize(10); doc.setTextColor(90, 90, 90);
  doc.text('Vos réponses servent à améliorer nos formations.', 105, 228, { align: 'center' });
  telechargerOuOuvrir(doc, nomFichierDoc('Affiche evaluation QR', s, null));
}

// Radar SVG (échelle 0 à 4), sans bibliothèque externe.
function radarSvg(libelles, valeurs) {
  const W = 560, H = 400, cx = W / 2, cy = H / 2 + 5, R = 120, n = libelles.length;
  const pt = (i, r) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
  };
  const polygone = r => Array.from({ length: n }, (_, i) => pt(i, r).join(',')).join(' ');
  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:560px;height:auto;font-family:Arial,sans-serif;">`;
  for (let k = 1; k <= 4; k++) {
    s += `<polygon points="${polygone(R * k / 4)}" fill="none" stroke="#3b6fb6" stroke-width="0.8"/>`;
    s += `<text x="${cx + 3}" y="${cy - R * k / 4 + 10}" font-size="9" fill="#888">${k},00</text>`;
  }
  for (let i = 0; i < n; i++) {
    const [x, y] = pt(i, R);
    s += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#3b6fb6" stroke-width="0.8"/>`;
    const [lx, ly] = pt(i, R + 14);
    const anchor = Math.abs(lx - cx) < 8 ? 'middle' : (lx > cx ? 'start' : 'end');
    // libellé coupé en 2 lignes
    const mots = libelles[i].split(' ');
    let l1 = '', l2 = '';
    mots.forEach(m => { if ((l1 + ' ' + m).trim().length <= 24 && !l2) l1 = (l1 + ' ' + m).trim(); else l2 = (l2 + ' ' + m).trim(); });
    const dy = ly < cy - R * 0.9 ? -8 : (ly > cy + R * 0.9 ? 8 : 0);
    s += `<text x="${lx}" y="${ly + dy}" font-size="9.5" text-anchor="${anchor}" fill="#222">${esc(l1)}${l2 ? `<tspan x="${lx}" dy="11">${esc(l2)}</tspan>` : ''}</text>`;
  }
  const pts = valeurs.map((v, i) => pt(i, R * (v || 0) / 4).join(',')).join(' ');
  s += `<polygon points="${pts}" fill="rgba(60,170,90,0.35)" stroke="#22a350" stroke-width="2"/>`;
  return s + '</svg>';
}

function rendreSynthese() {
  const zone = $('#synthese-zone');
  if (!zone) return;
  const participants = window.__participantsCourants || [];
  const fr = n => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');

  // --- Satisfaction : nombre de réponses 1 à 4 par critère, moyenne /4
  const evalues = participants.filter(p => p.evaluation_satisfaction && Object.keys(p.evaluation_satisfaction).length);
  const lignes = QUESTIONS_SATISFACTION.map(q => {
    const c = [0, 0, 0, 0];
    evalues.forEach(p => { const v = Number(p.evaluation_satisfaction[q]); if (v >= 1 && v <= 4) c[v - 1]++; });
    const nb = c.reduce((a, b) => a + b, 0);
    const moy = nb ? (c[0] + 2 * c[1] + 3 * c[2] + 4 * c[3]) / nb : null;
    return { q, c, moy };
  });
  const moyennes = lignes.filter(l => l.moy !== null).map(l => l.moy);
  const noteTotale = moyennes.length ? moyennes.reduce((a, b) => a + b, 0) / moyennes.length : null;
  const commentaires = participants.filter(p => (p.commentaire_evaluation || '').trim());

  const cell = 'border:1px solid #222;padding:3px 8px;';
  const satisfaction = !evalues.length
    ? '<p style="color:#55636c;font-size:13px;">Aucune évaluation de satisfaction saisie pour le moment.</p>'
    : `<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;">
        <div>
          <table style="border-collapse:collapse;font-size:13px;">
            <tr><td style="border:none;"></td>${[1,2,3,4].map(n => `<td style="${cell}text-align:center;">${n}</td>`).join('')}<td style="${cell}text-align:center;">Total</td></tr>
            ${lignes.map(l => `<tr><td style="${cell}">${esc(l.q)}</td>${l.c.map(x => `<td style="${cell}text-align:center;">${x}</td>`).join('')}<td style="${cell}text-align:center;white-space:nowrap;">${l.moy === null ? '—' : fr(l.moy) + ' / 4'}</td></tr>`).join('')}
          </table>
          <p style="margin:10px 0 0;font-size:14px;"><strong>Note totale : ${noteTotale === null ? '—' : fr(noteTotale) + ' / 4'}</strong>
            <span style="color:#55636c;font-size:12px;">(${evalues.length} stagiaire${evalues.length > 1 ? 's' : ''} sur ${participants.length} ayant répondu)</span></p>
        </div>
        <div style="flex:1;min-width:300px;">${radarSvg(QUESTIONS_SATISFACTION, lignes.map(l => l.moy))}</div>
      </div>`;

  // --- Réussite : statut "certifié" = réussite, "non certifié" = échec
  const reussis = participants.filter(p => p.statut === 'certifie').length;
  const echecs = participants.filter(p => p.statut === 'non_certifie').length;
  const autres = participants.length - reussis - echecs;
  const taux = (reussis + echecs) ? Math.round(100 * reussis / (reussis + echecs)) : null;
  const reussite = `
    <table style="border-collapse:collapse;font-size:13px;">
      <tr><td style="${cell}">Réussites (certifié)</td><td style="${cell}text-align:center;min-width:50px;">${reussis}</td></tr>
      <tr><td style="${cell}">Échecs (non certifié)</td><td style="${cell}text-align:center;">${echecs}</td></tr>
      <tr><td style="${cell}">Sans décision (inscrit / présent / absent)</td><td style="${cell}text-align:center;">${autres}</td></tr>
      <tr><td style="${cell}"><strong>Taux de réussite</strong></td><td style="${cell}text-align:center;"><strong>${taux === null ? '—' : taux + ' %'}</strong></td></tr>
    </table>
    <p style="font-size:12px;color:#55636c;margin:6px 0 0;">Le résultat vient du statut de chaque stagiaire (menu « certifie » / « non_certifie » dans la liste ci-dessous).</p>`;

  zone.innerHTML = `
    <h3 style="margin-top:0;">Synthèse des évaluations</h3>
    <h4 style="margin:8px 0;">Satisfaction des stagiaires</h4>
    ${satisfaction}
    ${commentaires.length ? `<h4 style="margin:14px 0 6px;">Commentaires des stagiaires</h4>
      ${commentaires.map(p => `<div style="font-size:13px;padding:2px 0;"><strong>${esc(p.stagiaires?.prenom)} ${esc(p.stagiaires?.nom)}</strong> : ${esc(p.commentaire_evaluation)}</div>`).join('')}` : ''}
    <h4 style="margin:14px 0 8px;">Réussite</h4>
    ${reussite}`;
  rendreRepliable(zone, 'synthese', !evalues.length && !reussis && !echecs, evalues.length ? `${evalues.length} évaluation(s)` : '');
}

// ============================================================================
// RECHERCHE / AJOUT DE STAGIAIRE (dédoublonnage nom + prénom + client)
// ============================================================================

async function rechercherStagiaires(texte, session) {
  const zone = $('#sp-resultats');
  if (!texte) { zone.innerHTML = ''; return; }

  const { data, error } = await supa
    .from('stagiaires')
    .select('id, nom, prenom, date_naissance, client_id, clients(raison_sociale)')
    .or(`nom.ilike.%${texte}%,prenom.ilike.%${texte}%`)
    .limit(15);

  if (error) { DEBUG.erreur('rechercherStagiaires', error); return; }

  const clientChoisi = clientSelectionnePourAjout(session);

  // Priorité d'affichage aux stagiaires déjà liés au client sélectionné pour l'ajout
  const tries = (data || []).slice().sort((a, b) => {
    const aMatch = a.client_id === clientChoisi ? 0 : 1;
    const bMatch = b.client_id === clientChoisi ? 0 : 1;
    return aMatch - bMatch;
  });

  zone.innerHTML = `
    ${tries.map(s => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;margin-bottom:6px;font-size:13px;">
        <span>${esc(s.prenom)} ${esc(s.nom)} ${s.date_naissance ? '— né(e) le ' + formatDateFr(s.date_naissance) : ''} ${s.clients?.raison_sociale ? '— ' + esc(s.clients.raison_sociale) : ''}
          ${s.client_id === clientChoisi && clientChoisi ? '<span style="color:#0a5c8a;font-weight:600;">(même client)</span>' : ''}
        </span>
        <button class="bouton" style="padding:4px 10px;font-size:12px;" onclick="ajouterParticipant('${s.id}', '${session.id}', '${clientChoisi || ''}')">Ajouter</button>
      </div>`).join('')}
    <div style="padding:8px;border:1px dashed #c9c9c9;border-radius:6px;font-size:13px;color:#55636c;">
      Stagiaire introuvable ?
      <button class="bouton" style="padding:4px 10px;font-size:12px;margin-left:6px;" onclick="ouvrirFormNouveauStagiaire('${texte.replace(/'/g, "\\'")}', '${session.id}', '${clientChoisi || ''}')">Créer "${esc(texte)}"</button>
    </div>`;
}

function messageClientObligatoire() {
  return (window.__sessionClients || []).length
    ? 'Choisis d\'abord l\'entreprise de ce stagiaire (liste « Entreprise » au-dessus de la recherche).'
    : 'Cette session n\'a pas encore de client : ajoute d\'abord un client à la session, puis inscris le stagiaire.';
}

async function ajouterParticipant(stagiaireId, sessionId, clientId) {
  if (!clientId) { toast(messageClientObligatoire(), 'erreur'); return; }
  const { error } = await supa.from('session_participants').insert({
    organisation_id: S.organisation.id,
    session_id: sessionId,
    stagiaire_id: stagiaireId,
    client_id: clientId || null,
    statut: 'inscrit',
  });
  if (error) {
    if (error.code === '23505') { toast('Ce stagiaire est déjà inscrit à cette session.', 'erreur'); return; }
    DEBUG.erreur('ajouterParticipant', error); toast('Erreur : ' + error.message, 'erreur'); return;
  }
  toast('Stagiaire ajouté.');
  $('#sp-recherche').value = '';
  $('#sp-resultats').innerHTML = '';
  await proposerPropagationClient(sessionId, clientId, stagiaireId);
  ouvrirSession(sessionId);
}

// Si la session a d'autres inscrits sans entreprise, propose de leur donner la même entreprise
// (seulement quand la session n'a pas d'autre entreprise, pour ne jamais deviner à tort).
async function proposerPropagationClient(sessionId, clientId, sauf) {
  try {
    const [{ data: sc }, { data: sansClient }] = await Promise.all([
      supa.from('session_clients').select('client_id').eq('session_id', sessionId),
      supa.from('session_participants').select('id, stagiaire_id, stagiaires(nom, prenom, client_id)').eq('session_id', sessionId).is('client_id', null),
    ]);
    const autresClients = (sc || []).filter(x => x.client_id !== clientId);
    if (autresClients.length) return;                       // session à plusieurs entreprises : on ne devine pas
    const cibles = (sansClient || []).filter(p => p.stagiaire_id !== sauf && (!p.stagiaires?.client_id || p.stagiaires.client_id === clientId));
    if (!cibles.length) return;
    const nom = ((window.__sessionClients || []).find(x => x.client_id === clientId)?.clients?.raison_sociale) || 'cette entreprise';
    if (!confirm(`Cette session n'a pas d'autre entreprise, et ${cibles.length} autre(s) stagiaire(s) n'ont pas d'entreprise renseignée.\n\nLes rattacher aussi à « ${nom} » (ils sont rattachés dans la session et leur fiche, si elle est vide) ?\n\nOK = oui, tous ; Annuler = non, seulement ce stagiaire.`)) return;
    const actions = [{ type: 'session_client', session_id: sessionId, client_id: clientId }];
    cibles.forEach(p => {
      actions.push({ type: 'participant', participant_id: p.id, client_id: clientId });
      if (!p.stagiaires?.client_id) actions.push({ type: 'stagiaire', stagiaire_id: p.stagiaire_id, client_id: clientId });
    });
    const { data, error } = await supa.rpc('appliquer_rattachements', { p_actions: actions });
    if (error) { DEBUG.erreur('propagationClient', error); toast('Propagation impossible : ' + error.message, 'erreur'); return; }
    toast(`${data.inscriptions} inscription(s) rattachée(s) (annulable depuis « Corriger les rattachements »).`);
  } catch (e) { DEBUG.erreur('proposerPropagationClient', e); }
}

function ouvrirFormNouveauStagiaire(texteRecherche, sessionId, clientId) {
  const [prenomDevine, ...resteNom] = texteRecherche.split(' ');
  const zone = $('#sp-resultats');
  zone.innerHTML = `
    <div class="carte" style="background:#fff;">
      <label for="new-nom">Nom</label>
      <input id="new-nom" value="${esc(resteNom.join(' ') || texteRecherche)}">
      <label for="new-prenom">Prénom</label>
      <input id="new-prenom" value="${resteNom.length ? esc(prenomDevine) : ''}">
      <label for="new-naissance">Date de naissance</label>
      <input id="new-naissance" type="date">
      <button class="bouton" style="margin-top:10px;" onclick="creerEtAjouterStagiaire('${sessionId}', '${clientId}')">Créer et ajouter à la session</button>
    </div>`;
}

async function creerEtAjouterStagiaire(sessionId, clientId) {
  const nom = $('#new-nom').value.trim();
  const prenom = $('#new-prenom').value.trim();
  const dateNaissance = $('#new-naissance').value || null;
  if (!nom || !prenom) { toast('Nom et prénom obligatoires.', 'erreur'); return; }
  if (!clientId) { toast(messageClientObligatoire(), 'erreur'); return; }

  const { data: stagiaire, error } = await supa.from('stagiaires').insert({
    organisation_id: S.organisation.id,
    client_id: clientId || null,
    nom, prenom,
    date_naissance: dateNaissance,
  }).select().single();

  if (error) { DEBUG.erreur('creerStagiaire', error); toast('Erreur : ' + error.message, 'erreur'); return; }
  ajouterParticipant(stagiaire.id, sessionId, clientId);
}
