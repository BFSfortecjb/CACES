/* =====================================================================
   CA_diffusion.js — Diffusion tracée des documents : à l'ouverture de l'application, les personnes concernées doivent OUVRIR chaque document
   diffusé puis ACCUSER RÉCEPTION avant d'accéder à l'application (sessions, tableau de bord de session…).
   © 2026 Jérémy Bizeul — Vigie-lance, pour BFS Prévention. Base : fonctions documents_a_acquitter / document_ouvert / document_acquitter (patch bo).
   ===================================================================== */
async function verifierDiffusions() {
  try { const { data } = await sb.rpc('documents_a_acquitter'); return data || []; } catch (_e) { return []; }   // jamais bloquant en cas d'erreur technique
}

function afficherDiffusions(cible, liste) {
  const ouverts = new Set(liste.filter(d => d.ouvert_le).map(d => d.id)), faits = new Set();
  cible.innerHTML = `<div class="diffusion-ecran"><div class="carte">
    ${typeof logoImg === 'function' ? logoImg('logo-entete') : ''}<h2>Documents à lire avant de continuer</h2>
    <p class="aide">Ces documents vous sont diffusés. Ouvrez chacun d'eux, puis accusez réception : l'application reste verrouillée tant que ce n'est pas fait.</p>
    <div id="diff-liste"></div></div></div>`;
  const dessiner = () => {
    const reste = liste.filter(d => !faits.has(d.id));
    if (!reste.length) { S._diffusionsOk = true; return router(); }
    $('#diff-liste', cible).innerHTML = reste.map(d => `<div class="diff-doc">
      <div><b>${esc(d.titre)}</b> <span class="aide">— version ${esc(d.version)} du ${dateFr(d.date_version)}</span>${d.notes ? `<div class="aide">${esc(d.notes)}</div>` : ''}</div>
      <div class="diff-actions"><button data-o="${d.id}" class="${ouverts.has(d.id) ? '' : 'principal'}">${ouverts.has(d.id) ? '📄 Ouvrir à nouveau' : '📄 Ouvrir le document'}</button>
        <button data-a="${d.id}" class="${ouverts.has(d.id) ? 'principal' : ''}" ${ouverts.has(d.id) ? '' : 'disabled title="Ouvrez d abord le document"'}>✔ J'ai lu et j'accuse réception</button></div></div>`).join('');
    $$('[data-o]', cible).forEach(b => b.addEventListener('click', async () => {
      const d = liste.find(x => x.id === b.dataset.o);
      const url = d.lien || (d.fichier_path ? (await sb.storage.from('caces-documents').createSignedUrl(d.fichier_path, 600)).data?.signedUrl : '');
      if (!url) return toast('Document introuvable : prévenez un administrateur.', 'erreur');
      const { error } = await sb.rpc('document_ouvert', { p_doc: d.id });
      if (error) return erreurSupabase('Ouverture du document', error);
      window.open(url, '_blank', 'noopener'); ouverts.add(d.id); dessiner();
    }));
    $$('[data-a]', cible).forEach(b => b.addEventListener('click', async () => {
      const { error } = await sb.rpc('document_acquitter', { p_doc: b.dataset.a });
      if (error) return erreurSupabase('Accusé de réception', error);
      faits.add(b.dataset.a); toast('Accusé de réception enregistré'); dessiner();
    }));
  };
  dessiner();
}
