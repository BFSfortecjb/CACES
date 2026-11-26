/* =====================================================================
   CA_espace_doc.js — Espace documentaire versionné (référentiel §4.9.4 / §4.9.5).
   Catégories : FAQ CACES® officielle (CNAM/INRS), fiches d'exercice, grille INRS, procédures, veille, autres.
   Chaque document a une version, une date, « validé par / le », une échéance de révision (alerte) et un lien ou un fichier.
   Lecture : tous les comptes. Ajout / nouvelle version : administrateur. L'historique des versions est conservé.
   ===================================================================== */
const CAT_DOC = { recommandation: 'Recommandations CACES® et textes de référence', faq_caces: 'FAQ CACES® officielle', fiche_exercice: 'Fiches d\'exercice', circuit_test: 'Circuits de test (par CDT)', dossier_cdt: 'Dossier CDT (plans, photos, conventions)', grille_inrs: 'Grille INRS', procedure: 'Procédures', veille: 'Veille réglementaire', autre: 'Autres' };

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
        return `<tr><td><b>${esc(d.titre)}</b>${d.diffusion_tracee ? ' <span class="faq-nouveau" title="Accusé de réception obligatoire">Diffusion tracée</span>' : ''}<div class="aide">${esc(d.ref)}${d.notes ? ' — ' + esc(d.notes) : ''}</div></td><td>${esc(d.version)}</td><td>${dateFr(d.date_version)}</td>
        <td>${esc(d.valide_par || '')}${d.valide_le ? ' le ' + dateFr(d.valide_le) : ''}</td>
        <td>${d.revision_avant ? dateFr(d.revision_avant) : ''} ${e === 'retard' ? '<b style="color:#b2181a">En retard</b>' : e === 'proche' ? '<b style="color:#c97a02">Bientôt</b>' : ''}</td>
        <td><button data-o="${d.id}">Ouvrir</button> ${nb > 1 ? `<button data-h="${esc(d.ref)}">Historique (${nb})</button>` : ''}
        ${admin && d.diffusion_tracee ? `<button data-s="${d.id}" title="Qui a ouvert et accusé réception">Suivi de diffusion</button>` : ''}
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
  $$('[data-s]', zone).forEach(b => b.addEventListener('click', () => suiviDiffusion(b.dataset.s)));
  if (admin) {
    $('#doc-nouv', zone)?.addEventListener('click', () => formDocQualite(null));
    $$('[data-v]', zone).forEach(b => b.addEventListener('click', () => formDocQualite(tous.find(d => d.id === b.dataset.v))));
  }
}

const CIBLES_DIFFUSION = { formateur: 'Formateurs', testeur: 'Testeurs', secretariat: 'Secrétariat', admin: 'Administrateurs', auditeur: 'Auditeurs' };

function formDocQualite(base) {
  const nv = !!base, cib = new Set(base?.diffusion_cibles || []);
  ouvrirModale(nv ? 'Nouvelle version — ' + base.titre : 'Nouveau document', `<form id="doc-form" class="formulaire doc-form">
    <fieldset><legend>Le document</legend><div class="grille-2">
      <label class="plein">Titre <input type="text" name="titre" value="${esc(base?.titre || '')}" required></label>
      <label>Catégorie <select name="categorie" ${nv ? 'disabled' : ''}>${Object.entries(CAT_DOC).map(([k, v]) => `<option value="${k}" ${base?.categorie === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Référence <input type="text" name="ref" value="${esc(base?.ref || '')}" placeholder="ex. FAQ-CACES" ${nv ? 'readonly' : ''} required></label>
      <label>Version <input type="text" name="version" required placeholder="ex. 2"></label>
      <label>Date de la version <input type="date" name="date_version" value="${new Date().toISOString().slice(0, 10)}" required></label></div></fieldset>
    <fieldset id="doc-portee" ${['fiche_exercice', 'circuit_test'].includes(base?.categorie || 'recommandation') ? '' : 'hidden'}><legend>Portée (CDT et référentiel)</legend><div class="grille-2">
      <label>CDT concerné <select name="centre"><option value="">Tous les CDT</option>${(S.referentiel?.centres || []).filter(c => c.actif !== false).map(c => `<option value="${c.id}" ${base?.centre_examen_id === c.id ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')}</select></label>
      <label>Référentiel <select name="refcode"><option value="">Tous</option>${['R482', 'R483', 'R484', 'R485', 'R486', 'R487', 'R489', 'R490'].map(r => `<option ${base?.referentiel_code === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label></div>
      <p class="aide">Circuit de test : montré au candidat depuis l'écran de test. Fiche d'exercice : proposée dans la session du CDT concerné.</p></fieldset>
    <fieldset><legend>Contenu (un lien OU un fichier)</legend><div class="grille-2">
      <label>Lien (site officiel, Drive…) <input type="url" name="lien" value="${esc(base?.lien || '')}" placeholder="https://…"></label>
      <label>Fichier <input type="file" name="fichier"></label></div></fieldset>
    <fieldset><legend>Validation et révision</legend><div class="grille-3">
      <label>Validé par <select name="valide_par"><option value="">— choisir —</option>${(S.formateurs || [])
        .filter(f => f.actif !== false && ['formateur', 'admin'].includes(f.role) && f.statut_bfs !== 'externe')
        .map(f => `${f.nom || ''} ${f.prenom || ''}`.trim() || f.email).sort((a, b) => a.localeCompare(b, 'fr'))
        .map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select></label>
      <label>Validé le <input type="date" name="valide_le"></label>
      <label>À réviser avant le <input type="date" name="revision_avant"></label></div></fieldset>
    <fieldset><legend>Diffusion</legend>
      <label class="case"><input type="checkbox" name="diffusion" ${base?.diffusion_tracee ? 'checked' : ''}> <b>Diffusion tracée</b> — les personnes concernées doivent ouvrir le document et accuser réception avant d'accéder à l'application</label>
      <div id="doc-cibles" class="doc-cibles" ${base?.diffusion_tracee ? '' : 'hidden'}><span class="aide">Personnes concernées :</span>
        ${Object.entries(CIBLES_DIFFUSION).map(([k, v]) => `<label class="case"><input type="checkbox" name="cible" value="${k}" ${cib.has(k) ? 'checked' : ''}> ${v}</label>`).join('')}
        <p class="aide">Chaque nouvelle version redemande un accusé de réception. Le suivi (qui a ouvert, qui a acquitté) est consultable sur la liste des documents.</p></div></fieldset>
    <label>Notes <textarea name="notes" rows="2">${esc(base?.notes || '')}</textarea></label>
    <div class="pied-modale"><button type="button" onclick="fermerModale()">Annuler</button><button type="submit" class="principal">Enregistrer</button></div></form>`);
  const f0 = $('#doc-form');
  f0.categorie?.addEventListener('change', () => { $('#doc-portee').hidden = !['fiche_exercice', 'circuit_test'].includes(f0.categorie.value); });
  f0.diffusion.addEventListener('change', () => { $('#doc-cibles').hidden = !f0.diffusion.checked; });
  f0.addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target; let chemin = null;
    if (!f.lien.value.trim() && !f.fichier.files[0]) return toast('Indique un lien ou choisis un fichier.', 'erreur');
    const cibles = $$('#doc-form input[name=cible]:checked').map(i => i.value);
    if (f.diffusion.checked && !cibles.length) return toast('Choisis au moins un profil concerné par la diffusion.', 'erreur');
    if (f.fichier.files[0]) {
      const fic = f.fichier.files[0];
      chemin = `${f.ref.value.trim().replace(/[^\w.-]+/g, '_')}/${Date.now()}_${fic.name.replace(/[^\w.-]+/g, '_')}`;
      const { error: e1 } = await sb.storage.from('caces-documents').upload(chemin, fic, { upsert: false });
      if (e1) return erreurSupabase('Envoi du fichier', e1);
    }
    const { error } = await sb.from('documents_qualite').insert({ ref: f.ref.value.trim(), categorie: base?.categorie || f.categorie.value, titre: f.titre.value.trim(),
      version: f.version.value.trim(), date_version: f.date_version.value, valide_par: f.valide_par.value || null, valide_le: f.valide_le.value || null,
      revision_avant: f.revision_avant.value || null, lien: f.lien.value.trim() || null, fichier_path: chemin, notes: f.notes.value.trim() || null, actuelle: true,
      centre_examen_id: ['fiche_exercice', 'circuit_test'].includes(base?.categorie || f.categorie.value) && f.centre.value ? Number(f.centre.value) : null,
      referentiel_code: ['fiche_exercice', 'circuit_test'].includes(base?.categorie || f.categorie.value) && f.refcode.value ? f.refcode.value : null,
      diffusion_tracee: f.diffusion.checked, diffusion_cibles: f.diffusion.checked ? cibles : [] });
    if (error) return erreurSupabase('Enregistrement du document', error);
    fermerModale(); rendreEspaceDoc($('#contenu'));
  });
}

/** Suivi de diffusion (admin) : qui est concerné, qui a ouvert, qui a accusé réception. */
async function suiviDiffusion(docId) {
  const [{ data: d }, { data: acc }] = await Promise.all([sb.from('documents_qualite').select('*').eq('id', docId).single(), sb.from('document_accuses').select('*').eq('document_id', docId)]);
  if (!d) return;
  const cib = new Set(d.diffusion_cibles || []);
  const concernes = (S.formateurs || []).filter(f => f.actif !== false && (cib.has(f.role) || (cib.has('testeur') && ['formateur', 'admin'].includes(f.role) && f.est_testeur !== false)));
  const a = Object.fromEntries((acc || []).map(x => [x.personne_id, x]));
  const ok = concernes.filter(f => a[f.id]?.accuse_le).length;
  const fmt = v => v ? new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  ouvrirModale('Suivi de diffusion — ' + d.titre, `<p><b>${ok} / ${concernes.length}</b> accusé(s) de réception — version ${esc(d.version)} — profils : ${esc([...cib].map(k => CIBLES_DIFFUSION[k] || k).join(', '))}</p>
    <table class="tableau"><thead><tr><th>Personne</th><th>Profil</th><th>Ouvert le</th><th>Accusé de réception</th></tr></thead><tbody>
    ${concernes.map(f => `<tr><td>${esc(`${f.nom || ''} ${f.prenom || ''}`.trim() || f.email)}</td><td>${esc(f.role)}</td><td>${fmt(a[f.id]?.ouvert_le)}</td>
      <td>${a[f.id]?.accuse_le ? '<b style="color:#1b7c3c">✔ ' + fmt(a[f.id].accuse_le) + '</b>' : '<b style="color:#b2181a">En attente</b>'}</td></tr>`).join('') || '<tr><td colspan="4" class="aide">Personne de concerné.</td></tr>'}</tbody></table>`);
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
