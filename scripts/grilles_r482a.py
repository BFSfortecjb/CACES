# -*- coding: utf-8 -*-
"""Grilles pratiques R.482A (annexe A3/2) + options porte-engins / télécommande -> SQL idempotent.
Totaux contrôlés (100 par engin, 50 par option, total par thème)."""
import sys
TL = {'pp': ('prise_poste', 'Prise de poste et mise en service'), 'ad': ('adequation', 'Adéquation'), 'co': ('conduite', 'Conduite et circulation'),
      'tb': ('travaux_base', 'Travaux de base'), 'lv': ('levage', 'Opération de levage'), 'ch': ('chargement', 'Chargement / déchargement sur porte-engins'),
      'fp': ('fin_poste', 'Fin de poste - maintenance'),
      'op1': ('opt_porte_engins', 'Option porte-engins'), 'op2': ('opt_telecommande', 'Option télécommande')}
def r(pt, th, lib, pts, cont=False): return dict(pt=pt, th=th, lib=lib, pts=pts, cont=cont)
NOTICE = "Notice d'instructions (justifier une interdiction d'emploi ou une règle d'utilisation)"
RAPPORT = "Rapport de vérification générale périodique, de mise ou de remise en service"
def prise(a, vis, niv, acc, visib, sieg, dem, org, sec, issue):
    return [r(1, 'pp', NOTICE, 1), r(1, 'pp', RAPPORT, 1), r(1, 'pp', "Procéder à une vérification visuelle de l'engin de chantier", vis), r(1, 'pp', "Identifier les niveaux et les appoints journaliers", niv),
            r(1, 'pp', "Accéder au poste de conduite en sécurité (règle des 3 points d'appui)", acc), r(1, 'pp', "Effectuer les opérations nécessaires (réglages, nettoyage…) pour assurer la visibilité depuis le poste de conduite", visib),
            r(1, 'pp', "Effectuer le réglage du siège (position et suspension)", sieg), r(1, 'pp', "Démarrer l'engin en respectant le mode opératoire prescrit", dem),
            r(1, 'pp', "Vérifier le bon fonctionnement des organes de service et des différents indicateurs du tableau de bord", org),
            r(1, 'pp', "Vérifier le bon fonctionnement des dispositifs de sécurité", sec), r(1, 'pp', "Identifier la position de l'issue de secours et savoir expliquer sa mise en œuvre", issue)]
P16 = lambda: prise(0, 1, 1, 2, 2, 2, 2, 1, 2, 1)
def conduite(n, vals, regles=True, extra=None):
    noms = ["Effectuer les manœuvres avec souplesse et précision", "Vérifier au préalable l'environnement de travail", "Garantir la sécurité des piétons (vision en marche arrière, utilisation correcte de l'avertisseur sonore…)",
            "Respecter les conditions de stabilité de l'engin", "Maîtriser la sélection des vitesses", "Utiliser correctement les dispositifs de freinage", "Recourir de façon appropriée aux aides à la conduite disponibles"]
    rows = [r(n, 'co', "[En continu] " + t, v, True) for t, v in zip(noms, vals)]
    if regles: rows.append(r(n, 'co', "[En continu] Respecter les règles et panneaux de circulation", 2, True))
    return rows
C42 = lambda n=2: conduite(n, [10, 5, 5, 5, 5, 5, 5])
def levage(n, pts=(4, 4, 4, 4)):
    t = ["Vérifier la présence des dispositifs de sécurité", "S'assurer de l'adéquation de l'engin à la manutention à réaliser", "Déterminer sur l'abaque de charge les charges / portées autorisées", "Effectuer l'opération de levage (prise et dépose d'une charge au sol)"]
    return [r(n, 'lv', a, p) for a, p in zip(t, pts)]
def fin(n):
    t = ["Stationner l'engin en sécurité", "Positionner les équipements de façon appropriée", "Mettre en œuvre les sécurités", "Arrêter le moteur de l'engin en respectant le mode opératoire prescrit", "Quitter le poste de conduite en sécurité (règle des 3 points d'appui)", "Mettre l'engin à l'arrêt"]
    return [r(n, 'fp', a, 2) for a in t]
