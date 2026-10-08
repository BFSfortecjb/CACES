/* =====================================================================
   CA_pratique.js — Évaluation pratique par le TESTEUR.
   Présentation calquée sur la fiche officielle d'évaluation du savoir-faire
   pratique : thèmes → points d'évaluation numérotés → critères avec barème,
   colonnes d'engin (ex. PEMP 1A / 3A). Optimisée tablette : gros boutons à
   toucher, total par thème, barre de résultat toujours visible.

   Réussite (identique dans R482A, R485, R486A, R489) :
     - note globale ≥ 70/100,
     - ET note ≥ moyenne (50 %) pour chacun des THÈMES,
     - ET note > 0 pour chacun des POINTS D'ÉVALUATION (somme du point, pas
       chaque critère),
     - (R482A) aucun critère éliminatoire à 0.
   Options (porte-engins, télécommande) : +0,5 UT chacune, comptées dans les
   limites journalières (refus par la base).
   ===================================================================== */

const OPTIONS_PRATIQUE = {
  porte_engins: { libelle: 'Porte-engins', ut: 0.5, themes: ['opt_porte_engins'] },
  telecommande: { libelle: 'Télécommande', ut: 0.5, themes: ['opt_telecommande'] },
};
const LIBELLES_THEMES_PRATIQUE = {
  prise_poste: 'Prise de poste et mise en service', adequation: 'Adéquation', conduite: 'Conduite',
  manoeuvres: 'Manœuvres', fin_poste: 'Fin de poste – maintenance', conduite_circulation: 'Conduite et circulation',
  chargement_porte_engins: 'Chargement sur porte-engins (option)',
};
const libTheme = c => c.theme_libelle || LIBELLES_THEMES_PRATIQUE[c.theme_code] || c.theme_code.replace(/_/g, ' ');
function optionsPossibles(referentiel) { return referentiel === 'R482A' || referentiel === 'R482' ? ['porte_engins', 'telecommande'] : []; }

/** Calcule le résultat selon les règles officielles. points[id] = nombre ou undefined (non noté). */
function calculerPratique(tous, points, opt = {}) {
  // Options (grilles de 50 points, réussies à part : ≥ 70 %, chaque thème ≥ 50 %, chaque point > 0) : calculées séparément,
  // elles n'entrent pas dans la note de la catégorie et un échec n'invalide pas le CACES (l'option n'est simplement pas accordée).
  const estOpt = c => String(c.theme_code).startsWith('opt_');
  const criteres = tous.filter(c => !estOpt(c));
  const optionsRes = {};
  Object.keys(OPTIONS_PRATIQUE).forEach(k => {
    const cs = tous.filter(c => estOpt(c) && OPTIONS_PRATIQUE[k].themes.includes(c.theme_code));
    if (!cs.length) return;
    const val = c => Math.max(0, Math.min(c.bareme_points, Number(points[c.id]) || 0));
    const o = cs.reduce((a, c) => a + val(c), 0), b = cs.reduce((a, c) => a + c.bareme_points, 0), pts = {};
    cs.forEach(c => { const x = (pts[c.point_numero] = pts[c.point_numero] || { o: 0, b: 0 }); x.o += val(c); x.b += c.bareme_points; });
    optionsRes[k] = { obtenu: o, bareme: b, nonNotes: cs.filter(c => points[c.id] === undefined).length,
      reussi: b > 0 && o * 100 >= 70 * b && Object.values(pts).every(x => x.o > 0) };
  });
  const val = c => opt.zeroPoints && opt.zeroPoints.has(c.point_numero) ? 0 : Math.max(0, Math.min(c.bareme_points, Number(points[c.id]) || 0));
  let obtenu = 0, bareme = 0;
  const themes = {}, pts = {};
  let elimNul = false, nonNotes = 0, pointsSansNumero = false;
  criteres.forEach(c => {
    const v = val(c);
    obtenu += v; bareme += c.bareme_points;
    if (points[c.id] === undefined && !(opt.zeroPoints && opt.zeroPoints.has(c.point_numero))) nonNotes++;
    const th = (themes[c.theme_code] = themes[c.theme_code] || { o: 0, b: 0, lib: libTheme(c) });
    th.o += v; th.b += c.bareme_points;
    if (c.point_numero == null) pointsSansNumero = true;
    else { const p = (pts[c.point_numero] = pts[c.point_numero] || { o: 0, b: 0 }); p.o += v; p.b += c.bareme_points; }
    if (c.eliminatoire && points[c.id] !== undefined && v <= 0) elimNul = true;
  });
  let score = bareme ? Math.round(1000 * obtenu / bareme) / 10 : 0;
  // Catégorie à plusieurs engins évalués chacun sur 100 (ex. R489 cat. 7, chariots N°1 et N°2) :
  // chaque engin doit atteindre 70 ; la note affichée est la plus basse des deux.
  const parVariante = {};
  criteres.forEach(c => { if (c.variante) { const x = (parVariante[c.variante] = parVariante[c.variante] || { o: 0, b: 0 }); x.o += val(c); x.b += c.bareme_points; } });
  const complets = Object.keys(parVariante).filter(k => parVariante[k].b === 100);
  const chacun = complets.length >= 2 && complets.length === Object.keys(parVariante).length;
  let varianteEchec = false;
  if (chacun) {
    const notes = complets.map(k => parVariante[k].o);
    score = Math.min(...notes); varianteEchec = notes.some(n => n < 70);
  }
  const themesEchec = Object.keys(themes).filter(k => themes[k].b && 2 * themes[k].o < themes[k].b);
  const pointsZero = Object.keys(pts).filter(k => pts[k].o <= 0).map(Number);
  nonNotes += Object.values(optionsRes).reduce((a, x) => a + x.nonNotes, 0);
  return { score, obtenu, bareme, themes, pts, themesEchec, pointsZero, elimNul, nonNotes, pointsSansNumero, optionsRes,
    forceEchec: !!opt.forceEchec,
    reussi: score >= 70 && !varianteEchec && !themesEchec.length && !pointsZero.length && !elimNul && !opt.forceEchec };
}

