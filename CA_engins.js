/* =====================================================================
   CA_engins.js — parc d'engins et engins d'une session

   Exigence du référentiel de certification (§4.4.2) : liste du matériel
   utilisé pour les tests (provenance, marque, modèle, n° de série), avec ses
   justificatifs (déclaration CE / certificat de conformité, VGP, examen
   d'adéquation...). Un engin (surtout loué) est enregistré UNE fois : à son
   retour on ne dépose que les nouveaux documents. Les photos des documents
   sont stockées sur Google Drive ; la base garde seulement les références.
   ===================================================================== */

const PROVENANCES = { propriete: 'Propriété du centre', location: 'Location', pret: 'Prêt' };
const LIBELLE_STATUT_DOC = {
  ok: 'À jour', bientot: 'Échéance proche', expire: 'Expiré', a_completer: 'Échéance à saisir',
  observations: 'Observations non levées', manquant: 'Manquant',
};
const CLASSE_STATUT_DOC = {
  ok: 'ok', bientot: 'avertissement', expire: 'ko', a_completer: 'avertissement', observations: 'ko', manquant: 'ko',
};
const NIVEAUX_AVIS = { ok: '👍 RAS', vigilance: '⚠ Vigilance', deconseille: '⛔ Déconseillé' };

const pastilleEtat = etat => {
  const m = { vert: ['ok', 'Documents à jour'], orange: ['avertissement', 'À surveiller'], rouge: ['ko', 'Document manquant ou expiré'] }[etat]
    || ['neutre', 'Inconnu'];
  return `<span class="etat ${m[0]}" title="${esc(m[1])}">${esc(m[1])}</span>`;
};

const libelleEngin = e => [e.designation, e.marque, e.modele, e.numero_serie ? 'n°' + e.numero_serie : '']
  .filter(Boolean).join(' ');

/* ====================== Parc d'engins (onglet Organisme) ============== */
async function rendreParcEngins(zone) {
  zone.innerHTML = '<p class="chargement">Chargement du parc…</p>';
  const [{ data: engins, error }, { data: etats }] = await Promise.all([
    sb.from('engins').select('*').order('designation'),
    sb.from('v_engins_statut').select('*'),
  ]);
  if (error) return erreurSupabase('Lecture du parc d\'engins', error);
  const etat = Object.fromEntries((etats || []).map(x => [x.engin_id, x.etat]));
  const peutEcrire = ['formateur', 'admin'].includes(S.profil?.role);

  zone.innerHTML = `
    <div class="barre-actions"><h3>Parc d'engins (${(engins || []).length})</h3>
      <div><input type="search" id="filtre-engins" placeholder="Rechercher (désignation, marque, n° de série…)" style="min-width:260px">
        <select id="filtre-prov"><option value="">Toutes provenances</option>
          ${Object.entries(PROVENANCES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        ${peutEcrire ? '<button class="principal" onclick="ouvrirFicheEngin(null)">+ Ajouter un engin</button>' : ''}</div></div>
    <table class="tableau"><thead><tr><th>Engin</th><th>Marque / modèle</th><th>N° de série</th><th>Provenance</th><th>Catégories</th><th>Documents</th><th></th></tr></thead>
    <tbody id="liste-engins"></tbody></table>`;

  const afficher = () => {
    const q = cleEntete($('#filtre-engins').value), prov = $('#filtre-prov').value;
    const liste = (engins || []).filter(e => (!prov || e.provenance === prov)
      && (!q || cleEntete([e.designation, e.marque, e.modele, e.numero_serie, e.proprietaire].join(' ')).includes(q)));
    $('#liste-engins').innerHTML = liste.map(e => `<tr class="${e.actif ? '' : 'inactif'}">
      <td>${esc(e.designation)}${e.actif ? '' : ' <i>(retiré)</i>'}</td>
      <td>${esc([e.marque, e.modele].filter(Boolean).join(' '))}</td><td>${esc(e.numero_serie)}</td>
      <td>${esc(PROVENANCES[e.provenance])}${e.proprietaire ? ' — ' + esc(e.proprietaire) : ''}</td>
      <td>${esc((e.categories || []).join(', '))}</td><td>${pastilleEtat(etat[e.id])}</td>
      <td><button class="icone" title="Fiche, documents et avis" onclick="ouvrirFicheEngin('${e.id}')">📄</button></td></tr>`).join('')
      || '<tr><td colspan="7" class="vide">Aucun engin.</td></tr>';
  };
  $('#filtre-engins').addEventListener('input', afficher);
  $('#filtre-prov').addEventListener('change', afficher);
  afficher();
}

