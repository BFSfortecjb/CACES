/* © 2026 BFS HSE — Jérémy Bizeul / Vigie-lance. Tous droits réservés. */
'use strict';
// Compétences et formations internes : registre du personnel, formations saisies dans HSE, lecture de CACES et Habelec
// (via leurs fonctions competences_bfs(), jamais leurs tables), matrice, suivi des externes.
// Données de compétence uniquement : aucune donnée de santé. Admin et saisie voient tout ; les autres leurs propres lignes.
const STATUTS_COMP = { valide: ['Valide', 'ok'], a_renouveler: ['À renouveler', 'av'], expire: ['Expiré', 'ret'], manquant: ['Manquant', 'ret'] };
function badgeComp(s) { const [l, c] = STATUTS_COMP[s] || [s, '']; return `<span class="badge ${c}">${l}</span>`; }
const GRAVITE_COMP = { valide: 0, a_renouveler: 1, expire: 2, manquant: 2 };
function pireStatut(liste) { return liste.reduce((p, s) => (GRAVITE_COMP[s] > GRAVITE_COMP[p] ? s : p), 'valide'); }

async function chargerCompetences() {
  const [pers, types, hse, riv] = await Promise.all([
    SB.from('personnel').select('*').eq('actif', true).order('nom'),
    SB.from('types_competence').select('*').eq('actif', true).order('nom'),
    SB.from('v_competences_etat').select('*'),
    peutEcrire() ? SB.from('rapprochements').select('*') : Promise.resolve({ data: [] })]);
  for (const r of [pers, types, hse]) if (r.error) throw r.error;
  let briques = [], briquesIndispo = false;
  const b = await SB.rpc('competences_briques');
  if (b.error) briquesIndispo = true; else briques = b.data || [];
  S.comp = { personnel: pers.data || [], types: types.data || [], hse: hse.data || [], briques, briquesIndispo, rapp: riv.data || [] };
  return S.comp;
}

async function rendreCompetences() {
  const c = await chargerCompetences();
  S.sousComp = peutEcrire() ? (S.sousComp || 'matrice') : 'moi';
  const sous = peutEcrire() ? [['matrice', 'Matrice'], ['personnel', 'Personnel'], ['externes', 'Externes'], ['rapprocher', 'À rapprocher']] : [];
  const entete = `<div class="barre"><div class="sousonglets">${sous.map(([id, l]) =>
    `<button class="btn ${id === S.sousComp ? '' : 'sec'} petit" onclick="S.sousComp='${id}';rendreCompetences()">${l}</button>`).join(' ')}</div>
    ${peutEcrire() ? '<button class="btn" onclick="formPersonnel()">+ Personne</button>' : ''}</div>
    ${c.briquesIndispo ? '<p class="vide">La lecture de CACES et Habelec est momentanément indisponible : seules les formations saisies ici sont affichées.</p>' : ''}`;
  let corps = '';
  if (S.sousComp === 'matrice') corps = matriceComp(c);
  else if (S.sousComp === 'personnel') corps = listePersonnel(c);
  else if (S.sousComp === 'externes') corps = await suiviExternes();
  else if (S.sousComp === 'rapprocher') corps = aRapprocher(c);
  else corps = mesCompetences(c);
  $('#contenu').innerHTML = entete + corps;
}

