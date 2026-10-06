/* =====================================================================
   CA_verification.js — vérification d'un titre CACES.
   - Page publique #verification?n=<numéro> (cible du QR code du carton)
   - Onglet admin « Vérification » : saisie d'un numéro
   Tout passe par la fonction SQL anon caces_verifier_titre (aussi utilisable
   comme API par le site BFS : POST {SUPABASE_URL}/rest/v1/rpc/caces_verifier_titre,
   en-têtes apikey + Content-Profile: caces, corps {"p_numero":"..."}).
   ===================================================================== */
const urlVerification = numero => CONFIG.URL_VERIFICATION + '?n=' + encodeURIComponent(numero);

function numeroDuLien() {
  const m = location.hash.match(/[?&]n=([^&]+)/);
  return m ? decodeURIComponent(m[1]).trim() : '';
}

function htmlResultatVerification(r) {
  if (!r || !r.trouve) return `<div class="carte refus"><h2>Titre introuvable</h2>
    <p>Ce numéro ne correspond à aucun titre délivré par BFS.</p></div>`;
  const ok = r.statut === 'valide';
  return `<div class="carte ${ok ? 'succes' : 'alerte'}">
      <h2>${ok ? '✔ Titre valide' : '⚠ Titre expiré'}</h2>
      <p><b>${esc(r.nom)} ${esc(r.prenom)}</b><br>CACES® ${esc(r.referentiel)} — ${esc(r.referentiel_libelle)}</p></div>
    <table class="tableau"><thead><tr><th>N°</th><th>Catégorie</th><th>Options</th><th>Délivré le</th><th>Échéance</th><th>Statut</th></tr></thead><tbody>
    ${(r.titres || []).map(t => `<tr class="${t.numero === r.numero ? 'ligne-active' : ''}"><td>${esc(t.numero)}</td>
      <td>${esc(t.categorie)} — ${esc(t.categorie_libelle || '')}</td>
      <td>${esc((t.options || []).map(o => (LIBELLE_OPTION[o] || o)).join(', ') || '—')}</td>
      <td>${esc(dateFr(t.date_delivrance))}</td><td>${esc(dateFr(t.date_expiration))}</td>
      <td>${t.statut === 'valide' ? 'Valide' : 'Expiré'}</td></tr>`).join('')}</tbody></table>`;
}

async function verifierNumero(numero, cible) {
  cible.innerHTML = '<p>Vérification…</p>';
  try {
    const r = await rpc('caces_verifier_titre', { p_numero: numero });
    cible.innerHTML = htmlResultatVerification(r);
  } catch (e) { cible.innerHTML = `<div class="carte refus"><b>Erreur : ${esc(e.message)}</b></div>`; }
}

function formulaireVerification(cible, zoneRes, valeur = '') {
  cible.innerHTML = `<form class="carte" id="form-verif">
      <label>N° du CACES® <input name="n" value="${esc(valeur)}" placeholder="2026.07.R489.3.12345.00045" required></label>
      <button class="principal" type="submit">Vérifier</button></form>`;
  $('#form-verif', cible).addEventListener('submit', ev => {
    ev.preventDefault(); verifierNumero(ev.target.n.value, zoneRes);
  });
}

/** Page publique, sans compte. */
async function ecranVerificationPublique(cible) {
  cible.innerHTML = `<div class="stagiaire-accueil"><h1>${esc(CONFIG.NOM_APPLICATION)}</h1>
    <p class="sous-titre">Vérification d'un titre CACES®</p><div id="verif-form"></div><div id="verif-res"></div></div>`;
  const n = numeroDuLien();
  formulaireVerification($('#verif-form', cible), $('#verif-res', cible), n);
  if (n) verifierNumero(n, $('#verif-res', cible));
}

/** Onglet admin. */
function rendreVerification(zone) {
  zone.innerHTML = `<h2>Vérification d'un titre</h2>
    <p class="aide">Même service que le QR code des cartons. Adresse encodée dans le QR : <code>${esc(CONFIG.URL_VERIFICATION)}?n=…</code>
      (réglage <code>URL_VERIFICATION</code> dans CA_config.js, à passer sur le site BFS quand sa page sera prête).</p>
    <div id="verif-form"></div><div id="verif-res"></div>
    <details class="carte"><summary>API pour le site BFS</summary>
      <p>POST <code>${esc(CONFIG.SUPABASE_URL)}/rest/v1/rpc/caces_verifier_titre</code><br>
      En-têtes : <code>apikey: (clé publique)</code>, <code>Content-Profile: caces</code>, <code>Content-Type: application/json</code><br>
      Corps : <code>{"p_numero":"2026.07.R489.3.12345.00045"}</code></p></details>`;
  formulaireVerification($('#verif-form', zone), $('#verif-res', zone));
}
