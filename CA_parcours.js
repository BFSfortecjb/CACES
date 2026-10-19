/* =====================================================================
   CA_parcours.js — parcours du stagiaire par catégorie :
   - initial
   - recyclage : photo de l'ancien CACES obligatoire (théorie à repasser)
   - autre catégorie dans l'année suivant la validation de la théorie :
     photo du CACES valide + date de validation de la théorie ; la théorie
     (valable 1 an) n'est pas repassée (dispense).
   ===================================================================== */
const LIBELLE_PARCOURS = { initial: 'Initial', recyclage: 'Recyclage', autre_categorie: 'Autre catégorie (théorie < 1 an)' };

function dateIlYaUnAn(refIso) {
  const d = new Date(refIso || Date.now()); d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

/** Réduit l'image (côté max 1600 px) → Blob JPEG. */
function reduireImage(fichier, max = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(fichier);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? resolve(b) : reject(new Error('Image illisible')), 'image/jpeg', 0.88);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}

async function ouvrirParcours(stagiaireId) {
  const { data: st, error } = await sb.from('stagiaires')
    .select('id, nom, prenom, session_id, stagiaire_categories(*)').eq('id', stagiaireId).single();
  if (error) return erreurSupabase('Lecture du stagiaire', error);
  const peut = droitsSession(S.session).ecriture;
  const cats = st.stagiaire_categories || [];
  ouvrirModale(`Parcours — ${st.nom} ${st.prenom}`, `
    <p class="aide">Recyclage ou nouvelle catégorie dans l'année suivant la validation de la théorie : prends en photo
      l'ancien CACES. Pour une nouvelle catégorie, la théorie (valable 1 an) n'est pas repassée.</p>
    ${cats.map((c, i) => `<form class="carte parcours-form" data-i="${i}">
      <h3>${esc(c.referentiel_code)} ${esc(c.categorie_code)}</h3>
      <label>Parcours <select name="parcours" ${peut ? '' : 'disabled'}>
        ${Object.entries(LIBELLE_PARCOURS).map(([k, v]) => `<option value="${k}" ${c.parcours === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <div class="zone-ancien" ${c.parcours === 'initial' ? 'hidden' : ''}>
        <label>N° de l'ancien CACES <input name="numero" value="${esc(c.ancien_caces_numero || '')}"></label>
        <label class="lbl-theorie">Date de validation de la théorie (ancien CACES)
          <input type="date" name="date_theorie" value="${esc(c.ancien_caces_date_theorie || '')}" max="${new Date().toISOString().slice(0, 10)}"></label>
        <label class="lbl-echeance">Date d'échéance de l'ancien CACES (reprise pour la nouvelle catégorie)
          <input type="date" name="date_echeance" value="${esc(c.ancien_caces_date_echeance || '')}"></label>
        <div class="doc-ancien">${c.ancien_caces_path ? '✔ Photo de l\'ancien CACES enregistrée' : '<i>Aucune photo</i>'}</div>
        ${peut ? `<div class="photo-actions">
          <label class="bouton-fichier">📁 Choisir un fichier / une photo<input type="file" accept="image/*,.heic" hidden name="fichier"></label>
          <label class="bouton-fichier">📷 Prendre en photo<input type="file" accept="image/*" capture="environment" hidden name="camera"></label></div>
          <div class="photo-choisie" aria-live="polite"></div>` : ''}
      </div>
      ${peut ? '<button class="principal" type="submit">Enregistrer</button>' : ''}
    </form>`).join('') || '<p>Aucune catégorie.</p>'}`, { large: true });

  $$('.parcours-form').forEach(form => {
    const c = cats[Number(form.dataset.i)];
    const zone = $('.zone-ancien', form);
    const lbl = $('.lbl-theorie', form), lblE = $('.lbl-echeance', form);
    const maj = () => { zone.hidden = form.parcours.value === 'initial'; lbl.hidden = form.parcours.value !== 'autre_categorie'; lblE.hidden = lbl.hidden; };
    form.parcours.addEventListener('change', maj); maj();
    ['fichier', 'camera'].forEach(n => form[n]?.addEventListener('change', () => {
      const f = form[n].files[0]; if (!f) return;
      form._photo = f;
      const z = $('.photo-choisie', form);
      z.innerHTML = `<b>✔ ${esc(f.name)}</b> (${Math.round(f.size / 1024)} Ko) — sera enregistrée avec « Enregistrer »<br><img alt="Aperçu" style="max-height:160px;margin-top:6px;border:1px solid #ccc;border-radius:6px">`;
      $('img', z).src = URL.createObjectURL(f);
    }));
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const parcours = form.parcours.value;
      const fichier = form._photo || null;
      const maj_ = { parcours, dispense_theorie: false };
      try {
        if (parcours !== 'initial') {
          if (!fichier && !c.ancien_caces_path) return toast('La photo de l\'ancien CACES est obligatoire.', 'erreur');
          maj_.ancien_caces_numero = form.numero.value.trim() || null;
          if (fichier) {
            const blob = await reduireImage(fichier);
            const path = `${st.session_id}/ancien_${st.id}_${c.referentiel_code}_${c.categorie_code}.jpg`;
            const { error: e1 } = await sb.storage.from('caces-photos-stagiaires').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
            if (e1) throw e1;
            maj_.ancien_caces_path = path;
          }
        }
        if (parcours === 'autre_categorie') {
          const d = form.date_theorie.value;
          if (!d) return toast('Indique la date de validation de la théorie de l\'ancien CACES.', 'erreur');
          if (d < dateIlYaUnAn()) return toast('La théorie date de plus d\'un an : elle doit être repassée (parcours Initial ou Recyclage).', 'erreur', 8000);
          const ech = form.date_echeance.value;
          if (!ech) return toast('Indique la date d\'échéance de l\'ancien CACES : la nouvelle catégorie aura la même échéance.', 'erreur', 8000);
          if (ech < new Date().toISOString().slice(0, 10)) return toast('L\'ancien CACES est expiré : ce n\'est plus une extension (parcours Initial ou Recyclage).', 'erreur', 8000);
          maj_.ancien_caces_date_echeance = ech;
          Object.assign(maj_, { ancien_caces_date_theorie: d, dispense_theorie: true,
            theorie_validee: true, date_validation_theorie: d });
        } else if (c.dispense_theorie) {
          Object.assign(maj_, { theorie_validee: null, date_validation_theorie: null, ancien_caces_date_echeance: null });   // dispense retirée
        }
        const { error: e2 } = await sb.from('stagiaire_categories').update(maj_)
          .eq('stagiaire_id', st.id).eq('referentiel_code', c.referentiel_code).eq('categorie_code', c.categorie_code);
        if (e2) throw e2;
        toast('Parcours enregistré'); fermerModale(); rendreDetailSession($('#contenu'));
      } catch (e) { erreurSupabase('Enregistrement du parcours', e); }
    });
  });
}
