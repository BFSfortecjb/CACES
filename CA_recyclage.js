/* =====================================================================
   CA_recyclage.js — Stagiaires en RECYCLAGE affichés en BLEU (#1d5fd6, infobulle « Recyclage » / « Formation initiale »).
   © 2026 Jérémy Bizeul — Vigie-lance, pour BFS Prévention. Reprise du principe validé dans Habélec. AFFICHAGE UNIQUEMENT (aucun envoi vers Galaxy).
   Un stagiaire est « recyclage » si stagiaires.recyclage = true (posé à l'import / à la synchro Galaxy quand un code de catégorie suivie
   finit par « Rec », modifiable à la main sur la fiche, jamais remis en initial automatiquement) OU si l'une de ses catégories
   a le parcours « recyclage » (écran Parcours).
   ===================================================================== */
const RECYCL = { ids: new Set(), session: null };

/** Charge les stagiaires en recyclage de la session (à appeler avant d'afficher des listes de stagiaires). */
async function chargerRecyclage(sessionId) {
  RECYCL.ids = new Set(); RECYCL.session = sessionId;
  try {
    const { data } = await sb.from('stagiaires').select('id, recyclage, stagiaire_categories(parcours)').eq('session_id', sessionId);
    (data || []).forEach(s => { if (s.recyclage === true || (s.stagiaire_categories || []).some(c => c.parcours === 'recyclage')) RECYCL.ids.add(String(s.id)); });
  } catch (_e) { /* affichage facultatif */ }
}
const estRecyclage = id => RECYCL.ids.has(String(id));
/** Attributs à poser sur la cellule / le libellé du nom : classe bleue + infobulle. */
const attrRecyclage = id => `class="${estRecyclage(id) ? 'nom-recyclage' : ''}" title="${estRecyclage(id) ? 'Recyclage' : 'Formation initiale'}"`;
