/* =====================================================================
   CA_testeurs.js — onglet admin « Testeurs & UT »

   Unités de Test (UT) : 1 UT ≈ 1 heure. Les limites sont celles des
   recommandations CACES (annexe A3/3) et sont APPLIQUÉES PAR LA BASE, sans
   dérogation possible : un testeur ne peut pas dépasser 7 UT par journée
   (dont 6 UT de pratique + options) ; un stagiaire ne peut pas subir plus de
   7 UT par journée ; la théorie est limitée à 12 candidats par testeur.
   Cet écran permet à l'administrateur de régler ces valeurs et de suivre la
   charge de chaque testeur.
   ===================================================================== */

async function rendreTesteurs(zone) {
  zone.innerHTML = '<p class="chargement">Chargement…</p>';
  const { data: prm, error } = await sb.from('parametres_application').select('*').eq('id', 1).single();
  if (error) return erreurSupabase('Lecture des paramètres', error);
  const refs = S.referentiel.referentiels, cats = S.referentiel.categories;
  const aujourdhui = new Date().toISOString().slice(0, 10);

  zone.innerHTML = `
    <div class="barre-actions"><h2>Testeurs &amp; unités de test (UT)</h2></div>

    <div class="carte">
      <h3>Limites journalières</h3>
      <p class="aide">Appliquées par la base de données : toute épreuve qui ferait dépasser une limite est refusée,
        sans exception (y compris pour un administrateur).</p>
      <form id="form-quotas" class="formulaire"><div class="grille-2">
        <label>UT maximum par testeur et par jour <input type="number" step="0.1" min="0" name="quota_ut_jour" value="${esc(prm.quota_ut_jour)}"></label>
        <label>dont UT de pratique + options (max) <input type="number" step="0.1" min="0" name="quota_ut_pratique_jour" value="${esc(prm.quota_ut_pratique_jour)}"></label>
        <label>UT maximum par stagiaire et par jour <input type="number" step="0.1" min="0" name="quota_ut_stagiaire_jour" value="${esc(prm.quota_ut_stagiaire_jour)}"></label>
        <label>Candidats maximum par testeur (théorie) <input type="number" step="1" min="1" name="max_candidats_theorie" value="${esc(prm.max_candidats_theorie)}"></label>
      </div><button class="principal" type="submit">Enregistrer les limites</button></form>
    </div>

    <div class="carte">
      <h3>Valeur des UT par épreuve</h3>
      <p class="aide">Théorie : 1 UT collective par groupe de candidats. Pratique : par candidat et par catégorie.
        À modifier uniquement si une recommandation évolue.</p>
      <table class="tableau"><thead><tr><th>Recommandation</th><th>UT théorie</th><th>Catégories (UT pratique)</th></tr></thead>
      <tbody>${refs.map(r => `<tr>
        <td><b>${esc(r.code)}</b> ${esc(r.libelle)}</td>
        <td><input type="number" step="0.1" min="0" class="ut-ref" data-ref="${esc(r.code)}" value="${esc(r.ut_theorique)}" style="width:70px"></td>
        <td>${cats.filter(c => c.referentiel_code === r.code).map(c => `<label class="case">${esc(c.code)}
          <input type="number" step="0.1" min="0" class="ut-cat" data-ref="${esc(r.code)}" data-cat="${esc(c.code)}"
            value="${esc(c.ut_pratique)}" style="width:60px"></label>`).join(' ')}</td></tr>`).join('')}
      </tbody></table>
    </div>

    <div class="carte">
      <div class="barre-actions"><h3>Charge des testeurs</h3>
        <label>Jour <input type="date" id="jour-charge" value="${aujourdhui}"></label></div>
      <div id="charge-testeurs"></div>
    </div>`;

  $('#form-quotas').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    const { error: e } = await sb.from('parametres_application').update({
      quota_ut_jour: Number(f.quota_ut_jour.value), quota_ut_pratique_jour: Number(f.quota_ut_pratique_jour.value),
      quota_ut_stagiaire_jour: Number(f.quota_ut_stagiaire_jour.value),
      max_candidats_theorie: Number(f.max_candidats_theorie.value), updated_at: new Date().toISOString(),
      updated_by: S.profil.id,
    }).eq('id', 1);
    if (e) return erreurSupabase('Enregistrement des limites', e);
    toast('Limites enregistrées');
    afficherCharges(Number(f.quota_ut_jour.value), Number(f.quota_ut_pratique_jour.value));
  });
  $$('.ut-ref').forEach(i => i.addEventListener('change', async () => {
    const { error: e } = await sb.from('referentiels').update({ ut_theorique: Number(i.value) }).eq('code', i.dataset.ref);
    if (e) return erreurSupabase('Enregistrement UT théorie', e);
    const r = S.referentiel.referentiels.find(x => x.code === i.dataset.ref); if (r) r.ut_theorique = Number(i.value);
    toast('UT enregistrée');
  }));
  $$('.ut-cat').forEach(i => i.addEventListener('change', async () => {
    const { error: e } = await sb.from('categories_referentiel').update({ ut_pratique: Number(i.value) })
      .eq('referentiel_code', i.dataset.ref).eq('code', i.dataset.cat);
    if (e) return erreurSupabase('Enregistrement UT pratique', e);
    const c = S.referentiel.categories.find(x => x.referentiel_code === i.dataset.ref && x.code === i.dataset.cat);
    if (c) c.ut_pratique = Number(i.value);
    toast('UT enregistrée');
  }));
  $('#jour-charge').addEventListener('change', () => afficherCharges(prm.quota_ut_jour, prm.quota_ut_pratique_jour));
  afficherCharges(prm.quota_ut_jour, prm.quota_ut_pratique_jour);
  zone.insertAdjacentHTML('beforeend', '<div class="carte" id="zone-cdt"></div><div class="carte" id="zone-codes"></div>');
  afficherTauxCdt();
  afficherCodesTesteurs();
}

