/* =====================================================================
   CA_secretariat.js — Envoi au secrétariat : carton CACES (ou autorisation
   de conduite) de chaque stagiaire ayant validé, en pièces jointes d'un seul
   e-mail (fonction commune Univers BFS « envoyer-mail »), + archivage des
   mêmes PDF dans le dossier Drive de la session.
   Destinataire : e-mail du secrétariat de l'AGENCE de la session (Organisme).
   ===================================================================== */
async function envoyerSecretariat() {
  const s = S.session;
  const agence = (S.referentiel.centres || []).find(c => c.id === s.centre_examen_id);
  const destinataire = (agence?.email_secretariat || '').trim();
  if (!destinataire) {
    return toast('Aucune adresse de secrétariat : choisis l\'agence de la session et renseigne son e-mail dans Organisme > Agences.', 'erreur', 8000);
  }
  const autorisation = s.type_session === 'autorisation';
  const { data: stags } = await sb.from('stagiaires')
    .select('id, nom, prenom, stagiaire_categories(theorie_validee, pratique_validee)').eq('session_id', s.id).order('nom');
  const eligibles = (stags || []).filter(st => (st.stagiaire_categories || []).some(c => c.theorie_validee === true && c.pratique_validee === true));
  if (!eligibles.length) return toast('Aucun stagiaire n\'a validé théorie et pratique pour l\'instant.', 'erreur', 6000);
  if (!autorisation && !(s.numero_session_galaxy || '').trim()) return toast('N° de session Galaxy obligatoire.', 'erreur');

  ouvrirModale('Envoi au secrétariat', `
    <p class="aide">Destinataire : <b>${esc(destinataire)}</b> (${esc(agence.agence || agence.nom)}).
      ${autorisation ? 'Autorisations de conduite' : 'Cartons CACES (les n° sont attribués à la génération)'} en pièces jointes,
      et copie sur le Drive de la session.</p>
    <form class="formulaire" id="form-secretariat">
      <fieldset><legend>Stagiaires (${eligibles.length})</legend>
        ${eligibles.map(st => `<label class="case"><input type="checkbox" name="st" value="${st.id}" checked> ${esc(st.nom)} ${esc(st.prenom)}</label>`).join('')}
      </fieldset>
      <button class="principal" type="submit">Envoyer</button></form>`);
  $('#form-secretariat').addEventListener('submit', async ev => {
    ev.preventDefault();
    const ids = $$('#form-secretariat input[name=st]:checked').map(i => i.value);
    if (!ids.length) return toast('Coche au moins un stagiaire.', 'erreur');
    const btn = ev.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Envoi en cours…';
    try {
      const pieces = [], echecsDrive = [];
      for (const id of ids) {
        const pdf = await genererDocumentPdf(id, !autorisation, { silencieux: true, retour: true });
        if (!pdf) throw new Error('Génération impossible pour un stagiaire (catégories non validées ?)');
        pieces.push({ nom: pdf.nom, base64: pdf.base64 });
        try { await envoyerSurDrive(['Sessions', s.nom, 'Titres'], pdf.nom, 'application/pdf', pdf.base64); }
        catch (e) { echecsDrive.push(pdf.nom + ' : ' + e.message); }
      }
      const sujet = autorisation ? `Autorisations de conduite — ${s.nom}` : `CACES — session Galaxy ${s.numero_session_galaxy} — ${s.nom}`;
      const texte = `Bonjour,\n\nCi-joint ${pieces.length} ${autorisation ? 'autorisation(s) de conduite' : 'carton(s) CACES'} de la session « ${s.nom} »`
        + (s.entreprise ? ` (${s.entreprise})` : '') + '.\n\nCordialement,\n' + (agence.agence || 'BFS');
      const { data, error } = await sb.functions.invoke('envoyer-mail', { body: { a: destinataire, sujet, texte, pieces_jointes: pieces } });
      if (error) throw new Error(error.message || 'Envoi du mail impossible');
      if (data && data.envoye === false) throw new Error(data.erreur || 'Mail refusé');
      sb.from('journal_audit').insert({ session_id: s.id, formateur_id: S.profil.id, action: 'envoi_secretariat',
        cible: destinataire, detail: { nb: pieces.length } }).then(() => {}, () => {});
      fermerModale();
      toast(`Envoyé au secrétariat (${pieces.length} fichier(s))` + (echecsDrive.length ? ' — mais copie Drive incomplète : ' + echecsDrive[0] : ''), echecsDrive.length ? 'erreur' : 'ok', 9000);
    } catch (e) { btn.disabled = false; btn.textContent = 'Envoyer'; erreurSupabase('Envoi au secrétariat', e); }
  });
}
