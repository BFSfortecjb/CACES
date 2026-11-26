/* =====================================================================
   CA_espace_doc.js — Espace documentaire versionné (référentiel §4.9.4 / §4.9.5).
   Catégories : FAQ CACES® officielle (CNAM/INRS), fiches d'exercice, grille INRS, procédures, veille, autres.
   Chaque document a une version, une date, « validé par / le », une échéance de révision (alerte) et un lien ou un fichier.
   Lecture : tous les comptes. Ajout / nouvelle version : administrateur. L'historique des versions est conservé.
   ===================================================================== */
const CAT_DOC = { recommandation: 'Recommandations CACES® et textes de référence', faq_caces: 'FAQ CACES® officielle', fiche_exercice: 'Fiches d\'exercice', grille_inrs: 'Grille INRS', procedure: 'Procédures', veille: 'Veille réglementaire', autre: 'Autres' };

function docEtatRevision(d) {
  if (!d.revision_avant) return '';
  const j = Math.ceil((new Date(d.revision_avant) - new Date(new Date().toISOString().slice(0, 10))) / 86400000);
  return j < 0 ? 'retard' : j <= 30 ? 'proche' : '';
}

async function urlDocumentQualite(d) {
  if (d.lien) return d.lien;
  if (!d.fichier_path) return '';
  const { data } = await sb.storage.from('caces-documents').createSignedUrl(d.fichier_path, 600);
  return data?.signedUrl || '';
}