def porte_engins(n, th, pts):  # grille de chargement/déchargement sur porte-engins
    t = [("S'assurer de l'adéquation de l'engin et du porte-engins à la manœuvre prévue", 0), ("S'assurer que la position du véhicule est appropriée", 1),
         ("Vérifier que les conditions permettant le chargement / déchargement sont remplies (espacement des rampes…)", 2), ("Monter l'engin sur le porte-engins dans le sens approprié", 3),
         ("Positionner l'engin sur le porte-engins pour assurer l'équilibre et la stabilité", 4), ("Mettre les équipements en position de transport", 5), ("Stabiliser l'engin (frein, stabilisateurs, cales…)", 6),
         ("Identifier et désigner les points d'arrimage sur le porte-engins", 7), ("Identifier et désigner les points d'arrimage sur l'engin", 8), ("Trouver le mode d'arrimage approprié (notice d'instructions…)", 9),
         ("S'assurer de l'adéquation des moyens d'arrimage proposés", 10), ("S'assurer que l'environnement du porte-engins permet le déchargement", 11), ("Positionner l'engin pour la descente", 12), ("Descendre l'engin en sécurité", 13)]
    return [r(n, th, a, pts[i]) for (a, i) in t]

G = {}   # cat -> liste de (variante, lignes, offset_points, suffixe_theme)
# --- A : N°1 PH + N°2 (MB | CH | CP) ---
def travaux_A(kind):
    if kind == 'PH': return [r(3, 'tb', "Charger une unité de transport", 8), r(4, 'tb', "Effectuer une opération de déblai / remblai avec mise en stock", 8), r(5, 'tb', "Réaliser une tranchée", 8)]
    if kind == 'MB': return [r(6, 'tb', "Positionner l'engin pour le chargement", 8), r(7, 'tb', "Vider la benne", 8), r(9, 'tb', "Approcher un talus", 8)]
    if kind == 'CH': return [r(3, 'tb', "Charger une unité de transport", 12), r(4, 'tb', "Effectuer une opération de déblai / remblai avec mise en stock", 12)]
    if kind == 'CP': return [r(8, 'tb', "Compacter une plate-forme ou une piste", 12), r(9, 'tb', "Approcher un talus", 12)]
CHA = lambda n: porte_engins(n, 'ch', [1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2])
PRISE14 = lambda: prise(0, 1, 1, 1, 2, 1, 2, 1, 2, 1)
G['A'] = [('N°1 PH', PRISE14() + conduite(2, [4, 3, 3, 3, 1, 3, 3]) + travaux_A('PH') + levage(10) + CHA(11) + [r(12, 'fp', t, p) for t, p in zip(
              ["Stationner l'engin en sécurité", "Positionner les équipements de façon appropriée", "Mettre en œuvre les sécurités", "Arrêter le moteur de l'engin en respectant le mode opératoire prescrit",
               "Quitter le poste de conduite en sécurité (règle des 3 points d'appui)", "Mettre l'engin à l'arrêt"], [2, 1, 1, 1, 2, 1])], 0, ''),
          ] + [('N°2/' + k, PRISE14() + conduite(2, [6, 5, 5, 5, 5, 5, 5]) + travaux_A(k) + CHA(11) + [r(12, 'fp', t, p) for t, p in zip(
              ["Stationner l'engin en sécurité", "Positionner les équipements de façon appropriée", "Mettre en œuvre les sécurités", "Arrêter le moteur de l'engin en respectant le mode opératoire prescrit",
               "Quitter le poste de conduite en sécurité (règle des 3 points d'appui)", "Mettre l'engin à l'arrêt"], [2, 1, 1, 1, 2, 1])], 20, '_n2') for k in ('MB', 'CH', 'CP')]
