/* =====================================================================
   CA_galaxy.js — import depuis Galaxy (chantier 21, LECTURE SEULE)

   Passe par l'Edge Function « caces-galaxy » (la clé API reste dans les secrets Supabase).
   Le n° Galaxy d'une session = « formation_id » Galaxy.
   - Nouvelle session : bouton « Récupérer depuis Galaxy » (intitulé, dates, lieu, catégories).
   - Détail d'une session : « Importer depuis Galaxy » (stagiaires inscrits + catégories ; sans doublon).
   Galaxy ne donne pas le formation_id dans get_sta_ins : les inscrits sont rapprochés par produit + date de début + salle.
   ===================================================================== */

async function galaxy(methode, parametres = {}, page = 1, nombre = 400) {
  const { data, error } = await sb.functions.invoke('caces-galaxy', { body: { methode, parametres, page, nombre } });
  if (error) {
    let m = error.message;
    try { const j = await error.context.json(); m = j.error || m; } catch (_e) { /* garde le message */ }
    throw new Error(m);
  }
  if (!data?.ok) throw new Error(data?.error || 'Réponse Galaxy invalide');
  return data.reponse;
}

const REFERENTIELS_GALAXY = [[/R\.?\s?482/i, 'R482A'], [/R\.?\s?485/i, 'R485'], [/R\.?\s?486/i, 'R486A'], [/R\.?\s?489/i, 'R489']];
const referentielGalaxy = nomProduit => (REFERENTIELS_GALAXY.find(([re]) => re.test(nomProduit || '')) || [])[1] || null;
// « 1B Rec. et 5 Rec. » (recyclage) -> ['1B', '5'] : le suffixe « Rec. » est retiré
const categoriesGalaxy = texte => String(texte || '').split(/\s*(?:,|;|\/|\+|\bet\b)\s*/i)
  .map(x => x.trim().toUpperCase().replace(/\s+REC\.?$/, '').trim()).filter(Boolean);
const jourGalaxy = v => String(v || '').slice(0, 10) || null;

/** Lieu Galaxy → centre de test de l'appli (cherche d'abord le nom du centre, puis quelques correspondances connues). */
function centreDepuisLieuGalaxy(f) {
  const t = ((f.nom_lieu || '') + ' ' + (f.ville || '')).toLowerCase();
  const centres = S.referentiel.centres || [];
  const direct = centres.find(c => c.actif !== false && c.nom && t.includes(c.nom.toLowerCase()));
  if (direct) return direct;
  const regles = [[/vend[ée]e|mont-mercure|s[èe]vremont/, 'Sèvremont'], [/briec|bretagne/, 'Briec']];
  const r = regles.find(([re]) => re.test(t));
  return r ? centres.find(c => c.nom === r[1]) || null : null;
}

/** Galaxy range parfois, dans un produit R489, les catégories « 1 » et « 2 » (gerbeur / transpalette à conducteur accompagnant) : ce sont des catégories de la R485.
 *  Renvoie la clé « RÉFÉRENTIEL|CATÉGORIE » de l'appli. */
const CATS_GALAXY_AUTRE_REF = { R489: { '1': 'R485', '2': 'R485' } };
function cleCategorieGalaxy(ref, k) {
  const connues = new Set((S.referentiel?.categories || []).map(c => c.referentiel_code + '|' + c.code));
  if (connues.has(ref + '|' + k)) return ref + '|' + k;
  const autre = (CATS_GALAXY_AUTRE_REF[ref] || {})[k];
  if (autre && connues.has(autre + '|' + k)) return autre + '|' + k;
  // Produit mixte (ex. « R485 et/ou R489 ») : catégorie cherchée dans tous les référentiels, retenue si elle n'existe que dans un seul
  const candidats = [...connues].filter(x => x.split('|')[1] === k);
  return candidats.length === 1 ? candidats[0] : ref + '|' + k;
}

async function formationGalaxy(numero) {
  const n = Number(String(numero).trim());
  if (!n) throw new Error('N° de session Galaxy invalide');
  const rep = await galaxy('get_formations', { search: { formation_id: n } }, 1, 5);
  return (rep.result || [])[0] || null;
}

