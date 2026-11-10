/* =====================================================================
 *  CA_tablette.js — Évaluation pratique sur tablette (chantier 16)
 *  - Côté formateur : bouton « 📱 Évaluer sur tablette » → QR code (jeton secret 12 h).
 *  - Côté tablette  : lien #tablette/<jeton> → saisie du code testeur (4 chiffres)
 *    → Edge Function caces-acces-tablette → ouverture de la session du testeur
 *    → ouverture directe de la session. Déconnexion automatique après 12 h.
 * ===================================================================== */
const TABLETTE_FIN = 'caces_tablette_fin';

function lienTablette(jeton) { return location.origin + location.pathname + '#tablette/' + jeton; }

/* ---------------------------- côté formateur ---------------------------- */
async function ouvrirAccesTablette() {
  const s = S.session;
  const { data, error } = await sb.rpc('caces_creer_acces_tablette', { p_session: s.id });
  if (error) return erreurSupabase('Création de l\'accès tablette', error);
  const r = Array.isArray(data) ? data[0] : data;
  const lien = lienTablette(r.jeton);
  const fin = new Date(r.expire_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  ouvrirModale('📱 Évaluer sur tablette', `
    <p>Scannez ce QR code avec la tablette, puis saisissez votre <strong>code testeur</strong> (4 chiffres).</p>
    <div id="qr-tablette" style="display:flex;justify-content:center;margin:12px 0"></div>
    <p class="aide">Valable jusqu'au ${esc(fin)}. Ne partagez pas ce QR code : il ouvre l'évaluation de cette session. Un nouveau QR code remplace le précédent.</p>
    <div class="barre-actions"><button id="tab-revoquer">Révoquer l'accès</button></div>`, {});
  try { new QRCode($('#qr-tablette'), { text: lien, width: 240, height: 240 }); }
  catch (_e) { $('#qr-tablette').innerHTML = `<code style="word-break:break-all">${esc(lien)}</code>`; }
  $('#tab-revoquer').onclick = async () => {
    const { error: e } = await sb.rpc('caces_revoquer_acces_tablette', { p_session: s.id });
    if (e) return erreurSupabase('Révocation', e);
    fermerModale(); toast('Accès tablette révoqué');
  };
}

/* ------------------------------ côté tablette ------------------------------ */
function ecranTablette(cible) {
  const jeton = (location.hash.split('/')[1] || '').split('?')[0].trim();
  cible.innerHTML = `
    <div class="carte" style="max-width:420px;margin:40px auto;text-align:center">
      ${logoImg()}
      <h2>Évaluation pratique</h2>
      <p>Saisissez votre code testeur (4 chiffres).</p>
      <input id="tab-code" type="password" inputmode="numeric" maxlength="4" autocomplete="off"
             style="font-size:2rem;text-align:center;letter-spacing:.5em;width:8em">
      <p id="tab-err" class="erreur" role="alert"></p>
      <button id="tab-ok" class="principal">Valider</button>
    </div>`;
  const champ = $('#tab-code'); champ.focus();
  const valider = async () => {
    const code = champ.value.trim();
    if (!/^\d{4}$/.test(code)) { $('#tab-err').textContent = 'Le code comporte 4 chiffres.'; return; }
    $('#tab-ok').disabled = true; $('#tab-err').textContent = '';
    try {
      const { data, error } = await sb.functions.invoke('caces-acces-tablette', { body: { jeton, code } });
      let rep = data;
      if (error && error.context && typeof error.context.json === 'function') { try { rep = await error.context.json(); } catch (_e) { /* ignoré */ } }
      if (!rep?.ok) { $('#tab-err').textContent = rep?.error || 'Accès refusé.'; $('#tab-ok').disabled = false; champ.value = ''; return; }
      const { error: e2 } = await sb.auth.verifyOtp({ token_hash: rep.token_hash, type: 'magiclink' });
      if (e2) { $('#tab-err').textContent = 'Ouverture de session impossible.'; $('#tab-ok').disabled = false; return; }
      try { localStorage.setItem(TABLETTE_FIN, String(Date.now() + 12 * 3600 * 1000)); } catch (_e) { /* ignoré */ }
      location.hash = '';
      const etat = await chargerProfil();
      if (etat === 'ok') await chargerReferentiel();
      await ouvrirSession(rep.session_id);
      surveillerFinTablette();
    } catch (e) { $('#tab-err').textContent = 'Erreur de connexion.'; $('#tab-ok').disabled = false; }
  };
  $('#tab-ok').onclick = valider;
  champ.addEventListener('keydown', ev => { if (ev.key === 'Enter') valider(); });
}

/** Déconnexion automatique de la tablette à l'échéance (12 h). */
function surveillerFinTablette() {
  let fin = 0; try { fin = Number(localStorage.getItem(TABLETTE_FIN) || 0); } catch (_e) { /* ignoré */ }
  if (!fin) return;
  const verifier = async () => {
    if (Date.now() >= fin) {
      try { localStorage.removeItem(TABLETTE_FIN); } catch (_e) { /* ignoré */ }
      await deconnexion(); toast('Session tablette terminée');
    } else setTimeout(verifier, 60000);
  };
  verifier();
}
