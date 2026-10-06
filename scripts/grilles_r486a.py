# -*- coding: utf-8 -*-
"""Grilles pratiques R.486A (annexe A3/2) : catégories B et C + option porte-engins (cat. A et B) -> SQL idempotent."""
import sys
def r(pt, th, lib, pts, var=None, cont=False): return dict(pt=pt, th=th, lib=lib, pts=pts, var=var, cont=cont)
TH = {'pp': ('prise_poste', 'Prise de poste et mise en service'), 'ad': ('adequation', 'Adéquation'), 'fp': ('fin_poste', 'Fin de poste - maintenance'),
      'm1b': ('mise_place_1b', 'Mise en place - Conduite - Manœuvres 1B'), 'c3b': ('conduite_3b', 'Conduite - Manœuvres 3B'),
      'm1': ('mise_place_t1', 'Mise en place - type 1'), 'cc': ('conduite_3b', 'Conduite - Manœuvres 3B'), 'ch': ('chargement', 'Chargement / déchargement sur porte-engins'),
      'op1': ('opt_porte_engins', 'Option porte-engins')}
NOTICE = "Notice d'instructions (justifier une interdiction d'emploi ou une règle d'utilisation)"
RAPPORT = "Rapport de vérification générale périodique, de mise ou de remise en service"
def fin(pt, a, b, c): return [r(pt, 'fp', "Mettre la PEMP en position hors-service", a), r(pt, 'fp', "Réaliser les opérations de maintenance journalière", b), r(pt, 'fp', "Rendre compte des anomalies relevées", c)]
GR = {}
GR['B'] = ([r(1, 'pp', NOTICE, 2), r(1, 'pp', RAPPORT, 2), r(2, 'pp', "Procéder à une vérification visuelle de la PEMP", 4), r(2, 'pp', "Vérifier le bon fonctionnement des mécanismes et des dispositifs de sécurité accessibles", 5),
            r(2, 'pp', "Évaluer les conditions météorologiques", 2), r(3, 'ad', "Vérifier l'adéquation de la PEMP aux opérations à effectuer", 3), r(3, 'ad', "Identifier les risques liés à la zone d'évolution", 3)]
           + [r(4, 'm1b', t, 2, '1B') for t in ["Baliser la zone d'intervention", "Déployer les stabilisateurs", "Régler l'horizontalité de la PEMP", "Replier les stabilisateurs"]]
           + [r(5, 'm1b', "[En continu] " + t, 3, '1B', True) for t in ["Effectuer les manœuvres avec souplesse et précision", "Comprendre / exécuter les gestes de commandement", "Savoir réagir à un signal d'alerte"]]
           + [r(6, 'm1b', t, 3, '1B') for t in ["Positionner la PEMP à un emplacement précis (aire limitée au sol)", "Positionner la PEMP le long d'une paroi plane verticale", "Déplacer la plate-forme le long d'une paroi plane verticale",
                                                "Positionner la plate-forme sous ou au-dessus d'une paroi plane horizontale", "Positionner la plate-forme dans un espace limité", "Effectuer les manœuvres de secours (commandes de secours et de dépannage)"]]
           + [r(7, 'c3b', "[En continu] " + t, p, '3B', True) for t, p in [("Adapter sa conduite aux conditions de circulation (encombrement, virage, obstacle, sol…)", 2), ("Effectuer les manœuvres avec souplesse et précision", 2),
              ("Regarder en arrière avant de reculer", 2), ("Utiliser correctement l'avertisseur sonore", 1), ("Respecter les règles et panneaux de circulation", 1), ("Comprendre / exécuter les gestes de commandement", 1), ("Savoir réagir à un signal d'alerte", 1)]]
           + [r(8, 'c3b', t, p, '3B') for t, p in [("Positionner la PEMP à un emplacement précis (aire limitée au sol)", 2), ("Circuler plate-forme en position haute, orientée dans le sens de la marche, en marche avant / arrière, en ligne droite / en virages", 3),
              ("Circuler plate-forme en position haute, orientée dans le sens inverse de la marche, en marche avant / arrière, en ligne droite / en virages", 3),
              ("Circuler plate-forme en position haute, orientée perpendiculairement au sens de marche, en marche avant / arrière, en ligne droite / en virages", 3),
              ("Positionner la PEMP le long d'une paroi plane verticale", 2), ("Déplacer la plate-forme le long d'une paroi plane verticale", 2), ("Déplacer la plate-forme sous ou au-dessus d'une paroi plane horizontale", 3),
              ("Positionner la plate-forme dans un espace limité", 3), ("Effectuer les manœuvres de secours (commandes de secours et de dépannage)", 3)]]
           + fin(9, 5, 3, 2))
