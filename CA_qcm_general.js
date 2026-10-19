/* =====================================================================
   CA_qcm_general.js — QCM GÉNÉRAL (testeur) : questions projetées pour tout le groupe.
   Mode « téléphone » : les téléphones des stagiaires servent de télécommande (Vrai/Faux puis Valider).
   Mode « quizbox »   : réponses saisies avec les boîtiers Quizbox, puis import de l'export Excel.
   Option voix : lecture à voix haute des questions sur l'appareil qui projette (accessibilité).
   ===================================================================== */
const QG = { seance: null, questions: [], participants: [], idx: 0, timer: null, enCours: false,
             police: 1, voixActive: false, vitesse: 1, derniereLue: -1, courantServeur: 1 };

/* ---------- préparation ---------- */
async function ouvrirQcmGeneral(modePrereglage) {
  const s = S.session;
  if (!(await exigerCodeTesteur(s.id))) return;
  const [{ data: stags }, { data: seances }] = await Promise.all([
    sb.from('stagiaires').select('*, stagiaire_categories(referentiel_code, theorie_validee)').eq('session_id', s.id).order('nom'),
    sb.from('qcm_seances').select('*').eq('session_id', s.id).in('etat', ['attente', 'en_cours']).order('created_at', { ascending: false }),
  ]);
  const refs = [...new Set((s._categories || []).map(c => c.referentiel_code))];
  if (!refs.length) return toast('Aucune catégorie sur cette session.', 'erreur');
  const mesStags = (stags || []).filter(st => peutTesterStagiaire(st, s));
  const reprise = (seances || [])[0];
  const lignes = (ref) => mesStags.map((st, i) => {
    const fait = (st.stagiaire_categories || []).filter(c => c.referentiel_code === ref).every(c => c.theorie_validee);
    return `<tr><td><label><input type="checkbox" class="qg-part" value="${st.id}" ${fait ? '' : 'checked'}> ${esc(st.nom)} ${esc(st.prenom)}</label>
      ${fait ? ' <span class="etat">✔ théorie validée</span>' : ''}</td>
      <td class="qg-col-box"><input type="number" min="1" max="999" class="qg-num" data-id="${st.id}" value="${st.numero_telecommande || ''}" style="width:70px"></td></tr>`;
  }).join('');
  ouvrirModale('QCM général', `
    ${reprise ? `<div class="carte"><b>Une séance est déjà en cours</b> (${esc(libelleReferentiel(reprise.referentiel_code))}, ${reprise.etat === 'attente' ? 'salle d\'attente, ' : ''}${reprise.mode === 'quizbox' ? 'Quizbox' : 'téléphones'}).
      <button class="principal" onclick="reprendreQcmGeneral('${reprise.id}')">▶ Reprendre</button></div>` : ''}
    <form id="form-qg" class="formulaire">
      <label>Référentiel <select name="ref">${refs.map(r => `<option value="${esc(r)}">${esc(libelleReferentiel(r))}</option>`).join('')}</select></label>
      <fieldset><legend>Mode de réponse</legend>
        <label><input type="radio" name="mode" value="telephone" checked> Téléphones des stagiaires (télécommande Vrai / Faux)</label>
        <label><input type="radio" name="mode" value="quizbox"> Boîtiers Quizbox (import de l'export Excel)</label></fieldset>
      <fieldset><legend>Accessibilité</legend>
        <label><input type="checkbox" name="voix"> Lire les questions à voix haute (sur l'appareil qui projette)</label>
        <label>Vitesse de la voix <input type="range" name="vitesse" min="0.5" max="2" step="0.1" value="1"></label></fieldset>
      <fieldset><legend>Participants</legend>
        <table class="tableau"><thead><tr><th>Stagiaire</th><th class="qg-col-box">N° boîtier</th></tr></thead><tbody id="qg-lignes">${lignes(refs[0])}</tbody></table>
        <div class="qg-box-outils" hidden><button type="button" onclick="numeroterAutoQg()">Numéroter automatiquement (ordre alphabétique)</button></div>
        <p class="aide">Seuls les stagiaires que tu peux tester apparaissent. Ceux dont tu es le formateur sont exclus.</p></fieldset>
      <div class="pied-modale"><button type="button" onclick="fermerModale()">Annuler</button>
        <button class="principal" type="submit">Démarrer la séance</button></div>
    </form>`, { large: true });
  const f = $('#form-qg');
  if (modePrereglage) f.mode.value = modePrereglage;
  const maj = () => {
    const quizbox = f.mode.value === 'quizbox';
    $$('.qg-col-box', f).forEach(e => e.style.display = quizbox ? '' : 'none');
    $('.qg-box-outils', f).hidden = !quizbox;
  };
  maj();
  $$('input[name=mode]', f).forEach(r => r.addEventListener('change', maj));
  f.ref.addEventListener('change', () => { $('#qg-lignes').innerHTML = lignes(f.ref.value); maj(); });
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const ids = $$('.qg-part:checked', f).map(c => c.value);
    if (!ids.length) return toast('Choisis au moins un participant.', 'erreur');
    const mode = f.mode.value;
    try {
      // Référentiel : 12 candidats maximum par testeur présent dans la salle pour les épreuves théoriques
      const { data: prm } = await sb.from('parametres_application').select('max_candidats_theorie').eq('id', 1).single();
      const nbTesteurs = Math.max(1, testeursSession(s).length), max = (prm?.max_candidats_theorie || 12) * nbTesteurs;
      if (ids.length > max) return toast(`Limite : ${max} candidats maximum pour ${nbTesteurs} testeur(s) (${prm?.max_candidats_theorie || 12} par testeur). Retire des participants ou ajoute un testeur à la session.`, 'erreur', 8000);
      if (mode === 'quizbox') {
        const nums = $$('.qg-num', f).map(i => ({ stagiaire_id: i.dataset.id, numero: i.value }));
        const vus = nums.filter(n => n.numero).map(n => n.numero);
        if (new Set(vus).size !== vus.length) return toast('Deux stagiaires ont le même numéro de boîtier.', 'erreur');
        await rpc('caces_numeroter_telecommandes', { p_session: s.id, p_numeros: nums });
      }
      const id = await rpc('caces_seance_demarrer', { p_session: s.id, p_ref: f.ref.value, p_mode: mode,
        p_voix: f.voix.checked, p_vitesse: Number(f.vitesse.value), p_stagiaires: ids });
      fermerModale();
      await reprendreQcmGeneral(id);
    } catch (e) { toast(e.message, 'erreur'); }
  });
}
function numeroterAutoQg() {
  $$('.qg-part').forEach((c, i) => { const n = $(`.qg-num[data-id="${c.value}"]`); if (n) n.value = c.checked ? '' : n.value; });
  let k = 1;
  $$('.qg-part:checked').forEach(c => { const n = $(`.qg-num[data-id="${c.value}"]`); if (n) n.value = k++; });
}

