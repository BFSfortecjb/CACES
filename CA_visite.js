/* =====================================================================
   CA_visite.js — tests chez le client (intra) : visite préalable du site.
   Source : recommandations R.485 / R.489 / R.482A / R.486A (3/3/2/1 et annexe 4) et référentiel de
   certification RC 2020 V2 §4.4 : quand les tests ne sont pas réalisés sur un site certifié, l'organisme
   « doit s'assurer que toutes les exigences [...] définies en annexe 4 sont remplies » et archiver les
   pièces dans le dossier de la session ; en entreprise utilisatrice : inspection commune + plan de
   prévention écrit avant l'intervention (PPSPS si chantier SPS), vérification des assurances et de
   l'autorisation de conduite du testeur, conformité des engins prêtés ; convention de mise à disposition.
   L'évaluation pratique reste bloquée tant que la visite n'est pas déclarée conforme.
   ===================================================================== */

const LIEU_TYPE = { centre: 'Centre de formation', client: 'Chez le client (intra)' };

const POINTS_VISITE = [
  { titre: 'Inspection et prévention (avec le chef de l\'entreprise)', points: [
    ['inspection_commune', 'Inspection commune des lieux de travail, des installations et des matériels mis à disposition, réalisée avec le chef de l\'entreprise', 'Objectif : analyser les risques liés à l\'interférence entre les activités de l\'organisme de test et celles de l\'entreprise.'],
    ['plan_prevention', 'Plan de prévention écrit, arrêté d\'un commun accord avant le début de l\'intervention', 'Il comporte les mesures à prendre par chacun. Une copie est archivée dans le dossier de la session.'],
    ['ppsps', 'Chantier soumis à coordination SPS : le PPSPS de l\'entreprise de travaux mentionne l\'intervention de l\'organisme de test', 'À marquer « non concerné » hors chantier.', true],
    ['convention', 'Convention de mise à disposition du lieu signée (lieu exact de réalisation des tests)', 'Elle précise la durée, les périodes de mise à disposition exclusive, l\'accord pour les circuits de test, l\'accueil de tiers (candidats, auditeurs), l\'accès et le stationnement des équipements.'],
    ['assurance', 'Conditions d\'assurance du testeur et des salariés de l\'entreprise vérifiées conjointement pendant les tests', null],
    ['autorisation_testeur', 'Portée et validité de l\'autorisation de conduite du testeur vérifiées par l\'entreprise', null],
    ['materiel_client', 'Engin appartenant à l\'entreprise (prêté ou loué) : certificat de conformité remis à chaque mise à disposition, VGP valide vierge ou observations levées, notice d\'instructions présente', 'À marquer « non concerné » si les engins sont ceux de l\'organisme.', true],
  ] },
  { titre: 'Installations pour les candidats', points: [
    ['salle', 'Salle aérée, éclairée, à température de confort, avec tables et chaises pour au moins 7 personnes', null],
    ['eau', 'Eau potable : au moins 3 litres d\'eau fraîche par personne et par jour', null],
    ['vestiaire', 'Local pour changer de vêtements, préchauffé en hiver', null],
    ['sanitaires', 'Sanitaires hommes et femmes séparés, aérés, éclairés et chauffés, avec arrivée d\'eau chaude', null],
    ['zone_attente', 'Zone d\'attente sécurisée pour les stagiaires', null],
  ] },
  { titre: 'Zone d\'évolution', points: [
    ['circuits', 'Circuits d\'évaluation praticables (parcours, obstacles, panneaux de signalisation) et balisage de la zone possible', null],
    ['sol', 'Sol adapté à la circulation et à la stabilisation des engins', null],
    ['coactivite', 'Pas de co-activité ni de circulation de tiers dans la zone pendant les tests (ou organisation prévue)', null],
    ['reseaux', 'Absence de réseaux aériens ou souterrains dans la zone d\'évolution', null],
  ] },
];

