/* © Jérémy Bizeul / Vigie-lance — CACES® : onglet « Mes documents » (Mon espace).
   Justificatifs de testeur, documents administratifs, photo, signature, CACES personnel : chacun gère les siens ; l'administrateur peut tout gérer. */
const VALIDITE_BASE_PREVENTION_ANS = 5;   // la base prévention INRS doit avoir moins de 5 ans
const TYPES_DOC_PERSO = { base_prevention: 'Base prévention INRS (obligatoire pour les testeurs — moins de 5 ans)', justificatif: 'Justificatifs de testeur (certificat, diplômes, attestations, habilitations)', caces: 'Mes CACES®',
  administratif: 'Documents administratifs', photo: 'Photo', signature: 'Signature' };

function bandeauBasePrevention(docs, aujourd) {
  const d = docs.find(x => x.type === 'base_prevention' && x.actuelle);
  if (!d) return '<div class="carte" style="border-left:4px solid #b2181a"><b>Base prévention INRS manquante.</b> Ce document est obligatoire pour les testeurs : ajoute-le ci-dessous (moins de 5 ans).</div>';
  if (d.date_validite < aujourd) return `<div class="carte" style="border-left:4px solid #b2181a"><b>Base prévention INRS périmée</b> (plus de 5 ans depuis le ${dateFr(d.date_document)}). Ajoute une attestation récente.</div>`;
  return '';
}

async function rendreMesDocuments(zone) {
  const admin = S.profil?.role === 'admin';
  let cible = S._docPersoCible || S.profil?.id;
  const personnes = (S.formateurs || []).slice().sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'));
  const { data, error } = await sb.from('documents_personnels').select('*').eq('personne_id', cible).order('created_at', { ascending: false });
  if (error) return erreurSupabase('Lecture de mes documents', error);
  const docs = data || [], aujourd = new Date().toISOString().slice(0, 10);
  const etat = d => !d.date_validite ? '' : d.date_validite < aujourd ? 'retard' : (new Date(d.date_validite) - new Date(aujourd)) / 86400000 <= 60 ? 'proche' : '';
  zone.innerHTML = `<div class="barre-actions"><h2>📁 Mes documents</h2><button class="principal" id="md-nouv">+ Ajouter un document</button></div>
    ${admin ? `<label>Personne <select id="md-pers">${personnes.map(f => `<option value="${f.id}" ${f.id === cible ? 'selected' : ''}>${esc(`${f.nom || ''} ${f.prenom || ''}`.trim() || f.email)}</option>`).join('')}</select></label>` : ''}
    <p class="aide">Ces documents sont visibles uniquement par leur titulaire et par l'administrateur. Un nouveau fichier remplace le précédent (l'ancien reste conservé et consultable).</p>
    ${bandeauBasePrevention(docs, aujourd)}
    ${Object.entries(TYPES_DOC_PERSO).map(([k, lib]) => {
      const l = docs.filter(d => d.type === k && d.actuelle), h = docs.filter(d => d.type === k && !d.actuelle);
      return `<div class="carte"><h3>${lib}</h3>${l.length ? `<table class="tableau"><thead><tr><th>Document</th><th>Document du / Validité</th><th></th></tr></thead><tbody>
        ${l.map(d => { const e = etat(d); return `<tr><td><b>${esc(d.titre)}</b>${['photo', 'signature'].includes(d.type) ? `<div><img data-prev="${d.id}" alt="" style="max-height:70px;background:#fff;border:1px solid #ddd;border-radius:6px"></div>` : ''}${d.notes ? `<div class="aide">${esc(d.notes)}</div>` : ''}</td>
          <td>${d.date_document ? 'du ' + dateFr(d.date_document) + ' → ' : ''}${d.date_validite ? dateFr(d.date_validite) : '—'} ${e === 'retard' ? '<b style="color:#b2181a">Expiré</b>' : e === 'proche' ? '<b style="color:#c97a02">Bientôt</b>' : ''}</td>
          <td><button data-o="${d.id}">Ouvrir</button> <button data-r="${d.id}">Remplacer</button> <button data-x="${d.id}" class="danger">Supprimer</button></td></tr>`; }).join('')}</tbody></table>`
        : '<p class="aide">Aucun document.</p>'}
        ${h.length ? `<details><summary class="aide">Anciennes versions (${h.length})</summary>${h.map(d => `<div><button data-o="${d.id}">${esc(d.titre)} — ${dateFr(d.created_at.slice(0, 10))}</button></div>`).join('')}</details>` : ''}</div>`;
    }).join('')}`;
  $$('[data-prev]', zone).forEach(async im => {
    const d = docs.find(x => x.id === im.dataset.prev), { data: u } = await sb.storage.from('caces-personnel').createSignedUrl(d.fichier_path, 600);
    if (u?.signedUrl) im.src = u.signedUrl;
  });
  const ouvrir = async id => {
    const d = docs.find(x => x.id === id), { data: u } = await sb.storage.from('caces-personnel').createSignedUrl(d.fichier_path, 600);
    if (u?.signedUrl) window.open(u.signedUrl, '_blank', 'noopener'); else toast('Fichier introuvable.', 'erreur');
  };
  $$('[data-o]', zone).forEach(b => b.addEventListener('click', () => ouvrir(b.dataset.o)));
  $$('[data-r]', zone).forEach(b => b.addEventListener('click', () => formMesDocuments(cible, docs.find(x => x.id === b.dataset.r))));
  $$('[data-x]', zone).forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Supprimer ce document ?')) return;
    const d = docs.find(x => x.id === b.dataset.x);
    const { error: e1 } = await sb.from('documents_personnels').delete().eq('id', d.id);
    if (e1) return erreurSupabase('Suppression', e1);
    await sb.storage.from('caces-personnel').remove([d.fichier_path]);
    rendreMesDocuments(zone);
  }));
  $('#md-nouv', zone).addEventListener('click', () => formMesDocuments(cible, null));
  $('#md-pers', zone)?.addEventListener('change', e => { S._docPersoCible = e.target.value; rendreMesDocuments(zone); });
}

