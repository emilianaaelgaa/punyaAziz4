/*
 * Mesin rasio penilaian kredit: rasio per periode laporan keuangan + proforma setelah fasilitas baru,
 * masing-masing dibandingkan dengan acuan (bisa diubah di Pengaturan).
 */
'use strict';
(function () {
  const { parseMoney, fmt, store } = App;

  /* Pos laporan keuangan: [kunci, label, bagian] */
  const FIN_ITEMS = [
    ['penjualan', 'Penjualan / pendapatan usaha', 'Laba rugi'],
    ['hpp', 'Harga pokok penjualan (HPP)', 'Laba rugi'],
    ['biaya_operasional', 'Beban operasional (penjualan, umum & adm.)', 'Laba rugi'],
    ['laba_usaha', 'Laba usaha / EBIT (opsional)', 'Laba rugi'],
    ['biaya_bunga', 'Beban bunga', 'Laba rugi'],
    ['penyusutan', 'Penyusutan & amortisasi', 'Laba rugi'],
    ['pajak', 'Beban pajak penghasilan (opsional)', 'Laba rugi'],
    ['laba_bersih', 'Laba bersih', 'Laba rugi'],
    ['kas', 'Kas & setara kas', 'Neraca'],
    ['piutang', 'Piutang usaha', 'Neraca'],
    ['persediaan', 'Persediaan', 'Neraca'],
    ['aset_lancar', 'Total aset lancar', 'Neraca'],
    ['aset_tetap', 'Aset tetap (bersih)', 'Neraca'],
    ['total_aset', 'Total aset', 'Neraca'],
    ['utang_dagang', 'Utang usaha / dagang', 'Neraca'],
    ['utang_lancar', 'Total liabilitas jangka pendek', 'Neraca'],
    ['utang_bank', 'Utang bank (jangka pendek + panjang)', 'Neraca'],
    ['total_utang', 'Total liabilitas', 'Neraca'],
    ['ekuitas', 'Total ekuitas', 'Neraca'],
    ['kewajiban_bank_tahunan', 'Kewajiban bank existing per tahun (pokok + bunga), di luar fasilitas yang diusulkan', 'Kewajiban'],
  ];

  const val = (c, k) => c.v[k];
  const has = (...xs) => xs.every((x) => x != null && isFinite(x));
  const div = (a, b) => (has(a, b) && b !== 0 ? a / b : null);

  function ebit(c) {
    const lu = val(c, 'laba_usaha');
    if (lu != null) return lu;
    const p = val(c, 'penjualan'), h = val(c, 'hpp'), o = val(c, 'biaya_operasional');
    if (has(p, h, o)) return p - h - o;
    const lb = val(c, 'laba_bersih');
    if (lb != null) return lb + (val(c, 'pajak') || 0) + (val(c, 'biaya_bunga') || 0);
    return null;
  }
  function ebitda(c) { const e = ebit(c); return e == null ? null : e + (val(c, 'penyusutan') || 0); }
  /** Utang/ekuitas: ekuitas ≤ 0 → tak terhingga (otomatis tidak memenuhi acuan). */
  function overEquity(a, eq) { if (!has(a, eq)) return null; return eq <= 0 ? Infinity : a / eq; }

  /* Rasio per periode. rule: { op, val } bawaan (acuan umum, bisa diubah). */
  const DEFS = [
    { key: 'growth', group: 'Pertumbuhan & profitabilitas', label: 'Pertumbuhan penjualan', type: 'pct', rule: { op: '>=', val: 0 },
      formula: 'penjualan disetahunkan ÷ periode sebelumnya − 1',
      fn: (c) => (c.prev && has(val(c, 'penjualan'), val(c.prev, 'penjualan')) && val(c.prev, 'penjualan') ? (val(c, 'penjualan') * c.ann) / (val(c.prev, 'penjualan') * c.prev.ann) - 1 : null) },
    { key: 'laba_kotor', group: 'Pertumbuhan & profitabilitas', label: 'Laba kotor (Rp)', type: 'money', formula: 'penjualan − HPP',
      fn: (c) => (has(val(c, 'penjualan'), val(c, 'hpp')) ? val(c, 'penjualan') - val(c, 'hpp') : null) },
    { key: 'gpm', group: 'Pertumbuhan & profitabilitas', label: 'Gross profit margin', type: 'pct', rule: { op: '>', val: 0 }, formula: 'laba kotor ÷ penjualan',
      fn: (c) => div(has(val(c, 'penjualan'), val(c, 'hpp')) ? val(c, 'penjualan') - val(c, 'hpp') : null, val(c, 'penjualan')) },
    { key: 'opm', group: 'Pertumbuhan & profitabilitas', label: 'Operating profit margin', type: 'pct', rule: { op: '>', val: 0 }, formula: 'laba usaha (EBIT) ÷ penjualan',
      fn: (c) => div(ebit(c), val(c, 'penjualan')) },
    { key: 'npm', group: 'Pertumbuhan & profitabilitas', label: 'Net profit margin', type: 'pct', rule: { op: '>', val: 0 }, formula: 'laba bersih ÷ penjualan',
      fn: (c) => div(val(c, 'laba_bersih'), val(c, 'penjualan')) },
    { key: 'roa', group: 'Pertumbuhan & profitabilitas', label: 'Return on assets (ROA)', type: 'pct', rule: { op: '>', val: 0 }, formula: 'laba bersih disetahunkan ÷ total aset',
      fn: (c) => div(val(c, 'laba_bersih') == null ? null : val(c, 'laba_bersih') * c.ann, val(c, 'total_aset')) },
    { key: 'roe', group: 'Pertumbuhan & profitabilitas', label: 'Return on equity (ROE)', type: 'pct', rule: { op: '>', val: 0 }, formula: 'laba bersih disetahunkan ÷ ekuitas',
      fn: (c) => (val(c, 'ekuitas') != null && val(c, 'ekuitas') <= 0 ? null : div(val(c, 'laba_bersih') == null ? null : val(c, 'laba_bersih') * c.ann, val(c, 'ekuitas'))) },

    { key: 'current_ratio', group: 'Likuiditas', label: 'Current ratio', type: 'x', rule: { op: '>=', val: 1.0 }, formula: 'aset lancar ÷ liabilitas jangka pendek',
      fn: (c) => div(val(c, 'aset_lancar'), val(c, 'utang_lancar')) },
    { key: 'quick_ratio', group: 'Likuiditas', label: 'Quick ratio', type: 'x', rule: { op: '>=', val: 0.5 }, formula: '(aset lancar − persediaan) ÷ liabilitas jangka pendek',
      fn: (c) => div(val(c, 'aset_lancar') == null ? null : val(c, 'aset_lancar') - (val(c, 'persediaan') || 0), val(c, 'utang_lancar')) },
    { key: 'cash_ratio', group: 'Likuiditas', label: 'Cash ratio', type: 'x', formula: 'kas ÷ liabilitas jangka pendek',
      fn: (c) => div(val(c, 'kas'), val(c, 'utang_lancar')) },
    { key: 'modal_kerja_bersih', group: 'Likuiditas', label: 'Modal kerja bersih (Rp)', type: 'money', rule: { op: '>', val: 0 }, formula: 'aset lancar − liabilitas jangka pendek',
      fn: (c) => (has(val(c, 'aset_lancar'), val(c, 'utang_lancar')) ? val(c, 'aset_lancar') - val(c, 'utang_lancar') : null) },

    { key: 'der', group: 'Solvabilitas & leverage', label: 'DER (total liabilitas ÷ ekuitas)', type: 'x', rule: { op: '<=', val: 2.5 }, formula: 'total liabilitas ÷ ekuitas',
      fn: (c) => overEquity(val(c, 'total_utang'), val(c, 'ekuitas')) },
    { key: 'gearing', group: 'Solvabilitas & leverage', label: 'Gearing (utang bank ÷ ekuitas)', type: 'x', rule: { op: '<=', val: 2.0 }, formula: 'utang bank ÷ ekuitas',
      fn: (c) => overEquity(val(c, 'utang_bank'), val(c, 'ekuitas')) },
    { key: 'dar', group: 'Solvabilitas & leverage', label: 'Debt to asset ratio', type: 'pct', rule: { op: '<=', val: 0.75 }, formula: 'total liabilitas ÷ total aset',
      fn: (c) => div(val(c, 'total_utang'), val(c, 'total_aset')) },
    { key: 'debt_ebitda', group: 'Solvabilitas & leverage', label: 'Debt ÷ EBITDA', type: 'x', rule: { op: '<=', val: 4.0 }, formula: 'utang bank ÷ EBITDA disetahunkan',
      fn: (c) => { const e = ebitda(c), d = val(c, 'utang_bank'); if (!has(e, d)) return null; return e <= 0 ? (d > 0 ? Infinity : 0) : d / (e * c.ann); } },

    { key: 'ebitda', group: 'Kemampuan bayar', label: 'EBITDA (Rp)', type: 'money', rule: { op: '>', val: 0 }, formula: 'laba usaha + penyusutan',
      fn: (c) => ebitda(c) },
    { key: 'icr', group: 'Kemampuan bayar', label: 'Interest coverage ratio (ICR)', type: 'x', rule: { op: '>=', val: 1.5 }, formula: 'EBIT ÷ beban bunga',
      fn: (c) => { const e = ebit(c), b = val(c, 'biaya_bunga'); return has(e, b) && b > 0 ? e / b : null; } },
    { key: 'dscr', group: 'Kemampuan bayar', label: 'DSCR (existing)', type: 'x', rule: { op: '>=', val: null, fromParams: 'dscr' }, formula: 'EBITDA disetahunkan ÷ kewajiban bank existing per tahun',
      fn: (c) => { const e = ebitda(c), k = val(c, 'kewajiban_bank_tahunan'); return has(e, k) && k > 0 ? (e * c.ann) / k : null; } },

    { key: 'dso', group: 'Aktivitas & modal kerja', label: 'Hari piutang (DSO)', type: 'days', formula: 'piutang ÷ penjualan disetahunkan × 365',
      fn: (c) => { const r = div(val(c, 'piutang'), val(c, 'penjualan') == null ? null : val(c, 'penjualan') * c.ann); return r == null ? null : r * 365; } },
    { key: 'dio', group: 'Aktivitas & modal kerja', label: 'Hari persediaan (DIO)', type: 'days', formula: 'persediaan ÷ HPP disetahunkan × 365',
      fn: (c) => { const r = div(val(c, 'persediaan'), val(c, 'hpp') == null ? null : val(c, 'hpp') * c.ann); return r == null ? null : r * 365; } },
    { key: 'dpo', group: 'Aktivitas & modal kerja', label: 'Hari utang dagang (DPO)', type: 'days', formula: 'utang dagang ÷ HPP disetahunkan × 365',
      fn: (c) => { const r = div(val(c, 'utang_dagang'), val(c, 'hpp') == null ? null : val(c, 'hpp') * c.ann); return r == null ? null : r * 365; } },
    { key: 'trade_cycle', group: 'Aktivitas & modal kerja', label: 'Trade cycle (hari)', type: 'days', formula: 'DSO + DIO − DPO',
      fn: (c, r) => (r.dso != null || r.dio != null ? (r.dso || 0) + (r.dio || 0) - (r.dpo || 0) : null) },
    { key: 'tato', group: 'Aktivitas & modal kerja', label: 'Perputaran total aset (TATO)', type: 'x', formula: 'penjualan disetahunkan ÷ total aset',
      fn: (c) => div(val(c, 'penjualan') == null ? null : val(c, 'penjualan') * c.ann, val(c, 'total_aset')) },
    { key: 'kebutuhan_mk', group: 'Aktivitas & modal kerja', label: 'Kebutuhan modal kerja (Rp)', type: 'money', formula: 'piutang + persediaan − utang dagang',
      fn: (c) => (val(c, 'piutang') == null && val(c, 'persediaan') == null ? null : (val(c, 'piutang') || 0) + (val(c, 'persediaan') || 0) - (val(c, 'utang_dagang') || 0)) },
  ];

  /* Proforma setelah fasilitas baru — memakai periode terbaru yang terisi. base = kunci acuan yang dipakai bersama. */
  const PF_DEFS = [
    { key: 'angsuran_baru', label: 'Angsuran / bunga fasilitas baru per bulan (Rp)', type: 'money', formula: 'anuitas: PMT(bunga/12, tenor, plafon); revolving: plafon × bunga/12' },
    { key: 'dscr_pf', base: 'dscr', label: 'DSCR proforma', type: 'x', formula: 'EBITDA disetahunkan ÷ (kewajiban existing − kewajiban fasilitas lama + angsuran baru × 12)' },
    { key: 'icr_pf', base: 'icr', label: 'ICR proforma', type: 'x', formula: 'EBIT disetahunkan ÷ (beban bunga disetahunkan − bunga fasilitas lama + bunga fasilitas baru)' },
    { key: 'der_pf', base: 'der', label: 'DER proforma', type: 'x', formula: '(total liabilitas − outstanding lama + plafon) ÷ ekuitas' },
    { key: 'debt_ebitda_pf', base: 'debt_ebitda', label: 'Debt ÷ EBITDA proforma', type: 'x', formula: '(utang bank − outstanding lama + plafon) ÷ EBITDA disetahunkan' },
    { key: 'ltv', label: 'Loan to value (LTV)', type: 'pct', rule: { op: '<=', val: 0.8 }, formula: 'plafon ÷ nilai agunan' },
    { key: 'coverage', label: 'Coverage agunan', type: 'pct', rule: { op: '>=', val: 1.0 }, formula: 'nilai agunan ÷ plafon' },
    { key: 'plafon_vs_mk', label: 'Plafon KMK ÷ kebutuhan modal kerja', type: 'pct', rule: { op: '<=', val: 1.0 }, formula: 'plafon ÷ (piutang + persediaan − utang dagang) — khusus KMK' },
    { key: 'rk_vs_penjualan', label: 'Mutasi kredit bersih rek. koran ÷ penjualan LK', type: 'pct', rule: { op: '>=', val: 0.5 }, formula: 'rata-rata kredit bersih/bulan × 12 ÷ penjualan disetahunkan' },
    { key: 'saldo_vs_angsuran', label: 'Rata-rata saldo harian ÷ angsuran baru', type: 'x', formula: 'rata-rata saldo harian rekening ÷ angsuran per bulan' },
  ];

  const ALL_RULE_DEFS = DEFS.filter((d) => d.rule).concat(PF_DEFS.filter((d) => d.rule));

  function rule(key) {
    const over = store.get('ratioRules', {});
    const pf = PF_DEFS.find((d) => d.key === key);
    if (pf && pf.base) return rule(pf.base);
    if (over[key]) return over[key];
    const d = DEFS.find((x) => x.key === key) || pf;
    if (!d || !d.rule) return null;
    if (d.rule.fromParams) return { op: d.rule.op, val: App.params()[d.rule.fromParams] };
    return { op: d.rule.op, val: d.rule.val };
  }
  function defaultRule(key) {
    const d = DEFS.find((x) => x.key === key) || PF_DEFS.find((x) => x.key === key);
    if (!d || !d.rule) return null;
    return d.rule.fromParams ? { op: d.rule.op, val: App.params()[d.rule.fromParams] } : { ...d.rule };
  }
  function check(v, r) {
    if (!r || r.val == null) return 'info';
    if (v == null || (typeof v === 'number' && isNaN(v))) return 'na';
    switch (r.op) {
      case '>=': return v >= r.val ? 'ok' : 'fail';
      case '>': return v > r.val ? 'ok' : 'fail';
      case '<=': return v <= r.val ? 'ok' : 'fail';
      case '<': return v < r.val ? 'ok' : 'fail';
      default: return 'info';
    }
  }

  function fmtVal(v, type) {
    if (v == null || (typeof v === 'number' && isNaN(v))) return '-';
    if (v === Infinity) return 'tak terhingga';
    if (v === -Infinity) return '-∞';
    switch (type) {
      case 'pct': return fmt(v * 100, 1) + '%';
      case 'x': return fmt(v, 2) + 'x';
      case 'days': return fmt(v, 0);
      default: return fmt(v, 0);
    }
  }
  function ruleText(r, type) {
    if (!r || r.val == null) return '';
    const sym = { '>=': '≥', '>': '>', '<=': '≤', '<': '<' }[r.op] || r.op;
    return sym + ' ' + (type === 'money' && r.val === 0 ? '0' : fmtVal(r.val, type));
  }
  const STATUS = { ok: { icon: '✓', text: 'Memenuhi', cls: 'ok' }, fail: { icon: '✗', text: 'Tidak memenuhi', cls: 'bad' }, na: { icon: '–', text: 'Data kurang', cls: 'neutral' }, info: { icon: 'ℹ', text: 'Informasi', cls: 'info' } };

  /* ---------------------------- Hitung ---------------------------- */
  function periodCtx(keu, i) {
    const v = {};
    FIN_ITEMS.forEach(([k]) => {
      const raw = (keu[k] || [])[i];
      v[k] = raw === '' || raw == null ? null : parseMoney(raw);
    });
    const bulan = +((keu.bulan || [])[i]) || 12;
    return { v, ann: 12 / bulan, bulan, i };
  }
  function hasData(c) { return ['penjualan', 'total_aset', 'laba_bersih', 'aset_lancar'].some((k) => c.v[k] != null); }

  function computePeriods(keu) {
    keu = keu || {};
    const ctxs = [0, 1, 2].map((i) => periodCtx(keu, i));
    ctxs.forEach((c, i) => {
      for (let j = i - 1; j >= 0; j--) if (hasData(ctxs[j])) { c.prev = ctxs[j]; break; }
    });
    return ctxs.map((c) => {
      const r = {};
      DEFS.forEach((d) => { if (hasData(c)) r[d.key] = d.fn(c, r); else r[d.key] = null; });
      return r;
    });
  }

  function annuity(P, rate, n) { const r = rate / 12; return r > 0 ? (P * r) / (1 - Math.pow(1 + r, -n)) : P / n; }

  function proforma(data) {
    const keu = data.keu || {};
    const ctxs = [0, 1, 2].map((i) => periodCtx(keu, i));
    let li = -1;
    ctxs.forEach((c, i) => { if (hasData(c)) li = i; });
    const out = { latest: li, values: {} };
    const plafon = parseMoney(data.plafon), rate = (parseFloat(String(data.suku_bunga || '').replace(',', '.')) || 0) / 100;
    const tenor = Math.max(1, parseInt(data.tenor_bulan, 10) || 12);
    const revolving = /revolving|bunga saja/i.test(data.pola_angsuran || '') || (!data.pola_angsuran && /revolving|rekening koran|\bPRK\b/i.test(data.jenis_fasilitas || ''));
    const isKMK = revolving || /KMK|modal kerja/i.test(data.jenis_fasilitas || '');
    const osLama = parseMoney(data.os_lama), kewLama = parseMoney(data.kewajiban_lama);
    const agunan = parseMoney(data.nilai_agunan);
    const V = out.values;
    out.revolving = revolving;
    if (plafon > 0) V.angsuran_baru = revolving ? plafon * rate / 12 : annuity(plafon, rate, tenor);
    if (plafon > 0 && agunan > 0) { V.ltv = plafon / agunan; V.coverage = agunan / plafon; }
    if (li < 0) return out;
    const c = ctxs[li];
    const e = ebitda(c), eb = ebit(c);
    const bunga = c.v.biaya_bunga, kew = c.v.kewajiban_bank_tahunan;
    if (plafon > 0) {
      if (e != null) V.dscr_pf = ((kew || 0) - kewLama + V.angsuran_baru * 12) > 0 ? (e * c.ann) / ((kew || 0) - kewLama + V.angsuran_baru * 12) : null;
      if (eb != null) { const den = (bunga || 0) * c.ann - osLama * rate + plafon * rate; V.icr_pf = den > 0 ? (eb * c.ann) / den : null; }
      if (c.v.total_utang != null && c.v.ekuitas != null) V.der_pf = overEquity(c.v.total_utang - osLama + plafon, c.v.ekuitas);
      if (e != null) { const d = (c.v.utang_bank || 0) - osLama + plafon; V.debt_ebitda_pf = e <= 0 ? Infinity : d / (e * c.ann); }
      if (isKMK) {
        const mk = (c.v.piutang || 0) + (c.v.persediaan || 0) - (c.v.utang_dagang || 0);
        if (c.v.piutang != null || c.v.persediaan != null) V.plafon_vs_mk = mk > 0 ? plafon / mk : Infinity;
      }
    }
    const rk = parseMoney(data.rk_rata_omzet), saldo = parseMoney(data.rk_rata_saldo);
    if (rk > 0 && c.v.penjualan) V.rk_vs_penjualan = (rk * 12) / (c.v.penjualan * c.ann);
    if (saldo > 0 && V.angsuran_baru) V.saldo_vs_angsuran = saldo / V.angsuran_baru;
    return out;
  }

  /** Evaluasi lengkap untuk tampilan & dokumen. */
  function evaluate(data) {
    const keu = data.keu || {};
    const periods = computePeriods(keu);
    const pf = proforma(data);
    const li = pf.latest;
    const rows = DEFS.map((d) => {
      const r = rule(d.key);
      const values = periods.map((p) => p[d.key]);
      const latest = li >= 0 ? values[li] : null;
      let prevIdx = -1;
      for (let j = li - 1; j >= 0; j--) if (values[j] != null) { prevIdx = j; break; }
      let trend = '';
      if (li >= 0 && prevIdx >= 0 && isFinite(latest) && isFinite(values[prevIdx]) && latest !== values[prevIdx]) {
        const up = latest > values[prevIdx];
        const better = r && r.val != null ? (r.op.startsWith('>') ? up : !up) : null;
        trend = (up ? '▲ naik' : '▼ turun') + (better == null ? '' : better ? ' (membaik)' : ' (memburuk)');
      }
      return { def: d, values, rule: r, status: check(latest, r), trend };
    });
    const pfRows = PF_DEFS.map((d) => {
      const r = rule(d.key);
      const v = pf.values[d.key];
      let status = check(v, r);
      if (v == null) status = r ? 'na' : 'info';
      return { def: d, value: v, rule: r, status };
    });
    const relevant = rows.filter((x) => x.status !== 'info').concat(pfRows.filter((x) => x.status !== 'info'));
    const ok = relevant.filter((x) => x.status === 'ok').length;
    const fail = relevant.filter((x) => x.status === 'fail');
    const na = relevant.filter((x) => x.status === 'na').length;
    const failText = fail.map((x) => `${x.def.label} ${fmtVal(x.values ? x.values[li] : x.value, x.def.type)} (acuan ${ruleText(x.rule, x.def.type)})`);
    let summary;
    if (li < 0) summary = 'Data laporan keuangan belum diisi.';
    else summary = `${ok} dari ${ok + fail.length} rasio yang dapat dihitung memenuhi acuan` + (na ? `, ${na} belum dapat dihitung (data kurang)` : '') + '.' + (fail.length ? ' Perlu perhatian: ' + failText.join('; ') + '.' : ' Tidak ada rasio di bawah acuan.');
    return { periods, rows, pf, pfRows, latest: li, ok, fail: fail.length, na, failText, summary };
  }

  /** Cek konsistensi angka laporan keuangan (menangkap salah ketik / salah baca OCR). */
  function consistency(keu) {
    const out = [];
    for (let i = 0; i < 3; i++) {
      const c = periodCtx(keu || {}, i);
      if (!hasData(c)) continue;
      const v = c.v, lbl = (keu.periode && keu.periode[i]) || 'kolom ' + (i + 1);
      const F = (x) => fmt(x, 0);
      const gt = (a, b) => has(a, b) && a > b * 1.001 + 1;
      if (has(v.total_aset, v.total_utang, v.ekuitas) && Math.abs(v.total_aset - v.total_utang - v.ekuitas) > Math.max(1, Math.abs(v.total_aset) * 0.005)) out.push(`${lbl}: total aset ${F(v.total_aset)} ≠ total liabilitas + ekuitas ${F(v.total_utang + v.ekuitas)}`);
      if (gt(v.aset_lancar, v.total_aset)) out.push(`${lbl}: aset lancar lebih besar dari total aset`);
      if (gt(v.utang_lancar, v.total_utang)) out.push(`${lbl}: liabilitas jangka pendek ${F(v.utang_lancar)} lebih besar dari total liabilitas ${F(v.total_utang)}`);
      if (gt(v.utang_dagang, v.utang_lancar)) out.push(`${lbl}: utang dagang lebih besar dari liabilitas jangka pendek`);
      const sub = (v.kas || 0) + (v.piutang || 0) + (v.persediaan || 0);
      if (v.aset_lancar != null && sub > v.aset_lancar * 1.001 + 1) out.push(`${lbl}: kas + piutang + persediaan ${F(sub)} melebihi aset lancar ${F(v.aset_lancar)}`);
      if (has(v.aset_lancar, v.aset_tetap, v.total_aset) && v.aset_lancar + v.aset_tetap > v.total_aset * 1.001 + 1) out.push(`${lbl}: aset lancar + aset tetap melebihi total aset`);
      if (gt(v.hpp, v.penjualan)) out.push(`${lbl}: HPP lebih besar dari penjualan (rugi kotor) — pastikan benar`);
      if (gt(v.laba_bersih, v.penjualan)) out.push(`${lbl}: laba bersih lebih besar dari penjualan`);
    }
    return out;
  }

  App.ratios = { consistency, FIN_ITEMS, DEFS, PF_DEFS, ALL_RULE_DEFS, rule, defaultRule, check, fmtVal, ruleText, STATUS, computePeriods, proforma, evaluate, ebit, ebitda };
})();
