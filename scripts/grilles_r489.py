# -*- coding: utf-8 -*-
"""Grilles pratiques R.489 (annexe A3/2) -> SQL idempotent. Contrôle des totaux (100 / thème)."""
import sys
TH = {'pp': ('prise_poste', 'Prise de poste et mise en service', 10), 'co': ('conduite', 'Conduite', None),
      'ma': ('manoeuvres', 'Manœuvres', 55), 'fp': ('fin_poste', 'Fin de poste - maintenance', 15)}
NOTICE = "Notice d'instructions (justifier une interdiction d'emploi ou une règle d'utilisation)"
RAPPORT = "Rapport de vérification générale périodique, de mise ou de remise en service"
VISU = "Procéder à une vérification visuelle du chariot"
REGL = "Effectuer les différents réglages relatifs au poste de conduite"
FONC = "Vérifier le bon fonctionnement des mécanismes et des dispositifs de sécurité"
VIDE = "Circuler à vide (marche avant/arrière, ligne droite/virage, arrêt) - évalué en continu"
CHARGE = "Circuler en charge (marche avant/arrière, ligne droite/virage, arrêt) - évalué en continu"
ADEQ = "S'assurer de l'adéquation du chariot à la manutention à réaliser"
FIN = [("Réaliser les opérations de fin de poste", 5), ("Réaliser les opérations de maintenance journalière", 5), ("Rendre compte des anomalies relevées", 5)]
PRISE = "Prise/dépose au sol : "
GERB = "Gerbage/dégerbage (≥ 3 charges) : "
VEH = "Chargement/déchargement véhicule depuis le sol : "
LONG = "Charge longue/conteneur liquide/charge déformable : "
GERB_DETAIL = ["Apprécier le nombre maximal de niveaux empilables en fonction des charges", "Positionner le chariot face aux charges / positionner les charges sur la fourche",
               "Empiler les charges avec précision sans compromettre la stabilité de la pile", "Dépiler les charges et les déposer à l'endroit prévu"]
STOCK_DETAIL = ["Localiser les emplacements définis / évaluer les risques selon les charges", "Vérifier les charges (état de la palette, qualité du conditionnement, stabilité)",
                "Positionner le chariot / prendre et déposer les charges sans heurts", "Déstocker les charges et les déposer à l'endroit prévu"]
VEH_DETAIL = ["Définir la position appropriée du véhicule / conditions autorisant l'opération", "Déposer au moins 3 charges en équilibrant le chargement", "Décharger le véhicule et déposer les charges à l'endroit prévu"]
LONG_DETAIL = ["Définir la méthode de prise et de manutention de la charge", "Mettre en œuvre les moyens adaptés / déposer chaque charge avec précision"]

def pt(n, th, libelle, pts, cont=False): return dict(pt=n, th=th, lib=libelle, pts=pts, cont=cont)
def fin(n): return [pt(n, 'fp', l, p) for l, p in FIN]
def prise_depose(n, a, b, c, pre=PRISE): return [pt(n, 'ma', pre + ADEQ, a), pt(n, 'ma', pre + "Positionner le chariot pour la prise / positionner la palette sur la fourche", b), pt(n, 'ma', pre + "Déposer la palette avec précision à l'endroit prévu", c)]
def series(n, pre, textes, pts): return [pt(n, 'ma', pre + t, p) for t, p in zip(textes, pts)]

GRILLES = {}
# --- 1A / 1B : un seul tableau, deux colonnes ---
def g1(col):  # col 0 = 1A, 1 = 1B
    v = lambda a, b: (a, b)[col]
    rows = [pt(1, 'pp', NOTICE, 1), pt(1, 'pp', RAPPORT, 1), pt(1, 'pp', VISU, 4), pt(1, 'pp', FONC, 4),
            pt(2, 'co', VIDE, 10, True), pt(3, 'co', CHARGE, 10, True)]
    rows += prise_depose(4, v(7, 3), v(7, 3), v(7, 3))
    if col == 1:
        rows += series(5, GERB, [ADEQ] + GERB_DETAIL, [3, 3, 3, 4, 3])
        rows += series(6, "Stockage/déstockage (3 palettes, 3 niveaux, du sol à 2,90 m mini) : ", [ADEQ] + STOCK_DETAIL, [3, 3, 3, 3, 3])
    rows += series(7, VEH.replace('depuis le sol', "par l'arrière depuis un quai"),
                   ["S'assurer de l'adéquation du chariot et du véhicule à la manutention à réaliser", "Mettre en œuvre les moyens d'accès en sécurité au véhicule",
                    "Adapter la vitesse et la trajectoire du chariot", "Prendre et déposer 3 charges conformément au plan de chargement", "Décharger le véhicule et déposer les charges à l'endroit prévu"],
                   [7, 7, 6, 7, 7] if col == 0 else [3, 3, 3, 3, 3])
    return rows + fin(8)
