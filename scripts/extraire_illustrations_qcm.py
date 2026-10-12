# -*- coding: utf-8 -*-
"""Extrait les illustrations des 'supports papier theorie' (1 question par page) et les rattache aux questions de la banque
(data/questions_qcm.json) par comparaison de texte. Sortie : /tmp/ex/illustrations.json + images /tmp/ex/img/*.jpg"""
import json, os, re, subprocess, hashlib, unicodedata, difflib, shutil, sys
from PIL import Image
RES = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'ressources', 'TESTS CASTEST PAPIER')
SOURCES = {'R482A': 'R482/R482 support papier théorie.pdf', 'R489': 'R489/R489 support papier théorie.pdf', 'R486A': 'R486/R486 support papier théorie.pdf'}
OUT = '/tmp/ex'; IMG = os.path.join(OUT, 'img'); shutil.rmtree(IMG, ignore_errors=True); os.makedirs(IMG, exist_ok=True)
bank = json.load(open(os.path.join(os.path.dirname(RES), '..', 'data', 'questions_qcm.json'), encoding='utf8'))
def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9 ]+', ' ', re.sub(r'\s+', ' ', s)).strip()
def run(*a): return subprocess.run(a, capture_output=True, text=True).stdout
result = {}; stats = {}
for ref, rel in SOURCES.items():
    pdf = os.path.join(RES, rel)
    if not os.path.exists(pdf): print('absent', pdf); continue
    qs = [(q['id'], norm(q['enonce'])) for r in bank['referentiels'] if r['code'] == ref for t in r['themes'] for q in t['questions']]
    npages = int(re.search(r'Pages:\s+(\d+)', run('pdfinfo', pdf)).group(1))
    work = os.path.join(OUT, ref); shutil.rmtree(work, ignore_errors=True); os.makedirs(work)
    subprocess.run(['pdfimages', '-png', '-p', pdf, os.path.join(work, 'p')], capture_output=True)
    # masques de transparence (smask) : on les applique a l'image precedente sur fond blanc au lieu de les traiter comme des images
    lst = [l.split() for l in run('pdfimages', '-list', pdf).splitlines()[2:]]
    masque_de = {}; est_masque = set()
    for k, l in enumerate(lst):
        if len(l) > 2 and l[2] == 'smask':
            est_masque.add(int(l[1]));
            if k > 0: masque_de[int(lst[k - 1][1])] = int(l[1])
    par_page = {}; freq = {}
    for f in sorted(os.listdir(work)):
        m = re.match(r'p-(\d+)-(\d+)\.png', f)
        if not m: continue
        p = int(m.group(1)); num = int(m.group(2)); path = os.path.join(work, f)
        if num in est_masque: continue
        try: im = Image.open(path)
        except Exception: continue
        if num in masque_de:
            mf = os.path.join(work, 'p-%03d-%03d.png' % (p, masque_de[num]))
            if os.path.exists(mf):
                im = im.convert('RGB'); mk = Image.open(mf).convert('L').resize(im.size)
                fond = Image.new('RGB', im.size, 'white'); fond.paste(im, mask=mk); im = fond
                im.save(path)
        if im.mode in ('L', 'LA') and im.size[0] * im.size[1] < 40000: continue
        if im.size[1] <= 115 and im.size[0] <= 135: continue          # pastilles de numero de question / cases (pas des illustrations)
        if im.size[1] < 40 or im.size[0] / im.size[1] > 6: continue   # bandeaux decoratifs
        h = hashlib.md5(im.convert('RGB').resize((32, 32)).tobytes()).hexdigest()
        freq[h] = freq.get(h, 0) + 1
        par_page.setdefault(p, []).append((path, im.size, h))
    matched = 0; sans = []
    for p in range(1, npages + 1):
        txt = run('pdftotext', '-f', str(p), '-l', str(p), pdf, '-')
        m = re.split(r'\n\s*1\s*-\s*VRAI', txt)
        enonce = norm(re.sub(r'^\s*\d+\s*-\s*', '', m[0].strip()))
        imgs = [x for x in par_page.get(p, []) if freq[x[2]] <= 3 and x[1][0] >= 90 and x[1][1] >= 60]
        if not imgs or not enonce: continue
        best = max(qs, key=lambda q: difflib.SequenceMatcher(None, enonce, q[1]).ratio())
        r = difflib.SequenceMatcher(None, enonce, best[1]).ratio()
        if r < 0.82: sans.append((p, enonce[:70], round(r, 2))); continue
        imgs.sort(key=lambda x: (Image.open(x[0]).size[1], x[0]))   # ordre de lecture approximatif (par page)
        imgs = imgs[:4]
        size = imgs[0][1]
        if len(imgs) == 1:
            im = Image.open(imgs[0][0]).convert('RGB')
        else:   # plusieurs images sur la page (ex. pictogrammes A, B, C) : montage horizontal
            ims = [Image.open(x[0]).convert('RGB') for x in imgs]
            H = 240; ims = [i.resize((max(1, round(i.size[0] * H / i.size[1])), H)) for i in ims]
            im = Image.new('RGB', (sum(i.size[0] for i in ims) + 10 * (len(ims) - 1), H), 'white'); x0 = 0
            for i in ims: im.paste(i, (x0, 0)); x0 += i.size[0] + 10
        im.thumbnail((560, 560))
        dest = os.path.join(IMG, best[0] + '.jpg'); im.save(dest, 'JPEG', quality=74, optimize=True)
        result[best[0]] = {'page': p, 'ratio': round(r, 2), 'n_images': len(imgs), 'taille': size}
        matched += 1
    stats[ref] = (npages, matched, sans)
json.dump(result, open(os.path.join(OUT, 'illustrations.json'), 'w'), indent=1)
for ref, (n, m, s) in stats.items(): print(ref, 'pages', n, 'rattachees', m, 'non rattachees', len(s)); [print('   ', x) for x in s[:12]]

# --- Publication : copie dans assets/qcm/ + patch SQL (colonne questions_qcm.illustration = chemin relatif de l'image)
PROJ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dest_dir = os.path.join(PROJ, 'assets', 'qcm'); shutil.rmtree(dest_dir, ignore_errors=True); os.makedirs(dest_dir)
for qid in sorted(result): shutil.copy(os.path.join(IMG, qid + '.jpg'), os.path.join(dest_dir, qid + '.jpg'))
vals = ',\n  '.join("('%s', 'assets/qcm/%s.jpg')" % (q, q) for q in sorted(result))
open(os.path.join(OUT, 'update_illustrations.sql'), 'w', encoding='utf8').write(vals)
print('copie', len(result), 'images dans', dest_dir)