const CHARGES_482 = 'Charges : simple (≥ 50 % de la capacité nominale), complexe (≥ 50 %, centre de gravité déporté), longue (≥ 25 %, longueur ≥ 4 m)';
/** Exigences d'annexe 4 par catégorie : surface minimale (m²) + équipements à voir sur place. */
const EXIGENCES_SITE = {
  R482A: {
    A: { surface: 225, lignes: ['Évolutions des 2 engins : 225 m² mini (15 m × 15 m)', 'Unité de transport (camion, benne sur remorque ou motobasculeur) adaptée à la pelle et à la chargeuse', 'Accessoires de levage adaptés aux charges', 'Camion ou remorque porte-engins adapté aux deux engins', CHARGES_482] },
    B1: { surface: 225, lignes: ['Évolutions : 225 m² mini (longueur ≥ 5 × longueur de la pelle)', 'Chargement des matériaux : 225 m² (15 m × 15 m) ; déchargement : 100 m² (10 m × 10 m)', 'Unité de transport adaptée à la pelle', 'Accessoires de levage adaptés', 'Camion ou remorque porte-engins (si option « porte-engins »)', CHARGES_482] },
    B2: { surface: 225, lignes: ['Évolutions : 225 m² mini (15 m × 15 m) adaptées aux épreuves'] },
    B3: { surface: 225, lignes: ['Évolutions : 225 m² mini (longueur ≥ 5 × longueur de la pelle)', 'Chargement 225 m² ; déchargement 100 m²', 'Voie de chemin de fer de longueur ≥ 5 × longueur de la pelle', 'Unité de transport (camion, benne, motobasculeur ou wagon) adaptée à la pelle', 'Camion ou remorque porte-engins (si option)'] },
    C1: { surface: 400, lignes: ['Évolutions : 400 m² mini (longueur ≥ 5 × longueur de l\'engin)', 'Chargement des matériaux : 225 m² ; déchargement : 100 m²', 'Unité de transport adaptée à la chargeuse ou chargeuse-pelleteuse', 'Accessoires de levage adaptés', 'Camion ou remorque porte-engins (si option)', CHARGES_482] },
    C2: { surface: 625, lignes: ['Évolutions : 625 m² mini (longueur ≥ 5 × longueur de l\'engin)', 'Camion ou remorque porte-engins (si option)'] },
    C3: { surface: 625, lignes: ['Évolutions : 625 m² mini (longueur ≥ 5 × longueur de l\'engin)', 'Camion ou remorque porte-engins (si option)'] },
    D: { surface: 400, lignes: ['Évolutions : 400 m² mini (longueur ≥ 5 × longueur de l\'engin)', 'Camion ou remorque porte-engins (si option)'] },
    E: { surface: 400, lignes: ['Circuit de 500 m minimum permettant de monter en vitesse et de garantir les distances de freinage et d\'arrêt', 'Chargement / déchargement des matériaux : 400 m² (20 m × 20 m)', 'Engin de chargement adapté au tombereau', 'Camion ou remorque porte-engins (si option)'] },
    F: { surface: 400, lignes: ['Évolutions : 400 m² mini (longueur ≥ 5 × longueur du chariot)', 'Camion ou remorque pour le chargement des 3 charges simples', 'Camion ou remorque porte-engins (si option)'] },
    G: { surface: null, lignes: ['Conduite hors production : se référer à l\'annexe 4 de la recommandation R.482A'] },
  },
  R485: {
    '1': { surface: 100, lignes: ['Zone d\'évolution : 100 m² mini, sol stabilisé, béton et/ou enrobé', 'Palettier : 2 travées / 2 niveaux (lisses de 0 à 2,10 m mini)', 'Charges palettisées et empilables avec indication de la masse (≥ 50 % de la capacité nominale ; ≥ 25 % pour palettier)', 'Camion ou remorque permettant le chargement par l\'arrière', 'Dispositif de chargement : quai avec dispositif de nivelage ou pont de liaison amovible, OU camion/remorque à hayon élévateur'] },
    '2': { surface: 100, lignes: ['Zone d\'évolution : 100 m² mini, sol stabilisé, béton et/ou enrobé', 'Palettier : 2 travées / 3 niveaux (lisses de 0 à 3,30 m mini)', 'Charges palettisées et empilables avec indication de la masse (≥ 50 % de la capacité nominale ; ≥ 25 % pour palettier)', 'Camion ou remorque permettant le chargement par l\'arrière', 'Dispositif de chargement : quai avec dispositif de nivelage ou pont de liaison amovible, OU camion/remorque à hayon élévateur'] },
  },
  R489: {},   // rempli ci-dessous
  R486A: {},
};
const SURF_489 = { '1A': 200, '1B': 200, '2A': 200, '2B': 200, '3': 200, '4': 300, '5': 200, '6': 200, '7': 200 };
Object.entries(SURF_489).forEach(([c, m2]) => {
  const l = [`Zone d'évolution : ${m2} m² mini, sol stabilisé, béton et/ou enrobé`];
  if (c === '3') l.push('Rampe ou terrain naturel : pente ≥ 8 % (longueur ≥ 2 × longueur hors-tout du chariot) et/ou dévers ≥ 2 % (largeur ≥ 2 × largeur hors-tout)');
  if (c === '1A') l.push('Quai avec dispositif de nivelage');
  if (c !== '7') l.push('Charges palettisées / empilables avec indication de la masse (≥ 50 % de la capacité nominale ; charge masquant la visibilité ≥ 25 %, hauteur ≥ 1,80 m)');
  l.push('Palettier, camion ou remorque / porte-engins : selon la catégorie (annexe 4 de la R.489)');
  EXIGENCES_SITE.R489[c] = { surface: m2, lignes: l };
});
['A', 'B', 'C'].forEach(c => {
  EXIGENCES_SITE.R486A[c] = { surface: 200, lignes: [
    'Zone d\'évolution : 200 m² mini, sol adapté à la stabilisation et à la circulation des 2 PEMP utilisées',
    'Paroi verticale à longer : longueur ≥ 4 m × hauteur ≥ 5 m (selon la catégorie)',
    'Paroi horizontale (sous-face) : 4 m × 3 m minimum, à une hauteur ≥ 5 m (selon la catégorie)',
    'Aire limitée au sol : largeur et longueur ≤ celles de la PEMP + 1 m, hauteur ≥ 1,10 m sur les 2 faces latérales (selon la catégorie)',
    'Espace limité : 2 parois horizontales superposées ≥ 3 m × 3 m, écart ≤ 3,50 m, base à une hauteur ≥ 3 m (selon la catégorie)',
    'Moyens de balisage de la zone d\'intervention',
    'Camion ou remorque porte-engin adapté (si option « porte-engins »)'] };
});