function resumeBriques(c, pid) {
  const l = c.briques.filter(b => b.personnel_id === pid);
  return l.length ? `${l.length} · ${badgeComp(pireStatut(l.map(x => x.statut)))}` : '—';
}
function matriceComp(c) {
  if (!c.personnel.length) return '<p class="vide">Aucune personne dans le registre. Ajoutez-en avec « + Personne ».</p>';
  const cell = (pid, tid) => { const m = c.hse.find(x => x.personnel_id === pid && x.type_id === tid);
    return m ? `${badgeComp(m.statut)}<br><small>${m.valide_jusqu ? fmtDate(m.valide_jusqu) : 'sans échéance'}</small>` : '—'; };
  return `<div class="tableau"><table><thead><tr><th>Personne</th><th>Statut</th>${c.types.map(t => `<th>${esc(t.nom)}</th>`).join('')}<th>CACES / Habelec</th></tr></thead>
    <tbody>${c.personnel.map(p => `<tr onclick="fichePersonne('${esc(p.id)}')" style="cursor:pointer"><td><b>${esc(p.nom)} ${esc(p.prenom)}</b></td>
      <td>${p.statut_bfs === 'externe' ? 'Externe' : 'Salarié'}</td>${c.types.map(t => `<td>${cell(p.id, t.id)}</td>`).join('')}<td>${resumeBriques(c, p.id)}</td></tr>`).join('')}</tbody></table></div>`;
}
function listePersonnel(c) {
  return c.personnel.length ? `<div class="tableau"><table><thead><tr><th>Nom</th><th>Statut</th><th>Fonction</th><th>Agence</th><th>Compte</th><th></th></tr></thead>
    <tbody>${c.personnel.map(p => `<tr><td>${esc(p.nom)} ${esc(p.prenom)}</td><td>${p.statut_bfs === 'externe' ? 'Externe' : 'Salarié'}</td>
      <td>${esc(p.fonction)}</td><td>${esc(p.agence)}</td><td>${p.profil_id ? esc(nomProfil(p.profil_id)) : '—'}</td>
      <td><button class="btn sec petit" onclick="fichePersonne('${esc(p.id)}')">Fiche</button> <button class="btn sec petit" onclick="formPersonnel('${esc(p.id)}')">Modifier</button></td></tr>`).join('')}</tbody></table></div>`
    : '<p class="vide">Aucune personne.</p>';
}
function mesCompetences(c) {
  const me = c.personnel[0];
  const mesBriques = c.briques;
  if (!me && !mesBriques.length) return '<p class="vide">Aucune compétence enregistrée pour votre compte.</p>';
  return `<h3>Mes échéances</h3><div class="tableau"><table><thead><tr><th>Compétence</th><th>Valide jusqu'au</th><th>État</th></tr></thead><tbody>
    ${c.hse.map(m => `<tr><td>${esc(m.type_nom)}</td><td>${m.valide_jusqu ? fmtDate(m.valide_jusqu) : 'sans échéance'}</td><td>${badgeComp(m.statut)}</td></tr>`).join('')}
    ${mesBriques.map(b => `<tr><td>${esc(b.competence)} <small>(${b.source === 'caces' ? 'CACES' : 'Habelec'})</small></td><td>${b.valide_jusqu ? fmtDate(b.valide_jusqu) : 'sans échéance'}</td><td>${badgeComp(b.statut)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

async function suiviExternes() {
  const { data, error } = await SB.from('v_externes_suivi').select('*').order('nom');
  if (error) throw error;
  const l = data || [];
  if (!l.length) return '<p class="vide">Aucun intervenant externe dans le registre.</p>';
  S.externesExport = l;
  return `<div class="barre"><p>Compétences exigées de chaque externe, justifiées ou non.</p>
    <button class="btn sec" onclick="exporterExternes()">Exporter (audit Qualiopi)</button></div>
    <div class="tableau"><table><thead><tr><th>Intervenant</th><th>Compétence exigée</th><th>Valide jusqu'au</th><th>Situation</th><th>Justificatif</th></tr></thead>
    <tbody>${l.map(x => `<tr><td>${esc(x.nom)} ${esc(x.prenom)}</td><td>${esc(x.type_nom)}</td><td>${x.valide_jusqu ? fmtDate(x.valide_jusqu) : '—'}</td>
      <td>${badgeComp(x.situation)}</td><td>${x.justificatif_path ? `<button class="btn sec petit" onclick="voirJustificatif('${esc(x.justificatif_path)}')">Voir</button>` : '—'}</td></tr>`).join('')}</tbody></table></div>`;
}
function exporterExternes() {
  const lignes = [['Nom', 'Prénom', 'Compétence exigée', 'Obtenu le', 'Valide jusqu\'au', 'Situation', 'Justificatif']]
    .concat((S.externesExport || []).map(x => [x.nom, x.prenom, x.type_nom, x.obtenu_le || '', x.valide_jusqu || '', (STATUTS_COMP[x.situation] || [x.situation])[0], x.justificatif_path ? 'oui' : 'non']));
  const csv = '﻿' + lignes.map(l => l.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `suivi-externes-${aujourdhui()}.csv`; a.click(); URL.revokeObjectURL(a.href);
}
async function voirJustificatif(chemin) {
  const r = await SB.storage.from('hse-fichiers').createSignedUrl(chemin, 600);
  if (r.error || !r.data) { toast("Le justificatif n'a pas pu être ouvert.", false); return; }
  window.open(r.data.signedUrl, '_blank', 'noopener');
}

// Personnes de CACES / Habelec sans correspondance : rapprochement validé à la main par l'administrateur
function aRapprocher(c) {
  const non = c.briques.filter(b => !b.personnel_id);
  const groupes = {};
  non.forEach(b => { const k = b.source + '|' + b.personne_ref; (groupes[k] = groupes[k] || { b, n: 0 }).n++; });
  const l = Object.values(groupes);
  if (!l.length) return '<p class="vide">Toutes les personnes de CACES et Habelec sont rapprochées.</p>';
  return `<p>Ces personnes figurent dans CACES ou Habelec sans correspondance dans le registre. ${S.role === 'admin' ? 'Choisissez la fiche correspondante : le rapprochement n\'est jamais automatique sur le nom seul.' : 'Seul un administrateur peut les rapprocher.'}</p>
    <div class="tableau"><table><thead><tr><th>Brique</th><th>Nom indiqué</th><th>Compétences</th><th>Correspond à</th></tr></thead><tbody>
    ${l.map(g => `<tr><td>${g.b.source === 'caces' ? 'CACES' : 'Habelec'}</td><td>${esc(g.b.nom)}</td><td>${g.n}</td><td>${S.role === 'admin'
      ? `<select onchange="rapprocher('${esc(g.b.source)}','${esc(g.b.personne_ref)}',this.value)"><option value="">— choisir —</option>
         ${c.personnel.map(p => `<option value="${esc(p.id)}">${esc(p.nom)} ${esc(p.prenom)}</option>`).join('')}</select>` : '—'}</td></tr>`).join('')}</tbody></table></div>`;
}
async function rapprocher(brique, ref, personnelId) {
  if (!personnelId) return;
  const { error } = await SB.from('rapprochements').insert({ brique, personne_ref: ref, personnel_id: personnelId });
  if (error) { toast(messageLisible(error), false); return; }
  toast('Rapprochement enregistré'); rendreCompetences().catch(e => toast(messageLisible(e), false));
}

async function fichePersonne(id) {
  const c = S.comp || await chargerCompetences();
  const p = c.personnel.find(x => x.id === id); if (!p) return;
  const { data } = await SB.from('competences_personnel').select('*').eq('personnel_id', id).order('valide_jusqu', { ascending: false, nullsFirst: true });
  const hist = data || [];
  const nomType = tid => (c.types.find(t => t.id === tid) || {}).nom || '';
  const b = c.briques.filter(x => x.personnel_id === id);
  $('#contenu').innerHTML = `<div class="barre"><button class="btn sec" onclick="rendreCompetences()">← Retour</button>
      ${peutEcrire() ? `<button class="btn" onclick="formFormation('${esc(id)}')">+ Formation</button>` : ''}</div>
    <div class="carte"><h2>${esc(p.nom)} ${esc(p.prenom)} <small>${p.statut_bfs === 'externe' ? 'Externe' : 'Salarié'}</small></h2>
      <p>${esc([p.fonction, p.agence].filter(Boolean).join(' · '))}</p></div>
    <h3>Formations et compétences saisies dans HSE</h3>
    ${hist.length ? `<div class="tableau"><table><thead><tr><th>Compétence</th><th>Obtenue le</th><th>Valide jusqu'au</th><th>Commentaire</th><th></th></tr></thead>
      <tbody>${hist.map(h => `<tr><td>${esc(nomType(h.type_id))}</td><td>${fmtDate(h.obtenu_le)}</td><td>${h.valide_jusqu ? fmtDate(h.valide_jusqu) : 'sans échéance'}</td>
        <td>${esc(h.commentaire)}</td><td>${h.justificatif_path ? `<button class="btn sec petit" onclick="voirJustificatif('${esc(h.justificatif_path)}')">Justificatif</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="vide">Aucune formation saisie.</p>'}
    <h3>CACES et Habelec</h3>
    ${b.length ? `<div class="tableau"><table><thead><tr><th>Brique</th><th>Compétence</th><th>Obtenue le</th><th>Valide jusqu'au</th><th>État</th></tr></thead>
      <tbody>${b.map(x => `<tr><td>${x.source === 'caces' ? 'CACES' : 'Habelec'}</td><td>${esc(x.competence)}</td><td>${fmtDate(x.obtenu_le)}</td>
        <td>${x.valide_jusqu ? fmtDate(x.valide_jusqu) : 'sans échéance'}</td><td>${badgeComp(x.statut)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="vide">Aucune compétence rapprochée de CACES ou Habelec.</p>'}`;
}

function formPersonnel(id) {
  const p = (S.comp && S.comp.personnel.find(x => x.id === id)) || {};
  ouvrirModal(`<h2>${id ? 'Modifier la personne' : 'Nouvelle personne'}</h2>
    <label>Nom<input id="pe_nom" value="${esc(p.nom || '')}"></label>
    <label>Prénom<input id="pe_prenom" value="${esc(p.prenom || '')}"></label>
    <label>Statut<select id="pe_statut"><option value="salarie"${p.statut_bfs !== 'externe' ? ' selected' : ''}>Salarié BFS</option>
      <option value="externe"${p.statut_bfs === 'externe' ? ' selected' : ''}>Intervenant externe</option></select></label>
    <label>Fonction<input id="pe_fonction" value="${esc(p.fonction || '')}"></label>
    <label>Agence<input id="pe_agence" value="${esc(p.agence || '')}"></label>
    <label>Compte Univers BFS <small>facultatif</small><select id="pe_profil">${optionsProfils(p.profil_id)}</select></label>
    <div class="barre">${id ? `<button class="btn sec" onclick="mettreALaCorbeille('personnel','${esc(id)}',${jq((p.nom || '') + ' ' + (p.prenom || ''))},rendreCompetences)">Supprimer</button>` : ''}<button class="btn sec" onclick="fermerModal()">Annuler</button>
      <button class="btn" onclick="enregistrerPersonnel('${esc(id || '')}')">Enregistrer</button></div>`);
}
async function enregistrerPersonnel(id) {
  const v = k => document.getElementById(k).value.trim();
  if (!v('pe_nom') || !v('pe_prenom')) { toast('Nom et prénom obligatoires.', false); return; }
  const ligne = { nom: v('pe_nom'), prenom: v('pe_prenom'), statut_bfs: v('pe_statut'), fonction: v('pe_fonction') || null,
    agence: v('pe_agence') || null, profil_id: v('pe_profil') || null, maj_le: new Date().toISOString() };
  const r = id ? await SB.from('personnel').update(ligne).eq('id', id) : await SB.from('personnel').insert(ligne);
  if (r.error) { toast(messageLisible(r.error), false); return; }
  fermerModal(); toast('Enregistré'); rendreCompetences().catch(e => toast(messageLisible(e), false));
}

function formFormation(personnelId) {
  const types = S.comp.types;
  ouvrirModal(`<h2>Nouvelle formation / compétence</h2>
    <label>Compétence<select id="fo_type" onchange="majValiditeFormation()">${types.map(t =>
      `<option value="${esc(t.id)}" data-mois="${t.validite_mois || ''}">${esc(t.nom)}</option>`).join('')}</select></label>
    <label>Obtenue le<input type="date" id="fo_obtenu" value="${aujourdhui()}" onchange="majValiditeFormation()"></label>
    <label>Valide jusqu'au <small>vide = sans échéance</small><input type="date" id="fo_valide"></label>
    <label>Justificatif <small>photo, scan ou PDF</small><input type="file" id="fo_fichier" accept="image/*,application/pdf"></label>
    <label>Commentaire<input id="fo_comm"></label>
    <div class="barre"><button class="btn sec" onclick="fermerModal()">Annuler</button>
      <button class="btn" onclick="enregistrerFormation('${esc(personnelId)}')">Enregistrer</button></div>`);
  majValiditeFormation();
}
function majValiditeFormation() {
  const o = document.getElementById('fo_type').selectedOptions[0], d = document.getElementById('fo_obtenu').value;
  const mois = parseInt(o && o.dataset.mois, 10);
  if (mois && d) { const x = new Date(d + 'T00:00:00'); x.setMonth(x.getMonth() + mois); document.getElementById('fo_valide').value = x.toISOString().slice(0, 10); }
  else document.getElementById('fo_valide').value = '';
}
async function enregistrerFormation(personnelId) {
  const g = k => document.getElementById(k).value;
  const ligne = { personnel_id: personnelId, type_id: g('fo_type'), obtenu_le: g('fo_obtenu') || null,
    valide_jusqu: g('fo_valide') || null, commentaire: g('fo_comm').trim() || null };
  const f = document.getElementById('fo_fichier').files[0];
  if (f) {
    try {
      const pdf = f.type === 'application/pdf';
      const chemin = `competences/${personnelId}/${crypto.randomUUID()}.${pdf ? 'pdf' : 'jpg'}`;
      const up = await SB.storage.from('hse-fichiers').upload(chemin, pdf ? f : await reduireImage(f), { contentType: pdf ? 'application/pdf' : 'image/jpeg' });
      if (up.error) throw up.error;
      ligne.justificatif_path = chemin;
    } catch (e) { toast("Le justificatif n'a pas pu être envoyé.", false); return; }
  }
  const { error } = await SB.from('competences_personnel').insert(ligne);
  if (error) { toast(messageLisible(error), false); return; }
  fermerModal(); toast('Formation enregistrée'); await chargerCompetences(); fichePersonne(personnelId);
}
