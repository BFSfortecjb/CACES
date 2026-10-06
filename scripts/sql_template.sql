-- ============================================================================
-- BFS CACES - schema_reference (__VARIANT_LABEL__)
-- Schema cible : __SCHEMA__
-- Genere le __DATE__ - ne pas editer a la main, regenerer depuis le generateur.
-- ============================================================================
__SCHEMA_CREATE__

-- ----------------------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------------------

-- Formateurs (staff authentifie). La ligne est creee automatiquement a
-- l'inscription (trigger plus bas) avec role = null : tant qu'un admin n'a pas
-- attribue explicitement un role, le compte n'a acces a rien (voir policies).
create table if not exists __SCHEMA__.formateurs (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nom text,
  prenom text,
  role text check (role in ('formateur','admin','secretariat')),
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

-- Referentiels CACES couverts (R485, R489, R482A, R486A, ...)
create table if not exists __SCHEMA__.referentiels (
  code text primary key,
  libelle text not null,
  duree_validite_mois int not null,
  seuil_reussite_global_pct int not null default 70,
  -- Unite de Test theorique (identique pour toutes les categories du referentiel
  -- dans R485/R489/R482A/R486A) - sert au calcul de charge des testeurs.
  ut_theorique numeric not null default 1,
  actif boolean not null default true
);

-- Categories par referentiel (ex. R489 -> 1A, 1B, 2A... / R482A -> A, B1, B2...)
create table if not exists __SCHEMA__.categories_referentiel (
  id serial primary key,
  referentiel_code text not null references __SCHEMA__.referentiels(code) on delete cascade,
  code text not null,
  libelle text not null,
  -- Unite de Test pratique de la categorie (variable selon categorie, cf. annexes
  -- A3/3 des recommandations) - sert au calcul de charge des testeurs.
  ut_pratique numeric not null default 1,
  unique (referentiel_code, code)
);

-- Colonnes ajoutees apres la version initiale du schema (idempotent, sans
-- effet si la table vient d'etre creee ci-dessus avec ces colonnes deja
-- presentes) :
alter table __SCHEMA__.referentiels add column if not exists ut_theorique numeric not null default 1;
alter table __SCHEMA__.categories_referentiel add column if not exists ut_pratique numeric not null default 1;

-- Centres de Deroulement de Test (CDT) : lieux physiques ou se deroulent les
-- sessions. Reutilisable d'une session a l'autre.
create table if not exists __SCHEMA__.centres_examen (
  id serial primary key,
  nom text not null,
  adresse text,
  agence text,
  capacite_personnes int,
  actif boolean not null default true
);

-- Themes du QCM par referentiel, avec le bareme officiel (sur 100) pour calculer
-- le seuil "moyenne par sous-partie" exige par le referentiel CNAMTS/INRS.
create table if not exists __SCHEMA__.themes_referentiel (
  id serial primary key,
  referentiel_code text not null references __SCHEMA__.referentiels(code) on delete cascade,
  code text not null,
  libelle text not null,
  bareme_officiel_sur_100 int not null,
  unique (referentiel_code, code)
);

-- Banque de questions vrai/faux. Ne jamais exposer "reponse" a un stagiaire :
-- lecture reservee aux formateurs authentifies, jamais a anon (voir grants).
create table if not exists __SCHEMA__.questions_qcm (
  id serial primary key,
  theme_id int not null references __SCHEMA__.themes_referentiel(id) on delete cascade,
  code text,
  enonce text not null,
  reponse boolean not null,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

-- Sessions de formation. formateur_id = celui qui forme (suivi FISE + suivi
-- horometre) ; testeur_id = celui qui gere QCM + epreuve pratique et doit,
-- selon le referentiel de certification, etre une personne distincte du
-- formateur ayant forme les stagiaires de la session (regle non forcee en
-- base, a controler cote application).
create table if not exists __SCHEMA__.sessions_formation (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  code_acces text not null unique,
  statut text not null check (statut in ('brouillon','ouverte','theorie_close','pratique_en_cours','cloturee')) default 'brouillon',
  formateur_id uuid references __SCHEMA__.formateurs(id),
  testeur_id uuid references __SCHEMA__.formateurs(id),
  centre_examen_id int references __SCHEMA__.centres_examen(id),
  date_creation timestamptz not null default now(),
  date_ouverture timestamptz,
  date_cloture timestamptz,
  -- N° de session Galaxy : obligatoire (reference administrative, entre dans
  -- le n° de CACES delivre) ; entreprise/lieu : informations de session.
  numero_session_galaxy text,
  entreprise text,
  lieu text,
  date_debut date,
  -- Sauvegarde Drive : dossier de la session (cree par l'Edge Function)
  drive_dossier_id text
);
alter table __SCHEMA__.sessions_formation add column if not exists numero_session_galaxy text;
alter table __SCHEMA__.sessions_formation add column if not exists entreprise text;
alter table __SCHEMA__.sessions_formation add column if not exists lieu text;
alter table __SCHEMA__.sessions_formation add column if not exists date_debut date;
alter table __SCHEMA__.sessions_formation add column if not exists drive_dossier_id text;
alter table __SCHEMA__.sessions_formation add column if not exists testeur_id uuid references __SCHEMA__.formateurs(id);
alter table __SCHEMA__.sessions_formation add column if not exists centre_examen_id int references __SCHEMA__.centres_examen(id);

-- Categories visees par une session (une session peut viser plusieurs
-- referentiels/categories a la fois)
create table if not exists __SCHEMA__.session_categories (
  session_id uuid not null references __SCHEMA__.sessions_formation(id) on delete cascade,
  referentiel_code text not null,
  categorie_code text not null,
  primary key (session_id, referentiel_code, categorie_code),
  foreign key (referentiel_code, categorie_code) references __SCHEMA__.categories_referentiel(referentiel_code, code)
);

-- Stagiaires (donnees personnelles - purgees a la cloture de la session)
create table if not exists __SCHEMA__.stagiaires (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references __SCHEMA__.sessions_formation(id) on delete cascade,
  nom text not null,
  prenom text not null,
  email text,
  code_acces_individuel text not null unique,
  fonction text,
  entreprise text,
  date_naissance date,
  -- Photo du titulaire (carton) : chemin dans le bucket Storage prive
  -- 'photos-stagiaires', prise depuis le telephone/tablette du formateur.
  photo_path text,
  ordre int not null default 0,
  created_at timestamptz not null default now()
);
alter table __SCHEMA__.stagiaires add column if not exists fonction text;
alter table __SCHEMA__.stagiaires add column if not exists entreprise text;
alter table __SCHEMA__.stagiaires add column if not exists date_naissance date;
alter table __SCHEMA__.stagiaires add column if not exists photo_path text;
alter table __SCHEMA__.stagiaires add column if not exists ordre int not null default 0;

-- Suivi theorie / pratique par stagiaire et par categorie visee.
-- theorie_validee peut etre positionnee a la creation de session si le
-- stagiaire a deja valide la theorie dans les 12 mois (regle CNAMTS/INRS).
create table if not exists __SCHEMA__.stagiaire_categories (
  stagiaire_id uuid not null references __SCHEMA__.stagiaires(id) on delete cascade,
  referentiel_code text not null,
  categorie_code text not null,
  -- NULL = pas encore evalue ; false = echec ; true = valide (cf. piege Habelec).
  theorie_validee boolean,
  date_validation_theorie date,
  numero_titre_theorie text,
  pratique_validee boolean,
  date_validation_pratique date,
  primary key (stagiaire_id, referentiel_code, categorie_code)
);

-- Parcours : initial / recyclage (photo de l'ancien CACES) / autre categorie dans l'annee
-- suivant la validation de la theorie (theorie valable 1 an : dispense + photo du CACES).
alter table __SCHEMA__.stagiaire_categories add column if not exists parcours text not null default 'initial';
alter table __SCHEMA__.stagiaire_categories add column if not exists dispense_theorie boolean not null default false;
alter table __SCHEMA__.stagiaire_categories add column if not exists ancien_caces_path text;
alter table __SCHEMA__.stagiaire_categories add column if not exists ancien_caces_numero text;
alter table __SCHEMA__.stagiaire_categories add column if not exists ancien_caces_date_theorie date;
do $$ begin
  alter table __SCHEMA__.stagiaire_categories add constraint stagiaire_categories_parcours_check
    check (parcours in ('initial','recyclage','autre_categorie'));
exception when duplicate_object then null; end $$;

-- Tirage QCM : la graine est stockee pour que le tirage soit reproductible
-- et auditable (jamais les bonnes reponses envoyees au navigateur avant correction).
create table if not exists __SCHEMA__.qcm_tirages (
  id uuid primary key default gen_random_uuid(),
  stagiaire_id uuid not null references __SCHEMA__.stagiaires(id) on delete cascade,
  referentiel_code text not null references __SCHEMA__.referentiels(code),
  graine bigint not null,
  date_debut timestamptz not null default now(),
  date_fin timestamptz,
  score_global_pct numeric,
  reussi boolean,
  statut text not null check (statut in ('en_cours','termine','abandonne')) default 'en_cours',
  testeur_id uuid references __SCHEMA__.formateurs(id)
);
alter table __SCHEMA__.qcm_tirages add column if not exists testeur_id uuid references __SCHEMA__.formateurs(id);

create table if not exists __SCHEMA__.qcm_tirage_questions (
  tirage_id uuid not null references __SCHEMA__.qcm_tirages(id) on delete cascade,
  question_id int not null references __SCHEMA__.questions_qcm(id),
  ordre int not null,
  reponse_stagiaire boolean,
  correcte boolean,
  primary key (tirage_id, question_id)
);

-- Catalogue national des criteres d'evaluation pratique, editable par un admin
-- (pas fige dans le code), associe a une categorie d'un referentiel.
create table if not exists __SCHEMA__.criteres_pratique (
  id serial primary key,
  referentiel_code text not null,
  categorie_code text not null,
  theme_code text not null,
  libelle text not null,
  bareme_points int not null,
  eliminatoire boolean not null default false,
  ordre int not null default 0,
  foreign key (referentiel_code, categorie_code) references __SCHEMA__.categories_referentiel(referentiel_code, code)
);

create table if not exists __SCHEMA__.epreuves_pratique (
  id uuid primary key default gen_random_uuid(),
  stagiaire_id uuid not null references __SCHEMA__.stagiaires(id) on delete cascade,
  session_id uuid not null references __SCHEMA__.sessions_formation(id) on delete cascade,
  referentiel_code text not null,
  categorie_code text not null,
  formateur_id uuid references __SCHEMA__.formateurs(id),
  testeur_id uuid references __SCHEMA__.formateurs(id),
  date_passage timestamptz not null default now(),
  score_global numeric,
  reussi boolean
);
alter table __SCHEMA__.epreuves_pratique add column if not exists testeur_id uuid references __SCHEMA__.formateurs(id);
-- UT des options passees avec l'epreuve (ex. porte-engins 0,5 ; telecommande 0,5)
alter table __SCHEMA__.epreuves_pratique add column if not exists ut_options numeric not null default 0;
alter table __SCHEMA__.epreuves_pratique add column if not exists options text[];
-- (engin_id ajoute plus bas, apres la creation de la table engins)

create table if not exists __SCHEMA__.epreuve_pratique_resultats (
  epreuve_id uuid not null references __SCHEMA__.epreuves_pratique(id) on delete cascade,
  critere_id int not null references __SCHEMA__.criteres_pratique(id),
  points_obtenus int not null,
  primary key (epreuve_id, critere_id)
);

create table if not exists __SCHEMA__.certificats (
  id uuid primary key default gen_random_uuid(),
  stagiaire_id uuid not null references __SCHEMA__.stagiaires(id) on delete cascade,
  referentiel_code text not null,
  categorie_code text not null,
  numero text not null unique,
  date_delivrance date not null,
  date_expiration date not null,
  formateur_id uuid references __SCHEMA__.formateurs(id),
  created_at timestamptz not null default now()
);

-- Numerotation CACES : AAAA.MM.Rxxx.CAT.<n° session Galaxy>.NNNNN
-- Compteur par categorie, jamais remis a zero. Pour demarrer a un numero donne :
--   update caces.compteurs_certificat set dernier = 44 where referentiel_code='R482A' and categorie_code='B1';
create table if not exists __SCHEMA__.compteurs_certificat (
  referentiel_code text not null,
  categorie_code text not null,
  dernier int not null default 0,
  primary key (referentiel_code, categorie_code)
);
alter table __SCHEMA__.compteurs_certificat enable row level security;
alter table __SCHEMA__.certificats add column if not exists testeur_id uuid references __SCHEMA__.formateurs(id);
alter table __SCHEMA__.certificats add column if not exists options text[];
alter table __SCHEMA__.certificats add column if not exists session_id uuid references __SCHEMA__.sessions_formation(id);
create unique index if not exists certificats_unique_stag_cat on __SCHEMA__.certificats (stagiaire_id, referentiel_code, categorie_code);

create or replace function __SCHEMA__.caces_emettre_certificat(p_stagiaire uuid, p_ref text, p_cat text)
returns __SCHEMA__.certificats
language plpgsql security definer
set search_path = __SCHEMA__, public, extensions
as $$
declare
  v_session uuid; v_sf __SCHEMA__.sessions_formation; v_sc __SCHEMA__.stagiaire_categories;
  v_ep __SCHEMA__.epreuves_pratique; v_cert __SCHEMA__.certificats; v_n int; v_date date; v_mois int; v_num text;
begin
  select session_id into v_session from __SCHEMA__.stagiaires where id = p_stagiaire;
  if v_session is null then raise exception 'Stagiaire introuvable'; end if;
  if not __SCHEMA__.caces_est_testeur_de(v_session) then raise exception 'Réservé au testeur de la session ou à l''administrateur'; end if;
  select * into v_sf from __SCHEMA__.sessions_formation where id = v_session;
  if coalesce(v_sf.type_session, 'caces') <> 'caces' then raise exception 'Pas de numéro CACES pour une autorisation de conduite'; end if;
  if coalesce(trim(v_sf.numero_session_galaxy), '') = '' then raise exception 'Le n° de session Galaxy est obligatoire pour numéroter un CACES'; end if;

  select * into v_cert from __SCHEMA__.certificats where stagiaire_id = p_stagiaire and referentiel_code = p_ref and categorie_code = p_cat;
  if found then return v_cert; end if;

  select * into v_sc from __SCHEMA__.stagiaire_categories where stagiaire_id = p_stagiaire and referentiel_code = p_ref and categorie_code = p_cat;
  if not coalesce(v_sc.theorie_validee, false) or not coalesce(v_sc.pratique_validee, false) then
    raise exception 'Théorie et pratique doivent être validées';
  end if;
  select * into v_ep from __SCHEMA__.epreuves_pratique
    where stagiaire_id = p_stagiaire and referentiel_code = p_ref and categorie_code = p_cat and reussi = true
    order by date_passage desc limit 1;
  v_date := coalesce(v_ep.date_passage::date, current_date);
  select duree_validite_mois into v_mois from __SCHEMA__.referentiels where code = p_ref;

  insert into __SCHEMA__.compteurs_certificat (referentiel_code, categorie_code, dernier) values (p_ref, p_cat, 1)
    on conflict (referentiel_code, categorie_code) do update set dernier = __SCHEMA__.compteurs_certificat.dernier + 1
    returning dernier into v_n;
  v_num := to_char(v_date, 'YYYY.MM') || '.' || left(p_ref, 4) || '.' || p_cat || '.' || trim(v_sf.numero_session_galaxy) || '.' || lpad(v_n::text, 5, '0');

  insert into __SCHEMA__.certificats (stagiaire_id, referentiel_code, categorie_code, numero, date_delivrance, date_expiration,
                                      formateur_id, testeur_id, options, session_id)
  values (p_stagiaire, p_ref, p_cat, v_num, v_date, (v_date + make_interval(months => coalesce(v_mois, 60)) - interval '1 day')::date,
          v_sf.formateur_id, coalesce(v_ep.testeur_id, v_sf.testeur_id), v_ep.options, v_session)
  returning * into v_cert;
  return v_cert;
end;
$$;
revoke all on function __SCHEMA__.caces_emettre_certificat(uuid, text, text) from public, anon;
grant execute on function __SCHEMA__.caces_emettre_certificat(uuid, text, text) to authenticated;

-- Verification publique d'un titre (QR code du carton / API pour le site BFS).
-- Renvoie uniquement : identite du titulaire, referentiel, categories, options, dates, statut.
create or replace function __SCHEMA__.caces_verifier_titre(p_numero text)
returns jsonb
language plpgsql stable security definer
set search_path = __SCHEMA__, public, extensions
as $$
declare c __SCHEMA__.certificats; s __SCHEMA__.stagiaires; r jsonb;
begin
  select * into c from __SCHEMA__.certificats where numero = upper(trim(p_numero));
  if not found then return jsonb_build_object('trouve', false, 'statut', 'inconnu'); end if;
  select * into s from __SCHEMA__.stagiaires where id = c.stagiaire_id;
  select jsonb_agg(jsonb_build_object(
      'numero', x.numero, 'categorie', x.categorie_code,
      'categorie_libelle', (select cr.libelle from __SCHEMA__.categories_referentiel cr where cr.referentiel_code = x.referentiel_code and cr.code = x.categorie_code),
      'options', coalesce(x.options, '{}'),
      'date_delivrance', x.date_delivrance, 'date_expiration', x.date_expiration,
      'statut', case when x.date_expiration < current_date then 'expire' else 'valide' end)
    order by x.categorie_code)
  into r
  from __SCHEMA__.certificats x where x.stagiaire_id = c.stagiaire_id and x.referentiel_code = c.referentiel_code;
  return jsonb_build_object(
    'trouve', true,
    'statut', case when c.date_expiration < current_date then 'expire' else 'valide' end,
    'nom', s.nom, 'prenom', s.prenom,
    'referentiel', c.referentiel_code,
    'referentiel_libelle', (select libelle from __SCHEMA__.referentiels where code = c.referentiel_code),
    'numero', c.numero, 'titres', r);
end;
$$;
revoke all on function __SCHEMA__.caces_verifier_titre(text) from public;
grant execute on function __SCHEMA__.caces_verifier_titre(text) to anon, authenticated;

-- Journal d'audit : toute intervention manuelle non automatique (saisie a la
-- place du stagiaire, correction de cle, generation manuelle de certificat...)
create table if not exists __SCHEMA__.journal_audit (
  id bigserial primary key,
  session_id uuid references __SCHEMA__.sessions_formation(id),
  formateur_id uuid references __SCHEMA__.formateurs(id),
  action text not null,
  cible text,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- Parametres applicatifs (ligne unique, id=1) : purge RGPD des donnees
-- personnelles stagiaire, desactivee par defaut - un admin doit l'activer
-- explicitement depuis l'ecran Parametres. Anonymisation (pas de suppression
-- de ligne) pour ne pas casser les cascades vers certificats/epreuves,
-- necessaires aux statistiques et a la tracabilite reglementaire.
create table if not exists __SCHEMA__.parametres_application (
  id smallint primary key default 1,
  purge_active boolean not null default false,
  purge_delai_jours int not null default 30,
  -- Limites reglementaires (recommandations CACES, annexe A3/3) : un testeur
  -- ne peut faire plus de 7 UT/jour (dont 6 UT max de pratique + options) ; un
  -- stagiaire (salarie) pas plus de 7 UT/jour ; theorie limitee a 12 candidats
  -- par testeur present. Modifiables par l'admin (ecran Testeurs & UT).
  quota_ut_jour numeric not null default 7,
  quota_ut_pratique_jour numeric not null default 6,
  quota_ut_stagiaire_jour numeric not null default 7,
  max_candidats_theorie int not null default 12,
  updated_at timestamptz not null default now(),
  updated_by uuid references __SCHEMA__.formateurs(id),
  constraint parametres_application_singleton check (id = 1)
);
alter table __SCHEMA__.parametres_application add column if not exists quota_ut_jour numeric not null default 7;
alter table __SCHEMA__.parametres_application add column if not exists quota_ut_pratique_jour numeric not null default 6;
alter table __SCHEMA__.parametres_application add column if not exists quota_ut_stagiaire_jour numeric not null default 7;
alter table __SCHEMA__.parametres_application add column if not exists max_candidats_theorie int not null default 12;
insert into __SCHEMA__.parametres_application (id) values (1) on conflict (id) do nothing;

-- Habilitations testeur : un formateur habilite comme testeur declare ses
-- specialisations (referentiel + categorie), avec date de validation.
create table if not exists __SCHEMA__.testeur_specialisations (
  formateur_id uuid not null references __SCHEMA__.formateurs(id) on delete cascade,
  referentiel_code text not null,
  categorie_code text not null,
  date_validation date,
  actif boolean not null default true,
  primary key (formateur_id, referentiel_code, categorie_code),
  foreign key (referentiel_code, categorie_code) references __SCHEMA__.categories_referentiel(referentiel_code, code)
);

-- Catalogue des capacites evaluees en cours de formation (fiche individuelle
-- de suivi et d'evaluation - FISE), regroupees par theme, editable par un
-- admin. Une capacite peut concerner une ou plusieurs categories du meme
-- referentiel (colonnes 1/3/5 du modele FISE) via fise_capacite_categories.
create table if not exists __SCHEMA__.fise_capacites (
  id serial primary key,
  referentiel_code text not null references __SCHEMA__.referentiels(code) on delete cascade,
  theme_code text not null,
  theme_libelle text not null,
  libelle text not null,
  ordre int not null default 0
);

create table if not exists __SCHEMA__.fise_capacite_categories (
  capacite_id int not null references __SCHEMA__.fise_capacites(id) on delete cascade,
  categorie_code text not null,
  primary key (capacite_id, categorie_code)
);

-- Evaluation FISE par stagiaire : statut A (Acquis) / E.C.A. (en cours
-- d'acquisition) / N.A. (non acquis), saisie par le formateur pendant la
-- formation - distincte de l'epreuve pratique notee par le testeur.
create table if not exists __SCHEMA__.fise_evaluations (
  stagiaire_id uuid not null references __SCHEMA__.stagiaires(id) on delete cascade,
  capacite_id int not null references __SCHEMA__.fise_capacites(id) on delete cascade,
  categorie_code text not null,
  statut text not null check (statut in ('A','ECA','NA')),
  observations text,
  updated_at timestamptz not null default now(),
  primary key (stagiaire_id, capacite_id, categorie_code)
);

-- Avis global du formateur pour la presentation au test CACES, par categorie.
create table if not exists __SCHEMA__.fise_avis (
  stagiaire_id uuid not null references __SCHEMA__.stagiaires(id) on delete cascade,
  referentiel_code text not null,
  categorie_code text not null,
  avis text not null check (avis in ('favorable','defavorable')),
  observations text,
  motivation_defavorable text,
  formateur_id uuid references __SCHEMA__.formateurs(id),
  date_avis date not null default current_date,
  primary key (stagiaire_id, referentiel_code, categorie_code)
);

-- Suivi horometre : temps de pratique par stagiaire et par engin, releve par
-- le formateur (distinct du QCM/pratique geres par le testeur).
create table if not exists __SCHEMA__.suivi_horometre (
  id serial primary key,
  stagiaire_id uuid not null references __SCHEMA__.stagiaires(id) on delete cascade,
  session_id uuid not null references __SCHEMA__.sessions_formation(id) on delete cascade,
  formateur_id uuid references __SCHEMA__.formateurs(id),
  referentiel_code text,
  categorie_code text,
  engin_libelle text,
  date_seance date not null default current_date,
  releve_debut numeric,
  releve_fin numeric,
  duree_heures numeric generated always as (releve_fin - releve_debut) stored,
  observations text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. FONCTIONS
-- ----------------------------------------------------------------------------

-- Role du formateur connecte, sans recursion RLS. Renvoie null si le compte
-- n'est pas encore un formateur reconnu (donc aucun acces).
create or replace function __SCHEMA__.caces_role()
returns text
language sql
stable
security definer
set search_path = __SCHEMA__, public, extensions
as $$
  select role from __SCHEMA__.formateurs where id = auth.uid();
$$;

-- Projet Supabase PARTAGE entre toutes les briques Univers BFS : auth.users est
-- commun, donc AUCUN trigger sur auth.users (il se declencherait pour les
-- comptes de toutes les autres briques, et une erreur bloquerait leurs
-- inscriptions). Le rattachement d'un compte existant a BFS CACES se fait
-- explicitement par un admin (fonction ci-dessous, comme Habelec).
-- Nettoyage idempotent de l'ancien mecanisme automatique :
drop trigger if exists on_auth_user_created_caces on auth.users;
drop function if exists __SCHEMA__.handle_new_user_caces();

-- Separation formateur / testeur : le FORMATEUR de la session remplit la FISE
-- et l'horometre ; le TESTEUR de la session fait le QCM et la pratique. Un
-- admin peut tout. Ces fonctions servent aux policies (security definer pour
-- eviter toute recursion RLS).
create or replace function __SCHEMA__.caces_est_formateur_de(p_session uuid)
returns boolean language sql stable security definer
set search_path = __SCHEMA__, public, extensions
as $$
  select coalesce(__SCHEMA__.caces_role() = 'admin', false)
      or exists (select 1 from __SCHEMA__.sessions_formation s
                 where s.id = p_session and s.formateur_id = auth.uid());
$$;

create or replace function __SCHEMA__.caces_est_testeur_de(p_session uuid)
returns boolean language sql stable security definer
set search_path = __SCHEMA__, public, extensions
as $$
  select coalesce(__SCHEMA__.caces_role() = 'admin', false)
      or exists (select 1 from __SCHEMA__.sessions_formation s
                 where s.id = p_session and s.testeur_id = auth.uid());
$$;

create or replace function __SCHEMA__.caces_session_du_stagiaire(p_stagiaire uuid)
returns uuid language sql stable security definer
set search_path = __SCHEMA__, public, extensions
as $$ select session_id from __SCHEMA__.stagiaires where id = p_stagiaire; $$;

-- ----------------------------------------------------------------------------
-- UNITES DE TEST (UT) - limites journalieres, appliquees EN BASE (sans
-- derogation) : un depassement fait echouer l'enregistrement de l'epreuve.
--  * theorie : collective - ut_theorique du referentiel par groupe de
--    max_candidats_theorie candidats (par testeur, par jour, par referentiel) ;
--  * pratique : ut_pratique de la categorie + ut_options, par candidat.
-- Le jour est la date reelle de l'epreuve (fuseau Europe/Paris).
-- ----------------------------------------------------------------------------
create or replace function __SCHEMA__.caces_charge_testeur(p_testeur uuid, p_jour date)
returns table (ut_total numeric, ut_pratique numeric)
language sql stable security definer
set search_path = __SCHEMA__, public, extensions
as $$
  with th as (
    select t.referentiel_code, count(distinct t.stagiaire_id) as n
    from __SCHEMA__.qcm_tirages t
    where t.testeur_id = p_testeur and t.statut <> 'abandonne'
      and (t.date_debut at time zone 'Europe/Paris')::date = p_jour
    group by t.referentiel_code),
  ut_th as (
    select coalesce(sum(r.ut_theorique * ceil(th.n::numeric / greatest(p.max_candidats_theorie, 1))), 0) as v
    from th join __SCHEMA__.referentiels r on r.code = th.referentiel_code
    cross join __SCHEMA__.parametres_application p where p.id = 1),
  pr as (
    select coalesce(sum(c.ut_pratique + e.ut_options), 0) as v
    from __SCHEMA__.epreuves_pratique e
    join __SCHEMA__.categories_referentiel c
      on c.referentiel_code = e.referentiel_code and c.code = e.categorie_code
    where e.testeur_id = p_testeur
      and (e.date_passage at time zone 'Europe/Paris')::date = p_jour)
  select ut_th.v + pr.v, pr.v from ut_th, pr;
$$;

create or replace function __SCHEMA__.caces_charge_stagiaire(p_stagiaire uuid, p_jour date)
returns numeric
language sql stable security definer
set search_path = __SCHEMA__, public, extensions
as $$
  select coalesce((
      select sum(r.ut_theorique) from (
        select distinct t.referentiel_code from __SCHEMA__.qcm_tirages t
        where t.stagiaire_id = p_stagiaire and t.statut <> 'abandonne'
          and (t.date_debut at time zone 'Europe/Paris')::date = p_jour) d
      join __SCHEMA__.referentiels r on r.code = d.referentiel_code), 0)
    + coalesce((
      select sum(c.ut_pratique + e.ut_options)
      from __SCHEMA__.epreuves_pratique e
      join __SCHEMA__.categories_referentiel c
        on c.referentiel_code = e.referentiel_code and c.code = e.categorie_code
      where e.stagiaire_id = p_stagiaire
        and (e.date_passage at time zone 'Europe/Paris')::date = p_jour), 0);
$$;

create or replace function __SCHEMA__.caces_controle_ut()
returns trigger
language plpgsql security definer
set search_path = __SCHEMA__, public, extensions
as $$
declare
  v_jour date; q record; prm record; v_stag numeric;
begin
  if tg_table_name = 'qcm_tirages' then
    v_jour := (new.date_debut at time zone 'Europe/Paris')::date;
  else
    v_jour := (new.date_passage at time zone 'Europe/Paris')::date;
  end if;
  if (select type_session from __SCHEMA__.sessions_formation
      where id = __SCHEMA__.caces_session_du_stagiaire(new.stagiaire_id)) = 'autorisation' then
    return null;      -- les limites d'UT sont celles des tests CACES : non applicables aux autorisations de conduite
  end if;
  select * into prm from __SCHEMA__.parametres_application where id = 1;

  if new.testeur_id is not null then
    select * into q from __SCHEMA__.caces_charge_testeur(new.testeur_id, v_jour);
    if q.ut_total > prm.quota_ut_jour then
      raise exception 'Limite atteinte : un testeur ne peut pas réaliser plus de % UT par journée (% UT le %).',
        prm.quota_ut_jour, q.ut_total, to_char(v_jour, 'DD/MM/YYYY') using errcode = 'P0001';
    end if;
    if q.ut_pratique > prm.quota_ut_pratique_jour then
      raise exception 'Limite atteinte : un testeur ne peut pas réaliser plus de % UT d''épreuves pratiques (et options) par journée (% UT le %).',
        prm.quota_ut_pratique_jour, q.ut_pratique, to_char(v_jour, 'DD/MM/YYYY') using errcode = 'P0001';
    end if;
  end if;

  v_stag := __SCHEMA__.caces_charge_stagiaire(new.stagiaire_id, v_jour);
  if v_stag > prm.quota_ut_stagiaire_jour then
    raise exception 'Limite atteinte : un stagiaire ne peut pas subir plus de % UT par journée (% UT le %).',
      prm.quota_ut_stagiaire_jour, v_stag, to_char(v_jour, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_controle_ut_qcm on __SCHEMA__.qcm_tirages;
create trigger trg_controle_ut_qcm
  after insert or update of testeur_id, date_debut, statut on __SCHEMA__.qcm_tirages
  for each row execute function __SCHEMA__.caces_controle_ut();

drop trigger if exists trg_controle_ut_pratique on __SCHEMA__.epreuves_pratique;
create trigger trg_controle_ut_pratique
  after insert or update of testeur_id, date_passage, categorie_code, ut_options on __SCHEMA__.epreuves_pratique
  for each row execute function __SCHEMA__.caces_controle_ut();

revoke all on function __SCHEMA__.caces_charge_testeur(uuid, date) from public, anon;
revoke all on function __SCHEMA__.caces_charge_stagiaire(uuid, date) from public, anon;
grant execute on function __SCHEMA__.caces_charge_testeur(uuid, date) to authenticated;
grant execute on function __SCHEMA__.caces_charge_stagiaire(uuid, date) to authenticated;

-- Rattache un compte auth.users existant (cree ailleurs dans l'Univers BFS) a
-- BFS CACES. Reservee aux admins. Idempotente : n'ecrase jamais un formateur
-- deja rattache.
create or replace function __SCHEMA__.rattacher_formateur_par_email(
  p_email text, p_nom text, p_prenom text, p_role text default 'formateur')
returns text
language plpgsql
security definer
set search_path = __SCHEMA__, public, extensions
as $$
declare v_id uuid;
begin
  if coalesce((select f.role from __SCHEMA__.formateurs f where f.id = auth.uid()), '') <> 'admin' then
    raise exception 'Reserve aux administrateurs';
  end if;
  if p_role not in ('formateur','admin','secretariat') then
    raise exception 'Role invalide';
  end if;
  select u.id into v_id from auth.users u where lower(u.email) = lower(p_email);
  if v_id is null then
    raise exception 'Aucun compte avec cet e-mail dans l''Univers BFS';
  end if;
  if exists (select 1 from __SCHEMA__.formateurs f where f.id = v_id) then
    return 'deja_rattache';
  end if;
  insert into __SCHEMA__.formateurs (id, email, nom, prenom, role, actif)
  values (v_id, lower(p_email), p_nom, p_prenom, p_role, true);
  return 'rattache';
end;
$$;
revoke all on function __SCHEMA__.rattacher_formateur_par_email(text,text,text,text) from public, anon;
grant execute on function __SCHEMA__.rattacher_formateur_par_email(text,text,text,text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2 bis. MOTEUR QCM STAGIAIRE (anon) - fonctions security definer.
-- Le stagiaire n'a aucun compte Supabase Auth : il s'identifie uniquement par
-- son code_acces_individuel, verifie a l'interieur de chaque fonction. Ces
-- fonctions sont les SEULS points d'entree anon sur les donnees stagiaire/QCM
-- (aucun grant table direct a anon, cf. section 3). La colonne "reponse" de
-- questions_qcm n'est jamais renvoyee par ces fonctions.
-- ----------------------------------------------------------------------------

-- Identite + categories du stagiaire porteur du code (pour choisir quel
-- referentiel/categorie passer et afficher l'etat theorie/pratique).
create or replace function __SCHEMA__.caces_stagiaire_infos(p_code text)
returns table (
  stagiaire_id uuid, nom text, prenom text,
  session_id uuid, session_nom text, session_statut text,
  referentiel_code text, categorie_code text,
  theorie_validee boolean, pratique_validee boolean
)
language sql
stable
security definer
set search_path = __SCHEMA__, public, extensions
as $$
  select s.id, s.nom, s.prenom, sf.id, sf.nom, sf.statut,
         sc.referentiel_code, sc.categorie_code, sc.theorie_validee, sc.pratique_validee
  from __SCHEMA__.stagiaires s
  join __SCHEMA__.sessions_formation sf on sf.id = s.session_id
  join __SCHEMA__.stagiaire_categories sc on sc.stagiaire_id = s.id
  where s.code_acces_individuel = p_code;
$$;

-- Demarre (ou reprend) le tirage QCM du stagiaire pour un referentiel donne.
-- La banque actuelle correspond au support papier officiel complet (100
-- questions) : le "tirage" est un ordre aleatoire (graine stockee pour audit),
-- pas un sous-ensemble.
create or replace function __SCHEMA__.caces_demarrer_qcm(p_code text, p_referentiel_code text)
returns uuid
language plpgsql
security definer
set search_path = __SCHEMA__, public, extensions
as $$
declare
  v_stagiaire_id uuid;
  v_tirage_id uuid;
  v_graine bigint;
begin
  select id into v_stagiaire_id from __SCHEMA__.stagiaires where code_acces_individuel = p_code;
  if v_stagiaire_id is null then
    raise exception 'Code d''accès invalide.';
  end if;

  select id into v_tirage_id from __SCHEMA__.qcm_tirages
    where stagiaire_id = v_stagiaire_id and referentiel_code = p_referentiel_code and statut = 'en_cours'
    order by date_debut desc limit 1;
  if v_tirage_id is not null then
    return v_tirage_id;
  end if;

  v_graine := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  insert into __SCHEMA__.qcm_tirages (stagiaire_id, referentiel_code, graine, testeur_id)
    values (v_stagiaire_id, p_referentiel_code, v_graine,
            (select sf.testeur_id from __SCHEMA__.stagiaires st
               join __SCHEMA__.sessions_formation sf on sf.id = st.session_id
              where st.id = v_stagiaire_id))
    returning id into v_tirage_id;

  perform setseed((v_graine % 1000000)::float / 1000000.0);
  insert into __SCHEMA__.qcm_tirage_questions (tirage_id, question_id, ordre)
  select v_tirage_id, q.id, row_number() over (order by random())
  from __SCHEMA__.questions_qcm q
  join __SCHEMA__.themes_referentiel t on t.id = q.theme_id
  where t.referentiel_code = p_referentiel_code and q.actif = true;

  return v_tirage_id;
end;
$$;

-- Liste des questions du tirage, sans jamais exposer la bonne reponse.
create or replace function __SCHEMA__.caces_questions_du_tirage(p_code text, p_tirage_id uuid)
returns table (question_id int, ordre int, enonce text, reponse_stagiaire boolean)
language sql
stable
security definer
set search_path = __SCHEMA__, public, extensions
as $$
  select qtq.question_id, qtq.ordre, q.enonce, qtq.reponse_stagiaire
  from __SCHEMA__.qcm_tirage_questions qtq
  join __SCHEMA__.questions_qcm q on q.id = qtq.question_id
  join __SCHEMA__.qcm_tirages t on t.id = qtq.tirage_id
  join __SCHEMA__.stagiaires s on s.id = t.stagiaire_id
  where qtq.tirage_id = p_tirage_id and s.code_acces_individuel = p_code
  order by qtq.ordre;
$$;

-- Enregistre/modifie la reponse du stagiaire a une question, tant que le
-- tirage n'est pas finalise.
create or replace function __SCHEMA__.caces_repondre(p_code text, p_tirage_id uuid, p_question_id int, p_reponse boolean)
returns void
language plpgsql
security definer
set search_path = __SCHEMA__, public, extensions
as $$
begin
  update __SCHEMA__.qcm_tirage_questions qtq
    set reponse_stagiaire = p_reponse
    from __SCHEMA__.qcm_tirages t
    join __SCHEMA__.stagiaires s on s.id = t.stagiaire_id
    where qtq.tirage_id = t.id and t.id = p_tirage_id
      and qtq.question_id = p_question_id and s.code_acces_individuel = p_code
      and t.statut = 'en_cours';
end;
$$;

-- Corrige et cloture le tirage : calcule la note globale (nb correct / 100,
-- la banque comptant exactement 1 question par point de bareme officiel) et
-- la note par theme (nb correct / nb questions du theme), applique les
-- seuils du referentiel de certification (>= seuil global ET >= 50% -
-- "la moyenne" - a chaque theme), stocke le resultat sur qcm_tirages.
create or replace function __SCHEMA__.caces_finaliser_qcm(p_code text, p_tirage_id uuid)
returns table (score_global_pct numeric, reussi boolean, detail_themes jsonb)
language plpgsql
security definer
set search_path = __SCHEMA__, public, extensions
as $$
declare
  v_stagiaire_id uuid;
  v_referentiel text;
  v_global_pct numeric;
  v_reussi boolean := true;
  v_seuil_global int;
  v_detail jsonb := '[]'::jsonb;
  r record;
begin
  select t.stagiaire_id, t.referentiel_code into v_stagiaire_id, v_referentiel
  from __SCHEMA__.qcm_tirages t
  join __SCHEMA__.stagiaires s on s.id = t.stagiaire_id
  where t.id = p_tirage_id and s.code_acces_individuel = p_code and t.statut = 'en_cours';

  if v_stagiaire_id is null then
    raise exception 'Tirage introuvable ou déjà finalisé.';
  end if;

  update __SCHEMA__.qcm_tirage_questions qtq
    set correcte = (qtq.reponse_stagiaire is not distinct from q.reponse)
    from __SCHEMA__.questions_qcm q
    where qtq.question_id = q.id and qtq.tirage_id = p_tirage_id;

  select seuil_reussite_global_pct into v_seuil_global from __SCHEMA__.referentiels where code = v_referentiel;

  select round(100.0 * count(*) filter (where correcte) / nullif(count(*), 0), 1)
    into v_global_pct
  from __SCHEMA__.qcm_tirage_questions where tirage_id = p_tirage_id;

  if v_global_pct is null or v_global_pct < v_seuil_global then
    v_reussi := false;
  end if;

  for r in (
    select th.libelle as theme_libelle,
           count(*) filter (where qtq.correcte) as nb_correct,
           count(*) as nb_questions,
           round(100.0 * count(*) filter (where qtq.correcte) / nullif(count(*), 0), 1) as note_pct
    from __SCHEMA__.qcm_tirage_questions qtq
    join __SCHEMA__.questions_qcm q on q.id = qtq.question_id
    join __SCHEMA__.themes_referentiel th on th.id = q.theme_id
    where qtq.tirage_id = p_tirage_id
    group by th.id, th.libelle
  )
  loop
    if r.note_pct is null or r.note_pct < 50 then
      v_reussi := false;
    end if;
    v_detail := v_detail || jsonb_build_object(
      'theme', r.theme_libelle, 'note_pct', r.note_pct,
      'nb_correct', r.nb_correct, 'nb_questions', r.nb_questions
    );
  end loop;

  update __SCHEMA__.qcm_tirages
    set statut = 'termine', date_fin = now(), score_global_pct = v_global_pct, reussi = v_reussi
    where id = p_tirage_id;

  -- Reporte le resultat sur le suivi du stagiaire (toutes ses categories de ce referentiel).
  update __SCHEMA__.stagiaire_categories
    set theorie_validee = v_reussi,
        date_validation_theorie = case when v_reussi then current_date else null end
    where stagiaire_id = v_stagiaire_id and referentiel_code = v_referentiel;

  return query select v_global_pct, v_reussi, v_detail;
end;
$$;

grant execute on function __SCHEMA__.caces_stagiaire_infos(text) to anon, authenticated;
grant execute on function __SCHEMA__.caces_demarrer_qcm(text, text) to anon, authenticated;
grant execute on function __SCHEMA__.caces_questions_du_tirage(text, uuid) to anon, authenticated;
grant execute on function __SCHEMA__.caces_repondre(text, uuid, int, boolean) to anon, authenticated;
grant execute on function __SCHEMA__.caces_finaliser_qcm(text, uuid) to anon, authenticated;

-- Purge RGPD : anonymise (ne supprime pas, pour preserver certificats et
-- statistiques) les stagiaires des sessions cloturees depuis plus de
-- parametres_application.purge_delai_jours, uniquement si purge_active est
-- active par un admin. Reservee a l'admin (controle interne a la fonction,
-- pas seulement via RLS, car elle touche potentiellement plusieurs sessions
-- d'un coup). Journalise le nombre de stagiaires anonymises.
create or replace function __SCHEMA__.caces_purger_sessions_cloturees()
returns int
language plpgsql
security definer
set search_path = __SCHEMA__, public, extensions
as $$
declare
  v_active boolean;
  v_delai int;
  v_nb int := 0;
begin
  if __SCHEMA__.caces_role() <> 'admin' then
    raise exception 'Reserve a un administrateur.';
  end if;

  select purge_active, purge_delai_jours into v_active, v_delai
    from __SCHEMA__.parametres_application where id = 1;

  if not coalesce(v_active, false) then
    return 0;
  end if;

  with cible as (
    update __SCHEMA__.stagiaires s
      set nom = 'Anonymisé', prenom = '', email = null
      from __SCHEMA__.sessions_formation sf
      where sf.id = s.session_id
        and sf.statut = 'cloturee'
        and sf.date_cloture is not null
        and sf.date_cloture < now() - (v_delai || ' days')::interval
        and s.nom <> 'Anonymisé'
      returning s.id
  )
  select count(*) into v_nb from cible;

  if v_nb > 0 then
    insert into __SCHEMA__.journal_audit (formateur_id, action, cible, detail)
    values (auth.uid(), 'purge_donnees_personnelles', 'stagiaires',
      jsonb_build_object('nb_anonymises', v_nb, 'delai_jours', v_delai));
  end if;

  return v_nb;
end;
$$;

grant execute on function __SCHEMA__.caces_purger_sessions_cloturees() to authenticated;

-- ----------------------------------------------------------------------------
-- 3. RLS + GRANTS
-- ----------------------------------------------------------------------------

grant usage on schema __SCHEMA__ to authenticated, anon;

alter table __SCHEMA__.formateurs enable row level security;
alter table __SCHEMA__.referentiels enable row level security;
alter table __SCHEMA__.categories_referentiel enable row level security;
alter table __SCHEMA__.themes_referentiel enable row level security;
alter table __SCHEMA__.questions_qcm enable row level security;
alter table __SCHEMA__.sessions_formation enable row level security;
alter table __SCHEMA__.session_categories enable row level security;
alter table __SCHEMA__.stagiaires enable row level security;
alter table __SCHEMA__.stagiaire_categories enable row level security;
alter table __SCHEMA__.qcm_tirages enable row level security;
alter table __SCHEMA__.qcm_tirage_questions enable row level security;
alter table __SCHEMA__.criteres_pratique enable row level security;
alter table __SCHEMA__.epreuves_pratique enable row level security;
alter table __SCHEMA__.epreuve_pratique_resultats enable row level security;
alter table __SCHEMA__.certificats enable row level security;
alter table __SCHEMA__.journal_audit enable row level security;
alter table __SCHEMA__.parametres_application enable row level security;
alter table __SCHEMA__.centres_examen enable row level security;
alter table __SCHEMA__.testeur_specialisations enable row level security;
alter table __SCHEMA__.fise_capacites enable row level security;
alter table __SCHEMA__.fise_capacite_categories enable row level security;
alter table __SCHEMA__.fise_evaluations enable row level security;
alter table __SCHEMA__.fise_avis enable row level security;
alter table __SCHEMA__.suivi_horometre enable row level security;

-- formateurs : chacun voit sa propre ligne ; un admin voit/modifie tout le monde.
-- Lecture ouverte a tout formateur/admin authentifie (necessaire pour
-- peupler les listes deroulantes formateur/testeur a la creation d'une
-- session, y compris pour un utilisateur non-admin) ; ecriture (changement
-- de role) reservee a l'admin.
drop policy if exists formateurs_self_select on __SCHEMA__.formateurs;
create policy formateurs_self_select on __SCHEMA__.formateurs
  for select using (__SCHEMA__.caces_role() is not null);

drop policy if exists formateurs_admin_write on __SCHEMA__.formateurs;
create policy formateurs_admin_write on __SCHEMA__.formateurs
  for update using (__SCHEMA__.caces_role() = 'admin');

-- Referentiels / categories / themes : donnees de reference non sensibles,
-- lecture ouverte a tout utilisateur authentifie (formateur reconnu).
-- Ecriture reservee a l'admin.
drop policy if exists referentiels_read on __SCHEMA__.referentiels;
create policy referentiels_read on __SCHEMA__.referentiels
  for select using (__SCHEMA__.caces_role() is not null);
drop policy if exists referentiels_admin_write on __SCHEMA__.referentiels;
create policy referentiels_admin_write on __SCHEMA__.referentiels
  for all using (__SCHEMA__.caces_role() = 'admin') with check (__SCHEMA__.caces_role() = 'admin');

drop policy if exists categories_read on __SCHEMA__.categories_referentiel;
create policy categories_read on __SCHEMA__.categories_referentiel
  for select using (__SCHEMA__.caces_role() is not null);
drop policy if exists categories_admin_write on __SCHEMA__.categories_referentiel;
create policy categories_admin_write on __SCHEMA__.categories_referentiel
  for all using (__SCHEMA__.caces_role() = 'admin') with check (__SCHEMA__.caces_role() = 'admin');

drop policy if exists themes_read on __SCHEMA__.themes_referentiel;
create policy themes_read on __SCHEMA__.themes_referentiel
  for select using (__SCHEMA__.caces_role() is not null);
drop policy if exists themes_admin_write on __SCHEMA__.themes_referentiel;
create policy themes_admin_write on __SCHEMA__.themes_referentiel
  for all using (__SCHEMA__.caces_role() = 'admin') with check (__SCHEMA__.caces_role() = 'admin');

-- Questions QCM : jamais visibles par anon (le tirage passe par une fonction
-- security definer). Formateurs/admin peuvent consulter et editer la banque.
drop policy if exists questions_formateur_read on __SCHEMA__.questions_qcm;
create policy questions_formateur_read on __SCHEMA__.questions_qcm
  for select using (__SCHEMA__.caces_role() is not null);
drop policy if exists questions_admin_write on __SCHEMA__.questions_qcm;
create policy questions_admin_write on __SCHEMA__.questions_qcm
  for all using (__SCHEMA__.caces_role() = 'admin') with check (__SCHEMA__.caces_role() = 'admin');

-- Sessions, categories de session, stagiaires, suivi, tirages, epreuves,
-- certificats, audit : reserves aux formateurs/admin authentifies. Les
-- stagiaires (anon) n'ont aucun acces direct a ces tables ; ils passent
-- exclusivement par des fonctions security definer (a livrer avec le moteur
-- de QCM / pratique).
drop policy if exists sessions_formateur_all on __SCHEMA__.sessions_formation;
drop policy if exists sessions_lecture on __SCHEMA__.sessions_formation;
create policy sessions_lecture on __SCHEMA__.sessions_formation
  for select using (__SCHEMA__.caces_role() is not null);
create policy sessions_formateur_all on __SCHEMA__.sessions_formation
  for all using (__SCHEMA__.caces_role() in ('formateur','admin')) with check (__SCHEMA__.caces_role() in ('formateur','admin'));

drop policy if exists session_categories_formateur_all on __SCHEMA__.session_categories;
drop policy if exists session_categories_lecture on __SCHEMA__.session_categories;
create policy session_categories_lecture on __SCHEMA__.session_categories
  for select using (__SCHEMA__.caces_role() is not null);
create policy session_categories_formateur_all on __SCHEMA__.session_categories
  for all using (__SCHEMA__.caces_role() in ('formateur','admin')) with check (__SCHEMA__.caces_role() in ('formateur','admin'));

drop policy if exists stagiaires_formateur_all on __SCHEMA__.stagiaires;
drop policy if exists stagiaires_lecture on __SCHEMA__.stagiaires;
create policy stagiaires_lecture on __SCHEMA__.stagiaires
  for select using (__SCHEMA__.caces_role() is not null);
create policy stagiaires_formateur_all on __SCHEMA__.stagiaires
  for all using (__SCHEMA__.caces_role() in ('formateur','admin')) with check (__SCHEMA__.caces_role() in ('formateur','admin'));

drop policy if exists stagiaire_categories_formateur_all on __SCHEMA__.stagiaire_categories;
drop policy if exists stagiaire_categories_lecture on __SCHEMA__.stagiaire_categories;
create policy stagiaire_categories_lecture on __SCHEMA__.stagiaire_categories
  for select using (__SCHEMA__.caces_role() is not null);
create policy stagiaire_categories_formateur_all on __SCHEMA__.stagiaire_categories
  for all using (__SCHEMA__.caces_est_formateur_de(__SCHEMA__.caces_session_du_stagiaire(stagiaire_id)) or __SCHEMA__.caces_est_testeur_de(__SCHEMA__.caces_session_du_stagiaire(stagiaire_id))) with check (__SCHEMA__.caces_est_formateur_de(__SCHEMA__.caces_session_du_stagiaire(stagiaire_id)) or __SCHEMA__.caces_est_testeur_de(__SCHEMA__.caces_session_du_stagiaire(stagiaire_id)));

drop policy if exists qcm_tirages_formateur_all on __SCHEMA__.qcm_tirages;
drop policy if exists qcm_tirages_lecture on __SCHEMA__.qcm_tirages;
create policy qcm_tirages_lecture on __SCHEMA__.qcm_tirages
  for select using (__SCHEMA__.caces_role() is not null);
create policy qcm_tirages_formateur_all on __SCHEMA__.qcm_tirages
  for all using (__SCHEMA__.caces_est_testeur_de(__SCHEMA__.caces_session_du_stagiaire(stagiaire_id))) with check (__SCHEMA__.caces_est_testeur_de(__SCHEMA__.caces_session_du_stagiaire(stagiaire_id)));

drop policy if exists qcm_tirage_questions_formateur_all on __SCHEMA__.qcm_tirage_questions;
drop policy if exists qcm_tirage_questions_lecture on __SCHEMA__.qcm_tirage_questions;
create policy qcm_tirage_questions_lecture on __SCHEMA__.qcm_tirage_questions
  for select using (__SCHEMA__.caces_role() is not null);
create policy qcm_tirage_questions_formateur_all on __SCHEMA__.qcm_tirage_questions
  for all using (__SCHEMA__.caces_est_testeur_de(__SCHEMA__.caces_session_du_stagiaire((select t.stagiaire_id from __SCHEMA__.qcm_tirages t where t.id = tirage_id)))) with check (__SCHEMA__.caces_est_testeur_de(__SCHEMA__.caces_session_du_stagiaire((select t.stagiaire_id from __SCHEMA__.qcm_tirages t where t.id = tirage_id))));

drop policy if exists criteres_formateur_read on __SCHEMA__.criteres_pratique;
create policy criteres_formateur_read on __SCHEMA__.criteres_pratique
  for select using (__SCHEMA__.caces_role() is not null);
drop policy if exists criteres_admin_write on __SCHEMA__.criteres_pratique;
create policy criteres_admin_write on __SCHEMA__.criteres_pratique
  for all using (__SCHEMA__.caces_role() = 'admin') with check (__SCHEMA__.caces_role() = 'admin');

drop policy if exists epreuves_formateur_all on __SCHEMA__.epreuves_pratique;
drop policy if exists epreuves_lecture on __SCHEMA__.epreuves_pratique;
create policy epreuves_lecture on __SCHEMA__.epreuves_pratique
  for select using (__SCHEMA__.caces_role() is not null);
create policy epreuves_formateur_all on __SCHEMA__.epreuves_pratique
  for all using (__SCHEMA__.caces_est_testeur_de(session_id)) with check (__SCHEMA__.caces_est_testeur_de(session_id));

drop policy if exists epreuve_resultats_formateur_all on __SCHEMA__.epreuve_pratique_resultats;
drop policy if exists epreuve_resultats_lecture on __SCHEMA__.epreuve_pratique_resultats;
create policy epreuve_resultats_lecture on __SCHEMA__.epreuve_pratique_resultats
  for select using (__SCHEMA__.caces_role() is not null);
create policy epreuve_resultats_formateur_all on __SCHEMA__.epreuve_pratique_resultats
  for all using (__SCHEMA__.caces_est_testeur_de((select e.session_id from __SCHEMA__.epreuves_pratique e where e.id = epreuve_id))) with check (__SCHEMA__.caces_est_testeur_de((select e.session_id from __SCHEMA__.epreuves_pratique e where e.id = epreuve_id)));

drop policy if exists certificats_formateur_all on __SCHEMA__.certificats;
drop policy if exists certificats_lecture on __SCHEMA__.certificats;
create policy certificats_lecture on __SCHEMA__.certificats
  for select using (__SCHEMA__.caces_role() is not null);
create policy certificats_formateur_all on __SCHEMA__.certificats
  for all using (__SCHEMA__.caces_est_testeur_de(__SCHEMA__.caces_session_du_stagiaire(stagiaire_id))) with check (__SCHEMA__.caces_est_testeur_de(__SCHEMA__.caces_session_du_stagiaire(stagiaire_id)));

drop policy if exists audit_formateur_read on __SCHEMA__.journal_audit;
create policy audit_formateur_read on __SCHEMA__.journal_audit
  for select using (__SCHEMA__.caces_role() is not null);
drop policy if exists audit_formateur_insert on __SCHEMA__.journal_audit;
create policy audit_formateur_insert on __SCHEMA__.journal_audit
  for insert with check (__SCHEMA__.caces_role() is not null);

-- Parametres applicatifs : lecture ouverte a tout formateur/admin (pour
-- afficher l'etat de la purge, meme en lecture seule, dans l'ecran
-- Parametres) ; ecriture (activation, delai) reservee a l'admin.
drop policy if exists parametres_read on __SCHEMA__.parametres_application;
create policy parametres_read on __SCHEMA__.parametres_application
  for select using (__SCHEMA__.caces_role() is not null);
drop policy if exists parametres_admin_write on __SCHEMA__.parametres_application;
create policy parametres_admin_write on __SCHEMA__.parametres_application
  for update using (__SCHEMA__.caces_role() = 'admin') with check (__SCHEMA__.caces_role() = 'admin');

-- Centres d'examen : reference non sensible, lecture formateurs, ecriture admin.
drop policy if exists centres_examen_read on __SCHEMA__.centres_examen;
create policy centres_examen_read on __SCHEMA__.centres_examen
  for select using (__SCHEMA__.caces_role() is not null);
drop policy if exists centres_examen_admin_write on __SCHEMA__.centres_examen;
create policy centres_examen_admin_write on __SCHEMA__.centres_examen
  for all using (__SCHEMA__.caces_role() = 'admin') with check (__SCHEMA__.caces_role() = 'admin');

-- Specialisations testeur : lecture formateurs, ecriture admin (validation
-- des habilitations = decision d'organisme, reservee a l'admin).
drop policy if exists testeur_specialisations_read on __SCHEMA__.testeur_specialisations;
create policy testeur_specialisations_read on __SCHEMA__.testeur_specialisations
  for select using (__SCHEMA__.caces_role() is not null);
drop policy if exists testeur_specialisations_admin_write on __SCHEMA__.testeur_specialisations;
create policy testeur_specialisations_admin_write on __SCHEMA__.testeur_specialisations
  for all using (__SCHEMA__.caces_role() = 'admin') with check (__SCHEMA__.caces_role() = 'admin');

-- Catalogue FISE : lecture formateurs, ecriture admin.
drop policy if exists fise_capacites_read on __SCHEMA__.fise_capacites;
create policy fise_capacites_read on __SCHEMA__.fise_capacites
  for select using (__SCHEMA__.caces_role() is not null);
drop policy if exists fise_capacites_admin_write on __SCHEMA__.fise_capacites;
create policy fise_capacites_admin_write on __SCHEMA__.fise_capacites
  for all using (__SCHEMA__.caces_role() = 'admin') with check (__SCHEMA__.caces_role() = 'admin');

drop policy if exists fise_capacite_categories_read on __SCHEMA__.fise_capacite_categories;
create policy fise_capacite_categories_read on __SCHEMA__.fise_capacite_categories
  for select using (__SCHEMA__.caces_role() is not null);
drop policy if exists fise_capacite_categories_admin_write on __SCHEMA__.fise_capacite_categories;
create policy fise_capacite_categories_admin_write on __SCHEMA__.fise_capacite_categories
  for all using (__SCHEMA__.caces_role() = 'admin') with check (__SCHEMA__.caces_role() = 'admin');

-- Evaluations et avis FISE, suivi horometre : operationnel, formateurs/admin.
drop policy if exists fise_evaluations_formateur_all on __SCHEMA__.fise_evaluations;
drop policy if exists fise_evaluations_lecture on __SCHEMA__.fise_evaluations;
create policy fise_evaluations_lecture on __SCHEMA__.fise_evaluations
  for select using (__SCHEMA__.caces_role() is not null);
create policy fise_evaluations_formateur_all on __SCHEMA__.fise_evaluations
  for all using (__SCHEMA__.caces_est_formateur_de(__SCHEMA__.caces_session_du_stagiaire(stagiaire_id))) with check (__SCHEMA__.caces_est_formateur_de(__SCHEMA__.caces_session_du_stagiaire(stagiaire_id)));

drop policy if exists fise_avis_formateur_all on __SCHEMA__.fise_avis;
drop policy if exists fise_avis_lecture on __SCHEMA__.fise_avis;
create policy fise_avis_lecture on __SCHEMA__.fise_avis
  for select using (__SCHEMA__.caces_role() is not null);
create policy fise_avis_formateur_all on __SCHEMA__.fise_avis
  for all using (__SCHEMA__.caces_est_formateur_de(__SCHEMA__.caces_session_du_stagiaire(stagiaire_id))) with check (__SCHEMA__.caces_est_formateur_de(__SCHEMA__.caces_session_du_stagiaire(stagiaire_id)));

drop policy if exists suivi_horometre_formateur_all on __SCHEMA__.suivi_horometre;
drop policy if exists suivi_horometre_lecture on __SCHEMA__.suivi_horometre;
create policy suivi_horometre_lecture on __SCHEMA__.suivi_horometre
  for select using (__SCHEMA__.caces_role() is not null);
create policy suivi_horometre_formateur_all on __SCHEMA__.suivi_horometre
  for all using (__SCHEMA__.caces_est_formateur_de(__SCHEMA__.caces_session_du_stagiaire(stagiaire_id))) with check (__SCHEMA__.caces_est_formateur_de(__SCHEMA__.caces_session_du_stagiaire(stagiaire_id)));

-- Grants de table pour authenticated (la RLS ci-dessus fait le filtrage reel).
-- anon ne recoit aucun grant direct sur ces tables : tout passage stagiaire se
-- fera via des fonctions security definer dediees (backlog).
grant select, update on __SCHEMA__.formateurs to authenticated;
grant select, insert, update, delete on __SCHEMA__.referentiels, __SCHEMA__.categories_referentiel, __SCHEMA__.themes_referentiel to authenticated;
grant select, insert, update, delete on __SCHEMA__.questions_qcm to authenticated;
grant select, insert, update, delete on __SCHEMA__.sessions_formation to authenticated;
grant select, insert, update, delete on __SCHEMA__.session_categories to authenticated;
grant select, insert, update, delete on __SCHEMA__.stagiaires to authenticated;
grant select, insert, update, delete on __SCHEMA__.stagiaire_categories to authenticated;
grant select, insert, update, delete on __SCHEMA__.qcm_tirages to authenticated;
grant select, insert, update, delete on __SCHEMA__.qcm_tirage_questions to authenticated;
grant select, insert, update, delete on __SCHEMA__.criteres_pratique to authenticated;
grant select, insert, update, delete on __SCHEMA__.epreuves_pratique to authenticated;
grant select, insert, update, delete on __SCHEMA__.epreuve_pratique_resultats to authenticated;
grant select, insert, update, delete on __SCHEMA__.certificats to authenticated;
grant select, insert on __SCHEMA__.journal_audit to authenticated;
grant select, update on __SCHEMA__.parametres_application to authenticated;
grant select, insert, update, delete on __SCHEMA__.centres_examen to authenticated;
grant select, insert, update, delete on __SCHEMA__.testeur_specialisations to authenticated;
grant select, insert, update, delete on __SCHEMA__.fise_capacites to authenticated;
grant select, insert, update, delete on __SCHEMA__.fise_capacite_categories to authenticated;
grant select, insert, update, delete on __SCHEMA__.fise_evaluations to authenticated;
grant select, insert, update, delete on __SCHEMA__.fise_avis to authenticated;
grant select, insert, update, delete on __SCHEMA__.suivi_horometre to authenticated;

grant usage, select on all sequences in schema __SCHEMA__ to authenticated;

-- ----------------------------------------------------------------------------
-- 4. DONNEES DE REFERENCE (referentiels)
-- ----------------------------------------------------------------------------

insert into __SCHEMA__.referentiels (code, libelle, duree_validite_mois, seuil_reussite_global_pct, ut_theorique) values
  ('R485', 'Gerbeurs a conducteur accompagnant', 60, 70, 1),
  ('R489', 'Chariots de manutention automoteurs a conducteur porte', 60, 70, 1),
  ('R482A', 'Engins de chantier', 120, 70, 1),
  ('R486A', 'Plates-formes elevatrices mobiles de personnel (PEMP)', 60, 70, 1)
on conflict (code) do update set
  libelle = excluded.libelle,
  duree_validite_mois = excluded.duree_validite_mois,
  seuil_reussite_global_pct = excluded.seuil_reussite_global_pct,
  ut_theorique = excluded.ut_theorique;

-- ut_pratique : unite de test de l'epreuve pratique par categorie (annexes
-- A3/3 des recommandations respectives).
insert into __SCHEMA__.categories_referentiel (referentiel_code, code, libelle, ut_pratique) values
  ('R485', '1', 'Hauteur de levee 1,20 m a 2,50 m', 0.75),
  ('R485', '2', 'Hauteur de levee superieure a 2,50 m', 0.75),
  ('R489', '1A', 'Transpalettes et preparateurs de commande sans elevation', 0.5),
  ('R489', '1B', 'Gerbeurs a conducteur porte', 0.75),
  ('R489', '2A', 'Chariots a plateau porteur, capacite <= 2 t', 0.5),
  ('R489', '2B', 'Chariots tracteurs industriels, capacite de traction <= 25 t', 0.5),
  ('R489', '3', 'Chariots elevateurs frontaux en porte-a-faux, capacite <= 6 t', 1),
  ('R489', '4', 'Chariots elevateurs frontaux en porte-a-faux, capacite > 6 t', 1),
  ('R489', '5', 'Chariots elevateurs a mat retractable', 0.75),
  ('R489', '6', 'Chariots a poste de conduite elevable', 0.75),
  ('R489', '7', 'Conduite hors production', 0.75),
  ('R482A', 'A', 'Engins compacts', 1.5),
  ('R482A', 'B1', 'Engins d''extraction a deplacement sequentiel', 1),
  ('R482A', 'B2', 'Engins de sondage/forage a deplacement sequentiel', 1),
  ('R482A', 'B3', 'Engins rail-route a deplacement sequentiel', 1),
  ('R482A', 'C1', 'Engins de chargement a deplacement alternatif', 1),
  ('R482A', 'C2', 'Engins de reglage a deplacement alternatif', 1),
  ('R482A', 'C3', 'Engins de nivellement a deplacement alternatif', 1),
  ('R482A', 'D', 'Engins de compactage', 1),
  ('R482A', 'E', 'Engins de transport', 1),
  ('R482A', 'F', 'Chariots de manutention tout-terrain', 1),
  ('R482A', 'G', 'Conduite hors production', 1.2),
  ('R486A', 'A', 'PEMP a elevation verticale', 1),
  ('R486A', 'B', 'PEMP a elevation multidirectionnelle', 1),
  ('R486A', 'C', 'Conduite hors production', 1)
on conflict (referentiel_code, code) do update set
  libelle = excluded.libelle,
  ut_pratique = excluded.ut_pratique;

-- Agences (centres) : raison sociale/marque, coordonnees, signataire, cachet propre a chaque agence.
alter table __SCHEMA__.centres_examen add column if not exists telephone text;
alter table __SCHEMA__.centres_examen add column if not exists signataire text;
alter table __SCHEMA__.centres_examen add column if not exists signature_cachet_path text;
alter table __SCHEMA__.centres_examen add column if not exists email_secretariat text;
insert into __SCHEMA__.centres_examen (nom, agence, telephone, actif)
select 'Sèvremont', 'Bocage Formation Sécurité', '02 51 57 75 65', true
where not exists (select 1 from __SCHEMA__.centres_examen where nom = 'Sèvremont');
insert into __SCHEMA__.centres_examen (nom, agence, telephone, actif)
select 'Briec', 'Bretagne Formation Sécurité', '02 98 82 29 67', true
where not exists (select 1 from __SCHEMA__.centres_examen where nom = 'Briec');
update __SCHEMA__.centres_examen set actif = false where nom = 'Centre a definir'
  and exists (select 1 from __SCHEMA__.centres_examen where nom in ('Sèvremont','Briec'));

insert into __SCHEMA__.centres_examen (nom, actif) values
  ('Centre a definir', true)
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- ANTI-DOUBLONS DES DONNEES DE REFERENCE : rejouer ce script ne doit jamais dupliquer
-- les questions, les grilles pratiques ni le catalogue FISE. On nettoie d'abord les
-- doublons existants (en gardant la plus petite id et en y rattachant les donnees
-- deja saisies), puis on pose des index uniques qui rendent les "on conflict do
-- nothing" des seeds effectifs.
-- ----------------------------------------------------------------------------
-- Grilles pratiques : une ligne par (referentiel, categorie, ordre)
update __SCHEMA__.epreuve_pratique_resultats r set critere_id = k.keep
from (select id, min(id) over (partition by referentiel_code, categorie_code, ordre) as keep from __SCHEMA__.criteres_pratique) k
where r.critere_id = k.id and k.id <> k.keep
  and not exists (select 1 from __SCHEMA__.epreuve_pratique_resultats r2 where r2.epreuve_id = r.epreuve_id and r2.critere_id = k.keep);
delete from __SCHEMA__.epreuve_pratique_resultats r using (select id, min(id) over (partition by referentiel_code, categorie_code, ordre) as keep from __SCHEMA__.criteres_pratique) k
where r.critere_id = k.id and k.id <> k.keep;
delete from __SCHEMA__.criteres_pratique c using __SCHEMA__.criteres_pratique d
where c.id > d.id and c.referentiel_code = d.referentiel_code and c.categorie_code = d.categorie_code and c.ordre = d.ordre;
create unique index if not exists criteres_pratique_unique on __SCHEMA__.criteres_pratique (referentiel_code, categorie_code, ordre);

-- Catalogue FISE : une capacite par (referentiel, theme, ordre, libelle)
update __SCHEMA__.fise_evaluations e set capacite_id = k.keep
from (select id, min(id) over (partition by referentiel_code, theme_code, ordre, libelle) as keep from __SCHEMA__.fise_capacites) k
where e.capacite_id = k.id and k.id <> k.keep
  and not exists (select 1 from __SCHEMA__.fise_evaluations e2 where e2.stagiaire_id = e.stagiaire_id and e2.capacite_id = k.keep and e2.categorie_code = e.categorie_code);
insert into __SCHEMA__.fise_capacite_categories (capacite_id, categorie_code)
select k.keep, fc.categorie_code
from (select id, min(id) over (partition by referentiel_code, theme_code, ordre, libelle) as keep from __SCHEMA__.fise_capacites) k
join __SCHEMA__.fise_capacite_categories fc on fc.capacite_id = k.id
where k.id <> k.keep
on conflict do nothing;
delete from __SCHEMA__.fise_capacites c using __SCHEMA__.fise_capacites d
where c.id > d.id and c.referentiel_code = d.referentiel_code and c.theme_code = d.theme_code and c.ordre = d.ordre and c.libelle = d.libelle;
create unique index if not exists fise_capacites_unique on __SCHEMA__.fise_capacites (referentiel_code, theme_code, ordre, libelle);

-- Banque de questions : un code par theme. Les tirages deja faits sur des questions en
-- double sont rattaches a la question conservee (sinon la ligne en double est retiree).
update __SCHEMA__.qcm_tirage_questions t set question_id = k.keep
from (select id, min(id) over (partition by theme_id, code) as keep from __SCHEMA__.questions_qcm where code is not null) k
where t.question_id = k.id and k.id <> k.keep
  and not exists (select 1 from __SCHEMA__.qcm_tirage_questions t2 where t2.tirage_id = t.tirage_id and t2.question_id = k.keep);
delete from __SCHEMA__.qcm_tirage_questions t using (select id, min(id) over (partition by theme_id, code) as keep from __SCHEMA__.questions_qcm where code is not null) k
where t.question_id = k.id and k.id <> k.keep;
delete from __SCHEMA__.questions_qcm q using __SCHEMA__.questions_qcm d
where q.id > d.id and q.theme_id = d.theme_id and q.code = d.code and q.code is not null;
create unique index if not exists questions_qcm_unique on __SCHEMA__.questions_qcm (theme_id, code);

-- Exemple de catalogue FISE (R489 categories 1B/3/5, d'apres le modele fourni)
-- - a completer pour les autres referentiels/categories depuis l'ecran admin.
insert into __SCHEMA__.fise_capacites (referentiel_code, theme_code, theme_libelle, libelle, ordre) values
  ('R489', 'reglementation_prevention', 'Connaissances reglementaires et prevention', 'Connaitre les responsabilites de l''employeur et du cariste', 1),
  ('R489', 'reglementation_prevention', 'Connaissances reglementaires et prevention', 'Identifier les principaux risques lies a l''utilisation du chariot', 2),
  ('R489', 'reglementation_prevention', 'Connaissances reglementaires et prevention', 'Identifier les regles de circulation dans l''entreprise', 3),
  ('R489', 'reglementation_prevention', 'Connaissances reglementaires et prevention', 'Interpreter les pictogrammes de securite', 4),
  ('R489', 'technologie_prise_poste', 'Technologie, verifications et prise de poste du chariot', 'Identifier les documents obligatoires du chariot', 5),
  ('R489', 'technologie_prise_poste', 'Technologie, verifications et prise de poste du chariot', 'Identifier les principaux organes du chariot', 6),
  ('R489', 'technologie_prise_poste', 'Technologie, verifications et prise de poste du chariot', 'Identifier et controler les dispositifs de securite', 7),
  ('R489', 'technologie_prise_poste', 'Technologie, verifications et prise de poste du chariot', 'Lire une plaque de charge et verifier l''adequation', 8),
  ('R489', 'technologie_prise_poste', 'Technologie, verifications et prise de poste du chariot', 'Comprendre les facteurs influencant la stabilite', 9),
  ('R489', 'technologie_prise_poste', 'Technologie, verifications et prise de poste du chariot', 'Prendre le poste en securite', 10),
  ('R489', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Monter et descendre du chariot en securite', 11),
  ('R489', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Circuler en marche avant et arriere', 12),
  ('R489', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Adapter la vitesse aux conditions', 13),
  ('R489', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Circuler avec charge limitant la visibilite', 14),
  ('R489', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Circuler sur plan incline / pont de liaison', 15),
  ('R489', 'manutention_charges', 'Manutention des charges', 'Prendre une charge au sol', 16),
  ('R489', 'manutention_charges', 'Manutention des charges', 'Deposer une charge au sol', 17),
  ('R489', 'manutention_charges', 'Manutention des charges', 'Realiser un gerbage', 18),
  ('R489', 'manutention_charges', 'Manutention des charges', 'Realiser un degerbage', 19),
  ('R489', 'manutention_charges', 'Manutention des charges', 'Effectuer stockage / destockage en palettier', 20),
  ('R489', 'manutention_charges', 'Manutention des charges', 'Chargement / dechargement camion', 21),
  ('R489', 'manutention_charges', 'Manutention des charges', 'Charge haute', 22)
on conflict do nothing;

insert into __SCHEMA__.fise_capacite_categories (capacite_id, categorie_code)
select c.id, cat
from __SCHEMA__.fise_capacites c
cross join unnest(array['1B','3','5']) as cat
where c.referentiel_code = 'R489'
on conflict do nothing;

-- Selectivite par categorie (cases grisees du PDF officiel = capacite non
-- evaluee pour cette categorie precise, releve pixel par pixel des
-- rectangles gris du document source) : l'insertion ci-dessus rattache par
-- defaut chaque capacite aux 3 categories, on retire ici les 7 exceptions.
-- Avantage de la version numerique sur le papier (rassemble tout sur une
-- seule fiche) : l'ecran FISE ne montre plus que les capacites pertinentes
-- pour la categorie realmente en cours d'evaluation.
delete from __SCHEMA__.fise_capacite_categories fcc
using __SCHEMA__.fise_capacites fc
where fcc.capacite_id = fc.id
  and fc.referentiel_code = 'R489'
  and (
    (fc.ordre = 14 and fcc.categorie_code = '1B') or                    -- Circuler avec charge limitant la visibilite : non evalue en 1B
    (fc.ordre = 15 and fcc.categorie_code in ('1B', '5')) or            -- Circuler sur plan incline / pont de liaison : non evalue en 1B/5
    (fc.ordre = 21 and fcc.categorie_code in ('1B', '5')) or            -- Chargement / dechargement camion : non evalue en 1B/5
    (fc.ordre = 22 and fcc.categorie_code in ('1B', '3'))               -- Charge haute : non evalue en 1B/3
  );

-- ----------------------------------------------------------------------------
-- 6. GRILLES PRATIQUES OFFICIELLES (recopiees telles quelles depuis les
-- referentiels CNAMTS/INRS fournis, une categorie representative par
-- referentiel : R485 cat.1/cat.2 (grille identique), R489 cat.3, R482A cat.A
-- (colonne "pelle hydraulique"), R486A cat.A. Les autres categories de chaque
-- referentiel ont leur propre grille dans le PDF source, non encore
-- recopiee : a completer depuis l'ecran admin (table editable). Le flag
-- "eliminatoire" sur R482A est une mise en correspondance approximative avec
-- les 5 criteres eliminatoires officiels (p.35) qui ne sont pas nommement
-- rattaches a un point precis dans la grille - a valider par un formateur.
-- ----------------------------------------------------------------------------

-- R485 - grille identique cat.1 et cat.2 (100 pts), sauf hauteur H du
-- palettier au point 8 (H>=2,10m cat.1 / H>=3,30m cat.2), mentionnee dans le
-- libelle du premier critere du point concerne.
insert into __SCHEMA__.criteres_pratique (referentiel_code, categorie_code, theme_code, libelle, bareme_points, eliminatoire, ordre) values
  ('R485', '1', 'prise_poste', 'Notice d''instructions (justifier une interdiction d''emploi ou une regle d''utilisation)', 1, false, 1),
  ('R485', '1', 'prise_poste', 'Rapport de verification generale periodique, de mise ou de remise en service (absence d''observation ou de restriction d''usage)', 1, false, 2),
  ('R485', '1', 'prise_poste', 'Proceder a une verification visuelle du gerbeur', 2, false, 3),
  ('R485', '1', 'prise_poste', 'Verifier le bon fonctionnement des mecanismes et des dispositifs de securite', 6, false, 4),
  ('R485', '1', 'prise_poste', 'Verifier l''adequation des parametres de vitesse maxi, acceleration et freinage', 2, false, 5),
  ('R485', '1', 'prise_poste', 'Exploiter la plaque de charge et determiner la charge autorisee aux differentes hauteurs accessibles', 6, false, 6),
  ('R485', '1', 'prise_poste', 'Determiner la masse a vide du gerbeur', 2, false, 7),
  ('R485', '1', 'conduite', 'Circuler a vide (marche avant/arriere, ligne droite/virage, arret) - evalue en continu', 15, false, 8),
  ('R485', '1', 'conduite', 'Circuler en charge (marche avant/arriere, ligne droite/virage, arret) - evalue en continu', 15, false, 9),
  ('R485', '1', 'manoeuvres', 'Prise/depose au sol : s''assurer de l''adequation du gerbeur a la manutention a realiser', 3, false, 10),
  ('R485', '1', 'manoeuvres', 'Prise/depose au sol : positionner le gerbeur pour la prise / positionner la palette sur la fourche', 1, false, 11),
  ('R485', '1', 'manoeuvres', 'Prise/depose au sol : verifier le lieu de depose / deposer la palette avec precision', 2, false, 12),
  ('R485', '1', 'manoeuvres', 'Gerbage/degerbage (>=3 charges) : s''assurer de l''adequation du gerbeur a la manutention', 3, false, 13),
  ('R485', '1', 'manoeuvres', 'Gerbage/degerbage : apprecier le nombre maximal de niveaux empilables selon les charges', 1, false, 14),
  ('R485', '1', 'manoeuvres', 'Gerbage/degerbage : positionner le gerbeur face aux charges / positionner les charges sur la fourche', 1, false, 15),
  ('R485', '1', 'manoeuvres', 'Gerbage/degerbage : empiler les charges avec precision sans compromettre la stabilite de la pile', 2, false, 16),
  ('R485', '1', 'manoeuvres', 'Gerbage/degerbage : depiler les charges et les deposer a l''endroit prevu', 2, false, 17),
  ('R485', '1', 'manoeuvres', 'Stockage/destockage sur palettier (H >= 2,10 m, 3 palettes, tous niveaux) : adequation du gerbeur', 3, false, 18),
  ('R485', '1', 'manoeuvres', 'Stockage/destockage : s''assurer du bon etat du palettier et de son adequation aux charges', 3, false, 19),
  ('R485', '1', 'manoeuvres', 'Stockage/destockage : localiser les emplacements definis / evaluer les risques selon les charges', 2, false, 20),
  ('R485', '1', 'manoeuvres', 'Stockage/destockage : verifier les charges (etat de la palette, conditionnement, stabilite)', 1, false, 21),
  ('R485', '1', 'manoeuvres', 'Stockage/destockage : positionner le gerbeur / prendre et deposer les charges sans heurts', 2, false, 22),
  ('R485', '1', 'manoeuvres', 'Stockage/destockage : destocker les charges et les deposer a l''endroit prevu', 2, false, 23),
  ('R485', '1', 'manoeuvres', 'Chargement/dechargement vehicule : adequation du gerbeur et du vehicule a la manutention', 3, false, 24),
  ('R485', '1', 'manoeuvres', 'Chargement/dechargement : etat du hayon, du quai niveleur ou du pont de liaison / adequation', 3, false, 25),
  ('R485', '1', 'manoeuvres', 'Chargement/dechargement : mettre en place le hayon, le quai niveleur ou le pont de liaison', 2, false, 26),
  ('R485', '1', 'manoeuvres', 'Chargement/dechargement : adapter la vitesse et la trajectoire du gerbeur', 2, false, 27),
  ('R485', '1', 'manoeuvres', 'Chargement/dechargement : prendre et deposer 3 charges conformement au plan de chargement', 2, false, 28),
  ('R485', '1', 'manoeuvres', 'Chargement/dechargement : decharger le vehicule et deposer les charges a l''endroit prevu', 2, false, 29),
  ('R485', '1', 'fin_poste', 'Realiser les operations de fin de poste', 2, false, 30),
  ('R485', '1', 'fin_poste', 'Realiser les operations de maintenance journaliere', 3, false, 31),
  ('R485', '1', 'fin_poste', 'Rendre compte des anomalies relevees', 3, false, 32)
on conflict do nothing;
insert into __SCHEMA__.criteres_pratique (referentiel_code, categorie_code, theme_code, libelle, bareme_points, eliminatoire, ordre)
select 'R485', '2', theme_code,
  case when ordre = 18 then 'Stockage/destockage sur palettier (H >= 3,30 m, 3 palettes, tous niveaux) : adequation du gerbeur' else libelle end,
  bareme_points, eliminatoire, ordre
from __SCHEMA__.criteres_pratique
where referentiel_code = 'R485' and categorie_code = '1'
on conflict do nothing;

-- R489 - categorie 3 (chariots elevateurs frontaux en porte-a-faux, capacite <=6t)
insert into __SCHEMA__.criteres_pratique (referentiel_code, categorie_code, theme_code, libelle, bareme_points, eliminatoire, ordre) values
  ('R489', '3', 'prise_poste', 'Notice d''instructions (justifier une interdiction d''emploi ou une regle d''utilisation)', 1, false, 1),
  ('R489', '3', 'prise_poste', 'Rapport de verification generale periodique, de mise ou de remise en service', 1, false, 2),
  ('R489', '3', 'prise_poste', 'Proceder a une verification visuelle du chariot', 3, false, 3),
  ('R489', '3', 'prise_poste', 'Effectuer les differents reglages relatifs au poste de conduite', 2, false, 4),
  ('R489', '3', 'prise_poste', 'Verifier le bon fonctionnement des mecanismes et des dispositifs de securite', 3, false, 5),
  ('R489', '3', 'conduite', 'Circuler a vide (marche avant/arriere, ligne droite/virage, arret) - evalue en continu', 8, false, 6),
  ('R489', '3', 'conduite', 'Circuler en charge (marche avant/arriere, ligne droite/virage, arret) - evalue en continu', 8, false, 7),
  ('R489', '3', 'conduite', 'Circuler en securite, s''arreter et redemarrer sur un plan incline et/ou un devers, en charge', 4, false, 8),
  ('R489', '3', 'manoeuvres', 'Prise/depose au sol : adequation du chariot a la manutention a realiser', 3, false, 9),
  ('R489', '3', 'manoeuvres', 'Prise/depose au sol : positionner le chariot pour la prise / positionner la palette sur la fourche', 3, false, 10),
  ('R489', '3', 'manoeuvres', 'Prise/depose au sol : deposer la palette avec precision a l''endroit prevu', 2, false, 11),
  ('R489', '3', 'manoeuvres', 'Gerbage/degerbage (>=3 charges) : adequation du chariot a la manutention', 3, false, 12),
  ('R489', '3', 'manoeuvres', 'Gerbage/degerbage : apprecier le nombre maximal de niveaux empilables selon les charges', 3, false, 13),
  ('R489', '3', 'manoeuvres', 'Gerbage/degerbage : positionner le chariot face aux charges / positionner les charges sur la fourche', 3, false, 14),
  ('R489', '3', 'manoeuvres', 'Gerbage/degerbage : empiler les charges avec precision sans compromettre la stabilite de la pile', 3, false, 15),
  ('R489', '3', 'manoeuvres', 'Gerbage/degerbage : depiler les charges et les deposer a l''endroit prevu', 2, false, 16),
  ('R489', '3', 'manoeuvres', 'Stockage/destockage (3 palettes, 3 niveaux, jusqu''a 3,30 m mini) : adequation du chariot', 3, false, 17),
  ('R489', '3', 'manoeuvres', 'Stockage/destockage : localiser les emplacements definis / evaluer les risques selon les charges', 3, false, 18),
  ('R489', '3', 'manoeuvres', 'Stockage/destockage : verifier les charges (etat, conditionnement, stabilite)', 3, false, 19),
  ('R489', '3', 'manoeuvres', 'Stockage/destockage : positionner le chariot / prendre et deposer les charges sans heurts', 3, false, 20),
  ('R489', '3', 'manoeuvres', 'Stockage/destockage : destocker les charges et les deposer a l''endroit prevu', 2, false, 21),
  ('R489', '3', 'manoeuvres', 'Chargement/dechargement vehicule depuis le sol : adequation du chariot a la manutention', 3, false, 22),
  ('R489', '3', 'manoeuvres', 'Chargement/dechargement : position appropriee du vehicule / conditions autorisant l''operation', 3, false, 23),
  ('R489', '3', 'manoeuvres', 'Chargement/dechargement : deposer au moins 3 charges en equilibrant le chargement', 3, false, 24),
  ('R489', '3', 'manoeuvres', 'Chargement/dechargement : decharger le vehicule et deposer les charges a l''endroit prevu', 2, false, 25),
  ('R489', '3', 'manoeuvres', 'Charge longue/conteneur liquide/charge deformable : adequation du chariot a la manutention', 3, false, 26),
  ('R489', '3', 'manoeuvres', 'Charge longue : definir la methode de prise et de manutention de la charge', 2, false, 27),
  ('R489', '3', 'manoeuvres', 'Charge longue : mettre en oeuvre les moyens adaptes / deposer chaque charge avec precision', 3, false, 28),
  ('R489', '3', 'fin_poste', 'Realiser les operations de fin de poste', 5, false, 29),
  ('R489', '3', 'fin_poste', 'Realiser les operations de maintenance journaliere', 5, false, 30),
  ('R489', '3', 'fin_poste', 'Rendre compte des anomalies relevees', 5, false, 31)
on conflict do nothing;

-- R482A - categorie A (engins compacts), colonne "pelle hydraulique" (PH) de
-- la grille officielle (l'autre colonne, motobasculeur/chargeuse/compacteur,
-- differe sur les themes 2 et 3 et n'est pas recopiee ici).
insert into __SCHEMA__.criteres_pratique (referentiel_code, categorie_code, theme_code, libelle, bareme_points, eliminatoire, ordre) values
  ('R482A', 'A', 'prise_poste', 'Notice d''instructions (justifier une interdiction d''emploi ou une regle d''utilisation)', 1, false, 1),
  ('R482A', 'A', 'prise_poste', 'Rapport de verification generale periodique, de mise ou de remise en service', 1, false, 2),
  ('R482A', 'A', 'prise_poste', 'Proceder a une verification visuelle de l''engin de chantier', 1, false, 3),
  ('R482A', 'A', 'prise_poste', 'Identifier les niveaux et les appoints journaliers', 1, false, 4),
  ('R482A', 'A', 'prise_poste', 'Acceder au poste de conduite en securite (regle des 3 points d''appui)', 1, true, 5),
  ('R482A', 'A', 'prise_poste', 'Effectuer les operations necessaires pour assurer la visibilite depuis le poste de conduite', 2, false, 6),
  ('R482A', 'A', 'prise_poste', 'Effectuer le reglage du siege (position et suspension)', 1, false, 7),
  ('R482A', 'A', 'prise_poste', 'Demarrer l''engin en respectant le mode operatoire prescrit', 2, false, 8),
  ('R482A', 'A', 'prise_poste', 'Verifier le bon fonctionnement des organes de service et des indicateurs du tableau de bord', 1, false, 9),
  ('R482A', 'A', 'prise_poste', 'Verifier le bon fonctionnement des dispositifs de securite', 2, false, 10),
  ('R482A', 'A', 'prise_poste', 'Identifier la position de l''issue de secours et savoir expliquer sa mise en oeuvre', 1, false, 11),
  ('R482A', 'A', 'conduite_circulation', 'Effectuer les manoeuvres avec souplesse et precision', 4, false, 12),
  ('R482A', 'A', 'conduite_circulation', 'Verifier au prealable l''environnement de travail', 3, false, 13),
  ('R482A', 'A', 'conduite_circulation', 'Garantir la securite des pietons (vision en marche arriere, avertisseur sonore)', 3, true, 14),
  ('R482A', 'A', 'conduite_circulation', 'Respecter les conditions de stabilite de l''engin', 3, true, 15),
  ('R482A', 'A', 'conduite_circulation', 'Maitriser la selection des vitesses', 1, false, 16),
  ('R482A', 'A', 'conduite_circulation', 'Utiliser correctement les dispositifs de freinage', 3, false, 17),
  ('R482A', 'A', 'conduite_circulation', 'Recourir de facon appropriee aux aides a la conduite disponibles', 3, false, 18),
  ('R482A', 'A', 'conduite_circulation', 'Respecter les regles et panneaux de circulation', 2, false, 19),
  ('R482A', 'A', 'travaux_base', 'Charger une unite de transport', 8, false, 20),
  ('R482A', 'A', 'travaux_base', 'Effectuer une operation de deblai/remblai avec mise en stock', 8, false, 21),
  ('R482A', 'A', 'travaux_base', 'Realiser une tranchee', 8, false, 22),
  ('R482A', 'A', 'operation_levage', 'Verifier la presence des dispositifs de securite', 4, true, 23),
  ('R482A', 'A', 'operation_levage', 'S''assurer de l''adequation de l''engin a la manutention a realiser', 4, false, 24),
  ('R482A', 'A', 'operation_levage', 'Determiner sur l''abaque de charge les charges/portees autorisees', 4, false, 25),
  ('R482A', 'A', 'operation_levage', 'Effectuer l''operation de levage (prise et depose d''une charge au sol)', 4, false, 26),
  ('R482A', 'A', 'chargement_porte_engins', 'Chargement : adequation de l''engin et du porte-engins a la manoeuvre prevue', 1, false, 27),
  ('R482A', 'A', 'chargement_porte_engins', 'Chargement : position appropriee du vehicule', 1, false, 28),
  ('R482A', 'A', 'chargement_porte_engins', 'Chargement : conditions permettant le chargement/dechargement remplies (espacement des rampes)', 1, false, 29),
  ('R482A', 'A', 'chargement_porte_engins', 'Chargement : monter l''engin sur le porte-engins dans le sens approprie', 2, false, 30),
  ('R482A', 'A', 'chargement_porte_engins', 'Preparation transport : positionner l''engin pour assurer l''equilibre et la stabilite', 1, false, 31),
  ('R482A', 'A', 'chargement_porte_engins', 'Preparation transport : mettre les equipements en position de transport', 1, false, 32),
  ('R482A', 'A', 'chargement_porte_engins', 'Preparation transport : stabiliser l''engin (frein, stabilisateurs, cales)', 1, false, 33),
  ('R482A', 'A', 'chargement_porte_engins', 'Arrimage : identifier et designer les points d''arrimage sur le porte-engins', 1, false, 34),
  ('R482A', 'A', 'chargement_porte_engins', 'Arrimage : identifier et designer les points d''arrimage sur l''engin', 1, false, 35),
  ('R482A', 'A', 'chargement_porte_engins', 'Arrimage : trouver le mode d''arrimage approprie (notice d''instructions)', 1, false, 36),
  ('R482A', 'A', 'chargement_porte_engins', 'Arrimage : s''assurer de l''adequation des moyens d''arrimage proposes', 1, false, 37),
  ('R482A', 'A', 'chargement_porte_engins', 'Dechargement : s''assurer que l''environnement du porte-engins permet le dechargement', 1, false, 38),
  ('R482A', 'A', 'chargement_porte_engins', 'Dechargement : positionner l''engin pour la descente', 1, false, 39),
  ('R482A', 'A', 'chargement_porte_engins', 'Dechargement : descendre l''engin en securite', 2, false, 40),
  ('R482A', 'A', 'fin_poste', 'Stationner l''engin en securite', 2, false, 41),
  ('R482A', 'A', 'fin_poste', 'Positionner les equipements de facon appropriee', 1, false, 42),
  ('R482A', 'A', 'fin_poste', 'Mettre en oeuvre les securites', 1, false, 43),
  ('R482A', 'A', 'fin_poste', 'Arreter le moteur de l''engin en respectant le mode operatoire prescrit', 1, true, 44),
  ('R482A', 'A', 'fin_poste', 'Quitter le poste de conduite en securite (regle des 3 points d''appui)', 2, true, 45),
  ('R482A', 'A', 'fin_poste', 'Mettre l''engin a l''arret', 1, false, 46)
on conflict do nothing;

-- R486A - categorie A (PEMP types 1 et 3 a elevation verticale)
insert into __SCHEMA__.criteres_pratique (referentiel_code, categorie_code, theme_code, libelle, bareme_points, eliminatoire, ordre) values
  ('R486A', 'A', 'prise_poste', 'Notice d''instructions (justifier une interdiction d''emploi ou une regle d''utilisation)', 2, false, 1),
  ('R486A', 'A', 'prise_poste', 'Rapport de verification generale periodique, de mise ou de remise en service', 2, false, 2),
  ('R486A', 'A', 'prise_poste', 'Proceder a une verification visuelle de la PEMP', 4, false, 3),
  ('R486A', 'A', 'prise_poste', 'Verifier le bon fonctionnement des mecanismes et des dispositifs de securite accessibles', 5, false, 4),
  ('R486A', 'A', 'prise_poste', 'Evaluer les conditions meteorologiques', 2, false, 5),
  ('R486A', 'A', 'adequation', 'Verifier l''adequation de la PEMP aux operations a effectuer', 3, false, 6),
  ('R486A', 'A', 'adequation', 'Identifier les risques lies a la zone d''evolution', 3, false, 7),
  ('R486A', 'A', 'mise_place_1a', 'Baliser la zone d''intervention', 2, false, 8),
  ('R486A', 'A', 'mise_place_1a', 'Deployer les stabilisateurs', 3, false, 9),
  ('R486A', 'A', 'mise_place_1a', 'Regler l''horizontalite de la PEMP', 3, false, 10),
  ('R486A', 'A', 'mise_place_1a', 'Replier les stabilisateurs', 3, false, 11),
  ('R486A', 'A', 'mise_place_1a', 'Effectuer les manoeuvres avec souplesse et precision (evalue en continu)', 3, false, 12),
  ('R486A', 'A', 'mise_place_1a', 'Comprendre / executer les gestes de commandement (evalue en continu)', 3, false, 13),
  ('R486A', 'A', 'mise_place_1a', 'Savoir reagir a un signal d''alerte (evalue en continu)', 3, false, 14),
  ('R486A', 'A', 'mise_place_1a', 'Positionner la PEMP a un emplacement precis (aire limitee au sol)', 3, false, 15),
  ('R486A', 'A', 'mise_place_1a', 'Positionner la PEMP le long d''une paroi plane verticale', 3, false, 16),
  ('R486A', 'A', 'mise_place_1a', 'Deplacer la plate-forme le long d''une paroi plane verticale', 3, false, 17),
  ('R486A', 'A', 'mise_place_1a', 'Positionner la plate-forme sous une paroi plane horizontale', 3, false, 18),
  ('R486A', 'A', 'mise_place_1a', 'Effectuer les manoeuvres de secours (commandes de secours et de depannage)', 3, true, 19),
  ('R486A', 'A', 'conduite_3a', 'Adapter sa conduite aux conditions de circulation (encombrement, virage, obstacle, sol)', 2, false, 20),
  ('R486A', 'A', 'conduite_3a', 'Effectuer les manoeuvres avec souplesse et precision', 2, false, 21),
  ('R486A', 'A', 'conduite_3a', 'Regarder en arriere avant de reculer', 3, true, 22),
  ('R486A', 'A', 'conduite_3a', 'Utiliser correctement l''avertisseur sonore', 1, false, 23),
  ('R486A', 'A', 'conduite_3a', 'Respecter les regles et panneaux de circulation', 1, false, 24),
  ('R486A', 'A', 'conduite_3a', 'Comprendre / executer les gestes de commandement', 1, false, 25),
  ('R486A', 'A', 'conduite_3a', 'Savoir reagir a un signal d''alerte', 1, false, 26),
  ('R486A', 'A', 'conduite_3a', 'Positionner la PEMP a un emplacement precis (aire limitee au sol)', 2, false, 27),
  ('R486A', 'A', 'conduite_3a', 'Circuler plate-forme en position haute, dans le sens de la marche', 4, false, 28),
  ('R486A', 'A', 'conduite_3a', 'Circuler plate-forme en position haute, dans le sens inverse de la marche', 4, false, 29),
  ('R486A', 'A', 'conduite_3a', 'Positionner la PEMP le long d''une paroi plane verticale', 2, false, 30),
  ('R486A', 'A', 'conduite_3a', 'Deplacer la PEMP / la plate-forme le long d''une paroi plane verticale', 2, false, 31),
  ('R486A', 'A', 'conduite_3a', 'Positionner la plate-forme sous une paroi plane horizontale', 2, false, 32),
  ('R486A', 'A', 'conduite_3a', 'Deplacer la plate-forme sous une paroi plane horizontale', 2, false, 33),
  ('R486A', 'A', 'conduite_3a', 'Positionner la plate-forme a un emplacement precis en elevation', 2, false, 34),
  ('R486A', 'A', 'conduite_3a', 'Effectuer les manoeuvres de secours (commandes de secours et de depannage)', 3, true, 35),
  ('R486A', 'A', 'fin_poste', 'Mettre la PEMP en position hors-service', 5, false, 36),
  ('R486A', 'A', 'fin_poste', 'Realiser les operations de maintenance journaliere', 3, false, 37),
  ('R486A', 'A', 'fin_poste', 'Rendre compte des anomalies relevees', 2, false, 38)
on conflict do nothing;

-- Catalogue FISE R485 (gerbeur), applicable aux 2 categories - enrichi depuis l'Annexe 2 du referentiel
insert into __SCHEMA__.fise_capacites (referentiel_code, theme_code, theme_libelle, libelle, ordre) values
  ('R485', 'reglementation_prevention', 'Connaissances reglementaires et prevention', 'Connaitre les responsabilites de l''employeur et du conducteur', 1),
  ('R485', 'reglementation_prevention', 'Connaissances reglementaires et prevention', 'Identifier les principaux risques lies a l''utilisation du gerbeur', 2),
  ('R485', 'reglementation_prevention', 'Connaissances reglementaires et prevention', 'Identifier les regles de circulation dans l''entreprise', 3),
  ('R485', 'reglementation_prevention', 'Connaissances reglementaires et prevention', 'Interpreter les pictogrammes de securite', 4),
  ('R485', 'technologie_prise_poste', 'Technologie, verifications et prise de poste', 'Utiliser la notice d''instructions et le rapport de verification', 5),
  ('R485', 'technologie_prise_poste', 'Technologie, verifications et prise de poste', 'Verifier visuellement l''etat general du gerbeur', 6),
  ('R485', 'technologie_prise_poste', 'Technologie, verifications et prise de poste', 'Verifier les dispositifs de securite', 7),
  ('R485', 'technologie_prise_poste', 'Technologie, verifications et prise de poste', 'Verifier le branchement et l''etat de charge de la batterie', 8),
  ('R485', 'technologie_prise_poste', 'Technologie, verifications et prise de poste', 'Lire une plaque de charge et verifier l''adequation', 9),
  ('R485', 'technologie_prise_poste', 'Technologie, verifications et prise de poste', 'Prendre le poste en securite', 10),
  ('R485', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Monter et descendre du gerbeur en securite', 11),
  ('R485', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Circuler en marche avant et arriere a vide', 12),
  ('R485', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Circuler en marche avant et arriere en charge', 13),
  ('R485', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Adapter la vitesse selon la charge, le sol et le trajet', 14),
  ('R485', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Circuler avec une charge limitant la visibilite', 15),
  ('R485', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Identifier les risques de la zone d''evolution et choisir le parcours', 16),
  ('R485', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Stationner et arreter le gerbeur en securite', 17),
  ('R485', 'manutention_charges', 'Manutention des charges', 'Controler l''abaque / le tableau de charges', 18),
  ('R485', 'manutention_charges', 'Manutention des charges', 'Prendre et deposer une charge au sol', 19),
  ('R485', 'manutention_charges', 'Manutention des charges', 'Realiser un gerbage et un degerbage', 20),
  ('R485', 'manutention_charges', 'Manutention des charges', 'Effectuer stockage / destockage en palettier', 21),
  ('R485', 'manutention_charges', 'Manutention des charges', 'Charger / decharger un quai (pont de liaison)', 22),
  ('R485', 'manutention_charges', 'Manutention des charges', 'Charger / decharger avec hayon', 23),
  ('R485', 'manutention_charges', 'Manutention des charges', 'Manutentionner une charge longue, liquide ou deformable', 24),
  ('R485', 'fin_poste', 'Fin de poste', 'Effectuer l''entretien journalier du gerbeur', 25),
  ('R485', 'fin_poste', 'Fin de poste', 'Verifier les niveaux, faire les appoints et remettre en charge', 26),
  ('R485', 'fin_poste', 'Fin de poste', 'Rendre compte des anomalies constatees', 27)
on conflict do nothing;
insert into __SCHEMA__.fise_capacite_categories (capacite_id, categorie_code)
select c.id, cat from __SCHEMA__.fise_capacites c cross join unnest(array['1','2']) as cat
where c.referentiel_code = 'R485' on conflict do nothing;

-- Catalogue FISE R482A (engin de chantier) - ventile sur les 11 categories (A/B1/B2/B3/C1/C2/C3/D/E/F/G)
-- d'apres les fiches d'evaluation pratique A3|2|1 a A3|2|11 (chaque categorie correspond a une
-- famille d'engins et de travaux specifiques : pelle=tranchee/forage, chargeuse=deblai-remblai,
-- compacteur=compactage, tombereau=transport, chariot tout-terrain=manutention, etc.)
insert into __SCHEMA__.fise_capacites (referentiel_code, theme_code, theme_libelle, libelle, ordre) values
  ('R482A', 'reglementation_prevention', 'Connaissances reglementaires et prevention', 'Connaitre les responsabilites de l''employeur et du conducteur', 1),
  ('R482A', 'reglementation_prevention', 'Connaissances reglementaires et prevention', 'Identifier les principaux risques lies a l''utilisation de l''engin', 2),
  ('R482A', 'reglementation_prevention', 'Connaissances reglementaires et prevention', 'Identifier les regles de circulation sur chantier', 3),
  ('R482A', 'reglementation_prevention', 'Connaissances reglementaires et prevention', 'Interpreter la signalisation et le balisage de chantier', 4),
  ('R482A', 'technologie_prise_poste', 'Technologie, verifications et prise de poste', 'Utiliser la notice d''instructions et le rapport de verification periodique', 5),
  ('R482A', 'technologie_prise_poste', 'Technologie, verifications et prise de poste', 'Proceder a une verification visuelle de l''engin', 6),
  ('R482A', 'technologie_prise_poste', 'Technologie, verifications et prise de poste', 'Verifier les niveaux et realiser les appoints journaliers', 7),
  ('R482A', 'technologie_prise_poste', 'Technologie, verifications et prise de poste', 'Verifier le bon fonctionnement des dispositifs de securite', 8),
  ('R482A', 'technologie_prise_poste', 'Technologie, verifications et prise de poste', 'Regler le siege et assurer la visibilite depuis le poste de conduite', 9),
  ('R482A', 'technologie_prise_poste', 'Technologie, verifications et prise de poste', 'Demarrer l''engin et verifier les indicateurs du tableau de bord', 10),
  ('R482A', 'technologie_prise_poste', 'Technologie, verifications et prise de poste', 'Identifier l''issue de secours et savoir l''utiliser', 11),
  ('R482A', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Monter et descendre de l''engin selon la regle des 3 appuis', 12),
  ('R482A', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Circuler en marche avant et arriere, a vide et en charge', 13),
  ('R482A', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Adapter la vitesse selon la charge, le sol et le trajet', 14),
  ('R482A', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Garantir la securite des pietons et respecter les distances', 15),
  ('R482A', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Utiliser correctement les dispositifs de freinage et les aides a la conduite', 16),
  ('R482A', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Stationner et arreter l''engin en securite', 17),
  ('R482A', 'travaux_specifiques', 'Travaux specifiques a la categorie', 'Charger une unite de transport', 18),
  ('R482A', 'travaux_specifiques', 'Travaux specifiques a la categorie', 'Effectuer une operation de deblai/remblai avec mise en stock', 19),
  ('R482A', 'travaux_specifiques', 'Travaux specifiques a la categorie', 'Realiser une tranchee', 20),
  ('R482A', 'travaux_specifiques', 'Travaux specifiques a la categorie', 'Vider une benne en securite', 21),
  ('R482A', 'travaux_specifiques', 'Travaux specifiques a la categorie', 'Effectuer le compactage d''une plate-forme ou d''une piste', 22),
  ('R482A', 'travaux_specifiques', 'Travaux specifiques a la categorie', 'Approcher un talus', 23),
  ('R482A', 'travaux_specifiques', 'Travaux specifiques a la categorie', 'Realiser un forage', 24),
  ('R482A', 'travaux_specifiques', 'Travaux specifiques a la categorie', 'Effectuer les manoeuvres d''enraillement / derailement', 25),
  ('R482A', 'travaux_specifiques', 'Travaux specifiques a la categorie', 'Realiser le reglage d''une plate-forme ou d''une piste', 26),
  ('R482A', 'travaux_specifiques', 'Travaux specifiques a la categorie', 'Realiser le reglage d''un talus ou d''un fosse a la lame deportee', 27),
  ('R482A', 'travaux_specifiques', 'Travaux specifiques a la categorie', 'Positionner un tombereau, charger et vider la benne en securite', 28),
  ('R482A', 'travaux_specifiques', 'Travaux specifiques a la categorie', 'Maitriser les vitesses et le freinage sur un parcours en charge', 29),
  ('R482A', 'travaux_specifiques', 'Travaux specifiques a la categorie', 'Verifier l''adequation du chariot a la charge sur l''abaque', 30),
  ('R482A', 'travaux_specifiques', 'Travaux specifiques a la categorie', 'Charger/decharger un vehicule et manutentionner des charges longues, lourdes ou complexes', 31),
  ('R482A', 'travaux_specifiques', 'Travaux specifiques a la categorie', 'Realiser une operation de levage a l''aide d''elingues', 32),
  ('R482A', 'travaux_specifiques', 'Travaux specifiques a la categorie', 'Realiser un chargement/dechargement sur porte-engins', 33),
  ('R482A', 'fin_poste', 'Fin de poste', 'Stationner l''engin hors zone a risque et positionner les equipements en securite', 34),
  ('R482A', 'fin_poste', 'Fin de poste', 'Mettre en oeuvre le frein de parking, arreter le moteur et consigner l''engin', 35),
  ('R482A', 'fin_poste', 'Fin de poste', 'Effectuer l''entretien journalier et rendre compte des anomalies', 36)
on conflict do nothing;
-- Capacites communes (reglementation, prise de poste, conduite, fin de poste) : toutes categories
insert into __SCHEMA__.fise_capacite_categories (capacite_id, categorie_code)
select c.id, cat from __SCHEMA__.fise_capacites c
cross join unnest(array['A','B1','B2','B3','C1','C2','C3','D','E','F','G']) as cat
where c.referentiel_code = 'R482A' and c.ordre in (1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,34,35,36)
on conflict do nothing;
-- Capacites specifiques (travaux de base) : ventilees selon les fiches A3|2|1 a A3|2|11
insert into __SCHEMA__.fise_capacite_categories (capacite_id, categorie_code)
select c.id, v.cat
from __SCHEMA__.fise_capacites c
join (values
  (18, 'A'), (18, 'B1'), (18, 'B3'), (18, 'C1'),
  (19, 'A'), (19, 'B1'), (19, 'B3'), (19, 'C1'), (19, 'C2'),
  (20, 'A'), (20, 'B1'), (20, 'B3'),
  (21, 'A'),
  (22, 'A'), (22, 'D'),
  (23, 'A'),
  (24, 'B2'),
  (25, 'B3'),
  (26, 'C2'), (26, 'C3'),
  (27, 'C3'),
  (28, 'E'),
  (29, 'E'),
  (30, 'F'),
  (31, 'F'),
  (32, 'A'), (32, 'B1'), (32, 'B3'), (32, 'C1'),
  (33, 'A'), (33, 'G')
) as v(ordre, cat) on v.ordre = c.ordre
where c.referentiel_code = 'R482A'
on conflict do nothing;

-- Catalogue FISE R486A (PEMP) - enrichi depuis l'Annexe 2 du referentiel
insert into __SCHEMA__.fise_capacites (referentiel_code, theme_code, theme_libelle, libelle, ordre) values
  ('R486A', 'reglementation_prevention', 'Connaissances reglementaires et prevention', 'Connaitre les responsabilites de l''employeur et du conducteur', 1),
  ('R486A', 'reglementation_prevention', 'Connaissances reglementaires et prevention', 'Identifier les principaux risques lies a l''utilisation de la PEMP', 2),
  ('R486A', 'reglementation_prevention', 'Connaissances reglementaires et prevention', 'Identifier les regles de circulation sur site', 3),
  ('R486A', 'reglementation_prevention', 'Connaissances reglementaires et prevention', 'Interpreter les pictogrammes de securite', 4),
  ('R486A', 'technologie_prise_poste', 'Technologie, verifications et prise de poste', 'Utiliser la notice d''instructions et le rapport de verification', 5),
  ('R486A', 'technologie_prise_poste', 'Technologie, verifications et prise de poste', 'Verifier visuellement la structure, les suspentes et les contacts au sol', 6),
  ('R486A', 'technologie_prise_poste', 'Technologie, verifications et prise de poste', 'Verifier les dispositifs de securite', 7),
  ('R486A', 'technologie_prise_poste', 'Technologie, verifications et prise de poste', 'Verifier le carburant ou l''etat de charge de la batterie', 8),
  ('R486A', 'technologie_prise_poste', 'Technologie, verifications et prise de poste', 'Verifier les conditions meteorologiques', 9),
  ('R486A', 'technologie_prise_poste', 'Technologie, verifications et prise de poste', 'Verifier l''adequation capacite / hauteur / portee', 10),
  ('R486A', 'technologie_prise_poste', 'Technologie, verifications et prise de poste', 'Deployer les stabilisateurs et regler l''horizontalite', 11),
  ('R486A', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Monter et descendre de la PEMP selon la regle des 3 points', 12),
  ('R486A', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Se positionner a distance de securite des obstacles', 13),
  ('R486A', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Se deplacer le long de parois en espace limite', 14),
  ('R486A', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Adapter la vitesse aux conditions', 15),
  ('R486A', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Verifier les points d''appui avant deplacement', 16),
  ('R486A', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Circuler selon la configuration du poste de conduite', 17),
  ('R486A', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Communiquer par gestes et signaux conventionnels', 18),
  ('R486A', 'conduite_manoeuvres', 'Conduite et manoeuvres', 'Stationner et arreter la PEMP en securite', 19),
  ('R486A', 'travail_hauteur', 'Travail en hauteur', 'Charger / decharger une PEMP de type 3 sur porte-engins', 20),
  ('R486A', 'travail_hauteur', 'Travail en hauteur', 'Effectuer une manoeuvre de descente de secours au sol', 21),
  ('R486A', 'travail_hauteur', 'Travail en hauteur', 'Faire executer une manoeuvre de descente de depannage depuis la plateforme', 22),
  ('R486A', 'fin_poste', 'Fin de poste', 'Verifier les niveaux en fin de poste', 23),
  ('R486A', 'fin_poste', 'Fin de poste', 'Effectuer l''entretien journalier de la PEMP', 24),
  ('R486A', 'fin_poste', 'Fin de poste', 'Rendre compte des anomalies constatees', 25)
on conflict do nothing;
insert into __SCHEMA__.fise_capacite_categories (capacite_id, categorie_code)
select c.id, cat from __SCHEMA__.fise_capacites c cross join unnest(array['A','B','C']) as cat
where c.referentiel_code = 'R486A' on conflict do nothing;

insert into __SCHEMA__.themes_referentiel (referentiel_code, code, libelle, bareme_officiel_sur_100) values
  ('R485', 'connaissances_generales', 'Connaissances generales', 15),
  ('R485', 'technologie_stabilite', 'Technologie et stabilite des gerbeurs', 25),
  ('R485', 'tableau_charges', 'Tableau / abaque de charges', 10),
  ('R485', 'exploitation', 'Exploitation des gerbeurs', 50),
  ('R489', 'connaissances_generales', 'Connaissances generales', 15),
  ('R489', 'technologie_stabilite', 'Technologie et stabilite des chariots', 25),
  ('R489', 'tableau_charges', 'Tableau / abaque de charges', 10),
  ('R489', 'exploitation', 'Exploitation des chariots', 50),
  ('R482A', 'connaissances_generales', 'Connaissances generales', 12),
  ('R482A', 'technologie_stabilite', 'Technologie et stabilite des engins de chantier', 28),
  ('R482A', 'exploitation', 'Exploitation des engins de chantier', 44),
  ('R482A', 'circulation', 'Circulation des engins de chantier', 12),
  ('R482A', 'fin_poste_maintenance', 'Fin de poste et maintenance', 4),
  ('R486A', 'connaissances_generales', 'Connaissances generales', 14),
  ('R486A', 'technologie_stabilite', 'Technologie et stabilite des PEMP', 26),
  ('R486A', 'exploitation', 'Exploitation des PEMP', 54),
  ('R486A', 'entretien', 'Entretien', 6)
on conflict (referentiel_code, code) do update set
  libelle = excluded.libelle,
  bareme_officiel_sur_100 = excluded.bareme_officiel_sur_100;

-- ----------------------------------------------------------------------------
-- 5. BANQUE DE QUESTIONS (issue de data/questions_qcm.json - a valider par un
--    formateur avant mise en production, voir MEMOIRE_PROJET.md)
-- ----------------------------------------------------------------------------
__QUESTIONS_INSERT__


-- ----------------------------------------------------------------------------
-- PARC D'ENGINS (materiel utilise pour les tests) - exige par le referentiel de
-- certification (§4.4.2) : liste du materiel avec provenance, marque, modele,
-- n° de serie, conformite et date de derniere verification ; documents (CE /
-- certificat de conformite, VGP, examen d'adequation...) conserves 10 ans.
-- Un engin loue/prete est enregistre UNE fois : s'il revient, on ne renseigne
-- que les nouveaux documents (ex. nouvelle VGP).
-- ----------------------------------------------------------------------------
create table if not exists __SCHEMA__.engins (
  id uuid primary key default gen_random_uuid(),
  designation text not null,                 -- ex. "Pelle hydraulique 21 t"
  type_engin text,                           -- ex. PH, chargeuse, chariot...
  referentiel_code text references __SCHEMA__.referentiels(code),
  categories text[] not null default '{}',   -- categories pour lesquelles il sert aux tests
  marque text,
  modele text,
  numero_serie text,
  annee int,
  provenance text not null default 'propriete' check (provenance in ('propriete','location','pret')),
  -- soumis aux VGP (arrete 1993/2004) ? sinon : verification annuelle de l'etat de conservation
  soumis_vgp boolean not null default true,
  proprietaire text,                         -- loueur / preteur
  actif boolean not null default true,
  notes text,
  created_by uuid references __SCHEMA__.formateurs(id),
  created_at timestamptz not null default now()
);
-- Meme marque + meme n° de serie = meme engin (reconnaissance au retour d'un loueur)
create unique index if not exists engins_serie_unique
  on __SCHEMA__.engins (lower(coalesce(marque, '')), lower(numero_serie))
  where numero_serie is not null and numero_serie <> '';

alter table __SCHEMA__.epreuves_pratique add column if not exists engin_id uuid references __SCHEMA__.engins(id);

create table if not exists __SCHEMA__.types_document_engin (
  code text primary key,
  libelle text not null,
  obligatoire boolean not null default false,   -- a presenter le jour du test
  avec_echeance boolean not null default false, -- porte une date d'echeance a surveiller
  ordre int not null default 0
);
insert into __SCHEMA__.types_document_engin (code, libelle, obligatoire, avec_echeance, ordre) values
  ('notice', 'Notice d''instructions (en français)', true, false, 1),
  ('conformite', 'Déclaration CE de conformité / certificat de conformité', true, false, 2),
  ('vgp', 'Rapport de vérification générale périodique (VGP)', true, true, 3),
  ('adequation', 'Examen d''adéquation', true, false, 4),
  ('mise_service', 'Vérification de mise ou remise en service', false, false, 5),
  ('conservation', 'Vérification annuelle de l''état de conservation (engin non soumis aux VGP)', false, true, 6),
  ('mise_a_disposition', 'Certificat de conformité de mise à disposition (matériel loué ou prêté)', false, false, 7),
  ('autre', 'Autre document', false, false, 8)
on conflict (code) do update set libelle = excluded.libelle, obligatoire = excluded.obligatoire,
  avec_echeance = excluded.avec_echeance, ordre = excluded.ordre;

create table if not exists __SCHEMA__.engin_documents (
  id uuid primary key default gen_random_uuid(),
  engin_id uuid not null references __SCHEMA__.engins(id) on delete cascade,
  type_code text not null references __SCHEMA__.types_document_engin(code),
  date_document date,                        -- date du document / de la verification
  date_echeance date,                        -- prochaine verification (lue sur le rapport)
  reference text,
  observations_ouvertes boolean not null default false,  -- rapport avec observations NON levees
  -- Photos des documents : stockees sur GOOGLE DRIVE (allege la base) ; ici seulement
  -- les references [{"id": ..., "nom": ..., "lien": ...}] renvoyees par la fonction Drive.
  fichiers jsonb not null default '[]'::jsonb,
  notes text,
  session_id uuid references __SCHEMA__.sessions_formation(id) on delete set null,
  ajoute_par uuid references __SCHEMA__.formateurs(id),
  created_at timestamptz not null default now()
);
create index if not exists engin_documents_engin_idx on __SCHEMA__.engin_documents (engin_id, type_code);

-- Avis du formateur sur un engin, pour memoire (historique date et signe)
create table if not exists __SCHEMA__.engin_avis (
  id uuid primary key default gen_random_uuid(),
  engin_id uuid not null references __SCHEMA__.engins(id) on delete cascade,
  niveau text not null default 'ok' check (niveau in ('ok','vigilance','deconseille')),
  commentaire text not null,
  formateur_id uuid references __SCHEMA__.formateurs(id),
  session_id uuid references __SCHEMA__.sessions_formation(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Engins utilises pendant une session de tests
create table if not exists __SCHEMA__.session_engins (
  session_id uuid not null references __SCHEMA__.sessions_formation(id) on delete cascade,
  engin_id uuid not null references __SCHEMA__.engins(id),
  ajoute_par uuid references __SCHEMA__.formateurs(id),
  created_at timestamptz not null default now(),
  primary key (session_id, engin_id)
);

-- Statut des documents d'un engin a une date donnee (derniere version de chaque type).
--  ok | bientot (echeance < 30 j) | expire | a_completer (echeance non saisie)
--  | observations (rapport avec observations non levees) | manquant
create or replace function __SCHEMA__.caces_engin_statut(p_engin uuid, p_jour date default current_date)
returns table (type_code text, libelle text, obligatoire boolean, statut text,
               date_document date, date_echeance date, document_id uuid)
language sql stable security definer
set search_path = __SCHEMA__, public, extensions
as $$
  select t.code, t.libelle,
    case when t.code = 'vgp' then e.soumis_vgp
         when t.code = 'conservation' then not e.soumis_vgp
         else t.obligatoire end,
    case
      when d.id is null then 'manquant'
      when t.code = 'vgp' and d.observations_ouvertes then 'observations'
      when t.avec_echeance and d.date_echeance is null then 'a_completer'
      when t.avec_echeance and d.date_echeance < p_jour then 'expire'
      when t.avec_echeance and d.date_echeance < p_jour + 30 then 'bientot'
      else 'ok'
    end,
    d.date_document, d.date_echeance, d.id
  from __SCHEMA__.types_document_engin t
  join __SCHEMA__.engins e on e.id = p_engin
  left join lateral (
    select x.* from __SCHEMA__.engin_documents x
    where x.engin_id = p_engin and x.type_code = t.code
    order by coalesce(x.date_document, x.created_at::date) desc, x.created_at desc limit 1) d on true
  order by t.ordre;
$$;

-- Etat global d'un engin : rouge (document obligatoire manquant / expire / avec
-- observations), orange (echeance proche ou document facultatif expire), vert.
create or replace view __SCHEMA__.v_engins_statut with (security_invoker = true) as
select e.id as engin_id,
  case
    when exists (select 1 from __SCHEMA__.caces_engin_statut(e.id) s
                 where s.obligatoire and s.statut in ('manquant','expire','observations','a_completer')) then 'rouge'
    when exists (select 1 from __SCHEMA__.caces_engin_statut(e.id) s
                 where s.statut in ('bientot','expire','observations','a_completer')) then 'orange'
    else 'vert'
  end as etat
from __SCHEMA__.engins e;
grant select on __SCHEMA__.v_engins_statut to authenticated;


-- Connexion Google Drive de BFS CACES (secrets). AUCUNE policy de lecture : seule
-- l'Edge Function (cle service_role cote serveur) lit cette table ; ni le
-- navigateur ni un admin ne peuvent la lire. A remplir une seule fois (voir
-- sql/bfs/copie_connexion_drive_habelec.sql).
create table if not exists __SCHEMA__.config_drive (
  id smallint primary key default 1,
  drive_client_id text,
  drive_client_secret text,
  drive_refresh_token text,
  drive_dossier_racine_id text,   -- ID du dossier « CACES » a la racine du Drive
  updated_at timestamptz not null default now(),
  constraint config_drive_singleton check (id = 1)
);
insert into __SCHEMA__.config_drive (id) values (1) on conflict (id) do nothing;
alter table __SCHEMA__.config_drive enable row level security;
revoke all on __SCHEMA__.config_drive from public, anon, authenticated;
-- L'Edge Function lit cette table avec la cle service_role (cote serveur uniquement) :
-- ce role n'a aucun droit par defaut sur un schema personnalise.
grant usage on schema __SCHEMA__ to service_role;
grant select, update on __SCHEMA__.config_drive to service_role;

-- L'admin peut definir le dossier racine et voir si Drive est configure, sans jamais lire les secrets.
create or replace function __SCHEMA__.caces_definir_dossier_drive(p_dossier_id text)
returns void language plpgsql security definer
set search_path = __SCHEMA__, public, extensions
as $$
begin
  if coalesce(__SCHEMA__.caces_role(), '') <> 'admin' then raise exception 'Reserve aux administrateurs'; end if;
  update __SCHEMA__.config_drive set drive_dossier_racine_id = nullif(trim(p_dossier_id), ''), updated_at = now() where id = 1;
end;
$$;

create or replace function __SCHEMA__.caces_etat_drive()
returns table (connecte boolean, dossier_racine_id text)
language sql stable security definer
set search_path = __SCHEMA__, public, extensions
as $$
  select (drive_client_id is not null and drive_client_secret is not null and drive_refresh_token is not null),
         drive_dossier_racine_id
  from __SCHEMA__.config_drive where id = 1 and __SCHEMA__.caces_role() is not null;
$$;

alter table __SCHEMA__.engins enable row level security;
alter table __SCHEMA__.types_document_engin enable row level security;
alter table __SCHEMA__.engin_documents enable row level security;
alter table __SCHEMA__.engin_avis enable row level security;
alter table __SCHEMA__.session_engins enable row level security;

-- Lecture : tout compte autorise. Ecriture : formateur/admin. Suppression : admin.
drop policy if exists engins_lecture on __SCHEMA__.engins;
create policy engins_lecture on __SCHEMA__.engins for select using (__SCHEMA__.caces_role() is not null);
drop policy if exists engins_ecriture on __SCHEMA__.engins;
create policy engins_ecriture on __SCHEMA__.engins for insert with check (__SCHEMA__.caces_role() in ('formateur','admin'));
drop policy if exists engins_modif on __SCHEMA__.engins;
create policy engins_modif on __SCHEMA__.engins for update using (__SCHEMA__.caces_role() in ('formateur','admin')) with check (__SCHEMA__.caces_role() in ('formateur','admin'));
drop policy if exists engins_suppr on __SCHEMA__.engins;
create policy engins_suppr on __SCHEMA__.engins for delete using (__SCHEMA__.caces_role() = 'admin');

drop policy if exists types_doc_engin_lecture on __SCHEMA__.types_document_engin;
create policy types_doc_engin_lecture on __SCHEMA__.types_document_engin for select using (__SCHEMA__.caces_role() is not null);
drop policy if exists types_doc_engin_admin on __SCHEMA__.types_document_engin;
create policy types_doc_engin_admin on __SCHEMA__.types_document_engin for all using (__SCHEMA__.caces_role() = 'admin') with check (__SCHEMA__.caces_role() = 'admin');

drop policy if exists engin_documents_lecture on __SCHEMA__.engin_documents;
create policy engin_documents_lecture on __SCHEMA__.engin_documents for select using (__SCHEMA__.caces_role() is not null);
drop policy if exists engin_documents_ecriture on __SCHEMA__.engin_documents;
create policy engin_documents_ecriture on __SCHEMA__.engin_documents for insert with check (__SCHEMA__.caces_role() in ('formateur','admin'));
drop policy if exists engin_documents_modif on __SCHEMA__.engin_documents;
create policy engin_documents_modif on __SCHEMA__.engin_documents for update using (__SCHEMA__.caces_role() in ('formateur','admin')) with check (__SCHEMA__.caces_role() in ('formateur','admin'));
drop policy if exists engin_documents_suppr on __SCHEMA__.engin_documents;
create policy engin_documents_suppr on __SCHEMA__.engin_documents for delete using (__SCHEMA__.caces_role() = 'admin');

drop policy if exists engin_avis_lecture on __SCHEMA__.engin_avis;
create policy engin_avis_lecture on __SCHEMA__.engin_avis for select using (__SCHEMA__.caces_role() is not null);
drop policy if exists engin_avis_ecriture on __SCHEMA__.engin_avis;
create policy engin_avis_ecriture on __SCHEMA__.engin_avis for insert with check (__SCHEMA__.caces_role() in ('formateur','admin'));
drop policy if exists engin_avis_suppr on __SCHEMA__.engin_avis;
create policy engin_avis_suppr on __SCHEMA__.engin_avis for delete using (__SCHEMA__.caces_role() = 'admin');

drop policy if exists session_engins_lecture on __SCHEMA__.session_engins;
create policy session_engins_lecture on __SCHEMA__.session_engins for select using (__SCHEMA__.caces_role() is not null);
drop policy if exists session_engins_ecriture on __SCHEMA__.session_engins;
create policy session_engins_ecriture on __SCHEMA__.session_engins for all
  using (__SCHEMA__.caces_role() in ('formateur','admin')) with check (__SCHEMA__.caces_role() in ('formateur','admin'));

grant select, insert, update, delete on __SCHEMA__.engins, __SCHEMA__.types_document_engin,
  __SCHEMA__.engin_documents, __SCHEMA__.engin_avis, __SCHEMA__.session_engins to authenticated;

-- Stockage prive des photos de stagiaires (carton) : petit bucket Supabase prive,
-- acces via URL signees. (Les photos de DOCUMENTS D'ENGINS vont sur Google Drive.)
-- Policies prefixees "caces_".
insert into storage.buckets (id, name, public) values ('caces-photos-stagiaires', 'caces-photos-stagiaires', false)
  on conflict (id) do nothing;

drop policy if exists caces_storage_lecture on storage.objects;
create policy caces_storage_lecture on storage.objects for select to authenticated
  using (bucket_id = 'caces-photos-stagiaires' and __SCHEMA__.caces_role() is not null);
drop policy if exists caces_storage_ajout on storage.objects;
create policy caces_storage_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'caces-photos-stagiaires' and __SCHEMA__.caces_role() in ('formateur','admin'));
drop policy if exists caces_storage_modif on storage.objects;
create policy caces_storage_modif on storage.objects for update to authenticated
  using (bucket_id = 'caces-photos-stagiaires' and __SCHEMA__.caces_role() in ('formateur','admin'));
drop policy if exists caces_storage_suppr on storage.objects;
create policy caces_storage_suppr on storage.objects for delete to authenticated
  using (bucket_id = 'caces-photos-stagiaires' and __SCHEMA__.caces_role() = 'admin');

-- ----------------------------------------------------------------------------
-- GRILLE PRATIQUE FACON FICHE OFFICIELLE : point d'evaluation (regle "note > 0
-- a chaque point"), evaluation en continu, variante d'engin (ex. PEMP 1A / 3A),
-- libelle du theme, second engin de l'epreuve.
-- ----------------------------------------------------------------------------
alter table __SCHEMA__.criteres_pratique add column if not exists point_numero int;
alter table __SCHEMA__.criteres_pratique add column if not exists en_continu boolean not null default false;
alter table __SCHEMA__.criteres_pratique add column if not exists variante text;
alter table __SCHEMA__.criteres_pratique add column if not exists theme_libelle text;
alter table __SCHEMA__.epreuves_pratique add column if not exists engin_secondaire_id uuid references __SCHEMA__.engins(id);

-- R486A cat. A (fiche A3/2/1) : 9 points d'evaluation, PEMP 1A et 3A (les deux
-- sont evalues dans la meme epreuve : 15 + 6 + 35 + 34 + 10 = 100).
update __SCHEMA__.criteres_pratique set eliminatoire = false
  where referentiel_code = 'R486A' and categorie_code = 'A';
update __SCHEMA__.criteres_pratique c set
  point_numero = v.pt, en_continu = v.cont, variante = v.var, theme_libelle = v.lib
from (values
  (1,2,1,false,null,'Prise de poste et mise en service'),(3,5,2,false,null,'Prise de poste et mise en service'),
  (6,7,3,false,null,'Adequation'),
  (8,11,4,false,'1A','Mise en place - Conduite - Manoeuvres 1A'),
  (12,14,5,true,'1A','Mise en place - Conduite - Manoeuvres 1A'),
  (15,19,6,false,'1A','Mise en place - Conduite - Manoeuvres 1A'),
  (20,26,7,true,'3A','Conduite - Manoeuvres 3A'),
  (27,35,8,false,'3A','Conduite - Manoeuvres 3A'),
  (36,38,9,false,null,'Fin de poste - maintenance')
) as v(o1,o2,pt,cont,var,lib)
where c.referentiel_code = 'R486A' and c.categorie_code = 'A' and c.ordre between v.o1 and v.o2;
update __SCHEMA__.criteres_pratique set theme_code = 'prise_poste' where referentiel_code='R486A' and categorie_code='A' and ordre between 1 and 5;

-- R489 cat. 3 (fiche A3/2/3) : 10 points d'evaluation, 100 pts = prise de poste 10
-- + conduite 20 + manoeuvres 55 + fin de poste 15. Les points 2 et 3 sont evalues en continu.
update __SCHEMA__.criteres_pratique c set
  point_numero = v.pt, en_continu = v.cont, theme_libelle = v.lib
from (values
  (1,5,1,false,'Prise de poste et mise en service'),
  (6,6,2,true,'Conduite'),(7,7,3,true,'Conduite'),(8,8,4,false,'Conduite'),
  (9,11,5,false,'Manoeuvres'),(12,16,6,false,'Manoeuvres'),(17,21,7,false,'Manoeuvres'),
  (22,25,8,false,'Manoeuvres'),(26,28,9,false,'Manoeuvres'),
  (29,31,10,false,'Fin de poste - maintenance')
) as v(o1,o2,pt,cont,lib)
where c.referentiel_code = 'R489' and c.categorie_code = '3' and c.ordre between v.o1 and v.o2;

-- ----------------------------------------------------------------------------
-- EPREUVE PRATIQUE : examen d'adequation (une fois par session et par engin),
-- durees T1/T2/T3, operations eliminatoires.
-- ----------------------------------------------------------------------------
-- durees chronometrees, en secondes : T1 prise de poste, T2 production, T3 fin de poste
alter table __SCHEMA__.epreuves_pratique add column if not exists duree_prise_poste_s int;
alter table __SCHEMA__.epreuves_pratique add column if not exists duree_production_s int;
alter table __SCHEMA__.epreuves_pratique add column if not exists duree_fin_poste_s int;
alter table __SCHEMA__.epreuves_pratique add column if not exists eliminatoires jsonb;
-- Epreuve passee en mode essai (admin : sans engin ni examen d'adequation) : a ne pas compter comme reelle.
alter table __SCHEMA__.epreuves_pratique add column if not exists mode_essai boolean not null default false;

create table if not exists __SCHEMA__.operations_eliminatoires (
  id serial primary key,
  referentiel_code text not null references __SCHEMA__.referentiels(code),
  libelle text not null,
  ordre int not null default 0,
  actif boolean not null default true,
  unique (referentiel_code, libelle)
);
-- R482A : les 5 operations eliminatoires du referentiel (note 0 au point concerne = echec).
insert into __SCHEMA__.operations_eliminatoires (referentiel_code, libelle, ordre) values
  ('R482A', 'Sauter de l''engin', 1),
  ('R482A', 'Ne pas garantir la securite des pietons', 2),
  ('R482A', 'Circuler avec une charge en hauteur', 3),
  ('R482A', 'Realiser une operation de levage avec un engin non equipe des dispositifs de securite appropries', 4),
  ('R482A', 'Quitter l''engin sans arreter le moteur', 5)
on conflict do nothing;

create table if not exists __SCHEMA__.adequations_session (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references __SCHEMA__.sessions_formation(id) on delete cascade,
  engin_id uuid not null references __SCHEMA__.engins(id),
  testeur_id uuid references __SCHEMA__.formateurs(id),
  date_examen timestamptz not null default now(),
  points jsonb not null default '{}'::jsonb,
  non_conformite jsonb,
  conforme boolean not null,
  unique (session_id, engin_id)
);
alter table __SCHEMA__.operations_eliminatoires enable row level security;
alter table __SCHEMA__.adequations_session enable row level security;
drop policy if exists op_elim_lecture on __SCHEMA__.operations_eliminatoires;
create policy op_elim_lecture on __SCHEMA__.operations_eliminatoires for select using (__SCHEMA__.caces_role() is not null);
drop policy if exists op_elim_admin on __SCHEMA__.operations_eliminatoires;
create policy op_elim_admin on __SCHEMA__.operations_eliminatoires for all
  using (__SCHEMA__.caces_role() = 'admin') with check (__SCHEMA__.caces_role() = 'admin');
drop policy if exists adequation_lecture on __SCHEMA__.adequations_session;
create policy adequation_lecture on __SCHEMA__.adequations_session for select using (__SCHEMA__.caces_role() is not null);
drop policy if exists adequation_ecriture on __SCHEMA__.adequations_session;
create policy adequation_ecriture on __SCHEMA__.adequations_session for all
  using (__SCHEMA__.caces_est_testeur_de(session_id)) with check (__SCHEMA__.caces_est_testeur_de(session_id));
grant select, insert, update, delete on __SCHEMA__.operations_eliminatoires, __SCHEMA__.adequations_session to authenticated;
grant usage, select on sequence __SCHEMA__.operations_eliminatoires_id_seq to authenticated;

-- Documents de session (communs a tous les stagiaires) : photos stockees sur le Drive,
-- la base ne garde que la reference, le lien et une miniature.
create table if not exists __SCHEMA__.session_documents (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references __SCHEMA__.sessions_formation(id) on delete cascade,
  type_code text not null check (type_code in ('presence','attestation','ce_vgp','convention','autre')),
  nom text not null,
  drive_id text,
  lien text,
  miniature text,
  ajoute_par uuid references __SCHEMA__.formateurs(id),
  created_at timestamptz not null default now()
);
alter table __SCHEMA__.session_documents enable row level security;
drop policy if exists session_documents_lecture on __SCHEMA__.session_documents;
create policy session_documents_lecture on __SCHEMA__.session_documents for select using (__SCHEMA__.caces_role() is not null);
drop policy if exists session_documents_ecriture on __SCHEMA__.session_documents;
create policy session_documents_ecriture on __SCHEMA__.session_documents for all
  using (__SCHEMA__.caces_est_formateur_de(session_id) or __SCHEMA__.caces_est_testeur_de(session_id))
  with check (__SCHEMA__.caces_est_formateur_de(session_id) or __SCHEMA__.caces_est_testeur_de(session_id));
grant select, insert, update, delete on __SCHEMA__.session_documents to authenticated;

-- ----------------------------------------------------------------------------
-- TESTEUR : code a 4 chiffres (remplace la declaration sur l'honneur),
-- testeur <> formateur impose en base, tests en CDT (taux par famille).
-- ----------------------------------------------------------------------------
alter table __SCHEMA__.sessions_formation add column if not exists en_cdt boolean not null default false;
-- Type de session : CACES (regles completes) ou autorisation de conduite (plus legere :
-- testeur = formateur permis, pas de limites d'UT, pas de code testeur, pas de n° Galaxy).
alter table __SCHEMA__.sessions_formation add column if not exists type_session text not null default 'caces';
alter table __SCHEMA__.sessions_formation drop constraint if exists sessions_type_session_check;
alter table __SCHEMA__.sessions_formation add constraint sessions_type_session_check check (type_session in ('caces','autorisation'));
-- Personne autorisee a etre a la fois formateur ET testeur d'une session CACES (derogation reservee).
alter table __SCHEMA__.formateurs add column if not exists cumul_formateur_testeur boolean not null default false;

-- Testeur <> formateur : impose pour une session CACES, sauf derogation individuelle ; libre en autorisation de conduite.
alter table __SCHEMA__.sessions_formation drop constraint if exists sessions_testeur_different_formateur;
create or replace function __SCHEMA__.caces_controle_testeur_formateur()
returns trigger language plpgsql security definer
set search_path = __SCHEMA__, public, extensions
as $$
begin
  if new.testeur_id is not null and new.testeur_id = new.formateur_id and new.type_session = 'caces'
     and not coalesce((select f.cumul_formateur_testeur from __SCHEMA__.formateurs f where f.id = new.formateur_id), false) then
    raise exception 'Le testeur doit etre une personne differente du formateur (session CACES).';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_testeur_formateur on __SCHEMA__.sessions_formation;
create trigger trg_testeur_formateur before insert or update of testeur_id, formateur_id, type_session on __SCHEMA__.sessions_formation
  for each row execute function __SCHEMA__.caces_controle_testeur_formateur();

create table if not exists __SCHEMA__.testeur_codes (
  testeur_id uuid primary key references __SCHEMA__.formateurs(id) on delete cascade,
  code_hash text not null,
  essais_echoues int not null default 0,
  updated_at timestamptz not null default now()
);
alter table __SCHEMA__.testeur_codes enable row level security;
revoke all on __SCHEMA__.testeur_codes from public, anon, authenticated;

create table if not exists __SCHEMA__.attestations_testeur (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references __SCHEMA__.sessions_formation(id) on delete cascade,
  testeur_id uuid not null references __SCHEMA__.formateurs(id),
  attestee_le timestamptz not null default now(),
  unique (session_id, testeur_id)
);
alter table __SCHEMA__.attestations_testeur enable row level security;
drop policy if exists attestations_lecture on __SCHEMA__.attestations_testeur;
create policy attestations_lecture on __SCHEMA__.attestations_testeur for select using (__SCHEMA__.caces_role() is not null);
revoke all on __SCHEMA__.attestations_testeur from public, anon, authenticated;
grant select on __SCHEMA__.attestations_testeur to authenticated;

-- Definir son code (ou, pour un admin, celui d'un testeur). 4 chiffres exactement.
create or replace function __SCHEMA__.caces_definir_code_testeur(p_code text, p_testeur uuid default null)
returns void language plpgsql security definer
set search_path = __SCHEMA__, public, extensions
as $$
declare v_cible uuid := coalesce(p_testeur, auth.uid());
begin
  if __SCHEMA__.caces_role() is null then raise exception 'Non autorise'; end if;
  if v_cible <> auth.uid() and __SCHEMA__.caces_role() <> 'admin' then
    raise exception 'Reserve aux administrateurs'; end if;
  if p_code !~ '^[0-9]{4}$' then raise exception 'Le code doit comporter exactement 4 chiffres'; end if;
  insert into __SCHEMA__.testeur_codes (testeur_id, code_hash)
    values (v_cible, extensions.crypt(p_code, extensions.gen_salt('bf')))
  on conflict (testeur_id) do update
    set code_hash = excluded.code_hash, essais_echoues = 0, updated_at = now();
end;
$$;

create or replace function __SCHEMA__.caces_a_un_code_testeur()
returns boolean language sql stable security definer
set search_path = __SCHEMA__, public, extensions
as $$ select exists (select 1 from __SCHEMA__.testeur_codes where testeur_id = auth.uid()); $$;

create or replace function __SCHEMA__.caces_debloquer_code_testeur(p_testeur uuid)
returns void language plpgsql security definer
set search_path = __SCHEMA__, public, extensions
as $$
begin
  if coalesce(__SCHEMA__.caces_role(), '') <> 'admin' then raise exception 'Reserve aux administrateurs'; end if;
  update __SCHEMA__.testeur_codes set essais_echoues = 0 where testeur_id = p_testeur;
end;
$$;

-- Le testeur de la session saisit son code : vaut engagement (independance,
-- non-formateur des candidats). Verrouillage apres 5 erreurs (debloque par l'admin).
create or replace function __SCHEMA__.caces_attester_testeur(p_session uuid, p_code text)
returns boolean language plpgsql security definer
set search_path = __SCHEMA__, public, extensions
as $$
declare c __SCHEMA__.testeur_codes%rowtype; s __SCHEMA__.sessions_formation%rowtype;
begin
  select * into s from __SCHEMA__.sessions_formation where id = p_session;
  if not found or s.testeur_id is distinct from auth.uid() then
    raise exception 'Vous n''etes pas le testeur de cette session'; end if;
  if s.type_session = 'autorisation' then return true; end if;   -- pas de code testeur en autorisation de conduite
  if s.formateur_id = s.testeur_id
     and not coalesce((select cumul_formateur_testeur from __SCHEMA__.formateurs where id = s.formateur_id), false) then
    raise exception 'Le testeur ne peut pas etre le formateur'; end if;
  select * into c from __SCHEMA__.testeur_codes where testeur_id = auth.uid();
  if not found then raise exception 'Aucun code testeur defini (Mon compte)'; end if;
  if c.essais_echoues >= 5 then raise exception 'Code verrouille : contactez un administrateur'; end if;
  if c.code_hash = extensions.crypt(p_code, c.code_hash) then
    update __SCHEMA__.testeur_codes set essais_echoues = 0 where testeur_id = auth.uid();
    insert into __SCHEMA__.attestations_testeur (session_id, testeur_id) values (p_session, auth.uid())
      on conflict (session_id, testeur_id) do nothing;
    return true;
  end if;
  update __SCHEMA__.testeur_codes set essais_echoues = essais_echoues + 1 where testeur_id = auth.uid();
  return false;
end;
$$;

-- Aucun test (QCM ou pratique) sans attestation du testeur sur la session.
create or replace function __SCHEMA__.caces_exiger_attestation()
returns trigger language plpgsql security definer
set search_path = __SCHEMA__, public, extensions
as $$
declare v_session uuid;
begin
  v_session := __SCHEMA__.caces_session_du_stagiaire(new.stagiaire_id);
  if v_session is not null and (select type_session from __SCHEMA__.sessions_formation where id = v_session) = 'autorisation' then
    return new;
  end if;
  if v_session is not null and not exists (
      select 1 from __SCHEMA__.attestations_testeur a
      join __SCHEMA__.sessions_formation s on s.id = a.session_id and s.testeur_id = a.testeur_id
      where a.session_id = v_session) then
    raise exception 'Le testeur doit saisir son code (4 chiffres) avant de demarrer les tests de cette session.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_attestation_qcm on __SCHEMA__.qcm_tirages;
create trigger trg_attestation_qcm before insert on __SCHEMA__.qcm_tirages
  for each row execute function __SCHEMA__.caces_exiger_attestation();
drop trigger if exists trg_attestation_pratique on __SCHEMA__.epreuves_pratique;
create trigger trg_attestation_pratique before insert on __SCHEMA__.epreuves_pratique
  for each row execute function __SCHEMA__.caces_exiger_attestation();

-- Taux de tests en CDT par famille, par annee (seuils : recommandations, tableau T1).
create or replace view __SCHEMA__.v_taux_cdt with (security_invoker = true) as
select left(sc.referentiel_code, 4) as famille,
       extract(year from coalesce(s.date_debut, s.date_creation::date))::int as annee,
       count(*) as nb_tests,
       count(*) filter (where s.en_cdt) as nb_cdt,
       round(100.0 * count(*) filter (where s.en_cdt) / count(*), 1) as taux,
       case left(sc.referentiel_code, 4)
         when 'R482' then 30 when 'R483' then 20 when 'R484' then 20 when 'R485' then 30
         when 'R486' then 30 when 'R487' then 20 when 'R489' then 50 when 'R490' then 50 end as seuil
from __SCHEMA__.stagiaire_categories sc
join __SCHEMA__.stagiaires st on st.id = sc.stagiaire_id
join __SCHEMA__.sessions_formation s on s.id = st.session_id
group by 1, 2;
grant select on __SCHEMA__.v_taux_cdt to authenticated;

-- ----------------------------------------------------------------------------
-- PORTAIL STAGIAIRE : acces par code de SESSION (affiche en salle).
-- 1) liste des candidats de la session (nom/prenom seulement, session ouverte)
-- 2) identification par choix du nom -> renvoie le code individuel
-- ----------------------------------------------------------------------------
create or replace function __SCHEMA__.caces_candidats_session(p_code_session text)
returns table (stagiaire_id uuid, nom text, prenom text, session_nom text)
language sql stable security definer
set search_path = __SCHEMA__, public, extensions
as $$
  select s.id, s.nom, s.prenom, sf.nom
  from __SCHEMA__.sessions_formation sf
  join __SCHEMA__.stagiaires s on s.session_id = sf.id
  where upper(sf.code_acces) = upper(trim(p_code_session)) and sf.statut = 'ouverte'
  order by s.nom, s.prenom;
$$;

drop function if exists __SCHEMA__.caces_identifier_stagiaire(text, uuid, date);
create or replace function __SCHEMA__.caces_identifier_stagiaire(p_code_session text, p_stagiaire_id uuid)
returns text
language plpgsql security definer
set search_path = __SCHEMA__, public, extensions
as $$
declare v_code text;
begin
  select s.code_acces_individuel into v_code
  from __SCHEMA__.stagiaires s
  join __SCHEMA__.sessions_formation sf on sf.id = s.session_id
  where s.id = p_stagiaire_id and upper(sf.code_acces) = upper(trim(p_code_session))
    and sf.statut = 'ouverte';
  if v_code is null then
    raise exception 'Identification impossible : session fermée ou stagiaire inconnu.';
  end if;
  return v_code;
end;
$$;

-- Informations a completer par le stagiaire lui-meme (comme Habelec).
create or replace function __SCHEMA__.caces_stagiaire_profil(p_code text)
returns table (date_naissance date, entreprise text)
language sql stable security definer
set search_path = __SCHEMA__, public, extensions
as $$
  select s.date_naissance, s.entreprise from __SCHEMA__.stagiaires s where s.code_acces_individuel = p_code;
$$;

create or replace function __SCHEMA__.caces_completer_stagiaire(p_code text, p_naissance date, p_entreprise text)
returns void
language plpgsql security definer
set search_path = __SCHEMA__, public, extensions
as $$
begin
  if p_naissance is null or p_naissance > current_date - interval '16 years' then
    raise exception 'Date de naissance invalide.';
  end if;
  update __SCHEMA__.stagiaires
     set date_naissance = coalesce(date_naissance, p_naissance),
         entreprise = coalesce(nullif(entreprise, ''), nullif(trim(p_entreprise), ''))
   where code_acces_individuel = p_code;
end;
$$;

-- Planning d'une session : jours de formation (formateur) et jours de test (testeur),
-- et repartition des epreuves de chaque stagiaire sur les jours de test.
create table if not exists __SCHEMA__.session_jours (
  session_id uuid not null references __SCHEMA__.sessions_formation(id) on delete cascade,
  jour date not null,
  type text not null check (type in ('formation','test')),
  primary key (session_id, jour, type)
);
alter table __SCHEMA__.session_jours enable row level security;
drop policy if exists session_jours_lecture on __SCHEMA__.session_jours;
create policy session_jours_lecture on __SCHEMA__.session_jours for select using (__SCHEMA__.caces_role() is not null);
drop policy if exists session_jours_ecriture on __SCHEMA__.session_jours;
create policy session_jours_ecriture on __SCHEMA__.session_jours for all
  using ((type = 'formation' and __SCHEMA__.caces_est_formateur_de(session_id)) or (type = 'test' and __SCHEMA__.caces_est_testeur_de(session_id)))
  with check ((type = 'formation' and __SCHEMA__.caces_est_formateur_de(session_id)) or (type = 'test' and __SCHEMA__.caces_est_testeur_de(session_id)));
grant select, insert, update, delete on __SCHEMA__.session_jours to authenticated;

create table if not exists __SCHEMA__.planning_tests (
  stagiaire_id uuid not null references __SCHEMA__.stagiaires(id) on delete cascade,
  referentiel_code text not null,
  categorie_code text not null default '',          -- '' pour la theorie (par referentiel)
  epreuve text not null check (epreuve in ('theorie','pratique')),
  jour date not null,
  primary key (stagiaire_id, referentiel_code, categorie_code, epreuve)
);
alter table __SCHEMA__.planning_tests enable row level security;
drop policy if exists planning_tests_lecture on __SCHEMA__.planning_tests;
create policy planning_tests_lecture on __SCHEMA__.planning_tests for select using (__SCHEMA__.caces_role() is not null);
drop policy if exists planning_tests_ecriture on __SCHEMA__.planning_tests;
create policy planning_tests_ecriture on __SCHEMA__.planning_tests for all
  using (__SCHEMA__.caces_est_testeur_de(__SCHEMA__.caces_session_du_stagiaire(stagiaire_id)))
  with check (__SCHEMA__.caces_est_testeur_de(__SCHEMA__.caces_session_du_stagiaire(stagiaire_id)));
grant select, insert, update, delete on __SCHEMA__.planning_tests to authenticated;

-- Charge PREVUE d'un testeur un jour donne : epreuves planifiees ce jour-la ; a defaut de
-- planning, l'epreuve est comptee le jour de debut de la session. Les sessions
-- « autorisation » (sans limite d'UT) et les epreuves deja validees/dispensees sont exclues.
create or replace function __SCHEMA__.caces_charge_prevue(p_testeur uuid, p_jour date)
returns table (ut_total numeric, ut_pratique numeric)
language sql stable security definer
set search_path = __SCHEMA__, public, extensions
as $$
  with base as (
    select sf.id as session_id, s.id as stagiaire_id, sc.referentiel_code, sc.categorie_code,
           sc.theorie_validee, sc.pratique_validee,
           coalesce(pt.jour, sf.date_debut) as jour_theorie,
           coalesce(pp.jour, sf.date_debut) as jour_pratique
    from __SCHEMA__.sessions_formation sf
    join __SCHEMA__.stagiaires s on s.session_id = sf.id
    join __SCHEMA__.stagiaire_categories sc on sc.stagiaire_id = s.id
    left join __SCHEMA__.planning_tests pt on pt.stagiaire_id = s.id and pt.referentiel_code = sc.referentiel_code
         and pt.categorie_code = '' and pt.epreuve = 'theorie'
    left join __SCHEMA__.planning_tests pp on pp.stagiaire_id = s.id and pp.referentiel_code = sc.referentiel_code
         and pp.categorie_code = sc.categorie_code and pp.epreuve = 'pratique'
    where sf.testeur_id = p_testeur and sf.statut <> 'cloturee' and sf.type_session = 'caces'),
  th as (
    select session_id, referentiel_code, count(distinct stagiaire_id) as n from base
    where jour_theorie = p_jour and theorie_validee is not true
    group by session_id, referentiel_code),
  ut_th as (
    select coalesce(sum(r.ut_theorique * ceil(th.n::numeric / greatest(p.max_candidats_theorie, 1))), 0) as v
    from th join __SCHEMA__.referentiels r on r.code = th.referentiel_code
    cross join __SCHEMA__.parametres_application p where p.id = 1),
  pr as (
    select coalesce(sum(c.ut_pratique), 0) as v from base b
    join __SCHEMA__.categories_referentiel c
      on c.referentiel_code = b.referentiel_code and c.code = b.categorie_code
    where b.jour_pratique = p_jour and b.pratique_validee is not true)
  select ut_th.v + pr.v, pr.v from ut_th, pr;
$$;

-- ----------------------------------------------------------------------------
-- LISTE BLANCHE EXECUTE (regle Habelec du 2026-08-23) : PostgreSQL accorde
-- EXECUTE a PUBLIC sur toute nouvelle fonction, donc anon en heriterait. On
-- retire tout, puis on n'accorde a anon QUE les 10 fonctions de passation
-- stagiaire. Doit rester en DERNIER dans ce script.
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema __SCHEMA__ from public, anon;
grant execute on all functions in schema __SCHEMA__ to authenticated;
grant execute on function __SCHEMA__.caces_stagiaire_infos(text) to anon;
grant execute on function __SCHEMA__.caces_demarrer_qcm(text, text) to anon;
grant execute on function __SCHEMA__.caces_questions_du_tirage(text, uuid) to anon;
grant execute on function __SCHEMA__.caces_repondre(text, uuid, int, boolean) to anon;
grant execute on function __SCHEMA__.caces_finaliser_qcm(text, uuid) to anon;
grant execute on function __SCHEMA__.caces_candidats_session(text) to anon;
grant execute on function __SCHEMA__.caces_identifier_stagiaire(text, uuid) to anon;
grant execute on function __SCHEMA__.caces_stagiaire_profil(text) to anon;
grant execute on function __SCHEMA__.caces_completer_stagiaire(text, date, text) to anon;
grant execute on function __SCHEMA__.caces_verifier_titre(text) to anon;