async function ouvrirPratique(stagiaireId) {
  const { data: st, error } = await sb.from('stagiaires')
    .select('id, nom, prenom, groupe_id, stagiaire_categories(referentiel_code, categorie_code, pratique_validee)').eq('id', stagiaireId).single();
  if (error) return erreurSupabase('Lecture du stagiaire', error);
  const cats = st.stagiaire_categories || [];
  if (!cats.length) return toast('Ce stagiaire n\'a aucune catégorie visée.', 'erreur');
  ouvrirModale(`Évaluation pratique — ${st.nom} ${st.prenom}`, `
    <div class="onglets-fise">${cats.map((c, i) => `<button type="button" class="${i === 0 ? 'principal' : ''}" data-cat="${i}">
      ${esc(c.referentiel_code)} ${esc(c.categorie_code)}</button>`).join(' ')}</div>
    <div id="pratique-contenu"></div>`, { large: true, verrou: true });
  $$('.onglets-fise button').forEach(b => b.addEventListener('click', () => {
    $$('.onglets-fise button').forEach(x => x.classList.remove('principal'));
    b.classList.add('principal');
    afficherPratique(st, cats[Number(b.dataset.cat)]);
  }));
  afficherPratique(st, cats[0]);
}

/** 00:00 / 00:00:00 */
const fmtDuree = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(x).padStart(2, '0'); };
const PHASES = [['t1', 'T1 · Prise de poste'], ['t2', 'T2 · Production'], ['t3', 'T3 · Fin de poste']];

