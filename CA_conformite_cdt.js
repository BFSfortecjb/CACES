/* =====================================================================
   CA_conformite_cdt.js — Lot 1 (26/11/2026) : conformité au référentiel de certification (RC 2020 V2)
   1. Onglet Statistiques « Conformité CDT » : taux de tests en CDT par famille sur l'année civile (§4.7, seuils du tableau T1),
      détail par CDT (Briec, Sèvremont) et hors CDT (chez le client), nombre de tests CDT qui manquent, rappel du 15 janvier.
   2. Onglet Statistiques « Bilan annuel » : chiffres à transmettre à l'organisme certificateur avant le 1er mars (§6.5.1), export Excel (CSV).
   3. Bandeau d'alerte sur l'écran Sessions (administrateur) quand une famille est sous le seuil.
   Source : vues v_taux_cdt / v_taux_cdt_detail et fonction bilan_annuel (patch bf). Un « test » = une épreuve pratique passée
   (un échec puis une réussite = 2 tests), hors essais, sur l'année civile du passage. BFS = un organisme, deux CDT (Briec, Sèvremont).
   ===================================================================== */
const SEUILS_CDT_T1 = { R482: 30, R483: 20, R484: 20, R485: 30, R486: 30, R487: 20, R489: 50, R490: 50 };
const CONF = { annee: new Date().getFullYear() };

/** Nombre de tests supplémentaires à faire en CDT (sans test hors CDT) pour atteindre le seuil : x ≥ (s·n − cdt) / (1 − s). */
function cdtManquants(nb, cdt, seuil) {
  if (!seuil || seuil >= 100 || !nb) return 0;
  return Math.max(0, Math.ceil((seuil / 100 * nb - cdt) / (1 - seuil / 100) - 1e-9));
}

function selecteurAnnee(id, valeur) {
  const a = new Date().getFullYear();
  return `<label>Année civile <select id="${id}">${Array.from({ length: 6 }, (_, i) => a - i).map(x => `<option ${x === valeur ? 'selected' : ''}>${x}</option>`).join('')}</select></label>`;
}

