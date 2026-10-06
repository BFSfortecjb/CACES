/* =====================================================================
   CA_photo.js — Photo du titulaire (carton CACES), prise avec l'appareil
   photo du téléphone / de la tablette du formateur.
   Recadrée en portrait 3:4 (format photo d'identité), enregistrée dans le
   stockage privé « caces-photos-stagiaires » (accès par lien temporaire).
   ===================================================================== */

/** Recadre au centre en 3:4 et réduit (600 × 800 max) → Blob JPEG. */
function recadrerPortrait(fichier, largeur = 600, hauteur = 800) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(fichier);
    img.onload = () => {
      const ratio = largeur / hauteur;
      let sw = img.width, sh = img.height;
      if (sw / sh > ratio) sw = sh * ratio; else sh = sw / ratio;      // zone 3:4 maximale, centrée
      const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
      const c = document.createElement('canvas'); c.width = largeur; c.height = hauteur;
      c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, largeur, hauteur);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? resolve(b) : reject(new Error('Photo illisible')), 'image/jpeg', 0.88);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}

async function urlPhotoStagiaire(path) {
  if (!path) return null;
  const { data } = await sb.storage.from('caces-photos-stagiaires').createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

async function ouvrirPhoto(stagiaireId) {
  const { data: st, error } = await sb.from('stagiaires').select('id, nom, prenom, session_id, photo_path').eq('id', stagiaireId).single();
  if (error) return erreurSupabase('Lecture du stagiaire', error);
  const url = await urlPhotoStagiaire(st.photo_path);
  const peut = droitsSession(S.session).ecriture;
  ouvrirModale(`Photo — ${st.nom} ${st.prenom}`, `
    <div class="photo-zone">
      <div class="photo-cadre">${url ? `<img id="photo-apercu" src="${esc(url)}" alt="Photo du titulaire">`
        : '<div id="photo-apercu" class="photo-vide">Aucune photo</div>'}</div>
      ${peut ? `<div class="photo-actions">
        <label class="bouton-fichier principal">📷 Prendre la photo
          <input type="file" accept="image/*" capture="user" hidden id="photo-cam"></label>
        <label class="bouton-fichier">🖼 Choisir un fichier
          <input type="file" accept="image/*" hidden id="photo-fic"></label></div>
        <p class="aide">Cadre le visage de face, sur fond uni et clair, en format portrait. La photo est recadrée automatiquement (3:4).
          Enregistrée dès la prise : reprends-la si elle ne convient pas.</p>` : '<p class="aide">Seul le formateur de la session peut modifier la photo.</p>'}
      <p id="photo-msg" class="aide"></p>
    </div>`);
  const traiter = async input => {
    const f = input.files && input.files[0]; if (!f) return;
    const msg = $('#photo-msg'); msg.textContent = 'Enregistrement…';
    try {
      const blob = await recadrerPortrait(f);
      const path = `${st.session_id}/${st.id}.jpg`;
      const { error: e1 } = await sb.storage.from('caces-photos-stagiaires').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (e1) throw e1;
      const { error: e2 } = await sb.from('stagiaires').update({ photo_path: path }).eq('id', st.id);
      if (e2) throw e2;
      const nouvelle = await urlPhotoStagiaire(path);
      $('.photo-cadre').innerHTML = `<img id="photo-apercu" src="${esc(nouvelle)}?t=${Date.now()}" alt="Photo du titulaire">`;
      msg.textContent = 'Photo enregistrée.'; toast('Photo enregistrée');
    } catch (e) { msg.textContent = ''; erreurSupabase('Enregistrement de la photo', e); }
  };
  ['photo-cam', 'photo-fic'].forEach(id => { const i = document.getElementById(id); if (i) i.addEventListener('change', () => traiter(i)); });
}
