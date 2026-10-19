/* =====================================================================
   CA_export.js — Bouton « Export » unique (modèle Habelec) :
   ☑ Télécharger le ZIP (PDF générés dans le navigateur, JSZip)
   ☑ Envoyer au secrétariat (fonction serveur « caces-envoyer-secretariat » : PDF régénérés côté serveur,
      sauvegarde Drive automatique, UN mail, journal, statut sur la session).
   L'adresse du secrétariat est unique pour l'organisation (Organisme > Secrétariat).
   ATTENTION : le dessin des PDF existe en deux copies (CA_carton.js = navigateur, edge-functions/caces-envoyer-secretariat
   = serveur). La copie serveur est GÉNÉRÉE depuis CA_carton.js : après toute modification de CA_carton.js, lancer
   `python3 scripts/build_edge_secretariat.py` puis redéployer la fonction.
   ===================================================================== */
const journaliserExport = (action, detail = {}) =>
  sb.rpc('caces_journaliser_export', { p_session: S.session.id, p_action: action, p_detail: detail }).then(() => {}, () => {});

/** Stagiaires ayant au moins une catégorie validée (théorie ET pratique). */
async function stagiairesEligibles() {
  const { data } = await sb.from('stagiaires')
    .select('id, nom, prenom, stagiaire_categories(theorie_validee, pratique_validee)').eq('session_id', S.session.id).order('nom');
  return (data || []).filter(st => (st.stagiaire_categories || []).some(c => c.theorie_validee === true && c.pratique_validee === true));
}

function exporterSession() {
  const s = S.session;
  const dernier = s.envoi_secretariat_statut
    ? `<p class="aide">Dernier envoi au secrétariat : <b>${esc(LIBELLE_STATUT_ENVOI[s.envoi_secretariat_statut] || s.envoi_secretariat_statut)}</b> le ${esc(dateFr(s.envoi_secretariat_le))}.</p>` : '';
  ouvrirModale('Export', `<form id="form-export" class="formulaire">
    <label class="case"><input type="checkbox" name="zip" checked> Télécharger le ZIP</label>
    <label class="case"><input type="checkbox" name="secr" checked> Envoyer au secrétariat</label>
    <p class="aide">La sauvegarde sur le Drive est automatique avec l'envoi au secrétariat (pas de case Drive).</p>
    ${dernier}
    <div class="pied-modale"><button type="button" onclick="fermerModale()">Annuler</button>
      <button class="principal" type="submit">Lancer</button></div></form>`);
  $('#form-export').addEventListener('submit', async ev => {
    ev.preventDefault();
    const zip = ev.target.zip.checked, secr = ev.target.secr.checked;
    if (!zip && !secr) return toast('Coche au moins une case.', 'erreur');
    fermerModale();
    await journaliserExport('export_demande', { zip, secretariat: secr });
    if (zip) await telechargerZipSession();
    if (secr) await demanderEnvoiSecretariat();
  });
}
const LIBELLE_STATUT_ENVOI = { en_cours: 'en cours', reussi: 'réussi', partiel: 'réussi avec réserves (voir le journal)', echec: 'échec' };

/* ---------------- ZIP (navigateur) ---------------- */
async function telechargerZipSession() {
  const s = S.session;
  if (typeof JSZip === 'undefined') return toast('Bibliothèque ZIP non chargée (connexion ?).', 'erreur');
  const autorisation = s.type_session === 'autorisation';
  const eligibles = await stagiairesEligibles();
  if (!eligibles.length) { toast('ZIP : aucun stagiaire n\'a validé théorie et pratique pour l\'instant.', 'erreur', 6000); return; }
  if (!autorisation && !(s.numero_session_galaxy || '').trim()) { toast('N° de session Galaxy obligatoire.', 'erreur'); return; }
  toast('Génération du ZIP…');
  try {
    const zip = new JSZip(), dossier = zip.folder(autorisation ? 'Autorisations_de_conduite' : 'Cartons_CACES');
    let nb = 0;
    for (const st of eligibles) {
      const pdf = await genererDocumentPdf(st.id, !autorisation, { silencieux: true, retour: true });
      if (!pdf) continue;
      dossier.file(pdf.nom, pdf.base64, { base64: true }); nb++;
    }
    if (!nb) throw new Error('Aucun PDF généré');
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `Export_${(s.numero_session_galaxy || s.nom || 'session').toString().replace(/[^\w.-]+/g, '_')}.zip`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast(`ZIP téléchargé (${nb} document(s))`);
    journaliserExport('export_zip_reussi', { nb });
  } catch (e) { journaliserExport('export_zip_echec', { erreur: e.message }); erreurSupabase('Export ZIP', e); }
}

