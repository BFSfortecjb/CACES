/* © 2026 BFS HSE — Jérémy Bizeul / Vigie-lance. Tous droits réservés. */
'use strict';
// Équipements de protection individuelle : types (liste de choix), dotations par agent.
const ETATS_EPI = { conforme: 'Conforme', a_verifier: 'À vérifier', a_remplacer: 'À remplacer', retire: 'Retiré' };
const AUTRE = '__autre__';
function slugCode(t) {
  return String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

async function rendreEpi() {
  const zone = $('#contenu');
  zone.innerHTML = '<p class="vide">Chargement…</p>';
  const [{ data, error }] = await Promise.all([
    SB.from('epi_dotations').select('*, epi_types(nom,famille)').eq('actif', true), chargerEcheances()]);
  if (error) throw error;
  S.dotations = data || [];
  afficherEpi();
}
function afficherEpi() {
  const zone = $('#contenu');
  const pire = id => {
    const l = S.echeances.filter(e => e.epi_dotation_id === id).map(e => e.etat);
    return l.includes('en_retard') ? 'en_retard' : l.includes('a_venir') ? 'a_venir' : l.length ? 'ok' : null;
  };
  const moi = S.user && S.user.id;
  const agent = d => nomProfil(d.agent_id) || (d.agent_id === moi ? 'Moi' : '—');
  let liste = S.dotations.slice();
  if (peutEcrire() && S.filtreAgent) liste = liste.filter(d => d.agent_id === S.filtreAgent);
  liste.sort((a, b) => agent(a).localeCompare(agent(b)) || String(a.epi_types && a.epi_types.nom).localeCompare(String(b.epi_types && b.epi_types.nom)));
  const titre = peutEcrire() ? 'Équipements de protection individuelle' : 'Mes EPI';
  zone.innerHTML = `
    <div class="barre"><h2>${titre}</h2><div class="boutons">
      ${S.role === 'admin' ? '<button class="btn sec" onclick="formTypeEpi()">+ Type d\'EPI</button>' : ''}
      ${peutEcrire() ? '<button class="btn sec" onclick="registreEpiPdf()">Registre PDF</button><button class="btn" onclick="formDotation()">+ Doter un agent</button>' : ''}</div></div>
    ${peutEcrire() ? `<label class="filtre">Afficher les EPI de :
      <select onchange="S.filtreAgent=this.value;afficherEpi()"><option value="">Tous les agents</option>
      ${S.profils.map(p => `<option value="${esc(p.id)}"${p.id === S.filtreAgent ? ' selected' : ''}>${esc(nomProfil(p.id))}</option>`).join('')}</select></label>` : ''}
    ${liste.length ? `<div class="tableau"><table>
      <thead><tr><th>Agent</th><th>EPI</th><th>Marque / modèle</th><th>N° de série</th><th>Fabrication</th><th>Achat</th><th>Mise en service</th><th>Péremption</th><th>État</th><th>Suivi</th><th></th></tr></thead>
      <tbody>${liste.map(d => `<tr><td><b>${esc(agent(d))}</b></td>
        <td>${esc(d.epi_types ? d.epi_types.nom : '')}<br><small>${esc(d.epi_types ? d.epi_types.famille : '')}</small></td>
        <td>${esc([d.marque, d.modele].filter(Boolean).join(' ')) || '—'}</td>
        <td>${esc(d.numero_serie)}${d.commentaire ? `<br><small>${esc(d.commentaire)}</small>` : ''}</td>
        <td>${fmtDate(d.date_fabrication)}</td><td>${fmtDate(d.date_achat)}</td><td>${fmtDate(d.date_mise_en_service)}</td><td>${fmtDate(d.date_peremption)}</td>
        <td>${esc(ETATS_EPI[d.etat] || d.etat)}</td><td>${pire(d.id) ? badgeEtat(pire(d.id)) : '—'}</td>
        <td class="nowrap">${peutEcrire() ? `<button class="btn petit" onclick="verifierEpi('${esc(d.id)}')">Vérifier</button> ` : ''}<button class="btn sec petit" onclick="ficheEpiPdf('${esc(d.id)}')">Fiche PDF</button>${peutEcrire() ? ` <button class="btn sec petit" onclick="mettreALaCorbeille('epi_dotations','${esc(d.id)}',${jq(((d.epi_types || {}).nom || 'EPI') + (d.numero_serie ? ' n° ' + d.numero_serie : ''))},rafraichir)">Supprimer</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="vide">Aucun EPI à afficher.</p>'}`;
}

// ---------- Types d'EPI (catalogue de l'entreprise) ----------
async function formTypeEpi() {
  const { data: exist } = await SB.from('epi_types').select('code,nom');
  S.codesEpi = new Set((exist || []).map(x => x.code));
  const familles = [...new Set(CATALOGUE_EPI.map(e => e[1]))];
  ouvrirModal(`<h3>Ajouter un type d'EPI</h3>
    <p class="aide">Un « type d'EPI » est un modèle d'équipement (ex. casque de chantier). On le crée <b>une seule fois</b> ;
    ensuite on le remet à chaque agent avec « Doter un agent ».</p>
    <form onsubmit="enregistrerTypeEpi(event)">
      <label>1. Famille<select name="famille" onchange="majModelesEpi()">
        ${familles.map(f => `<option>${esc(f)}</option>`).join('')}<option value="${AUTRE}">Autre famille…</option></select></label>
      <label class="libre" id="l-famille" hidden>Nom de la famille<input name="famille_libre" placeholder="ex. Protection thermique"></label>
      <label>2. Équipement<select name="modele" onchange="majChoixModeleEpi()"></select></label>
      <label class="libre" id="l-nom" hidden>Nom de l'équipement<input name="nom" placeholder="ex. Casque de chantier jaune"></label>
      <p class="aide" id="aide-norme"></p>
      <label>Durée de vie maximale <small>(en années à partir de la fabrication, si le fabricant en indique une)</small><input type="number" name="duree" min="1" max="50" placeholder="ex. 10"></label>
      <label>3. Vérification périodique obligatoire ?<select name="verif">
        <option value="false">Non — contrôle visuel avant usage</option><option value="true">Oui — vérification au moins annuelle</option></select></label>
      <p class="aide">Le code technique est créé automatiquement : vous n'avez rien à saisir.</p>
      <div class="actions"><button type="button" class="btn sec" onclick="fermerModal()">Annuler</button><button class="btn">Enregistrer</button></div>
    </form>`);
  majModelesEpi();
}
function majModelesEpi() {
  const f = $('#modal select[name=famille]').value, sel = $('#modal select[name=modele]');
  $('#l-famille').hidden = f !== AUTRE;
  const items = CATALOGUE_EPI.filter(e => e[1] === f);
  sel.innerHTML = items.map(e => `<option value="${esc(e[0])}"${S.codesEpi.has(e[0]) ? ' disabled' : ''}>${esc(e[2])}${S.codesEpi.has(e[0]) ? ' (déjà créé)' : ''}</option>`).join('')
    + `<option value="${AUTRE}">Autre (je saisis le nom)</option>`;
  const premier = [...sel.options].find(o => !o.disabled);
  sel.value = premier ? premier.value : AUTRE;
  majChoixModeleEpi();
}
function majChoixModeleEpi() {
  const m = $('#modal select[name=modele]').value, e = CATALOGUE_EPI.find(x => x[0] === m);
  $('#l-nom').hidden = !!e;
  $('#aide-norme').textContent = e ? (e[3] ? 'Norme de référence : ' + e[3] : '') : '';
  if (e) { $('#modal select[name=verif]').value = String(e[4]); $('#modal input[name=duree]').value = e[5] || ''; }
}
async function enregistrerTypeEpi(ev) {
  ev.preventDefault();
  const f = ev.target.elements, e = CATALOGUE_EPI.find(x => x[0] === f.modele.value);
  const famille = f.famille.value === AUTRE ? f.famille_libre.value.trim() : f.famille.value;
  const nom = e ? e[2] : f.nom.value.trim();
  if (!famille || !nom) { toast('Renseignez la famille et le nom.', false); return; }
  let code = e ? e[0] : slugCode(nom), base = code, n = 2;
  while (S.codesEpi.has(code)) code = base + '_' + n++;
  const { error } = await SB.from('epi_types').insert({
    code, nom, famille, norme_reference: e ? e[3] || null : null, verification_periodique: f.verif.value === 'true',
    duree_vie_ans: f.duree.value ? parseInt(f.duree.value, 10) : null });
  if (error) { toast(messageLisible(error), false); return; }
  fermerModal(); toast("Type d'EPI ajouté");
}

// ---------- Dotation d'un agent ----------
async function formDotation() {
  const { data: types } = await SB.from('epi_types').select('id,nom,famille,verification_periodique,duree_vie_ans').eq('actif', true).order('famille').order('nom');
  if (!(types || []).length) { toast("Ajoutez d'abord un type d'EPI (bouton « + Type d'EPI »).", false); return; }
  const groupes = {};
  types.forEach(t => { (groupes[t.famille || 'Autre'] = groupes[t.famille || 'Autre'] || []).push(t); });
  ouvrirModal(`<h3>Doter un agent</h3>
    <p class="aide">Indiquez <b>qui</b> reçoit <b>quel</b> équipement. Cette ligne permettra de suivre ses vérifications et sa date de fin de vie.</p>
    <form onsubmit="enregistrerDotation(event)">
      <label>Agent<select name="agent" required>${optionsProfils('')}</select></label>
      <label>Équipement<select name="type" onchange="majPeremption()">${Object.keys(groupes).map(g =>
        `<optgroup label="${esc(g)}">${groupes[g].map(t => `<option value="${esc(t.id)}" data-verif="${t.verification_periodique}" data-duree="${t.duree_vie_ans || ''}">${esc(t.nom)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label>Marque<input name="marque" placeholder="ex. Petzl, 3M, MSA…"></label>
      <label>Modèle<input name="modele" placeholder="ex. Vertex Best"></label>
      <label>N° de série <small>(gravé ou étiqueté sur l'équipement — indispensable pour le retrouver, surtout les antichutes)</small><input name="serie"></label>
      <label>Date de fabrication <small>(souvent marquée sur l'équipement ; point de départ de la durée de vie)</small><input type="date" name="fab" onchange="majPeremption()"></label>
      <label>Date d'achat<input type="date" name="achat"></label>
      <label>Date de mise en service<input type="date" name="mes" value="${aujourdhui()}"></label>
      <label>Date de péremption ou de fin de vie <small>(si l'équipement en a une, voir l'étiquette)</small><input type="date" name="per" oninput="this.dataset.manuel='1'"></label>
      <p class="aide" id="aide-per"></p>
      <label>Précisions <small>(taille, couleur, lieu de stockage…)</small><input name="com" placeholder="ex. Taille 42, rangé dans le camion"></label>
      <div class="actions"><button type="button" class="btn sec" onclick="fermerModal()">Annuler</button><button class="btn">Enregistrer</button></div>
    </form>`);
}
function majPeremption() {
  const f = $('#modal form').elements, duree = parseInt(f.type.selectedOptions[0].dataset.duree, 10);
  const aide = $('#aide-per');
  if (!duree || !f.fab.value) { aide.textContent = duree ? `Durée de vie de ${duree} ans à partir de la fabrication : renseignez la date de fabrication.` : ''; return; }
  if (f.per.dataset.manuel) { aide.textContent = ''; return; }
  const d = new Date(f.fab.value); d.setFullYear(d.getFullYear() + duree);
  f.per.value = d.toISOString().slice(0, 10);
  aide.textContent = `Calculée : fabrication + ${duree} ans (durée de vie maximale). Vous pouvez la modifier.`;
}
async function enregistrerDotation(ev) {
  ev.preventDefault();
  const f = ev.target.elements;
  if (!f.agent.value) { toast('Choisissez un agent.', false); return; }
  const verif = f.type.selectedOptions[0].dataset.verif === 'true';
  const ligne = { type_id: f.type.value, agent_id: f.agent.value, numero_serie: f.serie.value.trim() || null,
    marque: f.marque.value.trim() || null, modele: f.modele.value.trim() || null, date_fabrication: f.fab.value || null, date_achat: f.achat.value || null,
    date_mise_en_service: f.mes.value || null, date_peremption: f.per.value || null, commentaire: f.com.value.trim() || null };
  const { data, error } = await SB.from('epi_dotations').insert(ligne).select('id').single();
  if (error) { toast(messageLisible(error), false); return; }
  const { data: types } = await SB.from('types_echeance').select('id,code').in('code', ['verif_epi_annuelle', 'peremption_epi']);
  const lignes = [];
  (types || []).forEach(t => {
    if (t.code === 'verif_epi_annuelle' && verif) lignes.push({ type_id: t.id, epi_dotation_id: data.id, reference_date: ligne.date_mise_en_service || aujourdhui() });
    if (t.code === 'peremption_epi' && ligne.date_peremption) lignes.push({ type_id: t.id, epi_dotation_id: data.id, date_fixe: ligne.date_peremption });
  });
  if (lignes.length) { const r = await SB.from('echeances').insert(lignes); if (r.error) toast(messageLisible(r.error), false); }
  fermerModal(); toast('Dotation enregistrée'); rafraichir();
}

// Saisie d'une vérification depuis la liste des EPI
function verifierEpi(dotationId) {
  const l = S.echeances.filter(e => e.epi_dotation_id === dotationId && e.type_code === 'verif_epi_annuelle');
  const e = l[0] || S.echeances.find(x => x.epi_dotation_id === dotationId);
  if (!e) { toast("Aucune échéance de vérification n'est suivie pour cet EPI.", false); return; }
  ouvrirIntervention(e.echeance_id);
}
