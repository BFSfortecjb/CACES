/* =====================================================================
   CA_stagiaire.js — portail stagiaire (#stagiaire), sans compte.
   Accès : code de SESSION (+ choix du nom + date de naissance) ou code
   INDIVIDUEL (8 car.). Tout passe par les fonctions SQL anon caces_*.
   ===================================================================== */
const PS = { code: '', codeSession: '' };   // état du portail

function codeDuLien() {
  const m = location.hash.match(/[?&]code=([^&]+)/);
  return m ? decodeURIComponent(m[1]).trim().toUpperCase() : '';
}

function pageStagiaire(cible, html) {
  cible.innerHTML = `<div class="stagiaire-accueil"><h1>${esc(CONFIG.NOM_APPLICATION)}</h1>${html}</div>`;
}

async function ecranStagiaire(cible) {
  const code = codeDuLien();
  if (code) return validerCodeStagiaire(cible, code);
  ecranSaisieCodeStagiaire(cible);
}

function ecranSaisieCodeStagiaire(cible, erreur = '') {
  pageStagiaire(cible, `
    <p class="sous-titre">Espace stagiaire — QCM théorique</p>
    ${erreur ? `<div class="carte refus"><b>${esc(erreur)}</b></div>` : ''}
    <form class="carte" id="form-code-stag">
      <label>Code affiché en salle (ou code individuel)
        <input class="saisie-code" name="code" maxlength="8" autocapitalize="characters" autocomplete="off" required>
      </label>
      <button class="principal" type="submit">Continuer</button>
    </form>`);
  $('#form-code-stag', cible).addEventListener('submit', ev => {
    ev.preventDefault();
    validerCodeStagiaire(cible, ev.target.code.value.trim().toUpperCase());
  });
}

async function validerCodeStagiaire(cible, code) {
  pageStagiaire(cible, '<p>Vérification…</p>');
  try {
    const infos = await rpc('caces_stagiaire_infos', { p_code: code });
    if (infos && infos.length) { PS.code = code; return ecranCategoriesStagiaire(cible, infos); }
    const cands = await rpc('caces_candidats_session', { p_code_session: code });
    if (cands && cands.length) { PS.codeSession = code; return ecranNomsStagiaire(cible, cands); }
    ecranSaisieCodeStagiaire(cible, 'Code introuvable ou session non ouverte. Demande à ton formateur.');
  } catch (e) { ecranSaisieCodeStagiaire(cible, 'Erreur : ' + e.message); }
}

function ecranNomsStagiaire(cible, cands) {
  pageStagiaire(cible, `
    <p>Session : <b>${esc(cands[0].session_nom)}</b><br>Touche ton nom :</p>
    <div class="grille-noms">${cands.map(c =>
      `<button class="nom" data-id="${esc(c.stagiaire_id)}">${esc(c.prenom)} ${esc(c.nom)}</button>`).join('')}</div>`);
  $$('.nom', cible).forEach(b => b.addEventListener('click', () => {
    const c = cands.find(x => x.stagiaire_id === b.dataset.id);
    pageStagiaire(cible, `
      <form class="carte" id="form-naiss">
        <p><b>${esc(c.prenom)} ${esc(c.nom)}</b></p>
        <label>Ta date de naissance <input type="date" name="n" required></label>
        <button class="principal" type="submit">Continuer</button>
        <button type="button" class="lien" id="retour-noms">← Ce n'est pas moi</button>
      </form>`);
    $('#retour-noms', cible).onclick = () => ecranNomsStagiaire(cible, cands);
    $('#form-naiss', cible).addEventListener('submit', async ev => {
      ev.preventDefault();
      try {
        const code = await rpc('caces_identifier_stagiaire',
          { p_code_session: PS.codeSession, p_stagiaire_id: c.stagiaire_id, p_naissance: ev.target.n.value });
        PS.code = code;
        ecranCategoriesStagiaire(cible, await rpc('caces_stagiaire_infos', { p_code: code }));
      } catch (e) { toast(e.message); }
    });
  }));
}

