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
    <div class="carte"><h3>Agences (cachet, signataire, secrétariat)</h3><div id="zone-carton"><p class="chargement">Chargement…</p></div></div>
    <div class="carte"><h3>Google Drive</h3><div id="zone-drive"><p class="chargement">Chargement…</p></div></div>`;
  await chargerTypesDocEngin();
  rendreParcEngins($('#zone-parc'));
  rendreEtatDrive();
  rendreParametresCarton();
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

/* ---- Agences : Bocage Formation Sécurité (Sèvremont), Bretagne Formation Sécurité (Briec)… ----
   Chaque agence a son cachet, son signataire, son e-mail secrétariat ; la session choisit
   son agence via « Centre de déroulement du test ». */
async function rendreParametresCarton() {
  const z = $('#zone-carton'); if (!z) return;
  const { data, error } = await sb.from('centres_examen').select('*').order('nom');
  if (error) { z.innerHTML = ''; return erreurSupabase('Lecture des agences', error); }
  S._agences = data || [];
  z.innerHTML = `<table class="tableau"><thead><tr><th>Centre</th><th>Agence (raison sociale)</th><th>Signataire</th><th>Secrétariat</th><th>Cachet</th><th></th></tr></thead><tbody>
    ${S._agences.map(c => `<tr class="${c.actif ? '' : 'termine'}"><td>${esc(c.nom)}</td><td>${esc(c.agence || '')}</td>
      <td>${esc(c.signataire || '')}</td><td>${esc(c.email_secretariat || '')}</td>
      <td>${c.signature_cachet_path ? '✔' : '—'}</td>
      <td><button class="lien" onclick="modifierAgence(${c.id})">Modifier</button></td></tr>`).join('')}</tbody></table>
    <button onclick="modifierAgence(null)">+ Ajouter une agence</button>`;
}

async function modifierAgence(id) {
  const c = id ? S._agences.find(x => x.id === id) : { nom: '', agence: '', adresse: '', telephone: '', signataire: '', email_secretariat: '', actif: true };
  const url = await urlPhotoStagiaire(c.signature_cachet_path);
  ouvrirModale(id ? 'Agence ' + c.nom : 'Nouvelle agence', `<form class="formulaire" id="form-agence">
    <label>Centre / lieu (ex : Sèvremont) <input name="nom" required value="${esc(c.nom)}"></label>
    <label>Agence — raison sociale (ex : Bocage Formation Sécurité) <input name="agence" required value="${esc(c.agence || '')}"></label>
    <label>Adresse <input name="adresse" value="${esc(c.adresse || '')}"></label>
    <label>Téléphone <input name="telephone" value="${esc(c.telephone || '')}"></label>
    <label>Signataire (en toutes lettres, ex : M.BOUA - Gérant) <input name="signataire" value="${esc(c.signataire || '')}"></label>
    <label>E-mail du secrétariat de l'agence <input type="email" name="email_secretariat" value="${esc(c.email_secretariat || '')}"></label>
    <label><input type="checkbox" name="actif" ${c.actif ? 'checked' : ''}> Agence active</label>
    <div><b>Signature + cachet de l'agence</b>
      <div class="photo-cadre" style="max-width:260px">${url ? `<img src="${esc(url)}" style="max-width:100%" alt="cachet">` : '<i>Aucun</i>'}</div>
      <label class="bouton-fichier">🖋 Choisir l'image (PNG/JPEG)<input type="file" accept="image/*" hidden name="fichier"></label></div>
    <button class="principal" type="submit">Enregistrer</button></form>`);
  $('#form-agence').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    try {
      const champs = { nom: f.nom.value.trim(), agence: f.agence.value.trim(), adresse: f.adresse.value.trim() || null,
        telephone: f.telephone.value.trim() || null, signataire: f.signataire.value.trim() || null,
        email_secretariat: f.email_secretariat.value.trim() || null, actif: f.actif.checked };
      let cid = id;
      if (id) { const { error } = await sb.from('centres_examen').update(champs).eq('id', id); if (error) throw error; }
      else { const { data, error } = await sb.from('centres_examen').insert(champs).select().single(); if (error) throw error; cid = data.id; }
      const fic = f.fichier.files[0];
      if (fic) {
        const blob = await reduireImage(fic, 800), path = `organisme/cachet_${cid}.jpg`;
        const { error: e1 } = await sb.storage.from('caces-photos-stagiaires').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
        if (e1) throw e1;
        const { error: e2 } = await sb.from('centres_examen').update({ signature_cachet_path: path }).eq('id', cid);
        if (e2) throw e2;
      }
      await chargerReferentiel(); toast('Agence enregistrée'); fermerModale(); rendreParametresCarton();
    } catch (e) { erreurSupabase('Enregistrement de l\'agence', e); }
  });
}
