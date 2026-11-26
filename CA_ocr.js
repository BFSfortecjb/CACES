/* © Jérémy Bizeul / Vigie-lance — CACES® : lecture locale des documents (OCR) pour pré-remplir type, titre et dates.
   Bibliothèques libres hébergées avec l'appli (assets/ocr : Tesseract.js, PDF.js) : le document ne quitte JAMAIS l'appareil.
   Chargement à la demande (premier usage ≈ 8 Mo, ensuite en cache). Les valeurs proposées sont toujours à vérifier par l'utilisateur. */
(function () {
  const BASE = 'assets/ocr/';
  const charger = src => new Promise((ok, ko) => { const s = document.createElement('script'); s.src = BASE + src; s.onload = ok; s.onerror = () => ko(new Error('Chargement ' + src)); document.head.appendChild(s); });
  const MOIS = { janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12 };
  let _worker = null;

  const norm = (str, x, y, W, H) => ({ s: str, x: x / W, y: y / H });
  async function pageVersImage(file) {
    if (!window.pdfjsLib) await charger('pdf.min.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = BASE + 'pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let texte = '', items = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {                 // texte natif d'abord (PDF numérique : instantané et exact)
      const pg = await pdf.getPage(i), vp = pg.getViewport({ scale: 1 }), c = await pg.getTextContent();
      texte += c.items.map(x => x.str).join(' ') + '\n';
      c.items.filter(x => x.str.trim()).forEach(x => items.push({ ...norm(x.str, x.transform[4], vp.height - x.transform[5], vp.width, vp.height), p: i }));
    }
    if (texte.replace(/\s/g, '').length > 80) return { texte, items };
    const page = await pdf.getPage(1), vp = page.getViewport({ scale: 2.2 }), cv = document.createElement('canvas');   // PDF scanné : on le rend en image
    cv.width = vp.width; cv.height = vp.height;
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    return { image: cv, W: cv.width, H: cv.height };
  }
  async function ocr(image, suivi, W, H) {
    if (!window.Tesseract) await charger('tesseract.min.js');
    if (!_worker) _worker = await Tesseract.createWorker('fra', 1, { workerPath: BASE + 'worker.min.js', corePath: BASE + 'tesseract-core-simd-lstm.wasm.js',
      langPath: BASE + 'lang', logger: m => { if (suivi && m.status === 'recognizing text') suivi(Math.round(m.progress * 100)); } });
    const d = (await _worker.recognize(image, {}, { blocks: true })).data;
    if (!W && image.width) { W = image.width; H = image.height; }
    if (!W) { const bmp = await createImageBitmap(image); W = bmp.width; H = bmp.height; }
    const mots = (d.words || (d.blocks || []).flatMap(b => (b.paragraphs || []).flatMap(p => (p.lines || []).flatMap(l => l.words || []))));
    return { texte: d.text, items: mots.filter(w => w.text && w.text.trim()).map(w => ({ ...norm(w.text, w.bbox.x0, (w.bbox.y0 + w.bbox.y1) / 2, W, H), p: 1 })) };
  }
  /** Lit un document : { texte, items:[{s, x, y, p}] } (coordonnées relatives 0..1, y vers le bas). */
  window.lireDocument = async function (file, suivi) {
    if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) { const r = await pageVersImage(file); return r.image ? ocr(r.image, suivi, r.W, r.H) : r; }
    return ocr(file, suivi);
  };
  window.lireTexteDocument = async (file, suivi) => (await window.lireDocument(file, suivi)).texte;

  const iso = (j, m, a) => { a = Number(a); if (a < 100) a += 2000; return a > 1990 && a < 2100 && m >= 1 && m <= 12 && j >= 1 && j <= 31 ? `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}` : null; };
  function dates(t) {
    const out = [], re = /(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{2,4})|(\d{1,2})(?:er)?\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+(\d{4})/gi;
    let m; while ((m = re.exec(t))) {
      const d = m[1] ? iso(+m[1], +m[2], m[3]) : iso(+m[4], MOIS[m[5].toLowerCase()], m[6]);
      if (d) out.push({ d, ctx: t.slice(Math.max(0, m.index - 40), m.index).toLowerCase() });
    }
    return out;
  }
  const RE_NUM = /(\d{4})\.(\d{2})\.(R\d{3})[A-Z]?\.([A-Z0-9]+)\.(\d+)/;
  /** Cartons CACES® : une ligne par n° de CACES®, avec SES dates lues dans la même ligne du tableau (jamais déduites d'une autre catégorie). */
  function lignesCarton(items) {
    const rows = new Map();
    for (let p = 1; p <= 3; p++) {
      const its = items.filter(i => (i.p || 1) === p), nums = its.filter(i => RE_NUM.test(i.s)).sort((a, b) => a.y - b.y);
      nums.forEach((n, k) => {
        const m = n.s.match(RE_NUM), y0 = n.y - 0.008, y1 = Math.min(k + 1 < nums.length ? nums[k + 1].y - 0.008 : 9, n.y + 0.04);
        const texte = its.filter(i => i.y >= y0 && i.y < y1 && i.x > n.x - 0.2).sort((a, b) => a.y - b.y || a.x - b.x).map(i => i.s).join(' ');
        const ds = [...new Set(dates(texte).filter(x => Number(x.d.slice(0, 4)) >= 2015).map(x => x.d))].sort();
        const cle = m[0], ex = rows.get(cle);
        if (!ex || ds.length > ex.dates.length) rows.set(cle, { numero: m[0], ref: m[3], cat: m[4], dates: ds });
      });
    }
    return [...rows.values()].filter(r => r.dates.length).map(r => ({ numero: r.numero, ref: r.ref, cat: r.cat, date_document: r.dates[0], date_validite: r.dates.length > 1 ? r.dates[r.dates.length - 1] : '' }));
  }
  /** Propose { type, titre, date_document, date_validite, lignes } d'après le texte lu (et les positions si disponibles). */
  window.analyserDocument = function (texte, items) {
    const t = texte.replace(/[ \t]+/g, ' '), bas = t.toLowerCase(), ds = dates(t), auj = new Date().toISOString().slice(0, 10);
    const numeros = [...t.matchAll(new RegExp(RE_NUM.source, 'g'))];      // n° de CACES® : AAAA.MM.R482.B1.00045
    let type = 'administratif';
    if (/bases?\s+en\s+pr[ée]vention/.test(bas)) type = 'base_prevention';
    else if (numeros.length || /caces/.test(bas)) type = 'caces';
    else if (/(certificat|dipl[oô]me|attestation|habilitation|formation)/.test(bas)) type = 'justificatif';
    let titre = '', emis, val, lignes = [];
    if (type === 'caces') {
      lignes = items && items.length ? lignesCarton(items) : [];
      const refs = [...new Set(numeros.map(m => m[3]))], cats = [...new Set(numeros.map(m => m[4]))];
      titre = ('CACES® ' + (refs[0] || '') + (cats.length ? ' — cat. ' + cats.join(' + ') : '')).trim();
      if (lignes.length) { emis = { d: lignes[0].date_document }; val = lignes[0].date_validite ? { d: lignes[0].date_validite } : undefined; }
      // sans positions : on ne devine pas, les dates restent à saisir
    } else {
      val = ds.find(x => /(valable|validit[ée]|jusqu|expire|[ée]ch[ée]ance)/.test(x.ctx));
      emis = ds.find(x => /(d[ée]livr|fait le|[ée]tabli|date|le )/.test(x.ctx) && x.d <= auj && x !== val) || ds.filter(x => x.d <= auj && x !== val).sort((a, b) => a.d < b.d ? 1 : -1)[0];
      const ligne = t.split('\n').map(l => l.trim()).find(l => l.length > 6 && /(attestation|certificat|caces|inrs|dipl[oô]me|habilitation)/i.test(l));
      titre = type === 'base_prevention' ? 'Attestation « Acquérir des bases en prévention » — INRS' : (ligne ? ligne.slice(0, 90) : '');
    }
    return { type, titre, date_document: emis?.d || '', date_validite: val?.d || '', lignes };
  };
})();