const exigenceCategorie = (ref, cat) => (EXIGENCES_SITE[ref] || {})[cat] || { surface: null, lignes: ['Voir l\'annexe 4 de la recommandation ' + ref] };

/** La visite préalable de la session est-elle conforme ? (toujours vrai pour une session en centre de formation) */
async function visitePrealableOk(session = S.session) {
  if (!session || session.lieu_type !== 'client') return true;
  if (!session.visite_id) return false;
  const { data } = await sb.from('visites_prealables').select('conforme').eq('id', session.visite_id).maybeSingle();
  return !!data?.conforme;
}

async function statutVisiteHtml(session) {
  if (session.lieu_type !== 'client') return '';
  const { data } = session.visite_id ? await sb.from('visites_prealables').select('conforme, date_visite, client').eq('id', session.visite_id).maybeSingle() : { data: null };
  const etat = data?.conforme ? ['ok', 'Repérage conforme' + (data.date_visite ? ' (' + dateFr(data.date_visite) + ')' : '')]
    : data ? ['avertissement', 'Repérage incomplet / non conforme'] : ['ko', 'Aucun repérage rattaché — pratique bloquée'];
  return `<span class="etat ${etat[0]}">${esc(etat[1])}</span>`;
}

/** Bouton de la session : ouvre le repérage rattaché, ou propose d'en rattacher / d'en créer un. */
async function ouvrirVisitePrealable() {
  const s = S.session;
  if (s.visite_id) return ouvrirFicheVisite(s.visite_id, true);
  const { data: liste } = await sb.from('visites_prealables').select('id, client, date_visite, adresse_site, conforme').order('date_visite', { ascending: false });
  ouvrirModale('Visite préalable de la session', `
    <p class="aide">Rattache un repérage client déjà réalisé, ou crée-le maintenant.</p>
    <label>Repérage existant <select id="vp-choix"><option value="">— choisir —</option>
      ${(liste || []).map(x => `<option value="${x.id}">${esc(x.client || 'Client ?')} — ${esc(x.adresse_site || '')} (${x.date_visite ? dateFr(x.date_visite) : 'sans date'})${x.conforme ? ' ✔' : ' ⚠'}</option>`).join('')}</select></label>
    <div class="pied-modale"><button type="button" id="vp-nouveau">Nouveau repérage</button>
      <button type="button" class="principal" id="vp-lier">Rattacher</button></div>`);
  $('#vp-nouveau').addEventListener('click', () => { fermerModale(); ouvrirFicheVisite(null, true); });
  $('#vp-lier').addEventListener('click', async () => {
    const id = $('#vp-choix').value; if (!id) return toast('Choisis un repérage', 'erreur');
    await modifierChampSession('visite_id', id, 'repérage client');
    fermerModale(); rendreDetailSession($('#contenu'));
  });
}