function ecranCategoriesStagiaire(cible, lignes) {
  const i = lignes[0];
  // un QCM par référentiel (la banque est commune aux catégories d'un référentiel)
  const refs = [...new Set(lignes.map(l => l.referentiel_code))];
  pageStagiaire(cible, `
    <div class="carte">
      <p>Bonjour <b>${esc(i.prenom)} ${esc(i.nom)}</b><br>Session : ${esc(i.session_nom)}</p>
      ${refs.map(r => {
        const l = lignes.filter(x => x.referentiel_code === r);
        const cats = l.map(x => x.categorie_code).join(', ');
        const ok = l.every(x => x.theorie_validee);
        return `<p><b>${esc(libelleReferentiel(r))}</b> — cat. ${esc(cats)}<br>` +
          (ok ? '<span class="etat">✔ Théorie déjà validée</span>'
              : `<button class="principal" data-ref="${esc(r)}">Passer le QCM</button>`) + '</p>';
      }).join('')}
    </div>`);
  $$('button[data-ref]', cible).forEach(b =>
    b.addEventListener('click', () => demarrerQcmStagiaire(cible, b.dataset.ref)));
}

async function demarrerQcmStagiaire(cible, ref) {
  pageStagiaire(cible, '<p>Préparation du questionnaire…</p>');
  try {
    const tirage = await rpc('caces_demarrer_qcm', { p_code: PS.code, p_referentiel_code: ref });
    const qs = await rpc('caces_questions_du_tirage', { p_code: PS.code, p_tirage_id: tirage });
    ecranQcmStagiaire(cible, tirage, ref, qs || []);
  } catch (e) { pageStagiaire(cible, `<div class="carte refus"><b>Erreur : ${esc(e.message)}</b></div>`); }
}

function ecranQcmStagiaire(cible, tirage, ref, qs) {
  const rep = {};
  qs.forEach(q => { if (q.reponse_stagiaire !== null) rep[q.question_id] = q.reponse_stagiaire; });
  cible.innerHTML = `<div class="stagiaire-accueil" style="margin:2vh auto;text-align:left">
    <h2>${esc(libelleReferentiel(ref))}</h2>
    <p class="aide">Réponds Vrai ou Faux. Tes réponses sont enregistrées au fur et à mesure.
      <b id="stag-compteur"></b></p>
    ${qs.map(q => `<div class="carte" data-q="${q.question_id}">
      <p><b>${q.ordre}.</b> ${esc(q.enonce)}</p>
      <div class="barre-actions">
        <button class="nom" data-v="1">Vrai</button><button class="nom" data-v="0">Faux</button></div></div>`).join('')}
    <button class="principal" id="stag-fin" style="width:100%;padding:14px">Terminer et corriger</button></div>`;
  const maj = () => {
    $('#stag-compteur', cible).textContent = ` (${Object.keys(rep).length}/${qs.length})`;
    $$('[data-q]', cible).forEach(c => {
      const v = rep[c.dataset.q];
      $$('button', c).forEach(b => {
        const sel = v !== undefined && (b.dataset.v === '1') === v;
        b.style.background = sel ? 'var(--jaune)' : ''; b.style.fontWeight = sel ? '700' : '';
      });
    });
  };
  maj();
  $$('[data-q] button', cible).forEach(b => b.addEventListener('click', async () => {
    const id = Number(b.closest('[data-q]').dataset.q), v = b.dataset.v === '1';
    rep[id] = v; maj();
    try { await rpc('caces_repondre', { p_code: PS.code, p_tirage_id: tirage, p_question_id: id, p_reponse: v }); }
    catch (e) { toast('Réponse non enregistrée : ' + e.message); }
  }));
  $('#stag-fin', cible).addEventListener('click', async ev => {
    const manque = qs.length - Object.keys(rep).length;
    if (manque && !confirm(`${manque} question(s) sans réponse seront comptées fausses. Terminer ?`)) return;
    ev.target.disabled = true;
    try {
      const r = (await rpc('caces_finaliser_qcm', { p_code: PS.code, p_tirage_id: tirage }))[0];
      resultatQcmStagiaire(cible, r);
    } catch (e) { toast(e.message); ev.target.disabled = false; }
  });
}

function resultatQcmStagiaire(cible, r) {
  pageStagiaire(cible, `
    <div class="carte ${r.reussi ? 'succes' : 'refus'}"><h2>${r.reussi ? 'ADMIS' : 'NON ADMIS'}</h2>
      <p>Note globale : <b>${esc(r.score_global_pct)} %</b></p></div>
    <table class="tableau"><thead><tr><th>Thème</th><th>Note</th><th>Bonnes réponses</th></tr></thead><tbody>
    ${(r.detail_themes || []).map(t => `<tr><td>${esc(t.theme)}</td><td>${esc(t.note_pct)} %</td>
      <td>${esc(t.nb_correct)} / ${esc(t.nb_questions)}</td></tr>`).join('')}</tbody></table>
    <p class="aide">Le résultat définitif te sera communiqué par ton testeur.</p>`);
}
