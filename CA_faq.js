/* =====================================================================
   CA_faq.js — FAQ CACES® officielle (Cnam / INRS), entièrement dématérialisée.
   Source : data/faq_caces.json (extrait du PDF « FAQ CACES® 2020 — Édition 7 »). Recherche par mot-clé instantanée
   (insensible aux accents et à la casse, tous les mots doivent être présents), filtres famille / type / nouveautés,
   errata et abréviations. Pour une nouvelle édition : remplacer data/faq_caces.json (et son annexe image) puis publier.
   ===================================================================== */
const FAQ = { donnees: null, q: '', famille: '', type: '', nouveaux: false, ouverts: new Set() };

const faqNorm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function faqCharger() {
  if (FAQ.donnees) return FAQ.donnees;
  const r = await fetch('data/faq_caces.json');
  if (!r.ok) throw new Error('FAQ introuvable (' + r.status + ')');
  const d = await r.json();
  d.questions.forEach(x => { x._n = faqNorm([x.code, x.familles.join(' '), x.titre, x.question, x.reponse].join(' ')); x._t = faqNorm(x.code + ' ' + x.titre); });
  return (FAQ.donnees = d);
}

/** Questions correspondant à la recherche et aux filtres, les plus pertinentes d'abord. */
function faqFiltrer() {
  const mots = faqNorm(FAQ.q).split(/[^a-z0-9.]+/).filter(Boolean);
  return FAQ.donnees.questions.filter(x =>
    (!FAQ.famille || x.familles.includes(FAQ.famille) || x.familles.includes('Toutes')) &&
    (!FAQ.type || x.type === FAQ.type) && (!FAQ.nouveaux || x.nouveau) && mots.every(m => x._n.includes(m)))
    .map(x => ({ x, score: mots.reduce((s, m) => s + (x._t.includes(m) ? 3 : 0), 0) }))
    .sort((a, b) => b.score - a.score || a.x.code.localeCompare(b.x.code)).map(o => o.x);
}

