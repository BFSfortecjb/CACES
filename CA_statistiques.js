/* =====================================================================
   CA_statistiques.js — Onglet « Statistiques » (chantier 27, repris de l'ancien logiciel)
   1. Synthèse    : % de tests réalisés en CDT par recommandation (barres + objectif réglable)
   2. Matrice     : testeur × catégorie (tests réalisés / en échec), un onglet par référentiel, TOTAL
   3. Détail      : stagiaire / testeur / reco / catégorie / option / date / résultat — export CSV (Excel)
   4. Journées    : journées de tests par testeur + calendrier date × recommandation
   Source : epreuves_pratique (hors mode essai). Un « test » = une épreuve pratique passée par un stagiaire.
   ===================================================================== */
const STAT = { debut: null, fin: null, centre: '', audit: false, client: '', onglet: 'synthese', refMatrice: null, modeMatrice: 'realises', etat: 'tous', lignes: [] };

function statNomTesteur(id) { const f = (S.formateurs || []).find(x => x.id === id); return f ? `${f.nom || ''} ${f.prenom || ''}`.trim() || f.email : '—'; }
function statObjectif(ref) { try { return Number(localStorage.getItem('caces_stat_objectif_' + ref)) || 0; } catch (_e) { return 0; } }
function statDefinirObjectif(ref, v) { try { localStorage.setItem('caces_stat_objectif_' + ref, String(Number(v) || 0)); } catch (_e) { /* ignoré */ } }

