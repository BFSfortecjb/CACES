/* ==========================================================================
   BFS CACES — Onglet Organisme (admin) : parc d'engins + état Google Drive.
   (Adresse secrétariat, mentions/signature/cachet du carton : à venir.)
   ========================================================================== */
async function rendreOrganisme(zone) {
  zone.innerHTML = `
    <div class="barre-actions"><h2>Organisme</h2></div>
    <div class="carte"><h3>Parc d'engins du centre</h3>
      <p class="aide">Engins du centre, sélectionnables directement dans les sessions. Les engins de location y sont aussi mémorisés (même marque + n° de série = même engin : on ne remet à jour que les documents).</p>
      <div id="zone-parc"></div></div>
    <div class="carte"><h3>Google Drive</h3><div id="zone-drive"><p class="chargement">Chargement…</p></div></div>`;
  await chargerTypesDocEngin();
  rendreParcEngins($('#zone-parc'));
  rendreEtatDrive();
}

async function rendreEtatDrive() {
  const z = $('#zone-drive');
  const { data, error } = await sb.rpc('caces_etat_drive');
  if (error) { z.innerHTML = ''; return erreurSupabase('Lecture de l\'état Drive', error); }
  const e = (data || [])[0] || {};
  z.innerHTML = `
    <p>Connexion Google : ${e.connecte ? '<span class="etat ok">✔ configurée</span>'
      : '<span class="etat erreur">✖ non configurée</span> — exécuter <code>copie_connexion_drive_habelec.sql</code>'}</p>
    <label>ID du dossier « CACES » à la racine du Drive
      <input id="drive-racine" value="${esc(e.dossier_racine_id || '')}" placeholder="ID du dossier Drive"></label>
    <button class="principal" onclick="enregistrerDossierDrive()">Enregistrer</button>`;
}

async function enregistrerDossierDrive() {
  const { error } = await sb.rpc('caces_definir_dossier_drive', { p_dossier_id: $('#drive-racine').value });
  if (error) return erreurSupabase('Enregistrement du dossier Drive', error);
  toast('Dossier Drive enregistré');
  rendreEtatDrive();
}