/* ---------- écran projeté ---------- */
async function reprendreQcmGeneral(seanceId) {
  fermerModale();
  try {
    const { data: se, error } = await sb.from('qcm_seances').select('*').eq('id', seanceId).single();
    if (error) throw error;
    const { data: qs, error: e2 } = await sb.from('questions_qcm').select('id, code, enonce, illustration, theme_id').in('id', se.question_ids);
    if (e2) throw e2;
    const { data: ths } = await sb.from('themes_referentiel').select('id, libelle, consigne').eq('referentiel_code', se.referentiel_code);
    QG.themes = Object.fromEntries((ths || []).map(t => [t.id, t])); QG.introVus = new Set();
    const parId = Object.fromEntries((qs || []).map(q => [q.id, q]));
    QG.seance = se; QG.questions = se.question_ids.map(id => parId[id]);
    QG.idx = se.mode === 'quizbox' ? 0 : se.question_courante - 1;
    QG.voixActive = !!se.voix; QG.vitesse = Number(se.vitesse_voix) || 1; QG.derniereLue = -1; QG.enCours = true;
    QG.participants = []; QG.idxChrono = -1; QG.avance = -1;
    QG.debutSeance = se.date_debut ? new Date(se.date_debut).getTime() : Date.now();
    ouvrirEcranProjete();
  } catch (e) { toast(e.message, 'erreur'); }
}