/** Repérages clients : liste affichée sur la page Sessions. */
async function rendreReperages(zone) {
  if (!zone) return;
  const { data, error } = await sb.from('visites_prealables').select('*').order('date_visite', { ascending: false });
  if (error) { zone.innerHTML = ''; return; }
  const peut = ['formateur', 'admin'].includes(S.profil?.role);
  zone.innerHTML = `<div class="carte"><div class="barre-actions"><h3>Repérages clients (visites préalables intra)</h3>
    ${peut ? '<button class="principal" onclick="ouvrirFicheVisite(null,false)">+ Nouveau repérage</button>' : ''}</div>
    ${(data || []).length ? `<table class="table"><thead><tr><th>Client</th><th>Site</th><th>Date</th><th>Catégories</th><th>État</th><th></th></tr></thead><tbody>
      ${data.map(v => `<tr><td>${esc(v.client) || '—'}</td><td>${esc(v.adresse_site) || '—'}</td><td>${v.date_visite ? dateFr(v.date_visite) : '—'}</td>
        <td>${(v.categories || []).map(c => esc(c.referentiel_code + ' ' + c.categorie_code)).join(', ') || '—'}</td>
        <td><span class="etat ${v.conforme ? 'ok' : 'avertissement'}">${v.conforme ? 'Conforme' : 'Non conforme / incomplet'}</span></td>
        <td><button class="lien" onclick="ouvrirFicheVisite('${v.id}',false)">Ouvrir</button></td></tr>`).join('')}</tbody></table>`
      : '<p class="aide">Aucun repérage. Fais-en un avant de proposer des tests chez un client : il sera ensuite rattachable à la session.</p>'}</div>`;
}