function formMesDocuments(personne, base) {
  ouvrirModale(base ? 'Remplacer — ' + base.titre : 'Ajouter un document', `<form id="md-form" class="formulaire">
    <label>Type <select name="type" ${base ? 'disabled' : ''}>${Object.entries(TYPES_DOC_PERSO).map(([k, v]) => `<option value="${k}" ${base?.type === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
    <label>Titre <input type="text" name="titre" value="${esc(base?.titre || '')}" required placeholder="ex. Certificat de testeur R489"></label>
    <div id="md-capture" hidden></div>
    <label id="md-l-fic">Fichier <input type="file" name="fichier" required></label>
    <div class="aide"><button type="button" id="md-ocr">🔍 Lire le document pour pré-remplir</button> <span id="md-ocr-etat"></span>
      <br>Lecture faite sur cet appareil (rien n'est envoyé). Vérifie toujours les valeurs proposées.</div>
    <div id="md-lignes" hidden></div>
    <label id="md-l-doc">Date du document (attestation) <input type="date" name="date_document" value="${base?.date_document || ''}"></label>
    <label id="md-l-val">Valable jusqu'au <input type="date" name="date_validite" value="${base?.date_validite || ''}"></label>
    <p class="aide" id="md-aide-bp" hidden>Validité calculée automatiquement : date du document + 5 ans.</p>
    <label>Notes <textarea name="notes" rows="2">${esc(base?.notes || '')}</textarea></label>
    <div class="pied-modale"><button type="button" onclick="fermerModale()">Annuler</button><button type="submit" class="principal">Enregistrer</button></div></form>`);
  let lignesOcr = [];
  const f0 = $('#md-form'), maj = () => { const bp = (base?.type || f0.type.value) === 'base_prevention';
    $('#md-aide-bp').hidden = !bp; $('#md-l-val').hidden = bp; f0.date_document.required = bp; };
  let capture = null, flux = null;                       // fichier produit par le selfie ou la signature
  const arreterCamera = () => { flux?.getTracks().forEach(t => t.stop()); flux = null; };
  const majCapture = () => {
    const t = base?.type || f0.type.value, z = $('#md-capture'); capture = null; arreterCamera();
    z.hidden = !['photo', 'signature'].includes(t); f0.fichier.required = z.hidden; $('#md-l-fic').querySelector('input').required = z.hidden;
    $('#md-ocr').parentElement.hidden = ['photo', 'signature'].includes(t);
    if (t === 'photo') initSelfie(z); else if (t === 'signature') initSignature(z); else z.innerHTML = '';
  };
  const initSelfie = z => {
    z.innerHTML = `<div class="aide">Prends un selfie avec la caméra de l'appareil, ou choisis un fichier ci-dessous.</div>
      <video id="md-video" autoplay playsinline muted style="max-width:100%;width:320px;border-radius:8px;background:#000" hidden></video>
      <canvas id="md-photo" style="max-width:100%;width:320px;border-radius:8px" hidden></canvas>
      <div><button type="button" id="md-cam">📷 Ouvrir la caméra</button> <button type="button" id="md-snap" class="principal" hidden>Prendre la photo</button>
        <button type="button" id="md-recam" hidden>Reprendre</button> <span class="aide" id="md-cam-etat"></span></div>`;
    $('#md-cam').onclick = async () => {
      try {
        flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 960 } }, audio: false });
        const v = $('#md-video'); v.srcObject = flux; v.hidden = false; $('#md-photo').hidden = true; $('#md-cam').hidden = true; $('#md-snap').hidden = false; $('#md-recam').hidden = true;
      } catch (e) { $('#md-cam-etat').textContent = 'Caméra indisponible ou refusée (' + (e.name || e) + ') : choisis un fichier à la place.'; }
    };
    $('#md-snap').onclick = () => {
      const v = $('#md-video'), c = $('#md-photo'), w = v.videoWidth || 640, h = v.videoHeight || 480, k = Math.min(1, 800 / Math.max(w, h));
      c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      c.toBlob(b => { capture = new File([b], 'selfie.jpg', { type: 'image/jpeg' }); }, 'image/jpeg', 0.9);
      arreterCamera(); v.hidden = true; c.hidden = false; $('#md-snap').hidden = true; $('#md-recam').hidden = false; $('#md-cam').hidden = true;
      if (!f0.titre.value) f0.titre.value = 'Photo d\'identité';
    };
    $('#md-recam').onclick = () => { capture = null; $('#md-cam').click(); };
  };
  const initSignature = z => {
    z.innerHTML = `<div class="aide">Signe dans le cadre avec le doigt, le stylet ou la souris.</div>
      <canvas id="md-sign" width="700" height="240" style="width:100%;max-width:700px;height:auto;border:2px dashed #bbb;border-radius:8px;background:#fff;touch-action:none"></canvas>
      <div><button type="button" id="md-sign-eff">Effacer</button> <span class="aide" id="md-sign-etat"></span></div>`;
    const c = $('#md-sign'), g = c.getContext('2d'); let dessine = false, trace = false;
    g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#111';
    const pos = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
    c.addEventListener('pointerdown', e => { dessine = true; c.setPointerCapture(e.pointerId); const [x, y] = pos(e); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.1, y + 0.1); g.stroke(); e.preventDefault(); });
    c.addEventListener('pointermove', e => { if (!dessine) return; const [x, y] = pos(e); g.lineTo(x, y); g.stroke(); trace = true; e.preventDefault(); });
    const fin = () => { if (!dessine) return; dessine = false; if (trace) c.toBlob(b => { capture = new File([b], 'signature.png', { type: 'image/png' }); }, 'image/png'); };
    c.addEventListener('pointerup', fin); c.addEventListener('pointercancel', fin); c.addEventListener('pointerleave', fin);
    $('#md-sign-eff').onclick = () => { g.clearRect(0, 0, c.width, c.height); capture = null; trace = false; };
    if (!f0.titre.value) f0.titre.value = 'Ma signature';
  };
  const garde = setInterval(() => { if (!document.getElementById('md-form')) { arreterCamera(); clearInterval(garde); } }, 1000);
  const majTout = () => { maj(); majCapture(); };
  f0.type.addEventListener('change', majTout); majTout();
  $('#md-ocr').addEventListener('click', async () => {
    const fic = f0.fichier.files[0], etat = $('#md-ocr-etat'); if (!fic) return toast('Choisis d\'abord un fichier.', 'erreur');
    try {
      etat.textContent = 'Lecture en cours (le premier usage charge le module)…';
      const lu = await lireDocument(fic, p => { etat.textContent = 'Lecture… ' + p + ' %'; }), r = analyserDocument(lu.texte, lu.items);
      if (!base && r.type) { f0.type.value = r.type; maj(); }
      if ((!f0.titre.value || f0.titre.dataset.auto === '1') && r.titre) { f0.titre.value = r.titre; f0.titre.dataset.auto = '1'; }
      lignesOcr = r.type === 'caces' ? r.lignes : [];
      const zl = $('#md-lignes'); zl.hidden = !lignesOcr.length;
      $('#md-l-doc').hidden = $('#md-l-val').hidden = !!lignesOcr.length;
      zl.innerHTML = lignesOcr.length ? `<b>CACES® lus sur le document</b> <span class="aide">(une ligne par catégorie, avec ses propres dates — corrige si besoin)</span>
        <table class="tableau"><thead><tr><th>N° du CACES®</th><th>Obtenu le</th><th>Échéance</th></tr></thead><tbody>
        ${lignesOcr.map((l, i) => `<tr><td>${esc(l.numero)}<div class="aide">${esc(l.ref)} cat. ${esc(l.cat)}</div></td>
          <td><input type="date" data-l="${i}" data-c="date_document" value="${l.date_document}"></td>
          <td><input type="date" data-l="${i}" data-c="date_validite" value="${l.date_validite}"></td></tr>`).join('')}</tbody></table>` : '';
      $$('#md-lignes input').forEach(x => x.addEventListener('change', () => { lignesOcr[x.dataset.l][x.dataset.c] = x.value; }));
      if (!lignesOcr.length) {
        if (r.date_document) f0.date_document.value = r.date_document;
        if (r.date_validite && !f0.date_validite.value) f0.date_validite.value = r.date_validite;
      }
      etat.textContent = (lignesOcr.length || r.date_document || r.date_validite || r.titre) ? 'Valeurs proposées : à vérifier avant d\'enregistrer.' : 'Rien de fiable trouvé : saisis les champs à la main.';
    } catch (e) { etat.textContent = 'Lecture impossible (' + (e.message || e) + ') : saisie manuelle.'; }
  });
  $('#md-form').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target, fic = capture || f.fichier.files[0];
    if (!fic) return toast(['photo', 'signature'].includes(base?.type || f.type.value) ? 'Prends la photo ou signe avant d\'enregistrer.' : 'Choisis un fichier.', 'erreur');
    const type = base?.type || f.type.value;
    const chemin = `${personne}/${type}/${Date.now()}_${fic.name.replace(/[^\w.-]+/g, '_')}`;
    const { error: e1 } = await sb.storage.from('caces-personnel').upload(chemin, fic, { upsert: false });
    if (e1) return erreurSupabase('Envoi du fichier', e1);
    if (type === 'caces' && lignesOcr.length) {          // carton lu : une fiche par catégorie, avec ses propres dates
      const lignes = lignesOcr.map(l => ({ personne_id: personne, type, titre: `CACES® ${l.ref} — cat. ${l.cat}`, fichier_path: chemin, date_document: l.date_document || null,
        date_validite: l.date_validite || null, notes: 'N° ' + l.numero, actuelle: true }));
      for (const l of lignes) { const { error: ea } = await sb.from('documents_personnels').update({ actuelle: false }).eq('personne_id', personne).eq('type', type).eq('titre', l.titre).eq('actuelle', true); if (ea) return erreurSupabase('Archivage', ea); }
      const { error: eb } = await sb.from('documents_personnels').insert(lignes);
      if (eb) return erreurSupabase('Enregistrement', eb);
      fermerModale(); return rendreMesDocuments($('#contenu'));
    }
    // photo / signature : un seul « actuel » par type ; sinon l'ancien version du même titre est archivé
    const q = sb.from('documents_personnels').update({ actuelle: false }).eq('personne_id', personne).eq('type', type).eq('actuelle', true);
    const { error: e2 } = await (['photo', 'signature', 'base_prevention'].includes(type) ? q : q.eq('titre', f.titre.value.trim()));
    if (e2) return erreurSupabase('Archivage de l\'ancienne version', e2);
    const { error: e3 } = await sb.from('documents_personnels').insert({ personne_id: personne, type, titre: f.titre.value.trim(), fichier_path: chemin,
      date_document: f.date_document.value || null,
      date_validite: type === 'base_prevention' ? (() => { const d = new Date(f.date_document.value); d.setFullYear(d.getFullYear() + VALIDITE_BASE_PREVENTION_ANS); return d.toISOString().slice(0, 10); })() : (f.date_validite.value || null), notes: f.notes.value.trim() || null, actuelle: true });
    if (e3) return erreurSupabase('Enregistrement', e3);
    fermerModale(); rendreMesDocuments($('#contenu'));
  });
}