function ouvrirEcranProjete() {
  fermerEcranProjete(true);
  QG.enCours = true;   // fermerEcranProjete le remet à faux : sans cela le passage automatique ne se déclenche jamais
  const d = document.createElement('div');
  d.id = 'qg-ecran'; d.className = 'qg-ecran';
  document.body.appendChild(d);
  document.body.classList.add('qg-actif');
  dessinerEcranProjete();
  if (QG.seance.mode === 'telephone') {
    interrogerSeance();
    QG.timer = setInterval(interrogerSeance, 1500);
  } else interrogerSeance();
  QG.chrono = setInterval(majChrono, 1000);
}
function fermerEcranProjete(silencieux) {
  clearInterval(QG.timer); QG.timer = null; clearInterval(QG.chrono); QG.chrono = null;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  document.getElementById('qg-ecran')?.remove();
  document.body.classList.remove('qg-actif');
  QG.enCours = false;
}

let _qgOccupe = false;
async function interrogerSeance() {
  if (_qgOccupe || !QG.seance) return;
  _qgOccupe = true;
  try {
    const p = await rpc('caces_seance_progression', { p_seance: QG.seance.id });
    QG.participants = p || [];
    if (QG.seance.mode === 'telephone') QG.courantServeur = QG.idx + 1;
    majBandeauParticipants();
    verifierAvanceAuto();
  } catch (e) { /* réseau instable : on réessaie au tick suivant */ }
  _qgOccupe = false;
}

const nomCourt = p => `${(p.nom || '').toUpperCase()} ${(p.prenom || '').charAt(0).toUpperCase()}.`;

function majBandeauParticipants() {
  const b = document.getElementById('qg-bandeau'); if (!b) return;
  const quiz = QG.seance.mode === 'quizbox';
  b.innerHTML = QG.participants.map(p => {
    const cls = quiz ? '' : (QG.seance.etat === 'attente' ? (p.connecte ? 'ok' : '') : (p.valide ? 'ok' : (p.a_repondu ? 'attente' : '')));
    const lib = quiz ? `${p.numero_telecommande != null ? 'n° ' + p.numero_telecommande + ' — ' : ''}${esc(nomCourt(p))}` : esc(nomCourt(p));
    return `<span class="qg-puce ${cls}">${QG.seance.etat === 'attente' && p.connecte ? '✔ ' : ''}${lib}</span>`;
  }).join('');
  const nb = QG.participants.length;
  const cc = document.getElementById('qg-compte');
  if (cc) cc.textContent = QG.seance.etat === 'attente'
    ? `${QG.participants.filter(p => p.connecte).length} / ${nb} téléphones connectés`
    : `${QG.participants.filter(p => p.valide).length} / ${nb} ont validé`;
  const tous = QG.participants.length && QG.participants.every(p => p.valide);
  const btn = document.getElementById('qg-suivante');
  if (btn && !quiz) btn.classList.toggle('pret', !!tous);
}

const themeDe = i => QG.themes?.[QG.questions[i]?.theme_id] || null;
const themeDebut = i => i === 0 || QG.questions[i]?.theme_id !== QG.questions[i - 1]?.theme_id;
function nbQuestionsTheme(i) { let n = 0; while (QG.questions[i + n] && QG.questions[i + n].theme_id === QG.questions[i].theme_id) n++; return n; }

