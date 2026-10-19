/* =====================================================================
   CA_conseil_planning.js — « Conseil de charge » : propose la répartition des épreuves (théorie / pratique) par jour et par
   testeur, en respectant : quotas d'UT par testeur / par stagiaire / de pratique, 12 candidats par séance théorique,
   règle formateur ≠ testeur, charge DÉJÀ prévue sur d'autres sessions, et parc d'engins déclaré sur la session.
   Calcul 100 % navigateur (aucune écriture tant qu'on n'a pas cliqué « Appliquer au Planning »).
   Le contrôle bloquant reste celui de la base, sur la date réelle de l'épreuve.
   ===================================================================== */
const CONSEIL = { dernier: null, profils: {} };
function changerProfilConseil(id, v) { CONSEIL.profils[id] = v; ouvrirConseilPlanning(CONSEIL.dernier?.n); }

/** n jours ouvrés (lun–ven) après une date de départ (exclue). */
function joursOuvresApres(depart, n) {
  const r = []; const d = new Date((depart || new Date().toISOString().slice(0, 10)) + 'T12:00:00');
  while (r.length < n) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) r.push(d.toISOString().slice(0, 10)); }
  return r;
}

/** Algorithme glouton équilibré (blocs « un stagiaire = toutes ses épreuves de pratique », éclatés si nécessaire). */
function calculerConseil(c) {
  const { q, jours, testeurs } = c;
  const charge = {}, parStagJour = {}, parCatJour = {}, aff = [], non = [], alertes = [];
  const cle = (t, j) => t + '|' + j;
  const lit = (t, j) => (charge[cle(t, j)] ??= { tot: c.deja(t, j).tot, prat: c.deja(t, j).prat, base: c.deja(t, j).tot, items: [] });

  const ok = (t, j, ut, utPrat, stId, utStag, ref, cat) => {
    const ch = lit(t, j);
    if (ch.tot + ut > q.jour + 1e-9) return false;
    if (ch.prat + utPrat > q.prat + 1e-9) return false;
    if (stId && (parStagJour[stId + '|' + j] || 0) + utStag > q.stag + 1e-9) return false;
    if (cat) {
      const n = c.engins[ref + ' ' + cat] || 0;
      if (n > 0 && (parCatJour[ref + ' ' + cat + '|' + j] || 0) + utPrat > n * q.jour + 1e-9) return false;
    }
    return true;
  };
  const poser = (t, j, item) => {
    const ch = lit(t, j); ch.tot += item.utCharge; if (item.epreuve === 'pratique') ch.prat += item.utCharge;
    const o = { ...item, jour: j, testeur: t };
    ch.items.push(o); aff.push(o);
    parStagJour[item.st.id + '|' + j] = (parStagJour[item.st.id + '|' + j] || 0) + item.utStag;
    if (item.epreuve === 'pratique') parCatJour[item.ref + ' ' + item.cat + '|' + j] = (parCatJour[item.ref + ' ' + item.cat + '|' + j] || 0) + item.utCharge;
  };
  const meilleur = (cands) => cands.sort((a, b) => a.score - b.score || a.ji - b.ji)[0];

  /* ---- 1. Théorie : séances de max 12 candidats, le plus tôt possible ---- */
  const refs = [...new Set(c.stags.flatMap(st => (st.stagiaire_categories || []).map(x => x.referentiel_code)))];
  for (const ref of refs) {
    const aFaire = c.stags.filter(st => (st.stagiaire_categories || []).filter(x => x.referentiel_code === ref).some(x => x.theorie_validee !== true && !x.dispense_theorie));
    if (!aFaire.length) continue;
    // un testeur par stagiaire (règle formateur ≠ testeur), répartition équilibrée par effectif
    const eff = Object.fromEntries(testeurs.map(t => [t, 0])), groupes = {};
    for (const st of aFaire.slice().sort((a, b) => c.nbTesteurs(a) - c.nbTesteurs(b))) {
      const elig = testeurs.filter(t => c.peut(st, t));
      if (!elig.length) { non.push({ st, epreuve: 'theorie', ref, raison: 'aucun testeur autorisé (formateur = testeur ?)' }); continue; }
      const t = elig.filter(x => eff[x] < q.maxTh).sort((a, b) => eff[b] - eff[a])[0] || elig.sort((a, b) => eff[a] - eff[b])[0]; eff[t]++; (groupes[t] ||= []).push(st);
    }
    for (const [t, liste] of Object.entries(groupes)) {
      for (let i = 0; i < liste.length; i += q.maxTh) {
        const lot = liste.slice(i, i + q.maxTh), ut = c.utTh(ref);
        let place = false;
        const ordre = jours.map((_, i) => i).sort((a, b) => (a === Math.min(1, jours.length - 1) ? -1 : b === Math.min(1, jours.length - 1) ? 1 : a - b));
        for (const ji of ordre) {
          if (place) break;
          if (!ok(t, jours[ji], ut, 0, null, 0)) continue;
          lot.forEach((st, k) => poser(t, jours[ji], { st, epreuve: 'theorie', ref, cat: '', ut, utCharge: k === 0 ? ut : 0, utStag: ut }));
          place = true;
        }
        if (!place) lot.forEach(st => non.push({ st, epreuve: 'theorie', ref, raison: 'pas de créneau de théorie' }));
      }
    }
  }

  /* ---- 2. Pratique ----
     Ordre : stagiaires « stressés » (répartis sur 2 jours), puis « standard », compactage vers le dernier jour,
     puis stagiaires « à l'aise » dans ce qui reste, le plus tôt possible. */
  const profil = st => (c.profil && c.profil(st)) || 'standard';
  const blocs = c.stags.map(st => ({ st, items: (st.stagiaire_categories || []).filter(x => x.pratique_validee !== true)
    .map(x => ({ ref: x.referentiel_code, cat: x.categorie_code, ut: c.utCat(x.referentiel_code, x.categorie_code) })) }))
    .filter(b => b.items.length).map(b => ({ ...b, ut: b.items.reduce((a, i) => a + i.ut, 0), profil: profil(b.st) }))
    .sort((a, b) => b.ut - a.ut || a.st.nom.localeCompare(b.st.nom));

  const scoreFin = (t, j) => -jours.indexOf(j) * 100 - lit(t, j).tot;   // derniers jours d'abord, créneau déjà entamé d'abord
  const scoreDebut = (t, j) => jours.indexOf(j) * 100 - lit(t, j).tot;  // premiers jours d'abord
  const mk = (b, i) => ({ st: b.st, epreuve: 'pratique', ref: i.ref, cat: i.cat, ut: i.ut, utCharge: i.ut, utStag: i.ut });
  const NON = (b, i, raison) => non.push({ st: b.st, epreuve: 'pratique', ref: i.ref, cat: i.cat, ut: i.ut, raison });

  const placerBloc = (b, items, score, joursOk) => {
    const elig = testeurs.filter(t => c.peut(b.st, t));
    const ut = items.reduce((a, i) => a + i.ut, 0), cands = [];
    elig.forEach(t => (joursOk || jours).forEach(j => {
      const okB = items.every((i, k) => { const d = items.slice(0, k).reduce((a, x) => a + x.ut, 0); return ok(t, j, d + i.ut, d + i.ut, b.st.id, d + i.ut, i.ref, i.cat); })
        && lit(t, j).tot + ut <= q.jour + 1e-9 && lit(t, j).prat + ut <= q.prat + 1e-9 && (parStagJour[b.st.id + '|' + j] || 0) + ut <= q.stag + 1e-9;
      if (okB) cands.push({ t, j, ji: jours.indexOf(j), score: score(t, j) });
    }));
    if (!cands.length) return null;
    const m = meilleur(cands); items.forEach(i => poser(m.t, m.j, mk(b, i))); return m;
  };
  const placerItems = (b, items, score, joursOk) => {
    const elig = testeurs.filter(t => c.peut(b.st, t));
    for (const i of items.slice().sort((x, y) => y.ut - x.ut)) {
      const cs = [];
      elig.forEach(t => (joursOk || jours).forEach(j => { if (ok(t, j, i.ut, i.ut, b.st.id, i.ut, i.ref, i.cat)) cs.push({ t, j, ji: jours.indexOf(j), score: score(t, j) }); }));
      if (!cs.length) { NON(b, i, 'plus de capacité'); continue; }
      const m = meilleur(cs); poser(m.t, m.j, mk(b, i));
    }
  };
  const sansTesteur = b => { if (testeurs.some(t => c.peut(b.st, t))) return false; b.items.forEach(i => NON(b, i, 'aucun testeur autorisé (formateur = testeur ?)')); return true; };

  /* a) Remplissage exact, du DERNIER jour vers le premier : pour chaque créneau (jour × testeur) on choisit,
        parmi les épreuves restantes (hors « à l'aise »), la combinaison qui approche le plus le plafond de pratique. */
  const reste = [];
  blocs.filter(x => x.profil !== 'aise').forEach(b => {
    if (sansTesteur(b)) return;
    const its = b.items.slice().sort((x, y) => x.ut - y.ut);
    its.forEach((i, k) => reste.push({ b, i, legere: b.profil === 'stresse' && k === 0 && its.length > 1 && jours.length > 1 }));
  });
  const u100 = x => Math.round(x * 100);
  const meilleureCombinaison = (unites, cap) => {            // sous-ensemble dont la somme approche cap (en centièmes d'UT)
    let reach = new Map([[0, []]]);
    unites.forEach((u, idx) => {
      const nxt = new Map(reach);
      reach.forEach((sel, s) => { const n = s + u; if (n <= cap && !nxt.has(n)) nxt.set(n, sel.concat(idx)); });
      reach = nxt;
    });
    let best = 0; reach.forEach((_, s) => { if (s > best) best = s; });
    return { somme: best, sel: reach.get(best) };
  };
  for (let ji = jours.length - 1; ji >= 0 && reste.length; ji--) {
    const j = jours[ji];
    for (const tst of testeurs.slice().sort((x, y) => lit(y, j).tot - lit(x, j).tot)) {
      const ch = lit(tst, j), cap = u100(Math.min(q.prat - ch.prat, q.jour - ch.tot));
      if (cap <= 0) continue;
      const cand = reste.filter(r => c.peut(r.b.st, tst) && !(r.legere && ji === jours.length - 1));
      if (!cand.length) continue;
      // 1) stagiaires entiers ; 2) épreuves isolées si cela remplit mieux
      const parSt = {}; cand.forEach(r => (parSt[r.b.st.id] ||= []).push(r));
      const groupes = Object.values(parSt).filter(g => !g.some(r => r.legere)).map(g => ({ g, u: g.reduce((a, r) => a + u100(r.i.ut), 0) }));
      const c1 = meilleureCombinaison(groupes.map(x => x.u), cap);
      const c2 = meilleureCombinaison(cand.map(r => u100(r.i.ut)), cap);
      const choisis = c2.somme > c1.somme ? c2.sel.map(k => cand[k]) : c1.sel.flatMap(k => groupes[k].g);
      for (const r of choisis) {
        if (!ok(tst, j, r.i.ut, r.i.ut, r.b.st.id, r.i.ut, r.i.ref, r.i.cat)) continue;
        poser(tst, j, mk(r.b, r.i)); reste.splice(reste.indexOf(r), 1);
      }
    }
  }
  reste.forEach(r => NON(r.b, r.i, 'plus de capacité'));
  // « stressés » : si toutes leurs épreuves tombent le même jour, on décale la plus légère sur un jour antérieur libre
  blocs.filter(x => x.profil === 'stresse').forEach(b => {
    const mes = aff.filter(a => a.st.id === b.st.id && a.epreuve === 'pratique');
    if (mes.length < 2 || new Set(mes.map(a => a.jour)).size > 1) return;
    const o = mes.slice().sort((x, y) => x.utCharge - y.utCharge)[0];
    for (let ji = jours.indexOf(o.jour) - 1; ji >= 0; ji--) {
      const x = testeurs.find(tt => c.peut(o.st, tt) && ok(tt, jours[ji], o.utCharge, o.utCharge, o.st.id, o.utStag, o.ref, o.cat));
      if (x) { const it = { st: o.st, epreuve: o.epreuve, ref: o.ref, cat: o.cat, ut: o.ut, utCharge: o.utCharge, utStag: o.utStag };
        const ch = lit(o.testeur, o.jour); ch.tot -= o.utCharge; ch.prat -= o.utCharge; ch.items.splice(ch.items.indexOf(o), 1); aff.splice(aff.indexOf(o), 1);
        parStagJour[o.st.id + '|' + o.jour] -= o.utStag; parCatJour[o.ref + ' ' + o.cat + '|' + o.jour] -= o.utCharge;
        poser(x, jours[ji], it); break; }
    }
  });

  // d) à l'aise : dans ce qui reste, le plus tôt possible
  for (const b of blocs.filter(x => x.profil === 'aise')) {
    if (sansTesteur(b)) continue;
    placerBloc(b, b.items, scoreDebut) || placerItems(b, b.items, scoreDebut);
  }

  /* ---- 3. Diagnostic et alertes ---- */
  const utPrat = blocs.reduce((a, b) => a + b.ut, 0);
  const utTheo = aff.filter(a => a.epreuve === 'theorie').reduce((a, x) => a + x.utCharge, 0);
  const jTesteurMin = Math.ceil(utPrat / q.prat - 1e-9);
  const manque = non.filter(n => n.epreuve === 'pratique').reduce((a, n) => a + (n.ut || 0), 0);
  for (const [k, n] of Object.entries(c.engins)) void n;
  const cats = [...new Set(aff.filter(a => a.epreuve === 'pratique').map(a => a.ref + ' ' + a.cat))];
  for (const rc of cats) {
    if (!(c.engins[rc] > 0)) alertes.push(`Aucun engin déclaré sur la session pour ${rc} (non bloquant : renseigne les engins).`);
    else jours.forEach(j => {
      const ts = new Set(aff.filter(a => a.jour === j && a.epreuve === 'pratique' && a.ref + ' ' + a.cat === rc).map(a => a.testeur));
      if (ts.size > c.engins[rc]) alertes.push(`${rc} le ${dateFr(j)} : ${ts.size} testeurs pour ${c.engins[rc]} engin(s) — à passer l'un après l'autre (matin / après-midi).`);
    });
  }
  return { aff, non, charge, utPrat, utTheo, jTesteurMin, manque, alertes };
}

