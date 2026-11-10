#!/usr/bin/env python3
"""Génère edge-functions/caces-envoyer-secretariat/index.ts.

Le dessin des PDF (carton CACES + autorisation de conduite) est COPIÉ AUTOMATIQUEMENT depuis CA_carton.js :
le navigateur et le serveur partagent ainsi exactement le même code de dessin (une seule source).
Après toute modification de CA_carton.js : relancer  python3 scripts/build_edge_secretariat.py  puis redéployer la fonction.
"""
import re, sys, pathlib
racine = pathlib.Path(__file__).resolve().parent.parent
src = (racine / 'CA_carton.js').read_text(encoding='utf-8')

def entre(debut, fin, inclure_fin=False):
    i = src.index(debut)
    j = src.index(fin, i)
    if inclure_fin:
        j = src.index('\n', j) + 1
    return src[i:j]

consts1 = entre("const FAMILLE_ENGINS", "const blobVersDataUrl")
consts2 = entre("/* Signataire du carton", "const MENTION_AIPR", inclure_fin=True)
dessin = entre("    const boite = (x, y, w, h)", "    const nomPdf =")

modele = (racine / 'scripts' / 'edge_secretariat_modele.ts').read_text(encoding='utf-8')
sortie = (modele.replace('/*__CONSTANTES_CARTON__*/', consts1 + '\n' + consts2)
                .replace('/*__DESSIN_CARTON__*/', dessin))
dest = racine / 'edge-functions' / 'caces-envoyer-secretariat' / 'index.ts'
dest.write_text(sortie, encoding='utf-8')
print('écrit', dest, len(sortie), 'octets')
