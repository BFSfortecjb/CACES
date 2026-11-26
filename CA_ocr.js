/* © Jérémy Bizeul / Vigie-lance — CACES® : lecture locale des documents (OCR) pour pré-remplir type, titre et dates.
   Bibliothèques libres hébergées avec l'appli (assets/ocr : Tesseract.js, PDF.js) : le document ne quitte JAMAIS l'appareil.
   Chargement à la demande (premier usage ≈ 8 Mo, ensuite en cache). Les valeurs proposées sont toujours à vérifier par l'utilisateur. */
(function () {
  const BASE = 'assets/ocr/';
  const charger = src => new Promise((ok, ko) => { const s = document.createElement('script'); s.src = BASE + src; s.onload = ok; s.onerror = () => ko(new Error('Chargement ' + src)); document.head.appendChild(s); });
  const MOIS = { janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12 };
  let _worker = null;

  async function pageVersImage(file) {
    if (!window.pdfjsLib) await charger('pdf.min.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = BASE + 'pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let texte = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {                 // texte natif d'abord (PDF numérique : instantané et exact)
      const c = await (await pdf.getPage(i)).getTextContent(); texte += c.items.map(x => x.str).join(' ') + '\n';
    }
    if (texte.replace(/\s/g, '').length > 80) return { texte };
    const page = await pdf.getPage(1), vp = page.getViewport({ scale: 2.2 }), cv = document.createElement('canvas');   // PDF scanné : on le rend en image
    cv.width = vp.width; cv.height = vp.height;
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    return { image: cv };
  }
  async function ocr(image, suivi) {
    if (!window.Tesseract) await charger('tesseract.min.js');
    if (!_worker) _worker = await Tesseract.createWorker('fra', 1, { workerPath: BASE + 'worker.min.js', corePath: BASE + 'tesseract-core-simd-lstm.wasm.js',
      langPath: BASE + 'lang', logger: m => { if (suivi && m.status === 'recognizing text') suivi(Math.round(m.progress * 100)); } });
    return (await _worker.recognize(image)).data.text;
  }
  window.lireTexteDocument = async function (file, suivi) {
    if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) { const r = await pageVersImage(file); return r.texte ?? await ocr(r.image, suivi); }
    return ocr(file, suivi);
  };

  const iso = (j, m, a) => { a = Number(a); if (a < 100) a += 2000; return a > 1990 && a < 2100 && m >= 1 && m <= 12 && j >= 1 && j <= 31 ? `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}` : null; };
  function dates(t) {
    const out = [], re = /(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{2,4})|(\d{1,2})(?:er)?\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+(\d{4})/gi;
    let m; while ((m = re.exec(t))) {
      const d = m[1] ? iso(+m[1], +m[2], m[3]) : iso(+m[4], MOIS[m[5].toLowerCase()], m[6]);
      if (d) out.push({ d, ctx: t.slice(Math.max(0, m.index - 40), m.index).toLowerCase() });
    }
    return out;
  }
  /** Propose { type, titre, date_document, date_validite } d'après le texte lu. */
  window.analyserDocument = function (texte) {
    const t = texte.replace(/[ \t]+/g, ' '), bas = t.toLowerCase(), ds = dates(t), auj = new Date().toISOString().slice(0, 10);
    let type = 'administratif';
    if (/inrs/.test(bas) && /pr[ée]vention/.test(bas)) type = 'base_prevention';
    else if (/caces/.test(bas)) type = 'caces';
    else if (/(certificat|dipl[oô]me|attestation|habilitation|formation)/.test(bas)) type = 'justificatif';
    const val = ds.find(x => /(valable|validit[ée]|jusqu|expire|[ée]ch[ée]ance)/.test(x.ctx));
    const emis = ds.find(x => /(d[ée]livr|fait le|[ée]tabli|date|le )/.test(x.ctx) && x.d <= auj && x !== val) || ds.filter(x => x.d <= auj && x !== val).sort((a, b) => a.d < b.d ? 1 : -1)[0];
    const ligne = t.split('\n').map(l => l.trim()).find(l => l.length > 6 && /(attestation|certificat|caces|inrs|dipl[oô]me|habilitation)/i.test(l));
    return { type, titre: ligne ? ligne.slice(0, 90) : '', date_document: emis?.d || '', date_validite: val?.d || '' };
  };
})();
