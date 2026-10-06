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
  porte_engins: { libelle: 'Porte-engins', ut: 0.5, themes: ['chargement_porte_engins'] },
  telecommande: { libelle: 'Télécommande', ut: 0.5, themes: [] },
};
const LIBELLES_THEMES_PRATIQUE = {
  prise_poste: 'Prise de poste et mise en service', adequation: 'Adéquation', conduite: 'Conduite',
  manoeuvres: 'Manœuvres', fin_poste: 'Fin de poste – maintenance', conduite_circulation: 'Conduite et circulation',
  chargement_porte_engins: 'Chargement sur porte-engins (option)',
};
const libTheme = c => c.theme_libelle || LIBELLES_THEMES_PRATIQUE[c.theme_code] || c.theme_code.replace(/_/g, ' ');
function optionsPossibles(referentiel) { return referentiel === 'R482A' || referentiel === 'R482' ? ['porte_engins', 'telecommande'] : []; }

/** Calcule le résultat selon les règles officielles. points[id] = nombre ou undefined (non noté). */
function calculerPratique(criteres, points, opt = {}) {
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
  const score = bareme ? Math.round(1000 * obtenu / bareme) / 10 : 0;
  const themesEchec = Object.keys(themes).filter(k => themes[k].b && 2 * themes[k].o < themes[k].b);
  const pointsZero = Object.keys(pts).filter(k => pts[k].o <= 0).map(Number);
  return { score, obtenu, bareme, themes, pts, themesEchec, pointsZero, elimNul, nonNotes, pointsSansNumero,
    forceEchec: !!opt.forceEchec,
    reussi: score >= 70 && !themesEchec.length && !pointsZero.length && !elimNul && !opt.forceEchec };
}

