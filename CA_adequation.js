/* =====================================================================
   CA_adequation.js — Examen d'adéquation (testeur), une fois par session
   et par engin. Les points ci-dessous sont ceux que le testeur vérifie
   avant de démarrer les épreuves ; le bouton TEST de l'évaluation
   pratique reste bloqué tant que l'examen n'est pas conforme.
   ===================================================================== */

const GROUPES_ADEQUATION = [
  { titre: 'Points à vérifier par le testeur', points: [
    ['attestation_formation', 'Attestation de formation', 'Chaque candidat doit présenter une attestation de formation (établie par l\'employeur ou un organisme de formation).'],
    ['aire_evolution', 'Une aire d\'évolution et les moyens permettant la réalisation du test', 'Zone balisée, sol adapté, dégagements suffisants, moyens de manutention nécessaires aux épreuves.'],
    ['rapport_vgp', 'Rapport de vérification en cours de validité (VGP)', 'Dernier rapport de vérification générale périodique, sans observation ni restriction d\'usage. Engin hors VGP : contrôle annuel de conservation.'],
    ['conformite', 'Certificat ou déclaration de conformité — en conserver une copie', 'Déclaration CE ou certificat de conformité de l\'engin. Une copie est conservée dans le dossier de la session.'],
    ['notice', 'Notice d\'utilisation du constructeur écrite en français', null],
    ['controles_essais', 'Contrôles visuels et essais de l\'engin par le testeur', 'Vérification visuelle, fonctionnement des commandes et des dispositifs de sécurité.'],
  ]},
  { titre: 'Conditions de réalisation du test', points: [
    ['climat', 'Éléments climatiques', null], ['environnement', 'Environnement', null], ['coactivite', 'Co-activité', null],
    ['reseaux', 'Non présence de réseaux aériens ou souterrains', null], ['terrain', 'Nature du terrain adapté à l\'équipement', null],
    ['apparaux', 'Apparaux mis à disposition adaptés à l\'opération à réaliser', null],
  ]},
  { titre: 'Le stagiaire doit être protégé par', points: [
    ['epi', 'E.P.I. correspondant à la situation', null], ['zone_attente', 'Zone d\'attente sécurisée', null],
  ]},
];
const TOUS_POINTS_ADEQUATION = GROUPES_ADEQUATION.flatMap(g => g.points.map(p => p[0]));

/** Dessine la check-list d'adéquation dans `cible`. onFini() est appelé après enregistrement. */
async function rendreAdequation(cible, sessionId, engin, existante, onFini) {
  const pts = { ...(existante?.points || {}) };
  const nc = { ...(existante?.non_conformite || {}) };
  const libelle = [engin.designation, engin.marque, engin.modele].filter(Boolean).join(' ');
  function dessiner() {
    const manque = TOUS_POINTS_ADEQUATION.filter(k => !pts[k]);
    cible.innerHTML = `
      <section class="adeq">
        <h3>Examen d'adéquation — ${esc(libelle)} <span class="aide">(${esc(engin.numero_serie || '')})</span></h3>
        ${GROUPES_ADEQUATION.map(g => `<h4 class="titre-theme">${esc(g.titre)}</h4>
          ${g.points.map(([k, lib, aide]) => `<div class="adeq-ligne ${pts[k] ? 'ok' : ''}">
            <label><input type="checkbox" data-k="${k}" ${pts[k] ? 'checked' : ''}> <span>${esc(lib)}</span></label>
            ${aide ? `<button type="button" class="icone" data-aide="${k}" title="Aide">ℹ</button>` : ''}
            <div class="adeq-aide" id="aide-${k}" hidden>${esc(aide || '')}</div></div>`).join('')}`).join('')}
        ${manque.length ? `<div class="adeq-nc"><b>En cas de non-conformité :</b> appeler immédiatement votre référent technique et responsable de site.
          <label><input type="checkbox" data-nc="traitee" ${nc.traitee ? 'checked' : ''}> Non-conformité traitée immédiatement</label>
          <label><input type="checkbox" data-nc="fiche" ${nc.fiche ? 'checked' : ''}> Édition d'une fiche de non-conformité (annexe 1, procédure n° 4)</label></div>` : ''}
        <div class="pied-modale">
          <button type="button" id="adeq-annuler">Retour</button>
          <button type="button" class="principal" id="adeq-valider">${manque.length ? 'Enregistrer (test bloqué)' : 'Valider : examen d\'adéquation OUI'}</button></div>
      </section>`;
    $$('[data-k]', cible).forEach(i => i.addEventListener('change', () => { pts[i.dataset.k] = i.checked; dessiner(); }));
    $$('[data-nc]', cible).forEach(i => i.addEventListener('change', () => { nc[i.dataset.nc] = i.checked; }));
    $$('[data-aide]', cible).forEach(b => b.addEventListener('click', () => { const e = $('#aide-' + b.dataset.aide, cible); e.hidden = !e.hidden; }));
    $('#adeq-annuler', cible).addEventListener('click', () => onFini(false));
    $('#adeq-valider', cible).addEventListener('click', async () => {
      const conforme = !TOUS_POINTS_ADEQUATION.some(k => !pts[k]);
      if (!conforme && !(nc.traitee && nc.fiche))
        return toast('Point(s) non conforme(s) : coche « traitée immédiatement » et « fiche de non-conformité ».', 'erreur', 6000);
      const { error } = await sb.from('adequations_session').upsert({
        session_id: sessionId, engin_id: engin.id, testeur_id: testeurDeLEpreuve(), date_examen: new Date().toISOString(),
        points: pts, non_conformite: conforme ? null : nc, conforme }, { onConflict: 'session_id,engin_id' });
      if (error) return erreurSupabase('Enregistrement de l\'examen d\'adéquation', error);
      toast(conforme ? 'Examen d\'adéquation enregistré' : 'Non-conformité enregistrée : le test reste bloqué', conforme ? undefined : 'erreur', 5000);
      onFini(true);
    });
  }
  dessiner();
}
