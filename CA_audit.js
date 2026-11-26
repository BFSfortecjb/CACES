/* © Jérémy Bizeul / Vigie-lance — CACES® : Espace audit (RC 2020 V2 §4.2 à §4.9) — partie 1 : preuves automatiques et écran « Où j'en suis ».
   Lecture : admin et auditeur ; écriture : admin. Les preuves automatiques sont des SUGGESTIONS tirées des données de l'appli : l'auditeur tranche. */
const ETATS_AUDIT = { conforme: 'Conforme', a_ameliorer: 'À améliorer', non_conforme: 'Non conforme', na: 'Sans objet', inconnu: 'À examiner' };
const COUL_AUDIT = { conforme: '#1b7c3c', a_ameliorer: '#c97a02', non_conforme: '#b2181a', na: '#777', inconnu: '#8a8f98' };
const TYPES_MISSION = { cahier_charges: 'Audit du cahier des charges', test_site: "Audit d'un test sur site", dossiers: 'Audit de dossiers', certification: 'Audit de certification' };
const PORTEE_MISSION = { cahier_charges: ['organisme', 'site'], test_site: ['test', 'testeur'], dossiers: ['dossiers'], certification: ['organisme', 'site', 'testeur', 'test', 'dossiers'] };
const AUDIT = { onglet: 'jai', annee: new Date().getFullYear(), cache: null };

/** Données partagées par les preuves automatiques (une seule série de requêtes par affichage). */
async function auditChargerDonnees() {
  const an = new Date().getFullYear(), debutAn = an + '-01-01';
  const q = (p, d = []) => p.then(r => r.data || d, () => d);
  const [perim, engins, docsEng, docsQ, recl, audits, ecarts, decl, sess, visites, taux, perso, missions] = await Promise.all([
    q(sb.from('cdt_perimetre').select('centre_id, referentiel_code, categorie_code, date_fin')),
    q(sb.from('engins').select('id, actif, soumis_vgp, numero_serie, marque, modele')),
    q(sb.from('engin_documents').select('engin_id, type_code, date_echeance, observations_ouvertes')),
    q(sb.from('documents_qualite').select('id, ref, categorie, titre, version, valide_par, valide_le, revision_avant, centre_examen_id, referentiel_code, actuelle')),
    q(sb.from('reclamations').select('id, statut, recue_le')),
    q(sb.from('audits_internes').select('id, type, date_audit, statut').gte('date_audit', debutAn)),
    q(sb.from('audit_ecarts').select('id, statut, gravite, echeance')),
    q(sb.from('declarations_testeur').select('id, session_id')),
    q(sb.from('sessions_formation').select('id, lieu_type, statut, type_session, centre_examen_id, date_debut')),
    q(sb.from('visites_prealables').select('session_id')),
    q(sb.from('v_taux_cdt').select('*').eq('annee', an)),
    q(sb.from('documents_personnels').select('personne_id, type, date_validite, actuelle, referentiel_code, categorie_code').eq('actuelle', true)),
    q(sb.from('audit_missions').select('*').eq('annee', an)),
  ]);
  return { an, perim, engins, docsEng, docsQ, recl, audits, ecarts, decl, sess, visites, taux, perso, missions,
    centres: (S.referentiel?.centres || []).filter(c => c.actif !== false),
    testeurs: (S.formateurs || []).filter(f => f.est_testeur !== false && !['secretariat', 'auditeur'].includes(f.role) && f.actif !== false && f.role !== 'admin' || (f.role === 'admin' && f.est_testeur === true)) };
}

