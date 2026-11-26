/* © 2026 BFS HSE — Jérémy Bizeul / Vigie-lance. Tous droits réservés. */
'use strict';
// Suppression sécurisée : rien n'est effacé directement. Un élément « supprimé » va à la corbeille (restaurable) ;
// chaque suppression exige de recopier un mot de confirmation ; l'effacement définitif est réservé à l'administrateur.
window._actionConfirmee = null;
function jq(v) { return esc(JSON.stringify(String(v == null ? '' : v))); }  // texte sûr dans un onclick="…"
function confirmerParMot(titre, texte, mot, libelleBouton, action) {
  window._actionConfirmee = action;
  ouvrirModal(`<h3>${esc(titre)}</h3><p>${texte}</p>
    <p>Pour confirmer, écrivez le mot <b>${esc(mot)}</b> :</p>
    <input id="mot-confirm" autocomplete="off" autocapitalize="characters" oninput="document.getElementById('btn-confirm').disabled = this.value.trim().toUpperCase() !== '${esc(mot)}'">
    <div class="actions"><button type="button" class="btn sec" onclick="fermerModal()">Annuler</button>
      <button type="button" class="btn" id="btn-confirm" disabled onclick="const a=window._actionConfirmee;window._actionConfirmee=null;fermerModal();a&&a()">${esc(libelleBouton)}</button></div>`);
  setTimeout(() => { const i = document.getElementById('mot-confirm'); if (i) i.focus(); }, 50);
}
const TABLES_CORBEILLE = { plateaux: 'Plateau', plateau_equipements: 'Équipement', plateau_composants: "Élément d'équipement", epi_dotations: 'EPI', personnel: 'Personne' };

function mettreALaCorbeille(table, id, libelle, apres) {
  confirmerParMot('Mettre à la corbeille', `« <b>${esc(libelle)}</b> » et ce qui en dépend (échéances, contenu) seront retirés des listes. Vous pourrez le restaurer depuis l'onglet Corbeille.`,
    'SUPPRIMER', 'Mettre à la corbeille', async () => {
      const { error } = await SB.rpc('mettre_a_la_corbeille', { p_table: table, p_id: id });
      if (error) { toast(messageLisible(error), false); return; }
      toast('Mis à la corbeille'); if (apres) apres();
    });
}

async function rendreCorbeille() {
  const q = (t, cols) => SB.from(t).select(cols).eq('actif', false).order('supprime_le', { ascending: false });
  const [pl, eq, co, ep, pe] = await Promise.all([q('plateaux', 'id,nom,supprime_le,supprime_par'),
    q('plateau_equipements', 'id,designation,plateau_id,supprime_le,supprime_par'),
    q('plateau_composants', 'id,designation,equipement_id,supprime_le,supprime_par'),
    q('epi_dotations', 'id,numero_serie,supprime_le,supprime_par,epi_types(nom)'),
    q('personnel', 'id,nom,prenom,supprime_le,supprime_par')]);
  for (const r of [pl, eq, co, ep, pe]) if (r.error) throw r.error;
  const plIds = new Map((pl.data || []).map(p => [p.id, p.supprime_le])), eqIds = new Map((eq.data || []).map(e => [e.id, e.supprime_le]));
  const lignes = [
    ...(pl.data || []).map(x => ({ t: 'plateaux', id: x.id, nom: x.nom, le: x.supprime_le, par: x.supprime_par })),
    ...(eq.data || []).filter(x => plIds.get(x.plateau_id) !== x.supprime_le).map(x => ({ t: 'plateau_equipements', id: x.id, nom: x.designation, le: x.supprime_le, par: x.supprime_par })),
    ...(co.data || []).filter(x => eqIds.get(x.equipement_id) !== x.supprime_le).map(x => ({ t: 'plateau_composants', id: x.id, nom: x.designation, le: x.supprime_le, par: x.supprime_par })),
    ...(ep.data || []).map(x => ({ t: 'epi_dotations', id: x.id, nom: `${(x.epi_types || {}).nom || 'EPI'}${x.numero_serie ? ' n° ' + x.numero_serie : ''}`, le: x.supprime_le, par: x.supprime_par })),
    ...(pe.data || []).map(x => ({ t: 'personnel', id: x.id, nom: `${x.nom} ${x.prenom}`, le: x.supprime_le, par: x.supprime_par }))
  ].sort((a, b) => String(b.le).localeCompare(String(a.le)));
  const noms = await nomsAgents(lignes.map(l => l.par));
  $('#contenu').innerHTML = `<div class="barre"><h2>Corbeille</h2></div>
    <p class="aide">Les éléments supprimés sont conservés ici. Seul un administrateur peut les effacer définitivement.</p>
    ${lignes.length ? `<div class="tableau"><table><thead><tr><th>Élément</th><th>Type</th><th>Supprimé le</th><th>Par</th><th></th></tr></thead>
      <tbody>${lignes.map(l => `<tr><td><b>${esc(l.nom)}</b></td><td>${TABLES_CORBEILLE[l.t]}</td>
        <td>${l.le ? new Date(l.le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td><td>${esc(noms[l.par] || '')}</td>
        <td class="nowrap"><button class="btn sec petit" onclick="restaurerElement('${l.t}','${esc(l.id)}')">Restaurer</button>
        ${S.role === 'admin' ? ` <button class="btn sec petit" onclick="effacerElement('${l.t}','${esc(l.id)}',${jq(l.nom)})">Effacer définitivement</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="vide">La corbeille est vide.</p>'}`;
}
async function restaurerElement(table, id) {
  const { error } = await SB.rpc('restaurer_de_la_corbeille', { p_table: table, p_id: id });
  if (error) { toast(messageLisible(error), false); return; }
  toast('Élément restauré'); rendreCorbeille().catch(e => toast(messageLisible(e), false));
}
function effacerElement(table, id, nom) {
  confirmerParMot('Effacer définitivement', `« <b>${esc(nom)}</b> » et tout ce qui en dépend seront <b>effacés sans retour possible</b>.`,
    'EFFACER', 'Effacer définitivement', async () => {
      const { error } = await SB.rpc('effacer_definitivement', { p_table: table, p_id: id });
      if (error) { toast(messageLisible(error), false); return; }
      toast('Effacé définitivement'); rendreCorbeille().catch(e => toast(messageLisible(e), false));
    });
}
