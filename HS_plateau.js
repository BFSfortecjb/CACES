/* © 2026 BFS HSE — Jérémy Bizeul / Vigie-lance. Tous droits réservés. */
'use strict';
// Plateau technique : zones par thème et par agence, leur matériel, leurs échéances et les signalements de défaut.
// Tout compte avec un profil peut saisir un entretien ou signaler un défaut ; seuls admin et saisie créent/modifient.
const THEMES_PLATEAU = { electrique: 'Électrique', manutention: 'Manutention (CACES)', secourisme: 'Secourisme', autre: 'Autre' };
const CAT_PLATEAU = {
  armoire_pedagogique: { nom: 'Armoire électrique pédagogique', types: ['verif_armoire_electrique'] },
  armoire_exploitation: { nom: "Armoire électrique d'exploitation", types: ['verif_armoire_electrique'] },
  palettier: { nom: 'Palettier / rack', types: ['rack_inspection_visuelle', 'rack_inspection_annuelle'] },
  charge_contrainte: { nom: 'Charge de contrainte', types: ['verif_charges_contrainte'] },
  dae: { nom: 'DAE (défibrillateur)', types: ['verif_dispositif_medical'], medical: true,
    peremptions: [['peremption_electrodes', 'Péremption des électrodes'], ['peremption_batterie', 'Péremption de la batterie']] },
  mallette_mobile: { nom: 'Mallette mobile (intra)', types: ['verif_generale_plateau'], mobile: true },
  tableau_mobile: { nom: 'Tableau électrique mobile', types: ['verif_armoire_electrique'], mobile: true },
  armoire_mobile: { nom: 'Armoire électrique mobile', types: ['verif_armoire_electrique'], mobile: true },
  materiel_secourisme: { nom: 'Matériel de secourisme (trousse, oxygène, aspirateur…)', types: ['verif_dispositif_medical'], medical: true,
    peremptions: [['peremption_consommables_secours', 'Péremption des consommables']] },
  autre: { nom: 'Autre matériel', types: ['verif_generale_plateau'] }
};
const GRAVITES = { mineure: ['Mineure', 'av'], majeure: ['Majeure', 'ret'], critique: ['Critique', 'ret'] };
const STATUTS_SIGNAL = { ouvert: 'Ouvert', en_cours: 'En cours', clos: 'Clos' };

async function nomsAgents(ids) {
  const out = {};
  await Promise.all([...new Set(ids.filter(Boolean))].map(async id => {
    const r = await SB.rpc('nom_agent', { p: id }); out[id] = r.data || '';
  }));
  return out;
}
function pireEtat(liste) {
  const l = liste.map(e => e.etat);
  return l.includes('en_retard') ? 'en_retard' : l.includes('a_venir') ? 'a_venir' : l.length ? 'ok' : null;
}

async function rendrePlateau() {
  const zone = $('#contenu');
  zone.innerHTML = '<p class="vide">Chargement…</p>';
  const [pl, eq, sg] = await Promise.all([
    SB.from('plateaux').select('*').eq('actif', true).order('nom'),
    SB.from('plateau_equipements').select('id,plateau_id').eq('actif', true),
    SB.from('plateau_signalements').select('id,equipement_id,statut'), chargerEcheances()]);
  if (pl.error) throw pl.error;
  const noms = await nomsAgents((pl.data || []).map(p => p.responsable_id));
  const cartes = (pl.data || []).map(p => {
    const ids = (eq.data || []).filter(e => e.plateau_id === p.id).map(e => e.id);
    const ech = S.echeances.filter(e => ids.includes(e.plateau_equipement_id));
    const ouverts = (sg.data || []).filter(s => ids.includes(s.equipement_id) && s.statut !== 'clos').length;
    const etat = pireEtat(ech);
    return `<button class="plateau-carte" onclick="fichePlateau('${esc(p.id)}')">
      <b>${esc(p.nom)}</b><span class="sous">${esc(THEMES_PLATEAU[p.theme] || '')}${p.agence ? ' · ' + esc(p.agence) : ''}</span>
      <span>Responsable : <b>${esc(noms[p.responsable_id] || (p.responsable_id === S.user.id ? 'Vous' : '—'))}</b></span>
      <span>${ids.length} équipement${ids.length > 1 ? 's' : ''}${ouverts ? ` · <b class="rouge">${ouverts} signalement${ouverts > 1 ? 's' : ''} ouvert${ouverts > 1 ? 's' : ''}</b>` : ''}</span>
      ${etat ? badgeEtat(etat) : ''}</button>`;
  }).join('');
  zone.innerHTML = `<div class="barre"><h2>Plateau technique</h2>
    ${peutEcrire() ? '<button class="btn" onclick="formPlateau()">+ Plateau</button>' : ''}</div>
    ${cartes ? `<div class="cartes">${cartes}</div>` : '<p class="vide">Aucun plateau pour le moment.</p>'}`;
}