const _ok = (etat, texte) => ({ etat, texte });
/** Preuves automatiques : clé → (données) → { etat suggéré, texte }. */
const PREUVES_AUTO = {
  perimetre_cdt: D => { const n = D.perim.filter(p => !p.date_fin).length; return n ? _ok('conforme', `${n} catégorie(s) déclarée(s) dans le périmètre des CDT.`) : _ok('non_conforme', 'Aucun périmètre de CDT déclaré (Qualité › Périmètre des CDT).'); },
  centres_cdt: D => D.centres.length ? _ok('conforme', `${D.centres.length} centre(s) : ${D.centres.map(c => c.nom).join(', ')}.`) : _ok('non_conforme', 'Aucun centre déclaré.'),
  dossiers_cdt: D => { const m = D.centres.filter(c => D.docsQ.some(d => d.categorie === 'dossier_cdt' && d.actuelle && d.centre_examen_id === c.id)); return m.length === D.centres.length && D.centres.length ? _ok('conforme', `Dossier déposé pour ${m.length}/${D.centres.length} CDT.`) : _ok(m.length ? 'a_ameliorer' : 'non_conforme', `Dossier déposé pour ${m.length}/${D.centres.length} CDT (Qualité › Dossiers CDT).`); },
  circuits_test: D => { const m = D.centres.filter(c => D.docsQ.some(d => d.categorie === 'circuit_test' && d.actuelle && (!d.centre_examen_id || d.centre_examen_id === c.id))); return m.length === D.centres.length && D.centres.length ? _ok('conforme', `Circuit de test déposé pour ${m.length}/${D.centres.length} CDT.`) : _ok(m.length ? 'a_ameliorer' : 'non_conforme', `Circuit de test déposé pour ${m.length}/${D.centres.length} CDT (Documents › Circuits de test).`); },
  engins_parc: D => { const a = D.engins.filter(e => e.actif !== false), inc = a.filter(e => !e.numero_serie || !e.marque || !e.modele); return !a.length ? _ok('non_conforme', 'Aucun engin enregistré.') : inc.length ? _ok('a_ameliorer', `${a.length} engin(s) ; ${inc.length} sans marque, modèle ou n° de série.`) : _ok('conforme', `${a.length} engin(s) complets (marque, modèle, n° de série).`); },
  engins_vgp: D => { const auj = new Date().toISOString().slice(0, 10), a = D.engins.filter(e => e.actif !== false && e.soumis_vgp);
    const sans = a.filter(e => !D.docsEng.some(d => d.engin_id === e.id && d.type_code === 'vgp' && d.date_echeance && d.date_echeance >= auj && !d.observations_ouvertes));
    return !a.length ? _ok('inconnu', 'Aucun engin soumis aux VGP.') : sans.length ? _ok('non_conforme', `${sans.length}/${a.length} engin(s) soumis sans VGP valide (échue, absente ou avec observations ouvertes).`) : _ok('conforme', `${a.length} engin(s) avec VGP valide et sans observation ouverte.`); },
  testeurs_liste: D => { const h = new Set((S.habilitations || []).filter(x => x.fonction === 'testeur').map(x => x.formateur_id)); return D.testeurs.length ? _ok(h.size ? 'conforme' : 'a_ameliorer', `${D.testeurs.length} testeur(s) ; habilitations par catégorie renseignées pour ${h.size}.`) : _ok('non_conforme', 'Aucun testeur.'); },
  testeurs_prevention: D => { const auj = new Date().toISOString().slice(0, 10), t = D.testeurs;
    const ok = t.filter(f => D.perso.some(p => p.personne_id === f.id && p.type === 'base_prevention' && p.date_validite && p.date_validite >= auj));
    const perime = t.filter(f => D.perso.some(p => p.personne_id === f.id && p.type === 'base_prevention' && p.date_validite && p.date_validite < auj));
    return !t.length ? _ok('inconnu', 'Aucun testeur.') : ok.length === t.length ? _ok('conforme', `Base prévention valide pour les ${t.length} testeur(s).`) : _ok(perime.length ? 'non_conforme' : 'a_ameliorer', `${ok.length}/${t.length} testeur(s) avec base prévention valide${perime.length ? ' ; ' + perime.length + ' périmée(s)' : ''} (document à déposer dans Mes documents).`); },
  testeurs_caces: D => { const auj = new Date().toISOString().slice(0, 10), t = D.testeurs;
    const avec = t.filter(f => D.perso.some(p => p.personne_id === f.id && ['caces', 'justificatif'].includes(p.type) && p.date_validite));
    const echus = D.perso.filter(p => ['caces', 'justificatif'].includes(p.type) && p.date_validite && p.date_validite < auj && t.some(f => f.id === p.personne_id));
    return !t.length ? _ok('inconnu', 'Aucun testeur.') : echus.length ? _ok('non_conforme', `${echus.length} CACES® / justificatif(s) échu(s) parmi les testeurs.`) : avec.length === t.length ? _ok('conforme', `Dates de validité suivies pour les ${t.length} testeur(s), aucune échue.`) : _ok('a_ameliorer', `Dates de validité saisies pour ${avec.length}/${t.length} testeur(s).`); },
  maintien_testeurs: () => _ok('inconnu', 'À vérifier dans Statistiques › Maintien des testeurs (15 jours sur 3 ans).'),
  testeur_non_formateur: D => { const tests = D.sess.filter(s => s.type_session !== 'autorisation' && s.statut !== 'brouillon'); const avec = new Set(D.decl.map(d => d.session_id)); const sans = tests.filter(s => !avec.has(s.id));
    return !tests.length ? _ok('inconnu', 'Aucune session de test.') : sans.length ? _ok('a_ameliorer', `${sans.length}/${tests.length} session(s) sans déclaration « testeur ≠ formateur ».`) : _ok('conforme', `Déclarations présentes pour les ${tests.length} session(s) de test.`); },
  taux_cdt: D => { const bas = D.taux.filter(x => x.seuil != null && Number(x.taux) < x.seuil); return !D.taux.length ? _ok('inconnu', `Aucun test en ${D.an}.`) : bas.length ? _ok('non_conforme', `Sous le seuil : ${bas.map(x => `${x.famille} ${x.taux} % (min. ${x.seuil} %)`).join(' ; ')}.`) : _ok('conforme', `Toutes les familles au-dessus du seuil T1 en ${D.an}.`); },
  alerte_cdt: D => { const bas = D.taux.filter(x => x.seuil != null && Number(x.taux) < x.seuil); return bas.length ? _ok('a_ameliorer', 'Taux non atteint : informer le certificateur avant le 15 janvier avec un plan d\'action.') : _ok('conforme', 'Aucune alerte à transmettre ; bilan annuel disponible (Statistiques › Bilan annuel).'); },
  visites_prealables: D => { const cl = D.sess.filter(s => s.lieu_type === 'client' && s.statut !== 'brouillon'), v = new Set(D.visites.map(x => x.session_id)), m = cl.filter(s => !v.has(s.id));
    return !cl.length ? _ok('conforme', 'Aucune session hors CDT.') : m.length ? _ok('non_conforme', `${m.length}/${cl.length} session(s) hors CDT sans repérage client.`) : _ok('conforme', `Repérage client fait pour les ${cl.length} session(s) hors CDT.`); },
  reclamations: D => { const ouv = D.recl.filter(r => r.statut !== 'cloturee'); return _ok('conforme', `Registre en place : ${D.recl.length} réclamation(s), ${ouv.length} non clôturée(s).`); },
  procedures: D => { const n = D.docsQ.filter(d => d.categorie === 'procedure' && d.actuelle).length; return n ? _ok('conforme', `${n} procédure(s) dans l'espace documentaire.`) : _ok('non_conforme', 'Aucune procédure déposée (Documents › Procédures).'); },
  audit_interne_annuel: D => { const n = D.audits.filter(a => a.type === 'audit_interne').length, m = D.missions.filter(x => x.statut === 'termine').length; return n + m ? _ok(D.centres.length && m + n >= D.centres.length ? 'conforme' : 'a_ameliorer', `${n} audit(s) interne(s) enregistré(s) et ${m} mission(s) terminée(s) en ${D.an} (objectif : chaque agence et CDT).`) : _ok('non_conforme', `Aucun audit interne en ${D.an}.`); },
  revue_direction: D => { const n = D.audits.filter(a => a.type === 'revue_direction').length; return n ? _ok('conforme', `${n} revue(s) de direction en ${D.an}.`) : _ok('non_conforme', `Aucune revue de direction en ${D.an}.`); },
  ecarts: D => { const auj = new Date().toISOString().slice(0, 10), o = D.ecarts.filter(e => e.statut !== 'verifie'), r = o.filter(e => e.echeance && e.echeance < auj); return r.length ? _ok('non_conforme', `${r.length} écart(s) en retard sur ${o.length} ouvert(s).`) : _ok('conforme', `${o.length} écart(s) ouvert(s), aucun en retard.`); },
  documents_maitrises: D => { const a = D.docsQ.filter(d => d.actuelle), sans = a.filter(d => !d.valide_par); return !a.length ? _ok('non_conforme', 'Espace documentaire vide.') : sans.length ? _ok('a_ameliorer', `${a.length} document(s) ; ${sans.length} sans « validé par ».`) : _ok('conforme', `${a.length} document(s) versionnés et validés.`); },
  veille_doc: D => { const n = D.docsQ.filter(d => d.categorie === 'veille' && d.actuelle).length; return n ? _ok('conforme', `${n} document(s) de veille.`) : _ok('a_ameliorer', 'Aucun document de veille déposé (Documents › Veille réglementaire).'); },
  faq_a_jour: D => { const f = D.docsQ.find(d => d.categorie === 'faq_caces' && d.actuelle); return f ? _ok('conforme', `FAQ CACES® : ${f.version}.`) : _ok('a_ameliorer', 'FAQ officielle non déposée.'); },
  journal_tracabilite: () => _ok('conforme', 'Journal de traçabilité actif sur les tables de session ; dossier d\'audit PDF par session.'),
};
function auditPreuve(ex, D) { const f = ex.auto_cle && PREUVES_AUTO[ex.auto_cle]; try { return f ? f(D) : null; } catch (e) { return null; } }

