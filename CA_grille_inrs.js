/* © Jérémy Bizeul / Vigie-lance — CACES® : grilles d'évaluation INRS/Cnam (annexe 3 des recommandations) consultables pendant le test.
   PDF extraits des recommandations (assets/grilles_inrs/Rxxx.pdf), mis en cache hors ligne par le service worker. */
(function () {
  // Page de départ dans le PDF extrait, selon la catégorie (défaut : 1).
  const PAGES = {
    R482: { A: 1, B1: 3, B2: 4, B3: 6, C1: 7, C2: 8, C3: 9, D: 10, E: 11, F: 12, G: 13 },
    R484: { '1': 1, '2': 2 }, R486: { A: 1, B: 3, C: 5 },
    R489: { '1': 1, '2': 2, '3': 3, '4': 5, '5': 6, '6': 7, '7': 8 }
  };
  const REFS = ['R482', 'R483', 'R484', 'R485', 'R486', 'R487', 'R489', 'R490'];
  const refNet = r => String(r || '').toUpperCase().replace(/[^R0-9]/g, '').slice(0, 4);
  function page(ref, cat) {
    const t = PAGES[ref] || {}, c = String(cat || '').toUpperCase();
    return t[c] || t[c.replace(/[AB]$/, '')] || t[c.charAt(0)] || 1;
  }
  window.grilleInrsDispo = ref => REFS.includes(refNet(ref));
  window.boutonGrilleInrs = (ref, cat) => window.grilleInrsDispo(ref)
    ? `<button type="button" class="btn-grille-inrs" data-ref="${refNet(ref)}" data-cat="${String(cat || '').replace(/[^A-Za-z0-9]/g, '')}">📋 Grille INRS ${refNet(ref)}</button>` : '';
  window.ouvrirGrilleInrs = (ref, cat) => {
    ref = refNet(ref);
    const url = `assets/grilles_inrs/${ref}.pdf`, src = `${url}#page=${page(ref, cat)}`;
    $('#grille-inrs-ecran')?.remove();
    const d = document.createElement('div');
    d.id = 'grille-inrs-ecran';
    d.innerHTML = `<div class="gi-barre"><b>Grille d'évaluation ${esc(ref)} — annexe 3 (INRS / Cnam)</b>
      <a href="${src}" target="_blank" rel="noopener">Ouvrir dans un onglet</a>
      <button type="button" class="principal" id="gi-fermer">Fermer</button></div>
      <iframe src="${src}" title="Grille ${esc(ref)}"></iframe>`;
    document.body.appendChild(d);
    $('#gi-fermer').onclick = () => d.remove();
  };
  document.addEventListener('click', e => {
    const b = e.target.closest?.('.btn-grille-inrs');
    if (b) window.ouvrirGrilleInrs(b.dataset.ref, b.dataset.cat);
  });
})();