/** Charge réelle (épreuves déjà enregistrées) et prévue (sessions du jour) de chaque testeur. */
async function afficherCharges(quota, quotaPratique) {
  const zone = $('#charge-testeurs');
  if (!zone) return;
  const jour = $('#jour-charge').value;
  zone.innerHTML = '<p class="chargement">Calcul…</p>';
  const testeurs = (S.formateurs || []).filter(f => f.role !== 'secretariat');
  const lignes = [];
  for (const t of testeurs) {
    const [r, p] = await Promise.all([
      sb.rpc('caces_charge_testeur', { p_testeur: t.id, p_jour: jour }),
      sb.rpc('caces_charge_prevue', { p_testeur: t.id, p_jour: jour }),
    ]);
    const reel = (r.data && r.data[0]) || { ut_total: 0, ut_pratique: 0 };
    const prevu = (p.data && p.data[0]) || { ut_total: 0, ut_pratique: 0 };
    lignes.push({ t, reel: Number(reel.ut_total), reelPrat: Number(reel.ut_pratique), prevu: Number(prevu.ut_total), prevuPrat: Number(prevu.ut_pratique) });
  }
  const etat = (v, vp) => (v > quota || vp > quotaPratique) ? 'ko' : (v >= quota * 0.85 ? 'avertissement' : 'ok');
  zone.innerHTML = `<table class="tableau"><thead><tr><th>Testeur</th><th>Réalisé ce jour</th><th>Prévu (sessions du jour)</th><th>Limite</th></tr></thead>
    <tbody>${lignes.map(l => `<tr><td>${esc(((l.t.nom || '') + ' ' + (l.t.prenom || '')).trim() || l.t.email)}</td>
      <td><span class="etat ${etat(l.reel, l.reelPrat)}">${l.reel.toFixed(2)} UT</span> <span class="aide">dont ${l.reelPrat.toFixed(2)} pratique</span></td>
      <td><span class="etat ${etat(l.prevu, l.prevuPrat)}">${l.prevu.toFixed(2)} UT</span> <span class="aide">dont ${l.prevuPrat.toFixed(2)} pratique</span></td>
      <td>${quota} UT (${quotaPratique} pratique)</td></tr>`).join('')
      || '<tr><td colspan="4" class="vide">Aucun testeur.</td></tr>'}</tbody></table>
    <p class="aide">« Prévu » est une estimation à partir des sessions dont la date de début est ce jour ; seul le « réalisé » est contrôlé et bloquant.</p>`;
}

/** Bandeau de charge du testeur dans le détail d'une session (jours de test, ou jour de début à défaut). */
async function bandeauChargeTesteur(s) {
  if (!s.testeur_id) return '';
  const jt = typeof joursSession === 'function' ? (await joursSession(s.id)).test : [];
  const jours = jt.length ? jt : [s.date_debut].filter(Boolean);
  if (!jours.length) return '';
  const res = await Promise.all(jours.map(j => chargePrevueJour(s.testeur_id, j)));
  const depasse = res.some(c => c.depasse);
  return `<div class="carte ${depasse ? 'refus' : ''}"><b>Charge du testeur</b>
    <button class="lien" onclick="appelModule('ouvrirPlanning')">📅 Planning</button>
    ${jours.map((j, i) => `<div>${esc(dateFr(j))} — prévu ${res[i].tot.toFixed(2)} UT / ${res[i].quota}
      (dont ${res[i].prat.toFixed(2)} pratique / ${res[i].quotaPrat}) ; réalisé ${res[i].reel.toFixed(2)} UT
      ${res[i].depasse ? ' ⚠' : ''}</div>`).join('')}
    ${depasse ? '<b>Attention :</b> charge prévue au-delà de la limite un jour au moins — des épreuves seraient refusées ; répartis les candidats sur un autre jour de test (📅 Planning) ou un autre testeur.' : ''}</div>`;
}


