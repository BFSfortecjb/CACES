/* =====================================================================
 *  CA_tablette.js — Évaluation pratique sur tablette (chantier 16)
 *  - Côté formateur : bouton « 📱 Évaluer sur tablette » → QR code (jeton secret 12 h).
 *  - Côté tablette  : lien #tablette/<jeton> → saisie du code testeur (4 chiffres)
 *    → Edge Function caces-acces-tablette → ouverture de la session du testeur
 *    → ouverture directe de la session. Déconnexion automatique après 12 h.
 * ===================================================================== */
const TABLETTE_FIN = 'caces_tablette_fin', TABLETTE_SESSION = 'caces_tablette_session';
/** Mode tablette actif : connecté par QR code, session valide (12 h) mémorisée. */
function tabletteActive() {
  try { return Number(localStorage.getItem(TABLETTE_FIN) || 0) > Date.now() && !!localStorage.getItem(TABLETTE_SESSION); } catch (_e) { return false; }
}
async function quitterTablette() {
  try { localStorage.removeItem(TABLETTE_FIN); localStorage.removeItem(TABLETTE_SESSION); } catch (_e) { /* ignoré */ }
  await deconnexion();
}

function lienTablette(jeton) { return location.origin + location.pathname + '#tablette/' + jeton; }

/* ---------------------------- côté formateur ---------------------------- */
async function ouvrirAccesTablette() {
  const s = S.session;
  const { data, error } = await sb.rpc('caces_creer_acces_tablette', { p_session: s.id });
  if (error) return erreurSupabase('Création de l\'accès tablette', error);
  const r = Array.isArray(data) ? data[0] : data;
  const lien = lienTablette(r.jeton);
  const fin = new Date(r.expire_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  ouvrirModale('📱 Évaluer sur tablette', `
    <p>Scannez ce QR code avec la tablette, puis saisissez votre <strong>code testeur</strong> (4 chiffres).</p>
    <div id="qr-tablette" style="display:flex;justify-content:center;margin:12px 0"></div>
    <p class="aide">Valable jusqu'au ${esc(fin)}. Ne partagez pas ce QR code : il ouvre l'évaluation de cette session. Un nouveau QR code remplace le précédent.</p>
    <div class="barre-actions"><button id="tab-revoquer">Révoquer l'accès</button></div>`, {});
  try { new QRCode($('#qr-tablette'), { text: lien, width: 240, height: 240 }); }
  catch (_e) { $('#qr-tablette').innerHTML = `<code style="word-break:break-all">${esc(lien)}</code>`; }
  $('#tab-revoquer').onclick = async () => {
    const { error: e } = await sb.rpc('caces_revoquer_acces_tablette', { p_session: s.id });
    if (e) return erreurSupabase('Révocation', e);
    fermerModale(); toast('Accès tablette révoqué');
  };
}

/* ------------------------------ côté tablette ------------------------------ */
function ecranTablette(cible) {
  const jeton = (location.hash.split('/')[1] || '').split('?')[0].trim();
  cible.innerHTML = `
    <div class="carte" style="max-width:420px;margin:40px auto;text-align:center">
      ${logoImg()}
      <h2>Évaluation pratique</h2>
      <p>Saisissez votre code testeur (4 chiffres).</p>
      <input id="tab-code" type="password" inputmode="numeric" maxlength="4" autocomplete="off"
             style="font-size:2rem;text-align:center;letter-spacing:.5em;width:8em">
      <p id="tab-err" class="erreur" role="alert"></p>
      <button id="tab-ok" class="principal">Valider</button>
    </div>`;
  const champ = $('#tab-code'); champ.focus();
  const valider = async () => {
    const code = champ.value.trim();
    if (!/^\d{4}$/.test(code)) { $('#tab-err').textContent = 'Le code comporte 4 chiffres.'; return; }
    $('#tab-ok').disabled = true; $('#tab-err').textContent = '';
    try {
      const { data, error } = await sb.functions.invoke('caces-acces-tablette', { body: { jeton, code } });
      let rep = data;
      if (error && error.context && typeof error.context.json === 'function') { try { rep = await error.context.json(); } catch (_e) { /* ignoré */ } }
      if (!rep?.ok) { $('#tab-err').textContent = rep?.error || 'Accès refusé.'; $('#tab-ok').disabled = false; champ.value = ''; return; }
      const { error: e2 } = await sb.auth.verifyOtp({ token_hash: rep.token_hash, type: 'magiclink' });
      if (e2) { $('#tab-err').textContent = 'Ouverture de session impossible.'; $('#tab-ok').disabled = false; return; }
      try { localStorage.setItem(TABLETTE_FIN, String(Date.now() + 12 * 3600 * 1000)); } catch (_e) { /* ignoré */ }
      try { localStorage.setItem(TABLETTE_SESSION, rep.session_id); } catch (_e) { /* ignoré */ }
      location.hash = '';
      const etat = await chargerProfil();
      if (etat === 'ok') await chargerReferentiel();
      await router();
      surveillerFinTablette();
    } catch (e) { $('#tab-err').textContent = 'Erreur de connexion.'; $('#tab-ok').disabled = false; }
  };
  $('#tab-ok').onclick = valider;
  champ.addEventListener('keydown', ev => { if (ev.key === 'Enter') valider(); });
}

/** Déconnexion automatique de la tablette à l'échéance (12 h). */
function surveillerFinTablette() {
  let fin = 0; try { fin = Number(localStorage.getItem(TABLETTE_FIN) || 0); } catch (_e) { /* ignoré */ }
  if (!fin) return;
  const verifier = async () => {
    if (Date.now() >= fin) {
      try { localStorage.removeItem(TABLETTE_FIN); } catch (_e) { /* ignoré */ }
      await quitterTablette(); toast('Session tablette terminée');
    } else setTimeout(verifier, 60000);
  };
  verifier();
}

/* ------------- Écran simplifié « testeur » (téléphone / tablette) ------------- */
async function ecranTabletteSession(cible) {
  const sid = localStorage.getItem(TABLETTE_SESSION);
  cible.innerHTML = '<div class="tab-chargement">Chargement…</div>';
  const { data: s, error } = await sb.from('sessions_formation').select('*').eq('id', sid).single();
  if (error || !s) { toast('Session introuvable : redemandez un QR code.', 'erreur'); return quitterTablette(); }
  S.session = s; S.ecran = 'session'; S.vision = S.profil?.role === 'admin' ? 'admin' : 'formateur';
  const [{ data: stags }, { data: groupes }, { data: sts }] = await Promise.all([
    sb.from('stagiaires').select('id, nom, prenom, civilite, entreprise, groupe_id, testeur_id, ordre, stagiaire_categories(referentiel_code, categorie_code, theorie_validee, pratique_validee)').eq('session_id', sid).order('ordre').order('nom'),
    sb.from('session_groupes').select('*').eq('session_id', sid).order('numero'),
    sb.from('session_testeurs').select('testeur_id').eq('session_id', sid),
  ]);
  s._groupes = groupes || []; s._testeurs = (sts || []).map(x => x.testeur_id);
  if (typeof chargerRegleCategories === 'function') await chargerRegleCategories(s);
  const moi = S.profil?.id;
  let filtre = 'moi';

  const dessiner = () => {
    const cloturee = s.statut === 'cloturee';
    const liste = (stags || []).filter(st => filtre === 'tous' || !st.testeur_id || st.testeur_id === moi);
    cible.innerHTML = `
      <header class="tab-entete">
        <div class="tab-titre">${logoImg('tab-logo')}<div><b>${esc(s.nom)}</b><span>Testeur : ${esc(((S.profil?.nom || '') + ' ' + (S.profil?.prenom || '')).trim())}</span></div></div>
        <button class="tab-quitter" id="tab-quitter">Quitter</button>
      </header>
      <div class="tab-filtres">
        <button class="${filtre === 'moi' ? 'actif' : ''}" data-f="moi">Mes stagiaires</button>
        <button class="${filtre === 'tous' ? 'actif' : ''}" data-f="tous">Tous (${(stags || []).length})</button>
      </div>
      ${cloturee ? '<p class="tab-alerte">Session clôturée : évaluations verrouillées.</p>' : ''}
      <main class="tab-liste">
        ${liste.map(st => {
          const peut = !cloturee && peutTesterStagiaire(st, s, moi);
          return `<section class="tab-carte">
            <h3>${esc(st.nom)} ${esc(st.prenom || '')}</h3>
            ${st.entreprise ? `<p class="tab-sous">${esc(st.entreprise)}</p>` : ''}
            <div class="tab-cats">${(st.stagiaire_categories || []).map(c => {
              const aff = testeurDeCategorie(c.referentiel_code, c.categorie_code, s), autre = aff && aff !== moi;
              const fait = c.pratique_validee === true, rate = c.pratique_validee === false;
              const etat = fait ? 'fait' : rate ? 'rate' : 'afaire';
              const lib = `${esc(c.referentiel_code)} ${esc(c.categorie_code)}`;
              return `<button class="tab-cat ${etat} ${autre ? 'autre' : ''}" ${(!peut || autre) ? 'disabled' : ''} data-st="${st.id}" data-cle="${esc(c.referentiel_code + '|' + c.categorie_code)}">
                <b>${lib}</b><span>${autre ? '→ ' + esc(nomFormateur(aff)) : fait ? '✔ validée' : rate ? '✖ échec' : 'à évaluer'}</span></button>`;
            }).join('') || '<i>aucune catégorie</i>'}</div>
            ${!peut && !cloturee ? '<p class="tab-sous">Vous êtes le formateur de ce stagiaire : évaluation impossible.</p>' : ''}
          </section>`;
        }).join('') || '<p class="vide">Aucun stagiaire.</p>'}
      </main>`;
    $('#tab-quitter').onclick = () => { if (confirm('Quitter le mode tablette ?')) quitterTablette(); };
    $$('.tab-filtres button').forEach(b => b.onclick = () => { filtre = b.dataset.f; dessiner(); });
    $$('.tab-cat').forEach(b => b.onclick = async () => {
      if (!(await exigerCodeTesteur(sid))) return;
      await ouvrirPratique(b.dataset.st, b.dataset.cle);
    });
  };
  dessiner();
  veilleBloquer();   // l'écran reste allumé pendant l'évaluation
}