async function rendreEspaceDoc(zone) {
  const admin = S.profil?.role === 'admin';
  const { data, error } = await sb.from('documents_qualite').select('*').order('categorie').order('titre').order('date_version', { ascending: false });
  if (error) return erreurSupabase('Lecture des documents', error);
  const tous = data || [], actuels = tous.filter(d => d.actuelle);
  zone.innerHTML = `<div class="barre-actions"><h2>📚 Documents</h2>${admin ? '<button class="principal" id="doc-nouv">+ Nouveau document</button>' : ''}</div>
    <p class="aide">Versions maîtrisées (référentiel §4.9.4) : seule la version actuelle est proposée ; l'historique est conservé. La FAQ est la <b>FAQ CACES® officielle</b>.</p>
    ${Object.entries(CAT_DOC).map(([k, lib]) => {
      const l = actuels.filter(d => d.categorie === k || (k === 'autre' && !CAT_DOC[d.categorie])); if (!l.length) return '';
      return `<div class="carte"><h3>${lib}</h3><table class="tableau"><thead><tr><th>Document</th><th>Version</th><th>Date</th><th>Validé par</th><th>Révision avant</th><th></th></tr></thead><tbody>
      ${l.map(d => { const e = docEtatRevision(d); const nb = tous.filter(x => x.ref === d.ref).length;
        return `<tr><td><b>${esc(d.titre)}</b><div class="aide">${esc(d.ref)}${d.notes ? ' — ' + esc(d.notes) : ''}</div></td><td>${esc(d.version)}</td><td>${dateFr(d.date_version)}</td>
        <td>${esc(d.valide_par || '')}${d.valide_le ? ' le ' + dateFr(d.valide_le) : ''}</td>
        <td>${d.revision_avant ? dateFr(d.revision_avant) : ''} ${e === 'retard' ? '<b style="color:#b2181a">En retard</b>' : e === 'proche' ? '<b style="color:#c97a02">Bientôt</b>' : ''}</td>
        <td><button data-o="${d.id}">Ouvrir</button> ${nb > 1 ? `<button data-h="${esc(d.ref)}">Historique (${nb})</button>` : ''}
        ${admin ? `<button data-v="${d.id}">Nouvelle version</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
    }).join('') || '<div class="carte"><p class="aide">Aucun document pour l\'instant.</p></div>'}`;
  $$('[data-o]', zone).forEach(b => b.addEventListener('click', async () => {
    const u = await urlDocumentQualite(tous.find(d => d.id === b.dataset.o));
    if (u) window.open(u, '_blank', 'noopener'); else toast('Aucun lien ni fichier pour ce document.', 'erreur');
  }));
  $$('[data-h]', zone).forEach(b => b.addEventListener('click', () => {
    const h = tous.filter(d => d.ref === b.dataset.h);
    ouvrirModale('Historique — ' + h[0].titre, `<table class="tableau"><thead><tr><th>Version</th><th>Date</th><th>Validé par</th><th></th></tr></thead><tbody>
      ${h.map(d => `<tr><td>${esc(d.version)}${d.actuelle ? ' (actuelle)' : ''}</td><td>${dateFr(d.date_version)}</td><td>${esc(d.valide_par || '')}</td><td><button data-oh="${d.id}">Ouvrir</button></td></tr>`).join('')}</tbody></table>`);
    $$('[data-oh]').forEach(x => x.addEventListener('click', async () => { const u = await urlDocumentQualite(h.find(d => d.id === x.dataset.oh)); if (u) window.open(u, '_blank', 'noopener'); }));
  }));
  if (admin) {
    $('#doc-nouv', zone)?.addEventListener('click', () => formDocQualite(null));
    $$('[data-v]', zone).forEach(b => b.addEventListener('click', () => formDocQualite(tous.find(d => d.id === b.dataset.v))));
  }
}

function formDocQualite(base) {
  const nv = !!base;
  ouvrirModale(nv ? 'Nouvelle version — ' + base.titre : 'Nouveau document', `<form id="doc-form" class="grille-form">
    <label>Catégorie <select name="categorie" ${nv ? 'disabled' : ''}>${Object.entries(CAT_DOC).map(([k, v]) => `<option value="${k}" ${base?.categorie === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>Titre <input name="titre" value="${esc(base?.titre || '')}" required></label>
    <label>Référence <input name="ref" value="${esc(base?.ref || '')}" placeholder="ex. FAQ-CACES" ${nv ? 'readonly' : ''} required></label>
    <label>Version <input name="version" required placeholder="ex. 2"></label>
    <label>Date de la version <input type="date" name="date_version" value="${new Date().toISOString().slice(0, 10)}" required></label>
    <label>Validé par <input name="valide_par"></label>
    <label>Validé le <input type="date" name="valide_le"></label>
    <label>À réviser avant le <input type="date" name="revision_avant"></label>
    <label>Lien (site officiel, Drive…) <input type="url" name="lien" value="${esc(base?.lien || '')}"></label>
    <label>ou fichier <input type="file" name="fichier"></label>
    <label>Notes <textarea name="notes" rows="2">${esc(base?.notes || '')}</textarea></label>
    <div class="pied-modale"><button type="submit" class="principal">Enregistrer</button></div></form>`);
  $('#doc-form').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target; let chemin = null;
    if (!f.lien.value.trim() && !f.fichier.files[0]) return toast('Indique un lien ou choisis un fichier.', 'erreur');
    if (f.fichier.files[0]) {
      const fic = f.fichier.files[0];
      chemin = `${f.ref.value.trim().replace(/[^\w.-]+/g, '_')}/${Date.now()}_${fic.name.replace(/[^\w.-]+/g, '_')}`;
      const { error: e1 } = await sb.storage.from('caces-documents').upload(chemin, fic, { upsert: false });
      if (e1) return erreurSupabase('Envoi du fichier', e1);
    }
    const { error } = await sb.from('documents_qualite').insert({ ref: f.ref.value.trim(), categorie: base?.categorie || f.categorie.value, titre: f.titre.value.trim(),
      version: f.version.value.trim(), date_version: f.date_version.value, valide_par: f.valide_par.value.trim() || null, valide_le: f.valide_le.value || null,
      revision_avant: f.revision_avant.value || null, lien: f.lien.value.trim() || null, fichier_path: chemin, notes: f.notes.value.trim() || null, actuelle: true });
    if (error) return erreurSupabase('Enregistrement du document', error);
    fermerModale(); rendreEspaceDoc($('#contenu'));
  });
}

/** Bandeau admin : documents à réviser (≤ 30 jours ou en retard). */
async function rendreAlerteDocuments(zone) {
  if (!zone || S.profil?.role !== 'admin') return;
  const { data } = await sb.from('documents_qualite').select('titre, version, revision_avant').eq('actuelle', true).not('revision_avant', 'is', null);
  const l = (data || []).filter(d => docEtatRevision(d));
  if (!l.length) { zone.innerHTML = ''; return; }
  zone.innerHTML = `<div class="carte" style="border-left:4px solid #c97a02"><b>📚 ${l.length} document(s) à réviser</b> : ${l.map(d => `${esc(d.titre)} (avant le ${dateFr(d.revision_avant)})`).join(' ; ')}
    <button class="lien" onclick="retour('docqualite')">Ouvrir les documents</button></div>`;
}
