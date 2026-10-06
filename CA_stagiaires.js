/* =====================================================================
   CA_stagiaires.js — fiche stagiaire, import/export Excel, actions
   ===================================================================== */

function codeIndividuel() { return genererCodeAcces(8); }

/** Calcule l'âge à partir d'une date de naissance (contrôle de saisie, comme Habelec). */
async function editerStagiaire(id) {
  let st = { nom: '', prenom: '', fonction: '', entreprise: S.session.entreprise || '', date_naissance: null, email: '' };
  let visees = new Set((S.session._categories || []).map(c => c.referentiel_code + '|' + c.categorie_code));
  if (id) {
    const { data } = await sb.from('stagiaires')
      .select('*, stagiaire_categories(referentiel_code, categorie_code)').eq('id', id).single();
    st = data;
    visees = new Set((data.stagiaire_categories || []).map(c => c.referentiel_code + '|' + c.categorie_code));
  }
  const categoriesSession = S.session._categories || [];

  ouvrirModale(`${id ? 'Modifier' : 'Ajouter'} un stagiaire`, `
    <form id="form-stagiaire" class="formulaire">
      <div class="grille-2">
        <label>Nom <input name="nom" required value="${esc(st.nom)}"></label>
        <label>Prénom <input name="prenom" required value="${esc(st.prenom)}"></label>
        <label>Fonction <input name="fonction" value="${esc(st.fonction)}"></label>
        <label>Entreprise (employeur) <input name="entreprise" value="${esc(st.entreprise)}"></label>
        <label>Date de naissance
          <input name="date_naissance" type="date" max="${dateNaissanceMax()}" value="${esc(st.date_naissance || '')}"></label>
        <label>E-mail <input name="email" type="email" value="${esc(st.email || '')}"></label>
      </div>
      <fieldset><legend>Catégories de CACES visées par ce stagiaire</legend>
        ${categoriesSession.map(c => `<label class="case"><input type="checkbox" name="categorie"
          value="${esc(c.referentiel_code)}|${esc(c.categorie_code)}"
          ${visees.has(c.referentiel_code + '|' + c.categorie_code) ? 'checked' : ''}>
          ${esc(c.referentiel_code)} ${esc(c.categorie_code)}</label>`).join('')}
      </fieldset>
      <div class="pied-modale">
        <button type="button" onclick="fermerModale()">Annuler</button>
        <button type="submit" class="principal">Enregistrer</button>
      </div>
    </form>`);

  $('#form-stagiaire').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    const donnees = {
      session_id: S.session.id,
      nom: f.nom.value.trim().toUpperCase(), prenom: f.prenom.value.trim(),
      fonction: f.fonction.value.trim() || null, entreprise: f.entreprise.value.trim() || null,
      date_naissance: f.date_naissance.value || null, email: f.email.value.trim() || null,
    };
    if (donnees.date_naissance && !dateNaissanceValide(donnees.date_naissance)) {
      return toast('Cette date de naissance donne moins de 16 ans — vérifie qu\'il ne s\'agit pas de '
        + 'la date du jour par erreur.', 'erreur', 7000);
    }
    const choisies = $$('#form-stagiaire input[name=categorie]:checked').map(i => {
      const [referentiel_code, categorie_code] = i.value.split('|');
      return { referentiel_code, categorie_code };
    });
    if (!choisies.length) return toast('Coche au moins une catégorie visée', 'erreur');
    try {
      let stagiaireId = id;
      if (id) {
        const { error } = await sb.from('stagiaires').update(donnees).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from('stagiaires')
          .insert({ ...donnees, code_acces_individuel: codeIndividuel() }).select().single();
        if (error) throw error;
        stagiaireId = data.id;
      }
      await synchroniserCategoriesStagiaire(stagiaireId, choisies);
      fermerModale();
      toast('Stagiaire enregistré');
      rendreDetailSession($('#contenu'));
    } catch (e) { erreurSupabase('Enregistrement du stagiaire', e); }
  });
}

/** Aligne stagiaire_categories sur la sélection, sans toucher aux résultats des catégories conservées. */
async function synchroniserCategoriesStagiaire(stagiaireId, choisies) {
  const { data: existantes } = await sb.from('stagiaire_categories')
    .select('referentiel_code, categorie_code').eq('stagiaire_id', stagiaireId);
  const cle = c => c.referentiel_code + '|' + c.categorie_code;
  const aGarder = new Set(choisies.map(cle));
  const dejaLa = new Set((existantes || []).map(cle));
  for (const e of (existantes || []).filter(e => !aGarder.has(cle(e)))) {
    await sb.from('stagiaire_categories').delete().eq('stagiaire_id', stagiaireId)
      .eq('referentiel_code', e.referentiel_code).eq('categorie_code', e.categorie_code);
  }
  const aAjouter = choisies.filter(c => !dejaLa.has(cle(c)))
    .map(c => ({ stagiaire_id: stagiaireId, ...c }));
  if (aAjouter.length) {
    const { error } = await sb.from('stagiaire_categories').insert(aAjouter);
    if (error) throw error;
  }
}