async function fichePlateau(id) {
  const [p, eq] = await Promise.all([SB.from('plateaux').select('*').eq('id', id).single(),
    SB.from('plateau_equipements').select('*').eq('plateau_id', id).eq('actif', true).order('designation')]);
  if (p.error) throw p.error;
  await chargerEcheances();
  const equips = eq.data || [], ids = equips.map(e => e.id);
  const sg = ids.length ? (await SB.from('plateau_signalements').select('*').in('equipement_id', ids).order('date_signalement', { ascending: false }).limit(30)).data || [] : [];
  const noms = await nomsAgents([p.data.responsable_id]);
  const estResp = p.data.responsable_id === S.user.id, peutTraiter = peutEcrire() || estResp;
  const ech = S.echeances.filter(e => ids.includes(e.plateau_equipement_id));
  const sortis = new Set(ids.length ? ((await SB.from('equipement_sorties').select('equipement_id').in('equipement_id', ids).is('retour_le', null)).data || []).map(x => x.equipement_id) : []);
  const nomEq = eid => (equips.find(e => e.id === eid) || {}).designation || '';
  $('#contenu').innerHTML = `
    <div class="barre"><button class="btn sec" onclick="rafraichir()">← Retour</button>
      <div class="boutons">${peutEcrire() ? `<button class="btn sec" onclick="formPlateau('${esc(id)}')">Modifier</button>
      <button class="btn" onclick="formEquipement('${esc(id)}')">+ Équipement</button>
      <button class="btn sec" onclick="mettreALaCorbeille('plateaux','${esc(id)}',${jq(p.data.nom)},rafraichir)">Supprimer</button>` : ''}</div></div>
    <div class="carte"><h2>${esc(p.data.nom)}</h2>
      <p>${esc(THEMES_PLATEAU[p.data.theme] || '')}${p.data.agence ? ' · ' + esc(p.data.agence) : ''}</p>
      <p>Responsable du plateau : <b>${esc(noms[p.data.responsable_id] || '—')}</b></p></div>
    <h3>Matériel</h3>
    ${equips.length ? `<div class="tableau"><table><thead><tr><th>Désignation</th><th>Catégorie</th><th>Marque / modèle</th><th>N° série / lot</th><th>État</th><th>Suivi</th><th></th></tr></thead>
      <tbody>${equips.map(e => `<tr><td><b>${esc(e.designation)}</b>${e.mobile ? (sortis.has(e.id) ? ' <span class="badge av">En sortie</span>' : ' <small>(mobile)</small>') : ''}</td><td>${esc((CAT_PLATEAU[e.categorie] || {}).nom)}</td>
        <td>${esc([e.marque, e.modele].filter(Boolean).join(' ')) || '—'}</td>
        <td>${esc(e.numero_serie) || '—'}${e.numero_lot ? '<br><small>lot ' + esc(e.numero_lot) + '</small>' : ''}</td>
        <td>${esc(ETATS_EPI[e.etat] || e.etat)}</td>
        <td>${pireEtat(S.echeances.filter(x => x.plateau_equipement_id === e.id)) ? badgeEtat(pireEtat(S.echeances.filter(x => x.plateau_equipement_id === e.id))) : '—'}</td>
        <td class="nowrap"><button class="btn sec petit" onclick="ficheEquipement('${esc(e.id)}','${esc(id)}')">Contenu</button> <button class="btn sec petit" onclick="formSignalement('${esc(e.id)}','${esc(id)}')">Signaler un défaut</button>${peutEcrire() ? ` <button class="btn sec petit" onclick="formModifierEquipement('${esc(e.id)}','${esc(id)}')">Modifier</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="vide">Aucun matériel dans ce plateau.</p>'}
    <h3>Échéances du plateau</h3>
    ${ech.length ? `<div class="tableau"><table><thead><tr><th>Élément</th><th>Échéance</th><th>Dernière</th><th>Prochaine</th><th>Reste</th><th>État</th><th></th></tr></thead>
      <tbody>${ech.map(r => ligneEcheance(r)).join('')}</tbody></table></div>` : '<p class="vide">Aucune échéance suivie.</p>'}
    <h3>Signalements de défaut</h3>
    ${sg.length ? `<div class="tableau"><table><thead><tr><th>Date</th><th>Matériel</th><th>Gravité</th><th>Description</th><th>Statut</th><th></th></tr></thead>
      <tbody>${sg.map(s => `<tr><td>${fmtDate(s.date_signalement)}</td><td>${esc(nomEq(s.equipement_id))}</td>
        <td><span class="badge ${GRAVITES[s.gravite][1]}">${GRAVITES[s.gravite][0]}</span></td>
        <td>${esc(s.description)}${s.suite_donnee ? `<br><small><b>Suite :</b> ${esc(s.suite_donnee)}</small>` : ''}
          ${(s.photos || []).map(ph => `<br><a href="#" onclick="voirPhoto('${esc(ph)}');return false">📷 Photo</a>`).join('')}</td>
        <td>${esc(STATUTS_SIGNAL[s.statut])}</td>
        <td>${peutTraiter ? `<button class="btn sec petit" onclick="formTraiterSignalement('${esc(s.id)}','${esc(id)}')">Traiter</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="vide">Aucun signalement.</p>'}`;
}
async function voirPhoto(chemin) {
  const r = await SB.storage.from('hse-fichiers').createSignedUrl(chemin, 600);
  if (r.error) { toast(messageLisible(r.error), false); return; }
  window.open(r.data.signedUrl, '_blank', 'noopener');
}

// ---------- Plateau ----------
async function formPlateau(id) {
  let p = {};
  if (id) p = (await SB.from('plateaux').select('*').eq('id', id).single()).data || {};
  const { data: ag } = await SB.from('plateaux').select('agence');
  const agences = [...new Set((ag || []).map(a => a.agence).filter(Boolean))];
  ouvrirModal(`<h3>${id ? 'Modifier' : 'Ajouter'} un plateau</h3>
    <p class="aide">Un plateau est une zone de formation (ex. « Plateau électrique — agence principale »). Il a un responsable ; les autres techniciens peuvent saisir les entretiens de son matériel.</p>
    <form onsubmit="enregistrerPlateau(event,${id ? `'${esc(id)}'` : 'null'})">
      <label>Nom<input name="nom" required value="${esc(p.nom)}" placeholder="ex. Plateau CACES"></label>
      <label>Thème<select name="theme">${Object.entries(THEMES_PLATEAU).map(([k, v]) => `<option value="${k}"${p.theme === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Agence<input name="agence" list="liste-agences" value="${esc(p.agence)}" placeholder="ex. Agence principale"></label>
      <datalist id="liste-agences">${agences.map(a => `<option value="${esc(a)}">`).join('')}</datalist>
      <label>Responsable du plateau<select name="resp">${optionsProfils(p.responsable_id)}</select></label>
      <div class="actions"><button type="button" class="btn sec" onclick="fermerModal()">Annuler</button><button class="btn">Enregistrer</button></div>
    </form>`);
}
async function enregistrerPlateau(ev, id) {
  ev.preventDefault();
  const f = ev.target.elements;
  const ligne = { nom: f.nom.value.trim(), theme: f.theme.value, agence: f.agence.value.trim() || null, responsable_id: f.resp.value || null };
  const r = id ? await SB.from('plateaux').update(ligne).eq('id', id) : await SB.from('plateaux').insert(ligne);
  if (r.error) { toast(messageLisible(r.error), false); return; }
  fermerModal(); toast('Plateau enregistré'); id ? fichePlateau(id) : rafraichir();
}

// ---------- Matériel ----------
function formEquipement(plateauId) {
  ouvrirModal(`<h3>Ajouter du matériel</h3>
    <form onsubmit="enregistrerEquipement(event,'${esc(plateauId)}')">
      <label>Catégorie<select name="cat" onchange="majFormEquipement()">${Object.entries(CAT_PLATEAU).map(([k, v]) => `<option value="${k}">${esc(v.nom)}</option>`).join('')}</select></label>
      <label>Désignation<input name="desig" required placeholder="ex. Palettier n°2"></label>
      <label>Marque / fabricant<input name="marque"></label>
      <label>Modèle<input name="modele"></label>
      <label>N° de série<input name="serie"></label>
      <label>N° de lot <small>(dispositifs médicaux)</small><input name="lot"></label>
      <label>Date de fabrication<input type="date" name="fab"></label>
      <label>Date d'achat<input type="date" name="achat"></label>
      <label>Date de mise en service<input type="date" name="mes" value="${aujourdhui()}"></label>
      <div id="eq-perem"></div>
      <label>Précisions<input name="com" placeholder="ex. situé au fond du plateau"></label>
      <div class="actions"><button type="button" class="btn sec" onclick="fermerModal()">Annuler</button><button class="btn">Enregistrer</button></div>
    </form>`);
  majFormEquipement();
}
function majFormEquipement() {
  const c = CAT_PLATEAU[$('#modal select[name=cat]').value];
  $('#eq-perem').innerHTML = (c.peremptions || []).map(([code, lib]) =>
    `<label>${esc(lib)} <small>(laisser vide si non applicable)</small><input type="date" name="per_${esc(code)}"></label>`).join('');
}
async function enregistrerEquipement(ev, plateauId) {
  ev.preventDefault();
  const f = ev.target.elements, cat = CAT_PLATEAU[f.cat.value];
  const ligne = { plateau_id: plateauId, categorie: f.cat.value, designation: f.desig.value.trim(), marque: f.marque.value.trim() || null,
    modele: f.modele.value.trim() || null, numero_serie: f.serie.value.trim() || null, numero_lot: f.lot.value.trim() || null,
    date_fabrication: f.fab.value || null, date_achat: f.achat.value || null, date_mise_en_service: f.mes.value || null,
    dispositif_medical: !!cat.medical, mobile: !!cat.mobile, commentaire: f.com.value.trim() || null };
  const { data, error } = await SB.from('plateau_equipements').insert(ligne).select('id').single();
  if (error) { toast(messageLisible(error), false); return; }
  const codes = [...cat.types, ...(cat.peremptions || []).map(p => p[0])];
  const { data: types } = await SB.from('types_echeance').select('id,code').in('code', codes);
  const lignes = [];
  (types || []).forEach(t => {
    if (cat.types.includes(t.code)) lignes.push({ type_id: t.id, plateau_equipement_id: data.id, reference_date: ligne.date_mise_en_service || aujourdhui() });
    else { const champ = f['per_' + t.code]; if (champ && champ.value) lignes.push({ type_id: t.id, plateau_equipement_id: data.id, date_fixe: champ.value }); }
  });
  if (lignes.length) { const r = await SB.from('echeances').insert(lignes); if (r.error) toast(messageLisible(r.error), false); }
  fermerModal(); toast('Matériel enregistré'); fichePlateau(plateauId);
}

// ---------- Signalement de défaut (matériovigilance) ----------
function formSignalement(equipementId, plateauId) {
  ouvrirModal(`<h3>Signaler un défaut</h3>
    <p class="aide">Une gravité « majeure » ou « critique » met le matériel « à vérifier » : ne l'utilisez plus tant qu'il n'est pas contrôlé.</p>
    <form onsubmit="enregistrerSignalement(event,'${esc(equipementId)}','${esc(plateauId)}')">
      <label>Gravité<select name="grav"><option value="mineure">Mineure — usure, gêne</option>
        <option value="majeure">Majeure — fonctionnement dégradé</option><option value="critique">Critique — danger, matériel inutilisable</option></select></label>
      <label>Description du défaut<textarea name="desc" rows="3" required></textarea></label>
      <label class="photo">📷 Prendre une photo<input type="file" accept="image/*" capture="environment" onchange="nomPhoto2(this)"></label>
      <small id="nomphoto2"></small>
      <div class="actions"><button type="button" class="btn sec" onclick="fermerModal()">Annuler</button><button class="btn" id="btn-sig">Envoyer</button></div>
    </form>`);
}
function nomPhoto2(i) { $('#nomphoto2').textContent = i.files[0] ? '✔ ' + i.files[0].name : ''; }
async function enregistrerSignalement(ev, equipementId, plateauId) {
  ev.preventDefault();
  const f = ev.target, btn = $('#btn-sig'); btn.disabled = true;
  const sid = crypto.randomUUID(), photos = [];
  const fichier = f.querySelector('input[type=file]').files[0];
  if (fichier) {
    try {
      const chemin = `plateau/${S.user.id}/${sid}.jpg`;
      const up = await SB.storage.from('hse-fichiers').upload(chemin, await reduireImage(fichier), { contentType: 'image/jpeg', upsert: true });
      if (up.error) throw up.error;
      photos.push(chemin);
    } catch (e) { toast("La photo n'a pas pu être envoyée.", false); }
  }
  const { error } = await SB.from('plateau_signalements').insert({ id: sid, equipement_id: equipementId,
    description: f.elements.desc.value.trim(), gravite: f.elements.grav.value, photos });
  if (error) { btn.disabled = false; toast(messageLisible(error), false); return; }
  fermerModal(); toast('Signalement envoyé'); fichePlateau(plateauId);
}
async function formTraiterSignalement(sid, plateauId) {
  const { data: s } = await SB.from('plateau_signalements').select('*').eq('id', sid).single();
  ouvrirModal(`<h3>Traiter le signalement</h3><p class="sous">${esc(s.description)}</p>
    <form onsubmit="enregistrerTraitement(event,'${esc(sid)}','${esc(plateauId)}')">
      <label>Statut<select name="statut">${Object.entries(STATUTS_SIGNAL).map(([k, v]) => `<option value="${k}"${s.statut === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Suite donnée<textarea name="suite" rows="3" placeholder="ex. Pièce remplacée le…">${esc(s.suite_donnee)}</textarea></label>
      <div class="actions"><button type="button" class="btn sec" onclick="fermerModal()">Annuler</button><button class="btn">Enregistrer</button></div>
    </form>`);
}
async function enregistrerTraitement(ev, sid, plateauId) {
  ev.preventDefault();
  const f = ev.target.elements;
  const { error } = await SB.from('plateau_signalements').update({ statut: f.statut.value, suite_donnee: f.suite.value.trim() || null, maj_le: new Date().toISOString() }).eq('id', sid);
  if (error) { toast(messageLisible(error), false); return; }
  fermerModal(); toast('Signalement mis à jour'); fichePlateau(plateauId);
}

// ---------- Modifier / supprimer un équipement ----------
async function formModifierEquipement(id, plateauId) {
  const { data: e, error } = await SB.from('plateau_equipements').select('*').eq('id', id).single();
  if (error) { toast(messageLisible(error), false); return; }
  ouvrirModal(`<h3>Modifier l'équipement</h3>
    <form onsubmit="enregistrerModifEquipement(event,'${esc(id)}','${esc(plateauId)}')">
      <label>Catégorie<select name="cat">${Object.entries(CAT_PLATEAU).map(([k, v]) => `<option value="${k}"${e.categorie === k ? ' selected' : ''}>${esc(v.nom)}</option>`).join('')}</select></label>
      <p class="aide">Changer la catégorie ne recrée pas les échéances déjà suivies.</p>
      <label>Désignation<input name="desig" required value="${esc(e.designation)}"></label>
      <label>Marque / fabricant<input name="marque" value="${esc(e.marque)}"></label>
      <label>Modèle<input name="modele" value="${esc(e.modele)}"></label>
      <label>N° de série<input name="serie" value="${esc(e.numero_serie)}"></label>
      <label>N° de lot<input name="lot" value="${esc(e.numero_lot)}"></label>
      <label>Date de fabrication<input type="date" name="fab" value="${esc(e.date_fabrication)}"></label>
      <label>Date d'achat<input type="date" name="achat" value="${esc(e.date_achat)}"></label>
      <label>Date de mise en service<input type="date" name="mes" value="${esc(e.date_mise_en_service)}"></label>
      <label>État<select name="etat">${Object.entries(ETATS_EPI).map(([k, v]) => `<option value="${k}"${e.etat === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      <label>Précisions<input name="com" value="${esc(e.commentaire)}"></label>
      <div class="actions"><button type="button" class="btn sec" onclick="mettreALaCorbeille('plateau_equipements','${esc(id)}',${jq(e.designation)},()=>fichePlateau('${esc(plateauId)}'))">Supprimer</button>
        <button type="button" class="btn sec" onclick="fermerModal()">Annuler</button><button class="btn">Enregistrer</button></div>
    </form>`);
}
async function enregistrerModifEquipement(ev, id, plateauId) {
  ev.preventDefault();
  const f = ev.target.elements, cat = CAT_PLATEAU[f.cat.value];
  const ligne = { categorie: f.cat.value, designation: f.desig.value.trim(), marque: f.marque.value.trim() || null, modele: f.modele.value.trim() || null,
    numero_serie: f.serie.value.trim() || null, numero_lot: f.lot.value.trim() || null, date_fabrication: f.fab.value || null,
    date_achat: f.achat.value || null, date_mise_en_service: f.mes.value || null, etat: f.etat.value, commentaire: f.com.value.trim() || null,
    dispositif_medical: !!cat.medical, mobile: !!cat.mobile, maj_le: new Date().toISOString() };
  const { error } = await SB.from('plateau_equipements').update(ligne).eq('id', id);
  if (error) { toast(messageLisible(error), false); return; }
  fermerModal(); toast('Équipement modifié'); fichePlateau(plateauId);
}