async function ouvrirConseilPlanning(nbJoursDemande) {
  const s = S.session;
  const testeurs = [...new Set(testeursSession(s).filter(Boolean))];
  if (!testeurs.length) return toast('Affecte d\'abord un testeur à la session (onglet Sessions > Équipe).', 'erreur', 6000);
  toast('Calcul du conseil…');
  const jours = await joursSession(s.id);
  const [{ data: stags }, { data: prm }, { data: se }] = await Promise.all([
    sb.from('stagiaires').select('id, nom, prenom, groupe_id, stagiaire_categories(referentiel_code, categorie_code, theorie_validee, pratique_validee, dispense_theorie)')
      .eq('session_id', s.id).order('nom'),
    sb.from('parametres_application').select('*').eq('id', 1).single(),
    sb.from('session_engins').select('engin_id, engins(categories)').eq('session_id', s.id),
  ]);
  if (!(stags || []).length) return toast('Aucun stagiaire dans la session.', 'erreur');
  const n = Math.max(1, Number(nbJoursDemande) || jours.test.length || 3);
  const liste = jours.test.slice(0, n);
  if (liste.length < n) liste.push(...joursOuvresApres(liste[liste.length - 1] || s.date_debut || new Date().toISOString().slice(0, 10), n - liste.length));
  const nouveaux = liste.filter(j => !jours.test.includes(j));

  const engins = {}; (se || []).forEach(x => ((x.engins?.categories) || []).forEach(rc => { engins[rc] = (engins[rc] || 0) + 1; }));
  const deja = {};
  await Promise.all(testeurs.flatMap(t => liste.map(async j => {
    const { data } = await sb.rpc('caces_charge_prevue', { p_testeur: t, p_jour: j, p_exclure: s.id });
    deja[t + '|' + j] = { tot: Number(data?.[0]?.ut_total || 0), prat: Number(data?.[0]?.ut_pratique || 0) };
  })));
  const ctx = {
    stags, jours: liste, testeurs, engins,
    q: { jour: Number(prm?.quota_ut_jour ?? 7), prat: Number(prm?.quota_ut_pratique_jour ?? 6), stag: Number(prm?.quota_ut_stagiaire_jour ?? 7), maxTh: Number(prm?.max_candidats_theorie ?? 12) },
    utCat: (ref, cat) => Number((S.referentiel.categories.find(c => c.referentiel_code === ref && c.code === cat) || {}).ut_pratique || 0),
    utTh: ref => Number((S.referentiel.referentiels.find(r => r.code === ref) || {}).ut_theorique || 0),
    profil: st => CONSEIL.profils[st.id] || 'standard',
    deja: (t, j) => deja[t + '|' + j] || { tot: 0, prat: 0 },
    peut: (st, t) => peutTesterStagiaire(st, s, t),
    nbTesteurs: st => testeurs.filter(t => peutTesterStagiaire(st, s, t)).length,
  };
  const r = calculerConseil(ctx);
  CONSEIL.dernier = { r, ctx, nouveaux, n };
  dessinerConseil(r, ctx, n, nouveaux);
}