G['B1'] = [(None, P16() + conduite(2, [6, 3, 3, 3, 1, 3, 3]) + [r(3, 'tb', "Charger une unité de transport", 10), r(4, 'tb', "Effectuer une opération de déblai / remblai avec mise en stock", 10), r(5, 'tb', "Réaliser une tranchée", 10)] + levage(6, (4, 4, 4, 6)) + fin(7), 0, '')]
# B2 : CA (conducteur accompagnant + télécommande) | CP (conducteur porté)
FORAGE = [("Configurer la machine en mode forage", 2), ("Positionner la machine par rapport au point de forage", 3), ("Stabiliser la machine en fonction de la nature du sol", 3), ("S'assurer de l'orientation correcte du mât de forage", 3),
          ("Positionner le poste de commande afin de disposer d'une bonne visibilité sur la zone de travail", 3), ("Aménager la plate-forme de travail pour permettre l'évacuation des sédiments", 3),
          ("Approvisionner et organiser l'unité de travail (fluides, outillages, consommables…)", 3), ("Procéder au forage", 10), ("Réaliser le retrait des tiges de forage", 5), ("Assurer le démontage des raccords, tubes, tiges, outils…", 3),
          ("Procéder à la configuration de la machine en mode déplacement", 2)]
def b2(ca):
    pp = [r(1, 'pp', NOTICE, 1), r(1, 'pp', RAPPORT, 1), r(1, 'pp', "Procéder à une vérification visuelle de l'engin de chantier", 1), r(1, 'pp', "Identifier les niveaux et les appoints journaliers", 1)]
    if ca:
        pp += [r(1, 'pp', "Démarrer l'engin en respectant le mode opératoire prescrit", 2), r(1, 'pp', "Vérifier le fonctionnement de la télécommande (équipements de transmission, boutons, voyants…), notamment l'arrêt d'urgence et la clé de condamnation", 2),
               r(1, 'pp', "Vérifier l'impossibilité de fonctionnement simultané de la télécommande et du poste de conduite principal", 2), r(1, 'pp', "Énumérer les risques liés à l'utilisation de la télécommande", 2),
               r(1, 'pp', "Savoir se positionner par rapport à la zone de travail", 2), r(1, 'pp', "Vérifier le bon fonctionnement des dispositifs de sécurité", 2)]
    else:
        pp += [r(1, 'pp', "Accéder au poste de conduite en sécurité (règle des 3 points d'appui)", 2), r(1, 'pp', "Effectuer les opérations nécessaires (réglages, nettoyage…) pour assurer la visibilité depuis le poste de conduite", 2),
               r(1, 'pp', "Effectuer le réglage du siège (position et suspension)", 2), r(1, 'pp', "Démarrer l'engin en respectant le mode opératoire prescrit", 2),
               r(1, 'pp', "Vérifier le bon fonctionnement des organes de service et des différents indicateurs du tableau de bord", 1), r(1, 'pp', "Vérifier le bon fonctionnement des dispositifs de sécurité", 2),
               r(1, 'pp', "Identifier la position de l'issue de secours et savoir expliquer sa mise en œuvre", 1)]
    fp = [r(4, 'fp', t, 2) for t in ["Stationner l'engin en sécurité", "Positionner les équipements de façon appropriée", "Mettre en œuvre les sécurités", "Arrêter le moteur de l'engin en respectant le mode opératoire prescrit"]]
    fp += [r(4, 'fp', "Mettre la télécommande à l'arrêt et la ranger", 2)] if ca else [r(4, 'fp', "Quitter le poste de conduite en sécurité (règle des 3 points d'appui)", 2)]
    fp += [r(4, 'fp', "Mettre l'engin à l'arrêt", 2)]
    return pp + conduite(2, [8, 4, 4, 4, 4, 4, 4], regles=False) + [r(3, 'tb', "Réaliser un forage : " + t, p) for t, p in FORAGE] + fp
