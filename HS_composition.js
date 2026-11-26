/* © 2026 BFS HSE — Jérémy Bizeul / Vigie-lance. Tous droits réservés. */
'use strict';
// Équipements composés (mallettes, tableaux et armoires mobiles…) : liste de matériel par équipement avec pointage
// et dates propres à chaque élément, et suivi des sorties (intra) / retours.
// Tout compte avec un profil peut pointer le contenu et sortir / rentrer un équipement ; seuls admin et saisie modifient la liste.
const ETATS_COMPOSANT = { ok: ['Présent', 'ok'], a_remplacer: ['À remplacer', 'av'], manquant: ['Manquant', 'ret'] };

async function ficheEquipement(eqId, plateauId) {
  const [e, k, s] = await Promise.all([
    SB.from('plateau_equipements').select('*').eq('id', eqId).single(),
    SB.from('v_composants_etat').select('*').eq('equipement_id', eqId).order('designation'),
    SB.from('equipement_sorties').select('*').eq('equipement_id', eqId).order('sorti_le', { ascending: false }).limit(10)]);
  if (e.error) throw e.error; if (k.error) throw k.error;
  const comp = k.data || [], sorties = s.data || [], ouverte = sorties.find(x => !x.retour_le);
  const noms = await nomsAgents(sorties.flatMap(x => [x.sorti_par, x.rentre_par]));
  const manque = comp.filter(c => c.anomalie);
  const dateH = d => d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '';
  $('#contenu').innerHTML = `
    <div class="barre"><button class="btn sec" onclick="fichePlateau('${esc(plateauId)}')">← Retour au plateau</button>
      <div class="boutons">${comp.length ? `<button class="btn" onclick="formControleContenu('${esc(eqId)}','${esc(plateauId)}')">✔ Contrôler le contenu</button>` : ''}
      ${peutEcrire() ? `<button class="btn sec" onclick="formComposant('${esc(eqId)}','${esc(plateauId)}')">+ Élément</button>` : ''}</div></div>
    <div class="carte"><h2>${esc(e.data.designation)}</h2>
      <p>${esc((CAT_PLATEAU[e.data.categorie] || {}).nom || '')}${e.data.mobile ? ' · <b>mobile</b>' : ''}</p>
      ${e.data.commentaire ? `<p>${esc(e.data.commentaire)}</p>` : ''}
      ${e.data.mobile ? (ouverte
        ? `<p><span class="badge av">En sortie</span> chez <b>${esc(ouverte.lieu)}</b> depuis le ${dateH(ouverte.sorti_le)} (${esc(noms[ouverte.sorti_par] || '')})
           <button class="btn petit" onclick="formRetour('${esc(ouverte.id)}','${esc(eqId)}','${esc(plateauId)}')">Rentrer</button></p>`
        : `<p><span class="badge ok">Au dépôt</span> <button class="btn petit" onclick="formSortie('${esc(eqId)}','${esc(plateauId)}')">Sortir</button></p>`) : ''}
    </div>
    ${manque.length ? `<div class="carte"><b class="rouge">À compléter ou remplacer (${manque.length})</b><ul>${manque.map(c =>
      `<li>${esc(c.designation)} — ${c.quantite_presente < c.quantite_attendue ? `${c.quantite_attendue - c.quantite_presente} manquant${c.quantite_attendue - c.quantite_presente > 1 ? 's' : ''} sur ${c.quantite_attendue}` : esc(ETATS_COMPOSANT[c.etat][0].toLowerCase())}</li>`).join('')}</ul></div>` : ''}
    <h3>Contenu</h3>
    ${comp.length ? `<div class="tableau"><table><thead><tr><th>Élément</th><th>Présent / attendu</th><th>État</th><th>N° série</th><th>Dernière vérif.</th><th>Prochaine échéance</th><th></th></tr></thead>
      <tbody>${comp.map(c => `<tr><td><b>${esc(c.designation)}</b>${c.observation ? `<br><small>${esc(c.observation)}</small>` : ''}</td>
        <td>${c.quantite_presente} / ${c.quantite_attendue}</td>
        <td><span class="badge ${ETATS_COMPOSANT[c.etat][1]}">${ETATS_COMPOSANT[c.etat][0]}</span></td>
        <td>${esc(c.numero_serie) || '—'}</td><td>${fmtDate(c.derniere_verification)}</td>
        <td>${c.echeance ? fmtDate(c.echeance) + ' ' + badgeEtat(c.etat_echeance) : '—'}</td>
        <td class="nowrap">${peutEcrire() ? `<button class="btn sec petit" onclick="formComposant('${esc(eqId)}','${esc(plateauId)}','${esc(c.id)}')">Modifier</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : `<p class="vide">Aucun élément dans la liste.${peutEcrire() ? ' Ajoutez-les avec « + Élément ».' : ''}</p>`}
    ${e.data.mobile ? `<h3>Sorties et retours</h3>${sorties.length ? `<div class="tableau"><table><thead><tr><th>Sortie</th><th>Lieu</th><th>Retour</th><th>Remarque</th></tr></thead>
      <tbody>${sorties.map(x => `<tr><td>${dateH(x.sorti_le)}<br><small>${esc(noms[x.sorti_par] || '')}</small></td><td>${esc(x.lieu)}</td>
        <td>${x.retour_le ? dateH(x.retour_le) + `<br><small>${esc(noms[x.rentre_par] || '')}</small>` : '<span class="badge av">En sortie</span>'}</td>
        <td>${esc(x.remarque_retour)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="vide">Aucune sortie enregistrée.</p>'}` : ''}`;
}

// ---------- Liste de matériel (admin / saisie) ----------
async function formComposant(eqId, plateauId, id) {
  let c = {};
  if (id) c = (await SB.from('plateau_composants').select('*').eq('id', id).single()).data || {};
  ouvrirModal(`<h3>${id ? 'Modifier' : 'Ajouter'} un élément</h3>
    <form onsubmit="enregistrerComposant(event,'${esc(eqId)}','${esc(plateauId)}',${id ? `'${esc(id)}'` : 'null'})">
      <label>Désignation<input name="desig" required value="${esc(c.designation)}" placeholder="ex. Cordon de mesure, VAT, gants isolants"></label>
      <label>Quantité attendue<input type="number" name="qa" min="0" value="${c.quantite_attendue ?? 1}"></label>
      <label>N° de série <small>facultatif</small><input name="serie" value="${esc(c.numero_serie)}"></label>
      <label>Vérification tous les … mois <small>vide = pas de vérification périodique</small><input type="number" name="per" min="1" value="${c.periodicite_mois ?? ''}"></label>
      <label>Dernière vérification<input type="date" name="dv" value="${esc(c.derniere_verification)}"></label>
      <label>Date de péremption <small>facultatif</small><input type="date" name="dp" value="${esc(c.date_peremption)}"></label>
      <div class="actions">${id ? `<button type="button" class="btn sec" onclick="supprimerComposant('${esc(id)}','${esc(eqId)}','${esc(plateauId)}')">Retirer</button>` : ''}
        <button type="button" class="btn sec" onclick="fermerModal()">Annuler</button><button class="btn">Enregistrer</button></div>
    </form>`);
}
async function enregistrerComposant(ev, eqId, plateauId, id) {
  ev.preventDefault();
  const f = ev.target.elements, qa = parseInt(f.qa.value, 10) || 0;
  const ligne = { equipement_id: eqId, designation: f.desig.value.trim(), quantite_attendue: qa, numero_serie: f.serie.value.trim() || null,
    periodicite_mois: f.per.value ? parseInt(f.per.value, 10) : null, derniere_verification: f.dv.value || null,
    date_peremption: f.dp.value || null, maj_le: new Date().toISOString() };
  if (!id) ligne.quantite_presente = qa;
  const r = id ? await SB.from('plateau_composants').update(ligne).eq('id', id) : await SB.from('plateau_composants').insert(ligne);
  if (r.error) { toast(messageLisible(r.error), false); return; }
  fermerModal(); toast('Élément enregistré'); ficheEquipement(eqId, plateauId);
}
function supprimerComposant(id, eqId, plateauId) {
  const nom = (document.querySelector('#modal input[name=desig]') || {}).value || 'cet élément';
  mettreALaCorbeille('plateau_composants', id, nom, () => ficheEquipement(eqId, plateauId));
}

// ---------- Contrôle du contenu (tout technicien ou formateur) ----------
async function formControleContenu(eqId, plateauId) {
  const { data } = await SB.from('v_composants_etat').select('*').eq('equipement_id', eqId).order('designation');
  ouvrirModal(`<h3>Contrôler le contenu</h3>
    <p class="aide">Pour chaque élément : quantité réellement présente et état. « Vérifié » enregistre la date du jour.</p>
    <form onsubmit="enregistrerControleContenu(event,'${esc(eqId)}','${esc(plateauId)}')">
      ${(data || []).map(c => `<div class="point" data-id="${esc(c.id)}"><b>${esc(c.designation)}</b>
        <div class="point-ligne"><label>Présent<input type="number" min="0" name="q_${esc(c.id)}" value="${c.quantite_presente}" style="width:70px"> / ${c.quantite_attendue}</label>
        <select name="e_${esc(c.id)}">${Object.entries(ETATS_COMPOSANT).map(([k, v]) => `<option value="${k}"${c.etat === k ? ' selected' : ''}>${v[0]}</option>`).join('')}</select>
        <label class="case"><input type="checkbox" name="v_${esc(c.id)}" checked> Vérifié</label></div>
        <input name="o_${esc(c.id)}" placeholder="Remarque" value="${esc(c.observation)}">
        ${c.date_peremption ? `<label>Nouvelle péremption <small>si remplacé</small><input type="date" name="p_${esc(c.id)}"></label>` : ''}</div>`).join('')}
      <div class="actions"><button type="button" class="btn sec" onclick="fermerModal()">Annuler</button><button class="btn">Enregistrer</button></div>
    </form>`);
}
async function enregistrerControleContenu(ev, eqId, plateauId) {
  ev.preventDefault();
  const f = ev.target.elements;
  const ids = [...ev.target.querySelectorAll('.point')].map(p => p.dataset.id);
  let echecs = 0;
  for (const id of ids) {
    const q = parseInt(f['q_' + id].value, 10), perem = f['p_' + id] && f['p_' + id].value;
    const r = await SB.rpc('pointer_composant', { p_id: id, p_quantite: isNaN(q) ? null : q, p_etat: f['e_' + id].value,
      p_verifie: f['v_' + id].checked, p_observation: f['o_' + id].value, p_nouvelle_peremption: perem || null });
    if (r.error) echecs++;
  }
  if (echecs) toast(`${echecs} élément(s) n'ont pas pu être enregistrés.`, false); else toast('Contrôle enregistré');
  fermerModal(); ficheEquipement(eqId, plateauId);
}

// ---------- Sorties et retours ----------
function formSortie(eqId, plateauId) {
  ouvrirModal(`<h3>Sortir l'équipement</h3>
    <form onsubmit="enregistrerSortie(event,'${esc(eqId)}','${esc(plateauId)}')">
      <label>Lieu (client, chantier, intra)<input name="lieu" required placeholder="ex. Entreprise X — Quimper"></label>
      <p class="aide">Pensez à contrôler le contenu avant de partir.</p>
      <div class="actions"><button type="button" class="btn sec" onclick="fermerModal()">Annuler</button><button class="btn">Sortir</button></div>
    </form>`);
}
async function enregistrerSortie(ev, eqId, plateauId) {
  ev.preventDefault();
  const { error } = await SB.from('equipement_sorties').insert({ equipement_id: eqId, lieu: ev.target.elements.lieu.value.trim() });
  if (error) { toast(/duplicate|unique/i.test(error.message || '') ? 'Cet équipement est déjà en sortie.' : messageLisible(error), false); return; }
  fermerModal(); toast('Sortie enregistrée'); ficheEquipement(eqId, plateauId);
}
function formRetour(sortieId, eqId, plateauId) {
  ouvrirModal(`<h3>Rentrer l'équipement</h3>
    <form onsubmit="enregistrerRetour(event,'${esc(sortieId)}','${esc(eqId)}','${esc(plateauId)}')">
      <label>Remarque au retour <small>facultatif (casse, élément manquant…)</small><input name="rem"></label>
      <div class="actions"><button type="button" class="btn sec" onclick="fermerModal()">Annuler</button><button class="btn">Rentrer</button></div>
    </form>`);
}
async function enregistrerRetour(ev, sortieId, eqId, plateauId) {
  ev.preventDefault();
  const { error } = await SB.rpc('rentrer_equipement', { p_sortie: sortieId, p_remarque: ev.target.elements.rem.value });
  if (error) { toast(messageLisible(error), false); return; }
  fermerModal(); toast('Retour enregistré — contrôlez le contenu'); ficheEquipement(eqId, plateauId);
}
