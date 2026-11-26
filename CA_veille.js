/* © Jérémy Bizeul / Vigie-lance — CACES® : veille des échéances des documents des testeurs et blocages associés.
   Règles (appliquées aussi en base, patch bt) : base prévention INRS échue → plus aucun test ; CACES®/justificatif d'une catégorie échu → plus d'évaluation de CETTE catégorie.
   Les administrateurs ne sont jamais bloqués. Rien n'est bloqué tant qu'aucune date n'est saisie. */
const LIB_DOC_VEILLE = { base_prevention: 'Base prévention INRS', caces: 'CACES®', justificatif: 'Justificatif' };
const SEUIL_VEILLE_JOURS = 60;

async function chargerVeille() {
  try {
    const [a, b] = await Promise.all([sb.rpc('veille_testeurs'), sb.rpc('testeurs_bloques')]);
    S.veille = a.data || []; S.blocages = b.data || [];
  } catch (e) { S.veille = []; S.blocages = []; }
}
const refNet4 = r => String(r || '').toUpperCase().replace(/[^R0-9]/g, '').slice(0, 4);
/** Texte du blocage qui touche ce testeur pour cette catégorie ('' si aucun). Un admin n'est jamais bloqué. */
function blocageTesteur(id, ref, cat) {
  const f = (S.formateurs || []).find(x => x.id === id);
  if (f?.role === 'admin') return '';
  const b = (S.blocages || []).find(x => x.testeur_id === id && (x.tout || (cat && x.categorie_code === cat && refNet4(x.referentiel_code) === refNet4(ref))));
  if (!b) return '';
  return b.tout ? `base prévention INRS échue le ${dateFr(b.echu_le)}` : `${b.referentiel_code || ''} ${b.categorie_code} : document échu le ${dateFr(b.echu_le)}`;
}
function libelleEcheance(d) {
  const cible = [d.referentiel_code, d.categorie_code].filter(Boolean).join(' ');
  return `${LIB_DOC_VEILLE[d.type] || d.type}${cible ? ' ' + cible : ''}`;
}
/** Bloc d'alerte : échéance la plus proche de chaque testeur + blocages en cours. */
function rendreAlerteVeille(zone) {
  if (!zone) return;
  const l = (S.veille || []).filter(d => d.jours <= SEUIL_VEILLE_JOURS);
  if (!l.length) { zone.innerHTML = ''; return; }
  const parPersonne = new Map();
  l.forEach(d => { const k = d.personne_id; (parPersonne.get(k) || parPersonne.set(k, []).get(k)).push(d); });
  const lignes = [...parPersonne.values()].sort((a, b) => a[0].jours - b[0].jours).map(docs => {
    const ech = docs.filter(d => d.jours < 0), proch = docs.filter(d => d.jours >= 0)[0];
    return `<li><b>${esc(docs[0].nom || '')}</b> — ${ech.length ? ech.map(d => `<span style="color:#b2181a"><b>${esc(libelleEcheance(d))} échu le ${dateFr(d.date_validite)}</b>${d.type === 'base_prevention' ? ' → ne peut plus tester' : d.categorie_code ? ' → ne peut plus évaluer cette catégorie' : ''}</span>`).join(' ; ') : ''}
      ${ech.length && proch ? ' ; ' : ''}${proch ? `${esc(libelleEcheance(proch))} : échéance le ${dateFr(proch.date_validite)} (dans ${proch.jours} j)` : ''}</li>`;
  }).join('');
  const rouge = l.some(d => d.jours < 0);
  zone.innerHTML = `<div class="carte" style="border-left:4px solid ${rouge ? '#b2181a' : '#e67e22'}"><b>⏳ Veille des échéances des testeurs</b><ul>${lignes}</ul>
    <p class="aide">Base prévention INRS échue : le testeur ne peut plus tester. CACES®/justificatif de catégorie échu : il ne peut plus évaluer cette catégorie. Les dates se gèrent dans « Mes documents ».</p></div>`;
}