async function rendreStatistiques(zone) {
  const auj = new Date(), iso = d => d.toISOString().slice(0, 10);
  if (!STAT.debut) { STAT.debut = `${auj.getFullYear()}-01-01`; STAT.fin = iso(auj); }
  zone.innerHTML = `
    <div class="barre-actions"><h2>📊 Statistiques</h2></div>
    <div class="carte stat-filtres">
      <label>Du <input type="date" id="st-debut" value="${STAT.debut}"></label>
      <label>au <input type="date" id="st-fin" value="${STAT.fin}"></label>
      <label>Année <select id="st-annee"><option value="">—</option>${Array.from({ length: 6 }, (_, i) => auj.getFullYear() - i).map(a => `<option>${a}</option>`).join('')}</select></label>
      <label>Centre <select id="st-centre"><option value="">Tous les centres</option>${(S.referentiel.centres || []).map(c => `<option value="${c.id}" ${String(c.id) === STAT.centre ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')}</select></label>
      <label>Client <input type="search" id="st-client" placeholder="entreprise…" value="${esc(STAT.client)}"></label>
      <label class="case"><input type="checkbox" id="st-audit" ${STAT.audit ? 'checked' : ''}> Uniquement les sessions clôturées (audit)</label>
      <button class="principal" id="st-go">Actualiser</button>
    </div>
    <nav class="stat-onglets">${[['synthese', 'Synthèse CDT'], ['matrice', 'Testeur × catégorie'], ['detail', 'Détail candidats'], ['jours', 'Journées de tests']]
      .map(([k, l]) => `<button data-st="${k}" class="${STAT.onglet === k ? 'actif' : ''}">${l}</button>`).join('')}</nav>
    <div id="st-corps"><p class="chargement">Chargement…</p></div>`;
  const lire = () => { STAT.debut = $('#st-debut').value; STAT.fin = $('#st-fin').value; STAT.centre = $('#st-centre').value; STAT.client = $('#st-client').value.trim(); STAT.audit = $('#st-audit').checked; };
  $('#st-annee').onchange = ev => { if (ev.target.value) { $('#st-debut').value = `${ev.target.value}-01-01`; $('#st-fin').value = `${ev.target.value}-12-31`; } };
  $('#st-go').onclick = async () => { lire(); await chargerStatistiques(); dessinerStatistiques(); };
  $$('.stat-onglets button').forEach(b => b.onclick = () => { STAT.onglet = b.dataset.st; $$('.stat-onglets button').forEach(x => x.classList.toggle('actif', x === b)); dessinerStatistiques(); });
  await chargerStatistiques(); dessinerStatistiques();
}

async function chargerStatistiques() {
  const { data, error } = await lireToutesLesLignes(() => sb.from('epreuves_pratique')
    .select('stagiaire_id, session_id, referentiel_code, categorie_code, options, testeur_id, date_passage, reussi, score_global, sessions_formation(nom, en_cdt, statut, entreprise, centre_examen_id), stagiaires(nom, prenom)')
    .eq('mode_essai', false).gte('date_passage', STAT.debut + 'T00:00:00').lte('date_passage', STAT.fin + 'T23:59:59').order('date_passage'));
  if (error) { erreurSupabase('Lecture des statistiques', error); STAT.lignes = []; return; }
  const cl = STAT.client.toLowerCase();
  STAT.lignes = (data || []).filter(l => {
    const s = l.sessions_formation || {};
    if (STAT.centre && String(s.centre_examen_id) !== STAT.centre) return false;
    if (STAT.audit && s.statut !== 'cloturee') return false;
    if (cl && !(s.entreprise || '').toLowerCase().includes(cl)) return false;
    return true;
  }).map(l => ({ ...l, jour: (l.date_passage || '').slice(0, 10), cdt: l.sessions_formation?.en_cdt !== false }));
}

function dessinerStatistiques() {
  const z = $('#st-corps'); if (!z) return;
  if (!STAT.lignes.length) { z.innerHTML = '<div class="carte"><p class="vide">Aucun test sur cette période avec ces filtres.</p></div>'; return; }
  ({ synthese: statSynthese, matrice: statMatrice, detail: statDetail, jours: statJours })[STAT.onglet](z);
}

/* ---------- 1. Synthèse : barres de % réalisés en CDT ---------- */
function statSynthese(z) {
  const refs = [...new Set((S.referentiel.referentiels || []).map(r => r.code))];
  const kpi = (n, l, c) => `<div class="stat-kpi" style="border-top-color:${c}"><b>${n}</b><span>${l}</span></div>`;
  const tot = STAT.lignes.length, ok = STAT.lignes.filter(l => l.reussi === true).length, cdt = STAT.lignes.filter(l => l.cdt).length;
  z.innerHTML = `<div class="stat-kpis">${kpi(tot, 'tests réalisés', '#2c6fbb')}${kpi(ok, 'réussis (' + (tot ? Math.round(100 * ok / tot) : 0) + ' %)', '#1b7c3c')}${kpi(tot - ok, 'échoués', '#b2181a')}${kpi(cdt + ' / ' + (tot - cdt), 'en CDT / hors CDT', '#f3ab12')}</div>
    <div class="carte"><h3>% de tests réalisés en CDT par recommandation</h3>
    ${refs.map(r => {
      const L = STAT.lignes.filter(l => l.referentiel_code === r), n = L.length, c = L.filter(l => l.cdt).length, h = n - c, pct = n ? Math.round(1000 * c / n) / 10 : 0, obj = statObjectif(r);
      return `<div class="stat-ligne"><div class="stat-nom">${esc(r)}</div>
        <div class="stat-piste">${n ? `<div class="stat-barre" style="width:${pct}%;background:${obj && pct < obj ? '#e67e22' : '#1b7c3c'}"></div>` : ''}${obj ? `<div class="stat-objectif" style="left:${obj}%" title="Objectif ${obj} %"><i>${obj} %</i></div>` : ''}
          <span class="stat-pct">${n ? pct + ' %' : 'pas de test réalisé'}</span></div>
        <div class="stat-detail">${n} test${n > 1 ? 's' : ''} réalisé${n > 1 ? 's' : ''} dont ${c} en CDT et ${h} hors CDT · <label>objectif % <input type="number" min="0" max="100" value="${obj || ''}" data-obj="${esc(r)}" style="width:4em"></label></div></div>`;
    }).join('')}</div>`;
  $$('[data-obj]', z).forEach(i => i.onchange = () => { statDefinirObjectif(i.dataset.obj, i.value); statSynthese(z); });
}

/* ---------- 2. Matrice testeur × catégorie ---------- */
function statMatrice(z) {
  const refs = [...new Set(STAT.lignes.map(l => l.referentiel_code))].sort();
  if (!refs.includes(STAT.refMatrice)) STAT.refMatrice = refs[0];
  const ref = STAT.refMatrice, echec = STAT.modeMatrice === 'echecs';
  const cats = (S.referentiel.categories || []).filter(c => c.referentiel_code === ref).map(c => c.code);
  const L = STAT.lignes.filter(l => l.referentiel_code === ref && (echec ? l.reussi === false : true));
  const testeurs = [...new Set(L.map(l => l.testeur_id))].sort((a, b) => statNomTesteur(a).localeCompare(statNomTesteur(b)));
  const nb = (t, c) => L.filter(l => l.testeur_id === t && (c == null || l.categorie_code === c)).length;
  const max = Math.max(1, ...testeurs.flatMap(t => cats.map(c => nb(t, c))));
  const teinte = n => n ? `background:rgba(${echec ? '178,24,26' : '27,124,60'},${(0.15 + 0.6 * n / max).toFixed(2)});font-weight:700` : 'color:#bbb';
  z.innerHTML = `<div class="stat-barre-outils">
      <div class="stat-onglets">${refs.map(r => `<button data-r="${esc(r)}" class="${r === ref ? 'actif' : ''}">${esc(r)}</button>`).join('')}</div>
      <div class="stat-onglets"><button data-m="realises" class="${!echec ? 'actif' : ''}">Réalisés</button><button data-m="echecs" class="${echec ? 'actif' : ''}">En échec</button></div></div>
    <div class="carte"><h3>CACES® ${esc(ref)} ${echec ? 'en échec' : 'réalisés'} du ${dateFr(STAT.debut)} au ${dateFr(STAT.fin)}</h3>
    <div class="tableau-defile"><table class="tableau stat-matrice"><thead><tr><th>Testeur</th>${cats.map(c => `<th>${esc(c)}</th>`).join('')}<th>TOTAL</th></tr></thead><tbody>
      ${testeurs.map(t => `<tr><td>${esc(statNomTesteur(t))}</td>${cats.map(c => { const n = nb(t, c); return `<td style="text-align:center;${teinte(n)}">${n || ''}</td>`; }).join('')}<td style="text-align:center;font-weight:700">${nb(t)}</td></tr>`).join('') || `<tr><td colspan="${cats.length + 2}" class="vide">Aucun test.</td></tr>`}
      <tr class="stat-total"><td>TOTAL</td>${cats.map(c => `<td style="text-align:center">${L.filter(l => l.categorie_code === c).length || ''}</td>`).join('')}<td style="text-align:center">${L.length}</td></tr>
    </tbody></table></div></div>`;
  $$('[data-r]', z).forEach(b => b.onclick = () => { STAT.refMatrice = b.dataset.r; statMatrice(z); });
  $$('[data-m]', z).forEach(b => b.onclick = () => { STAT.modeMatrice = b.dataset.m; statMatrice(z); });
}

/* ---------- 3. Détail candidats + export CSV ---------- */
function statDetail(z) {
  const L = STAT.lignes.filter(l => STAT.etat === 'tous' || (STAT.etat === 'reussis' ? l.reussi === true : l.reussi === false));
  z.innerHTML = `<div class="stat-barre-outils"><div class="stat-onglets">${[['tous', 'Réalisés'], ['reussis', 'Réussis'], ['echecs', 'Échoués']].map(([k, l]) => `<button data-e="${k}" class="${STAT.etat === k ? 'actif' : ''}">${l}</button>`).join('')}</div>
      <button id="st-csv">⬇ Export Excel (CSV)</button></div>
    <div class="carte"><p class="aide">${L.length} test(s) — Statistiques par candidat / reco / date.</p><div class="tableau-defile"><table class="tableau"><thead><tr><th>Stagiaire</th><th>Testeur</th><th>Reco</th><th>Catégorie</th><th>Option</th><th>Date du test</th><th>Lieu</th><th>Résultat</th></tr></thead><tbody>
    ${L.map(l => `<tr><td>${esc((l.stagiaires?.nom || '') + ' ' + (l.stagiaires?.prenom || ''))}</td><td>${esc(statNomTesteur(l.testeur_id))}</td><td>${esc(l.referentiel_code)}</td><td>${esc(l.categorie_code)}</td><td>${esc((l.options || []).join(', '))}</td><td>${dateFr(l.jour)}</td><td>${l.cdt ? 'CDT' : 'Client'}</td>
      <td style="font-weight:700;color:${l.reussi ? '#1b7c3c' : '#b2181a'}">${l.reussi ? 'Réussi' : 'Échoué'}${l.score_global != null ? ' (' + l.score_global + ')' : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
  $$('[data-e]', z).forEach(b => b.onclick = () => { STAT.etat = b.dataset.e; statDetail(z); });
  $('#st-csv').onclick = () => {
    const c = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const csv = '﻿' + [['NOM PRENOM DU STAGIAIRE', 'NOM DU TESTEUR', 'RECO', 'CATEGORIE', 'OPTION', 'DATE DU TEST', 'LIEU', 'RESULTAT'].map(c).join(';'),
      ...L.map(l => [`${l.stagiaires?.nom || ''} ${l.stagiaires?.prenom || ''}`.trim(), statNomTesteur(l.testeur_id), l.referentiel_code, l.categorie_code, (l.options || []).join(', '), dateFr(l.jour), l.cdt ? 'CDT' : 'Client', l.reussi ? 'Réussi' : 'Échoué'].map(c).join(';'))].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `statistiques_tests_${STAT.debut}_${STAT.fin}.csv`; document.body.appendChild(a); a.click(); a.remove();
  };
}

/* ---------- 4. Journées de tests par testeur + calendrier ---------- */
function statJours(z) {
  const testeurs = [...new Set(STAT.lignes.map(l => l.testeur_id))].sort((a, b) => statNomTesteur(a).localeCompare(statNomTesteur(b)));
  const jours = [...new Set(STAT.lignes.map(l => l.jour))].sort();
  const refs = [...new Set(STAT.lignes.map(l => l.referentiel_code))].sort();
  z.innerHTML = `<div class="stat-kpis"><div class="stat-kpi" style="border-top-color:#2c6fbb"><b>${jours.length}</b><span>jours de tests</span></div></div>
    <div class="carte"><h3>Journées de tests par testeur</h3><table class="tableau"><thead><tr><th>Testeur</th><th>Jours de tests</th><th>Tests réalisés</th><th>Taux de réussite</th></tr></thead><tbody>
    ${testeurs.map(t => { const L = STAT.lignes.filter(l => l.testeur_id === t), ok = L.filter(l => l.reussi).length; return `<tr><td>${esc(statNomTesteur(t))}</td><td>${new Set(L.map(l => l.jour)).size}</td><td>${L.length}</td><td>${Math.round(100 * ok / L.length)} %</td></tr>`; }).join('')}</tbody></table></div>
    <div class="carte"><h3>Calendrier des tests</h3><div class="tableau-defile"><table class="tableau stat-cal"><thead><tr><th>Date</th>${refs.map(r => `<th>${esc(r)}</th>`).join('')}</tr></thead><tbody>
    ${jours.map(j => `<tr><td>${dateFr(j)}</td>${refs.map(r => { const L = STAT.lignes.filter(l => l.jour === j && l.referentiel_code === r); const cats = {}; L.forEach(l => { cats[l.categorie_code] = (cats[l.categorie_code] || 0) + 1; });
      return `<td>${L.length ? Object.entries(cats).map(([c, n]) => `<span class="prat-badge">${esc(c)}${n > 1 ? ' ×' + n : ''}</span>`).join(' ') : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}
