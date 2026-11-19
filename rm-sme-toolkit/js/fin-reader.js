/*
 * Pembaca laporan keuangan (neraca & laba rugi) dari Excel, PDF teks, atau hasil OCR.
 * Mengenali pos-pos utama berdasarkan nama akun (Indonesia/Inggris) lalu mengambil angka per periode.
 */
'use strict';
(function () {
  const { parseAmount, MONTHS, MONTH_RE } = App;

  const RE_NUM = /^\(?-?(?:RP\.?)?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?\)?$|^\(?-?\d+[.,]\d{2}\)?$/i;
  const RE_PERIOD = new RegExp('(?:(\\d{1,2})\\s+)?(?:' + MONTH_RE + '\\s+)?(20\\d{2})', 'gi');

  // [kunci, prioritas (kecil = lebih diutamakan), pola, pengecualian, mode]
  const RULES = [
    ['_skip', 0, /(jumlah|total) (liabilitas|kewajiban|utang|hutang|pasiva) dan (ekuitas|modal)|total liabilities and equity|(jumlah|total) pasiva/],
    ['_skip', 0, /(jumlah|total) (aset|aktiva|harta) tidak lancar|(jumlah|total) (liabilitas|kewajiban|utang|hutang) jangka panjang|total non.?current/],
    ['aset_lancar', 1, /^(jumlah|total) (aset|aktiva|harta) lancar|^total current assets/],
    ['total_aset', 1, /^(jumlah|total) (aset|aktiva|harta)$|^total assets$|^(jumlah|total) aktiva$/],
    ['utang_lancar', 1, /^(jumlah|total) (liabilitas|kewajiban|utang|hutang) (jangka pendek|lancar)|^total current liabilities/],
    ['total_utang', 1, /^(jumlah|total) (liabilitas|kewajiban|utang|hutang)$|^total liabilities$/],
    ['ekuitas', 1, /^(jumlah|total) (ekuitas|modal)( pemilik| bersih)?$|^total equity$/],
    ['ekuitas', 2, /^(ekuitas|modal akhir|modal pemilik akhir)( bersih)?$/],
    ['kas', 1, /^kas( dan| &)? (setara kas|bank)|^kas$|^kas dan bank|^cash( and cash equivalents)?$/, /arus|kenaikan|penurunan|bersih dari|awal|akhir (tahun|periode)/],
    ['piutang', 1, /^piutang (usaha|dagang)( bersih| neto)?|^piutang$|trade receivables|accounts receivable/, /lain|berelasi|karyawan|pajak|direksi|pemegang saham/],
    ['persediaan', 1, /^persediaan|^inventor/, /penurunan nilai|cadangan/],
    ['aset_tetap', 1, /^(jumlah )?(aset|aktiva) tetap.*(bersih|nilai buku|neto)|^nilai buku aset tetap/],
    ['aset_tetap', 2, /^(jumlah )?(aset|aktiva) tetap$|^fixed assets|property,? plant/, /akumulasi|accumulated/],
    ['utang_dagang', 1, /^(utang|hutang) (usaha|dagang)|trade payables|accounts payable/, /lain/],
    ['utang_bank', 1, /(utang|hutang|pinjaman|kredit) bank|bank loans?|^pinjaman jangka (pendek|panjang)|^(utang|hutang) jangka panjang( bank)?$|bagian (lancar|jangka pendek) (atas )?(utang|pinjaman)/, /bunga|lain|^(jumlah|total)|beban/, 'sum'],
    ['penjualan', 1, /^(penjualan|pendapatan)( usaha)? (bersih|neto)|^net (sales|revenues?)/, /lain|bunga|beban|pokok/],
    ['penjualan', 2, /^(penjualan|pendapatan)( usaha)?$|^(jumlah|total) (penjualan|pendapatan)( usaha)?$|^(sales|revenues?)$|^omzet/, /lain|bunga|beban|pokok/],
    ['hpp', 1, /harga pokok (penjualan|pendapatan)|beban pokok (penjualan|pendapatan)|^hpp|cost of (goods sold|sales|revenue)/],
    ['hpp', 2, /harga pokok produksi/],
    ['biaya_operasional', 1, /^(jumlah|total) (beban|biaya) (usaha|operasional|operasi)|^total operating expenses/],
    ['_opex', 2, /^(beban|biaya) (penjualan|pemasaran|umum( dan| &)? administrasi|administrasi( dan| &)? umum|operasional|usaha|umum)|^(selling|general and administrative) expenses/, /pokok|bunga|pajak|lain|keuangan/, 'sum'],
    ['laba_usaha', 1, /^(laba|rugi|laba \(rugi\)) (usaha|operasional|operasi)|^operating (income|profit)/],
    ['biaya_bunga', 1, /^(beban|biaya) (bunga|keuangan|pendanaan)|interest expense|finance costs?/, /pendapatan/],
    ['penyusutan', 1, /^(beban )?(penyusutan|depresiasi)|^depreciation/, /akumulasi|accumulated/],
    ['pajak', 1, /^(beban )?pajak penghasilan|^beban pajak|^income tax( expense)?$|^pph badan/, /utang|hutang|dibayar dimuka|sebelum|tangguhan/],
    ['laba_bersih', 1, /^(laba|rugi|laba \(rugi\)) (bersih|tahun berjalan|periode berjalan|setelah pajak)|^net (income|profit)/, /sebelum|komprehensif lain|per saham|ditahan|diatribusikan/],
    ['_bulan', 1, /^(jumlah )?bulan$/],
  ];
  const ABS_KEYS = new Set(['hpp', 'biaya_operasional', 'biaya_bunga', 'penyusutan', 'pajak', 'kas', 'piutang', 'persediaan', 'aset_lancar', 'aset_tetap', 'total_aset', 'utang_dagang', 'utang_lancar', 'utang_bank', 'total_utang', 'kewajiban_bank_tahunan']);

  function normLabel(s) {
    return String(s || '').toLowerCase()
      .replace(/[“”"':;]/g, ' ')
      .replace(/^\s*((\d{1,2}|[a-z]|[ivx]{1,4})[.)]\s+)+/, '')
      .replace(/\s+(\d{1,2}[a-z]?|\d{1,2}\.\d{1,2}|\d{1,2}[a-z]\.\w+)$/, '') // nomor catatan di akhir label
      .replace(/\s*[-–]\s*$/, '')
      .replace(/\s+/g, ' ').trim();
  }

  function cleanLabel(s) { return String(s || '').replace(/\s+(\d{1,2}[a-z]?|\d{1,2}\.\d{1,2})$/i, '').trim(); }

  function detectUnit(text) {
    const t = text.toLowerCase();
    if (/dalam\s+(jutaan|juta)\s+rupiah|in\s+millions/.test(t)) return 1e6;
    if (/dalam\s+(ribuan|ribu)\s+rupiah|in\s+thousands/.test(t)) return 1e3;
    return 1;
  }

  function periodsFrom(texts) {
    // texts: [{ s, x? }] — urutan sesuai posisi kolom
    const out = [];
    for (const { s, x } of texts) {
      RE_PERIOD.lastIndex = 0;
      let m;
      while ((m = RE_PERIOD.exec(s))) {
        const mon = m[2] ? MONTHS[m[2].toUpperCase()] : null;
        out.push({ label: m[0].trim(), year: +m[3], month: mon, x });
      }
    }
    return out;
  }

  /** Dari baris Excel (array 2D). */
  function rowsFromSheet(aoa) {
    const rows = [];
    let header = null, headerScore = -1;
    const isYear = (v) => Number.isInteger(v) && v >= 1990 && v <= 2100;
    aoa.forEach((r, ri) => {
      const cells = (r || []).map((c) => (c instanceof Date ? String(c.getFullYear()) : c));
      const nums = [], labelParts = [];
      cells.forEach((c, ci) => {
        if (typeof c === 'number' && isFinite(c)) {
          if (!labelParts.length && !nums.length && Number.isInteger(c) && Math.abs(c) < 1000) return; // nomor urut
          nums.push({ v: c, col: ci });
          return;
        }
        const s = String(c == null ? '' : c).trim();
        if (!s) return;
        if (RE_NUM.test(s.replace(/\s/g, '')) || s === '-') {
          const p = s === '-' ? { value: 0 } : parseAmount(s);
          if (p) nums.push({ v: p.value, col: ci });
          return;
        }
        if (!nums.length) labelParts.push(s);
      });
      const label = labelParts.join(' ');
      const periodRow = /^periode\b/i.test(label) || !nums.length || nums.every((n) => isYear(n.v));
      if (periodRow) {
        const ps = periodsFrom(cells.map((c, ci) => ({ s: String(c == null ? '' : c), x: ci })).filter((o) => o.s && !/^periode\b/i.test(o.s)));
        const score = ps.length * 10 + (/^periode\b/i.test(label) ? 50 : 0) - ri * 0.01;
        if (ps.length && ri < 80 && score > headerScore) { header = ps.map((p) => ({ ...p, col: p.x })); headerScore = score; }
        if (!nums.length || nums.every((n) => isYear(n.v))) return;
      }
      if (label && nums.length) rows.push({ label, nums });
    });
    return { rows, header, byColumn: true };
  }

  /** Dari baris teks PDF/OCR. */
  function rowsFromLines(lines) {
    const rows = [];
    let header = null;
    lines.forEach((ln, li) => {
      const toks = ln.tokens && ln.tokens.length ? ln.tokens : ln.text.split(/\s+/).filter(Boolean).map((t) => ({ t, x0: null, x1: null }));
      const nums = [];
      let i = toks.length - 1;
      while (i >= 0) {
        const t = toks[i].t.replace(/(\d)[.,]{2,}(?=\d)/g, (m, d) => d + m[1]);
        if (RE_NUM.test(t)) { const p = parseAmount(t); if (!p) break; nums.unshift({ v: p.value, x: toks[i].x0 != null ? (toks[i].x0 + toks[i].x1) / 2 : null }); i--; continue; }
        if ((t === '-' || t === '–') && nums.length) { nums.unshift({ v: 0, x: toks[i].x0 != null ? (toks[i].x0 + toks[i].x1) / 2 : null }); i--; continue; }
        if (/^rp\.?$/i.test(t) && nums.length) { i--; continue; }
        break;
      }
      const label = toks.slice(0, i + 1).map((t) => t.t).join(' ');
      if (!nums.length) {
        if (li < 400) {
          const ps = periodsFrom([{ s: ln.text }]);
          if (ps.length >= 2 || (ps.length === 1 && /catatan|notes|\bdes|\bdec|desember|december/i.test(ln.text))) {
            // perkirakan posisi x tiap periode dari token tahun
            const yearToks = toks.filter((t) => /^20\d{2}$/.test(t.t));
            ps.forEach((p, k) => { p.x = yearToks[k] && yearToks[k].x0 != null ? (yearToks[k].x0 + yearToks[k].x1) / 2 : null; });
            const words = ln.text.replace(RE_PERIOD, ' ').split(/\s+/).filter((w) => /[a-z]/i.test(w)).length;
            const score = ps.length * 10 + (words <= 3 ? 5 : 0) + (/catatan|notes/i.test(ln.text) ? 3 : 0) - (/laporan|neraca|posisi|untuk tahun|per\s/i.test(ln.text) ? 8 : 0);
            if (!header || score > header.score) { header = ps; header.score = score; }
          }
        }
      } else if (label) rows.push({ label, nums });
    });
    return { rows, header, byColumn: false };
  }

  /**
   * Ekstrak pos laporan keuangan.
   * Mengembalikan { periods:[{label,bulan}], newestFirst, unit, items:{ key: { label, values:[] } }, rowsCount }.
   */
  function extract(src, fullText) {
    const { rows, header } = src;
    let periods = header && header.length ? header.slice() : null;
    const nCols = periods ? periods.length : Math.max(0, ...rows.map((r) => r.nums.length));
    if (!periods) periods = Array.from({ length: nCols }, (_, k) => ({ label: 'Kolom ' + (k + 1), year: null, month: null }));
    const align = (r) => {
      const vals = new Array(periods.length).fill(null);
      if (src.byColumn && periods[0].col != null) {
        r.nums.forEach((n) => {
          let best = -1, bd = Infinity;
          periods.forEach((p, k) => { const d = Math.abs(n.col - p.col); if (d < bd) { bd = d; best = k; } });
          if (best >= 0 && vals[best] == null) vals[best] = n.v;
        });
        return vals;
      }
      if (periods.every((p) => p.x != null) && r.nums.every((n) => n.x != null) && r.nums.length < periods.length) {
        r.nums.forEach((n) => {
          let best = -1, bd = Infinity;
          periods.forEach((p, k) => { const d = Math.abs(n.x - p.x); if (d < bd) { bd = d; best = k; } });
          if (best >= 0 && vals[best] == null) vals[best] = n.v;
        });
        return vals;
      }
      const take = r.nums.slice(-periods.length);
      take.forEach((n, k) => { vals[periods.length - take.length + k] = n.v; });
      return vals;
    };
    const found = {};
    let bulanRow = null;
    for (const r of rows) {
      const L = normLabel(r.label);
      if (!L) continue;
      for (const [key, prio, re, ex, mode] of RULES) {
        if (!re.test(L) || (ex && ex.test(L))) continue;
        if (key === '_skip') break;
        const vals = align(r);
        if (key === '_bulan') { bulanRow = vals; break; }
        const cur = found[key];
        if (mode === 'sum') {
          if (!cur) found[key] = { label: cleanLabel(r.label), values: vals.map((v) => (v == null ? null : v)), prio, parts: 1 };
          else if (cur.prio === prio) { cur.values = cur.values.map((v, k) => (v == null && vals[k] == null ? null : (v || 0) + (vals[k] || 0))); cur.label += ' + ' + cleanLabel(r.label); cur.parts++; }
        } else if (!cur || prio < cur.prio) found[key] = { label: cleanLabel(r.label), values: vals, prio };
        break;
      }
    }
    if (!found.biaya_operasional && found._opex) found.biaya_operasional = found._opex;
    delete found._opex;
    Object.entries(found).forEach(([k, f]) => { if (ABS_KEYS.has(k)) f.values = f.values.map((v) => (v == null ? null : Math.abs(v))); });
    // urutan kolom: tahun menurun → terbaru di kiri
    const years = periods.map((p) => (p.year ? p.year * 100 + (p.month || 12) : null));
    let newestFirst = true;
    if (years.every((y) => y != null) && years.length > 1) newestFirst = years[0] > years[years.length - 1];
    periods.forEach((p, k) => {
      p.bulan = bulanRow && bulanRow[k] ? +bulanRow[k] : (p.month && p.month !== 12 ? p.month : 12);
    });
    return { periods, newestFirst, unit: detectUnit(fullText || ''), items: found, rowsCount: rows.length };
  }

  App.finReader = { rowsFromSheet, rowsFromLines, extract, normLabel, RULES };
})();