/** Déroulé : consignes éliminatoires → engin + examen d'adéquation → test chronométré (grille + crayon de notation). */
async function afficherPratique(st, cat) {
  const zone = $('#pratique-contenu');
  zone.innerHTML = '<p class="chargement">Chargement…</p>';
  const [{ data: criteres, error }, { data: passages }, { data: liens }, { data: ops }, { data: adeqs }] = await Promise.all([
    sb.from('criteres_pratique').select('*').eq('referentiel_code', cat.referentiel_code)
      .eq('categorie_code', cat.categorie_code).order('ordre'),
    sb.from('epreuves_pratique').select('id, date_passage, score_global, reussi')
      .eq('stagiaire_id', st.id).eq('referentiel_code', cat.referentiel_code).eq('categorie_code', cat.categorie_code)
      .order('date_passage', { ascending: false }),
    sb.from('session_engins').select('engin_id, engins(*)').eq('session_id', S.session.id),
    sb.from('operations_eliminatoires').select('*').eq('referentiel_code', cat.referentiel_code).eq('actif', true).order('ordre'),
    sb.from('adequations_session').select('*').eq('session_id', S.session.id),
  ]);
  if (error) return erreurSupabase('Lecture de la grille', error);
  if (!criteres.length) { zone.innerHTML = '<p class="erreur-discrete">Aucune grille de critères pour cette catégorie : à compléter par l\'administrateur.</p>'; return; }

  // Variantes : « GROUPE » (engin évalué à part, ex. 1A / 3A) ou « GROUPE/TYPE » (le testeur choisit le type
  // d'engin du groupe, ex. N2/MB, N2/CH, N2/CP ou CA/CP : seuls les critères du type choisi sont évalués).
  const groupes = [...new Set(criteres.map(c => c.variante).filter(Boolean).map(v => v.split('/')[0]))];
  const typesDuGroupe = g => [...new Set(criteres.map(c => c.variante).filter(v => v && v.startsWith(g + '/')).map(v => v.split('/')[1]))];
  const typeChoisi = {};           // groupe -> type d'engin choisi
  const variantes = groupes;
  const dispo = Object.keys(OPTIONS_PRATIQUE).filter(k => criteres.some(c => OPTIONS_PRATIQUE[k].themes.includes(c.theme_code)));   // options = grilles « opt_* » de la catégorie
  const adeq = Object.fromEntries((adeqs || []).map(a => [a.engin_id, a]));
  const elim = [];                 // opérations éliminatoires relevées : [{id, libelle, point}]
  const points = {};               // id critère -> note (absent = non noté)
  const choisies = new Set();      // options
  let consignesVues = !(ops || []).length;
  const chrono = Object.fromEntries(PHASES.map(([k]) => [k, { ms: 0, depuis: null, valide: false }]));
  const ms = k => chrono[k].ms + (chrono[k].depuis ? Date.now() - chrono[k].depuis : 0);
  const refMin = (S.referentiel.categories.find(c => c.referentiel_code === cat.referentiel_code && c.code === cat.categorie_code) || {}).temps_reference_min || null;
  const totalValideMs = () => PHASES.reduce((s2, [k]) => s2 + (chrono[k].valide ? chrono[k].ms : 0), 0);
  const tempsDepasse = () => !!refMin && PHASES.every(([k]) => chrono[k].valide) && totalValideMs() > 1.3 * refMin * 60000;

  const actifs = () => criteres.filter(c => {
    if (c.variante && c.variante.includes('/')) { const [g, t] = c.variante.split('/'); if (typesDuGroupe(g).length > 1 && (typeChoisi[g] || typesDuGroupe(g)[0]) !== t) return false; }
    return true;
  }).filter(c =>
    !Object.entries(OPTIONS_PRATIQUE).some(([k, o]) => o.themes.includes(c.theme_code) && !choisies.has(k)));
  const optCalc = () => ({ zeroPoints: new Set(elim.map(e => Number(e.point)).filter(Boolean)), forceEchec: elim.length > 0 });
  const teinte = (n, b, plein) => `background:hsl(${b ? Math.round(120 * n / b) : 0} ${plein ? 70 : 60}% ${plein ? 42 : 88}%);${plein ? 'color:#fff;' : ''}`;
  const optEngin = '<option value="">— choisir l\'engin —</option>' + (liens || []).map(l =>
    `<option value="${l.engin_id}">${esc([l.engins.designation, l.engins.marque, l.engins.modele].filter(Boolean).join(' '))} (${esc(l.engins.numero_serie || '')})</option>`).join('');
  const enginParId = id => (liens || []).map(l => l.engins).find(e => e.id === id);

  zone.innerHTML = `
    ${(passages || []).length ? `<p class="aide">Passages précédents : ${(passages || []).map(p =>
      `${new Date(p.date_passage).toLocaleDateString('fr-FR')} — ${p.score_global}/100 ${p.reussi ? 'ADMIS' : 'NON ADMIS'}`).join(' ; ')}</p>` : ''}
    <div id="prat-consignes"></div>
    <div id="prat-prepa" hidden>
      <div class="grille-2">
        ${(variantes.length ? variantes : ['']).map((v, i) => `<label>Engin utilisé${v ? ' — ' + esc(v) : ''}
          <select class="prat-engin" data-i="${i}">${optEngin}</select></label>
          ${v && typesDuGroupe(v).length > 1 ? `<label>Type d'engin${' — ' + esc(v)}
            <select class="prat-type" data-g="${esc(v)}"><option value="">— choisir —</option>${typesDuGroupe(v).map(t => `<option value="${esc(t)}">${esc(libelleTypeEngin(cat.categorie_code, t))}</option>`).join('')}</select></label>` : ''}`).join('')}
        ${dispo.length ? `<fieldset><legend>Options passées (+0,5 UT chacune)</legend>${dispo.map(k =>
          `<label class="case"><input type="checkbox" data-opt="${k}"> ${esc(OPTIONS_PRATIQUE[k].libelle)}</label>`).join('')}</fieldset>` : ''}
      </div>
      ${(liens || []).length ? '' : '<p class="aide">Aucun engin déclaré dans la session (bouton « Renseigner les engins »).</p>'}
      <div id="prat-adeq"></div>
      ${S.profil?.role === 'admin' ? `<label class="case prat-essai"><input type="checkbox" id="prat-essai">
        Mode essai (administrateur) : passer l'engin et l'examen d'adéquation pour voir l'épreuve. Le résultat sera marqué « essai ».</label>` : ''}
    </div>
    <div id="prat-corps" hidden>
      <div class="prat-chrono" id="prat-chrono"></div>
      <div id="prat-avert"></div>
      <div id="prat-grille"></div>
      <section class="prat-elim" id="prat-elim" hidden>
        <h3>Opérations ou manœuvres éliminatoires</h3>
        <p>Leur réalisation, qui expose à des risques graves, entraîne la note 0 au point d'évaluation concerné et donc l'échec à l'évaluation pratique.</p>
        ${(ops || []).map(o => `<div class="elim-ligne"><label><input type="checkbox" data-elim="${o.id}"> ${esc(o.libelle)}</label>
          <select data-elim-pt="${o.id}" hidden><option value="">Point concerné…</option>
          ${[...new Set(criteres.map(c => c.point_numero).filter(x => x != null))].sort((a, b) => a - b).map(n => `<option value="${n}">Point ${n}</option>`).join('')}</select></div>`).join('')}
      </section>
    </div>
    <div class="prat-barre" id="prat-barre" hidden><div class="verdict" id="prat-verdict"></div>
      <div>${(ops || []).length ? '<button type="button" id="prat-btn-elim" class="danger">⚠ Éliminatoire</button> ' : ''}
      <button class="principal" id="prat-enregistrer">Enregistrer le résultat</button></div>
      <div class="detail" id="prat-detail"></div></div>
    <div class="prat-feuille" id="prat-feuille" hidden></div>`;

  /* ---------- 1. consignes (cas éliminatoires), puis préparation ---------- */
  function etape() {
    const c = $('#prat-consignes');
    if (!consignesVues) {
      $('#prat-prepa').hidden = true; $('#prat-corps').hidden = true; $('#prat-barre').hidden = true;
      c.innerHTML = `<section class="prat-elim"><h3>Opérations ou manœuvres éliminatoires</h3>
        <p>La réalisation des opérations ou des manœuvres suivantes, qui exposent à des risques graves, a pour conséquence l'obtention de la note 0 au point d'évaluation concerné et donc l'échec à l'évaluation pratique :</p>
        <ul>${ops.map(o => `<li>${esc(o.libelle)}</li>`).join('')}</ul>
        <button type="button" class="principal" id="prat-compris">Consignes lues au candidat — continuer</button></section>`;
      $('#prat-compris').addEventListener('click', () => { consignesVues = true; etape(); });
      return;
    }
    c.innerHTML = ''; $('#prat-prepa').hidden = false; majAdeq();
  }

  /* ---------- 2. engin + examen d'adéquation ---------- */
  let visiteOk = true;
  visitePrealableOk().then(v => { visiteOk = v; if (!v && $('#prat-prepa') && !$('#prat-prepa').hidden) majAdeq(); });
  function majAdeq() {
    const ids = $$('.prat-engin').map(s => s.value);
    const typesOk = groupes.every(g => typesDuGroupe(g).length <= 1 || typeChoisi[g]);
    const tous = ids.length && ids.every(Boolean) && typesOk;
    const essai = !!$('#prat-essai')?.checked;
    const ok = essai || (tous && visiteOk && ids.every(id => adeq[id]?.conforme));
    const zoneA = $('#prat-adeq');
    $('#prat-corps').hidden = !ok; $('#prat-barre').hidden = !ok;
    zoneA.innerHTML = !essai && !visiteOk ? '<div class="adeq-banniere ko">VISITE PRÉALABLE du site client non conforme ou non faite — pratique bloquée (voir la fiche de la session).</div>' : essai ? '<div class="adeq-banniere ko">MODE ESSAI — aucun engin ni examen d\'adéquation requis (résultat marqué « essai »).</div>' : !tous ? '<div class="adeq-banniere ko">Choisis l\'engin utilisé (et son type) pour démarrer.</div>'
      : [...new Set(ids)].map(id => { const e = enginParId(id), a = adeq[id];
          return `<div class="adeq-banniere ${a?.conforme ? 'ok' : 'ko'}">EXAMEN D'ADÉQUATION : ${a ? (a.conforme ? 'OUI' : 'NON CONFORME — test bloqué') : 'à effectuer'}
            — ${esc([e.designation, e.marque, e.modele].filter(Boolean).join(' '))}
            <button type="button" data-adeq="${id}">${a ? 'Revoir' : 'Examen d\'adéquation'}</button></div>`; }).join('');
    $$('[data-adeq]', zoneA).forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.adeq;
      $('#prat-corps').hidden = true; $('#prat-barre').hidden = true;
      rendreAdequation(zoneA, S.session.id, enginParId(id), adeq[id], async fini => {
        if (fini) { const { data } = await sb.from('adequations_session').select('*').eq('session_id', S.session.id).eq('engin_id', id).single(); if (data) adeq[id] = data; }
        majAdeq();
      });
    }));
    if (ok) { dessinerChrono(); dessiner(); }
  }

  /* ---------- 3. chronomètres T1 / T2 / T3, validés par le testeur ---------- */
  function dessinerChrono() {
    const z = $('#prat-chrono');
    const total = PHASES.reduce((s, [k]) => s + (chrono[k].valide ? chrono[k].ms : 0), 0);
    z.innerHTML = `<div class="chrono-phases">${PHASES.map(([k, lib]) => { const c = chrono[k];
      return `<div class="chrono ${c.valide ? 'valide' : c.depuis ? 'marche' : ''}"><div class="chrono-lib">${lib}</div>
        <div class="chrono-temps" data-chrono="${k}">${fmtDuree(ms(k) / 1000)}</div>
        <div class="chrono-btns">${c.valide
          ? `<button type="button" data-ch="${k}" data-act="rouvrir">Corriger</button>`
          : `<button type="button" data-ch="${k}" data-act="${c.depuis ? 'pause' : 'start'}">${c.depuis ? '⏸ Pause' : '▶ ' + (c.ms ? 'Reprendre' : 'Démarrer')}</button>
             <button type="button" class="principal" data-ch="${k}" data-act="valider" ${ms(k) ? '' : 'disabled'}>✔ Valider</button>
             <button type="button" class="icone" data-ch="${k}" data-act="saisie" title="Saisir à la main (minutes)">✎</button>`}</div></div>`; }).join('')}
      <div class="chrono total"><div class="chrono-lib">Durée totale validée</div><div class="chrono-temps" id="chrono-total">${fmtDuree(total / 1000)}</div></div></div>
      <p class="aide">${refMin ? `Temps de référence : <b>${refMin} min</b> — limite à 130 % : <b>${(refMin * 1.3).toFixed(1)} min</b>.${tempsDepasse() ? ' <b style="color:#b00020">⚠ Durée dépassée : une note 0 sera à attribuer au point concerné à l\'enregistrement.</b>' : ''}`
        : 'Temps de référence non défini pour cette catégorie (à renseigner dans Catégories) : règle des 130 % non contrôlée automatiquement.'}</p>`;
    $$('[data-ch]', z).forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.ch, c = chrono[k];
      if (b.dataset.act === 'start') c.depuis = Date.now();
      else if (b.dataset.act === 'pause') { c.ms += Date.now() - c.depuis; c.depuis = null; }
      else if (b.dataset.act === 'valider') { if (c.depuis) { c.ms += Date.now() - c.depuis; c.depuis = null; } c.valide = true; }
      else if (b.dataset.act === 'rouvrir') c.valide = false;
      else if (b.dataset.act === 'saisie') { const m = prompt('Durée en minutes :'); if (m === null) return;
        const n = Number(String(m).replace(',', '.')); if (!(n >= 0)) return toast('Durée invalide.', 'erreur');
        if (c.depuis) c.depuis = null; c.ms = Math.round(n * 60000); c.valide = true; }
      if (!tempsDepasse()) for (let i = elim.length - 1; i >= 0; i--) if (elim[i].type === 'temps') elim.splice(i, 1);   // durée corrigée : la note 0 « temps » tombe
      dessinerChrono(); dessiner();
    }));
  }
  const minuteur = setInterval(() => {
    if (!document.body.contains(zone)) return clearInterval(minuteur);
    PHASES.forEach(([k]) => { const e = $(`[data-chrono="${k}"]`); if (e && chrono[k].depuis) e.textContent = fmtDuree(ms(k) / 1000); });
  }, 500);

  /* ---------- 4. grille : lignes compactes + feuille de notation (crayon) ---------- */
  function dessiner() {
    const liste = actifs(), r = calculerPratique(liste, points, optCalc());
    const ordreThemes = [...new Set(liste.map(c => c.theme_code))];
    $('#prat-grille').innerHTML = ordreThemes.map(tc => {
      const cs = liste.filter(c => c.theme_code === tc), th = r.themes[tc];
      const variante = [...new Set(cs.map(c => c.variante).filter(Boolean))][0];
      const groupes = [];
      cs.forEach(c => { const k = c.point_numero ?? ('x' + c.id); let g = groupes.find(x => x.k === k);
        if (!g) groupes.push(g = { k, pt: c.point_numero, cs: [] }); g.cs.push(c); });
      return `<section class="prat-theme"><header>
        <span>${esc(libTheme(cs[0]))}${variante ? ` <span class="prat-badge">${esc(variante)}</span>` : ''}</span>
        <span class="total-theme ${2 * th.o < th.b ? 'bas' : ''}">${th.o} / ${th.b} pts</span></header>
        ${groupes.map(g => {
          const zero = g.pt != null && r.pointsZero.includes(g.pt);
          return `<div class="prat-point ${zero ? 'zero' : ''}"><div class="num">${g.pt != null ? 'Point<b>' + g.pt + '</b>' : ''}</div><div>
          ${g.cs.map(c => { const v = points[c.id], force = optCalc().zeroPoints.has(c.point_numero);
            return `<div class="prat-ligne ${v === undefined && !force ? 'non-note' : ''}" data-ouvrir="${c.id}" role="button" tabindex="0">
              <div class="lib">${esc(c.libelle)}${c.eliminatoire ? ' <span class="prat-badge" style="background:#fbe3e3">éliminatoire</span>' : ''}${c.en_continu ? ' <span class="prat-badge">en continu</span>' : ''}</div>
              <div class="prat-note-chip" style="${force ? teinte(0, 1, true) : v === undefined ? '' : teinte(v, c.bareme_points, true)}">${force ? 0 : v ?? '–'}<small> / ${c.bareme_points}</small></div>
              <div class="prat-crayon" aria-hidden="true">✎</div></div>`; }).join('')}
          </div></div>`; }).join('')}
      </section>`;
    }).join('');
    $$('[data-ouvrir]').forEach(l => {
      const ouvrir = () => ouvrirFeuille(l.dataset.ouvrir);
      l.addEventListener('click', ouvrir); l.addEventListener('keydown', e => { if (e.key === 'Enter') ouvrir(); });
    });
    majResultat(r);
  }
  function majResultat(r) {
    r = r || calculerPratique(actifs(), points, optCalc());
    const v = $('#prat-verdict'); if (!v) return;
    v.className = 'verdict ' + (r.reussi ? 'ok' : 'ko');
    v.textContent = `${r.score} / 100 — ${r.reussi ? 'ADMIS' : 'NON ADMIS'}`;
    const d = [];
    if (r.nonNotes) d.push(`${r.nonNotes} critère(s) non noté(s)`);
    if (r.pointsZero.length) d.push('point(s) à 0 : ' + r.pointsZero.join(', '));
    if (r.themesEchec.length) d.push('thème(s) sous la moyenne : ' + r.themesEchec.map(k => r.themes[k].lib).join(', '));
    Object.entries(r.optionsRes || {}).forEach(([k, x]) => d.push(`option ${OPTIONS_PRATIQUE[k].libelle} : ${x.obtenu}/${x.bareme} ${x.reussi ? 'acquise' : 'non acquise'}`));
    if (elim.length) d.push('opération éliminatoire relevée');
    if (r.score < 70) d.push('note globale sous 70');
    $('#prat-detail').textContent = d.join(' · ');
    $('#prat-avert').innerHTML = r.pointsSansNumero
      ? '<p class="erreur-discrete">Les points d\'évaluation de cette grille ne sont pas encore renseignés : la règle « note > 0 à chaque point » n\'est pas vérifiée. À compléter par l\'administrateur.</p>' : '';
  }

  /** Feuille de notation : barre graduée colorée, avance au critère suivant après choix. */
  function ouvrirFeuille(idCrit) {
    const liste = actifs().filter(c => !optCalc().zeroPoints.has(c.point_numero));
    let idx = liste.findIndex(c => String(c.id) === String(idCrit));
    if (idx < 0) return;
    const f = $('#prat-feuille'); f.hidden = false;
    function afficher() {
      const c = liste[idx], v = points[c.id], b = c.bareme_points;
      f.innerHTML = `<div class="feuille-fond" data-fermer></div><div class="feuille">
        <div class="feuille-haut"><span>${esc(libTheme(c))}${c.point_numero != null ? ' · point ' + c.point_numero : ''} — ${idx + 1} / ${liste.length}</span>
          <button type="button" class="icone" data-fermer title="Fermer">✕</button></div>
        <p class="feuille-lib">${esc(c.libelle)}</p>
        <div class="feuille-bande">${Array.from({ length: b + 1 }, (_, n) =>
          `<button type="button" data-n="${n}" style="${teinte(n, b, v === n)}" class="${v === n ? 'choisi' : ''}">${n}</button>`).join('')}</div>
        <div class="feuille-nav"><button type="button" data-nav="-1" ${idx ? '' : 'disabled'}>◀ Précédent</button>
          <button type="button" data-nav="1" ${idx < liste.length - 1 ? '' : 'disabled'}>Suivant ▶</button></div></div>`;
      $$('[data-fermer]', f).forEach(e => e.addEventListener('click', fermer));
      $$('[data-nav]', f).forEach(e => e.addEventListener('click', () => { idx += Number(e.dataset.nav); afficher(); }));
      $$('[data-n]', f).forEach(e => e.addEventListener('click', () => {
        points[c.id] = Number(e.dataset.n); dessiner();
        if (idx < liste.length - 1) { idx++; setTimeout(afficher, 120); } else fermer();
      }));
    }
    function fermer() { f.hidden = true; f.innerHTML = ''; }
    afficher();
  }

  /* ---------- événements ---------- */
  // Le type d'engin (MB/CH/CP…) est déduit de la fiche de l'engin choisi ; le testeur peut le corriger
  $$('.prat-engin').forEach(s => s.addEventListener('change', () => {
    const g = variantes[Number(s.dataset.i)], t = (enginParId(s.value) || {}).type_engin;
    if (g && t && typesDuGroupe(g).length > 1) {
      const types = typesDuGroupe(g), [tc, tt] = String(t).includes(':') ? String(t).split(':') : [null, t];
      const v = (tc && tc !== cat.categorie_code) ? null : (types.find(x => x === tt) || types.find(x => x.toLowerCase() === String(tt).toLowerCase()));
      const sel = document.querySelector(`.prat-type[data-g="${g}"]`);
      if (v && sel) { sel.value = v; typeChoisi[g] = v; }
    }
    majAdeq();
  }));
  $$('.prat-type').forEach(s => s.addEventListener('change', () => { typeChoisi[s.dataset.g] = s.value; majAdeq(); }));
  const cEssai = $('#prat-essai'); if (cEssai) cEssai.addEventListener('change', majAdeq);
  const bElim = $('#prat-btn-elim'); if (bElim) bElim.addEventListener('click', () => { const e = $('#prat-elim'); e.hidden = !e.hidden; if (!e.hidden) e.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  $$('[data-elim]').forEach(i => i.addEventListener('change', () => {
    const id = Number(i.dataset.elim), sel = $(`[data-elim-pt="${id}"]`);
    sel.hidden = !i.checked;
    const k = elim.findIndex(e => e.id === id);
    if (i.checked && k < 0) elim.push({ id, libelle: (ops.find(o => o.id === id) || {}).libelle, point: null });
    if (!i.checked && k >= 0) elim.splice(k, 1);
    dessiner();
  }));
  $$('[data-elim-pt]').forEach(s => s.addEventListener('change', () => {
    const e = elim.find(x => x.id === Number(s.dataset.elimPt)); if (e) e.point = s.value || null; dessiner();
  }));
  $$('[data-opt]').forEach(i => i.addEventListener('change', () => { i.checked ? choisies.add(i.dataset.opt) : choisies.delete(i.dataset.opt); dessiner(); }));

  /** Dépassement de 130 % du temps de référence : le testeur désigne le point d'évaluation à mettre à 0. */
  function demanderPointTemps() {
    const f = $('#prat-feuille'); f.hidden = false;
    const pts = [...new Set(actifs().map(c => c.point_numero).filter(x => x != null))].sort((a, b) => a - b);
    f.innerHTML = `<div class="feuille-fond" data-fermer></div><div class="feuille"><div class="feuille-haut"><span>Durée > 130 % du temps de référence</span></div>
      <p class="feuille-lib">Durée totale ${fmtDuree(totalValideMs() / 1000)} pour un temps de référence de ${refMin} min. Règle officielle : note 0 au(x) point(s) d'évaluation concerné(s), donc échec à l'évaluation pratique.</p>
      <label>Point d'évaluation concerné <select id="temps-pt"><option value="">— choisir —</option>${pts.map(n => `<option value="${n}">Point ${n}</option>`).join('')}</select></label>
      <div class="feuille-nav"><button type="button" data-fermer>Annuler</button><button type="button" class="principal" id="temps-ok">Appliquer la note 0</button></div></div>`;
    $$('[data-fermer]', f).forEach(e => e.addEventListener('click', () => { f.hidden = true; f.innerHTML = ''; }));
    $('#temps-ok', f).addEventListener('click', () => {
      const n = Number($('#temps-pt', f).value); if (!n) return toast('Choisis le point concerné.', 'erreur');
      elim.push({ id: null, type: 'temps', libelle: 'Dépassement de 130 % du temps de référence', point: n });
      f.hidden = true; f.innerHTML = ''; dessiner(); toast('Note 0 appliquée au point ' + n + ' — vérifie le résultat puis enregistre.');
    });
  }

  /** Récapitulatif avant enregistrement (le résultat est définitif) : résolu à true si le testeur confirme. */
  function recapitulatif(r) {
    return new Promise(resolve => {
      const f = $('#prat-feuille'); f.hidden = false;
      const themes = Object.values(r.themes).map(t => `<tr class="${2 * t.o < t.b ? 'bas' : ''}"><td>${esc(t.lib)}</td><td>${t.o} / ${t.b}</td></tr>`).join('');
      const opts = Object.entries(r.optionsRes || {}).map(([k, x]) => `<li>Option ${esc(OPTIONS_PRATIQUE[k].libelle)} : ${x.obtenu}/${x.bareme} — ${x.reussi ? 'acquise' : 'non acquise'}</li>`).join('');
      f.innerHTML = `<div class="feuille-fond"></div><div class="feuille"><div class="feuille-haut"><span>Récapitulatif avant enregistrement</span></div>
        <div class="verdict ${r.reussi ? 'ok' : 'ko'}">${r.score} / 100 — ${r.reussi ? 'ADMIS' : 'NON ADMIS'}</div>
        <table class="tableau"><tbody>${themes}</tbody></table>
        <p class="aide">T1 ${fmtDuree(chrono.t1.ms / 1000)} · T2 ${fmtDuree(chrono.t2.ms / 1000)} · T3 ${fmtDuree(chrono.t3.ms / 1000)} — total ${fmtDuree(totalValideMs() / 1000)}${refMin ? ' (référence ' + refMin + ' min)' : ''}</p>
        ${opts ? `<ul>${opts}</ul>` : ''}${elim.length ? `<p class="erreur-discrete">À 0 : ${elim.map(e => esc(e.libelle) + (e.point ? ' (point ' + e.point + ')' : '')).join(' ; ')}</p>` : ''}
        ${r.pointsZero.length ? `<p class="erreur-discrete">Point(s) à 0 : ${r.pointsZero.join(', ')}</p>` : ''}
        <p class="aide">L'enregistrement est définitif pour ce passage.</p>
        <div class="feuille-nav"><button type="button" id="recap-non">Revenir à la grille</button><button type="button" class="principal" id="recap-oui">Enregistrer définitivement</button></div></div>`;
      const fin = v => { f.hidden = true; f.innerHTML = ''; resolve(v); };
      $('#recap-non', f).addEventListener('click', () => fin(false)); $('#recap-oui', f).addEventListener('click', () => fin(true));
    });
  }

  $('#prat-enregistrer').addEventListener('click', async ev => {
    const liste = actifs(), r = calculerPratique(liste, points, optCalc());
    if (r.nonNotes) return toast(`Il reste ${r.nonNotes} critère(s) à noter (surlignés en jaune).`, 'erreur', 5000);
    const nonValides = PHASES.filter(([k]) => !chrono[k].valide);
    if (nonValides.length) return toast('Valide les durées : ' + nonValides.map(p => p[1].split(' · ')[0]).join(', ') + '.', 'erreur', 5000);
    if (tempsDepasse() && !elim.some(e => e.type === 'temps')) return demanderPointTemps();
    if (!(await recapitulatif(r))) return;
    ev.target.disabled = true;
    const opts = [...choisies], engins = $$('.prat-engin').map(s => s.value || null);
    const acquises = opts.filter(k => r.optionsRes[k]?.reussi);
    const job = {   // payload complet : peut être rejoué plus tard (identifiant client = enregistrement sans doublon)
      id: (crypto.randomUUID ? crypto.randomUUID() : null),
      epreuve: {
        stagiaire_id: st.id, session_id: S.session.id, referentiel_code: cat.referentiel_code, categorie_code: cat.categorie_code,
        formateur_id: equipeStagiaire(st).formateur_id, testeur_id: equipeStagiaire(st).testeur_id,
        mode_essai: !!$('#prat-essai')?.checked,
        engin_id: engins[0] || null, engin_secondaire_id: engins[1] || null, options: acquises.length ? acquises : null,
        ut_options: opts.reduce((s2, k) => s2 + OPTIONS_PRATIQUE[k].ut, 0),
        duree_prise_poste_s: Math.round(chrono.t1.ms / 1000), duree_production_s: Math.round(chrono.t2.ms / 1000),
        duree_fin_poste_s: Math.round(chrono.t3.ms / 1000), eliminatoires: elim.length ? elim : null,
        score_global: r.score, reussi: r.reussi,
      },
      resultats: liste.map(c => ({ critere_id: c.id, points_obtenus: optCalc().zeroPoints.has(c.point_numero) ? 0 : Math.min(c.bareme_points, Number(points[c.id]) || 0) })),
      date_validation: r.reussi ? new Date().toISOString().slice(0, 10) : null,
      libelle: `${st.nom} ${st.prenom} — ${cat.referentiel_code} ${cat.categorie_code} — ${r.score}/100`,
    };
    try {
      await persisterEpreuve(job);
      clearInterval(minuteur);
      toast('Résultat enregistré'); fermerModale(); rendreDetailSession($('#contenu'));
    } catch (e) {
      if (erreurReseau(e)) {          // coupure réseau : on garde le résultat sur l'appareil et on le renvoie dès le retour de la connexion
        mettreEnFile(job); clearInterval(minuteur);
        toast('Pas de connexion : résultat conservé sur cet appareil, il sera envoyé automatiquement au retour du réseau.', 'erreur', 10000);
        fermerModale(); rendreDetailSession($('#contenu')); return;
      }
      ev.target.disabled = false;
      if (e && /Limite atteinte/.test(e.message || '')) toast(e.message, 'erreur', 9000);
      else erreurSupabase('Enregistrement de l\'épreuve', e);
    }
  });

  etape();
}

/* ============ Enregistrement différé (coupure réseau) ============
   Le résultat d'une épreuve terminée est conservé dans le stockage local de l'appareil (clé « caces-file-attente »)
   puis rejoué : l'identifiant de l'épreuve est fixé côté appareil, donc aucun doublon même si l'envoi est répété. */
const CLE_FILE = 'caces-file-attente';
const erreurReseau = e => !navigator.onLine || /failed to fetch|networkerror|load failed|network request/i.test(String(e && (e.message || e)));
const lireFile = () => { try { return JSON.parse(localStorage.getItem(CLE_FILE) || '[]'); } catch (e) { return []; } };
const ecrireFile = f => { try { localStorage.setItem(CLE_FILE, JSON.stringify(f)); } catch (e) { toast('Stockage local plein : note le résultat à la main !', 'erreur', 15000); } majBandeauFile(); };
function mettreEnFile(job) { const f = lireFile(); f.push(job); ecrireFile(f); }

async function persisterEpreuve(job) {
  const { error: e1 } = await sb.from('epreuves_pratique').insert({ ...(job.id ? { id: job.id } : {}), ...job.epreuve });
  if (e1 && e1.code !== '23505') throw e1;                   // 23505 = déjà enregistrée lors d'un essai précédent
  const epId = job.id;
  let ep = epId;
  if (!ep) { const { data } = await sb.from('epreuves_pratique').select('id').eq('stagiaire_id', job.epreuve.stagiaire_id).order('date_passage', { ascending: false }).limit(1).single(); ep = data.id; }
  const { error: e2 } = await sb.from('epreuve_pratique_resultats').upsert(job.resultats.map(x => ({ epreuve_id: ep, ...x })));
  if (e2) throw e2;
  const { error: e3 } = await sb.from('stagiaire_categories').update({ pratique_validee: job.epreuve.reussi, date_validation_pratique: job.date_validation })
    .eq('stagiaire_id', job.epreuve.stagiaire_id).eq('referentiel_code', job.epreuve.referentiel_code).eq('categorie_code', job.epreuve.categorie_code);
  if (e3) throw e3;
}

let syncFileEnCours = false;
async function synchroniserFile() {
  if (syncFileEnCours || !navigator.onLine || !lireFile().length || !S.utilisateur) return;
  syncFileEnCours = true;
  try {
    for (const job of lireFile()) {
      try { await persisterEpreuve(job); ecrireFile(lireFile().filter(j => j.id !== job.id)); toast('Résultat envoyé : ' + job.libelle); }
      catch (e) { if (erreurReseau(e)) break; DEBUG.erreur('Synchronisation différée', e.message); job.erreur = e.message; ecrireFile(lireFile().map(j => j.id === job.id ? job : j)); }
    }
  } finally { syncFileEnCours = false; majBandeauFile(); }
}
function majBandeauFile() {
  let b = document.getElementById('bandeau-file');
  const n = lireFile().length;
  if (!n) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('div'); b.id = 'bandeau-file'; b.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#b45309;color:#fff;padding:8px 12px;z-index:9999;text-align:center;font-size:14px';
    b.addEventListener('click', synchroniserFile); document.body.appendChild(b); }
  b.textContent = `⏳ ${n} résultat(s) d'épreuve en attente d'envoi (touche pour réessayer)` + (lireFile().some(j => j.erreur) ? ' — une erreur est survenue (voir la console)' : '');
}
window.addEventListener('online', synchroniserFile);
setInterval(synchroniserFile, 30000);
window.addEventListener('load', () => setTimeout(() => { majBandeauFile(); synchroniserFile(); }, 3000));