G['B2'] = [('Engin/CA', b2(True), 0, ''), ('Engin/CP', b2(False), 0, '')]
G['B3'] = [(None, prise(0, 1, 1, 2, 2, 1, 2, 1, 1, 1)[:-1] + [r(1, 'pp', "Vérifier la présence et l'état des accessoires de levage", 1), r(1, 'pp', "Vérifier le bon fonctionnement des mécanismes de montée / descente des lorries", 1),
            r(1, 'pp', "Vérifier le bon fonctionnement du groupe de secours", 1), r(1, 'pp', "Identifier la position de l'issue de secours et savoir expliquer sa mise en œuvre", 1)]
            + conduite(2, [5, 3, 3, 3, 1, 2, 3], regles=False)[:6] + [r(2, 'co', "[En continu] Effectuer en sécurité les manœuvres de montée / descente de banquette et d'enraillement / déraillement", 3, True),
                                                                      r(2, 'co', "[En continu] Recourir de façon appropriée aux aides à la conduite disponibles", 3, True)]
            + [r(3, 'tb', "Charger une unité de transport", 10), r(4, 'tb', "Effectuer une opération de déblai / remblai avec mise en stock", 10), r(5, 'tb', "Réaliser une tranchée", 10)]
            + [r(6, 'lv', "Vérifier la présence des dispositifs de sécurité", 4), r(6, 'lv', "S'assurer de l'adéquation de l'engin à la manutention à réaliser", 4), r(6, 'lv', "Déterminer sur l'abaque de charge les charges / portées autorisées", 4),
               r(6, 'lv', "Effectuer l'opération de levage (prise, circulation en charge et dépose d'une charge au sol)", 6)] + fin(7), 0, '')]
G['C1'] = [('Engin/Ch', P16() + conduite(2, [10, 3, 3, 3, 3, 5, 3]) + [r(3, 'tb', "Charger une unité de transport", 20), r(4, 'tb', "Effectuer une opération de déblai / remblai avec mise en stock", 20)] + fin(7), 0, ''),
           ('Engin/CP', P16() + conduite(2, [6, 3, 3, 3, 1, 3, 3]) + [r(3, 'tb', "Charger une unité de transport", 16), r(5, 'tb', "Réaliser une tranchée", 16)] + levage(6) + fin(7), 0, '')]
G['C2'] = [(None, P16() + C42() + [r(3, 'tb', "Réaliser le réglage d'une plate-forme", 15), r(4, 'tb', "Exécuter un déblai / remblai", 15)] + fin(5), 0, '')]
G['C3'] = [(None, P16() + C42() + [r(3, 'tb', "Réaliser le réglage d'une plate-forme", 15), r(4, 'tb', "Réaliser le réglage d'un talus ou d'un fossé avec la lame déportée", 15)] + fin(5), 0, '')]
G['D'] = [(None, P16() + C42() + [r(3, 'tb', "Effectuer le compactage d'une plate-forme", 30)] + fin(4), 0, '')]
G['E'] = [(None, P16() + C42() + [r(3, 'tb', "Positionner le tombereau pour le chargement", 10), r(4, 'tb', "Effectuer un parcours test en montant les vitesses et en utilisant correctement les dispositifs de freinage", 10),
                                  r(5, 'tb', "Positionner le tombereau pour le déchargement et vider la benne", 10)] + fin(6), 0, '')]
G['F'] = [(None, P16() + [r(2, 'ad', "Prendre connaissance des abaques de charge et savoir déterminer la capacité du chariot en fonction de la hauteur et de la portée, dans les différentes configurations", 4),
                          r(2, 'ad', "S'assurer de l'adéquation du chariot à la manutention à réaliser (capacité, hauteur, portée…)", 4),
                          r(2, 'ad', "Vérifier que la configuration de la charge (support, nature, homogénéité, stabilité…) est compatible avec le levage", 4)]
          + conduite(3, [8, 3, 3, 8, 2, 2, 2]) + [r(4, 'tb', "Charger et décharger un camion (en utilisant au moins 3 charges)", 15), r(5, 'tb', "Manutentionner une charge longue", 5),
                                                  r(6, 'tb', "Manutentionner une charge lourde", 5), r(7, 'tb', "Manutentionner une charge complexe", 5)] + fin(8), 0, '')]
