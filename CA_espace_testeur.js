/* =====================================================================
   CA_espace_testeur.js — « Mon espace » (visible par le testeur seul) :
   Mes statistiques (tests réalisés, réussite, jours sur 3 ans, par catégorie, par année), Mes paramètres (code à 4 chiffres, dans CA_testeurs.js),
   Grilles pratiques en consultation (CA_admin.js).
   ===================================================================== */
async function rendreMesStats(zone) {
  const moi = S.profil?.id;
  const debut3 = new Date(); debut3.setFullYear(debut3.getFullYear() - 3);
  const { data, error } = await sb.from('epreuves_pratique').select('stagiaire_id, referentiel_code, categorie_code, date_passage, reussi, session_id, sessions_formation(en_cdt)')
    .eq('testeur_id', moi).eq('mode_essai', false).order('date_passage', { ascending: false }).limit(20000);
  if (error) return erreurSupabase('Lecture de mes tests', error);
  const L = data || [], jour = e => (e.date_passage || '').slice(0, 10);
  const ok = L.filter(e => e.reussi === true).length;
  const recents = L.filter(e => new Date(e.date_passage) >= debut3);
  const jours3 = new Set(recents.map(jour)).size;
  const parCat = {}; recents.forEach(e => { const k = `${e.referentiel_code} ${e.categorie_code}`; (parCat[k] = parCat[k] || { n: 0, ok: 0, j: new Set() }); parCat[k].n++; if (e.reussi) parCat[k].ok++; parCat[k].j.add(jour(e)); });
  const parAn = {}; L.forEach(e => { const a = jour(e).slice(0, 4); (parAn[a] = parAn[a] || { n: 0, ok: 0 }); parAn[a].n++; if (e.reussi) parAn[a].ok++; });
  const pct = (a, b) => b ? Math.round(100 * a / b) + ' %' : '—';
  zone.innerHTML = `<div class="barre-actions"><h2>Mes statistiques</h2></div>
    <div class="stat-kpis">
      <div class="stat-kpi"><b>${L.length}</b><span>tests réalisés (total)</span></div>
      <div class="stat-kpi" style="border-top-color:#1b7c3c"><b>${pct(ok, L.length)}</b><span>taux de réussite</span></div>
      <div class="stat-kpi" style="border-top-color:${jours3 >= 15 ? '#1b7c3c' : '#c97a02'}"><b>${jours3} / 15</b><span>jours de tests sur 3 ans</span></div></div>
    <div class="carte"><h3>Par catégorie (3 ans glissants)</h3><p class="aide">Rappel du référentiel : 15 jours de tests sur 3 ans et au moins 1 jour par catégorie d'habilitation.</p>
      <table class="tableau"><thead><tr><th>Catégorie</th><th>Tests</th><th>Réussis</th><th>Jours</th></tr></thead><tbody>
      ${Object.entries(parCat).sort().map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.n}</td><td>${pct(v.ok, v.n)}</td><td>${v.j.size}</td></tr>`).join('') || '<tr><td colspan="4" class="aide">Aucun test sur 3 ans.</td></tr>'}</tbody></table></div>
    <div class="carte"><h3>Par année</h3><table class="tableau"><thead><tr><th>Année</th><th>Tests</th><th>Taux de réussite</th></tr></thead><tbody>
      ${Object.entries(parAn).sort().reverse().map(([a, v]) => `<tr><td>${a}</td><td>${v.n}</td><td>${pct(v.ok, v.n)}</td></tr>`).join('') || '<tr><td colspan="3" class="aide">Aucun test.</td></tr>'}</tbody></table></div>`;
}