/* ---------- 1. Conformité CDT ---------- */
async function statConformiteCdt(z) {
  z.innerHTML = '<p class="chargement">Calcul des taux…</p>';
  const an = CONF.annee;
  const [g, d] = await Promise.all([
    sb.from('v_taux_cdt').select('*').eq('annee', an),
    sb.from('v_taux_cdt_detail').select('*').eq('annee', an).order('lieu'),
  ]);
  if (g.error || d.error) { z.innerHTML = ''; return erreurSupabase('Lecture des taux CDT', g.error || d.error); }
  const famillesApp = new Set((S.referentiel.referentiels || []).map(r => String(r.code).slice(0, 4)));
  const familles = [...new Set([...Object.keys(SEUILS_CDT_T1).filter(f => famillesApp.has(f)), ...(g.data || []).map(x => x.famille)])].sort();
  const par = f => (g.data || []).find(x => x.famille === f);
  const lignes = familles.map(f => {
    const x = par(f), nb = x?.nb_tests || 0, cdt = x?.nb_cdt || 0, seuil = x?.seuil ?? SEUILS_CDT_T1[f] ?? null;
    const taux = nb ? Math.round(1000 * cdt / nb) / 10 : null;
    const sous = nb > 0 && seuil != null && taux < seuil;
    return { f, nb, cdt, hors: nb - cdt, taux, seuil, sous, manque: sous ? cdtManquants(nb, cdt, seuil) : 0,
      detail: (d.data || []).filter(y => y.famille === f) };
  });
  const sous = lignes.filter(l => l.sous);
  z.innerHTML = `<div class="stat-barre-outils">${selecteurAnnee('conf-annee', an)}</div>
    ${sous.length ? `<div class="carte" style="border-left:4px solid #c0392b"><b>⚠ ${sous.length} famille(s) sous le seuil en ${an} : ${sous.map(l => esc(l.f)).join(', ')}</b>
      <p class="aide">Référentiel §4.7 : en cas de non-atteinte du taux sur l'année N, l'organisme informe son organisme certificateur <b>avant le 15 janvier ${an + 1}</b>
      et lui propose un plan d'action (atteindre le taux en 6 mois de plus, soit jusqu'au 30 juin ${an + 1}). Sans cela : non-conformité majeure, puis retrait de la famille du périmètre.
      Le taux se calcule par famille pour l'ensemble de l'organisme (tous les CDT réunis).</p></div>` : ''}
    <div class="carte"><h3>Tests réalisés en CDT par famille — année ${an}</h3>
    <div class="tableau-defile"><table class="tableau"><thead><tr><th title="Famille de recommandation (R482, R483, R484, R485, R486, R487, R489, R490). Le taux se calcule par famille.">Famille ⓘ</th>
<th title="Nombre total d'épreuves pratiques passées sur l'année civile (essais exclus). Un échec puis une réussite comptent pour 2 tests.">Tests ⓘ</th>
<th title="Tests passés dans un centre de déroulement de tests (CDT) : Briec ou Sèvremont. Le détail par centre est affiché en dessous.">En CDT ⓘ</th>
<th title="Tests passés hors CDT, c'est-à-dire chez le client (session intra).">Hors CDT ⓘ</th>
<th title="Tests en CDT ÷ total des tests, tous CDT confondus, sur l'année civile et par famille (référentiel §4.7).">Taux CDT ⓘ</th>
<th title="Taux minimum de tests en CDT exigé par le référentiel pour cette famille (tableau T1, §4.7).">Minimum (T1) ⓘ</th>
<th title="Conforme si le taux atteint le minimum. Sinon : informer l'organisme certificateur avant le 15 janvier de l'année suivante avec un plan d'action.">État ⓘ</th>
<th title="Nombre de tests supplémentaires à passer en CDT, sans tests hors CDT en plus, pour atteindre le minimum.">Tests CDT à ajouter pour atteindre le minimum ⓘ</th></tr></thead><tbody>
    ${lignes.map(l => `<tr><td><b>${esc(l.f)}</b></td><td>${l.nb}</td><td>${l.cdt}</td><td>${l.hors}</td><td>${l.taux == null ? '—' : l.taux + ' %'}</td><td>${l.seuil ?? '—'} %</td>
      <td>${l.nb === 0 ? '<span class="etat neutre">aucun test</span>' : l.sous ? '<span class="etat erreur">⚠ sous le minimum</span>' : '<span class="etat ok">✔ conforme</span>'}</td>
      <td>${l.sous ? '<b>' + l.manque + '</b>' : ''}</td></tr>
      ${l.detail.map(y => `<tr class="stat-sous-ligne"><td style="padding-left:1.6em;color:#666">${esc(y.lieu)}</td><td>${y.nb_tests}</td><td>${y.en_cdt ? y.nb_tests : ''}</td><td>${y.en_cdt ? '' : y.nb_tests}</td><td colspan="4"></td></tr>`).join('')}`).join('')
      || '<tr><td colspan="8" class="vide">Aucune famille.</td></tr>'}</tbody></table></div>
    <p class="aide">Un test = une épreuve pratique passée (un échec puis une réussite comptent 2 tests), hors essais. « En CDT » = session dans l'un des deux centres (Briec, Sèvremont) ;
      « Hors CDT » = chez le client (visite préalable obligatoire). Minimums du tableau T1 : R482, R485, R486 ≥ 30 % · R483, R484, R487 ≥ 20 % · R489, R490 ≥ 50 %.
      Le référentiel précise que le taux peut être révisé chaque année.</p></div>`;
  $('#conf-annee', z).onchange = ev => { CONF.annee = Number(ev.target.value); statConformiteCdt(z); };
}