/** Dernier état saisi par un auditeur pour chaque exigence (toutes missions de l'année). */
async function auditEtatsSaisis() {
  const { data } = await sb.from('audit_reponses').select('exigence_id, etat, commentaire, updated_at, audit_missions(annee, centre_examen_id)').order('updated_at', { ascending: false }).limit(5000);
  const m = new Map(); (data || []).forEach(r => { if (!m.has(r.exigence_id)) m.set(r.exigence_id, r); }); return m;
}
const auditBadge = (etat, texte) => `<span style="display:inline-block;padding:1px 8px;border-radius:10px;color:#fff;font-size:12px;background:${COUL_AUDIT[etat] || COUL_AUDIT.inconnu}">${esc(texte || ETATS_AUDIT[etat])}</span>`;

/* ============ Onglet « Où j'en suis » ============ */
async function auditOuJenSuis(corps) {
  corps.innerHTML = '<p class="chargement">Calcul de l\'état par exigence…</p>';
  const [{ data: exs, error }, D, saisis] = await Promise.all([sb.from('audit_exigences').select('*').eq('actif', true).order('ordre'), auditChargerDonnees(), auditEtatsSaisis()]);
  if (error) return erreurSupabase('Lecture des exigences', error);
  AUDIT.cache = { exs: exs || [], D };
  const lignes = (exs || []).map(ex => { const p = auditPreuve(ex, D), s = saisis.get(ex.id); return { ex, p, s, etat: s?.etat || p?.etat || 'inconnu', source: s ? 'auditeur' : (p ? 'auto' : 'aucune') }; });
  const sections = [...new Set(lignes.map(l => l.ex.section))];
  const cnt = e => lignes.filter(l => l.etat === e).length;
  corps.innerHTML = `<div class="carte"><h3>Où j'en suis — référentiel RC 2020 V2 (§4.2 à §4.9)</h3>
    <p class="aide">Pour chaque exigence : l'état saisi lors d'un audit, sinon la <b>preuve calculée automatiquement</b> à partir des données de l'appli. Ce n'est qu'une suggestion : l'auditeur confirme dans « Audits ».</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:8px 0">${['conforme', 'a_ameliorer', 'non_conforme', 'inconnu'].map(e => `<div class="carte" style="min-width:140px;text-align:center;border-top:4px solid ${COUL_AUDIT[e]}"><div style="font-size:26px;font-weight:700">${cnt(e)}</div><div>${ETATS_AUDIT[e]}</div></div>`).join('')}
      <div class="carte" style="min-width:140px;text-align:center"><div style="font-size:26px;font-weight:700">${lignes.length}</div><div>exigences</div></div></div>
    <button id="aud-csv">Export CSV</button></div>
    ${sections.map(sec => { const L = lignes.filter(l => l.ex.section === sec), ok = L.filter(l => l.etat === 'conforme').length;
      return `<details class="repliable carte"><summary><b>${esc(sec)}</b> <span class="aide">— ${ok}/${L.length} conformes</span></summary>
        <table class="tableau"><thead><tr><th>Exigence</th><th>Référence</th><th>État</th><th>Preuve / constat</th></tr></thead><tbody>
        ${L.map(l => `<tr><td><b>${esc(l.ex.titre)}</b>${l.ex.obligatoire ? '' : ' <span class="aide">(facultatif)</span>'}<div class="aide">${esc(l.ex.critere || '')}</div></td><td>${esc(l.ex.ref_rc2020 || '')}</td>
          <td>${auditBadge(l.etat)}<div class="aide">${l.source === 'auditeur' ? 'saisi en audit' : l.source === 'auto' ? 'calcul automatique' : 'à examiner'}</div></td>
          <td>${l.s?.commentaire ? esc(l.s.commentaire) + '<br>' : ''}${l.p ? esc(l.p.texte) : '<span class="aide">Preuve attendue : ' + esc(l.ex.preuve || '') + '</span>'}</td></tr>`).join('')}</tbody></table></details>`; }).join('')}`;
  $('#aud-csv', corps).addEventListener('click', () => qualiteCsv('exigences_rc2020.csv', ['Code', 'Section', 'Exigence', 'Référence', 'Obligatoire', 'État', 'Source', 'Constat'],
    lignes.map(l => [l.ex.code, l.ex.section, l.ex.titre, l.ex.ref_rc2020, l.ex.obligatoire ? 'oui' : 'non', ETATS_AUDIT[l.etat], l.source, (l.s?.commentaire || '') + ' ' + (l.p?.texte || '')])));
}