/** Inscrits d'une formation (sans annulés), avec les informations de la fiche stagiaire. */
async function inscritsGalaxy(f) {
  const jour = jourGalaxy(f.date_debut);
  const rep = await galaxy('get_sta_ins', { search: { produit_id: f.produit_id, date_debut: jour } }, 1, 400);
  const lignes = (rep.result || []).filter(x => String(x.salle_id || '') === String(f.salle_id || '') && String(x.annule) !== '1'
    && jourGalaxy(x.date_debut) === jour);
  const sortie = [];
  for (const l of lignes) {
    let fiche = {};
    try { fiche = ((await galaxy('get_stagiaires', { search: { id: l.stagiaire_id } }, 1, 5)).result || [])[0] || {}; } catch (_e) { /* fiche facultative */ }
    sortie.push({
      galaxy_id: String(l.stagiaire_id), nom: (l.nom || fiche.nom || '').trim(), prenom: (l.prenom || fiche.prenom || '').trim(),
      civilite: /^(mme|madame|mlle)/i.test(fiche.civ || '') ? 'Mme' : (/^(m\.?|mr|monsieur)$/i.test((fiche.civ || '').trim()) ? 'M' : null),
      email: (l.mail_pro || l.mail_perso || fiche.mail_pro || fiche.mail_perso || '').trim() || null,
      fonction: (fiche.fonction || '').trim() || null,
      entreprise: (fiche.entreprise_rattache || fiche.nom_etablissement || '').trim() || null,
      naissance: jourGalaxy(fiche.date_naissance),
      categories: categoriesGalaxy(l.categorie_suivi),
    });
  }
  return sortie;
}

/* ============ Nouvelle session : préremplissage ============ */
async function galaxyDansNouvelleSession() {
  const f = $('#form-session'), msg = $('#msg-galaxy');
  msg.textContent = 'Recherche dans Galaxy…';
  try {
    const form = await formationGalaxy(f.galaxy.value);
    if (!form) { msg.textContent = ''; return toast('Aucune formation avec ce numéro dans Galaxy.', 'erreur', 6000); }
    const ref = referentielGalaxy(form.nom_produit), inscrits = await inscritsGalaxy(form);
    const debut = jourGalaxy(form.date_debut), fin = jourGalaxy(form.date_fin);
    f.nom.value = `${(form.nom_produit || 'CACES').replace(/®/g, '')} — ${dateFr(debut)}`;
    if (debut) f.date_debut.value = debut;
    if (fin && fin !== debut) f.date_fin.value = fin;
    const centre = centreDepuisLieuGalaxy(form);
    if (centre) f.lieu_choix.value = String(centre.id);
    if (!/autorisation/i.test(form.nom_produit || '') && ref) {
      const cles = new Set(inscrits.flatMap(i => i.categories).map(k => cleCategorieGalaxy(ref, k)));
      $$('#form-session input[name=categorie]').forEach(c => { c.checked = cles.has(c.value); });
      f.querySelector('input[name=categorie]')?.dispatchEvent(new Event('change', { bubbles: true }));
    }
    msg.innerHTML = `✔ <b>${esc(form.nom_produit)}</b> — ${esc(dateFr(debut))}${fin && fin !== debut ? ' au ' + esc(dateFr(fin)) : ''}, ${esc(form.nom_lieu || '')} —
      ${inscrits.length} inscrit(s)${centre ? '' : ' <b>(lieu à choisir à la main)</b>'}. Les stagiaires s'importent ensuite depuis la session.`;
  } catch (e) { msg.textContent = ''; erreurSupabase('Lecture Galaxy', e); }
}

