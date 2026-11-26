/* =====================================================================
   CA_tableau_bord.js — Organisme > Tableau de bord : suivi statistique de l'organisme (année civile en cours).
   KPI, taux de tests en CDT vs seuils, tests par mois, tests par testeur, points de vigilance (échéances, réclamations,
   documents à réviser, CACES expirant, maintien des testeurs).
   ===================================================================== */
async function rendreTableauBord(zone) {
  const an = new Date().getFullYear(), auj = new Date().toISOString().slice(0, 10);
  const d3 = new Date(); d3.setFullYear(d3.getFullYear() - 3);
  zone.innerHTML = '<p class="aide">Chargement du tableau de bord…</p>';
  const [ep, cdt, vig, rec, docs, prm, sess, stg, ep3] = await Promise.all([
    sb.from('epreuves_pratique').select('testeur_id, reussi, date_passage').eq('mode_essai', false).gte('date_passage', `${an}-01-01`).limit(20000),
    sb.from('v_taux_cdt').select('famille, nb_tests, nb_cdt, taux, seuil').eq('annee', an).order('famille'),
    sb.rpc('tableau_de_bord'),
    sb.from('reclamations').select('id', { count: 'exact', head: true }).neq('statut', 'cloturee'),
    sb.from('documents_qualite').select('titre, revision_avant').eq('actuelle', true).not('revision_avant', 'is', null),
    sb.from('parametres_application').select('delai_liste_expirant_mois').eq('id', 1).maybeSingle(),
    sb.from('sessions_formation').select('id', { count: 'exact', head: true }),
    sb.from('stagiaires').select('id', { count: 'exact', head: true }),
    sb.from('epreuves_pratique').select('testeur_id, date_passage').eq('mode_essai', false).gte('date_passage', d3.toISOString()).limit(20000),
  ]);
  const E = ep.data || [], reussis = E.filter(e => e.reussi === true).length;
  const mois = Array(12).fill(0); E.forEach(e => { const m = Number((e.date_passage || '').slice(5, 7)); if (m) mois[m - 1]++; });
  const maxMois = Math.max(1, ...mois);
  const parT = {}; E.forEach(e => { parT[e.testeur_id] = (parT[e.testeur_id] || 0) + 1; });
  // Maintien des testeurs : < 15 jours sur 3 ans
  const joursT = {}; (ep3.data || []).forEach(e => { (joursT[e.testeur_id] = joursT[e.testeur_id] || new Set()).add((e.date_passage || '').slice(0, 10)); });
  const testeurs = (S.formateurs || []).filter(f => f.est_testeur !== false && !['secretariat', 'auditeur'].includes(f.role) && f.actif !== false);
  const aSurveiller = testeurs.filter(f => (joursT[f.id]?.size || 0) < 15);
  // CACES expirant
  const lim = new Date(); lim.setMonth(lim.getMonth() + (prm.data?.delai_liste_expirant_mois || 3));
  const { count: nbExp } = await sb.from('certificats').select('id', { count: 'exact', head: true }).lte('date_expiration', lim.toISOString().slice(0, 10));
  const docsARevoir = (docs.data || []).filter(d => typeof docEtatRevision === 'function' && docEtatRevision(d)).length;
  const nom = id => typeof statNomTesteur === 'function' ? statNomTesteur(id) : id;
  const kpi = (v, l, c = '#2c6fbb', lien = '') => `<div class="stat-kpi" style="border-top-color:${c}"><b>${v}</b><span>${l}</span>${lien}</div>`;
  const vigilance = [
    ...(vig.data || []).filter(v => v.urgence && v.urgence !== 'ok' && v.urgence !== 'aucune').map(v => `${esc(v.libelle || v.categorie)}${v.nombre ? ' (' + v.nombre + ')' : ''}${v.echeance ? ' — échéance ' + dateFr(v.echeance) : ''}`),
    rec.count ? `${rec.count} réclamation(s) non clôturée(s)` : '', docsARevoir ? `${docsARevoir} document(s) à réviser` : '',
    nbExp ? `${nbExp} CACES expirant d'ici ${prm.data?.delai_liste_expirant_mois || 3} mois (ou déjà expirés)` : '',
    aSurveiller.length ? `${aSurveiller.length} testeur(s) sous 15 jours de tests sur 3 ans : ${aSurveiller.map(f => esc(nom(f.id))).join(', ')}` : '',
  ].filter(Boolean);
  zone.innerHTML = `<div class="barre-actions"><h2>📈 Tableau de bord — ${an}</h2></div>
    <div class="stat-kpis">
      ${kpi(E.length, 'tests pratiques réalisés')}
      ${kpi(E.length ? Math.round(100 * reussis / E.length) + ' %' : '—', 'taux de réussite', '#1b7c3c')}
      ${kpi(sess.count ?? '—', 'sessions (total)', '#6a5acd')}
      ${kpi(stg.count ?? '—', 'candidats (total)', '#6a5acd')}
      ${kpi(vigilance.length, 'point(s) de vigilance', vigilance.length ? '#c97a02' : '#1b7c3c')}</div>
    <div class="carte"><h3>⚠ Points de vigilance</h3>${vigilance.length ? `<ul>${vigilance.map(v => `<li>${v}</li>`).join('')}</ul>` : '<p class="aide">Rien à signaler.</p>'}</div>
    <div class="carte"><h3>Tests en CDT par recommandation ${an}</h3><p class="aide">Minimum du référentiel (§4.7) ; détail dans Statistiques > Conformité CDT.</p>
      ${(cdt.data || []).map(x => { const ok = Number(x.taux) >= Number(x.seuil);
        return `<div class="stat-ligne"><div class="stat-nom">${esc(x.famille)} — ${x.taux} % <span class="aide">(minimum ${x.seuil} % — ${x.nb_cdt}/${x.nb_tests} tests)</span> <b style="color:${ok ? '#1b7c3c' : '#b2181a'}">${ok ? 'OK' : 'Sous le minimum'}</b></div>
          <div style="background:#e5e8ec;border-radius:6px;height:12px;position:relative"><div style="width:${Math.min(100, x.taux)}%;background:${ok ? '#1b7c3c' : '#b2181a'};height:12px;border-radius:6px"></div>
          <div style="position:absolute;left:${x.seuil}%;top:-2px;width:2px;height:16px;background:#000"></div></div></div>`; }).join('') || '<p class="aide">Aucun test cette année.</p>'}</div>
    <div class="carte"><h3>Tests par mois</h3><div style="display:flex;gap:6px;align-items:flex-end;height:120px">
      ${mois.map((n, i) => `<div style="flex:1;text-align:center"><div title="${n}" style="background:#f3ab12;height:${Math.round(100 * n / maxMois)}px;border-radius:3px 3px 0 0"></div>
        <div class="aide">${['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][i]}<br>${n || ''}</div></div>`).join('')}</div></div>
    <div class="carte"><h3>Tests par testeur ${an}</h3><table class="tableau"><thead><tr><th>Testeur</th><th>Tests</th></tr></thead><tbody>
      ${Object.entries(parT).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<tr><td>${esc(nom(t))}</td><td>${n}</td></tr>`).join('') || '<tr><td colspan="2" class="aide">Aucun test.</td></tr>'}</tbody></table></div>`;
}