/** Échappe puis surligne les mots recherchés. */
function faqSurligner(texte, mots) {
  let h = esc(texte);
  mots.filter(m => m.length > 1).forEach(m => {
    const re = new RegExp('(' + m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    h = h.replace(re, '<mark>$1</mark>');
  });
  return h.replace(/\n/g, '<br>');
}

function faqCarte(x, mots, ouvert) {
  const brut = mots.length ? mots : [];
  return `<details class="faq-q" data-c="${esc(x.code)}" ${ouvert ? 'open' : ''}>
    <summary><span class="faq-code ${x.type === 'U' ? 'u' : 'c'}">${esc(x.code)}</span>
      <span class="faq-titre">${faqSurligner(x.titre, brut)}</span>
      <span class="faq-fam">${esc(x.familles.join(' · '))}</span>${x.nouveau ? '<span class="faq-nouveau">Nouveau / modifié</span>' : ''}</summary>
    <div class="faq-corps"><h4>Question</h4><p>${faqSurligner(x.question, brut)}</p>
      <h4>Réponse</h4><p>${faqSurligner(x.reponse, brut)}</p>
      ${x.code === 'C.039' ? '<p><a href="data/faq_annexe_c039.png" target="_blank" rel="noopener">Voir l\'annexe 1 de cette question (tableau de calendrier)</a></p>' : ''}
      <p class="aide">Page ${x.page} du PDF — ${x.type === 'U' ? 'FAQ Utilisateurs' : 'FAQ Certification'}</p></div></details>`;
}

async function rendreFaq(zone) {
  zone.innerHTML = '<p class="aide">Chargement de la FAQ…</p>';
  let d; try { d = await faqCharger(); } catch (e) { zone.innerHTML = `<div class="carte refus"><p>FAQ indisponible : ${esc(e.message)}</p></div>`; return; }
  const fams = ['R.482', 'R.483', 'R.484', 'R.485', 'R.486', 'R.487', 'R.489', 'R.490'];
  zone.innerHTML = `<div class="barre-actions"><h2>❓ FAQ CACES® officielle</h2></div>
    <p class="aide">FAQ CACES® 2020 — ${esc(d.edition)} (Cnam / INRS), publiée le ${dateFr(d.publie)}, applicable le ${dateFr(d.applicable)}.
      <a href="${esc(d.source)}" target="_blank" rel="noopener">Source officielle (INRS)</a> — En cas de doute, la version de référence est celle de l'INRS.</p>
    <div class="carte faq-recherche">
      <input type="search" id="faq-q" placeholder="Rechercher par mot-clé (ex. : chargeuse, testeur, VGP, C.039…)" value="${esc(FAQ.q)}" autocomplete="off">
      <div class="stat-onglets" id="faq-fams"><button data-f="" class="${FAQ.famille ? '' : 'actif'}">Toutes les familles</button>
        ${fams.map(f => `<button data-f="${f}" class="${FAQ.famille === f ? 'actif' : ''}">${f.replace('.', '')}</button>`).join('')}</div>
      <div class="faq-filtres"><label>Type <select id="faq-type"><option value="">Utilisateurs et certification</option>
        <option value="U" ${FAQ.type === 'U' ? 'selected' : ''}>Utilisateurs (employeurs, conducteurs)</option>
        <option value="C" ${FAQ.type === 'C' ? 'selected' : ''}>Certification (organismes testeurs)</option></select></label>
        <label class="case"><input type="checkbox" id="faq-new" ${FAQ.nouveaux ? 'checked' : ''}> Nouveautés de l'édition</label>
        <button class="lien" id="faq-raz">Effacer</button></div>
      <p class="aide" id="faq-nb"></p></div>
    <div id="faq-liste"></div>
    <details class="repliable"><summary>Errata des recommandations (${d.errata.length})</summary>
      ${d.errata.map(e => `<p><b>${esc(e.reco)}</b> — ${esc(e.texte)}</p>`).join('')}</details>
    <details class="repliable"><summary>Abréviations</summary>${d.abreviations.map(a => `<p><b>${esc(a.sigle)}</b> — ${esc(a.definition)}</p>`).join('')}</details>`;
  const maj = () => {
    const l = faqFiltrer(), mots = faqNorm(FAQ.q).split(/[^a-z0-9.]+/).filter(Boolean), ouvrir = mots.length > 0 && l.length <= 5;
    $('#faq-nb', zone).textContent = `${l.length} réponse(s) sur ${d.questions.length}` + (mots.length ? ` pour « ${FAQ.q.trim()} »` : '');
    $('#faq-liste', zone).innerHTML = l.map(x => faqCarte(x, mots, ouvrir || FAQ.ouverts.has(x.code))).join('') || '<div class="carte"><p class="aide">Aucune réponse : essaie un autre mot-clé ou retire un filtre.</p></div>';
  };
  maj();
  $('#faq-q', zone).addEventListener('input', e => { FAQ.q = e.target.value; maj(); });
  $('#faq-type', zone).addEventListener('change', e => { FAQ.type = e.target.value; maj(); });
  $('#faq-new', zone).addEventListener('change', e => { FAQ.nouveaux = e.target.checked; maj(); });
  $$('#faq-fams button', zone).forEach(b => b.addEventListener('click', () => { FAQ.famille = b.dataset.f; rendreFaq(zone); }));
  $('#faq-raz', zone).addEventListener('click', () => { Object.assign(FAQ, { q: '', famille: '', type: '', nouveaux: false }); rendreFaq(zone); });
  $('#faq-liste', zone).addEventListener('toggle', e => { const c = e.target.dataset?.c; if (c) { if (e.target.open) FAQ.ouverts.add(c); else FAQ.ouverts.delete(c); } }, true);
  $('#faq-q', zone).focus();
}