/* ---------------- Envoi au secrétariat (serveur) ---------------- */
async function demanderEnvoiSecretariat() {
  const s = S.session, autorisation = s.type_session === 'autorisation';
  const { data: prm } = await sb.from('parametres_application').select('email_secretariat').eq('id', 1).maybeSingle();
  const destinataire = (prm?.email_secretariat || '').trim();
  if (!destinataire) return toast('Aucune adresse de secrétariat : un administrateur doit la renseigner dans Organisme > Secrétariat.', 'erreur', 8000);
  const eligibles = await stagiairesEligibles();
  if (!eligibles.length) return toast('Envoi : aucun stagiaire n\'a validé théorie et pratique pour l\'instant.', 'erreur', 6000);
  if (!autorisation && !(s.numero_session_galaxy || '').trim()) return toast('N° de session Galaxy obligatoire.', 'erreur');

  ouvrirModale('Envoi au secrétariat', `
    <p class="aide">Destinataire : <b>${esc(destinataire)}</b>. ${autorisation ? 'Autorisations de conduite' : 'Cartons CACES (les n° sont attribués à la génération)'} en pièces jointes d'un seul mail, copie sur le Drive de la session.</p>
    <form class="formulaire" id="form-secretariat">
      <fieldset><legend>Stagiaires (${eligibles.length})</legend>
        ${eligibles.map(st => `<label class="case"><input type="checkbox" name="st" value="${st.id}" checked> ${esc(st.nom)} ${esc(st.prenom)}</label>`).join('')}
      </fieldset>
      <button class="principal" type="submit">Envoyer</button></form>`);
  $('#form-secretariat').addEventListener('submit', async ev => {
    ev.preventDefault();
    const ids = $$('#form-secretariat input[name=st]:checked').map(i => i.value);
    if (!ids.length) return toast('Coche au moins un stagiaire.', 'erreur');
    fermerModale();
    toast('Envoi en cours… tu peux fermer cette page, l\'envoi continuera côté serveur.', 'ok', 12000);
    try {
      const { data, error } = await sb.functions.invoke('caces-envoyer-secretariat', { body: { session_id: s.id, stagiaire_ids: ids } });
      if (error) throw new Error(error.message || 'Fonction serveur injoignable');
      if (!data?.ok) throw new Error(data?.error || 'Envoi refusé');
      toast(`Envoyé au secrétariat : ${data.nb_fichiers} document(s) en ${data.nb_envoyes} mail(s)`
        + (data.nb_echecs ? ` — ${data.nb_echecs} incident(s), voir le journal` : ''), data.nb_echecs ? 'erreur' : 'ok', 10000);
      s.envoi_secretariat_statut = data.nb_echecs ? 'partiel' : 'reussi'; s.envoi_secretariat_le = new Date().toISOString();
    } catch (e) { erreurSupabase('Envoi au secrétariat', e); }
  });
}

/* ---------------- Réglage : adresse unique du secrétariat (Organisme) ---------------- */
async function rendreSecretariatOrganisme(zone) {
  const { data: prm } = await sb.from('parametres_application').select('email_secretariat').eq('id', 1).maybeSingle();
  const admin = S.profil?.role === 'admin';
  zone.innerHTML = `<form class="formulaire" id="form-secr-org">
    <label>Adresse e-mail du secrétariat (destinataire de tous les envois)
      <input type="email" name="email" value="${esc(prm?.email_secretariat || '')}" ${admin ? '' : 'disabled'} placeholder="secretariat@…"></label>
    ${admin ? '<button class="principal" type="submit">Enregistrer</button>' : '<p class="aide">Réservé à un administrateur.</p>'}</form>`;
  $('#form-secr-org', zone).addEventListener('submit', async ev => {
    ev.preventDefault();
    const { error } = await sb.from('parametres_application').update({ email_secretariat: ev.target.email.value.trim() || null,
      updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) return erreurSupabase('Enregistrement', error);
    toast('Adresse du secrétariat enregistrée');
  });
}
