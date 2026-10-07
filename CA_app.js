/* =====================================================================
   CA_app.js — coquille de l'espace formateur / testeur / admin
   (même ergonomie qu'Habelec : en-tête, onglets, écrans listés par onglet)

   Sommaire :
     1. Connexion
     2. Coquille (en-tête + onglets)
   Les écrans de chaque onglet sont définis dans des fichiers dédiés
   (CA_sessions.js, CA_banque.js, CA_pratique.js, CA_organisme.js, ...)
   et déclarés dans RENDU ci-dessous.
   ===================================================================== */

/* ====================== 1. Connexion ================================ */
function ecranConnexion(cible) {
  cible.innerHTML = `
    <div class="connexion">
      <h1>${esc(CONFIG.NOM_APPLICATION)}</h1>
      <p class="sous-titre">Évaluation et suivi — CACES®</p>
      ${S.accesRefuse ? `
      <div class="carte refus">
        <b>Accès refusé</b>
        <p>Ce compte est bien authentifié, mais il n'est pas autorisé dans
           BFS CACES. Chaque application BFS gère ses propres comptes :
           demande à l'administrateur de t'ajouter.</p>
      </div>` : ''}
      <form id="form-connexion" class="carte">
        <label>Adresse e-mail
          <input type="email" name="email" required autocomplete="username">
        </label>
        <label>Mot de passe
          <input type="password" name="mdp" required autocomplete="current-password">
        </label>
        <button class="principal" type="submit">Se connecter</button>
        <p class="aide">Les stagiaires n'ont pas de compte : ils utilisent le
           <a href="#stagiaire">lien de connexion stagiaire</a> et le code affiché en salle.</p>
      </form>
    </div>`;

  $('#form-connexion').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    try {
      await connexion(f.email.value.trim(), f.mdp.value);
      await chargerProfil();
      await chargerReferentiel();
      router();
    } catch (e) { erreurSupabase('Connexion', e); }
  });
}

/* ====================== 2. Coquille ================================= */
const ONGLETS = {
  sessions:     'Sessions',
  banque:       'Banque de questions',
  grilles:      'Grilles pratiques',
  fise:         'Catalogue FISE',
  categories:   'Catégories',
  testeurs:     'Testeurs & UT',
  verification: 'Vérification',
  organisme:    'Organisme',
  comptes:      'Comptes',
  motsdepasse:  'Mots de passe',
  moncompte:    'Mon compte',
};

// Onglets réservés à l'administrateur
const ONGLETS_ADMIN = new Set(['categories', 'testeurs', 'verification', 'organisme', 'comptes', 'fise']);
// Onglet ouvert au rôle Secrétariat en plus de l'administrateur
const ONGLETS_SECRETARIAT = new Set(['motsdepasse']);

function ongletsVisibles() {
  return Object.entries(ONGLETS).filter(([id]) => {
    if (ONGLETS_ADMIN.has(id)) return S.vision === 'admin';
    if (ONGLETS_SECRETARIAT.has(id)) return S.vision === 'admin' || S.profil?.role === 'secretariat';
    return true;
  });
}

/** Écran provisoire : sert tant que l'écran définitif n'est pas livré. */
function rendreAVenir(libelle) {
  return zone => {
    zone.innerHTML = `<div class="carte"><h2>${esc(libelle)}</h2>
      <p class="aide">Cet écran est en cours de construction.</p></div>`;
  };
}

// Chaque fichier d'écran peut surcharger son entrée en déclarant sa fonction ;
// on résout à l'affichage (typeof) pour que l'ordre de chargement n'importe pas.
const RENDU = {
  sessions:     z => (typeof rendreSessions === 'function' ? rendreSessions : rendreAVenir('Sessions'))(z),
  session:      z => (typeof rendreDetailSession === 'function' ? rendreDetailSession : rendreAVenir('Session'))(z),
  banque:       z => (typeof rendreBanque === 'function' ? rendreBanque : rendreAVenir('Banque de questions'))(z),
  grilles:      z => (typeof rendreGrilles === 'function' ? rendreGrilles : rendreAVenir('Grilles pratiques'))(z),
  fise:         z => (typeof rendreCatalogueFise === 'function' ? rendreCatalogueFise : rendreAVenir('Catalogue FISE'))(z),
  categories:   z => (typeof rendreCategories === 'function' ? rendreCategories : rendreAVenir('Catégories'))(z),
  testeurs:     z => (typeof rendreTesteurs === 'function' ? rendreTesteurs : rendreAVenir('Testeurs & UT'))(z),
  verification: z => (typeof rendreVerification === 'function' ? rendreVerification : rendreAVenir('Vérification'))(z),
  organisme:    z => (typeof rendreOrganisme === 'function' ? rendreOrganisme : rendreAVenir('Organisme'))(z),
  comptes:      z => (typeof rendreComptes === 'function' ? rendreComptes : rendreAVenir('Comptes'))(z),
  motsdepasse:  z => (typeof rendreMotsDePasse === 'function' ? rendreMotsDePasse : rendreAVenir('Mots de passe'))(z),
  moncompte:    z => (typeof rendreMonCompte === 'function' ? rendreMonCompte : rendreAVenir('Mon compte'))(z),
};

function ecranFormateur(cible) {
  cible.innerHTML = `
    <header class="entete">
      <div class="titre">${esc(CONFIG.NOM_APPLICATION)}
        ${S.organisme?.raison_sociale ? `<span class="badge">${esc(S.organisme.raison_sociale)}</span>` : ''}</div>
      <nav class="onglets">
        ${ongletsVisibles().map(([id, lib]) =>
          `<button data-onglet="${id}" class="${S.ecran === id ? 'actif' : ''}">${esc(lib)}</button>`).join('')}
      </nav>
      <div class="compte">
        <span>${esc(S.utilisateur.email)}</span>
        <button class="lien" onclick="deconnexion()" title="Se déconnecter">Déconnexion</button>
      </div>
    </header>
    <main id="contenu"></main>`;

  $$('.onglets button').forEach(b => b.addEventListener('click', () => {
    S.ecran = b.dataset.onglet; S.session = null; ecranFormateur(cible);
  }));

  (RENDU[S.ecran] || RENDU.sessions)($('#contenu'));
}

function retour(ecran) { S.ecran = ecran; ecranFormateur($('#ecran')); }

/* ------------------------- modale générique ------------------------ */
function ouvrirModale(titre, contenuHtml, opts = {}) {
  fermerModale();
  const d = document.createElement('div');
  d.className = 'modale-fond';
  d.id = 'modale';
  d.innerHTML = `<div class="modale${opts.large ? ' modale-large' : ''}">
    <div class="entete-modale"><h3>${esc(titre)}</h3>
      <button class="icone" onclick="fermerModale()" title="Fermer">✕</button></div>
    <div class="corps-modale">${contenuHtml}</div></div>`;
  if (!opts.verrou) d.addEventListener('click', e => { if (e.target === d) fermerModale(); });
  document.body.appendChild(d);
}
function fermerModale() { document.getElementById('modale')?.remove(); }
