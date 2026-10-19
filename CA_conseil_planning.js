/* =====================================================================
   CA_conseil_planning.js — « Conseil de charge » : propose la répartition des épreuves (théorie / pratique) par jour et par
   testeur, en respectant : quotas d'UT par testeur / par stagiaire / de pratique, 12 candidats par séance théorique,
   règle formateur ≠ testeur, charge DÉJÀ prévue sur d'autres sessions, et parc d'engins déclaré sur la session.
   Calcul 100 % navigateur (aucune écriture tant qu'on n'a pas cliqué « Appliquer au Planning »).
   Le contrôle bloquant reste celui de la base, sur la date réelle de l'épreuve.
   ===================================================================== */
const CONSEIL = { dernier: null };

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
    ch.items.push(item);
    parStagJour[item.st.id + '|' + j] = (parStagJour[item.st.id + '|' + j] || 0) + item.utStag;
    if (item.epreuve === 'pratique') parCatJour[item.ref + ' ' + item.cat + '|' + j] = (parCatJour[item.ref + ' ' + item.cat + '|' + j] || 0) + item.utCharge;
    aff.push({ ...item, jour: j, testeur: t });
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

  /* ---- 2. Pratique : un bloc par stagiaire, du plus lourd au plus léger ---- */
  const blocs = c.stags.map(st => ({ st, items: (st.stagiaire_categories || []).filter(x => x.pratique_validee !== true)
    .map(x => ({ ref: x.referentiel_code, cat: x.categorie_code, ut: c.utCat(x.referentiel_code, x.categorie_code) })) }))
    .filter(b => b.items.length).map(b => ({ ...b, ut: b.items.reduce((a, i) => a + i.ut, 0) }))
    .sort((a, b) => b.ut - a.ut || a.st.nom.localeCompare(b.st.nom));

  const score = (t, j) => -jours.indexOf(j) * 100 - lit(t, j).tot; // pédagogie : on concentre la pratique sur les derniers jours, créneaux remplis un par un
  for (const b of blocs) {
    const elig = testeurs.filter(t => c.peut(b.st, t));
    if (!elig.length) { b.items.forEach(i => non.push({ st: b.st, epreuve: 'pratique', ref: i.ref, cat: i.cat, raison: 'aucun testeur autorisé (formateur = testeur ?)' })); continue; }
    // bloc entier : toutes les catégories chez le même testeur le même jour
    const cands = [];
    elig.forEach(t => jours.forEach((j, ji) => {
      const okBloc = b.items.every((i, k) => { // vérifie cumulativement
        const deja = b.items.slice(0, k).reduce((a, x) => a + x.ut, 0);
        return ok(t, j, deja + i.ut, deja + i.ut, b.st.id, deja + i.ut, i.ref, i.cat);
      }) && (() => { // engins : chaque catégorie séparément + plafond global du bloc
        const ch = lit(t, j); return ch.tot + b.ut <= q.jour + 1e-9 && ch.prat + b.ut <= q.prat + 1e-9 && (parStagJour[b.st.id + '|' + j] || 0) + b.ut <= q.stag + 1e-9;
      })();
      if (okBloc) cands.push({ t, j, ji, score: score(t, j, b.ut) });
    }));
    if (cands.length) {
      const m = meilleur(cands);
      b.items.forEach(i => poser(m.t, m.j, { st: b.st, epreuve: 'pratique', ref: i.ref, cat: i.cat, ut: i.ut, utCharge: i.ut, utStag: i.ut }));
      continue;
    }
    // sinon : épreuve par épreuve
    for (const i of b.items.sort((x, y) => y.ut - x.ut)) {
      const cs = [];
      elig.forEach(t => jours.forEach((j, ji) => { if (ok(t, j, i.ut, i.ut, b.st.id, i.ut, i.ref, i.cat)) cs.push({ t, j, ji, score: score(t, j, i.ut) }); }));
      if (!cs.length) { non.push({ st: b.st, epreuve: 'pratique', ref: i.ref, cat: i.cat, ut: i.ut, raison: 'plus de capacité' }); continue; }
      const m = meilleur(cs);
      poser(m.t, m.j, { st: b.st, epreuve: 'pratique', ref: i.ref, cat: i.cat, ut: i.ut, utCharge: i.ut, utStag: i.ut });
    }
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
    deja: (t, j) => deja[t + '|' + j] || { tot: 0, prat: 0 },
    peut: (st, t) => peutTesterStagiaire(st, s, t),
    nbTesteurs: st => testeurs.filter(t => peutTesterStagiaire(st, s, t)).length,
  };
  const r = calculerConseil(ctx);
  CONSEIL.dernier = { r, ctx, nouveaux };
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
    const prat = Object.values(parSt).filter(x => x.epreuve === 'pratique');
    const lignes = [];
    if (theo.length) lignes.push(`<li>📝 Théorie ${esc(theo[0].ref)} (début d'après-midi) — ${theo.length} stagiaire(s)</li>`);
    prat.forEach(x => lignes.push(`<li>${esc(x.st.nom)} ${esc((x.st.prenom || '').charAt(0))}. — ${esc(x.cats.join(', '))} <small>(${fmt(x.ut)} UT)</small></li>`));
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
