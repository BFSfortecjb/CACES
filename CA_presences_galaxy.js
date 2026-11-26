/* =====================================================================
   CA_presences_galaxy.js — « Présences Galaxy — demi-journées suivies » (détail d'une session, LECTURE SEULE).
   © 2026 Jérémy Bizeul — Vigie-lance, pour BFS Prévention. Reprise à l'identique du bloc validé dans l'appli Habélec.
   Source : méthode Galaxy get_presence_stagiaire (une ligne par stagiaire et par jour), via l'Edge Function « caces-galaxy »
   (liste blanche de lectures, paramètres simples formation_id / page / nombre). Aucun envoi vers Galaxy.
   Règles : matin prévu si debut_matin ≠ 00:00:00 ; après-midi prévu si debut_aprem ≠ 00:00:00 ; suivi si present = 1, absent sinon.
   Total = somme des duree_plage des jours où le stagiaire est présent. Le champ « realise » n'est PAS utilisé (parfois incohérent).
   Rapprochement avec les stagiaires de la session par galaxy_stagiaire_id.
   ===================================================================== */

const pgHeure = h => /^\d{1,2}:\d{2}/.test(String(h || '')) && !/^0{1,2}:00/.test(String(h));   // « 00:00:00 » = créneau non prévu
const pgMinutes = d => { const m = String(d || '').match(/^(\d+):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; };
const pgDuree = min => { const h = Math.floor(min / 60), r = min % 60; return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`; };
const pgJourCourt = iso => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });

/** Toutes les lignes de présence d'une formation Galaxy (pagination de sécurité : 5 pages de 400 au plus). */
async function pgLignes(formationId) {
  let tout = [];
  for (let p = 1; p <= 5; p++) {
    const rep = await galaxy('get_presence_stagiaire', { formation_id: formationId }, p, 400);
    const l = rep.result || [];
    tout = tout.concat(l);
    if (l.length < 400) break;
  }
  return tout;
}

/** Repère d'une demi-journée : ✓ vert (suivie), ✗ rouge (prévue mais absent), – gris (non prévue). */
function pgRepere(lettre, prevue, suivie) {
  if (!prevue) return `<span class="pg-r pg-na" title="Demi-journée non prévue">${lettre} –</span>`;
  return suivie ? `<span class="pg-r pg-ok" title="Suivie">${lettre} ✓</span>` : `<span class="pg-r pg-ko" title="Prévue mais absent">${lettre} ✗</span>`;
}

function rendrePresencesGalaxy(zone, session) {
  if (!zone) return;
  const formationId = Number(String(session?.numero_session_galaxy || '').trim());
  if (!formationId) { zone.innerHTML = ''; return; }
  zone.innerHTML = `<details class="repliable pg-bloc"><summary>Présences Galaxy — demi-journées suivies</summary>
    <div id="pg-contenu" class="aide">chargement…</div></details>`;
  (async () => {
    const cible = $('#pg-contenu', zone);
    try {
      const [lignes, { data: stags }] = await Promise.all([pgLignes(formationId),
        sb.from('stagiaires').select('id, nom, prenom, galaxy_stagiaire_id').eq('session_id', session.id)]);
      if (!cible) return;
      if (!lignes.length) { cible.textContent = 'Aucune présence enregistrée dans Galaxy pour cette session.'; return; }
      const jours = [...new Set(lignes.map(l => String(l.date_formation || '').slice(0, 10)))].filter(Boolean).sort();
      const parGalaxy = new Map((stags || []).filter(s => s.galaxy_stagiaire_id).map(s => [String(s.galaxy_stagiaire_id), s]));
      const gens = new Map();                         // stagiaire_id Galaxy -> { nom, prenom, horsListe, jours: {iso: ligne} }
      lignes.forEach(l => {
        const id = String(l.stagiaire_id);
        if (!gens.has(id)) { const s = parGalaxy.get(id); gens.set(id, { nom: s ? s.nom : (l.nom || ''), prenom: s ? s.prenom : (l.prenom || ''), horsListe: !s, jours: {} }); }
        gens.get(id).jours[String(l.date_formation || '').slice(0, 10)] = l;
      });
      const liste = [...gens.values()].sort((a, b) => a.horsListe - b.horsListe || `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'));
      cible.className = '';
      cible.innerHTML = `<div class="tableau-defile"><table class="tableau pg-table"><thead><tr><th>Stagiaire</th>
        ${jours.map(j => `<th class="pg-c">${esc(pgJourCourt(j))}</th>`).join('')}<th class="pg-c">Total présent</th></tr></thead><tbody>
        ${liste.map(g => {
          let total = 0;
          const cases = jours.map(j => {
            const l = g.jours[j];
            if (!l) return '<td class="pg-c"><span class="pg-r pg-na">M –</span><span class="pg-r pg-na">A –</span></td>';
            const present = String(l.present) === '1';
            if (present) total += pgMinutes(l.duree_plage);
            return `<td class="pg-c">${pgRepere('M', pgHeure(l.debut_matin), present)}${pgRepere('A', pgHeure(l.debut_aprem), present)}</td>`;
          }).join('');
          return `<tr><td>${esc(`${g.nom} ${g.prenom}`.trim())}${g.horsListe ? ' <i class="aide">(pas dans la liste)</i>' : ''}</td>${cases}<td class="pg-c"><b>${total ? pgDuree(total) : '0 h'}</b></td></tr>`;
        }).join('')}</tbody></table></div>
        <p class="aide">Source : Galaxy (lecture seule). Total = durée prévue des jours où le stagiaire est présent.</p>`;
    } catch (e) {
      if (cible) cible.textContent = 'Présences Galaxy indisponibles pour le moment (' + String(e.message || e).slice(0, 120) + ').';
    }
  })();
}
