/* =====================================================================
   CA_drive.js — photos (prise sur téléphone/tablette) et envoi sur Google Drive
   via l'Edge Function « caces-sauvegarder-drive ». La base ne garde que les
   références (id, nom, lien) des fichiers : les images sont sur le Drive.
   ===================================================================== */

/** Réduit une photo (≤ 1600 px, JPEG) : lisible pour un document, légère à stocker. */
function reduirePhoto(fichier, maxPx = 1600, qualite = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(fichier);
    img.onload = () => {
      const k = Math.min(1, maxPx / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', qualite).split(',')[1]);   // base64 sans en-tête
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}

/** Envoie un fichier (base64) sur le Drive ; renvoie { id, nom, lien }. */
async function envoyerSurDrive(chemin, nomFichier, mimeType, contenuBase64) {
  const { data, error } = await sb.functions.invoke('caces-sauvegarder-drive', {
    body: { chemin, nom_fichier: nomFichier, mime_type: mimeType, contenu_base64: contenuBase64 },
  });
  if (error) throw new Error(error.message || 'Envoi Drive impossible');
  if (!data?.ok) throw new Error(data?.erreur || 'Envoi Drive refusé');
  return { id: data.fichier_id, nom: nomFichier, lien: data.lien };
}

/** Photos choisies/prises dans un <input type=file> → Drive. Renvoie la liste de références. */
async function envoyerPhotosSurDrive(input, chemin, prefixeNom) {
  const refs = [];
  const fichiers = Array.from(input.files || []);
  for (let i = 0; i < fichiers.length; i++) {
    const b64 = await reduirePhoto(fichiers[i]);
    const horodatage = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    refs.push(await envoyerSurDrive(chemin, `${prefixeNom}_${horodatage}_${i + 1}.jpg`, 'image/jpeg', b64));
  }
  return refs;
}
