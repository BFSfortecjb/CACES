/* =====================================================================
   CA_qualite.js — Onglet « Qualité » (admin) : registre des réclamations (§4.8),
   audits internes et revues de direction (§4.9). Saisie manuelle, export CSV.
   ===================================================================== */
const QUALITE = { onglet: 'reclamations' };
const STATUT_RECL = { recue: 'Reçue', en_cours: 'En cours', cloturee: 'Clôturée' };
const STATUT_AUDIT = { planifie: 'Planifié', realise: 'Réalisé', actions_soldees: 'Actions soldées' };

async function rendreQualite(zone) {
  zone.innerHTML = `<div class="barre-actions"><h2>✅ Qualité</h2></div>
    <nav class="stat-onglets">${[['reclamations', 'Réclamations'], ['audits', 'Audits internes & revue de direction']]
      .map(([k, l]) => `<button data-q="${k}" class="${QUALITE.onglet === k ? 'actif' : ''}">${l}</button>`).join('')}</nav>
    <div id="qualite-corps"></div>`;
  $$('[data-q]', zone).forEach(b => b.addEventListener('click', () => { QUALITE.onglet = b.dataset.q; rendreQualite(zone); }));
  const corps = $('#qualite-corps', zone);
  if (QUALITE.onglet === 'audits') return qualiteAudits(corps);
  return qualiteReclamations(corps);
}

function qualiteCsv(nom, entetes, lignes) {
  const c = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const txt = '﻿' + [entetes, ...lignes].map(l => l.map(c).join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })); a.download = nom; a.click();
}

async function qualiteReclamations(corps) {
  const { data, error } = await sb.from('reclamations').select('*, sessions_formation(nom)').order('recue_le', { ascending: false });
  if (error) return erreurSupabase('Lecture des réclamations', error);
  const l = data || [];
  corps.innerHTML = `<div class="carte"><p class="aide">Registre des réclamations (référentiel §4.8) : chaque réclamation reçue (mail reclamation@bfs-prevention.fr, courrier, oral) est saisie ici, traitée puis clôturée.</p>
    <button class="principal" id="q-nouv">+ Nouvelle réclamation</button> <button id="q-csv">Export CSV</button>
    <table class="tableau"><thead><tr><th>Reçue le</th><th>Origine</th><th>Session</th><th>Objet</th><th>Statut</th><th>Réponse</th><th></th></tr></thead><tbody>
    ${l.map(r => `<tr><td>${dateFr(r.recue_le)}</td><td>${esc(r.origine || '')}</td><td>${esc(r.sessions_formation?.nom || '')}</td><td>${esc(r.objet)}</td>
      <td>${STATUT_RECL[r.statut]}${r.cloturee_le ? ' le ' + dateFr(r.cloturee_le) : ''}</td><td>${esc(r.reponse || '')}</td>
      <td><button data-e="${r.id}">Modifier</button></td></tr>`).join('') || '<tr><td colspan="7" class="aide">Aucune réclamation enregistrée.</td></tr>'}
    </tbody></table></div>`;
  $('#q-csv', corps).addEventListener('click', () => qualiteCsv('registre_reclamations.csv', ['Reçue le', 'Origine', 'Session', 'Objet', 'Statut', 'Réponse', 'Clôturée le'],
    l.map(r => [r.recue_le, r.origine, r.sessions_formation?.nom, r.objet, STATUT_RECL[r.statut], r.reponse, r.cloturee_le])));
  $('#q-nouv', corps).addEventListener('click', () => qualiteFormReclamation(null));
  $$('[data-e]', corps).forEach(b => b.addEventListener('click', () => qualiteFormReclamation(l.find(r => r.id === b.dataset.e))));
}

