// © 2026 Admin Formation — Jérémy Bizeul — SARL Prévisecours. Tous droits réservés.
// operations.js — Opérations : UNE convention pour un client, découpée en plusieurs créneaux
// (ex. manipulation d'extincteur en réalité virtuelle : ~50 salariés, créneaux de 30 min, 3 stagiaires).
// Chaque créneau est une vraie session (sessions_formation.operation_id) : convocation, émargement,
// attestation, évaluation... fonctionnent tels quels. La convention et le planning sont au niveau de l'opération.
// Les « modèles d'opération » (table modeles_operation) mémorisent les réglages pour les réutiliser.

// ---------------------------------------------------------------------------
// Logique pure (testée hors navigateur)
// ---------------------------------------------------------------------------
function opMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}
function opHhmm(min) {
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}
function opHeureFr(hhmm) { return (hhmm || '').replace(':', 'h'); }

// Liste des jours (AAAA-MM-JJ) entre deux dates incluses (plafonné à 10 jours).
function opJours(debut, fin) {
  const out = [];
  if (!debut) return out;
  const d = new Date(debut + 'T00:00:00Z');
  const f = new Date((fin || debut) + 'T00:00:00Z');
  for (; d <= f && out.length < 10; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

// Pauses d'une opération : liste [{nom, duree_min, debut, fin}] (plage où la pause doit tomber).
// Repli sur la pause « souple » unique (patch c) ; sinon aucune.
function opPausesDe(p) {
  if (Array.isArray(p.pauses) && p.pauses.length) {
    return p.pauses.map(x => ({ nom: x.nom || 'Pause', duree_min: +x.duree_min || 0, debut: x.debut, fin: x.fin }))
      .filter(x => x.duree_min > 0 && opMin(x.debut) != null).sort((a, b) => opMin(a.debut) - opMin(b.debut));
  }
  if ((+p.pause_duree_min || 0) > 0 && opMin(p.pause_fenetre_debut) != null) {
    return [{ nom: 'Pause déjeuner', duree_min: +p.pause_duree_min, debut: p.pause_fenetre_debut, fin: p.pause_fenetre_fin }];
  }
  return [];
}

// Plan d'une opération : créneaux ET pauses. Chaque jour, de heure_debut à heure_fin, par pas de
// (creneau_duree_min + inter_creneau_min).
// Chaque pause n'a pas d'heure fixe : on règle sa durée et la plage où elle doit tomber ; elle est posée au plus tôt
// dans la plage, juste après la fin d'un créneau, donc sans temps perdu, et les créneaux se calent autour.
// Pause à heure fixe (anciennes opérations) : pause_debut / pause_fin, aucun créneau ne la chevauche.
function opPlan(p) {
  const duree = +p.creneau_duree_min || 30;
  const inter = Math.max(0, +p.inter_creneau_min || 0);      // temps de changement de groupe entre deux créneaux
  const deb = opMin(p.heure_debut), fin = opMin(p.heure_fin);
  const creneaux = [], pauses = [];
  if (deb == null || fin == null || fin <= deb) return { creneaux, pauses };
  const souples = opPausesDe(p);
  const pd = opMin(p.pause_debut), pf = opMin(p.pause_fin);
  const fixe = !souples.length && pd != null && pf != null && pf > pd;
  opJours(p.date_debut, p.date_fin).forEach(jour => {
    let t = deb, finPrec = null;
    const aPlacer = souples.slice();
    while (creneaux.length < 400) {
      const pa = aPlacer[0];
      if (pa) {
        const wd = opMin(pa.debut), wf = opMin(pa.fin);
        // on pose la pause dès que la plage est atteinte (ou si le créneau suivant ferait sortir de la plage)
        if (t >= wd || (wf != null && t + duree > wf)) {
          const ps = finPrec != null ? finPrec : t;           // la pause commence dès la fin du dernier créneau
          aPlacer.shift();
          if (ps + pa.duree_min >= fin) break;                // plus de place après la pause
          pauses.push({ date: jour, nom: pa.nom, debut: opHhmm(ps), fin: opHhmm(ps + pa.duree_min) });
          t = ps + pa.duree_min; finPrec = null; continue;
        }
      }
      if (t + duree > fin) break;
      if (fixe && t < pf && t + duree > pd) { t = Math.max(t, pf); continue; }
      creneaux.push({ date: jour, debut: opHhmm(t), fin: opHhmm(t + duree) });
      finPrec = t + duree; t += duree + inter;
    }
  });
  return { creneaux, pauses };
}
function opCreneaux(p) { return opPlan(p).creneaux; }

// Normalisation pour comparer des noms (sans accents, majuscules, espaces simples).
function opNorm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

// Lecture d'une heure saisie par les RH : « 9h30 », « 09:30 », « 9:30:00 », « 9h », fraction Excel (0.3958).
function opLireHeure(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    if (v >= 0 && v < 1) { const m = Math.round(v * 1440); return opHhmm(m % 1440); }
    return null;
  }
  const m = /^\s*(\d{1,2})\s*(?:[hH:]\s*(\d{1,2})?)?(?:\s*[:]\s*\d{1,2})?\s*$/.exec(String(v));
  if (!m) return null;
  const h = +m[1], mi = m[2] ? +m[2] : 0;
  if (h > 23 || mi > 59) return null;
  return opHhmm(h * 60 + mi);
}

// Lecture d'une date : « 12/11/2026 », « 12/11/26 », « 2026-11-12 », numéro de série Excel, objet Date.
function opLireDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
    return null;
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const an = m[3].length === 2 ? 2000 + (+m[3]) : +m[3];
    const j = +m[1], mo = +m[2];
    if (mo < 1 || mo > 12 || j < 1 || j > 31) return null;
    return `${an}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
  }
  return null;
}

// Transforme le tableau brut (lignes de cellules) en passages : [Nom, Prénom, Date, Heure].
// Si l'opération tient sur un seul jour, la date peut être absente (colonne vide ou 3 colonnes : Nom, Prénom, Heure).
function opParserListe(lignes, op) {
  const jours = opJours(op.date_debut, op.date_fin);
  const res = [];
  (lignes || []).forEach((l, i) => {
    const c = (l || []).map(x => (typeof x === 'string' ? x.trim() : x));
    if (!c.some(x => x !== '' && x != null)) return;
    if (i === 0 && /^nom/i.test(String(c[0] || ''))) return;       // ligne d'en-tête
    const nom = String(c[0] ?? '').trim(), prenom = String(c[1] ?? '').trim();
    let date = null, heure = null;
    // Cherche la date et l'heure dans les colonnes restantes, quel que soit leur ordre.
    c.slice(2).forEach(x => {
      if (x === '' || x == null) return;
      const d = opLireDate(x);
      if (d && !date) { date = d; return; }
      const h = opLireHeure(x);
      if (h && !heure) heure = h;
    });
    if (!date && jours.length === 1) date = jours[0];
    const erreurs = [];
    if (!nom || !prenom) erreurs.push('nom ou prénom manquant');
    if (!date) erreurs.push('date manquante ou illisible');
    else if (jours.length && !jours.includes(date)) erreurs.push('date hors de l\'opération');
    if (!heure) erreurs.push('heure manquante ou illisible');
    res.push({ ligne: i + 1, nom, prenom, date, heure, erreurs });
  });
  return res;
}

// Créneau correspondant à (date, heure) : début exact, sinon créneau qui contient l'heure.
function opTrouverCreneau(creneaux, date, heure) {
  const t = opMin(heure);
  return creneaux.find(c => c.date === date && c.debut === heure)
      || creneaux.find(c => c.date === date && opMin(c.debut) <= t && t < opMin(c.fin))
      || null;
}

// Répartition du prix global entre les créneaux : au prorata des inscrits (le dernier créneau rempli absorbe
// l'arrondi pour que le total fasse exactement le prix de la convention). Sans liste, prix égal par créneau.
function opRepartirPrix(prixTotal, effectifs) {
  const n = effectifs.length;
  if (prixTotal == null || !n) return effectifs.map(() => null);
  const total = effectifs.reduce((a, b) => a + b, 0);
  const cents = Math.round(prixTotal * 100);
  let parts;
  if (total > 0) parts = effectifs.map(e => Math.floor(cents * e / total));
  else parts = effectifs.map(() => Math.floor(cents / n));
  let reste = cents - parts.reduce((a, b) => a + b, 0);
  const ordre = effectifs.map((e, i) => i).filter(i => total > 0 ? effectifs[i] > 0 : true);
  for (let k = 0; reste > 0 && ordre.length; k++, reste--) parts[ordre[k % ordre.length]] += 1;
  return parts.map(x => x / 100);
}

// ---------------------------------------------------------------------------
// Écran « Opérations » : liste + modèles
// ---------------------------------------------------------------------------
async function ecranOperations(vue) {
  vue.innerHTML = `
    <div class="carte" style="display:flex;justify-content:space-between;align-items:center;">
      <h2 style="margin:0;">Opérations</h2>
      ${PEUT_GERER_SESSIONS() ? '<button class="bouton" onclick="ecranNouvelleOperation($(\'#vue\'))">+ Nouvelle opération</button>' : ''}
    </div>
    <div class="carte">
      <p style="font-size:13px;color:#55636c;margin:0 0 10px;">Une opération = une seule convention pour un client, découpée en plusieurs créneaux (ex. extincteur en réalité virtuelle : créneaux de 30 min, 3 stagiaires). Chaque créneau est une session à part entière.</p>
      <div id="liste-operations">Chargement…</div>
    </div>
    <div class="carte">
      <h3 style="margin-top:0;">Modèles d'opération</h3>
      <p style="font-size:12px;color:#55636c;margin:0 0 8px;">Réglages réutilisables : à choisir quand tu crées une nouvelle opération (ils pré-remplissent le formulaire). Un modèle se crée depuis le formulaire de nouvelle opération ou depuis une opération existante.</p>
      <div id="liste-modeles-operation">Chargement…</div>
    </div>`;

  const [{ data: ops, error }, { data: modeles, error: errM }] = await Promise.all([
    supa.from('operations_formation')
      .select('id, intitule, date_debut, date_fin, effectif_prevu, prix_total, clients(raison_sociale), sessions_formation(id, session_participants(count))')
      .order('date_debut', { ascending: false }).limit(200),
    supa.from('modeles_operation').select('id, nom, creneau_duree_min, stagiaires_par_creneau, formations_catalogue(denomination)').order('nom'),
  ]);
  if (error) {
    DEBUG.erreur('ecranOperations', error);
    $('#liste-operations').innerHTML = /operations_formation/.test(error.message || '')
      ? '<p class="erreur">La table des opérations n\'existe pas encore : colle le patch <b>patch_2026-10-09_operations.sql</b> dans Supabase (SQL Editor).</p>'
      : 'Erreur de chargement.';
    $('#liste-modeles-operation').textContent = '';
    return;
  }
  $('#liste-operations').innerHTML = (ops || []).length ? `
    <table class="tableau" style="width:100%;border-collapse:collapse;">
      <thead><tr style="text-align:left;"><th>Opération</th><th>Client</th><th>Dates</th><th>Créneaux</th><th>Inscrits / prévu</th></tr></thead>
      <tbody>${ops.map(o => {
        const crs = o.sessions_formation || [];
        const insc = crs.reduce((a, s) => a + (s.session_participants?.[0]?.count || 0), 0);
        return `<tr style="cursor:pointer;border-top:1px solid #eee;" onclick="ouvrirOperation('${o.id}')">
          <td style="padding:6px 4px;"><b>${esc(o.intitule)}</b></td>
          <td>${esc(o.clients?.raison_sociale || '')}</td>
          <td>${esc(formatPlageDatesLongue(o.date_debut, o.date_fin))}</td>
          <td>${crs.length}</td>
          <td>${insc}${o.effectif_prevu ? ' / ' + o.effectif_prevu : ''}</td></tr>`;
      }).join('')}</tbody></table>` : '<p style="color:#55636c;">Aucune opération pour le moment.</p>';

  $('#liste-modeles-operation').innerHTML = errM ? '' : ((modeles || []).length ? `
    <table style="width:100%;border-collapse:collapse;">
      ${modeles.map(m => `<tr style="border-top:1px solid #eee;"><td style="padding:6px 4px;"><b>${esc(m.nom)}</b></td>
        <td>${esc(m.formations_catalogue?.denomination || '')}</td>
        <td>${m.creneau_duree_min} min${m.inter_creneau_min ? ' + ' + m.inter_creneau_min + ' min entre deux' : ''}, ${m.stagiaires_par_creneau} stagiaire(s) par créneau</td>
        <td style="text-align:right;"><button class="bouton" style="background:#eee;color:#333;padding:4px 10px;font-size:12px;" onclick="supprimerModeleOperation('${m.id}')">Supprimer</button></td></tr>`).join('')}
    </table>` : '<p style="color:#55636c;">Aucun modèle enregistré.</p>');
}

async function supprimerModeleOperation(id) {
  if (!confirm('Supprimer ce modèle ? (les opérations déjà créées ne changent pas)')) return;
  const { error } = await supa.from('modeles_operation').delete().eq('id', id);
  if (error) { DEBUG.erreur('supprimerModeleOperation', error); toast('Erreur : ' + error.message, 'erreur'); return; }
  ecranOperations($('#vue'));
}

// ---------------------------------------------------------------------------
// Nouvelle opération
// ---------------------------------------------------------------------------
async function ecranNouvelleOperation(vue, depart) {
  const [{ data: clients }, { data: formations }, { data: formateurs }, { data: modeles }] = await Promise.all([
    supa.from('clients').select('id, raison_sociale').eq('actif', true).order('raison_sociale'),
    supa.from('formations_catalogue').select('id, code, categorie, denomination, duree_heures').eq('actif', true).order('categorie').order('denomination'),
    supa.from('profils').select('id, nom, prenom, formateur_externe').eq('actif', true).order('nom'),
    supa.from('modeles_operation').select('*').order('nom'),
  ]);
  window.__opModeles = modeles || [];
  window.__opFormations = formations || [];
  const parCategorie = {};
  (formations || []).forEach(f => { (parCategorie[f.categorie] = parCategorie[f.categorie] || []).push(f); });
  const d = depart || {};

  vue.innerHTML = `
    <div class="carte" style="max-width:680px;">
      <h2 style="margin-top:0;">Nouvelle opération</h2>
      <p style="font-size:12px;color:#55636c;margin:0 0 10px;">Une convention, un client, plusieurs créneaux. Les créneaux sont créés automatiquement (sessions) et tu pourras importer la liste des salariés envoyée par les RH.</p>

      <label for="op-modele">Partir d'un modèle</label>
      <select id="op-modele" onchange="appliquerModeleOperation(this.value)">
        <option value="">— Aucun (je règle tout moi-même) —</option>
        ${(modeles || []).map(m => `<option value="${m.id}">${esc(m.nom)}</option>`).join('')}
      </select>

      <label for="op-intitule">Intitulé de l'opération</label>
      <input id="op-intitule" placeholder="Ex. Extincteur VR — Société X — novembre 2026" value="${esc(d.intitule || '')}">

      <label for="op-formation">Formation</label>
      <select id="op-formation">
        <option value="">— Choisir —</option>
        ${Object.entries(parCategorie).map(([cat, fs]) => `<optgroup label="${esc(cat)}">${fs.map(f => `<option value="${f.id}" ${f.id === d.formation_id ? 'selected' : ''}>${esc(f.denomination)} (${esc(f.code)})</option>`).join('')}</optgroup>`).join('')}
      </select>
      <p style="font-size:12px;color:#55636c;margin:2px 0 0;">La durée de la formation du catalogue doit être celle d'<b>un</b> stagiaire (ex. 0,5 h) : c'est elle qui sert aux attestations et au BPF.</p>

      <label for="op-client">Client</label>
      <input id="op-client" list="op-clients-liste" placeholder="Rechercher un client…">
      <datalist id="op-clients-liste">${(clients || []).map(c => `<option data-id="${c.id}" value="${esc(c.raison_sociale)}">`).join('')}</datalist>

      <label for="op-lieu">Lieu</label>
      <input id="op-lieu" placeholder="Chez le client, ou adresse">
      <div style="display:flex;gap:10px;">
        <div style="flex:2;"><label for="op-adresse">Adresse</label><input id="op-adresse"></div>
        <div style="flex:1;"><label for="op-cp">Code postal</label><input id="op-cp"></div>
        <div style="flex:2;"><label for="op-ville">Ville</label><input id="op-ville"></div>
      </div>

      <div style="display:flex;gap:10px;">
        <div style="flex:1;"><label for="op-date-debut">Premier jour</label><input id="op-date-debut" type="date"></div>
        <div style="flex:1;"><label for="op-date-fin">Dernier jour</label><input id="op-date-fin" type="date"></div>
      </div>

      <h3 style="margin:16px 0 4px;">Découpage en créneaux</h3>
      <div style="display:flex;gap:10px;">
        <div style="flex:1;"><label for="op-duree">Durée d'un créneau (min)</label><input id="op-duree" type="number" min="5" value="30"></div>
        <div style="flex:1;"><label for="op-par-creneau">Stagiaires par créneau</label><input id="op-par-creneau" type="number" min="1" value="3"></div>
        <div style="flex:1;"><label for="op-inter">Temps entre deux créneaux (min)</label><input id="op-inter" type="number" min="0" value="5"></div>
      </div>
      <div style="display:flex;gap:10px;">
        <div style="flex:1;"><label for="op-h-debut">Premier créneau à</label><input id="op-h-debut" type="time" value="08:30"></div>
        <div style="flex:1;"><label for="op-h-fin">Dernier créneau fini à</label><input id="op-h-fin" type="time" value="17:00"></div>
      </div>
      <label style="margin-top:10px;">Pauses</label>
      <p style="font-size:12px;color:#55636c;margin:2px 0 6px;">Pas d'heure fixe : tu indiques la durée et la plage où la pause doit tomber, et l'application la place au plus tôt dans cette plage, juste après un créneau, pour ne perdre aucun temps. Les créneaux se calent autour. Ajoute une pause par moment de la journée (midi, soir...).</p>
      <div id="op-pauses"></div>
      <button class="bouton" type="button" style="background:#eee;color:#333;font-size:12px;padding:4px 10px;" onclick="opAjouterLignePause()">+ Ajouter une pause</button>
      <div id="op-apercu" style="font-size:13px;margin:8px 0;padding:8px;background:#f3f6f8;border-radius:4px;"></div>

      <h3 style="margin:16px 0 4px;">Convention</h3>
      <div style="display:flex;gap:10px;">
        <div style="flex:1;"><label for="op-effectif">Nombre de salariés prévu</label><input id="op-effectif" type="number" min="1"></div>
        <div style="flex:1;"><label for="op-prix">Prix global (€)</label><input id="op-prix" type="number" step="0.01"></div>
        <div style="flex:1;"><label for="op-devis">N° de devis</label><input id="op-devis"></div>
      </div>
      <label for="op-formateur">Formateur</label>
      <select id="op-formateur">
        <option value="">— Aucun / à définir —</option>
        ${(formateurs || []).map(f => `<option value="${f.id}">${esc(f.prenom + ' ' + f.nom)}${f.formateur_externe ? ' (externe)' : ''}</option>`).join('')}
      </select>
      <label for="op-modalite">Modalité</label>
      <select id="op-modalite"><option value="presentiel" selected>Présentiel</option><option value="distanciel">Distanciel</option><option value="mixte">Mixte</option></select>
      <label for="op-origine">Origine du financement</label>
      <select id="op-origine">
        ${ORIGINES_FINANCEMENT.map(g => `<optgroup label="${esc(g.groupe)}">${g.options.map(o => `<option value="${o.valeur}" ${o.valeur === 'entreprise' ? 'selected' : ''}>${esc(o.libelle)}</option>`).join('')}</optgroup>`).join('')}
      </select>

      <label style="display:flex;align-items:center;gap:6px;font-weight:normal;margin-top:14px;">
        <input type="checkbox" id="op-sauver-modele" style="width:auto;"> Enregistrer ces réglages comme modèle réutilisable
      </label>
      <input id="op-nom-modele" placeholder="Nom du modèle (ex. Extincteur VR 30 min)" style="display:none;margin-top:6px;">

      <button class="bouton" id="op-valider" style="margin-top:16px;">Créer l'opération et ses créneaux</button>
      <button class="bouton" style="margin-top:16px;margin-left:8px;background:#eee;color:#333;" onclick="allerA('operations')">Annuler</button>
      <div class="erreur" id="op-erreur"></div>
    </div>`;

  $('#op-sauver-modele').onchange = (e) => { $('#op-nom-modele').style.display = e.target.checked ? '' : 'none'; };
  ['op-date-debut', 'op-date-fin', 'op-duree', 'op-inter', 'op-par-creneau', 'op-h-debut', 'op-h-fin'].forEach(id => { $('#' + id).oninput = opMettreAJourApercu; });
  $('#op-valider').onclick = () => creerOperation(clients || []);
  opRemplirPauses(d.pauses || [{ nom: 'Pause déjeuner', duree_min: 60, debut: '11:30', fin: '14:00' }]);
  if (d.modele_id) { $('#op-modele').value = d.modele_id; appliquerModeleOperation(d.modele_id); }
  opMettreAJourApercu();
}

function appliquerModeleOperation(id) {
  const m = (window.__opModeles || []).find(x => x.id === id);
  if (!m) return;
  if (m.formation_id) $('#op-formation').value = m.formation_id;
  $('#op-duree').value = m.creneau_duree_min;
  $('#op-par-creneau').value = m.stagiaires_par_creneau;
  $('#op-inter').value = m.inter_creneau_min ?? 0;
  $('#op-h-debut').value = m.heure_debut || '';
  $('#op-h-fin').value = m.heure_fin || '';
  opRemplirPauses(opPausesDe(m));
  $('#op-modalite').value = m.modalite || 'presentiel';
  $('#op-origine').value = m.origine_financement || 'entreprise';
  opMettreAJourApercu();
}

// Lignes de pauses du formulaire
function opAjouterLignePause(v) {
  v = v || { nom: 'Pause', duree_min: 15, debut: '', fin: '' };
  const div = document.createElement('div');
  div.className = 'op-pause-ligne';
  div.style.cssText = 'display:flex;gap:8px;align-items:flex-end;margin-bottom:6px;flex-wrap:wrap;';
  div.innerHTML = `
    <div style="flex:2;min-width:140px;"><label style="font-weight:normal;font-size:12px;">Libellé</label><input class="op-p-nom" value="${esc(v.nom || '')}"></div>
    <div style="flex:1;min-width:90px;"><label style="font-weight:normal;font-size:12px;">Durée (min)</label><input class="op-p-duree" type="number" min="1" value="${esc(v.duree_min || '')}"></div>
    <div style="flex:1;min-width:100px;"><label style="font-weight:normal;font-size:12px;">à placer entre</label><input class="op-p-debut" type="time" value="${esc(v.debut || '')}"></div>
    <div style="flex:1;min-width:100px;"><label style="font-weight:normal;font-size:12px;">et</label><input class="op-p-fin" type="time" value="${esc(v.fin || '')}"></div>
    <button class="bouton" type="button" style="background:#eee;color:#333;padding:6px 10px;" title="Retirer cette pause">×</button>`;
  div.querySelector('button').onclick = () => { div.remove(); opMettreAJourApercu(); };
  div.querySelectorAll('input').forEach(i => { i.oninput = opMettreAJourApercu; });
  $('#op-pauses').appendChild(div);
  opMettreAJourApercu();
}
function opRemplirPauses(liste) {
  $('#op-pauses').innerHTML = '';
  (liste || []).forEach(v => opAjouterLignePause(v));
}
function opLirePauses() {
  return $$('#op-pauses .op-pause-ligne').map(l => ({
    nom: l.querySelector('.op-p-nom').value.trim() || 'Pause',
    duree_min: +l.querySelector('.op-p-duree').value || 0,
    debut: l.querySelector('.op-p-debut').value || null,
    fin: l.querySelector('.op-p-fin').value || null,
  })).filter(x => x.duree_min > 0 && x.debut);
}

function opLireFormulaire() {
  return {
    date_debut: $('#op-date-debut').value, date_fin: $('#op-date-fin').value || $('#op-date-debut').value,
    creneau_duree_min: +$('#op-duree').value || 30, inter_creneau_min: Math.max(0, +$('#op-inter').value || 0), stagiaires_par_creneau: +$('#op-par-creneau').value || 3,
    heure_debut: $('#op-h-debut').value || null, heure_fin: $('#op-h-fin').value || null,
    pauses: opLirePauses(),
  };
}

function opMettreAJourApercu() {
  const zone = $('#op-apercu'); if (!zone) return;
  const p = opLireFormulaire();
  const plan = opPlan(p), cr = plan.creneaux;
  if (!cr.length) { zone.textContent = 'Renseigne les dates et les heures pour voir le nombre de créneaux.'; return; }
  const parJour = {}; cr.forEach(c => { parJour[c.date] = (parJour[c.date] || 0) + 1; });
  zone.innerHTML = `<b>${cr.length} créneau(x)</b> de ${p.creneau_duree_min} min — capacité ${cr.length * p.stagiaires_par_creneau} stagiaires, dernier créneau fini à ${opHeureFr(cr[cr.length - 1].fin)} (${Object.values(parJour).join(' + ')} par jour).${plan.pauses.length ? '<br>Pauses (1er jour) : ' + plan.pauses.filter(x => x.date === plan.pauses[0].date).map(x => esc(x.nom) + ' ' + opHeureFr(x.debut) + ' - ' + opHeureFr(x.fin)).join(' ; ') : ''}`;
}

async function creerOperation(clients) {
  const err = (t) => { $('#op-erreur').textContent = t; };
  err('');
  const p = opLireFormulaire();
  const intitule = $('#op-intitule').value.trim();
  const formationId = $('#op-formation').value;
  const nomClient = $('#op-client').value.trim();
  const client = clients.find(c => c.raison_sociale === nomClient);
  if (!intitule || !formationId || !p.date_debut) return err('Intitulé, formation et premier jour sont obligatoires.');
  if (!client) return err('Choisis un client dans la liste proposée.');
  const creneaux = opCreneaux(p);
  if (!creneaux.length) return err('Aucun créneau ne peut être créé avec ces dates et heures.');
  if (p.date_fin < p.date_debut) return err('Le dernier jour est avant le premier.');
  const nomModele = $('#op-nom-modele').value.trim();
  if ($('#op-sauver-modele').checked && !nomModele) return err('Donne un nom au modèle.');
  if (creneaux.length > 40 && !confirm(`${creneaux.length} créneaux vont être créés. Continuer ?`)) return;

  const btn = $('#op-valider'); btn.disabled = true;
  const effectif = +$('#op-effectif').value || null;
  const prix = $('#op-prix').value === '' ? null : +$('#op-prix').value;
  const base = {
    organisation_id: S.organisation.id,
    formation_id: formationId, client_id: client.id,
    formateur_id: $('#op-formateur').value || null,
    lieu: $('#op-lieu').value.trim() || null, adresse: $('#op-adresse').value.trim() || null,
    code_postal: $('#op-cp').value.trim() || null, ville: $('#op-ville').value.trim() || null,
    modalite: $('#op-modalite').value, origine_financement: $('#op-origine').value,
  };

  try {
    let modeleId = null;
    if ($('#op-sauver-modele').checked) {
      const { data: m, error: eM } = await supa.from('modeles_operation').insert({
        organisation_id: S.organisation.id, nom: nomModele, formation_id: formationId,
        creneau_duree_min: p.creneau_duree_min, inter_creneau_min: p.inter_creneau_min, stagiaires_par_creneau: p.stagiaires_par_creneau,
        heure_debut: p.heure_debut, heure_fin: p.heure_fin, pauses: p.pauses,
        modalite: base.modalite, origine_financement: base.origine_financement,
      }).select().single();
      if (eM) throw new Error(eM.code === '23505' ? 'Un modèle porte déjà ce nom.' : eM.message);
      modeleId = m.id;
    }
    const { data: op, error: eOp } = await supa.from('operations_formation').insert({
      ...base, modele_id: modeleId, intitule, date_debut: p.date_debut, date_fin: p.date_fin,
      creneau_duree_min: p.creneau_duree_min, inter_creneau_min: p.inter_creneau_min, stagiaires_par_creneau: p.stagiaires_par_creneau,
      heure_debut: p.heure_debut, heure_fin: p.heure_fin, pauses: p.pauses,
      effectif_prevu: effectif, prix_total: prix, numero_devis: $('#op-devis').value.trim() || null,
    }).select().single();
    if (eOp) throw new Error(eOp.message);

    const prixParCreneau = opRepartirPrix(prix, creneaux.map(() => 0));
    for (let i = 0; i < creneaux.length; i++) {
      btn.textContent = `Création des créneaux… ${i + 1}/${creneaux.length}`;
      await opCreerSessionCreneau(op, creneaux[i], prixParCreneau[i]);
    }
    toast(`Opération créée avec ${creneaux.length} créneaux.`);
    ouvrirOperation(op.id);
  } catch (e) {
    DEBUG.erreur('creerOperation', e);
    err('Erreur : ' + e.message);
    btn.disabled = false; btn.textContent = 'Créer l\'opération et ses créneaux';
  }
}

// Crée UNE session (un créneau) rattachée à l'opération + son lien client/tarif.
async function opCreerSessionCreneau(op, c, prix) {
  const { data: s, error } = await supa.from('sessions_formation').insert({
    organisation_id: op.organisation_id, operation_id: op.id,
    formation_id: op.formation_id, client_id: op.client_id, formateur_id: op.formateur_id,
    lieu: op.lieu, adresse: op.adresse, code_postal: op.code_postal, ville: op.ville,
    date_debut: c.date, date_fin: c.date,
    horaires: [{ debut: c.debut, pause_debut: null, pause_fin: null, fin: c.fin }],
    prix_unitaire: prix, modalite: op.modalite, origine_financement: op.origine_financement,
  }).select().single();
  if (error) throw new Error(error.message);
  const { error: eC } = await supa.from('session_clients').insert({
    organisation_id: op.organisation_id, session_id: s.id, client_id: op.client_id,
    prix_unitaire: prix, numero_devis: op.numero_devis || null,
  });
  if (eC) throw new Error(eC.message);
  return s;
}

// ---------------------------------------------------------------------------
// Fiche d'une opération
// ---------------------------------------------------------------------------
async function ouvrirOperation(id) {
  if (typeof fsChargerPolices === 'function') fsChargerPolices().catch(() => {});
  S.ongletActif = 'operations';
  S.categorieActive = (typeof categorieDeLOnglet === 'function' && categorieDeLOnglet('operations')?.id) || S.categorieActive;
  rendreMenuLateral(); rendreSousOnglets();
  const vue = $('#vue');
  vue.innerHTML = '<div class="carte">Chargement…</div>';

  const { data: op, error } = await supa.from('operations_formation')
    .select('*, formations_catalogue(*), clients(*)').eq('id', id).single();
  if (error) { DEBUG.erreur('ouvrirOperation', error); vue.innerHTML = '<div class="carte">Opération introuvable ou accès refusé.</div>'; return; }

  const { data: sessions } = await supa.from('sessions_formation').select('*').eq('operation_id', id).order('date_debut').order('created_at');
  const ids = (sessions || []).map(s => s.id);
  const { data: parts } = ids.length
    ? await supa.from('session_participants').select('*, stagiaires(civilite, nom, prenom, date_naissance), clients(raison_sociale, ville)').in('session_id', ids)
    : { data: [] };
  const creneaux = (sessions || []).map(s => ({
    session: s, date: s.date_debut, debut: s.horaires?.[0]?.debut || '', fin: s.horaires?.[0]?.fin || '',
    participants: (parts || []).filter(p => p.session_id === s.id),
  })).sort((a, b) => (a.date + a.debut).localeCompare(b.date + b.debut));
  window.__opCourante = { op, creneaux };

  const nbInscrits = creneaux.reduce((a, c) => a + c.participants.length, 0);
  const capacite = creneaux.length * op.stagiaires_par_creneau;
  vue.innerHTML = `
    <div class="carte">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
        <div>
          <h2 style="margin:0 0 4px;">${esc(op.intitule)}</h2>
          <div style="color:#55636c;font-size:13px;">${esc(op.clients?.raison_sociale || '')} — ${esc(op.formations_catalogue?.denomination || '')}<br>
          ${esc(formatPlageDatesLongue(op.date_debut, op.date_fin))} — ${creneaux.length} créneau(x) de ${op.creneau_duree_min} min${op.inter_creneau_min ? ' (+ ' + op.inter_creneau_min + ' min entre deux)' : ''}, ${op.stagiaires_par_creneau} stagiaire(s) par créneau<br>
          Inscrits : <b>${nbInscrits}</b>${op.effectif_prevu ? ' sur ' + op.effectif_prevu + ' prévus' : ''} (capacité ${capacite})${op.prix_total != null ? ' — prix global ' + op.prix_total + ' €' : ''}</div>
        </div>
        <div><button class="bouton" style="background:#eee;color:#333;" onclick="allerA('operations')">← Opérations</button></div>
      </div>
    </div>

    <div class="carte">
      <h3 style="margin-top:0;">Documents de l'opération</h3>
      <button class="bouton" style="margin:0 8px 8px 0;" onclick="genererConventionOperation()">Convention (unique)</button>
      <button class="bouton" style="margin:0 8px 8px 0;" onclick="genererPlanningOperation()">Planning des passages (à envoyer au client)</button>
      <button class="bouton" style="margin:0 8px 8px 0;" onclick="genererConvocationsOperation()">Toutes les convocations (ZIP)</button>
      <button class="bouton" style="margin:0 8px 8px 0;" onclick="genererEmargementsOperation()">Toutes les feuilles d'émargement (ZIP)</button>
      <p style="font-size:12px;color:#55636c;margin:6px 0 0;">La convention est la même pour tout le monde (sans liste nominative, elle peut partir avant que les RH envoient les noms). Les autres documents (attestations, évaluations, positionnement...) se font depuis chaque créneau.</p>
    </div>

    <div class="carte">
      <h3 style="margin-top:0;">Liste des salariés (envoyée par les RH)</h3>
      <p style="font-size:12px;color:#55636c;margin:0 0 8px;">Colle les lignes copiées depuis Excel, dans cet ordre : <b>Nom, Prénom, Date, Heure de passage</b> — ou charge le fichier Excel/CSV. Si l'opération ne dure qu'un jour, la date est facultative. Rien n'est enregistré avant ta validation.</p>
      <textarea id="op-import-texte" rows="5" style="width:100%;" placeholder="DUPONT	Marie	12/11/2026	09:30"></textarea>
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;">
        <input type="file" id="op-import-fichier" accept=".xlsx,.xls,.csv" style="max-width:280px;">
        <button class="bouton" onclick="opAnalyserImport()">Analyser la liste</button>
      </div>
      <div id="op-import-resultat" style="margin-top:10px;"></div>
    </div>

    <div class="carte">
      <h3 style="margin-top:0;">Créneaux</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="text-align:left;"><th>Date</th><th>Horaire</th><th>Inscrits</th><th>Stagiaires</th><th></th></tr></thead>
        <tbody>${creneaux.map(c => `<tr style="border-top:1px solid #eee;vertical-align:top;">
          <td style="padding:6px 4px;white-space:nowrap;">${esc(formatDateLongue(c.date))}</td>
          <td style="white-space:nowrap;">${esc(opHeureFr(c.debut))} – ${esc(opHeureFr(c.fin))}</td>
          <td style="color:${c.participants.length > op.stagiaires_par_creneau ? '#b00020' : 'inherit'};">${c.participants.length} / ${op.stagiaires_par_creneau}</td>
          <td style="font-size:13px;">${c.participants.map(p => esc((p.stagiaires?.nom || '') + ' ' + (p.stagiaires?.prenom || ''))).join('<br>') || '<span style="color:#888;">—</span>'}</td>
          <td><button class="bouton" style="background:#eee;color:#333;padding:4px 10px;font-size:12px;" onclick="ouvrirSession('${c.session.id}')">Ouvrir</button></td></tr>`).join('')}</tbody>
      </table>
    </div>

    <div class="carte">
      <h3 style="margin-top:0;">Réglages</h3>
      <button class="bouton" style="margin:0 8px 8px 0;background:#eee;color:#333;" onclick="opEnregistrerCommeModele()">Enregistrer comme modèle</button>
      <button class="bouton" style="margin:0 8px 8px 0;background:#eee;color:#333;" onclick="opAjouterCreneau()">+ Ajouter un créneau</button>
      <button class="bouton" style="margin:0 8px 8px 0;background:#eee;color:#333;" onclick="opRecalculerPrix().then(() => ouvrirOperation('${op.id}'))">Recalculer le prix des créneaux</button>
    </div>`;
}

// ---------------------------------------------------------------------------
// Import de la liste des RH
// ---------------------------------------------------------------------------
async function opLireFichierOuTexte() {
  const f = $('#op-import-fichier').files[0];
  if (f) {
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  }
  const texte = $('#op-import-texte').value;
  return texte.split(/\r?\n/).filter(l => l.trim()).map(l => {
    const sep = l.includes('\t') ? '\t' : (l.includes(';') ? ';' : ',');
    return l.split(sep).map(x => x.trim());
  });
}

async function opAnalyserImport() {
  const { op, creneaux } = window.__opCourante;
  const zone = $('#op-import-resultat');
  let lignes;
  try { lignes = await opLireFichierOuTexte(); } catch (e) { DEBUG.erreur('opLireFichier', e); zone.innerHTML = '<p class="erreur">Fichier illisible.</p>'; return; }
  const passages = opParserListe(lignes, op);
  if (!passages.length) { zone.innerHTML = '<p class="erreur">Aucune ligne à importer.</p>'; return; }

  // Stagiaires déjà connus pour ce client + déjà inscrits dans l'opération
  const { data: connus } = await supa.from('stagiaires').select('id, nom, prenom').eq('client_id', op.client_id).limit(5000);
  const parCle = {}; (connus || []).forEach(s => { parCle[opNorm(s.nom) + '|' + opNorm(s.prenom)] = s.id; });
  const dejaInscrits = {};
  creneaux.forEach(c => c.participants.forEach(p => { dejaInscrits[p.stagiaire_id] = c; }));
  const vus = {};
  const virtuels = creneaux.map(c => ({ ...c, nouveaux: 0 }));
  const nouveauxCreneaux = {};

  passages.forEach(p => {
    p.cle = opNorm(p.nom) + '|' + opNorm(p.prenom);
    p.stagiaireId = parCle[p.cle] || null;
    if (vus[p.cle]) p.erreurs.push('présent deux fois dans la liste'); vus[p.cle] = true;
    if (p.stagiaireId && dejaInscrits[p.stagiaireId]) p.erreurs.push('déjà inscrit à un créneau de cette opération');
    if (!p.erreurs.length) {
      const c = opTrouverCreneau(virtuels, p.date, p.heure);
      if (c) { p.cleCreneau = c.date + ' ' + c.debut; p.creneauACreer = !c.session; c.nouveaux = (c.nouveaux || 0) + 1; }
      else {
        const k = p.date + ' ' + p.heure;
        p.cleCreneau = k; p.creneauACreer = true;
        if (!nouveauxCreneaux[k]) { nouveauxCreneaux[k] = { date: p.date, debut: p.heure, fin: opHhmm(opMin(p.heure) + op.creneau_duree_min), nouveaux: 0 }; virtuels.push(nouveauxCreneaux[k]); }
        nouveauxCreneaux[k].nouveaux++;
      }
    }
  });
  const surCharge = virtuels.filter(c => ((c.participants ? c.participants.length : 0) + (c.nouveaux || 0)) > op.stagiaires_par_creneau);
  window.__opImport = { passages, nouveauxCreneaux };
  const ok = passages.filter(p => !p.erreurs.length);
  const ko = passages.filter(p => p.erreurs.length);
  zone.innerHTML = `
    <p><b>${ok.length}</b> ligne(s) prête(s) à importer${ko.length ? `, <b style="color:#b00020;">${ko.length} à corriger</b> (ignorées)` : ''}.
      ${ok.filter(p => !p.stagiaireId).length} nouveau(x) stagiaire(s) seront créés${Object.keys(nouveauxCreneaux).length ? `, ${Object.keys(nouveauxCreneaux).length} créneau(x) manquant(s) seront ajoutés` : ''}.</p>
    ${surCharge.length ? `<p style="color:#b00020;">Attention : ${surCharge.length} créneau(x) dépassent ${op.stagiaires_par_creneau} stagiaire(s) (${surCharge.map(c => opHeureFr(c.debut) + ' le ' + formatDateCourte(new Date(c.date + 'T00:00:00'))).join(', ')}). L'import reste possible.</p>` : ''}
    ${ko.length ? `<table style="font-size:13px;margin-bottom:8px;">${ko.map(p => `<tr><td style="padding-right:10px;">Ligne ${p.ligne}</td><td>${esc(p.nom + ' ' + p.prenom)}</td><td style="color:#b00020;padding-left:10px;">${esc(p.erreurs.join(', '))}</td></tr>`).join('')}</table>` : ''}
    <button class="bouton" ${ok.length ? '' : 'disabled'} onclick="opAppliquerImport()">Importer ${ok.length} salarié(s)</button>`;
}

async function opAppliquerImport() {
  const { op, creneaux } = window.__opCourante;
  const { passages, nouveauxCreneaux } = window.__opImport || {};
  const ok = (passages || []).filter(p => !p.erreurs.length);
  if (!ok.length) return;
  const zone = $('#op-import-resultat');
  zone.innerHTML = '<p>Import en cours…</p>';
  try {
    // 1. créneaux manquants
    const sessionParCle = {}; creneaux.forEach(c => { sessionParCle[c.date + ' ' + c.debut] = c.session.id; });
    for (const k of Object.keys(nouveauxCreneaux)) {
      const c = nouveauxCreneaux[k];
      const s = await opCreerSessionCreneau(op, c, null);
      sessionParCle[k] = s.id;
    }
    // 2. stagiaires manquants (un seul envoi)
    const aCreer = []; const dejaPrevu = {};
    ok.forEach(p => { if (!p.stagiaireId && !dejaPrevu[p.cle]) { dejaPrevu[p.cle] = true; aCreer.push({ organisation_id: op.organisation_id, client_id: op.client_id, nom: p.nom, prenom: p.prenom }); } });
    const idParCle = {}; ok.forEach(p => { if (p.stagiaireId) idParCle[p.cle] = p.stagiaireId; });
    if (aCreer.length) {
      const { data: crees, error: eS } = await supa.from('stagiaires').insert(aCreer).select('id, nom, prenom');
      if (eS) throw new Error(eS.message);
      (crees || []).forEach(s => { idParCle[opNorm(s.nom) + '|' + opNorm(s.prenom)] = s.id; });
    }
    // 3. inscriptions (un seul envoi)
    const inscriptions = ok.map(p => ({
      organisation_id: op.organisation_id, session_id: sessionParCle[p.cleCreneau],
      stagiaire_id: idParCle[p.cle], client_id: op.client_id, statut: 'inscrit',
    }));
    if (inscriptions.some(i => !i.session_id || !i.stagiaire_id)) throw new Error('Une ligne n\'a pas pu être rattachée à un créneau.');
    const { error: eP } = await supa.from('session_participants').insert(inscriptions);
    if (eP) throw new Error(eP.message);
    await opRecalculerPrix();
    toast(`${inscriptions.length} salarié(s) inscrit(s).`);
    ouvrirOperation(op.id);
  } catch (e) {
    DEBUG.erreur('opAppliquerImport', e);
    zone.innerHTML = `<p class="erreur">Erreur : ${esc(e.message)}. Recharge la fiche pour voir ce qui a été enregistré.</p>`;
  }
}

// Répartit le prix global entre les créneaux (au prorata des inscrits une fois la liste connue).
async function opRecalculerPrix() {
  const op = window.__opCourante.op;
  if (op.prix_total == null) return;
  const { data: sessions } = await supa.from('sessions_formation').select('id, session_participants(count)').eq('operation_id', op.id).order('date_debut').order('created_at');
  const liste = sessions || [];
  const prix = opRepartirPrix(op.prix_total, liste.map(s => s.session_participants?.[0]?.count || 0));
  for (let i = 0; i < liste.length; i++) {
    await supa.from('sessions_formation').update({ prix_unitaire: prix[i] }).eq('id', liste[i].id);
    await supa.from('session_clients').update({ prix_unitaire: prix[i] }).eq('session_id', liste[i].id).eq('client_id', op.client_id);
  }
}

async function opAjouterCreneau() {
  const { op } = window.__opCourante;
  const date = prompt('Date du créneau (AAAA-MM-JJ) :', op.date_debut);
  const jour = opLireDate(date);
  if (!jour) return;
  const heure = opLireHeure(prompt('Heure de début (ex. 14:30) :', '14:00'));
  if (!heure) { toast('Heure illisible.', 'erreur'); return; }
  try {
    await opCreerSessionCreneau(op, { date: jour, debut: heure, fin: opHhmm(opMin(heure) + op.creneau_duree_min) }, null);
    await opRecalculerPrix();
    ouvrirOperation(op.id);
  } catch (e) { DEBUG.erreur('opAjouterCreneau', e); toast('Erreur : ' + e.message, 'erreur'); }
}

async function opEnregistrerCommeModele() {
  const { op } = window.__opCourante;
  const nom = (prompt('Nom du modèle :', op.intitule) || '').trim();
  if (!nom) return;
  const { error } = await supa.from('modeles_operation').insert({
    organisation_id: op.organisation_id, nom, formation_id: op.formation_id,
    creneau_duree_min: op.creneau_duree_min, inter_creneau_min: op.inter_creneau_min || 0, stagiaires_par_creneau: op.stagiaires_par_creneau,
    heure_debut: op.heure_debut, heure_fin: op.heure_fin, pauses: opPausesDe(op), pause_debut: op.pause_debut, pause_fin: op.pause_fin,
    modalite: op.modalite, origine_financement: op.origine_financement,
  });
  if (error) { toast(error.code === '23505' ? 'Un modèle porte déjà ce nom.' : 'Erreur : ' + error.message, 'erreur'); return; }
  toast('Modèle enregistré : tu le retrouveras dans « Nouvelle opération ».');
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
function opSessionPourDocuments(op, c) {
  return { ...c.session, formations_catalogue: op.formations_catalogue, clients: op.clients };
}

function genererConventionOperation() {
  const { op } = window.__opCourante;
  const session = {
    ...op, id: op.id, numero_session: null,
    formations_catalogue: op.formations_catalogue, clients: op.clients,
    horaires: [{ debut: op.heure_debut, pause_debut: null, pause_fin: null, fin: op.heure_fin }],
    prix_unitaire: op.prix_total, __operation: { ...op, pauses: opPausesDe(op) },
  };
  genererConvention(session, [], false, { clients: op.clients, client_id: op.client_id, prix_unitaire: op.prix_total });
}

function genererPlanningOperation() {
  const { op, creneaux } = window.__opCourante;
  const doc = new jsPDF({ compress: true });
  ajouterLogoEnTete(doc);
  let y = titre(doc, 'PLANNING DES PASSAGES', 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  const lignes = [
    ['Formation :', op.formations_catalogue?.denomination || ''],
    ['Entreprise :', op.clients?.raison_sociale || ''],
    ['Lieu :', [op.lieu, op.adresse, [op.code_postal, op.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ')],
    ['Dates :', formatPlageDatesLongue(op.date_debut, op.date_fin)],
    ['Durée par stagiaire :', `${op.creneau_duree_min} minutes`],
  ];
  lignes.forEach(([a, b]) => { doc.setFont('helvetica', 'bold'); doc.text(a, MARGE, y); doc.setFont('helvetica', 'normal'); doc.text(doc.splitTextToSize(b || '—', 135), MARGE + 42, y); y += 6; });
  const nbInscritsTotal = creneaux.reduce((a, c) => a + c.participants.length, 0);   // liste connue : on n'imprime que les créneaux occupés
  const lignesCreneaux = creneaux.filter(c => c.participants.length || !nbInscritsTotal).map(c => ({
    cle: c.date + ' ' + c.debut, pause: false,
    cells: [formatDateLongue(c.date), `${opHeureFr(c.debut)} - ${opHeureFr(c.fin)}`,
      c.participants.map(p => `${(p.stagiaires?.nom || '').toUpperCase()} ${p.stagiaires?.prenom || ''}`).join('\n') || '—'],
  }));
  // Pauses déjeuner : placées automatiquement (voir opPlan) ; on n'imprime que celles qui tombent entre deux créneaux imprimés.
  const lignesPauses = opPlan(op).pauses.filter(pa => {
    const avant = lignesCreneaux.some(l => l.cle.startsWith(pa.date) && l.cle.slice(11) < pa.debut);
    const apres = lignesCreneaux.some(l => l.cle.startsWith(pa.date) && l.cle.slice(11) >= pa.fin);
    return avant && apres;
  }).map(pa => ({ cle: pa.date + ' ' + pa.debut, pause: true, cells: [formatDateLongue(pa.date), `${opHeureFr(pa.debut)} - ${opHeureFr(pa.fin)}`, pa.nom || 'Pause'] }));
  const lignesPlanning = lignesCreneaux.concat(lignesPauses).sort((a, b) => a.cle.localeCompare(b.cle));
  doc.autoTable({
    startY: y + 4,
    head: [['Date', 'Horaire', 'Stagiaires convoqués']],
    body: lignesPlanning.map(l => l.cells),
    didParseCell: (d) => { if (d.section === 'body' && lignesPlanning[d.row.index]?.pause) { d.cell.styles.fillColor = [238, 242, 245]; d.cell.styles.fontStyle = 'italic'; } },
    headStyles: { fillColor: [10, 92, 138] }, styles: { fontSize: 10 },
    columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 30 } },
  });
  const r = telechargerOuOuvrir(doc, `${op.date_debut} - Planning des passages - ${(op.clients?.raison_sociale || '').replace(/[^\w-]+/g, '')}.pdf`.replace(/\s+/g, ' '), false);
  return r;
}

async function opZip(nomZip, fichiers) {
  if (typeof JSZip === 'undefined') { toast('Bibliothèque ZIP non chargée.', 'erreur'); return; }
  const zip = new JSZip();
  fichiers.forEach(f => zip.file(f.nomFichier, f.doc.output('blob')));
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nomZip.replace(/[/\\?%*:|"<>]+/g, '').replace(/\s+/g, ' '); document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

async function genererConvocationsOperation() {
  const { op, creneaux } = window.__opCourante;
  const fichiers = [];
  creneaux.forEach(c => {
    const s = opSessionPourDocuments(op, c);
    c.participants.forEach(p => {
      const r = genererConvocation(s, p, true);
      if (r) fichiers.push({ nomFichier: r.nomFichier.replace('.pdf', ` - ${c.debut.replace(':', 'h')}.pdf`), doc: r.doc });
    });
  });
  if (!fichiers.length) { toast('Aucun stagiaire inscrit : importe d\'abord la liste.', 'erreur'); return; }
  await opZip(`Convocations - ${op.intitule}.zip`, fichiers);
  toast(`${fichiers.length} convocation(s) générée(s).`);
}

async function genererEmargementsOperation() {
  const { op, creneaux } = window.__opCourante;
  const fichiers = [];
  creneaux.filter(c => c.participants.length).forEach(c => {
    const r = genererFeuillePresence(opSessionPourDocuments(op, c), c.participants, true);
    if (r) fichiers.push({ nomFichier: `${c.date} ${c.debut.replace(':', 'h')} - Emargement.pdf`, doc: r.doc });
  });
  if (!fichiers.length) { toast('Aucun stagiaire inscrit : importe d\'abord la liste.', 'erreur'); return; }
  await opZip(`Emargements - ${op.intitule}.zip`, fichiers);
  toast(`${fichiers.length} feuille(s) générée(s).`);
}