GR['C'] = ([r(1, 'pp', NOTICE, 1), r(1, 'pp', RAPPORT, 2), r(2, 'pp', "Procéder à une vérification visuelle de la PEMP", 3), r(2, 'pp', "Vérifier le bon fonctionnement des mécanismes et des dispositifs de sécurité accessibles", 4),
            r(3, 'ad', "Identifier les risques liés à la zone d'évolution", 10)]
           + [r(4, 'm1', t, p, 'PEMP 1') for t, p in [("Baliser la zone d'intervention", 5), ("Déployer les stabilisateurs", 3), ("Régler l'horizontalité de la PEMP", 6), ("Replier les stabilisateurs", 3)]]
           + [r(5, 'cc', "[En continu] " + t, 2, 'PEMP 3B', True) for t in ["Adapter sa conduite aux conditions de circulation (encombrement, virage, obstacle, sol…)", "Effectuer les manœuvres avec souplesse et précision", "Regarder en arrière avant de reculer",
              "Utiliser correctement l'avertisseur sonore", "Respecter les règles et panneaux de circulation", "Comprendre / exécuter les gestes de commandement", "Savoir réagir à un signal d'alerte"]]
           + [r(6, 'cc', t, p, 'PEMP 3B') for t, p in [("Positionner la PEMP à un emplacement précis (aire limitée au sol)", 4), ("Circuler plate-forme en position basse, orientée dans le sens de la marche, en marche avant / arrière, en ligne droite / en virages", 6),
              ("Circuler plate-forme en position basse, orientée dans le sens inverse de la marche, en marche avant / arrière, en ligne droite / en virages", 6), ("Effectuer les manœuvres de secours (commandes de secours et de dépannage)", 6)]]
           + [r(7, 'ch', "Chargement : " + t, 2) for t in ["S'assurer de l'adéquation de la PEMP et du porte-engins", "Vérifier que les conditions permettant le chargement / déchargement sont remplies (position du porte-engins, espacement des rampes…)", "Monter la PEMP sur le porte-engins dans le sens approprié"]]
           + [r(8, 'ch', "Préparation au transport : " + t, p) for t, p in [("Positionner la PEMP sur le porte-engins pour assurer l'équilibre et la stabilité", 2), ("Mettre la PEMP en configuration de transport et la stabiliser (frein, stabilisateurs, cales…)", 3)]]
           + [r(9, 'ch', "Préparation de l'arrimage : " + t, 2) for t in ["Identifier et désigner les points d'arrimage sur le porte-engins et sur la PEMP", "Trouver le mode d'arrimage approprié (notice d'instructions…)", "S'assurer de l'adéquation des moyens d'arrimage proposés"]]
           + [r(10, 'ch', "Déchargement : " + t, p) for t, p in [("S'assurer que l'environnement du porte-engins permet le déchargement", 2), ("Positionner la PEMP pour la descente et la descendre en sécurité", 3)]]
           + fin(11, 2, 2, 1))
OPT = [r(1, 'op1', t, p) for t, p in [("S'assurer de l'adéquation de la PEMP et du porte-engins à la manœuvre prévue", 3), ("S'assurer que la position du véhicule est appropriée", 3),
        ("Vérifier que les conditions permettant le chargement / déchargement sont remplies (espacement des rampes)", 3), ("Monter la PEMP sur le porte-engins dans le sens approprié", 6)]] \
    + [r(2, 'op1', t, p) for t, p in [("Positionner la PEMP sur le porte-engins pour assurer l'équilibre et la stabilité", 4), ("Mettre la PEMP en configuration de transport", 3), ("Stabiliser la PEMP (freins, stabilisateurs, cales…)", 3)]] \
    + [r(3, 'op1', t, p) for t, p in [("Identifier et désigner les points d'arrimage sur le porte-engins", 2), ("Identifier et désigner les points d'arrimage sur la PEMP", 2), ("Trouver le mode d'arrimage approprié (notice d'instructions…)", 3), ("S'assurer de l'adéquation des moyens d'arrimage proposés", 3)]] \
    + [r(4, 'op1', t, p) for t, p in [("S'assurer que l'environnement du porte-engins permet le déchargement", 3), ("Positionner la PEMP pour la descente", 5), ("Descendre la PEMP en sécurité", 7)]]
ATT = {'B': dict(pp=15, ad=6, m1b=35, c3b=34, fp=10), 'C': dict(pp=10, ad=10, m1=17, cc=36, ch=22, fp=5)}
def q(s): return "'" + s.replace("'", "''") + "'"
def sql():
    assert sum(x['pts'] for x in OPT) == 50
    out = ["-- Grilles pratiques R.486A (annexe A3/2) : catégories B et C + option porte-engins (50 pts, cat. A et B). Générées par scripts/grilles_r486a.py (totaux contrôlés). Idempotent."]
    for cat, rows in GR.items():
        t = {}
        for x in rows: t[x['th']] = t.get(x['th'], 0) + x['pts']
        assert sum(t.values()) == 100 and t == ATT[cat], (cat, t)
    def bloc(cat, rows, start=0, opt=False):
        vals = []
        for i, x in enumerate(rows, start + 1):
            code, lib = TH[x['th']]
            vals.append("  ('R486A', %s, %s, %s, %d, false, %d, %d, %s, %s, %s)" % (q(cat), q(code), q(x['lib']), x['pts'], i, x['pt'] + (100 if opt else 0), 'true' if x['cont'] else 'false', q(x['var']) if x['var'] else 'null', q(lib)))
        return vals
    cols = "(referentiel_code, categorie_code, theme_code, libelle, bareme_points, eliminatoire, ordre, point_numero, en_continu, variante, theme_libelle)"
    upd = " on conflict (referentiel_code, categorie_code, ordre) do update set theme_code = excluded.theme_code, libelle = excluded.libelle, bareme_points = excluded.bareme_points, eliminatoire = excluded.eliminatoire, point_numero = excluded.point_numero, en_continu = excluded.en_continu, variante = excluded.variante, theme_libelle = excluded.theme_libelle;"
    for cat, rows in GR.items():
        v = bloc(cat, rows)
        if cat == 'B': v += bloc(cat, OPT, len(rows), True)
        out.append("insert into caces.criteres_pratique " + cols + " values\n" + ",\n".join(v) + "\n" + upd)
    out.append("insert into caces.criteres_pratique " + cols + " values\n" + ",\n".join(bloc('A', OPT, 38, True)) + "\n" + upd)
    return "\n".join(out) + "\n"
if __name__ == '__main__':
    s = sql(); open(sys.argv[1], 'w', encoding='utf-8').write(s); print('ok')
