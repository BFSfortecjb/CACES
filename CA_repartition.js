/* =====================================================================
 *  CA_repartition.js — vague 5
 *  #6 : échéances des testeurs (alerte à 6 mois ; l'admin voit tous les testeurs, un testeur voit la sienne ;
 *       un testeur échu est bloqué côté base : ni affectation, ni évaluation).
 *  #8 : répartition des stagiaires d'une session (ou d'un groupe) entre 2 testeurs (ou plus),
 *       automatique (équilibrée, formateur ≠ testeur) ou manuelle.
 * ===================================================================== */
const MAX_THEORIE_PAR_TESTEUR = 12;

/* ------------------------------ #6 échéances ------------------------------ */
function etatEcheanceTesteur(f) {
  if (!f.date_echeance_testeur) return null;
  const fin = new Date(f.date_echeance_testeur + 'T12:00:00'), auj = new Date(); auj.setHours(12, 0, 0, 0);
  const jours = Math.round((fin - auj) / 86400000);
  const nom = ((f.nom || '') + ' ' + (f.prenom || '')).trim() || f.email;
  if (jours < 0) return { niveau: 'echu', jours, texte: `${nom} : validité testeur ÉCHUE depuis le ${dateFr(f.date_echeance_testeur)}` };
  if (jours <= 183) return { niveau: 'bientot', jours, texte: `${nom} : validité testeur jusqu'au ${dateFr(f.date_echeance_testeur)} (${jours} j)` };
  return { niveau: 'ok', jours, texte: '' };
}
function alertesEcheancesTesteurs() {
  const admin = S.profil?.role === 'admin';
  const liste = (S.formateurs || []).filter(f => f.est_testeur !== false && f.role !== 'secretariat' && (admin || f.id === S.profil?.id));
  return liste.map(etatEcheanceTesteur).filter(e => e && e.niveau !== 'ok').sort((a, b) => a.jours - b.jours);
}
function rendreAlerteTesteurs(zone) {
  if (!zone) return;
  const a = alertesEcheancesTesteurs();
  zone.innerHTML = a.length ? `<div class="carte" style="border-left:4px solid ${a.some(x => x.niveau === 'echu') ? '#c0392b' : '#e67e22'}">
    <b>⚠ Échéances testeurs</b><ul>${a.map(x => `<li>${esc(x.texte)}</li>`).join('')}</ul>
    <p class="aide">Un testeur échu ne peut plus être affecté à une session ni évaluer.</p></div>` : '';
}

/* ------------------------------ #8 répartition ------------------------------ */
async function ouvrirRepartitionTesteurs() {
  const s = S.session;
  const [{ data: stags, error }, { data: sts }, { data: grs }] = await Promise.all([
    sb.from('stagiaires').select('id, nom, prenom, groupe_id, testeur_id, ordre').eq('session_id', s.id).order('ordre').order('nom'),
    sb.from('session_testeurs').select('testeur_id').eq('session_id', s.id),
    sb.from('session_groupes').select('id, numero, formateur_id').eq('session_id', s.id),
  ]);
  if (error) return erreurSupabase('Lecture des stagiaires', error);
  const ids = [...new Set([s.testeur_id, ...(sts || []).map(x => x.testeur_id)].filter(Boolean))];
  const nomF = id => { const f = (S.formateurs || []).find(x => x.id === id); return f ? ((f.nom || '') + ' ' + (f.prenom || '')).trim() || f.email : '—'; };
  if (!ids.length) return toast('Aucun testeur sur cette session : ajoutez-en dans la fiche de la session.');
  const formateurDe = st => (grs || []).find(g => g.id === st.groupe_id)?.formateur_id || s.formateur_id;
  const peut = (t, st) => t !== formateurDe(st) || s.type_session === 'autorisation' || (S.formateurs || []).find(f => f.id === t)?.cumul_formateur_testeur;
  const aff = Object.fromEntries((stags || []).map(x => [x.id, x.testeur_id && ids.includes(x.testeur_id) ? x.testeur_id : '']));
  const numGroupe = st => (grs || []).find(g => g.id === st.groupe_id)?.numero;

  const dessiner = () => {
    const nb = Object.fromEntries(ids.map(t => [t, 0])); Object.values(aff).forEach(t => { if (t) nb[t]++; });
    $('#rep-corps').innerHTML = (stags || []).map(st => `<tr><td>${esc(st.nom)} ${esc(st.prenom || '')}</td>
      <td>${numGroupe(st) ? 'Groupe ' + numGroupe(st) : '—'}</td>
      <td><select data-st="${st.id}"><option value="">(par défaut)</option>${ids.map(t => `<option value="${t}" ${aff[st.id] === t ? 'selected' : ''} ${peut(t, st) ? '' : 'disabled'}>${esc(nomF(t))}</option>`).join('')}</select></td></tr>`).join('');
    $('#rep-compte').innerHTML = ids.map(t => `<span class="prat-badge" style="${nb[t] > MAX_THEORIE_PAR_TESTEUR ? 'background:#c0392b;color:#fff' : ''}">${esc(nomF(t))} : ${nb[t]}</span>`).join(' ')
      + (ids.some(t => nb[t] > MAX_THEORIE_PAR_TESTEUR) ? `<p class="erreur">Plus de ${MAX_THEORIE_PAR_TESTEUR} candidats pour un testeur (limite théorie).</p>` : '');
    $$('#rep-corps select').forEach(sel => sel.onchange = () => { aff[sel.dataset.st] = sel.value; dessiner(); });
  };
  ouvrirModale('👥 Répartition des stagiaires entre testeurs', `
    <p class="aide">« Par défaut » = le premier testeur autorisé de la session. Le formateur d'un stagiaire ne peut pas être son testeur (sauf cumul autorisé).</p>
    <div id="rep-compte"></div>
    <table class="tableau"><thead><tr><th>Stagiaire</th><th>Groupe</th><th>Testeur</th></tr></thead><tbody id="rep-corps"></tbody></table>
    <div class="barre-actions"><button id="rep-auto">⚖ Répartition automatique</button><button id="rep-raz">Tout par défaut</button><button class="principal" id="rep-ok">Enregistrer</button></div>`, { large: true });
  dessiner();
  $('#rep-auto').onclick = () => {
    const nb = Object.fromEntries(ids.map(t => [t, 0]));
    (stags || []).forEach(st => {
      const ok = ids.filter(t => peut(t, st)).sort((a, b) => nb[a] - nb[b]);
      if (ok.length) { aff[st.id] = ok[0]; nb[ok[0]]++; } else aff[st.id] = '';
    });
    dessiner();
  };
  $('#rep-raz').onclick = () => { Object.keys(aff).forEach(k => aff[k] = ''); dessiner(); };
  $('#rep-ok').onclick = async () => {
    for (const st of stags || []) {
      const v = aff[st.id] || null;
      if (v === (st.testeur_id || null)) continue;
      const { error: e } = await sb.from('stagiaires').update({ testeur_id: v }).eq('id', st.id);
      if (e) return erreurSupabase('Enregistrement de la répartition', e);
    }
    fermerModale(); toast('Répartition enregistrée');
  };
}
