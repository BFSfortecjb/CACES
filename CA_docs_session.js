/* © Jérémy Bizeul / Vigie-lance — CACES® : documents liés au CDT de la session.
   - Circuits de test : bouton « Circuit de test » dans l'écran d'évaluation, plan montré au candidat en plein écran.
   - Fiches d'exercice : proposées dans le détail de la session (CDT et référentiels de la session). */
(function () {
  const net = r => String(r || '').toUpperCase().replace(/[^R0-9]/g, '').slice(0, 4);
  async function docsPour(categorie, refs) {
    const s = S.session; if (!s) return [];
    const { data, error } = await sb.from('documents_qualite').select('*').eq('categorie', categorie).eq('actuelle', true).order('titre');
    if (error) { erreurSupabase('Lecture des documents', error); return []; }
    const rs = (refs || []).map(net);
    return (data || []).filter(d => (!d.centre_examen_id || d.centre_examen_id === s.centre_examen_id) && (!d.referentiel_code || !rs.length || rs.includes(d.referentiel_code)));
  }
  const estImage = u => /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(u);
  async function visionner(d) {
    const u = await urlDocumentQualite(d); if (!u) return toast('Aucun fichier pour ce document.', 'erreur');
    $('#grille-inrs-ecran')?.remove();
    const el = document.createElement('div'); el.id = 'grille-inrs-ecran';
    const cheminImg = estImage(d.fichier_path || d.lien || '');
    el.innerHTML = `<div class="gi-barre"><b>${esc(d.titre)}</b><a href="${esc(u)}" target="_blank" rel="noopener">Ouvrir dans un onglet</a><button type="button" class="principal" id="gi-fermer">Fermer</button></div>
      ${cheminImg ? `<div style="flex:1;overflow:auto;text-align:center"><img src="${esc(u)}" alt="" style="max-width:100%"></div>` : `<iframe src="${esc(u)}" title="${esc(d.titre)}"></iframe>`}`;
    document.body.appendChild(el); $('#gi-fermer').onclick = () => el.remove();
  }
  window.boutonCircuitTest = ref => `<button type="button" class="btn-grille-inrs btn-circuit-test" data-ref="${net(ref)}">🗺 Circuit de test</button>`;
  document.addEventListener('click', async e => {
    const b = e.target.closest?.('.btn-circuit-test'); if (!b) return;
    const l = await docsPour('circuit_test', [b.dataset.ref]);
    if (!l.length) return toast('Aucun circuit de test déposé pour ce CDT (Documents › Circuits de test).', 'erreur');
    if (l.length === 1) return visionner(l[0]);
    ouvrirModale('Circuit de test', `<ul class="liste-simple">${l.map(d => `<li><button data-ct="${d.id}">${esc(d.titre)}</button></li>`).join('')}</ul>`);
    $$('[data-ct]').forEach(x => x.addEventListener('click', () => { fermerModale(); visionner(l.find(d => d.id === x.dataset.ct)); }));
  });
  window.rendreRecommandations = async function (zone, s, cats) {
    if (!zone) return;
    const refs = [...new Set((cats || []).map(c => net(c.referentiel_code)).filter(Boolean))].sort();
    if (!refs.length) { zone.innerHTML = ''; return; }
    const { data } = await sb.from('documents_qualite').select('*').eq('categorie', 'recommandation').eq('actuelle', true).in('ref', refs.map(r => 'RECO-' + r));
    const l = data || [];
    if (!l.length) { zone.innerHTML = ''; return; }
    zone.innerHTML = `<div class="carte"><h3>📖 Recommandation de la session</h3>
      <ul class="liste-simple">${l.map(d => `<li><button type="button" data-reco="${d.id}">${esc(d.titre)}</button> <span class="aide">${esc(d.version)}</span></li>`).join('')}</ul></div>`;
    $$('[data-reco]', zone).forEach(b => b.addEventListener('click', async () => {
      const u = await urlDocumentQualite(l.find(x => x.id === b.dataset.reco));
      if (u) window.open(u, '_blank', 'noopener'); else toast('Aucun fichier pour ce document.', 'erreur');
    }));
  };
  window.rendreFichesExercice = async function (zone, s, cats) {
    if (!zone) return;
    const l = await docsPour('fiche_exercice', (cats || []).map(c => c.referentiel_code));
    if (!l.length) { zone.innerHTML = ''; return; }
    zone.innerHTML = `<div class="carte"><h3>📝 Fiches d'exercice proposées</h3><p class="aide">Selon le CDT et les référentiels de la session.</p>
      <ul class="liste-simple">${l.map(d => `<li><button type="button" data-fe="${d.id}">${esc(d.titre)}</button> <span class="aide">${esc(d.referentiel_code || '')} · v${esc(d.version)}</span></li>`).join('')}</ul></div>`;
    $$('[data-fe]', zone).forEach(b => b.addEventListener('click', async () => {
      const d = l.find(x => x.id === b.dataset.fe), u = await urlDocumentQualite(d);
      if (u) window.open(u, '_blank', 'noopener'); else toast('Aucun fichier pour ce document.', 'erreur');
    }));
  };
})();
