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

/** Télécharge la photo avec la session de l'utilisateur (pas de lien temporaire) → URL locale affichable. */
async function urlPhotoStagiaire(path) {
  if (!path) return null;
  const { data, error } = await sb.storage.from('caces-photos-stagiaires').download(path);
  if (error || !data) {
    // La bibliothèque masque le détail (« {} ») : on lit la vraie réponse du serveur.
    let detail = (error && error.message) || 'fichier vide';
    try {
      const rep = error && error.originalError;
      if (rep && typeof rep.text === 'function') detail = 'HTTP ' + rep.status + ' ' + (await rep.clone().text());
    } catch (e) { /* ignoré */ }
    toast('Photo introuvable : ' + detail, 'erreur', 12000);
    return null;
  }
  return URL.createObjectURL(data);
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
        <button type="button" class="principal" id="photo-btn-cam">📷 Prendre la photo</button>
        <label class="bouton-fichier">🖼 Choisir un fichier
          <input type="file" accept="image/*" hidden id="photo-fic"></label></div>
        <p class="aide">Cadre le visage de face, sur fond uni et clair, en format portrait. La photo est recadrée automatiquement (3:4).
          Enregistrée dès la prise : reprends-la si elle ne convient pas.</p>` : '<p class="aide">Seul le formateur de la session peut modifier la photo.</p>'}
      <div class="photo-actions" id="photo-actions-live" hidden>
        <button type="button" class="principal" id="photo-capturer">⏺ Capturer</button>
        <button type="button" id="photo-annuler">Annuler</button></div>
      <p id="photo-msg" class="aide"></p>
    </div>`);
  const traiter = async f => {
    if (!f) return;
    const msg = $('#photo-msg'); msg.textContent = 'Enregistrement…';
    try {
      const blob = await recadrerPortrait(f);
      const path = `${st.session_id}/${st.id}.jpg`;
      const { error: e1 } = await sb.storage.from('caces-photos-stagiaires').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (e1) throw e1;
      const { error: e2 } = await sb.from('stagiaires').update({ photo_path: path }).eq('id', st.id);
      if (e2) throw e2;
      const nouvelle = await urlPhotoStagiaire(path);
      $('.photo-cadre').innerHTML = `<img id="photo-apercu" src="${esc(nouvelle)}" alt="Photo du titulaire">`;
      msg.textContent = 'Photo enregistrée.'; toast('Photo enregistrée');
    } catch (e) { msg.textContent = ''; erreurSupabase('Enregistrement de la photo', e); }
  };

  /* Prise de vue en direct (webcam du Mac/PC, caméra avant de la tablette) */
  let flux = null;
  const arreter = () => { if (flux) { flux.getTracks().forEach(t => t.stop()); flux = null; } };
  const btnCam = document.getElementById('photo-btn-cam');
  if (btnCam) btnCam.addEventListener('click', async () => {
    const msg = $('#photo-msg');
    if (!navigator.mediaDevices?.getUserMedia) { msg.textContent = 'Caméra indisponible sur cet appareil : utilise « Choisir un fichier ».'; return; }
    try {
      flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
    } catch (e) {
      msg.textContent = 'Accès à la caméra refusé ou impossible (' + (e.name || 'erreur') + '). Autorise la caméra pour ce site, ou utilise « Choisir un fichier ».'; return;
    }
    $('.photo-cadre').innerHTML = '<video id="photo-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;transform:scaleX(-1)"></video>';
    const v = document.getElementById('photo-video'); v.srcObject = flux;
    document.querySelector('.photo-actions').hidden = true; document.getElementById('photo-actions-live').hidden = false; msg.textContent = '';
  });
  const finLive = () => { arreter(); document.querySelector('.photo-actions').hidden = false; document.getElementById('photo-actions-live').hidden = true; };
  const bAnn = document.getElementById('photo-annuler');
  if (bAnn) bAnn.addEventListener('click', async () => { finLive(); await ouvrirPhoto(stagiaireId); });
  const bCap = document.getElementById('photo-capturer');
  if (bCap) bCap.addEventListener('click', () => {
    const v = document.getElementById('photo-video'); if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob(b => { finLive(); traiter(b); }, 'image/jpeg', 0.92);
  });
  const fic = document.getElementById('photo-fic'); if (fic) fic.addEventListener('change', () => traiter(fic.files[0]));
  // la caméra s'éteint si la fenêtre est fermée
  const veille = setInterval(() => { if (!document.getElementById('modale')) { arreter(); clearInterval(veille); } }, 1000);
}