def g_rows(off=0):
    return P16() + conduite(2, [8, 5, 5, 5, 5, 5, 5]) + porte_engins(3, 'ch', [2, 2, 2, 4, 2, 2, 2, 2, 2, 2, 2, 2, 2, 4]) + fin(7)
G['G'] = [('N°1 chenilles', g_rows(), 0, ''), ('N°2 pneus ou cylindres', g_rows(), 10, '_n2')]
# renumérotation des points de la catégorie G (3 à 6) : 3 chargement, 4 préparation transport, 5 arrimage, 6 déchargement
_pt_g = [3, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6]
for k in (0, 1):
    rows = G['G'][k][1]; idx = [i for i, x in enumerate(rows) if x['th'] == 'ch']
    for i, p in zip(idx, _pt_g): rows[i]['pt'] = p
OPT = {
    'porte_engins': [r(1, 'op1', t, p) for t, p in [("S'assurer de l'adéquation de l'engin et du porte-engins à la manœuvre prévue", 3), ("S'assurer que la position du véhicule est appropriée", 3),
        ("Vérifier que les conditions permettant le chargement / déchargement sont remplies (espacement des rampes…)", 3), ("Monter l'engin sur le porte-engins dans le sens approprié", 6)]]
        + [r(2, 'op1', t, p) for t, p in [("Positionner l'engin sur le porte-engins pour assurer l'équilibre et la stabilité", 4), ("Mettre les équipements en position de transport", 3), ("Stabiliser l'engin (frein, stabilisateurs, cales…)", 3)]]
        + [r(3, 'op1', t, p) for t, p in [("Identifier et désigner les points d'arrimage sur le porte-engins", 2), ("Identifier et désigner les points d'arrimage sur l'engin", 2), ("Trouver le mode d'arrimage approprié (notice d'instructions…)", 3), ("S'assurer de l'adéquation des moyens d'arrimage proposés", 3)]]
        + [r(4, 'op1', t, p) for t, p in [("S'assurer que l'environnement du porte-engins permet le déchargement", 3), ("Positionner l'engin pour la descente", 5), ("Descendre l'engin en sécurité", 7)]],
    'telecommande': [r(1, 'op2', t, p) for t, p in [("Vérifier le fonctionnement de la télécommande (équipements de transmission, boutons, voyants…), notamment l'arrêt d'urgence et la clé de condamnation", 6),
        ("Vérifier l'impossibilité de fonctionnement simultané de la télécommande et du poste de conduite principal", 4), ("Énumérer les risques liés à l'utilisation de la télécommande", 6), ("Savoir se positionner par rapport à la zone de travail et d'évolution de l'engin", 4)]]
        + [r(2, 'op2', t, p) for t, p in [("[En continu] Vérifier au préalable l'environnement de travail", 3), ("[En continu] Se positionner pour avoir la meilleure vision de la manœuvre et de son environnement, tout en restant hors de la zone de risque", 4),
        ("[En continu] Garantir la sécurité des piétons", 4), ("[En continu] Effectuer les manœuvres avec souplesse et précision", 4)]]
        + [r(3, 'op2', "Au moyen de la télécommande, réaliser les travaux pour lesquels l'engin est conçu (critères de la grille de la catégorie)", 15)],
}
OPT_CATS = {'porte_engins': ['B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D', 'E', 'F'], 'telecommande': ['A', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D', 'E', 'F', 'G']}
THEMES_ATTENDUS = {'A': {'N°1 PH': dict(pp=14, co=22, tb=24, lv=16, ch=16, fp=8), 'N°2': dict(pp=14, co=38, tb=24, ch=16, fp=8)},
    'B1': dict(pp=16, co=24, tb=30, lv=18, fp=12), 'B2': dict(pp=16, co=32, tb=40, fp=12), 'B3': dict(pp=17, co=23, tb=30, lv=18, fp=12),
    'C1/Ch': dict(pp=16, co=32, tb=40, fp=12), 'C1/CP': dict(pp=16, co=24, tb=32, lv=16, fp=12), 'C2': dict(pp=16, co=42, tb=30, fp=12), 'C3': dict(pp=16, co=42, tb=30, fp=12),
    'D': dict(pp=16, co=42, tb=30, fp=12), 'E': dict(pp=16, co=42, tb=30, fp=12), 'F': dict(pp=16, ad=12, co=30, tb=30, fp=12), 'G': dict(pp=16, co=40, ch=32, fp=12)}
def somme(rows):
    t = {}
    for x in rows: t[x['th']] = t.get(x['th'], 0) + x['pts']
    return t
def verifier():
    for cat, vs in G.items():
        for var, rows, off, suf in vs:
            t = somme(rows); assert sum(t.values()) == 100, (cat, var, t)
            att = THEMES_ATTENDUS.get(cat) or THEMES_ATTENDUS.get(cat + '/' + (var or '').split('/')[-1])
            if cat == 'A': att = att['N°1 PH'] if var.startswith('N°1') else att['N°2']
            if cat == 'G': att = THEMES_ATTENDUS['G']
            assert att is None or t == att, (cat, var, t, att)
    for k, rows in OPT.items(): assert sum(x['pts'] for x in rows) == 50, (k, somme(rows))
def q(s): return "'" + s.replace("'", "''") + "'"
def sql():
    verifier()
    out = ["-- Grilles pratiques R.482A (annexe A3/2) : catégories A, B1, B2, B3, C1, C2, C3, D, E, F, G + options porte-engins et télécommande (50 pts chacune).",
           "-- Générées par scripts/grilles_r482a.py (totaux contrôlés : 100 par engin, 50 par option, total par thème). Idempotent.",
           "-- Variantes : « GROUPE » = engin évalué séparément (chacun doit atteindre 70) ; « GROUPE/TYPE » = le testeur choisit le type d'engin."]
    for cat, vs in G.items():
        vals, n = [], 0
        for var, rows, off, suf in vs:
            for x in rows:
                n += 1; code, lib = TL[x['th']]
                libt = lib + (' - ' + var.replace('/', ' ') if var and var.startswith('N°') else '')
                vals.append("  ('R482A', %s, %s, %s, %d, false, %d, %d, %s, %s, %s)" % (q(cat), q(code + suf), q(x['lib']), x['pts'], n, x['pt'] + off, 'true' if x['cont'] else 'false', q(var) if var else 'null', q(libt)))
        for opt, cats in OPT_CATS.items():
            if cat in cats:
                for x in OPT[opt]:
                    n += 1; code, lib = TL[x['th']]
                    vals.append("  ('R482A', %s, %s, %s, %d, false, %d, %d, %s, null, %s)" % (q(cat), q(code), q(x['lib']), x['pts'], n, x['pt'] + (100 if opt == 'porte_engins' else 200), 'true' if x['lib'].startswith('[En continu]') else 'false', q(lib)))
        out.append("insert into caces.criteres_pratique (referentiel_code, categorie_code, theme_code, libelle, bareme_points, eliminatoire, ordre, point_numero, en_continu, variante, theme_libelle) values\n"
                   + ",\n".join(vals) + "\non conflict (referentiel_code, categorie_code, ordre) do update set theme_code = excluded.theme_code, libelle = excluded.libelle, bareme_points = excluded.bareme_points, "
                   "eliminatoire = excluded.eliminatoire, point_numero = excluded.point_numero, en_continu = excluded.en_continu, variante = excluded.variante, theme_libelle = excluded.theme_libelle;")
        out.append("do $$ begin delete from caces.criteres_pratique where referentiel_code = 'R482A' and categorie_code = %s and ordre > %d; exception when foreign_key_violation then null; end $$;" % (q(cat), n))
    return "\n".join(out) + "\n"
if __name__ == '__main__':
    s = sql(); open(sys.argv[1], 'w', encoding='utf-8').write(s); print('ok', s.count("\n  ('R482A'"), 'critères')
