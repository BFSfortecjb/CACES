/* =====================================================================
   CA_theorie.js — Test théorique (QCM) côté TESTEUR.
   Le stagiaire passe le QCM sur son propre appareil avec son code
   individuel ; le testeur suit l'avancement, lit la copie corrigée et
   peut abandonner un tirage en cours. Écran ouvert après saisie du code
   testeur (voir ouvrirTheorieProtegee).
   ===================================================================== */

async function ouvrirTheorie(stagiaireId) {
  const [{ data: st, error }, { data: tirages }] = await Promise.all([
    sb.from('stagiaires').select('id, nom, prenom, code_acces_individuel, stagiaire_categories(referentiel_code, categorie_code, theorie_validee, date_validation_theorie)')
      .eq('id', stagiaireId).single(),
    sb.from('qcm_tirages').select('*').eq('stagiaire_id', stagiaireId).order('date_debut', { ascending: false }),
  ]);
  if (error) return erreurSupabase('Lecture du stagiaire', error);
  const lien = location.origin + location.pathname + '#stagiaire?code=' + encodeURIComponent(st.code_acces_individuel);
  const refs = [...new Set((st.stagiaire_categories || []).map(c => c.referentiel_code))];
  const libStatut = { en_cours: '⏳ en cours', termine: 'terminé', abandonne: 'abandonné' };

  ouvrirModale(`QCM théorique — ${st.nom} ${st.prenom}`, `
    <p>Le stagiaire passe le QCM sur son téléphone. Code individuel : <b class="code-geant" style="font-size:1.4em">${esc(st.code_acces_individuel)}</b></p>
    <p><code>${esc(lien)}</code> <button class="lien" onclick="navigator.clipboard.writeText('${escJs(lien)}');toast('Lien copié')">Copier le lien</button></p>
    ${refs.map(r => {
      const cats = (st.stagiaire_categories || []).filter(c => c.referentiel_code === r);
      const v = cats[0]?.theorie_validee;
      const etat = v === true ? '<span class="etat ok">✔ validée</span>' : v === false ? '<span class="etat erreur">✖ non validée</span>' : '<span class="etat">à passer</span>';
      const liste = (tirages || []).filter(t => t.referentiel_code === r);
      return `<h4 class="titre-theme">${esc(libelleReferentiel(r))} — théorie ${etat}</h4>
        <table class="tableau"><thead><tr><th>Date</th><th>Statut</th><th>Note</th><th>Résultat</th><th></th></tr></thead><tbody>
        ${liste.map(t => `<tr><td>${new Date(t.date_debut).toLocaleString('fr-FR')}</td><td>${libStatut[t.statut] || t.statut}</td>
          <td>${t.score_global_pct != null ? t.score_global_pct + ' %' : '—'}</td>
          <td>${t.reussi == null ? '—' : t.reussi ? 'ADMIS' : 'NON ADMIS'}</td>
          <td>${t.statut === 'termine' ? `<button onclick="voirCopie('${st.id}','${t.id}')">📄 Copie</button>` : ''}
              ${t.statut === 'en_cours' ? `<button onclick="abandonnerTirage('${t.id}','${st.id}')">Abandonner</button>` : ''}</td></tr>`).join('')
          || '<tr><td colspan="5" class="vide">Pas encore passé.</td></tr>'}</tbody></table>`;
    }).join('')}`);
}

async function abandonnerTirage(tirageId, stagiaireId) {
  if (!confirm('Abandonner ce tirage en cours ? Le stagiaire pourra en recommencer un nouveau.')) return;
  const { error } = await sb.from('qcm_tirages').update({ statut: 'abandonne', date_fin: new Date().toISOString() }).eq('id', tirageId);
  if (error) return erreurSupabase('Abandon du tirage', error);
  ouvrirTheorie(stagiaireId);
}

/** Copie corrigée : chaque question, la réponse du stagiaire et la bonne réponse. */
async function voirCopie(stagiaireId, tirageId) {
  if (!tirageId) {
    const { data } = await sb.from('qcm_tirages').select('id').eq('stagiaire_id', stagiaireId)
      .eq('statut', 'termine').order('date_debut', { ascending: false }).limit(1);
    if (!data || !data.length) return toast('Aucun QCM terminé pour ce stagiaire.', 'erreur');
    tirageId = data[0].id;
  }
  const [{ data: t }, { data: qs, error }] = await Promise.all([
    sb.from('qcm_tirages').select('*, stagiaires(nom, prenom)').eq('id', tirageId).single(),
    sb.from('qcm_tirage_questions').select('ordre, reponse_stagiaire, correcte, questions_qcm(enonce, reponse, themes_referentiel(libelle))')
      .eq('tirage_id', tirageId).order('ordre'),
  ]);
  if (error) return erreurSupabase('Lecture de la copie', error);
  const rep = b => b === true ? 'Vrai' : b === false ? 'Faux' : '—';
  ouvrirModale(`Copie corrigée — ${t.stagiaires.nom} ${t.stagiaires.prenom}`, `
    <p><b>${esc(libelleReferentiel(t.referentiel_code))}</b> — note ${t.score_global_pct ?? '—'} % — ${t.reussi ? 'ADMIS' : 'NON ADMIS'}</p>
    <button onclick="window.print()">🖨 Imprimer</button>
    <table class="tableau"><thead><tr><th>N°</th><th>Question</th><th>Thème</th><th>Réponse</th><th>Attendu</th><th></th></tr></thead><tbody>
    ${(qs || []).map(q => `<tr class="${q.correcte ? '' : 'ligne-erreur'}"><td>${q.ordre}</td><td>${esc(q.questions_qcm.enonce)}</td>
      <td>${esc(q.questions_qcm.themes_referentiel?.libelle || '')}</td><td>${rep(q.reponse_stagiaire)}</td>
      <td>${rep(q.questions_qcm.reponse)}</td><td>${q.correcte ? '✔' : '✖'}</td></tr>`).join('')}</tbody></table>`);
}