/** Écran d'intertitre au début de chaque thème (avec la consigne éventuelle). */
function dessinerIntroTheme() {
  const el = document.getElementById('qg-ecran'), th = themeDe(QG.idx), n = nbQuestionsTheme(QG.idx);
  const quiz = QG.seance.mode === 'quizbox';
  el.innerHTML = `
    <div class="qg-haut"><div id="qg-bandeau" class="qg-bandeau"></div>
      <div class="qg-infos"><span id="qg-compte"></span><span id="qg-chrono" class="qg-chrono"></span></div></div>
    <div class="qg-corps qg-intro" style="font-size:${QG.police}em">
      <div class="qg-compteur">Nouveau thème — ${n} question${n > 1 ? 's' : ''}</div>
      <div class="qg-enonce">${esc(th?.libelle || '')}</div>
      ${th?.consigne ? `<div class="qg-consigne">${esc(th.consigne)}</div>` : ''}
      <button class="principal gros" onclick="commencerThemeQg()">Commencer ▶</button>
    </div>
    <div class="qg-pied">
      <button onclick="changerPoliceQg(-0.15)">A−</button><button onclick="changerPoliceQg(0.15)">A+</button>
      <label class="qg-voix"><input type="checkbox" ${QG.voixActive ? 'checked' : ''} onchange="basculerVoixQg(this.checked)"> 🔊 Voix</label>
      <button onclick="lireIntroQg()">↻ Relire</button>
      ${quiz ? `<button onclick="questionPrecedenteQg()" ${QG.idx === 0 ? 'disabled' : ''}>◀ Précédente</button>` : ''}
      <button onclick="quitterEcranQg()">Quitter l'écran</button>
      <button class="danger" onclick="annulerQcmGeneral()">Annuler la séance</button>
    </div>`;
  majBandeauParticipants(); majChrono(); lireIntroQg();
}
function commencerThemeQg() { QG.introVus.add(QG.idx); QG.idxChrono = -1; dessinerEcranProjete(); }
function lireIntroQg() {
  if (!QG.voixActive || !('speechSynthesis' in window)) return;
  const th = themeDe(QG.idx); if (!th) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(`Thème : ${th.libelle}. ${th.consigne || ''}`);
  u.lang = 'fr-FR'; u.rate = QG.vitesse;
  const v = (speechSynthesis.getVoices() || []).find(x => /^fr/i.test(x.lang)); if (v) u.voice = v;
  speechSynthesis.speak(u);
}

function dessinerEcranProjete() {
  const el = document.getElementById('qg-ecran'); if (!el) return;
  if (QG.seance.etat === 'attente') return dessinerAccueilQg();
  if (themeDebut(QG.idx) && !QG.introVus.has(QG.idx)) return dessinerIntroTheme();
  if (QG.idxChrono !== QG.idx) { QG.idxChrono = QG.idx; QG.debutQ = Date.now(); }
  const se = QG.seance, q = QG.questions[QG.idx], n = QG.questions.length, quiz = se.mode === 'quizbox';
  const derniere = QG.idx >= n - 1;
  el.innerHTML = `
    <div class="qg-haut"><div id="qg-bandeau" class="qg-bandeau"></div>
      <div class="qg-infos"><span id="qg-compte"></span><span id="qg-chrono" class="qg-chrono"></span></div></div>
    <div class="qg-corps ${q?.illustration ? 'qg-avec-image' : ''}" style="font-size:${QG.police}em">
      <div class="qg-compteur">${esc(themeDe(QG.idx)?.libelle || libelleReferentiel(se.referentiel_code))} — Question ${QG.idx + 1} / ${n} <small style="opacity:.5">(${esc(q?.code || '')}${q?.illustration ? '' : ' · sans illustration'})</small></div>
      <div class="qg-enonce">${esc(q?.enonce || '')}</div>
      ${q?.illustration ? `<img class="qg-illustration" title="Toucher pour agrandir" onclick="this.classList.toggle('zoom')" onload="if(this.naturalHeight>this.naturalWidth*1.15)this.closest('.qg-corps')?.classList.add('qg-portrait')" src="${esc(q.illustration)}" alt="Illustration de la question" onerror="this.outerHTML='<p class=aide>⚠ Image introuvable : '+this.getAttribute('src')+' (fichier non publié sur GitHub ?)</p>'">` : ''}
      <div class="qg-vf"><span>VRAI</span><span>FAUX</span></div>
    </div>
    <div class="qg-pied">
      <button onclick="changerPoliceQg(-0.15)" title="Réduire le texte">A−</button>
      <button onclick="changerPoliceQg(0.15)" title="Agrandir le texte">A+</button>
      <label class="qg-voix"><input type="checkbox" ${QG.voixActive ? 'checked' : ''} onchange="basculerVoixQg(this.checked)"> 🔊 Voix</label>
      <input type="range" min="0.5" max="2" step="0.1" value="${QG.vitesse}" title="Vitesse de la voix" onchange="vitesseVoixQg(this.value)">
      <button onclick="lireQuestionQg(true)">↻ Relire</button>
      ${quiz ? '' : '<button onclick="afficherQrQg()">📱 QR code</button>'}
      ${quiz ? `<button onclick="questionPrecedenteQg()" ${QG.idx === 0 ? 'disabled' : ''}>◀ Précédente</button>` : ''}
      ${quiz ? `<button onclick="telechargerQuestionnaireQg()">⬇ Questionnaire</button>` : ''}
      ${derniere
        ? (quiz ? '<button class="principal" onclick="importerQuizbox()">📥 Importer les résultats Quizbox</button>'
                : '<button class="principal pret" id="qg-suivante" onclick="terminerQcmGeneral()">✔ Terminer</button>')
        : `<button class="principal" id="qg-suivante" onclick="questionSuivanteQg()">Question suivante ▶</button>`}
      ${derniere && !quiz ? '' : ''}
      <button onclick="quitterEcranQg()">Quitter l'écran</button>
      <button class="danger" onclick="annulerQcmGeneral()">Annuler la séance</button>
    </div>`;
  majBandeauParticipants(); majChrono();
  lireQuestionQg(false);
}