function qualiteFormReclamation(r) {
  r = r || {};
  ouvrirModale(r.id ? 'Modifier la réclamation' : 'Nouvelle réclamation', `<form id="q-form" class="grille-form">
    <label>Reçue le <input type="date" name="recue_le" value="${r.recue_le || new Date().toISOString().slice(0, 10)}" required></label>
    <label>Origine <input name="origine" value="${esc(r.origine || '')}" placeholder="candidat, entreprise, certificateur…"></label>
    <label>Objet <textarea name="objet" rows="3" required>${esc(r.objet || '')}</textarea></label>
    <label>Statut <select name="statut">${Object.entries(STATUT_RECL).map(([k, v]) => `<option value="${k}" ${r.statut === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>Réponse / action menée <textarea name="reponse" rows="3">${esc(r.reponse || '')}</textarea></label>
    <div class="pied-modale"><button type="submit" class="principal">Enregistrer</button></div></form>`);
  $('#q-form').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target;
    const d = { recue_le: f.recue_le.value, origine: f.origine.value.trim() || null, objet: f.objet.value.trim(), statut: f.statut.value, reponse: f.reponse.value.trim() || null,
      cloturee_le: f.statut.value === 'cloturee' ? (r.cloturee_le || new Date().toISOString().slice(0, 10)) : null };
    const { error } = r.id ? await sb.from('reclamations').update(d).eq('id', r.id) : await sb.from('reclamations').insert(d);
    if (error) return erreurSupabase('Enregistrement de la réclamation', error);
    fermerModale?.(); rendreQualite($('#contenu') || document.querySelector('main') || document.body);
  });
}

async function qualiteAudits(corps) {
  const { data, error } = await sb.from('audits_internes').select('*').order('date_audit', { ascending: false });
  if (error) return erreurSupabase('Lecture des audits', error);
  const l = data || [];
  const T = { audit_interne: 'Audit interne', revue_direction: 'Revue de direction' };
  corps.innerHTML = `<div class="carte"><p class="aide">Audits internes et revue de direction (référentiel §4.9) : date, périmètre, constats et actions. Au moins un de chaque par an.</p>
    <button class="principal" id="q-nouv">+ Nouveau</button> <button id="q-csv">Export CSV</button>
    <table class="tableau"><thead><tr><th>Date</th><th>Type</th><th>Périmètre</th><th>Auditeur</th><th>Constats</th><th>Actions</th><th>Statut</th><th></th></tr></thead><tbody>
    ${l.map(a => `<tr><td>${dateFr(a.date_audit)}</td><td>${T[a.type]}</td><td>${esc(a.perimetre || '')}</td><td>${esc(a.auditeur || '')}</td><td>${esc(a.constats || '')}</td><td>${esc(a.actions || '')}</td>
      <td>${STATUT_AUDIT[a.statut]}</td><td><button data-e="${a.id}">Modifier</button></td></tr>`).join('') || '<tr><td colspan="8" class="aide">Aucun enregistrement.</td></tr>'}</tbody></table></div>`;
  $('#q-csv', corps).addEventListener('click', () => qualiteCsv('audits_internes.csv', ['Date', 'Type', 'Périmètre', 'Auditeur', 'Constats', 'Actions', 'Statut'],
    l.map(a => [a.date_audit, T[a.type], a.perimetre, a.auditeur, a.constats, a.actions, STATUT_AUDIT[a.statut]])));
  const form = a => {
    a = a || {};
    ouvrirModale(a.id ? 'Modifier' : 'Nouvel audit / revue', `<form id="q-form" class="grille-form">
      <label>Type <select name="type">${Object.entries(T).map(([k, v]) => `<option value="${k}" ${a.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Date <input type="date" name="date_audit" value="${a.date_audit || new Date().toISOString().slice(0, 10)}" required></label>
      <label>Périmètre <input name="perimetre" value="${esc(a.perimetre || '')}"></label>
      <label>Auditeur <input name="auditeur" value="${esc(a.auditeur || '')}"></label>
      <label>Constats <textarea name="constats" rows="3">${esc(a.constats || '')}</textarea></label>
      <label>Actions <textarea name="actions" rows="3">${esc(a.actions || '')}</textarea></label>
      <label>Statut <select name="statut">${Object.entries(STATUT_AUDIT).map(([k, v]) => `<option value="${k}" ${a.statut === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <div class="pied-modale"><button type="submit" class="principal">Enregistrer</button></div></form>`);
    $('#q-form').addEventListener('submit', async ev => {
      ev.preventDefault(); const f = ev.target;
      const d = { type: f.type.value, date_audit: f.date_audit.value, perimetre: f.perimetre.value.trim() || null, auditeur: f.auditeur.value.trim() || null,
        constats: f.constats.value.trim() || null, actions: f.actions.value.trim() || null, statut: f.statut.value };
      const { error: e } = a.id ? await sb.from('audits_internes').update(d).eq('id', a.id) : await sb.from('audits_internes').insert(d);
      if (e) return erreurSupabase('Enregistrement', e);
      fermerModale?.(); rendreQualite($('#contenu') || document.querySelector('main') || document.body);
    });
  };
  $('#q-nouv', corps).addEventListener('click', () => form(null));
  $$('[data-e]', corps).forEach(b => b.addEventListener('click', () => form(l.find(x => x.id === b.dataset.e))));
}