/** Fiche de repérage (id = null : nouveau). pourSession : rattache le repérage à la session courante à l'enregistrement. */
async function ouvrirFicheVisite(id, pourSession) {
  const s = pourSession ? S.session : null;
  const { data: v } = id ? await sb.from('visites_prealables').select('*').eq('id', id).maybeSingle() : { data: null };
  let sessCats = [];
  if (s && !v) sessCats = ((await sb.from('session_categories').select('referentiel_code, categorie_code').eq('session_id', s.id)).data) || [];
  const visite = v || { client: s?.entreprise || '', points: {}, surfaces: {}, fichiers: [], categories: sessCats, date_visite: new Date().toISOString().slice(0, 10), adresse_site: '', contact_client: '', observations: '' };
  const pts = { ...(visite.points || {}) }, surf = { ...(visite.surfaces || {}) };
  let cats = [...(visite.categories || [])];
  const peutEcrire = ['formateur', 'admin'].includes(S.profil?.role) && !(s && s.statut === 'cloturee');
  const dis = peutEcrire ? '' : 'disabled';
  const libCat = (r, c) => (S.referentiel.categories.find(x => x.referentiel_code === r && x.code === c) || {}).libelle || '';
  const estCoche = (r, c) => cats.some(x => x.referentiel_code === r && x.categorie_code === c);

  const ligne = (cle, libelle, aide, nc) => `<div class="adeq-ligne ${pts[cle] || pts[cle + '_nc'] ? 'ok' : ''}">
      <label><input type="checkbox" data-p="${esc(cle)}" ${pts[cle] ? 'checked' : ''} ${dis}> <span>${esc(libelle)}</span></label>
      ${nc ? `<label class="case"><input type="checkbox" data-p="${esc(cle)}_nc" ${pts[cle + '_nc'] ? 'checked' : ''} ${dis}> non concerné</label>` : ''}
      ${aide ? `<div class="aide">${esc(aide)}</div>` : ''}</div>`;
  const blocCategories = () => cats.map(c => {
    const ex = exigenceCategorie(c.referentiel_code, c.categorie_code), cle = c.referentiel_code + '|' + c.categorie_code;
    return `<fieldset><legend>${esc(c.referentiel_code)} ${esc(c.categorie_code)} <span class="aide">${esc(libCat(c.referentiel_code, c.categorie_code))}</span></legend>
      ${ex.surface ? `<label>Surface de la zone d'évolution relevée (m²) — minimum ${ex.surface} m² <input type="number" step="1" min="0" data-surf="${esc(cle)}" value="${esc(surf[cle] ?? '')}" ${dis} style="width:120px">
        <span class="aide" data-surf-etat="${esc(cle)}"></span></label>` : ''}
      ${ex.lignes.map((l, i) => ligne('cat:' + cle + ':' + i, l, null, false)).join('')}</fieldset>`; }).join('') || '<p class="aide">Coche au moins une catégorie visée.</p>';

  ouvrirModale(s ? `Visite préalable — ${s.nom}` : 'Repérage client', `
    <form id="form-visite" class="formulaire">
      <p class="aide">Tests chez le client : le repérage vérifie que le site réunit les exigences de l'annexe 4 de la recommandation (installations, zone d'évolution, matériels) et que la prévention est organisée. Il peut être fait avant toute session ; l'évaluation pratique d'une session intra reste bloquée tant que le repérage rattaché n'est pas conforme. Les pièces sont archivées sur le Drive.</p>
      <div class="grille-2">
        <label>Client / entreprise <input name="client" value="${esc(visite.client || '')}" ${dis} required></label>
        <label>Date de la visite <input type="date" name="date_visite" value="${esc(visite.date_visite || '')}" ${dis}></label>
        <label>Personne rencontrée (nom, fonction) <input name="contact_client" value="${esc(visite.contact_client || '')}" ${dis}></label>
        <label>Adresse exacte du site des tests <input name="adresse_site" value="${esc(visite.adresse_site || '')}" ${dis}></label></div>
      <h4 class="titre-theme">Catégories envisagées</h4>
      <div id="vp-cats">${(S.referentiel.referentiels || []).map(r => `<div><b>${esc(r.code)}</b> ${S.referentiel.categories.filter(c => c.referentiel_code === r.code).map(c =>
        `<label class="case"><input type="checkbox" data-cat="${esc(r.code)}|${esc(c.code)}" ${estCoche(r.code, c.code) ? 'checked' : ''} ${dis}> ${esc(c.code)}</label>`).join(' ')}</div>`).join('')}</div>
      ${POINTS_VISITE.map(g => `<h4 class="titre-theme">${esc(g.titre)}</h4>${g.points.map(([k, l, a, nc]) => ligne(k, l, a, nc)).join('')}`).join('')}
      <h4 class="titre-theme">Exigences par catégorie visée (annexe 4)</h4>
      <div id="vp-exig">${blocCategories()}</div>
      <h4 class="titre-theme">Pièces justificatives (Drive)</h4>
      <p class="aide">Plan de prévention signé, convention de mise à disposition, plan de situation, photos de la zone et des moyens. ${(visite.fichiers || []).length ? `<b>${visite.fichiers.length} fichier(s) déjà enregistré(s).</b>` : ''}</p>
      ${(visite.fichiers || []).map((f, i) => `<a href="${esc(f.lien)}" target="_blank" rel="noopener">📎 ${esc(f.nom || 'pièce ' + (i + 1))}</a>`).join(' ')}
      ${peutEcrire ? '<label>Ajouter des pièces (photos ou PDF) <input type="file" name="pieces" accept="image/*,application/pdf" multiple></label>' : ''}
      <label>Observations, non-conformités et actions correctives <input name="observations" value="${esc(visite.observations || '')}" ${dis}></label>
      <p id="bilan-visite" class="aide"></p>
      ${peutEcrire ? `<div class="pied-modale"><button type="button" onclick="fermerModale()">Fermer</button>
        <button type="submit" class="principal">Enregistrer</button></div>` : ''}
    </form>`);

  const f = $('#form-visite');
  const evaluer = () => {
    const manques = [];
    POINTS_VISITE.forEach(g => g.points.forEach(([k, l]) => { if (!pts[k] && !pts[k + '_nc']) manques.push(l); }));
    if (!cats.length) manques.push('Au moins une catégorie visée');
    cats.forEach(c => {
      const ex = exigenceCategorie(c.referentiel_code, c.categorie_code), cle = c.referentiel_code + '|' + c.categorie_code;
      if (ex.surface) {
        const m = Number(surf[cle]);
        const etat = $(`[data-surf-etat="${cle}"]`, f);
        if (etat) etat.textContent = surf[cle] === undefined || surf[cle] === '' ? '' : (m >= ex.surface ? ' ✔ suffisante' : ' ⚠ insuffisante');
        if (!(m >= ex.surface)) manques.push(`Surface ${cle} (≥ ${ex.surface} m²)`);
      }
      ex.lignes.forEach((l, i) => { if (!pts['cat:' + cle + ':' + i]) manques.push(`${cle} : ${l}`); });
    });
    if (!(visite.fichiers || []).length && !(f.pieces?.files?.length)) manques.push('Au moins une pièce justificative');
    if (!f.contact_client.value.trim()) manques.push('Personne rencontrée chez le client');
    $('#bilan-visite').innerHTML = manques.length ? `⚠ ${manques.length} point(s) restent à valider pour déclarer le site conforme.` : '✔ Tous les points sont validés : le site pourra être déclaré conforme à l’enregistrement.';
    return manques.length === 0;
  };
  const brancher = zone => {
    $$('[data-p]', zone).forEach(i => i.addEventListener('change', () => { pts[i.dataset.p] = i.checked; i.closest('.adeq-ligne')?.classList.toggle('ok', i.checked); evaluer(); }));
    $$('[data-surf]', zone).forEach(i => i.addEventListener('input', () => { surf[i.dataset.surf] = i.value; evaluer(); }));
  };
  brancher(f);
  $$('[data-cat]', f).forEach(i => i.addEventListener('change', () => {
    const [r, c] = i.dataset.cat.split('|');
    cats = cats.filter(x => !(x.referentiel_code === r && x.categorie_code === c));
    if (i.checked) cats.push({ referentiel_code: r, categorie_code: c });
    $('#vp-exig').innerHTML = blocCategories(); brancher($('#vp-exig')); evaluer();
  }));
  f.pieces?.addEventListener('change', evaluer); f.contact_client.addEventListener('input', evaluer);
  evaluer();

  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const conforme = evaluer();
    try {
      let fichiers = visite.fichiers || [];
      if (f.pieces?.files?.length) {
        $('#bilan-visite').textContent = 'Envoi des pièces sur le Drive…';
        fichiers = fichiers.concat(await envoyerPhotosSurDrive(f.pieces, ['Repérages clients', f.client.value.trim() || 'Client'], 'visite'));
      }
      const ligneBase = {
        client: f.client.value.trim() || null, date_visite: f.date_visite.value || null, visiteur_id: S.profil.id,
        contact_client: f.contact_client.value.trim() || null, adresse_site: f.adresse_site.value.trim() || null, categories: cats,
        points: pts, surfaces: surf, observations: f.observations.value.trim() || null, conforme, fichiers, updated_at: new Date().toISOString() };
      const rep = id ? await sb.from('visites_prealables').update(ligneBase).eq('id', id).select('id').single()
                     : await sb.from('visites_prealables').insert(ligneBase).select('id').single();
      if (rep.error) throw rep.error;
      if (s && s.visite_id !== rep.data.id) await modifierChampSession('visite_id', rep.data.id, 'repérage client');
      toast(conforme ? 'Repérage enregistré : site conforme' : 'Repérage enregistré : site NON conforme pour l’instant', conforme ? undefined : 'erreur', 6000);
      fermerModale();
      if (s) rendreDetailSession($('#contenu')); else rendreReperages($('#reperages'));
    } catch (e) { erreurSupabase('Enregistrement du repérage', e); }
  });
}

async function changerLieuSession(valeur) {
  const centre = valeur === 'client' ? null : (S.referentiel.centres || []).find(c => c.id === Number(valeur));
  const maj = valeur === 'client' ? { lieu_type: 'client', lieu: 'Chez le client (intra)' }
    : { lieu_type: 'centre', lieu: centre ? centre.nom : null, centre_examen_id: Number(valeur) };
  const { error } = await sb.from('sessions_formation').update(maj).eq('id', S.session.id);
  if (error) return erreurSupabase('Modification du lieu', error);
  Object.assign(S.session, maj);
  toast(valeur === 'client' ? 'Intra : un repérage client conforme est obligatoire avant la pratique' : 'Session en centre de formation');
  rendreDetailSession($('#contenu'));
}