GRILLES['1A'] = g1(0); GRILLES['1B'] = g1(1)
# --- 2A / 2B ---
base2 = [pt(1, 'pp', NOTICE, 1), pt(1, 'pp', RAPPORT, 1), pt(1, 'pp', VISU, 3), pt(1, 'pp', REGL, 2), pt(1, 'pp', FONC, 3)]
GRILLES['2A'] = base2 + [pt(2, 'co', VIDE, 16, True), pt(3, 'co', CHARGE, 16, True),
    pt(6, 'co', "Circuler en sécurité, s'arrêter et redémarrer sur un plan incliné et/ou un dévers, en charge", 8),
    pt(7, 'ma', ADEQ, 20),
    pt(8, 'ma', "Déterminer la position appropriée d'une charge donnée sur le plateau porteur", 5),
    pt(8, 'ma', "Guider le cariste ou le pontier pour le positionnement de la charge à l'endroit défini", 5),
    pt(8, 'ma', "Arrimer la charge sur le plateau porteur", 5)] + fin(10)
GRILLES['2B'] = base2 + [pt(4, 'co', "Circuler avec au moins une remorque vide attelée au chariot (marche avant/arrière, ligne droite/virage, arrêt) - évalué en continu", 16, True),
    pt(5, 'co', "Circuler avec au moins une remorque chargée attelée au chariot (marche avant/arrière, ligne droite/virage, arrêt) - évalué en continu", 16, True),
    pt(6, 'co', "Circuler en sécurité, s'arrêter et redémarrer sur un plan incliné et/ou un dévers, en charge", 8),
    pt(7, 'ma', ADEQ, 20),
    pt(9, 'ma', "Atteler une (ou plusieurs) remorque(s) au chariot", 5),
    pt(9, 'ma', "Arrimer une charge sur la remorque", 5),
    pt(9, 'ma', "Décrocher la (ou les) remorque(s)", 5)] + fin(10)
# --- 4 ---
HEAD = [pt(1, 'pp', NOTICE, 1), pt(1, 'pp', RAPPORT, 1), pt(1, 'pp', VISU, 3), pt(1, 'pp', REGL, 2), pt(1, 'pp', FONC, 3), pt(2, 'co', VIDE, 10, True), pt(3, 'co', CHARGE, 10, True)]
GRILLES['4'] = HEAD + prise_depose(4, 4, 3, 3) + series(5, GERB, [ADEQ] + GERB_DETAIL, [4, 4, 4, 4, 3]) \
    + series(6, VEH, [ADEQ] + VEH_DETAIL, [4, 4, 4, 3]) + series(7, LONG, [ADEQ] + LONG_DETAIL, [4, 4, 3]) + fin(8)
# --- 5 ---
GRILLES['5'] = HEAD + prise_depose(4, 5, 4, 4) + series(5, GERB, [ADEQ] + GERB_DETAIL, [5, 4, 4, 4, 4]) \
    + series(6, "Stockage/déstockage (4 palettes, 4 niveaux, du sol à 6 m mini) : ", [ADEQ] + STOCK_DETAIL, [5, 4, 4, 4, 4]) + fin(7)
# --- 6 ---
GRILLES['6'] = HEAD[:5] + [pt(2, 'co', VIDE, 10, True), pt(3, 'co', CHARGE, 10, True),
    pt(4, 'co', "Circuler à vide et en charge en allée réservée (marche avant/arrière, montée/descente à différents niveaux)", 10)] \
    + prise_depose(5, 5, 5, 4) \
    + series(6, "Constitution d'une palette par picking (plancher 2,80 m mini) : ", [ADEQ, "Positionner correctement le chariot lors des déplacements dans les allées",
        "Adapter la hauteur de la cabine en fonction du plan de picking", "Adapter la hauteur de la palette en fonction du plan de dépose", "Déposer la palette constituée en dehors de l'allée de préparation"], [5, 5, 4, 4, 4]) \
    + [pt(7, 'ma', "Manœuvre de secours : effectuer une manœuvre de secours", 5), pt(7, 'ma', "Manœuvre de secours : faire effectuer une manœuvre de secours", 4)] + fin(8)