/* ---- Taux de tests en conditions de travail (CDT) par famille et par année ---- */
async function afficherTauxCdt() {
  const z = $('#zone-cdt'); if (!z) return;
  const { data, error } = await sb.from('v_taux_cdt').select('*').order('annee', { ascending: false }).order('famille');
  if (error) { z.innerHTML = ''; return erreurSupabase('Lecture des taux CDT', error); }
  z.innerHTML = `<h3>Tests en conditions de travail (CDT)</h3>
    <p class="aide">Part des tests réalisés en CDT (case « Test en CDT » de la session) par famille et par année,
      comparée au minimum fixé par le référentiel de certification.</p>
    <table class="tableau"><thead><tr><th>Année</th><th>Famille</th><th>Tests</th><th>dont CDT</th><th>Taux</th><th>Minimum</th><th></th></tr></thead><tbody>
    ${(data || []).map(r => { const ok = r.seuil == null || Number(r.taux) >= r.seuil;
      return `<tr><td>${r.annee}</td><td>${esc(r.famille)}</td><td>${r.nb_tests}</td><td>${r.nb_cdt}</td>
      <td>${r.taux} %</td><td>${r.seuil ?? '—'} %</td>
      <td>${ok ? '<span class="etat ok">✔</span>' : '<span class="etat erreur">⚠ sous le minimum</span>'}</td></tr>`; }).join('')
      || '<tr><td colspan="7" class="vide">Aucun test enregistré.</td></tr>'}</tbody></table>`;
}

/* ---- Codes testeur (4 chiffres) : définir / réinitialiser / débloquer (admin) ---- */
async function afficherCodesTesteurs() {
  const z = $('#zone-codes'); if (!z) return;
  z.innerHTML = `<h3>Codes testeur (4 chiffres)</h3>
    <p class="aide">Chaque testeur saisit son code avant de démarrer les tests d'une session : il vaut engagement
      d'indépendance (testeur ≠ formateur). Verrouillé après 5 erreurs. Le code ne peut pas être relu, seulement redéfini.</p>
    <table class="tableau"><thead><tr><th>Personne</th><th></th></tr></thead><tbody>
    ${(S.formateurs || []).map(f => `<tr><td>${esc(f.prenom || '')} ${esc(f.nom || '')}</td><td>
      <button onclick="definirCodeTesteur('${f.id}')">Définir / réinitialiser</button>
      <button onclick="debloquerCodeTesteur('${f.id}')">Débloquer</button></td></tr>`).join('')}</tbody></table>`;
}
async function definirCodeTesteur(id) {
  const code = prompt('Nouveau code à 4 chiffres :');
  if (code === null) return;
  const { error } = await sb.rpc('caces_definir_code_testeur', { p_code: code.trim(), p_testeur: id || null });
  if (error) return erreurSupabase('Définition du code', error);
  toast('Code enregistré');
}
async function debloquerCodeTesteur(id) {
  const { error } = await sb.rpc('caces_debloquer_code_testeur', { p_testeur: id });
  if (error) return erreurSupabase('Déblocage', error);
  toast('Code débloqué');
}

/* ---- Attestation du testeur sur une session (saisie du code) ---- */
async function testeurAAtteste(sessionId) {
  const { data } = await sb.from('attestations_testeur').select('id').eq('session_id', sessionId).limit(1);
  return !!(data && data.length);
}
/** À appeler avant ouvrirTheorie / ouvrirPratique : résout true si le testeur est attesté. */
async function exigerCodeTesteur(sessionId) {
  if (await testeurAAtteste(sessionId)) return true;
  return new Promise(resolve => {
    ouvrirModale('Code testeur', `<form id="form-code-testeur" class="formulaire">
      <p>Saisis ton code à 4 chiffres pour démarrer les tests de cette session. Il atteste que tu n'as pas dispensé la formation à ces candidats.</p>
      <input name="code" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" autocomplete="off" required>
      <div class="pied-modale"><button type="button" onclick="fermerModale()">Annuler</button>
      <button class="principal" type="submit">Valider</button></div></form>`);
    $('#form-code-testeur').addEventListener('submit', async ev => {
      ev.preventDefault();
      const { data, error } = await sb.rpc('caces_attester_testeur', { p_session: sessionId, p_code: ev.target.code.value });
      if (error) { erreurSupabase('Code testeur', error); return; }
      if (!data) return toast('Code incorrect.', 'erreur');
      fermerModale(); toast('Code accepté'); resolve(true);
    });
  });
}

/* ---- Mon compte : code testeur personnel ---- */
function rendreMonCompte(zone) {
  zone.innerHTML = `<div class="barre-actions"><h2>Mon compte</h2></div>
    <div class="carte"><h3>Mon code testeur (4 chiffres)</h3>
      <p class="aide">Demandé avant de démarrer les tests d'une session dont tu es le testeur.</p>
      <button class="principal" onclick="definirCodeTesteur(null)">Définir / changer mon code</button></div>`;
}