async function supprimerStagiaire(id) {
  if (!confirmer('Supprimer ce stagiaire et tous ses résultats ?')) return;
  const { error } = await sb.from('stagiaires').delete().eq('id', id);
  if (error) return erreurSupabase('Suppression du stagiaire', error);
  toast('Stagiaire supprimé');
  rendreDetailSession($('#contenu'));
}

/* Popup « Plus d'actions » (même principe qu'Habelec : la ligne reste sobre) */
function ouvrirActionsStagiaire(id, nom, prenom) {
  const d = droitsSession(S.session);
  ouvrirModale(`${nom} ${prenom}`, `
    <div class="liste-actions-stagiaire">
      ${d.ecriture ? `<button onclick="fermerModale();editerStagiaire('${id}')">✎ Modifier le stagiaire et ses catégories</button>` : ''}
      <button onclick="fermerModale();appelModule('ouvrirPhoto','${id}')">📷 Photo du titulaire</button>
      <button onclick="fermerModale();appelModule('voirCopie','${id}')">📄 Voir la copie corrigée du QCM</button>
      <button onclick="fermerModale();appelModule('${S.session.type_session === 'autorisation' ? 'genererAutorisationPdf' : 'genererCartonPdf'}','${id}')">${S.session.type_session === 'autorisation' ? '🪪 Générer l\'autorisation de conduite (PDF)' : '🪪 Générer le carton CACES (PDF)'}</button>
      ${d.ecriture ? `<button class="danger" onclick="fermerModale();supprimerStagiaire('${id}')">🗑 Supprimer le stagiaire</button>` : ''}
    </div>`);
}

/* ===================== Import / export Excel ========================= */
const COLONNES_STAGIAIRE = ['Nom', 'Prenom', 'Fonction', 'Entreprise', 'Date de naissance', 'Email'];

function modeleExcelStagiaires() {
  const cats = (S.session?._categories || []).map(c => c.referentiel_code + ' ' + c.categorie_code);
  const entetes = [...COLONNES_STAGIAIRE, ...cats];
  const exemple = ['DUPONT', 'Jean', 'Cariste', 'Entreprise Client', '1985-04-12', 'jean.dupont@exemple.fr',
    ...cats.map((c, i) => (i === 0 ? 'x' : ''))];
  const ws = XLSX.utils.aoa_to_sheet([entetes, exemple]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stagiaires');
  XLSX.writeFile(wb, 'modele_stagiaires.xlsx');
  toast('Modèle téléchargé — coche les catégories avec un « x » (vide = toutes celles de la session)');
}

/** Normalise un en-tête : minuscules, sans accents, sans espaces. */
function cleEntete(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

async function importerStagiairesExcel(input) {
  const fichier = input.files?.[0];
  if (!fichier) return;
  try {
    const buf = await fichier.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const lignes = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    if (!lignes.length) return toast('Fichier vide', 'erreur');

    const cats = S.session._categories || [];
    const parCle = {};
    cats.forEach(c => { parCle[cleEntete(c.referentiel_code + c.categorie_code)] = c; });

    let creees = 0, ignorees = 0;
    for (const ligne of lignes) {
      const val = nom => {
        const k = Object.keys(ligne).find(x => cleEntete(x).startsWith(cleEntete(nom)));
        const v = k ? ligne[k] : '';
        return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim();
      };
      const nom = val('Nom'), prenom = val('Prenom');
      if (!nom && !prenom) { ignorees++; continue; }
      let naissance = val('Date de naissance') || null;
      if (naissance && !/^\d{4}-\d{2}-\d{2}$/.test(naissance)) {
        const m = naissance.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
        naissance = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
      }
      if (naissance && !dateNaissanceValide(naissance)) naissance = null;

      const { data, error } = await sb.from('stagiaires').insert({
        session_id: S.session.id, nom: nom.toUpperCase(), prenom,
        fonction: val('Fonction') || null, entreprise: val('Entreprise') || S.session.entreprise || null,
        date_naissance: naissance, email: val('Email') || null, code_acces_individuel: codeIndividuel(),
      }).select().single();
      if (error) { DEBUG.erreur('Import ligne', error.message); ignorees++; continue; }

      const coches = [];
      Object.entries(ligne).forEach(([col, v]) => {
        const c = parCle[cleEntete(col)];
        if (c && String(v).trim() && !/^(0|non|false)$/i.test(String(v).trim())) coches.push(c);
      });
      const choisies = coches.length ? coches : cats;   // aucune coche = toutes les catégories de la session
      await synchroniserCategoriesStagiaire(data.id, choisies);
      creees++;
    }
    toast(`${creees} stagiaire(s) importé(s)${ignorees ? `, ${ignorees} ligne(s) ignorée(s)` : ''}`);
    input.value = '';
    rendreDetailSession($('#contenu'));
  } catch (e) { erreurSupabase('Import Excel', e); }
}
