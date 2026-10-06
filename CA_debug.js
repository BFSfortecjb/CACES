/* =====================================================================
   CA_debug.js — diagnostic

   Il n'y a pas de console accessible à l'utilisateur sur GitHub Pages
   (surtout sur tablette). Ce module garde une trace de ce qui se passe
   et permet d'afficher le journal à l'écran : Ctrl + Alt + D, ou
   CONFIG.DEBUG = true dans CA_config.js.
   ===================================================================== */

const DEBUG = {
  journal: [],
  actif: false,

  log(niveau, message, donnees) {
    const ligne = {
      t: new Date().toLocaleTimeString('fr-FR'),
      niveau,
      message,
      donnees: donnees === undefined ? null : donnees,
    };
    DEBUG.journal.push(ligne);
    if (DEBUG.journal.length > 300) DEBUG.journal.shift();
    if (niveau === 'erreur') console.error(message, donnees);
    else console.log(message, donnees ?? '');
    if (DEBUG.actif) DEBUG.rendre();
  },

  info(m, d) { DEBUG.log('info', m, d); },
  erreur(m, d) { DEBUG.log('erreur', m, d); },

  basculer() {
    DEBUG.actif = !DEBUG.actif;
    const p = document.getElementById('debug-panel');
    p.hidden = !DEBUG.actif;
    // Clé préfixée : la mémoire du navigateur est commune à toutes les applis BFS
    if (typeof MEM !== 'undefined') MEM.ecrire('debug', DEBUG.actif);
    if (DEBUG.actif) DEBUG.rendre();
  },

  rendre() {
    const p = document.getElementById('debug-panel');
    p.innerHTML =
      '<div class="debug-barre">Journal technique '
      + '<button onclick="DEBUG.copier()">Copier</button> '
      + '<button onclick="DEBUG.basculer()">Fermer</button></div>'
      + DEBUG.journal.slice().reverse().map(l =>
          `<div class="debug-ligne ${l.niveau}"><b>${l.t}</b> ${esc(l.message)}`
          + (l.donnees ? `<pre>${esc(JSON.stringify(l.donnees, null, 1))}</pre>` : '')
          + '</div>').join('');
  },

  copier() {
    const txt = DEBUG.journal.map(l =>
      `${l.t} [${l.niveau}] ${l.message} ${l.donnees ? JSON.stringify(l.donnees) : ''}`).join('\n');
    navigator.clipboard.writeText(txt).then(
      () => toast('Journal copié dans le presse-papiers'),
      () => toast('Copie impossible', 'erreur'));
  },
};

// Toute erreur non rattrapée finit dans le journal plutôt que dans le vide
window.addEventListener('error', e => DEBUG.erreur('Erreur JS : ' + e.message,
  { fichier: e.filename, ligne: e.lineno }));
window.addEventListener('unhandledrejection', e => DEBUG.erreur('Promesse rejetée',
  String(e.reason)));
window.addEventListener('keydown', e => {
  if (e.ctrlKey && e.altKey && (e.key === 'd' || e.key === 'D')) DEBUG.basculer();
});