async function ouvrirPratique(stagiaireId) {
  const { data: st, error } = await sb.from('stagiaires')
    .select('id, nom, prenom, stagiaire_categories(referentiel_code, categorie_code, pratique_validee)').eq('id', stagiaireId).single();
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

  const variantes = [...new Set(criteres.map(c => c.variante).filter(Boolean))];
  const dispo = optionsPossibles(cat.referentiel_code);
  const adeq = Object.fromEntries((adeqs || []).map(a => [a.engin_id, a]));
  const elim = [];                 // opérations éliminatoires relevées : [{id, libelle, point}]
  const points = {};               // id critère -> note (absent = non noté)
  const choisies = new Set();      // options
  let consignesVues = !(ops || []).length;
  const chrono = Object.fromEntries(PHASES.map(([k]) => [k, { ms: 0, depuis: null, valide: false }]));
  const ms = k => chrono[k].ms + (chrono[k].depuis ? Date.now() - chrono[k].depuis : 0);

  const actifs = () => criteres.filter(c =>
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
          <select class="prat-engin" data-i="${i}">${optEngin}</select></label>`).join('')}
        ${dispo.length ? `<fieldset><legend>Options passées (+0,5 UT chacune)</legend>${dispo.map(k =>
          `<label class="case"><input type="checkbox" data-opt="${k}"> ${esc(OPTIONS_PRATIQUE[k].libelle)}</label>`).join('')}</fieldset>` : ''}
      </div>
      ${(liens || []).length ? '' : '<p class="aide">Aucun engin déclaré dans la session (bouton « Renseigner les engins »).</p>'}
      <div id="prat-adeq"></div>
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
  function majAdeq() {
    const ids = $$('.prat-engin').map(s => s.value);
    const tous = ids.length && ids.every(Boolean);
    const ok = tous && ids.every(id => adeq[id]?.conforme);
    const zoneA = $('#prat-adeq');
    $('#prat-corps').hidden = !ok; $('#prat-barre').hidden = !ok;
    zoneA.innerHTML = !tous ? '<div class="adeq-banniere ko">Choisis l\'engin utilisé pour démarrer.</div>'
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
      <p class="aide">Au-delà de 130 % du temps de référence, attribuer 0 au(x) point(s) d'évaluation concerné(s).</p>`;
    $$('[data-ch]', z).forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.ch, c = chrono[k];
      if (b.dataset.act === 'start') c.depuis = Date.now();
      else if (b.dataset.act === 'pause') { c.ms += Date.now() - c.depuis; c.depuis = null; }
      else if (b.dataset.act === 'valider') { if (c.depuis) { c.ms += Date.now() - c.depuis; c.depuis = null; } c.valide = true; }
      else if (b.dataset.act === 'rouvrir') c.valide = false;
      else if (b.dataset.act === 'saisie') { const m = prompt('Durée en minutes :'); if (m === null) return;
        const n = Number(String(m).replace(',', '.')); if (!(n >= 0)) return toast('Durée invalide.', 'erreur');
        if (c.depuis) c.depuis = null; c.ms = Math.round(n * 60000); c.valide = true; }
      dessinerChrono(); majResultat();
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
  $$('.prat-engin').forEach(s => s.addEventListener('change', majAdeq));
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

  $('#prat-enregistrer').addEventListener('click', async ev => {
    const liste = actifs(), r = calculerPratique(liste, points, optCalc());
    if (r.nonNotes) return toast(`Il reste ${r.nonNotes} critère(s) à noter (surlignés en jaune).`, 'erreur', 5000);
    const nonValides = PHASES.filter(([k]) => !chrono[k].valide);
    if (nonValides.length) return toast('Valide les durées : ' + nonValides.map(p => p[1].split(' · ')[0]).join(', ') + '.', 'erreur', 5000);
    if (!confirm(`Enregistrer : ${r.score}/100 — ${r.reussi ? 'ADMIS' : 'NON ADMIS'} ?`)) return;
    ev.target.disabled = true;
    try {
      const opts = [...choisies], engins = $$('.prat-engin').map(s => s.value || null);
      const { data: ep, error: e1 } = await sb.from('epreuves_pratique').insert({
        stagiaire_id: st.id, session_id: S.session.id, referentiel_code: cat.referentiel_code, categorie_code: cat.categorie_code,
        formateur_id: S.session.formateur_id, testeur_id: S.session.testeur_id,
        engin_id: engins[0] || null, engin_secondaire_id: engins[1] || null, options: opts.length ? opts : null,
        ut_options: opts.reduce((s, k) => s + OPTIONS_PRATIQUE[k].ut, 0),
        duree_prise_poste_s: Math.round(chrono.t1.ms / 1000), duree_production_s: Math.round(chrono.t2.ms / 1000),
        duree_fin_poste_s: Math.round(chrono.t3.ms / 1000), eliminatoires: elim.length ? elim : null,
        score_global: r.score, reussi: r.reussi,
      }).select().single();
      if (e1) throw e1;
      const { error: e2 } = await sb.from('epreuve_pratique_resultats')
        .insert(liste.map(c => ({ epreuve_id: ep.id, critere_id: c.id, points_obtenus: optCalc().zeroPoints.has(c.point_numero) ? 0 : Math.min(c.bareme_points, Number(points[c.id]) || 0) })));
      if (e2) { await sb.from('epreuves_pratique').delete().eq('id', ep.id); throw e2; }
      const { error: e3 } = await sb.from('stagiaire_categories').update({
        pratique_validee: r.reussi, date_validation_pratique: r.reussi ? new Date().toISOString().slice(0, 10) : null,
      }).eq('stagiaire_id', st.id).eq('referentiel_code', cat.referentiel_code).eq('categorie_code', cat.categorie_code);
      if (e3) throw e3;
      clearInterval(minuteur);
      toast('Résultat enregistré'); fermerModale(); rendreDetailSession($('#contenu'));
    } catch (e) {
      ev.target.disabled = false;
      if (e && /Limite atteinte/.test(e.message || '')) toast(e.message, 'erreur', 9000);
      else erreurSupabase('Enregistrement de l\'épreuve', e);
    }
  });

  etape();
}
