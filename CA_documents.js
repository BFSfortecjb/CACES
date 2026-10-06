/* =====================================================================
   CA_documents.js — Documents de la SESSION (communs à tous les stagiaires) :
   feuille de présence globale, attestations de formation, CE / VGP,
   convention de mise à disposition / contrat de location, autres.
   Photos prises avec la tablette, stockées sur le Drive (dossier de la
   session) ; la base garde le lien et une miniature.
   ===================================================================== */

const TYPES_DOC_SESSION = [
  ['presence', 'Feuille de présence globale'],
  ['attestation', 'Attestations de formation'],
  ['ce_vgp', 'CE / VGP (si nécessaire)'],
  ['convention', 'Convention de mise à disposition de l\'engin / contrat de location'],
  ['autre', 'Autres documents'],
];

function miniature(fichier, px = 140) {
  return new Promise(resolve => {
    const img = new Image(), url = URL.createObjectURL(fichier);
    img.onload = () => { const k = px / Math.max(img.width, img.height), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.6)); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

async function ouvrirDocumentsSession() {
  const s = S.session;
  const { data, error } = await sb.from('session_documents').select('*').eq('session_id', s.id).order('created_at');
  if (error) return erreurSupabase('Lecture des documents', error);
  const peut = ['formateur', 'admin'].includes(S.profil?.role) || s.testeur_id === S.profil?.id;
  ouvrirModale('Documents de la session', `
    <p class="aide">Communs à tous les stagiaires de la session. Photos enregistrées sur le Drive, dossier « ${esc(s.nom)} ».</p>
    ${TYPES_DOC_SESSION.map(([code, lib]) => {
      const docs = (data || []).filter(d => d.type_code === code);
      return `<div class="doc-bloc"><div class="doc-titre">${esc(lib)} <span class="aide">(${docs.length})</span></div>
        <div class="doc-galerie">${docs.map(d => `<div class="doc-vignette">
            <a href="${esc(d.lien || '#')}" target="_blank" rel="noopener"><img src="${esc(d.miniature || '')}" alt="${esc(d.nom)}"></a>
            ${peut ? `<button class="icone" title="Retirer" onclick="supprimerDocSession('${d.id}')">✕</button>` : ''}</div>`).join('')
          || '<span class="aide">Aucun document.</span>'}</div>
        ${peut ? `<label class="bouton-fichier doc-ajout">📷 Ajouter une photo
          <input type="file" accept="image/*" capture="environment" multiple hidden onchange="ajouterDocSession(this,'${code}')"></label>` : ''}
      </div>`; }).join('')}`);
}

async function ajouterDocSession(input, code) {
  const s = S.session, fichiers = Array.from(input.files || []);
  if (!fichiers.length) return;
  toast('Envoi sur le Drive…');
  try {
    for (const f of fichiers) {
      const [b64, mini] = await Promise.all([reduirePhoto(f), miniature(f)]);
      const nom = `${code}_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.jpg`;
      const ref = await envoyerSurDrive(['Sessions', s.nom, 'Documents', (TYPES_DOC_SESSION.find(t => t[0] === code) || [])[1] || code], nom, 'image/jpeg', b64);
      const { error } = await sb.from('session_documents').insert({ session_id: s.id, type_code: code, nom, drive_id: ref.id, lien: ref.lien,
        miniature: mini, ajoute_par: S.profil.id });
      if (error) throw error;
    }
    toast('Document(s) enregistré(s)');
    ouvrirDocumentsSession();
  } catch (e) { erreurSupabase('Ajout du document', e); }
}

async function supprimerDocSession(id) {
  if (!confirm('Retirer ce document de la session ? (le fichier reste sur le Drive)')) return;
  const { error } = await sb.from('session_documents').delete().eq('id', id);
  if (error) return erreurSupabase('Suppression', error);
  ouvrirDocumentsSession();
}
