/* © 2026 BFS HSE — Jérémy Bizeul / Vigie-lance. Tous droits réservés. */
'use strict';
// Écrans : connexion, navigation par onglets, démarrage.
function onglets() {
  return [['echeances', 'Échéances'], ['vehicules', 'Véhicules'], ['epi', peutEcrire() ? 'EPI' : 'Mes EPI'], ['plateau', 'Plateau technique'], ['competences', peutEcrire() ? 'Compétences' : 'Mes compétences']].concat(peutEcrire() ? [['corbeille', 'Corbeille']] : []);
}
const RENDUS = { echeances: rendreEcheances, vehicules: rendreVehicules, epi: rendreEpi, plateau: rendrePlateau, competences: rendreCompetences, corbeille: rendreCorbeille };

function ecranConnexion(msg) {
  $('#app').innerHTML = `
    <div class="login"><img src="icons/HS_icon-192.png" alt="" width="72" height="72">
      <h1>BFS HSE</h1><p class="sous">Hygiène, sécurité, environnement</p>
      ${msg ? `<p class="erreur">${esc(msg)}</p>` : ''}
      <form onsubmit="seConnecter(event)">
        <label>Adresse e-mail<input type="email" name="email" autocomplete="username" required></label>
        <label>Mot de passe<input type="password" name="mdp" autocomplete="current-password" required></label>
        <button class="btn plein">Se connecter</button>
      </form></div>`;
}
async function seConnecter(ev) {
  ev.preventDefault();
  const f = ev.target.elements;
  const { error } = await SB.auth.signInWithPassword({ email: f.email.value.trim(), password: f.mdp.value });
  if (error) { ecranConnexion('Identifiants incorrects.'); return; }
  demarrer();
}
async function seDeconnecter() { await SB.auth.signOut(); S.user = null; S.role = null; ecranConnexion(); }

function coquille() {
  const libRole = { admin: 'Administrateur', saisie: 'Saisie', utilisateur: 'Utilisateur' }[S.role] || '';
  $('#app').innerHTML = `
    <header class="entete"><div class="marque"><img src="icons/HS_icon-192.png" alt="" width="32" height="32"><b>BFS HSE</b></div>
      <div class="compte"><span>${esc(S.user.email)} · ${libRole}</span>
      <button class="btn sec petit" onclick="seDeconnecter()">Déconnexion</button></div></header>
    <nav class="onglets">${onglets().map(([id, l]) =>
      `<button class="${id === S.onglet ? 'actif' : ''}" onclick="allerA('${id}')">${l}</button>`).join('')}</nav>
    <main id="contenu"></main>
    <footer class="site-copyright">Outil mis à disposition par BFS — © 2026 — Tous droits réservés. Copie, reproduction ou réutilisation interdites sans autorisation.</footer>`;
}
function allerA(id) { S.onglet = id; coquille(); rafraichir(); }
function rafraichir() {
  (RENDUS[S.onglet] || rendreEcheances)().catch(e => { $('#contenu').innerHTML = `<p class="erreur">${esc(messageLisible(e))}</p>`; });
}
async function demarrer() {
  const { data } = await SB.auth.getSession();
  if (!data.session) { ecranConnexion(); return; }
  S.user = data.session.user;
  try { await chargerRole(); } catch (e) { ecranConnexion(messageLisible(e)); return; }
  if (!S.role) {
    $('#app').innerHTML = `<div class="login"><h1>Accès non autorisé</h1>
      <p class="sous">Votre compte n'a pas de profil BFS HSE. Contactez le responsable HSE.</p>
      <button class="btn plein" onclick="seDeconnecter()">Déconnexion</button></div>`;
    return;
  }
  await chargerProfils();
  try { const n = await SB.rpc('nom_agent', { p: S.user.id }); S.nomMoi = n.data || S.user.email; } catch (e) { S.nomMoi = S.user.email; }
  coquille(); rafraichir();
}
document.addEventListener('DOMContentLoaded', () => {
  demarrer();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('HS_service-worker.js').catch(e => dbg('sw', e.message));
  console.log('%c© 2026 Jérémy Bizeul, pour BFS.', 'color:#f3ab12; font-weight:bold; font-size:12px;');
  console.log('BFS HSE — outil original. Toute reproduction ou réutilisation de ce code sans autorisation écrite est interdite.');
});