/* ---------- 2. Bilan annuel pour l'organisme certificateur ---------- */
async function statBilanAnnuel(z) {
  z.innerHTML = '<p class="chargement">Calcul du bilan…</p>';
  const an = CONF.annee;
  const { data, error } = await sb.rpc('bilan_annuel', { p_annee: an });
  if (error) { z.innerHTML = ''; return erreurSupabase('Bilan annuel', error); }
  const { count: nbSessions } = await sb.from('sessions_formation').select('id', { count: 'exact', head: true })
    .neq('type_session', 'autorisation').gte('date_debut', `${an}-01-01`).lte('date_debut', `${an}-12-31`);
  const L = data || [];
  const somme = k => L.reduce((s, x) => s + (x[k] || 0), 0);
  const tot = { inscrits: somme('inscrits'), recus: somme('recus'), tests: somme('tests'), tests_cdt: somme('tests_cdt'), tests_hors_cdt: somme('tests_hors_cdt'), tests_reussis: somme('tests_reussis') };
  z.innerHTML = `<div class="stat-barre-outils">${selecteurAnnee('conf-annee', an)}<button id="bil-csv">⬇ Export Excel (CSV)</button></div>
    <div class="carte"><h3>Bilan annuel ${an} pour l'organisme certificateur</h3>
    <p class="aide">À transmettre <b>avant le 1er mars ${an + 1}</b> (référentiel §6.5.1) : candidats inscrits et reçus par catégorie, sessions organisées, tests réalisés en CDT et hors CDT par catégorie.
      Le chiffre d'affaires et les effectifs ne sont pas dans l'appli : à compléter hors appli. Sessions de l'année (hors autorisations de conduite) : <b>${nbSessions ?? '—'}</b>.</p>
    <div class="tableau-defile"><table class="tableau"><thead><tr><th title="Famille de recommandation.">Recommandation ⓘ</th>
<th title="Catégorie de la recommandation.">Catégorie ⓘ</th>
<th title="Candidats inscrits dans cette catégorie sur l'année.">Candidats inscrits ⓘ</th>
<th title="Candidats ayant obtenu le CACES® (théorie et pratique validées).">Candidats reçus ⓘ</th>
<th title="Épreuves pratiques passées (essais exclus).">Tests réalisés ⓘ</th>
<th title="Tests passés dans un CDT (Briec ou Sèvremont).">dont en CDT ⓘ</th>
<th title="Tests passés chez le client.">dont hors CDT ⓘ</th>
<th title="Tests dont le résultat est réussi.">Tests réussis ⓘ</th>
<th title="Nombre de sessions concernées.">Sessions ⓘ</th></tr></thead><tbody>
    ${L.map(x => `<tr><td>${esc(x.referentiel_code)}</td><td>${esc(x.categorie_code)}</td><td>${x.inscrits}</td><td>${x.recus}</td><td>${x.tests}</td><td>${x.tests_cdt}</td><td>${x.tests_hors_cdt}</td><td>${x.tests_reussis}</td><td>${x.sessions}</td></tr>`).join('')
      || '<tr><td colspan="9" class="vide">Aucune donnée pour cette année.</td></tr>'}
    ${L.length ? `<tr class="stat-total"><td colspan="2"><b>TOTAL</b></td><td><b>${tot.inscrits}</b></td><td><b>${tot.recus}</b></td><td><b>${tot.tests}</b></td><td><b>${tot.tests_cdt}</b></td><td><b>${tot.tests_hors_cdt}</b></td><td><b>${tot.tests_reussis}</b></td><td></td></tr>` : ''}
    </tbody></table></div>
    <p class="aide">« Candidats reçus » = catégories dont la théorie et la pratique sont validées. « Tests » = épreuves pratiques passées (un échec puis une réussite = 2 tests), hors essais, sur l'année civile du passage ;
      « inscrits » et « sessions » suivent la date de début de la session.</p></div>`;
  $('#conf-annee', z).onchange = ev => { CONF.annee = Number(ev.target.value); statBilanAnnuel(z); };
  $('#bil-csv', z).onclick = () => {
    const c = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const csv = '﻿' + [['RECOMMANDATION', 'CATEGORIE', 'CANDIDATS INSCRITS', 'CANDIDATS RECUS', 'TESTS REALISES', 'DONT EN CDT', 'DONT HORS CDT', 'TESTS REUSSIS', 'SESSIONS'].map(c).join(';'),
      ...L.map(x => [x.referentiel_code, x.categorie_code, x.inscrits, x.recus, x.tests, x.tests_cdt, x.tests_hors_cdt, x.tests_reussis, x.sessions].map(c).join(';')),
      ['TOTAL', '', tot.inscrits, tot.recus, tot.tests, tot.tests_cdt, tot.tests_hors_cdt, tot.tests_reussis, nbSessions ?? ''].map(c).join(';')].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `bilan_annuel_${an}.csv`; document.body.appendChild(a); a.click(); a.remove();
  };
}

/* ---------- 3. Bandeau d'alerte (écran Sessions, administrateur) ---------- */
async function rendreAlerteCdt(zone) {
  if (!zone || S.profil?.role !== 'admin') return;
  const an = new Date().getFullYear(), fin = new Date().getMonth() >= 8;   // à partir de septembre, même sur peu de tests
  const { data } = await sb.from('v_taux_cdt').select('*').eq('annee', an);
  const bas = (data || []).filter(x => x.seuil != null && Number(x.taux) < x.seuil && (x.nb_tests >= 10 || fin));
  if (!bas.length) { zone.innerHTML = ''; return; }
  zone.innerHTML = `<div class="carte" style="border-left:4px solid #c0392b"><b>⚠ Taux de tests en CDT sous le minimum en ${an}</b>
    <ul>${bas.map(x => `<li>${esc(x.famille)} : ${x.taux} % (minimum ${x.seuil} %) — ${cdtManquants(x.nb_tests, x.nb_cdt, x.seuil)} test(s) en CDT à ajouter</li>`).join('')}</ul>
    <p class="aide">Sinon, informer l'organisme certificateur avant le 15 janvier ${an + 1} avec un plan d'action. <button class="lien" onclick="STAT.onglet='cdt'; retour('statistiques')">Voir le détail</button></p></div>`;
}

/* ---------- Lot 2 : garde-fous du test pratique ---------- */
const MAIL_RECLAMATION = 'reclamation@bfs-prevention.fr';

