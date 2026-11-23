/* =====================================================================
   CA_galaxy_envoi.js — envoi des documents et résultats vers Galaxy (chantier 21, écriture)

   Via l'Edge Function « caces-galaxy » (set_document / set_resultat_caces). Déroulé :
     1) choix des documents par stagiaire ; 2) « Contrôler » = PDF préparés puis contrôle à blanc par Galaxy (rien n'est enregistré) ;
     3) « Envoyer » = envoi réel, stagiaire par stagiaire, avec compte rendu. Chaque envoi est mémorisé (table galaxy_envois) :
     un document déjà envoyé n'est pas renvoyé sauf demande expresse (Galaxy garderait alors les deux).
   Décision du 23/11/2026 : tous les documents CACES sont déposés avec le type Galaxy « CERTIFICATS » (n° 5), dans la fiche du
   stagiaire concerné pour la session (documents de session : récapitulatif).
   ===================================================================== */

const LIBELLE_ENVOI_GALAXY = { carton: 'Carton CACES', preuve_test: 'Preuve de test', copie_qcm: 'Copie du QCM',
  recapitulatif: 'Récapitulatif de la session', resultats: 'Résultats CACES' };
const jjmmaaaaGalaxy = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

async function typeDocumentGalaxyCertificats() {
  try {
    const r = await galaxy('get_type_document', {}, 1, 100);
    const t = (r.result || []).find(x => /^certificats?$/i.test(String(x.nom_doc || '').trim()));
    if (t) return Number(t.id);
  } catch (_e) { /* repli sur l'identifiant connu */ }
  return 5;
}

async function appelEcritureGalaxy(methode, stagiaireGalaxyId, parametres, confirmer) {
  const { data, error } = await sb.functions.invoke('caces-galaxy', {
    body: { methode, session_id: S.session.id, stagiaire_galaxy_id: stagiaireGalaxyId || undefined, parametres, confirmer: confirmer === true } });
  if (error) {
    let m = error.message; try { const j = await error.context.json(); m = j.error || m; } catch (_e) { /* garde le message */ }
    throw new Error(m);
  }
  if (!data?.ok) throw new Error(data?.error || 'Réponse Galaxy invalide');
  return data.reponse;
}

/** Paramètres de set_resultat_caces pour un stagiaire (lit les résultats de l'appli ; les n° de carton viennent des certificats). */
async function parametresResultatsGalaxy(st) {
  const [{ data: cats }, { data: tirs }, { data: eps }, { data: certs }] = await Promise.all([
    sb.from('stagiaire_categories').select('*').eq('stagiaire_id', st.id),
    sb.from('qcm_tirages').select('score_global_pct, reussi, date_fin').eq('stagiaire_id', st.id).eq('statut', 'termine'),
    sb.from('epreuves_pratique').select('categorie_code, score_global, reussi, date_passage').eq('stagiaire_id', st.id).order('date_passage', { ascending: false }),
    sb.from('certificats').select('referentiel_code, categorie_code, numero, date_delivrance').eq('stagiaire_id', st.id),
  ]);
  const toutes = cats || [];
  if (!toutes.length) throw new Error('Aucune catégorie');
  const tv = toutes.map(c => c.theorie_validee);
  const resTheorie = tv.some(x => x === false) ? 'non_admis' : (tv.every(x => x === true) ? 'admis' : 'attente');
  const notes = (tirs || []).map(t => Number(t.score_global_pct)).filter(n => !isNaN(n));
  const p = { resultat_theorie: resTheorie };
  if (notes.length) p.note_theorie = Math.round(Math.max(...notes));
  const dateTh = toutes.map(c => c.date_validation_theorie).filter(Boolean).sort()[0];
  if (resTheorie === 'admis') p.date_theorie = jjmmaaaaGalaxy(dateTh || new Date().toISOString());
  const liste = toutes.map(c => {
    const ep = (eps || []).find(e => e.categorie_code === c.categorie_code);
    const cert = (certs || []).find(x => x.referentiel_code === c.referentiel_code && x.categorie_code === c.categorie_code);
    const r = c.pratique_validee === true ? 'admis' : (c.pratique_validee === false ? 'non_admis' : 'attente');
    const o = { categorie: c.categorie_code, resultat: r };
    if (ep && ep.score_global != null) o.note = Math.round(Number(ep.score_global));
    if (r === 'admis') {
      if (!cert) throw new Error(`Numéro de carton manquant pour la catégorie ${c.categorie_code} : coche aussi « Carton » pour l'attribuer d'abord`);
      o.date_obtention = jjmmaaaaGalaxy(cert.date_delivrance); o.num_carton = cert.numero;
    }
    return o;
  });
  p.liste_categories = JSON.stringify(liste);
  return p;
}

