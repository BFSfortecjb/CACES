/* =====================================================================
   CA_journal.js — Journal de traçabilité d'une session : qui a modifié quoi, et quand.
   Alimenté automatiquement par la base (déclencheurs sur toutes les tables de la session) ; lecture seule ici.
   Visible par l'administrateur et par les formateurs / testeurs de la session.
   ===================================================================== */
const LIBELLE_TABLE_JOURNAL = {
  sessions_formation: 'Session', stagiaires: 'Stagiaire', stagiaire_categories: 'Catégories du stagiaire', certificats: 'Titre CACES',
  epreuves_pratique: 'Évaluation pratique', fise_evaluations: 'FISE', fise_avis: 'Avis FISE', suivi_horometre: 'Horomètre',
  planning_tests: 'Planning des épreuves', presences_stagiaires: 'Présence', session_jours: 'Jours de la session', session_engins: 'Engins de la session',
  session_groupes: 'Groupes', session_testeurs: 'Testeurs de la session', session_categories: 'Catégories de la session', qcm_seances: 'Test théorique (séance)',
  adequations_session: 'Examen d\'adéquation', attestations_testeur: 'Attestation testeur', engin_avis: 'Avis sur l\'engin', engin_documents: 'Document d\'engin',
  session_documents: 'Document de session', visites_prealables: 'Visite préalable',
};
const LIBELLE_ACTION_JOURNAL = { creation: 'Ajout', modification: 'Modification', suppression: 'Suppression',
  export_demande: 'Export demandé', export_zip_reussi: 'Export ZIP réussi', export_zip_echec: 'Export ZIP en échec',
  acces_tablette_cree: 'Accès tablette créé', acces_tablette_ouvert: 'Tablette ouverte (code testeur validé)', acces_tablette_refuse: 'Accès tablette refusé', acces_tablette_revoque: 'Accès tablette révoqué',
  envoi_secretariat_demande: 'Envoi au secrétariat demandé', envoi_secretariat_reussi: 'Envoi au secrétariat réussi', envoi_secretariat_echec: 'Envoi au secrétariat en échec',
  envoi_secretariat: 'Envoi au secrétariat' };

async function ouvrirJournalSession() {
  const s = S.session;
  ouvrirModale('📜 Journal de la session', '<p class="chargement">Chargement…</p>', { large: true });
  const [{ data: lignes, error }, { data: stags }] = await Promise.all([
    sb.from('journal_audit').select('id, created_at, formateur_id, acteur_nom, action, cible, detail').eq('session_id', s.id)
      .order('created_at', { ascending: false }).limit(500),
    sb.from('stagiaires').select('id, nom, prenom').eq('session_id', s.id),
  ]);
  if (error) { fermerModale(); return erreurSupabase('Lecture du journal', error); }
  const nomStag = Object.fromEntries((stags || []).map(x => [x.id, `${x.nom} ${x.prenom || ''}`.trim()]));
  const qui = l => l.formateur_id ? nomFormateur(l.formateur_id) || 'Utilisateur' : (l.acteur_nom || 'Système');
  const sujet = l => {
    const r = l.detail?.repere || {};
    const st = r.nom ? `${r.nom} ${r.prenom || ''}`.trim() : (r.stagiaire_id ? nomStag[r.stagiaire_id] : '');
    const bout = [st, r.referentiel && `${r.referentiel}${r.categorie ? ' ' + r.categorie : ''}`, r.epreuve, r.jour && dateFr(r.jour), r.demi && (r.demi === 'matin' ? 'matin' : 'après-midi'), r.numero].filter(Boolean);
    return bout.join(' · ');
  };
  const detail = l => {
    const ch = l.detail?.changements;
    if (ch && Object.keys(ch).length) return Object.entries(ch).map(([k, [a, b]]) => `${esc(k.replace(/_/g, ' '))} : ${esc(a || '∅')} → ${esc(b || '∅')}`).join('<br>');
    return l.detail?.detail || l.detail?.erreur ? esc(JSON.stringify(l.detail.detail || l.detail.erreur)) : '';
  };
  const lib = l => (LIBELLE_ACTION_JOURNAL[l.action] || l.action) + (l.cible && LIBELLE_TABLE_JOURNAL[l.cible] ? ' — ' + LIBELLE_TABLE_JOURNAL[l.cible] : '');
  const corps = (lignes || []).map(l => `<tr data-recherche="${esc((qui(l) + ' ' + lib(l) + ' ' + sujet(l)).toLowerCase())}">
    <td>${esc(new Date(l.created_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }))}</td><td>${esc(qui(l))}</td>
    <td>${esc(lib(l))}</td><td>${esc(sujet(l))}</td><td class="detail-journal">${detail(l)}</td></tr>`).join('');
  ouvrirModale('📜 Journal de la session', `
    <p class="aide">Qui a fait quoi sur cette session (500 dernières lignes). Le journal est alimenté automatiquement et ne peut pas être modifié.</p>
    <input id="filtre-journal" type="search" placeholder="Filtrer (nom, action, stagiaire…)" style="width:100%;margin-bottom:8px">
    <div class="tableau-defilant"><table class="tableau"><thead><tr><th>Date</th><th>Qui</th><th>Action</th><th>Sujet</th><th>Détail</th></tr></thead>
      <tbody id="corps-journal">${corps || '<tr><td colspan="5" class="vide">Aucune ligne pour le moment.</td></tr>'}</tbody></table></div>`, { large: true });
  $('#filtre-journal')?.addEventListener('input', ev => {
    const q = ev.target.value.trim().toLowerCase();
    $$('#corps-journal tr').forEach(tr => { tr.style.display = !q || (tr.dataset.recherche || '').includes(q) ? '' : 'none'; });
  });
}