/** Message si le type de lieu, le centre et l'indicateur « en CDT » de la session ne concordent pas ('' si cohérent). */
function incoherenceLieu(s) {
  if (!s) return '';
  const client = s.lieu_type === 'client';
  if (client && s.en_cdt !== false) return 'Incohérence : session chez le client mais comptée « en CDT ». Corrigez le lieu dans la fiche de la session.';
  if (!client && s.en_cdt === false) return 'Incohérence : session au centre mais comptée « hors CDT ». Corrigez le lieu dans la fiche de la session.';
  if (!client && !s.centre_examen_id) return 'Aucun centre d\'examen (CDT) choisi pour cette session : le taux de tests en CDT sera faussé.';
  return '';
}

/** Lien mailto de réclamation pré-rempli avec le n° de session. */
function lienReclamation(s) {
  const ref = (s && (s.numero_session_galaxy || s.nom)) || '';
  return `mailto:${MAIL_RECLAMATION}?subject=${encodeURIComponent('Réclamation — session ' + ref)}&body=${encodeURIComponent('Session : ' + ref + '\nNom du candidat :\nObjet de la réclamation :\n')}`;
}

/** Mention réclamation (lien + QR code) à afficher aux candidats. */
function mentionReclamation(s) {
  const id = 'qr-recl-' + Math.random().toString(36).slice(2, 7), lien = lienReclamation(s);
  setTimeout(() => { const z = document.getElementById(id); if (z) { try { new QRCode(z, { text: lien, width: 72, height: 72 }); } catch (_e) { /* QR facultatif */ } } }, 0);
  return `<div class="aide" style="display:flex;gap:10px;align-items:center;margin:6px 0"><div id="${id}"></div>
    <span>Une réclamation sur ce test ? Écrire à <a href="${esc(lien)}">${MAIL_RECLAMATION}</a> (n° de session pré-rempli) ou scanner le QR code.</span></div>`;
}

/* ---------- Maintien des compétences des testeurs (§4.4.3.2) : 15 jours de tests sur 3 ans, ≥ 1 jour par catégorie ---------- */
async function statMaintienTesteurs(z) {
  const debut = new Date(); debut.setFullYear(debut.getFullYear() - 3);
  const [{ data: eps, error }, { data: hab }] = await Promise.all([
    sb.from('epreuves_pratique').select('testeur_id, referentiel_code, categorie_code, date_passage').eq('mode_essai', false).gte('date_passage', debut.toISOString()).limit(20000),
    sb.from('formateur_habilitations').select('formateur_id, referentiel_code, categorie_code').eq('fonction', 'testeur'),
  ]);
  if (error) return erreurSupabase('Lecture des tests', error);
  const jour = e => (e.date_passage || '').slice(0, 10);
  const testeurs = (S.formateurs || []).filter(f => f.est_testeur !== false && !['secretariat', 'auditeur'].includes(f.role) && f.actif !== false);
  z.innerHTML = `<div class="carte"><p class="aide">Du ${dateFr(debut.toISOString().slice(0, 10))} à aujourd'hui (3 ans glissants), hors essais : au moins <b>15 jours</b> de tests au total et <b>1 jour par catégorie</b> d'habilitation (référentiel §4.4.3.2). Un jour = une date avec au moins un test.</p>
    <table class="tableau"><thead><tr><th>Testeur</th><th title="Jours distincts où le testeur a fait passer au moins un test, sur 3 ans glissants (objectif : 15).">Jours (3 ans) ⓘ</th><th title="Catégories d'habilitation du testeur pour lesquelles il n'a fait aucun test sur 3 ans (il en faut au moins un jour par catégorie).">Catégories sans jour de test ⓘ</th><th></th></tr></thead><tbody>
    ${testeurs.map(f => {
      const L = (eps || []).filter(e => e.testeur_id === f.id), n = new Set(L.map(jour)).size;
      const habs = (hab || []).filter(h => h.formateur_id === f.id).map(h => `${h.referentiel_code} ${h.categorie_code}`);
      const faites = new Set(L.map(e => `${e.referentiel_code} ${e.categorie_code}`));
      const manque = habs.filter(c => !faites.has(c));
      const ok = n >= 15 && !manque.length;
      return `<tr><td>${esc(statNomTesteur(f.id))}</td><td>${n} / 15</td><td>${manque.length ? esc(manque.join(', ')) : (habs.length ? '—' : '<span class="aide">habilitations non listées (toutes catégories)</span>')}</td>
        <td><b style="color:${ok ? '#1b7c3c' : '#b2181a'}">${ok ? 'Conforme' : 'À surveiller'}</b></td></tr>`; }).join('')}</tbody></table></div>`;
}