async function ouvrirEnvoiGalaxy() {
  const s = S.session;
  if (!Number(String(s.numero_session_galaxy || '').trim())) return toast('N° de session Galaxy numérique obligatoire.', 'erreur', 6000);
  const autorisation = s.type_session === 'autorisation';
  const [{ data: stags }, { data: envois }] = await Promise.all([
    sb.from('stagiaires').select('id, nom, prenom, galaxy_stagiaire_id, stagiaire_categories(theorie_validee, pratique_validee)').eq('session_id', s.id).order('nom'),
    sb.from('galaxy_envois').select('*').eq('session_id', s.id).eq('statut', 'envoye'),
  ]);
  const deja = (st, type) => (envois || []).find(e => e.type === type && (st ? e.stagiaire_id === st.id : !e.stagiaire_id));
  const ligne = st => {
    const cats = st.stagiaire_categories || [], titres = cats.filter(c => c.theorie_validee === true && c.pratique_validee === true).length;
    const relie = !!st.galaxy_stagiaire_id;
    const case_ = (type, actif) => {
      const e = deja(st, type);
      return `<td><label class="case"><input type="checkbox" data-st="${st.id}" data-type="${type}" ${actif && relie ? 'checked' : ''} ${actif && relie ? '' : 'disabled'}>
        ${e ? `<span class="etat ok" title="Envoyé le ${esc(dateFr(e.envoye_le))}">envoyé</span>` : ''}</label></td>`;
    };
    return `<tr><td>${esc(st.nom)} ${esc(st.prenom || '')}${relie ? '' : ' <span class="etat ko" title="Stagiaire non relié à Galaxy : importe-le depuis Galaxy">non relié à Galaxy</span>'}</td>
      <td>${titres}/${cats.length}</td>${case_('carton', !autorisation && titres > 0)}${case_('preuve_test', true)}${case_('copie_qcm', true)}${case_('resultats', !autorisation)}
      <td class="aide" data-etat="${st.id}"></td></tr>`;
  };
  const eRecap = deja(null, 'recapitulatif');
  ouvrirModale(`Envoyer vers Galaxy — session ${s.numero_session_galaxy}`, `
    <p class="aide">Les documents sont déposés dans la fiche Galaxy de chaque stagiaire, pour cette session, avec le type <b>CERTIFICATS</b>.
      Rien n'est envoyé tant que tu n'as pas cliqué sur « 2. Envoyer ». Générer un carton attribue définitivement son numéro CACES.</p>
    <table class="tableau"><thead><tr><th>Stagiaire</th><th>Titres</th><th>Carton</th><th>Preuve de test</th><th>Copie QCM</th><th>Résultats</th><th>Contrôle / envoi</th></tr></thead>
      <tbody>${(stags || []).map(ligne).join('') || '<tr><td colspan="7" class="vide">Aucun stagiaire.</td></tr>'}</tbody></table>
    <label class="case"><input type="checkbox" id="gx-recap" checked> Récapitulatif de la session (sur la session)
      ${eRecap ? `<span class="etat ok">envoyé le ${esc(dateFr(eRecap.envoye_le))}</span>` : ''}</label>
    <label class="case"><input type="checkbox" id="gx-renvoi"> Renvoyer aussi ce qui est déjà envoyé <span class="aide">(Galaxy gardera les deux exemplaires)</span></label>
    <div class="pied-modale"><button type="button" onclick="fermerModale()">Fermer</button>
      <button id="gx-controler">1. Préparer et contrôler (sans envoyer)</button>
      <button id="gx-envoyer" class="principal" disabled>2. Envoyer vers Galaxy</button></div>
    <p id="gx-msg" class="aide"></p>`);

  let prets = [];
  const etat = (id, html) => { const c = $(`[data-etat="${id}"]`); if (c) c.innerHTML = html; };
  $('#gx-controler').addEventListener('click', async () => {
    const msg = $('#gx-msg'); $('#gx-controler').disabled = true; $('#gx-envoyer').disabled = true; prets = [];
    try {
      const renvoi = $('#gx-renvoi').checked, coches = $$('input[data-type]:checked').map(i => ({ id: i.dataset.st, type: i.dataset.type }));
      const aFaire = coches.filter(c => renvoi || !deja({ id: c.id }, c.type));
      const recap = $('#gx-recap').checked && (renvoi || !eRecap);
      if (!aFaire.length && !recap) { msg.textContent = 'Rien à envoyer : tout est déjà envoyé (coche « Renvoyer » pour forcer).'; return; }
      if (aFaire.some(c => c.type === 'carton') && !confirm('Générer les cartons attribue définitivement leurs numéros CACES. Continuer ?')) return;
      const typeDoc = await typeDocumentGalaxyCertificats();
      const lot = 'BFSCACES-' + new Date().toISOString().slice(0, 16);
      const ordre = ['carton', 'preuve_test', 'copie_qcm', 'resultats'];
      const par = {};
      aFaire.forEach(c => { (par[c.id] = par[c.id] || []).push(c.type); });
      for (const st of (stags || []).filter(x => par[x.id])) {
        const types = par[st.id].sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b)), res = [];
        for (const type of types) {
          msg.textContent = `Préparation — ${st.nom} ${st.prenom || ''} : ${LIBELLE_ENVOI_GALAXY[type]}…`;
          try {
            let item;
            if (type === 'resultats') {
              item = { st, type, methode: 'set_resultat_caces', parametres: { ...(await parametresResultatsGalaxy(st)), lot }, nom: 'Résultats' };
            } else {
              const doc = type === 'carton' ? await genererDocumentPdf(st.id, true, { silencieux: true, retour: true })
                : type === 'preuve_test' ? await genererPreuveTestPdf(st.id) : await genererCopieQcmPdf(st.id);
              if (!doc) { res.push(`<span class="etat neutre">${LIBELLE_ENVOI_GALAXY[type]} : rien à envoyer</span>`); continue; }
              const nom = (type === 'preuve_test' && !/^preuve/i.test(doc.nom) ? 'Preuve_de_test_' : '') + doc.nom;
              item = { st, type, methode: 'set_document', nom, parametres: { type_document_id: typeDoc, nom_fichier: nom, fichier_base64: doc.base64, remplacer: 0, lot } };
            }
            await appelEcritureGalaxy(item.methode, st.galaxy_stagiaire_id, item.parametres, false);   // contrôle à blanc
            prets.push(item); res.push(`<span class="etat ok">${LIBELLE_ENVOI_GALAXY[type]} : contrôlé</span>`);
          } catch (e) { res.push(`<span class="etat ko" title="${esc(e.message)}">${LIBELLE_ENVOI_GALAXY[type]} : ${esc(e.message).slice(0, 90)}</span>`); }
        }
        etat(st.id, res.join('<br>'));
      }
      if (recap) {
        try {
          const rc = await genererRecapSessionPdf();
          if (rc) {
            const item = { st: null, type: 'recapitulatif', methode: 'set_document', nom: rc.nom,
              parametres: { type_document_id: typeDoc, nom_fichier: rc.nom, fichier_base64: rc.base64, remplacer: 0, lot } };
            await appelEcritureGalaxy('set_document', null, item.parametres, false); prets.push(item);
          }
        } catch (e) { toast('Récapitulatif : ' + e.message, 'erreur', 8000); }
      }
      msg.textContent = prets.length ? `${prets.length} envoi(s) contrôlé(s) par Galaxy — rien n'est encore enregistré. Clique sur « 2. Envoyer ».` : 'Aucun envoi valide.';
      $('#gx-envoyer').disabled = !prets.length;
    } catch (e) { erreurSupabase('Contrôle Galaxy', e); } finally { $('#gx-controler').disabled = false; }
  });

  $('#gx-envoyer').addEventListener('click', async () => {
    if (!prets.length || !confirm(`Envoyer ${prets.length} élément(s) vers Galaxy (session ${s.numero_session_galaxy}) ?`)) return;
    $('#gx-envoyer').disabled = true; $('#gx-controler').disabled = true;
    const msg = $('#gx-msg'); let ok = 0, ko = 0; const parSt = {};
    for (const it of prets) {
      msg.textContent = `Envoi ${ok + ko + 1}/${prets.length}…`;
      let ligne;
      try {
        const rep = await appelEcritureGalaxy(it.methode, it.st?.galaxy_stagiaire_id, it.parametres, true);
        const docId = rep?.result?.doc_id != null ? String(rep.result.doc_id) : null;
        await sb.from('galaxy_envois').insert({ session_id: s.id, stagiaire_id: it.st?.id || null, type: it.type, nom_fichier: it.nom, galaxy_doc_id: docId, statut: 'envoye', envoye_par: S.profil.id });
        ok++; ligne = `<span class="etat ok">${LIBELLE_ENVOI_GALAXY[it.type]} : envoyé</span>`;
      } catch (e) {
        ko++; ligne = `<span class="etat ko" title="${esc(e.message)}">${LIBELLE_ENVOI_GALAXY[it.type]} : échec</span>`;
        await sb.from('galaxy_envois').insert({ session_id: s.id, stagiaire_id: it.st?.id || null, type: it.type, nom_fichier: it.nom, statut: 'echec', detail: String(e.message).slice(0, 500), envoye_par: S.profil.id });
      }
      if (it.st) (parSt[it.st.id] = parSt[it.st.id] || []).push(ligne);
    }
    Object.entries(parSt).forEach(([id, l]) => etat(id, l.join('<br>')));
    msg.textContent = `Terminé : ${ok} envoyé(s)${ko ? `, ${ko} échec(s) (survole pour le détail ; relance « Préparer et contrôler » pour ré-essayer)` : ''}.`;
    toast(`Galaxy : ${ok} envoyé(s)${ko ? `, ${ko} échec(s)` : ''}`, ko ? 'erreur' : 'ok', 8000);
    prets = [];
  });
}