// Types d'engin connus des grilles pratiques (variantes « GROUPE/TYPE », ex. N°2/MB) + valeur déjà saisie
function typesEnginOptions(courant) {
  const types = [...new Set((S.referentiel.criteres || []).map(c => c.variante).filter(v => v && v.includes('/')).map(v => v.split('/')[1]))].sort();
  if (courant && !types.includes(courant)) types.push(courant);
  return '<option value="">— sans objet —</option>' + types.map(t => `<option value="${esc(t)}" ${t === courant ? 'selected' : ''}>${esc(t)}</option>`).join('');
}

/* ====================== Fiche d'un engin ============================== */
// contexte : { session } si la fiche est ouverte depuis une session (les photos vont dans son dossier Drive)
async function ouvrirFicheEngin(id, contexte = {}) {
  let e = { designation: '', type_engin: '', referentiel_code: '', categories: [], marque: '', modele: '', numero_serie: '',
    annee: '', provenance: 'propriete', proprietaire: '', soumis_vgp: true, notes: '', actif: true };
  if (id) {
    const { data, error } = await sb.from('engins').select('*').eq('id', id).single();
    if (error) return erreurSupabase('Lecture de l\'engin', error);
    e = data;
  }
  const peutEcrire = ['formateur', 'admin'].includes(S.profil?.role);
  const cats = S.referentiel.categories;
  ouvrirModale(id ? libelleEngin(e) : 'Nouvel engin', `
    <form id="form-engin" class="formulaire">
      <div class="grille-2">
        <label>Désignation <input name="designation" required value="${esc(e.designation)}" placeholder="Ex : Pelle hydraulique 21 t"></label>
        <label>Type d'engin <select name="type_engin">${typesEnginOptions(e.type_engin)}</select>
          <span class="aide">Sert à choisir automatiquement la bonne grille pratique (ex. R482A cat. A : MB, CH ou CP).</span></label>
        <label>Marque <input name="marque" value="${esc(e.marque || '')}"></label>
        <label>Modèle <input name="modele" value="${esc(e.modele || '')}"></label>
        <label>N° de série <input name="numero_serie" value="${esc(e.numero_serie || '')}"></label>
        <label>Année <input name="annee" type="number" min="1950" max="2100" value="${esc(e.annee || '')}"></label>
        <label>Provenance <select name="provenance">${Object.entries(PROVENANCES).map(([k, v]) =>
          `<option value="${k}" ${e.provenance === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>Loueur / propriétaire <input name="proprietaire" value="${esc(e.proprietaire || '')}"></label>
      </div>
      <label class="case"><input type="checkbox" name="soumis_vgp" ${e.soumis_vgp ? 'checked' : ''}>
        Soumis aux vérifications générales périodiques (VGP) <span class="aide">— décocher pour un engin non soumis
        (ex. conducteur accompagnant) : vérification annuelle de l'état de conservation à la place</span></label>
      <fieldset><legend>Catégories CACES pour lesquelles il sert aux tests</legend>
        ${cats.map(c => `<label class="case"><input type="checkbox" name="cat" value="${esc(c.code)}|${esc(c.referentiel_code)}"
          ${(e.categories || []).includes(c.referentiel_code + ' ' + c.code) ? 'checked' : ''}> ${esc(c.referentiel_code)} ${esc(c.code)}</label>`).join('')}
      </fieldset>
      <label>Notes <input name="notes" value="${esc(e.notes || '')}"></label>
      ${peutEcrire ? `<div class="pied-modale">
        ${id ? `<button type="button" id="btn-retirer">${e.actif ? 'Retirer du parc' : 'Remettre dans le parc'}</button>` : ''}
        <button type="submit" class="principal">Enregistrer</button></div>` : ''}
    </form>
    <div id="zone-docs-engin"></div>`);

  $('#form-engin').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    const cs = $$('#form-engin input[name=cat]:checked').map(i => { const [c, r] = i.value.split('|'); return r + ' ' + c; });
    const refs = [...new Set($$('#form-engin input[name=cat]:checked').map(i => i.value.split('|')[1]))];
    const donnees = {
      designation: f.designation.value.trim(), type_engin: f.type_engin.value.trim() || null,
      marque: f.marque.value.trim() || null, modele: f.modele.value.trim() || null,
      numero_serie: f.numero_serie.value.trim() || null, annee: f.annee.value ? Number(f.annee.value) : null,
      provenance: f.provenance.value, proprietaire: f.proprietaire.value.trim() || null,
      soumis_vgp: f.soumis_vgp.checked, categories: cs, referentiel_code: refs.length === 1 ? refs[0] : null,
      notes: f.notes.value.trim() || null,
    };
    const r = id ? await sb.from('engins').update(donnees).eq('id', id).select().single()
      : await sb.from('engins').insert({ ...donnees, created_by: S.profil.id }).select().single();
    if (r.error) {
      const doublon = String(r.error.message).includes('engins_serie_unique');
      return erreurSupabase(doublon ? 'Cet engin (même marque et n° de série) existe déjà dans la base' : 'Enregistrement de l\'engin', r.error);
    }
    toast('Engin enregistré');
    if (!id) return ouvrirFicheEngin(r.data.id, contexte);
    if ($('#liste-engins')) rendreParcEngins($('#zone-parc') || $('#liste-engins').closest('div'));
  });
  $('#btn-retirer')?.addEventListener('click', async () => {
    const { error } = await sb.from('engins').update({ actif: !e.actif }).eq('id', id);
    if (error) return erreurSupabase('Mise à jour', error);
    fermerModale(); if ($('#zone-parc')) rendreParcEngins($('#zone-parc'));
  });
  if (id) afficherDocumentsEngin(id, e, contexte, peutEcrire);
}

async function afficherDocumentsEngin(id, e, contexte, peutEcrire) {
  const zone = $('#zone-docs-engin');
  zone.innerHTML = '<p class="chargement">Chargement des documents…</p>';
  const [st, docs, avis] = await Promise.all([
    sb.rpc('caces_engin_statut', { p_engin: id, p_jour: (contexte.session?.date_debut) || new Date().toISOString().slice(0, 10) }),
    sb.from('engin_documents').select('*, formateurs:ajoute_par(nom, prenom)').eq('engin_id', id).order('created_at', { ascending: false }),
    sb.from('engin_avis').select('*, formateurs:formateur_id(nom, prenom)').eq('engin_id', id).order('created_at', { ascending: false }),
  ]);
  if (st.error) return erreurSupabase('Statut des documents', st.error);
  const liens = d => (d?.fichiers || []).map((f, i) => `<a href="${esc(f.lien)}" target="_blank" rel="noopener">📎 ${i + 1}</a>`).join(' ');
  const dernier = Object.fromEntries((docs.data || []).map(d => [d.id, d]));

  zone.innerHTML = `
    <h4 class="titre-theme">Documents (état au ${esc(dateFr(contexte.session?.date_debut || new Date().toISOString()))})</h4>
    <table class="tableau"><thead><tr><th>Document</th><th>État</th><th>Date</th><th>Échéance</th><th>Photos</th><th></th></tr></thead><tbody>
    ${(st.data || []).map(x => `<tr>
      <td>${esc(x.libelle)}${x.obligatoire ? ' <b title="À présenter le jour du test">*</b>' : ''}</td>
      <td><span class="etat ${CLASSE_STATUT_DOC[x.statut]}">${esc(LIBELLE_STATUT_DOC[x.statut])}</span></td>
      <td>${esc(dateFr(x.date_document))}</td><td>${esc(dateFr(x.date_echeance))}</td>
      <td>${liens(dernier[x.document_id])}</td>
      <td>${peutEcrire ? `<button class="icone" title="Ajouter / renouveler ce document" data-ajout="${esc(x.type_code)}">＋</button>` : ''}</td></tr>`).join('')}
    </tbody></table>
    <p class="aide">* à présenter le jour du test (notice, déclaration CE ou certificat de conformité, VGP valide vierge ou observations levées, examen d'adéquation).</p>

    <h4 class="titre-theme">Historique des documents</h4>
    ${(docs.data || []).map(d => `<div class="ligne-fise"><span class="libelle-fise">
      <b>${esc((window.TYPES_DOC_ENGIN || {})[d.type_code] || d.type_code)}</b> — ${esc(dateFr(d.date_document))}
      ${d.date_echeance ? '(échéance ' + esc(dateFr(d.date_echeance)) + ')' : ''}
      ${d.observations_ouvertes ? ' ⚠ observations non levées' : ''} ${esc(d.reference || '')}
      <span class="aide">ajouté le ${esc(dateFr(d.created_at))}</span></span>${liens(d)}</div>`).join('') || '<p class="aide">Aucun document.</p>'}

    <h4 class="titre-theme">Avis du formateur (pour mémoire)</h4>
    ${peutEcrire ? `<form id="form-avis-engin" class="formulaire"><div class="grille-2">
      <label>Niveau <select name="niveau">${Object.entries(NIVEAUX_AVIS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>Commentaire <input name="commentaire" required placeholder="Ex : frein un peu mou, direction OK"></label></div>
      <button class="principal" type="submit">Ajouter l'avis</button></form>` : ''}
    ${(avis.data || []).map(a => `<div class="ligne-fise"><span class="libelle-fise"><b>${esc(NIVEAUX_AVIS[a.niveau])}</b> — ${esc(a.commentaire)}
      <span class="aide">${esc(((a.formateurs?.nom || '') + ' ' + (a.formateurs?.prenom || '')).trim())}, ${esc(dateFr(a.created_at))}</span></span></div>`).join('')
      || '<p class="aide">Aucun avis.</p>'}`;

  zone.querySelectorAll('[data-ajout]').forEach(b => b.addEventListener('click', () => formulaireDocumentEngin(id, e, b.dataset.ajout, contexte)));
  $('#form-avis-engin')?.addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    const { error } = await sb.from('engin_avis').insert({
      engin_id: id, niveau: f.niveau.value, commentaire: f.commentaire.value.trim(),
      formateur_id: S.profil.id, session_id: contexte.session?.id || null });
    if (error) return erreurSupabase('Enregistrement de l\'avis', error);
    afficherDocumentsEngin(id, e, contexte, peutEcrire);
  });
}

function formulaireDocumentEngin(engId, e, typeCode, contexte) {
  const type = (window.TYPES_DOC_ENGIN_FULL || []).find(t => t.code === typeCode) || { code: typeCode, libelle: typeCode, avec_echeance: false };
  ouvrirModale(`${type.libelle} — ${libelleEngin(e)}`, `
    <form id="form-doc-engin" class="formulaire"><div class="grille-2">
      <label>Date du document / de la vérification <input type="date" name="date_document" value="${new Date().toISOString().slice(0, 10)}"></label>
      ${type.avec_echeance ? '<label>Échéance (prochaine vérification, lue sur le rapport) <input type="date" name="date_echeance"></label>' : ''}
      <label>Référence <input name="reference" placeholder="N° de rapport…"></label>
      <label>Photos du document <input type="file" name="photos" accept="image/*" capture="environment" multiple></label></div>
      ${typeCode === 'vgp' ? `<label class="case"><input type="checkbox" name="obs">
        Le rapport comporte des observations NON levées <span class="aide">(à cocher sinon l'engin ne pourra pas servir)</span></label>` : ''}
      <label>Notes <input name="notes"></label>
      <div class="pied-modale"><button type="button" onclick="ouvrirFicheEngin('${engId}', window.__ctxEngin)">Annuler</button>
        <button type="submit" class="principal">Enregistrer le document</button></div>
      <p id="msg-doc" class="aide"></p></form>`);
  window.__ctxEngin = contexte;
  $('#form-doc-engin').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target, msg = $('#msg-doc');
    try {
      msg.textContent = 'Envoi des photos sur le Drive…';
      const chemin = contexte.session
        ? ['Sessions', contexte.session.nom, 'Engins', libelleEngin(e)]
        : ['Parc engins', libelleEngin(e)];
      const fichiers = await envoyerPhotosSurDrive(f.photos, chemin, typeCode);
      const { error } = await sb.from('engin_documents').insert({
        engin_id: engId, type_code: typeCode, date_document: f.date_document.value || null,
        date_echeance: f.date_echeance?.value || null, reference: f.reference.value.trim() || null,
        observations_ouvertes: !!f.obs?.checked, fichiers, notes: f.notes.value.trim() || null,
        session_id: contexte.session?.id || null, ajoute_par: S.profil.id });
      if (error) throw error;
      toast('Document enregistré');
      ouvrirFicheEngin(engId, contexte);
    } catch (err) { msg.textContent = ''; erreurSupabase('Enregistrement du document', err); }
  });
}

async function chargerTypesDocEngin() {
  const { data } = await sb.from('types_document_engin').select('*').order('ordre');
  window.TYPES_DOC_ENGIN_FULL = data || [];
  window.TYPES_DOC_ENGIN = Object.fromEntries((data || []).map(t => [t.code, t.libelle]));
}

/* ====================== Engins d'une session ========================== */
async function resumeEnginsSession(sessionId) {
  const { data } = await sb.from('session_engins').select('engin_id, engins(designation)').eq('session_id', sessionId);
  const ids = (data || []).map(x => x.engin_id);
  let rouges = 0;
  if (ids.length) {
    const { data: etats } = await sb.from('v_engins_statut').select('*').in('engin_id', ids);
    rouges = (etats || []).filter(x => x.etat === 'rouge').length;
  }
  return { nb: ids.length, rouges };
}

async function ouvrirEnginsSession() {
  const s = S.session;
  await chargerTypesDocEngin();
  const peutEcrire = ['formateur', 'admin'].includes(S.profil?.role);
  const [{ data: liens }, { data: parc }, { data: etats }] = await Promise.all([
    sb.from('session_engins').select('engin_id').eq('session_id', s.id),
    sb.from('engins').select('*').eq('actif', true).order('designation'),
    sb.from('v_engins_statut').select('*'),
  ]);
  const choisis = new Set((liens || []).map(l => l.engin_id));
  const etat = Object.fromEntries((etats || []).map(x => [x.engin_id, x.etat]));
  const utilises = (parc || []).filter(e => choisis.has(e.id));
  const dispo = (parc || []).filter(e => !choisis.has(e.id));

  ouvrirModale('Engins utilisés pour les tests de cette session', `
    <h4 class="titre-theme">Engins de la session (${utilises.length})</h4>
    <table class="tableau"><thead><tr><th>Engin</th><th>N° de série</th><th>Provenance</th><th>Documents</th><th></th></tr></thead><tbody>
    ${utilises.map(e => `<tr><td>${esc(libelleEngin(e))}</td><td>${esc(e.numero_serie)}</td>
      <td>${esc(PROVENANCES[e.provenance])}${e.proprietaire ? ' — ' + esc(e.proprietaire) : ''}</td><td>${pastilleEtat(etat[e.id])}</td>
      <td><button class="icone" title="Documents et avis" data-fiche="${e.id}">📄</button>
        ${peutEcrire ? `<button class="icone" title="Retirer de la session" data-retirer="${e.id}">✕</button>` : ''}</td></tr>`).join('')
      || '<tr><td colspan="5" class="vide">Aucun engin renseigné pour cette session.</td></tr>'}</tbody></table>
    ${peutEcrire ? `
    <h4 class="titre-theme">Ajouter un engin du centre</h4>
    <div><select id="choix-engin"><option value="">— choisir dans le parc —</option>
      ${dispo.map(e => `<option value="${e.id}">${esc(libelleEngin(e))} (${esc(PROVENANCES[e.provenance])})</option>`).join('')}</select>
      <button id="btn-ajout-engin" class="principal">Ajouter</button></div>
    <h4 class="titre-theme">Engin loué ou prêté</h4>
    <p class="aide">Si l'engin est déjà connu (même marque et n° de série), il est retrouvé automatiquement : il suffit alors de déposer les nouveaux documents. Le contrat de location se gère ailleurs.</p>
    <form id="form-engin-loue" class="formulaire"><div class="grille-2">
      <label>Loueur / prêteur <input name="proprietaire" required></label>
      <label>Désignation <input name="designation" required placeholder="Ex : Chariot télescopique 4 t"></label>
      <label>Marque <input name="marque"></label><label>Modèle <input name="modele"></label>
      <label>N° de série <input name="numero_serie" required></label>
      <label>Provenance <select name="provenance"><option value="location">Location</option><option value="pret">Prêt</option></select></label></div>
      <button class="principal" type="submit">Rechercher / ajouter</button></form>` : ''}`);

  const lier = async engId => {
    const { error } = await sb.from('session_engins').upsert({ session_id: s.id, engin_id: engId, ajoute_par: S.profil.id });
    if (error) return erreurSupabase('Ajout de l\'engin à la session', error);
  };
  $('#btn-ajout-engin')?.addEventListener('click', async () => {
    const v = $('#choix-engin').value; if (!v) return;
    await lier(v); ouvrirEnginsSession();
  });
  $$('[data-fiche]').forEach(b => b.addEventListener('click', () => ouvrirFicheEngin(b.dataset.fiche, { session: s })));
  $$('[data-retirer]').forEach(b => b.addEventListener('click', async () => {
    const { error } = await sb.from('session_engins').delete().eq('session_id', s.id).eq('engin_id', b.dataset.retirer);
    if (error) return erreurSupabase('Retrait', error);
    ouvrirEnginsSession();
  }));
  $('#form-engin-loue')?.addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    const marque = f.marque.value.trim(), serie = f.numero_serie.value.trim();
    // Engin déjà connu ? (même marque + même n° de série, sans tenir compte de la casse)
    const { data: tous } = await sb.from('engins').select('*').ilike('numero_serie', serie);
    const connu = (tous || []).find(x => (x.marque || '').toLowerCase() === marque.toLowerCase());
    let engin = connu;
    if (connu) {
      toast('Engin déjà connu dans la base : il suffit de déposer les nouveaux documents.', 'ok', 7000);
      if (!connu.actif) await sb.from('engins').update({ actif: true }).eq('id', connu.id);
      if (f.proprietaire.value.trim() && connu.proprietaire !== f.proprietaire.value.trim()) {
        await sb.from('engins').update({ proprietaire: f.proprietaire.value.trim() }).eq('id', connu.id);
      }
    } else {
      const { data, error } = await sb.from('engins').insert({
        designation: f.designation.value.trim(), marque: marque || null, modele: f.modele.value.trim() || null,
        numero_serie: serie, provenance: f.provenance.value, proprietaire: f.proprietaire.value.trim(),
        created_by: S.profil.id }).select().single();
      if (error) return erreurSupabase('Création de l\'engin', error);
      engin = data;
    }
    await lier(engin.id);
    ouvrirFicheEngin(engin.id, { session: s });
  });
}
