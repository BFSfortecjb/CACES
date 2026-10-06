# -*- coding: utf-8 -*-
import json, os, re

SCRIPTS = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(SCRIPTS)  # racine du projet
BFS_DIR = OUT

with open(os.path.join(SCRIPTS, "sql_template.sql"), encoding="utf-8") as f:
    template = f.read()

with open(os.path.join(OUT, "data", "questions_qcm.json"), encoding="utf-8") as f:
    qdata = json.load(f)

def esc(s):
    return s.replace("'", "''")

def build_questions_sql(schema):
    lines = []
    lines.append(f"insert into {schema}.questions_qcm (theme_id, code, enonce, reponse)")
    lines.append("select t.id, v.code, v.enonce, v.reponse")
    lines.append("from (values")
    rows = []
    for ref in qdata["referentiels"]:
        ref_code = ref["code"]
        for theme in ref["themes"]:
            theme_code = theme["code"]
            for q in theme["questions"]:
                rows.append(
                    f"  ('{ref_code}', '{theme_code}', '{esc(q['id'])}', '{esc(q['enonce'])}', {str(q['reponse']).lower()})"
                )
    lines.append(",\n".join(rows))
    lines.append(") as v(referentiel_code, theme_code, code, enonce, reponse)")
    lines.append(f"join {schema}.themes_referentiel t")
    lines.append("  on t.referentiel_code = v.referentiel_code and t.code = v.theme_code")
    lines.append("on conflict do nothing;")
    return "\n".join(lines)

def render(schema, variant_label, schema_create):
    text = template
    text = text.replace("__SCHEMA__", schema)
    text = text.replace("__VARIANT_LABEL__", variant_label)
    text = text.replace("__DATE__", "2026-08-05")
    text = text.replace("__SCHEMA_CREATE__", schema_create)
    text = text.replace("__QUESTIONS_INSERT__", build_questions_sql(schema))
    return text

# ---- socle (public, autonome) ----
socle_sql = render(
    "public",
    "socle - fonctionne seul, schema public, pour un deploiement client independant",
    "-- Schema public : deja present sur tout projet Supabase, rien a creer ici."
)

# ---- bfs (caces, colle Univers BFS) ----
bfs_header = """-- ============================================================================
-- COLLE UNIVERS BFS -- ne pas utiliser seule, complete sql/socle avec la
-- redirection vers le schema dedie `caces` du projet Supabase partage
-- (celui deja utilise par BFS Controle). A coller en UN SEUL onglet du SQL
-- Editor Supabase (le search_path ne se propage pas d'un onglet a l'autre).
-- Rappel : apres execution, ajouter le schema `caces` aux "Exposed schemas"
-- dans Supabase (Settings -> API), sinon l'API REST ne le voit pas.
-- ============================================================================
""".rstrip("\n")
bfs_sql = render(
    "caces",
    "colle Univers BFS - schema dedie caces, projet Supabase partage",
    "create schema if not exists caces;"
)
bfs_sql = bfs_header + "\n\n" + bfs_sql

# ---- reset scripts ----
tables = [
    "session_documents","adequations_session","operations_eliminatoires","attestations_testeur","testeur_codes","session_engins","engin_avis","engin_documents","types_document_engin",
    "parametres_application",
    "suivi_horometre","fise_avis","fise_evaluations","fise_capacite_categories",
    "fise_capacites","testeur_specialisations","journal_audit","certificats",
    "epreuve_pratique_resultats","epreuves_pratique","engins","config_drive",
    "criteres_pratique","qcm_tirage_questions","qcm_tirages","stagiaire_categories",
    "stagiaires","session_categories","sessions_formation","questions_qcm",
    "themes_referentiel","categories_referentiel","centres_examen","referentiels","formateurs",
]

def build_reset(schema, drop_schema):
    lines = [f"-- Reset BFS CACES - schema {schema} -- destructif, usage developpement/test uniquement.", ""]
    lines.append(f"drop view if exists {schema}.v_engins_statut cascade;")
    lines.append(f"drop view if exists {schema}.v_taux_cdt cascade;")
    lines.append(f"drop trigger if exists on_auth_user_created_caces on auth.users;")
    lines.append(f"drop function if exists {schema}.handle_new_user_caces() cascade;")
    lines.append(f"drop function if exists {schema}.caces_role() cascade;")
    lines.append(f"drop function if exists {schema}.caces_stagiaire_infos(text) cascade;")
    lines.append(f"drop function if exists {schema}.caces_demarrer_qcm(text, text) cascade;")
    lines.append(f"drop function if exists {schema}.caces_questions_du_tirage(text, uuid) cascade;")
    lines.append(f"drop function if exists {schema}.caces_repondre(text, uuid, int, boolean) cascade;")
    lines.append(f"drop function if exists {schema}.caces_finaliser_qcm(text, uuid) cascade;")
    lines.append(f"drop function if exists {schema}.caces_purger_sessions_cloturees() cascade;")
    for t in tables:
        lines.append(f"drop table if exists {schema}.{t} cascade;")
    if drop_schema:
        lines.append(f"drop schema if exists {schema} cascade;")
    return "\n".join(lines) + "\n"

socle_reset = build_reset("public", drop_schema=False)
bfs_reset = build_reset("caces", drop_schema=True)

# ---- bootstrap admin ----
def build_bootstrap(schema):
    return f"""-- Bootstrap du premier compte admin BFS CACES - schema {schema}
-- A executer UNE FOIS le compte jeremy.bizeul@gmail.com deja cree (connexion via
-- l'ecran de login de l'appli, qui declenche l'inscription Supabase Auth).
-- Idempotent : peut etre rejoue sans risque (ex. pour reattribuer l'admin
-- a un autre compte plus tard, en changeant l'email ci-dessous).
insert into {schema}.formateurs (id, email, nom, prenom, role, actif)
select id, email, 'Bizeul', 'Jeremy', 'admin', true
from auth.users
where email = 'jeremy.bizeul@gmail.com'
on conflict (id) do update set
  role = 'admin',
  actif = true,
  nom = excluded.nom,
  prenom = excluded.prenom;
"""

socle_bootstrap = build_bootstrap("public")
bfs_bootstrap = build_bootstrap("caces")

# ---- write files ----
def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("wrote", path)

write(os.path.join(OUT, "sql", "socle", "schema_reference.sql"), socle_sql)
write(os.path.join(OUT, "sql", "socle", "reset.sql"), socle_reset)
write(os.path.join(OUT, "sql", "socle", "patch_2026-08-05_schema_initial.sql"), socle_sql)
write(os.path.join(OUT, "sql", "socle", "bootstrap_admin.sql"), socle_bootstrap)

write(os.path.join(OUT, "sql", "bfs", "schema_reference_caces.sql"), bfs_sql)
write(os.path.join(OUT, "sql", "bfs", "reset_caces.sql"), bfs_reset)
write(os.path.join(OUT, "sql", "bfs", "patch_2026-08-05_schema_initial.sql"), bfs_sql)
write(os.path.join(OUT, "sql", "bfs", "bootstrap_admin_caces.sql"), bfs_bootstrap)

print("done")