function dessinerConseil(r, ctx, n, nouveaux) {
  const { q, jours, testeurs } = ctx, d = droitsSession(S.session);
  const fmt = x => (Math.round(x * 100) / 100).toString().replace('.', ',');
  const cellule = (t, j) => {
    const ch = r.charge[t + '|' + j] || { tot: 0, prat: 0, base: 0, items: [] };
    const parSt = {};
    ch.items.forEach(i => { const k = i.st.id + '|' + i.epreuve; (parSt[k] ||= { st: i.st, epreuve: i.epreuve, ref: i.ref, ut: 0, cats: [] }); parSt[k].ut += i.ut; if (i.cat) parSt[k].cats.push(i.cat); });
    const theo = Object.values(parSt).filter(x => x.epreuve === 'theorie');
    const rang = x => ({ aise: 0, standard: 1, stresse: 2 }[ctx.profil(x.st)] ?? 1);
    const prat = Object.values(parSt).filter(x => x.epreuve === 'pratique').sort((a, b) => rang(a) - rang(b));
    const lignes = [];
    if (theo.length) lignes.push(`<li>📝 Théorie ${esc(theo[0].ref)} (début d'après-midi) — ${theo.length} stagiaire(s)</li>`);
    prat.forEach(x => lignes.push(`<li>${{ aise: '🟢 ', stresse: '🟠 ' }[ctx.profil(x.st)] || ''}${esc(x.st.nom)} ${esc((x.st.prenom || '').charAt(0))}. — ${esc(x.cats.join(', '))} <small>(${fmt(x.ut)} UT)</small></li>`));
    const trop = ch.tot > q.jour + 1e-9 || ch.prat > q.prat + 1e-9;
    return `<td><div class="${trop ? 'note-faible' : ''}"><b>${fmt(ch.tot)} / ${q.jour} UT</b> <small>(pratique ${fmt(ch.prat)} / ${q.prat}${ch.base ? ` · dont ${fmt(ch.base)} déjà prévues ailleurs` : ''})</small></div>
      <ul class="liste-conseil">${lignes.join('') || '<li><i>libre</i></li>'}</ul></td>`;
  };
  const dispo = jours.length * testeurs.length;
  const diag = [`Charge à placer : <b>${fmt(r.utTheo + r.utPrat)} UT</b> (théorie ${fmt(r.utTheo)} + pratique ${fmt(r.utPrat)}).`,
    `Minimum théorique : <b>${r.jTesteurMin} jour(s)-testeur</b> de pratique (plafond ${q.prat} UT de pratique par jour) ; disponibles : ${dispo} (${testeurs.length} testeur(s) × ${jours.length} jour(s)).`];
  if (r.non.length) diag.push(`<span class="note-faible">⚠ ${r.non.length} épreuve(s) non placée(s)${r.manque ? ` (${fmt(r.manque)} UT)` : ''} : il manque environ <b>${Math.max(1, Math.ceil(r.manque / q.prat))} jour(s)-testeur</b> — ajoute un testeur ou un jour.</span>`);
  else diag.push('✔ Tout est placé dans les limites d\'UT.');
  ouvrirModale('💡 Conseil de charge', `
    <div class="carte"><label>Nombre de jours de test
      <select id="conseil-nb" onchange="ouvrirConseilPlanning(this.value)">${[1, 2, 3, 4, 5, 6].map(k => `<option ${k === n ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      ${nouveaux.length ? `<span class="aide">Jours à créer : ${nouveaux.map(dateFr).join(', ')}</span>` : ''}
      <p>${diag.join('<br>')}</p></div>
    <details class="carte"><summary><b>Profil des stagiaires</b> <small>(🟢 à l'aise : passent en premier · 🟠 stressé : réparti sur 2 jours)</small></summary>
      ${ctx.stags.map(st => `<div class="ligne-profil"><span>${esc(st.nom)} ${esc(st.prenom || '')}</span>
        <select onchange="changerProfilConseil('${st.id}', this.value)">${[['aise', '🟢 À l\'aise — en premier'], ['standard', 'Standard'], ['stresse', '🟠 Stressé — sur 2 jours']]
          .map(([v, l]) => `<option value="${v}" ${ctx.profil(st) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`).join('')}</details>
    <div class="tableau-defilant"><table class="tableau"><thead><tr><th>Jour</th>${testeurs.map(t => `<th>${esc(nomFormateur(t))}</th>`).join('')}</tr></thead><tbody>
      ${jours.map(j => `<tr><td>${esc(dateFr(j))}</td>${testeurs.map(t => cellule(t, j)).join('')}</tr>`).join('')}</tbody></table></div>
    ${r.non.length ? `<div class="carte"><b>Non placé :</b><ul>${r.non.slice(0, 20).map(x => `<li>${esc(x.st.nom)} ${esc(x.st.prenom)} — ${x.epreuve === 'theorie' ? 'théorie' : esc(x.ref + ' ' + x.cat)} : ${esc(x.raison)}</li>`).join('')}</ul></div>` : ''}
    ${r.alertes.length ? `<div class="carte"><b>Points d'attention</b><ul>${r.alertes.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
    <p class="aide">Principe : théorie le 2<sup>e</sup> jour en début d'après-midi, pratique concentrée sur les derniers jours. Hypothèses : une épreuve de pratique = UT de la catégorie ; une séance de théorie (12 candidats max) = UT du référentiel ; un testeur ne teste pas ses propres stagiaires ;
      la charge déjà prévue sur d'autres sessions est déduite ; un engin = ${q.jour} UT par jour. Le Planning reste modifiable à la main.</p>
    <div class="pied-modale"><button onclick="fermerModale();ouvrirPlanning()">Retour au Planning</button>
      ${d.testeur && S.session.statut !== 'cloturee' ? '<button class="principal" onclick="appliquerConseil()">✔ Appliquer au Planning</button>' : ''}</div>`, { large: true });
}

async function appliquerConseil() {
  const c = CONSEIL.dernier; if (!c) return;
  const s = S.session;
  if (!confirmer(`Écrire cette répartition dans le Planning de la session (${c.r.aff.length} épreuve(s)) ? Les dates déjà saisies pour ces épreuves seront remplacées.`)) return;
  try {
    if (c.nouveaux.length) {
      const { error } = await sb.from('session_jours').upsert(c.nouveaux.map(jour => ({ session_id: s.id, jour, type: 'test' })));
      if (error) throw error;
    }
    const lignes = {};
    c.r.aff.forEach(a => { lignes[`${a.st.id}|${a.ref}|${a.cat}|${a.epreuve}`] = { stagiaire_id: a.st.id, referentiel_code: a.ref, categorie_code: a.cat, epreuve: a.epreuve, jour: a.jour, testeur_id: a.testeur }; });
    const { error } = await sb.from('planning_tests').upsert(Object.values(lignes));
    if (error) throw error;
    toast(`Planning enregistré (${Object.keys(lignes).length} épreuve(s)).`);
    fermerModale(); ouvrirPlanning();
  } catch (e) { erreurSupabase('Application du conseil', e); }
}