function changerPoliceQg(delta) { QG.police = Math.min(2.2, Math.max(0.7, QG.police + delta)); dessinerEcranProjete(); }

/* ---------- voix ---------- */
function lireQuestionQg(force) {
  if (!QG.voixActive || !('speechSynthesis' in window)) return;
  if (!force && QG.derniereLue === QG.idx) return;
  QG.derniereLue = QG.idx;
  const q = QG.questions[QG.idx]; if (!q) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(`Question ${QG.idx + 1}. ${q.enonce}`);
  u.lang = 'fr-FR'; u.rate = QG.vitesse;
  const v = (speechSynthesis.getVoices() || []).find(x => /^fr/i.test(x.lang));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
async function basculerVoixQg(on) {
  QG.voixActive = on;
  if (!on && 'speechSynthesis' in window) speechSynthesis.cancel();
  else lireQuestionQg(true);
  try { await rpc('caces_seance_reglages', { p_seance: QG.seance.id, p_voix: on, p_vitesse: null }); } catch (e) { /* réglage non critique */ }
}
async function vitesseVoixQg(v) {
  QG.vitesse = Number(v);
  lireQuestionQg(true);
  try { await rpc('caces_seance_reglages', { p_seance: QG.seance.id, p_voix: null, p_vitesse: QG.vitesse }); } catch (e) { /* idem */ }
}

/* ---------- navigation ---------- */
async function questionSuivanteQg(auto) {
  const quiz = QG.seance.mode === 'quizbox';
  if (!quiz) {
    const attente = QG.participants.filter(p => !p.valide).length;
    if (!auto && attente && !confirm(`${attente} participant(s) n'ont pas validé leur réponse (elle sera comptée telle quelle, ou fausse si vide). Passer à la question suivante ?`)) return;
    try { await rpc('caces_seance_avancer', { p_seance: QG.seance.id }); } catch (e) { return toast(e.message, 'erreur'); }
  }
  QG.idx = Math.min(QG.idx + 1, QG.questions.length - 1);
  dessinerEcranProjete();
}
function questionPrecedenteQg() { QG.idx = Math.max(0, QG.idx - 1); dessinerEcranProjete(); }

async function terminerQcmGeneral() {
  const attente = QG.participants.filter(p => !p.valide).length;
  if (!confirm(attente ? `${attente} participant(s) n'ont pas validé la dernière question. Terminer la séance pour tout le monde ?` : 'Terminer la séance et corriger tout le monde ?')) return;
  try {
    await rpc('caces_seance_terminer', { p_seance: QG.seance.id });
    fermerEcranProjete(); await afficherResultatsQg();
  } catch (e) { toast(e.message, 'erreur'); }
}
function quitterEcranQg() { fermerEcranProjete(); toast('Séance toujours en cours : reprends-la depuis « QCM général ».'); }
async function annulerQcmGeneral() {
  if (!confirm('Annuler la séance ? Les réponses données seront perdues.')) return;
  try { await rpc('caces_seance_annuler', { p_seance: QG.seance.id }); fermerEcranProjete(); toast('Séance annulée'); }
  catch (e) { toast(e.message, 'erreur'); }
}

async function afficherResultatsQg() {
  let l;
  try { l = (await rpc('caces_seance_resultats', { p_seance: QG.seance.id })) || []; }
  catch (e) { return toast(e.message, 'erreur'); }
  const themes = [...new Set(l.flatMap(r => (r.detail_themes || []).map(d => d.theme)))];
  const cel = (r, th) => { const d = (r.detail_themes || []).find(x => x.theme === th);
    return d ? `<td class="${d.note_pct < 50 ? 'note-faible' : ''}">${esc(d.note_pct)} % <small>(${esc(d.nb_correct)}/${esc(d.nb_questions)})</small></td>` : '<td>—</td>'; };
  ouvrirModale('Résultats du QCM général', `<div class="tableau-defilant"><table class="tableau"><thead><tr><th>Stagiaire</th>
    ${themes.map(t => `<th>${esc(t)}</th>`).join('')}<th>Note globale</th><th>Résultat</th></tr></thead><tbody>
    ${l.map(r => `<tr><td>${esc(r.nom)} ${esc(r.prenom)}</td>${themes.map(t => cel(r, t)).join('')}
      <td><b>${esc(r.score_global_pct)} %</b></td>
      <td>${r.reussi ? '<span class="etat">✔ Admis</span>' : '<span class="etat erreur">Non admis</span>'}</td></tr>`).join('')}</tbody></table></div>
    <p class="aide">Admis : note globale au seuil du référentiel et au moins 50 % dans chaque thème (en rouge : sous 50 %). La théorie est reportée sur la fiche de chaque stagiaire.</p>
    <div class="pied-modale"><button class="principal" onclick="fermerModale();rendreDetailSession($('#contenu'))">Fermer</button></div>`, { large: true });
}

/* ---------- Quizbox ---------- */
function telechargerQuestionnaireQg() {
  const lignes = [['N°', 'Question', 'Illustration']].concat(QG.questions.map((q, i) => [i + 1, q.enonce, q.illustration || '']));
  const ws = XLSX.utils.aoa_to_sheet(lignes), wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Questionnaire');
  XLSX.writeFile(wb, 'questionnaire-quizbox.xlsx');
}

function importerQuizbox() {
  ouvrirModale('Importer les résultats Quizbox', `
    <p>Exporte les résultats depuis Quizbox (fichier Excel ou CSV), puis choisis-le ici. Une ligne par boîtier, les réponses dans l'ordre des questions projetées.</p>
    <input type="file" id="qg-fichier" accept=".xlsx,.xls,.csv">
    <div id="qg-import-zone"></div>`, { large: true });
  $('#qg-fichier').addEventListener('change', async ev => {
    const f = ev.target.files[0]; if (!f) return;
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
    const lignes = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }).filter(r => r.some(c => String(c).trim() !== ''));
    if (lignes.length < 2) return toast('Fichier vide.', 'erreur');
    proposerCorrespondanceQuizbox(lignes);
  });
}
const _normRep = v => {
  const t = String(v ?? '').trim().toLowerCase();
  if (['v', 'vrai', 'true', '1', 'oui', 'a'].includes(t)) return true;
  if (['f', 'faux', 'false', '0', 'non', 'b'].includes(t)) return false;
  return null;
};
function proposerCorrespondanceQuizbox(lignes) {
  const ent = lignes[0].map(String), n = QG.questions.length;
  let cNum = ent.findIndex(h => /bo[iî]tier|t[ée]l[ée]commande|remote|n°|num|id/i.test(h)); if (cNum < 0) cNum = 0;
  const opt = (sel) => ent.map((h, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(h || 'Colonne ' + (i + 1))}</option>`).join('');
  $('#qg-import-zone').innerHTML = `
    <div class="grille-champs"><label>Colonne du n° de boîtier <select id="qg-c-num">${opt(cNum)}</select></label>
    <label>1ʳᵉ colonne de réponses (question 1) <select id="qg-c-rep">${opt(Math.min(cNum + 1, ent.length - 1))}</select></label></div>
    <p class="aide">${n} questions attendues. Valeurs reconnues : V / Vrai / A / 1 = vrai ; F / Faux / B / 0 = faux ; autre = sans réponse.</p>
    <div id="qg-apercu"></div>
    <div class="pied-modale"><button type="button" onclick="fermerModale()">Annuler</button>
      <button class="principal" id="qg-go-import">Importer et terminer</button></div>`;
  const construire = () => {
    const cn = Number($('#qg-c-num').value), cr = Number($('#qg-c-rep').value);
    return lignes.slice(1).map(r => ({ numero: parseInt(r[cn], 10),
      reponses: Array.from({ length: n }, (_, k) => _normRep(r[cr + k])) })).filter(x => Number.isFinite(x.numero));
  };
  const apercu = () => {
    const d = construire();
    $('#qg-apercu').innerHTML = `<p><b>${d.length}</b> boîtier(s) détecté(s). Aperçu :</p><table class="tableau"><tbody>
      ${d.slice(0, 4).map(x => `<tr><td>n° ${x.numero}</td><td>${x.reponses.slice(0, 12).map(v => v === true ? 'V' : v === false ? 'F' : '·').join(' ')} …</td></tr>`).join('')}</tbody></table>`;
  };
  apercu();
  $('#qg-c-num').addEventListener('change', apercu); $('#qg-c-rep').addEventListener('change', apercu);
  $('#qg-go-import').addEventListener('click', async ev => {
    const d = construire(); if (!d.length) return toast('Aucune ligne exploitable.', 'erreur');
    ev.target.disabled = true;
    try {
      const r = await rpc('caces_seance_importer', { p_seance: QG.seance.id, p_lignes: d });
      const inc = (r.numeros_inconnus || []);
      if (inc.length && !confirm(`Numéros de boîtier inconnus ignorés : ${inc.join(', ')}. Continuer et terminer avec les ${r.importes} autres ?`)) { ev.target.disabled = false; return; }
      await rpc('caces_seance_terminer', { p_seance: QG.seance.id });
      fermerEcranProjete(); fermerModale(); await afficherResultatsQg();
    } catch (e) { toast(e.message, 'erreur'); ev.target.disabled = false; }
  });
}


/* ---------- accès stagiaires (QR code + code de salle) ---------- */
function lienStagiaires() { return location.origin + location.pathname + '#stagiaire?code=' + encodeURIComponent(S.session.code_acces); }
function blocAccesStagiaires() {
  return `<div class="acces-qr"><div id="qr-test"></div>
    <div><div class="etiquette">Code à dicter en salle</div><div class="code-geant">${esc(S.session.code_acces)}</div>
    <code>${esc(lienStagiaires())}</code>
    ${S.session.statut !== 'ouverte' ? '<p class="erreur-discrete">⚠ L\'accès stagiaires est fermé : ouvre-le depuis le bouton « Ouvrir l\'accès stagiaires ».</p>' : ''}</div></div>`;
}
function dessinerQrTest() {
  try { if (typeof QRCode === 'undefined') throw 0; $('#qr-test').innerHTML = ''; new QRCode($('#qr-test'), { text: lienStagiaires(), width: 200, height: 200 }); }
  catch (e) { $('#qr-test').textContent = 'QR code indisponible'; }
}
function afficherQrQg() {
  ouvrirModale('Connexion des stagiaires', blocAccesStagiaires(), { large: true }); dessinerQrTest();
}

/* ---------- choix du type de test théorique ---------- */
function ouvrirTestTheorique() {
  const s = S.session, d = droitsSession(s);
  const peutGeneral = d.testeur && s.statut !== 'cloturee';
  const opt = (titre, texte, action, actif, raison) => `<button class="option-test" ${actif ? `onclick="${action}"` : 'disabled'}>
    <b>${titre}</b><span>${texte}</span>${actif ? '' : `<em>${raison}</em>`}</button>`;
  ouvrirModale('Test théorique', `<p>Quel type de passage ?</p><div class="options-test">
    ${opt('📱 QCM individuel sur téléphone', 'Chaque stagiaire passe le QCM à son rythme. Affiche le QR code et le code de la salle.', "choisirTestTheorique('individuel')", true)}
    ${opt('📺 QCM général — téléphones en télécommande', 'Questions projetées, chacun répond Vrai/Faux sur son téléphone puis valide.', "choisirTestTheorique('telephone')", peutGeneral, 'Réservé au testeur de la session (à affecter dans « Équipe »)')}
    ${opt('🎛 QCM général — boîtiers Quizbox', 'Questions projetées, réponses avec les boîtiers, import de l\'export Excel.', "choisirTestTheorique('quizbox')", peutGeneral, 'Réservé au testeur de la session (à affecter dans « Équipe »)')}
  </div>`);
}
function choisirTestTheorique(type) {
  if (type === 'individuel') {
    ouvrirModale('QCM individuel sur téléphone', `${blocAccesStagiaires()}
      <p class="aide">Les stagiaires scannent le QR code (ou saisissent le code), touchent leur nom puis passent le QCM.</p>`, { large: true });
    dessinerQrTest();
    return;
  }
  fermerModale(); ouvrirQcmGeneral(type);
}


/* ---------- chrono ---------- */
const _mmss = ms => { const t = Math.max(0, Math.floor(ms / 1000)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
function majChrono() {
  const c = document.getElementById('qg-chrono'); if (!c || QG.seance?.etat === 'attente') return;
  c.textContent = `⏱ question ${_mmss(Date.now() - (QG.debutQ || Date.now()))} · total ${_mmss(Date.now() - (QG.debutSeance || Date.now()))}`;
}

/* ---------- passage automatique quand tout le monde a validé ---------- */
function verifierAvanceAuto() {
  const se = QG.seance;
  if (!se || se.mode !== 'telephone' || se.etat !== 'en_cours' || !QG.participants.length) return;
  if (!QG.participants.every(p => p.valide) || QG.avance === QG.idx) return;
  QG.avance = QG.idx;
  const idx = QG.idx;
  if (idx >= QG.questions.length - 1) { toast('Tout le monde a validé : tu peux terminer.'); return; }
  setTimeout(() => { if (QG.enCours && QG.idx === idx) questionSuivanteQg(true); }, 900);
}

/* ---------- écran d'accueil (salle d'attente) ---------- */
function dessinerAccueilQg() {
  const el = document.getElementById('qg-ecran'); if (!el) return;
  const se = QG.seance, ouverte = S.session.statut === 'ouverte';
  el.innerHTML = `
    <div class="qg-haut"><div class="qg-infos"><span>${esc(libelleReferentiel(se.referentiel_code))} — salle d'attente</span><span id="qg-compte"></span></div></div>
    <div class="qg-corps qg-accueil">
      <div class="qg-accueil-acces">
        <div id="qr-accueil" class="qg-qr"></div>
        <div><div class="qg-etiquette">Code de la salle</div><div class="qg-code">${esc(S.session.code_acces)}</div>
          <div class="qg-etiquette">Scanne le QR code, touche ton nom et attends le démarrage.</div></div>
      </div>
      ${ouverte ? '' : `<div class="qg-alerte">⚠ L'accès stagiaires est fermé : personne ne peut se connecter.
        <button class="principal" onclick="ouvrirAccesQg()">▶ Ouvrir l'accès stagiaires</button></div>`}
      <div id="qg-bandeau" class="qg-bandeau qg-bandeau-centre"></div>
    </div>
    <div class="qg-pied">
      <button class="principal pret" onclick="lancerQcmGeneral()">▶ Démarrer le test</button>
      <button onclick="quitterEcranQg()">Quitter l'écran</button>
      <button class="danger" onclick="annulerQcmGeneral()">Annuler la séance</button>
    </div>`;
  try { new QRCode(document.getElementById('qr-accueil'), { text: lienStagiaires(), width: 380, height: 380 }); }
  catch (e) { document.getElementById('qr-accueil').textContent = 'QR code indisponible'; }
  majBandeauParticipants();
}
async function ouvrirAccesQg() {
  const { error } = await sb.from('sessions_formation').update({ statut: 'ouverte' }).eq('id', S.session.id);
  if (error) return erreurSupabase('Ouverture de l\'accès stagiaires', error);
  S.session.statut = 'ouverte'; toast('Accès stagiaires ouvert'); dessinerEcranProjete();
}
async function lancerQcmGeneral() {
  const absents = QG.participants.filter(p => !p.connecte).length;
  if (absents && !confirm(`${absents} téléphone(s) ne sont pas connectés. Démarrer quand même ?`)) return;
  try {
    await rpc('caces_seance_lancer', { p_seance: QG.seance.id });
    QG.seance.etat = 'en_cours'; QG.debutSeance = Date.now(); QG.idxChrono = -1; QG.avance = -1;
    dessinerEcranProjete();
  } catch (e) { toast(e.message, 'erreur'); }
}
