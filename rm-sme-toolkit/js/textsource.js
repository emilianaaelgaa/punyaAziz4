/* Sumber teks: baca PDF (pdf.js) dan OCR (Tesseract) — semuanya lokal/offline. */
'use strict';
(function () {
  const { el } = App;

  if (window.pdfjsLib) {
    // pdf.worker.min.js sudah dimuat sebagai <script> → pdf.js memakai "fake worker" di thread utama.
    // Ini disengaja: browser memblokir Web Worker dari file://.
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  }

  async function openPdf(arrayBuffer) {
    return pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      stopAtErrors: false,
    }).promise;
  }

  /** Ubah item teks pdf.js menjadi baris berisi token dengan posisi x. */
  function itemsToLines(items, pageNo) {
    const parts = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const tr = it.transform;
      const h = Math.abs(tr[3]) || Math.abs(tr[0]) || it.height || 8;
      parts.push({ str: it.str, x: tr[4], y: tr[5], w: it.width || it.str.length * h * 0.5, h });
    }
    parts.sort((a, b) => (b.y - a.y) || (a.x - b.x));
    const rows = [];
    for (const p of parts) {
      const row = rows.length ? rows[rows.length - 1] : null;
      if (row && Math.abs(row.y - p.y) <= Math.max(2, Math.min(row.h, p.h) * 0.45)) row.parts.push(p);
      else rows.push({ y: p.y, h: p.h, parts: [p] });
    }
    return rows.map((row) => {
      row.parts.sort((a, b) => a.x - b.x);
      const tokens = [];
      let prev = null;
      for (const p of row.parts) {
        // Pecah tiap item menjadi kata, posisi x diperkirakan proporsional terhadap jumlah karakter.
        const str = p.str;
        const re = /\S+/g;
        let m;
        while ((m = re.exec(str))) {
          const x0 = p.x + (m.index / str.length) * p.w;
          const x1 = p.x + ((m.index + m[0].length) / str.length) * p.w;
          // Gabungkan dengan token sebelumnya bila jaraknya sangat rapat (PDF yang menulis per karakter).
          if (prev && m.index === 0 && x0 - prev.x1 < p.h * 0.12 && !/\s$/.test(prev.srcEnd || '')) {
            prev.t += m[0];
            prev.x1 = x1;
          } else {
            prev = { t: m[0], x0, x1 };
            tokens.push(prev);
          }
          prev.srcEnd = str.slice(m.index + m[0].length);
        }
      }
      tokens.forEach((t) => delete t.srcEnd);
      return { page: pageNo, y: row.y, tokens, text: tokens.map((t) => t.t).join(' ') };
    });
  }

  /** Ekstrak teks semua halaman PDF. Mengembalikan { pages: [{ lines, charCount }], pdf }. */
  async function pdfToLines(arrayBuffer, onProgress) {
    const pdf = await openPdf(arrayBuffer);
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      const lines = itemsToLines(tc.items, i);
      pages.push({ lines, charCount: lines.reduce((s, l) => s + l.text.length, 0) });
      if (onProgress) onProgress(i / pdf.numPages, `Membaca halaman ${i}/${pdf.numPages}`);
    }
    return { pages, pdf };
  }

  async function renderPdfPage(pdf, pageNo, scale = 2.5) {
    const page = await pdf.getPage(pageNo);
    const vp = page.getViewport({ scale });
    const canvas = el('canvas');
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return canvas;
  }

  /* ----------------------------- OCR ----------------------------- */
  let ocrWorkerPromise = null;
  let ocrProgress = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = el('script', { src });
      s.onload = resolve;
      s.onerror = () => reject(new Error('Gagal memuat ' + src + '. Pastikan folder "vendor" lengkap.'));
      document.head.appendChild(s);
    });
  }

  function getOcrWorker() {
    if (ocrWorkerPromise) return ocrWorkerPromise;
    ocrWorkerPromise = (async () => {
      if (!window.__OCR_ENGINE_SRC) await loadScript('vendor/ocr-engine.js');
      const url = URL.createObjectURL(new Blob([window.__OCR_ENGINE_SRC], { type: 'application/javascript' }));
      const worker = await Tesseract.createWorker('ind', 1, {
        workerPath: url,
        workerBlobURL: false,
        corePath: 'embedded-core.js', // core sudah tertanam di dalam worker
        langPath: 'https://offline.invalid/offline-lang', // dicegat di dalam worker, tidak pernah diakses
        cacheMethod: 'none',
        gzip: true,
        logger: (m) => { if (ocrProgress && m && typeof m.progress === 'number') ocrProgress(m); },
      });
      await worker.setParameters({ preserve_interword_spaces: '1' });
      return worker;
    })();
    ocrWorkerPromise.catch(() => { ocrWorkerPromise = null; });
    return ocrWorkerPromise;
  }

  /**
   * OCR satu gambar/canvas. Mengembalikan { text, lines: [{ text, tokens:[{t,x0,x1}] }], confidence }.
   */
  async function ocrImage(image, onProgress) {
    ocrProgress = onProgress || null;
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(image);
    ocrProgress = null;
    const lines = (data.lines || []).map((ln) => {
      const tokens = (ln.words || []).map((w) => ({ t: w.text, x0: w.bbox.x0, x1: w.bbox.x1 })).filter((t) => t.t && t.t.trim());
      return { text: tokens.map((t) => t.t).join(' '), tokens, ocr: true };
    }).filter((l) => l.text);
    return { text: data.text || '', lines, confidence: data.confidence };
  }

  App.text = { openPdf, pdfToLines, renderPdfPage, ocrImage, getOcrWorker, loadScript, itemsToLines };
})();