/* ============ Détail d'une session : import des stagiaires ============ */
async function ouvrirImportGalaxy() {
  const s = S.session;
  if (!s.numero_session_galaxy) return toast('Renseigne d\'abord le n° de session Galaxy.', 'erreur');
  ouvrirModale('Importer depuis Galaxy', '<p class="chargement">Lecture de Galaxy…</p>');
  try {
    const form = await formationGalaxy(s.numero_session_galaxy);
    if (!form) { fermerModale(); return toast('Aucune formation avec ce numéro dans Galaxy.', 'erreur', 6000); }
    const ref = referentielGalaxy(form.nom_produit), inscrits = await inscritsGalaxy(form);
    const { data: deja } = await sb.from('stagiaires').select('galaxy_stagiaire_id').eq('session_id', s.id);
    const dejaIds = new Set((deja || []).map(x => x.galaxy_stagiaire_id).filter(Boolean));
    const catsSession = new Set((s._categories || []).map(c => c.referentiel_code + '|' + c.categorie_code));
    const catsConnues = new Set((S.referentiel.categories || []).map(c => c.referentiel_code + '|' + c.code));
    const nouveaux = inscrits.filter(i => !dejaIds.has(i.galaxy_id));
    const cleCat = k => cleCategorieGalaxy(ref, k);
    ouvrirModale(`Importer depuis Galaxy — ${form.nom_produit || ''} (${dateFr(jourGalaxy(form.date_debut))})`, `
      <p class="aide">${inscrits.length} inscrit(s) dans Galaxy, ${nouveaux.length} à importer${inscrits.length - nouveaux.length ? ` (${inscrits.length - nouveaux.length} déjà importé(s))` : ''}.
        ${ref ? '' : '<b>Référentiel non reconnu à partir du nom du produit : les catégories ne seront pas importées.</b>'}</p>
      <table class="tableau"><thead><tr><th>Nom</th><th>Prénom</th><th>Entreprise</th><th>Catégories (Galaxy)</th><th></th></tr></thead><tbody>
      ${inscrits.map(i => `<tr><td>${esc(i.nom)}</td><td>${esc(i.prenom)}</td><td>${esc(i.entreprise || '')}</td>
        <td>${i.categories.map(k => { const c = cleCat(k); return `<span class="etat ${catsConnues.has(c) ? (catsSession.has(c) ? 'ok' : 'avertissement') : 'ko'}"
          title="${catsConnues.has(c) ? (catsSession.has(c) ? '' : 'Catégorie ajoutée à la session') : 'Catégorie inconnue : ignorée'}">${esc(k)}</span>`; }).join(' ')}</td>
        <td>${dejaIds.has(i.galaxy_id) ? '<span class="etat neutre">déjà importé</span>' : ''}</td></tr>`).join('')
        || '<tr><td colspan="5" class="vide">Aucun inscrit trouvé dans Galaxy pour cette formation.</td></tr>'}</tbody></table>
      <div class="pied-modale"><button type="button" onclick="fermerModale()">Annuler</button>
        <button class="principal" id="btn-import-galaxy" ${nouveaux.length ? '' : 'disabled'}>Importer ${nouveaux.length} stagiaire(s)</button></div>
      <p id="msg-import-galaxy" class="aide"></p>`);
    $('#btn-import-galaxy')?.addEventListener('click', async () => {
      const msg = $('#msg-import-galaxy'); $('#btn-import-galaxy').disabled = true;
      try {
        // catégories de l'import absentes de la session : ajoutées à la session
        const voulues = ref ? [...new Set(nouveaux.flatMap(i => i.categories).map(cleCat))].filter(c => catsConnues.has(c)) : [];
        const aAjouter = voulues.filter(c => !catsSession.has(c)).map(c => { const [referentiel_code, categorie_code] = c.split('|'); return { session_id: s.id, referentiel_code, categorie_code }; });
        if (aAjouter.length) { const { error } = await sb.from('session_categories').insert(aAjouter); if (error) throw error; }
        let n = 0;
        for (const i of nouveaux) {
          msg.textContent = `Import ${n + 1}/${nouveaux.length}…`;
          const { data, error } = await sb.from('stagiaires').insert({
            session_id: s.id, nom: i.nom.toUpperCase(), prenom: i.prenom, civilite: i.civilite, email: i.email, fonction: i.fonction,
            entreprise: i.entreprise, date_naissance: i.naissance && dateNaissanceValide(i.naissance) ? i.naissance : null,
            galaxy_stagiaire_id: i.galaxy_id, galaxy_nom: i.nom.toUpperCase(), galaxy_prenom: i.prenom, code_acces_individuel: codeIndividuel() }).select().single();
          if (error) throw error;
          const choisies = i.categories.map(cleCat).filter(c => catsConnues.has(c)).map(c => { const [referentiel_code, categorie_code] = c.split('|'); return { referentiel_code, categorie_code }; });
          await synchroniserCategoriesStagiaire(data.id, choisies.length ? choisies : (s._categories || []));
          n++;
        }
        fermerModale(); toast(`${n} stagiaire(s) importé(s) depuis Galaxy`);
        rendreDetailSession($('#contenu'));
      } catch (e) { msg.textContent = ''; $('#btn-import-galaxy').disabled = false; erreurSupabase('Import Galaxy', e); }
    });
  } catch (e) { fermerModale(); erreurSupabase('Lecture Galaxy', e); }
}