# --- 7 : deux chariots, chacun doit réussir (variantes N1 / N2, points et thèmes distincts) ---
def g7(n2):
    v = lambda a, b: b if n2 else a
    rows = [pt(1, 'pp', NOTICE, 1), pt(1, 'pp', RAPPORT, 1), pt(1, 'pp', VISU, v(4, 3))]
    if n2: rows.append(pt(1, 'pp', REGL, 2))
    rows += [pt(1, 'pp', FONC, v(4, 3)), pt(2, 'co', "Circuler à vide avec le chariot - évalué en continu", 20, True), pt(3, 'co', "Circuler en charge avec le chariot - évalué en continu", 20, True)]
    rows += prise_depose(4, 5, 4, 4)
    rows += series(5, "Chargement/déchargement du chariot sur un véhicule de transport : ", ["S'assurer de l'adéquation du chariot et du véhicule à la manœuvre prévue",
        "S'assurer que la position du véhicule est appropriée et que les conditions du chargement/déchargement sont remplies", "Positionner le chariot / monter sur le véhicule / mettre le chariot en sécurité",
        "Identifier les points d'arrimage / s'assurer de l'adéquation des moyens d'arrimage proposés", "Décharger le chariot et le ramener à l'endroit prévu"], [5, 4, 5, 4, 4])
    return rows + fin(6)
GRILLES['7'] = ('N1', g7(False), 'N2', g7(True))
TOT_THEMES = {'1A': {'pp': 10, 'co': 20, 'ma': 55, 'fp': 15}, '1B': {'pp': 10, 'co': 20, 'ma': 55, 'fp': 15}, '2A': {'pp': 10, 'co': 40, 'ma': 35, 'fp': 15},
              '2B': {'pp': 10, 'co': 40, 'ma': 35, 'fp': 15}, '4': {'pp': 10, 'co': 20, 'ma': 55, 'fp': 15}, '5': {'pp': 10, 'co': 20, 'ma': 55, 'fp': 15},
              '6': {'pp': 10, 'co': 30, 'ma': 45, 'fp': 15}, '7N1': {'pp': 10, 'co': 40, 'ma': 35, 'fp': 15}, '7N2': {'pp': 10, 'co': 40, 'ma': 35, 'fp': 15}}
def verifier(nom, rows):
    t = {}
    for r in rows: t[r['th']] = t.get(r['th'], 0) + r['pts']
    assert sum(t.values()) == 100 and t == TOT_THEMES[nom], (nom, t)

def q(s): return "'" + s.replace("'", "''") + "'"
def sql():
    out = ["-- Grilles pratiques R.489 (annexe A3/2) : catégories 1A, 1B, 2A, 2B, 4, 5, 6, 7. Générées par scripts/grilles_r489.py (totaux contrôlés : 100 pts, total par thème).",
           "-- Idempotent : rejouable (met à jour par (référentiel, catégorie, ordre))."]
    for cat, rows in GRILLES.items():
        blocs = [(cat, rows, None, 0, '')] if cat != '7' else [('7', rows[1], 'N1', 0, ''), ('7', rows[3], 'N2', 10, '_n2')]
        ordre0 = 0
        for c, rs, var, off, suf in blocs:
            verifier(c if c != '7' else '7' + var, rs)
            vals = []
            for i, r in enumerate(rs, 1):
                code, lib, _ = TH[r['th']]
                libt = lib + (' - chariot ' + var if var else '')
                vals.append("  ('R489', %s, %s, %s, %d, false, %d, %d, %s, %s, %s)" % (q(c), q(code + suf), q(r['lib']), r['pts'], ordre0 + i, r['pt'] + off,
                            'true' if r['cont'] else 'false', q(var) if var else 'null', q(libt)))
            ordre0 += len(rs)
            out.append("insert into caces.criteres_pratique (referentiel_code, categorie_code, theme_code, libelle, bareme_points, eliminatoire, ordre, point_numero, en_continu, variante, theme_libelle) values\n"
                       + ",\n".join(vals) + "\non conflict (referentiel_code, categorie_code, ordre) do update set theme_code = excluded.theme_code, libelle = excluded.libelle, "
                       "bareme_points = excluded.bareme_points, eliminatoire = excluded.eliminatoire, point_numero = excluded.point_numero, en_continu = excluded.en_continu, "
                       "variante = excluded.variante, theme_libelle = excluded.theme_libelle;")
    return "\n".join(out) + "\n"
if __name__ == '__main__':
    s = sql(); open(sys.argv[1], 'w', encoding='utf-8').write(s); print('ok', s.count('\n  (') , 'critères')