/* © Jérémy Bizeul / Vigie-lance — CACES® : Espace audit — partie 2 : missions d'audit, formulaire, écarts, dossiers CDT, rapports, éditeur d'exigences. */
const STATUT_MISSION = { planifie: 'Planifié', en_cours: 'En cours', termine: 'Terminé' };
const STATUT_ECART = { ouvert: 'Ouvert', corrige: 'Corrigé', verifie: 'Vérifié (clos)' };
const PIECES_CDT = [['plan', 'Plan de situation et plan du CDT'], ['circuits', 'Circuits de test (schémas, surfaces)'], ['materiels', 'Liste des matériels et équipements'], ['photos', 'Photos des moyens et de la zone d\'examen'], ['convention', 'Convention, bail ou titre d\'occupation'], ['locaux', 'Locaux d\'accueil (vestiaire, sanitaires, salle)'], ['attente', 'Zone d\'attente des candidats']];
const estAdminAudit = () => S.profil?.role === 'admin';
const nomCentre = id => (S.referentiel?.centres || []).find(c => c.id === id)?.nom || '';
const nomTesteur = id => { const f = (S.formateurs || []).find(x => x.id === id); return f ? ((f.prenom || '') + ' ' + (f.nom || '')).trim() : ''; };

/* ============ Audits : liste + création ============ */
async function auditMissions(corps) {
  const { data, error } = await sb.from('audit_missions').select('*').order('date_audit', { ascending: false });
  if (error) return erreurSupabase('Lecture des audits', error);
  const L = data || [], an = new Date().getFullYear(), centres = (S.referentiel?.centres || []).filter(c => c.actif !== false);
  const faite = (type, cid) => L.some(m => m.annee === an && m.type === type && m.statut === 'termine' && (!cid || m.centre_examen_id === cid));
  corps.innerHTML = `<div class="carte"><h3>Audits ${an} — à faire cette année</h3>
    <p class="aide">Trame du certificateur en 3 temps : (1) cahier des charges par site, (2) observation d'un test, (3) audit de dossiers. L'auditeur ne doit pas être le testeur observé ni auditer sa propre activité.</p>
    <table class="tableau"><thead><tr><th>Site</th><th>1. Cahier des charges</th><th>2. Test sur site</th><th>3. Dossiers</th></tr></thead><tbody>
    ${centres.map(c => `<tr><td><b>${esc(c.nom)}</b></td>${['cahier_charges', 'test_site', 'dossiers'].map(t => `<td>${faite(t, c.id) ? '✅ fait' : `<button data-nv="${t}" data-c="${c.id}">Démarrer</button>`}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="4">Aucun centre.</td></tr>'}
    </tbody></table>
    <button id="aud-nv">+ Autre audit (certification, hors site…)</button></div>
    <div class="carte"><h3>Historique</h3><table class="tableau"><thead><tr><th>Date</th><th>Type</th><th>Site</th><th>Testeur</th><th>Auditeur</th><th>Statut</th><th></th></tr></thead><tbody>
    ${L.map(m => `<tr><td>${dateFr(m.date_audit)}</td><td>${TYPES_MISSION[m.type]}</td><td>${esc(nomCentre(m.centre_examen_id))}</td><td>${esc(nomTesteur(m.testeur_id))}</td><td>${esc(m.auditeur_nom || '')}</td><td>${STATUT_MISSION[m.statut]}</td>
      <td><button data-ouv="${m.id}">Ouvrir</button> <button data-pdf="${m.id}">PDF</button></td></tr>`).join('') || '<tr><td colspan="7">Aucun audit.</td></tr>'}</tbody></table></div>`;
  $$('[data-nv]', corps).forEach(b => b.addEventListener('click', () => auditNouvelle(corps, b.dataset.nv, b.dataset.c)));
  $('#aud-nv', corps)?.addEventListener('click', () => auditNouvelle(corps));
  $$('[data-ouv]', corps).forEach(b => b.addEventListener('click', () => auditFormulaire(corps, b.dataset.ouv)));
  $$('[data-pdf]', corps).forEach(b => b.addEventListener('click', () => auditPdfMission(b.dataset.pdf)));
}

function auditNouvelle(corps, type, centreId) {
  const centres = (S.referentiel?.centres || []).filter(c => c.actif !== false);
  const testeurs = (S.formateurs || []).filter(f => f.actif !== false);
  ouvrirModale('Nouvel audit', `<form id="aud-f" class="formulaire">
    <label>Type <select name="type">${Object.entries(TYPES_MISSION).map(([k, v]) => `<option value="${k}" ${type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>Site <select name="centre"><option value="">—</option>${centres.map(c => `<option value="${c.id}" ${c.id === centreId ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')}</select></label>
    <label>Testeur observé (audit de test) <select name="testeur"><option value="">—</option>${testeurs.map(f => `<option value="${f.id}">${esc(nomTesteur(f.id))}</option>`).join('')}</select></label>
    <label>Date <input type="date" name="date" value="${new Date().toISOString().slice(0, 10)}" required></label>
    <label>Auditeur (nom) <input name="aud" value="${esc(S.profil?.prenom ? S.profil.prenom + ' ' + (S.profil.nom || '') : '')}"></label>
    <div class="actions"><button class="principal">Créer</button> <button type="button" onclick="fermerModale()">Annuler</button></div></form>`);
  $('#aud-f').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    const { data, error } = await sb.from('audit_missions').insert({ annee: +f.date.value.slice(0, 4), type: f.type.value, centre_examen_id: f.centre.value || null, testeur_id: f.testeur.value || null, date_audit: f.date.value, auditeur_nom: f.aud.value.trim() || null, statut: 'en_cours' }).select().single();
    if (error) return erreurSupabase("Création de l'audit (indépendance de l'auditeur ?)", error);
    fermerModale(); auditFormulaire(corps, data.id);
  });
}

/* ============ Formulaire d'audit ============ */
async function auditFormulaire(corps, id) {
  corps.innerHTML = '<p class="chargement">Ouverture de l\'audit…</p>';
  const [{ data: m }, { data: exs }, { data: reps }, D] = await Promise.all([sb.from('audit_missions').select('*').eq('id', id).single(), sb.from('audit_exigences').select('*').eq('actif', true).order('ordre'),
    sb.from('audit_reponses').select('*').eq('mission_id', id), auditChargerDonnees()]);
  if (!m) return erreurSupabase('Lecture', { message: 'Audit introuvable' });
  const portees = PORTEE_MISSION[m.type], L = (exs || []).filter(x => portees.includes(x.portee)), R = new Map((reps || []).map(r => [r.exigence_id, r]));
  const ecr = estAdminAudit() && m.statut !== 'termine';
  corps.innerHTML = `<div class="carte"><button id="aud-ret">← Retour</button> <h3>${TYPES_MISSION[m.type]} — ${dateFr(m.date_audit)} ${esc(nomCentre(m.centre_examen_id))}</h3>
    <p class="aide">${m.testeur_id ? 'Testeur observé : <b>' + esc(nomTesteur(m.testeur_id)) + '</b>. ' : ''}Auditeur : ${esc(m.auditeur_nom || '—')}. ${L.length} point(s) à examiner. La preuve calculée par l'appli est une aide ; vous choisissez l'état.</p>
    ${ecr ? '<button id="aud-auto">Appliquer les suggestions automatiques aux points non renseignés</button> ' : ''}<button id="aud-pdf">PDF</button></div>
    <div id="aud-lignes">${L.map(x => { const r = R.get(x.id), p = auditPreuve(x, D);
      return `<div class="carte" data-ex="${x.id}"><b>${esc(x.code)} — ${esc(x.titre)}</b>${x.obligatoire ? '' : ' <span class="aide">(facultatif)</span>'}<div class="aide">${esc(x.critere || '')} — Preuve attendue : ${esc(x.preuve || '')}</div>
        ${p ? `<div class="aide">Constat automatique : ${auditBadge(p.etat)} ${esc(p.texte)}</div>` : ''}
        <select ${ecr ? '' : 'disabled'} data-etat="${x.id}"><option value="">— à examiner —</option>${['conforme', 'a_ameliorer', 'non_conforme', 'na'].map(e => `<option value="${e}" ${r?.etat === e ? 'selected' : ''}>${ETATS_AUDIT[e]}</option>`).join('')}</select>
        <input ${ecr ? '' : 'disabled'} data-com="${x.id}" placeholder="Commentaire / constat" value="${esc(r?.commentaire || '')}" style="width:60%"></div>`; }).join('')}</div>
    ${ecr ? '<div class="carte"><label>Notes générales <textarea id="aud-notes" rows="3" style="width:100%">' + esc(m.notes || '') + '</textarea></label><button class="principal" id="aud-fin">Terminer l\'audit et créer les écarts</button></div>' : ''}`;
  $('#aud-ret').addEventListener('click', () => auditMissions(corps));
  $('#aud-pdf').addEventListener('click', () => auditPdfMission(id));
  if (!ecr) return;
  const sauve = async ex => { const etat = $(`[data-etat="${ex}"]`, corps).value, com = $(`[data-com="${ex}"]`, corps).value.trim();
    if (!etat && !com) return await sb.from('audit_reponses').delete().eq('mission_id', id).eq('exigence_id', ex);
    const { error } = await sb.from('audit_reponses').upsert({ mission_id: id, exigence_id: +ex, etat: etat || 'a_ameliorer', commentaire: com || null }, { onConflict: 'mission_id,exigence_id' }); if (error) erreurSupabase('Enregistrement', error); };
  $$('[data-etat]', corps).forEach(s => s.addEventListener('change', () => sauve(s.dataset.etat)));
  $$('[data-com]', corps).forEach(s => s.addEventListener('change', () => sauve(s.dataset.com)));
  $('#aud-auto').addEventListener('click', async () => {
    for (const x of L) { const sel = $(`[data-etat="${x.id}"]`, corps), p = auditPreuve(x, D); if (!sel.value && p && p.etat !== 'inconnu') { sel.value = p.etat; $(`[data-com="${x.id}"]`, corps).value = '[auto] ' + p.texte; await sauve(String(x.id)); } }
    toast('Suggestions appliquées : relisez chaque point.'); });
  $('#aud-fin').addEventListener('click', async () => {
    if (!confirm("Terminer l'audit ? Les points non conformes ou à améliorer deviennent des écarts à suivre.")) return;
    const { data: rs } = await sb.from('audit_reponses').select('*').eq('mission_id', id);
    const ecarts = (rs || []).filter(r => ['non_conforme', 'a_ameliorer'].includes(r.etat)).map(r => { const x = L.find(e => e.id === r.exigence_id);
      return { mission_id: id, exigence_id: r.exigence_id, description: `${x?.code || ''} ${x?.titre || ''} — ${r.commentaire || ETATS_AUDIT[r.etat]}`, gravite: r.etat === 'non_conforme' ? (x?.obligatoire ? 'majeur' : 'mineur') : 'mineur', statut: 'ouvert' }; });
    if (ecarts.length) { const { error } = await sb.from('audit_ecarts').insert(ecarts); if (error) return erreurSupabase('Création des écarts', error); }
    const { error } = await sb.from('audit_missions').update({ statut: 'termine', notes: $('#aud-notes').value.trim() || null }).eq('id', id);
    if (error) return erreurSupabase('Clôture', error);
    toast(`Audit terminé — ${ecarts.length} écart(s) créé(s).`); auditMissions(corps); });
}

async function auditPdfMission(id) {
  const [{ data: m }, { data: reps }, { data: exs }] = await Promise.all([sb.from('audit_missions').select('*').eq('id', id).single(), sb.from('audit_reponses').select('*').eq('mission_id', id), sb.from('audit_exigences').select('*')]);
  const lib = window.jspdf?.jsPDF; if (!lib) return toast('Bibliothèque PDF non chargée.');
  const doc = new lib(); doc.setFontSize(14); doc.text(`${TYPES_MISSION[m.type]} — ${dateFr(m.date_audit)}`, 14, 16); doc.setFontSize(10);
  doc.text(`Site : ${nomCentre(m.centre_examen_id) || '—'}   Testeur : ${nomTesteur(m.testeur_id) || '—'}   Auditeur : ${m.auditeur_nom || '—'}`, 14, 23);
  const rows = (reps || []).map(r => { const x = (exs || []).find(e => e.id === r.exigence_id); return [x?.code || '', x?.titre || '', ETATS_AUDIT[r.etat], r.commentaire || '']; });
  if (doc.autoTable) doc.autoTable({ startY: 28, head: [['Code', 'Exigence', 'État', 'Constat']], body: rows, styles: { fontSize: 8 }, columnStyles: { 3: { cellWidth: 70 } } });
  doc.save(`audit_${m.type}_${m.date_audit}.pdf`);
}

/* ============ Écarts ============ */
async function auditEcarts(corps) {
  const { data, error } = await sb.from('audit_ecarts').select('*, audit_missions(date_audit, type, centre_examen_id), audit_exigences(code)').order('created_at', { ascending: false });
  if (error) return erreurSupabase('Lecture des écarts', error);
  const L = data || [], auj = new Date().toISOString().slice(0, 10), ecr = estAdminAudit();
  corps.innerHTML = `<div class="carte"><h3>Suivi des écarts (§4.9.3)</h3><p class="aide">Cycle : ouvert → corrigé (action faite) → vérifié (efficacité contrôlée). Un écart en retard dégrade l'exigence 4.9.3.</p><button id="ec-csv">Export CSV</button>
    <table class="tableau"><thead><tr><th>Audit</th><th>Point</th><th>Écart</th><th>Gravité</th><th>Action corrective</th><th>Responsable</th><th>Échéance</th><th>Statut</th></tr></thead><tbody>
    ${L.map(e => `<tr data-id="${e.id}"><td>${dateFr(e.audit_missions?.date_audit)} ${esc(nomCentre(e.audit_missions?.centre_examen_id))}</td><td>${esc(e.audit_exigences?.code || '')}</td><td>${esc(e.description)}</td><td>${e.gravite}</td>
      <td>${ecr ? `<input data-k="action_corrective" value="${esc(e.action_corrective || '')}">` : esc(e.action_corrective || '')}</td><td>${ecr ? `<input data-k="responsable" value="${esc(e.responsable || '')}" size="10">` : esc(e.responsable || '')}</td>
      <td>${ecr ? `<input type="date" data-k="echeance" value="${e.echeance || ''}">` : dateFr(e.echeance)}${e.echeance && e.echeance < auj && e.statut !== 'verifie' ? ' <b style="color:#b2181a">retard</b>' : ''}</td>
      <td>${ecr ? `<select data-k="statut">${Object.entries(STATUT_ECART).map(([k, v]) => `<option value="${k}" ${e.statut === k ? 'selected' : ''}>${v}</option>`).join('')}</select>` : STATUT_ECART[e.statut]}</td></tr>`).join('') || '<tr><td colspan="8">Aucun écart.</td></tr>'}</tbody></table></div>`;
  $('#ec-csv', corps).addEventListener('click', () => qualiteCsv('ecarts_audit.csv', ['Date audit', 'Point', 'Écart', 'Gravité', 'Action', 'Responsable', 'Échéance', 'Statut'], L.map(e => [e.audit_missions?.date_audit, e.audit_exigences?.code, e.description, e.gravite, e.action_corrective, e.responsable, e.echeance, STATUT_ECART[e.statut]])));
  $$('[data-k]', corps).forEach(i => i.addEventListener('change', async () => {
    const id = i.closest('tr').dataset.id, k = i.dataset.k, p = { [k]: i.value || null };
    if (k === 'statut') { const u = S.profil?.id; if (i.value === 'corrige') p.corrige_le = new Date().toISOString().slice(0, 10); if (i.value === 'verifie') { p.verifie_le = new Date().toISOString().slice(0, 10); p.verifie_par = u; } }
    const { error } = await sb.from('audit_ecarts').update(p).eq('id', id); if (error) erreurSupabase('Mise à jour', error); else toast('Enregistré.'); }));
}

/* ============ Dossiers CDT ============ */
async function auditDossiersCdt(corps) {
  const { data } = await sb.from('documents_qualite').select('ref, titre, version, centre_examen_id').eq('categorie', 'dossier_cdt').eq('actuelle', true);
  const centres = (S.referentiel?.centres || []).filter(c => c.actif !== false), D = data || [];
  corps.innerHTML = `<div class="carte"><h3>Dossier de chaque CDT</h3><p class="aide">Pièces à réunir par centre (§4.2.6 et §4.4). Déposez chaque pièce dans <b>Documents › Dossier CDT</b> en choisissant le centre et la référence <code>CDT-[centre]-[code]</code> (codes ci-dessous).</p>
    ${centres.map(c => { const ok = PIECES_CDT.filter(([k]) => D.some(d => d.centre_examen_id === c.id && (d.ref || '').toLowerCase().endsWith('-' + k)));
      return `<details class="repliable carte" open><summary><b>${esc(c.nom)}</b> — ${ok.length}/${PIECES_CDT.length} pièces</summary><ul>${PIECES_CDT.map(([k, l]) => `<li>${ok.some(o => o[0] === k) ? '✅' : '⬜'} ${esc(l)} <code>${k}</code></li>`).join('')}</ul></details>`; }).join('') || '<p>Aucun centre.</p>'}</div>`;
}

/* ============ Rapports ============ */
async function auditRapports(corps) {
  corps.innerHTML = `<div class="carte"><h3>Rapports pour le certificateur</h3><p class="aide">Chaque rapport reprend les données de l'appli à la date du jour.</p>
    <button id="rp-exig">État des 57 exigences (CSV)</button> <button id="rp-test">Suivi des testeurs §4.4.3.2 (CSV)</button> <button id="rp-ec">Écarts (CSV)</button> <button id="rp-bil">Bilan audits ${new Date().getFullYear()} (PDF)</button>
    <p class="aide">Maintien de la cartographie, taux CDT et registre des réclamations : Statistiques et Qualité (exports existants).</p></div>`;
  $('#rp-exig', corps).addEventListener('click', async () => { await auditOuJenSuis(corps); $('#aud-csv', corps)?.click(); auditRapports(corps); });
  $('#rp-ec', corps).addEventListener('click', async () => { const tmp = document.createElement('div'); await auditEcarts(tmp); $('#ec-csv', tmp).click(); });
  $('#rp-test', corps).addEventListener('click', async () => {
    const [{ data: p }, { data: v }] = await Promise.all([sb.from('documents_personnels').select('personne_id, type, titre, referentiel_code, categorie_code, date_validite').eq('actuelle', true), sb.rpc('veille_testeurs')]);
    const rows = (p || []).filter(d => ['base_prevention', 'caces', 'justificatif'].includes(d.type)).map(d => [nomTesteur(d.personne_id), d.type, d.referentiel_code || '', d.categorie_code || '', d.titre || '', d.date_validite || '']);
    qualiteCsv('suivi_testeurs.csv', ['Testeur', 'Type', 'Référentiel', 'Catégorie', 'Titre', 'Valide jusqu\'au'], rows); });
  $('#rp-bil', corps).addEventListener('click', async () => {
    const [{ data: ms }, { data: es }] = await Promise.all([sb.from('audit_missions').select('*').eq('annee', new Date().getFullYear()), sb.from('audit_ecarts').select('*')]);
    const lib = window.jspdf?.jsPDF; if (!lib) return toast('Bibliothèque PDF non chargée.');
    const doc = new lib(); doc.setFontSize(14); doc.text(`Bilan des audits ${new Date().getFullYear()}`, 14, 16);
    if (doc.autoTable) { doc.autoTable({ startY: 24, head: [['Date', 'Type', 'Site', 'Auditeur', 'Statut']], body: (ms || []).map(m => [m.date_audit, TYPES_MISSION[m.type], nomCentre(m.centre_examen_id), m.auditeur_nom || '', STATUT_MISSION[m.statut]]), styles: { fontSize: 9 } });
      doc.autoTable({ startY: doc.lastAutoTable.finalY + 8, head: [['Écarts', 'Nombre']], body: Object.entries(STATUT_ECART).map(([k, v]) => [v, (es || []).filter(e => e.statut === k).length]) }); }
    doc.save('bilan_audits.pdf'); });
}

/* ============ Éditeur d'exigences (admin) ============ */
async function auditEditeur(corps) {
  const { data, error } = await sb.from('audit_exigences').select('*').order('ordre');
  if (error) return erreurSupabase('Lecture', error);
  const ecr = estAdminAudit();
  corps.innerHTML = `<div class="carte"><h3>Grille d'exigences</h3><p class="aide">Ajoutez ou désactivez une exigence si le référentiel évolue. Les exigences désactivées sortent des audits mais restent dans l'historique.</p>
    ${ecr ? '<button id="ex-nv">+ Nouvelle exigence</button>' : ''}<table class="tableau"><thead><tr><th>Code</th><th>Section</th><th>Portée</th><th>Titre</th><th>Actif</th></tr></thead><tbody>
    ${(data || []).map(x => `<tr><td>${esc(x.code)}</td><td>${esc(x.section)}</td><td>${x.portee}</td><td>${ecr ? `<input data-id="${x.id}" data-k="titre" value="${esc(x.titre)}" style="width:100%">` : esc(x.titre)}</td><td>${ecr ? `<input type="checkbox" data-id="${x.id}" data-k="actif" ${x.actif ? 'checked' : ''}>` : (x.actif ? 'oui' : 'non')}</td></tr>`).join('')}</tbody></table></div>`;
  $$('[data-k]', corps).forEach(i => i.addEventListener('change', async () => { const { error } = await sb.from('audit_exigences').update({ [i.dataset.k]: i.type === 'checkbox' ? i.checked : i.value }).eq('id', i.dataset.id); if (error) erreurSupabase('Mise à jour', error); else toast('Enregistré.'); }));
  $('#ex-nv', corps)?.addEventListener('click', () => {
    ouvrirModale('Nouvelle exigence', `<form id="ex-f" class="formulaire"><label>Code <input name="code" required></label><label>Section <input name="section" required></label>
      <label>Portée <select name="portee">${['organisme', 'site', 'testeur', 'test', 'dossiers'].map(p => `<option>${p}</option>`).join('')}</select></label><label>Titre <input name="titre" required></label><label>Critère <textarea name="critere"></textarea></label>
      <div class="actions"><button class="principal">Ajouter</button> <button type="button" onclick="fermerModale()">Annuler</button></div></form>`);
    $('#ex-f').addEventListener('submit', async e => { e.preventDefault(); const f = e.target; const ordre = ((data || []).at(-1)?.ordre || 0) + 1;
      const { error } = await sb.from('audit_exigences').insert({ code: f.code.value.trim(), section: f.section.value.trim(), portee: f.portee.value, titre: f.titre.value.trim(), critere: f.critere.value.trim() || null, ordre });
      if (error) return erreurSupabase('Ajout', error); fermerModale(); auditEditeur(corps); }); });
}

/** Point d'entrée appelé par CA_qualite.js : retourne la fonction d'onglet ou null. */
function auditOngletFn(cle) { return { jai: auditOuJenSuis, missions: auditMissions, ecarts: auditEcarts, dossierscdt: auditDossiersCdt, rapports: auditRapports, exigences: auditEditeur }[cle] || null; }
const AUDIT_ONGLETS = [['jai', "Où j'en suis"], ['missions', 'Audits'], ['ecarts', 'Écarts'], ['dossierscdt', 'Dossiers CDT'], ['rapports', 'Rapports'], ['exigences', 'Grille']];
