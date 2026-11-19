/* Modul 1 — Rekap Mutasi Rekening Koran (tampilan) */
'use strict';
(function () {
  const { $, el, esc, toast, store, fmt, fmtRp, fmtPct, fmtShort, fmtDate, fmtMonth, readFileAs, setupDrop, setProgress, uid, exportXlsx, copyText, confirmBox, parseMoney, linesOf } = App;
  const P = App.stmt;

  const S = { accounts: [], result: null, scope: '__all', filter: 'all', search: '' };

  /* ---------------------------- CSV sederhana ---------------------------- */
  function detectDelimiter(text) {
    const first = text.split(/\r?\n/).slice(0, 10).join('\n');
    const counts = [',', ';', '\t', '|'].map((d) => [d, first.split(d).length]);
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][0];
  }
  function parseCSV(text, delim) {
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.map((r) => r.map((c) => c.replace(/^'/, '').trim()));
  }

  /* ---------------------------- Opsi analisis ---------------------------- */
  function analysisOpts() {
    return {
      own: linesOf($('#rk-own').value).concat($('#rk-nama').value.trim() ? [$('#rk-nama').value.trim()] : []),
      windowDays: +$('#rk-window').value || 0,
      pairSame: $('#rk-pair-same').checked,
      kw: App.keywords(),
    };
  }
  function userYear() { const y = parseInt($('#rk-year').value, 10); return y > 1990 && y < 2100 ? y : null; }

  /* ---------------------------- Proses file ---------------------------- */
  async function handleFiles(files) {
    const prog = $('#rk-progress');
    for (let fi = 0; fi < files.length; fi++) {
      const f = files[fi];
      const label = `(${fi + 1}/${files.length}) ${f.name}`;
      try {
        setProgress(prog, 0.02, 'Membaca ' + label);
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        if (ext === 'pdf') await handlePdf(f, (p, t) => setProgress(prog, p, label + ' — ' + t));
        else if (ext === 'csv') await handleCsv(f);
        else if (ext === 'xlsx' || ext === 'xls') await handleExcel(f);
        else if (ext === 'txt') {
          const text = await readFileAs(f, 'text');
          addAccount(f.name, P.parseLines(text.split(/\r?\n/).map((t) => ({ text: t.trim() })).filter((l) => l.text), { year: userYear() }), 'teks');
        } else toast('Format tidak didukung: ' + f.name);
      } catch (e) {
        console.error(e);
        toast('Gagal membaca ' + f.name + ': ' + (e.message || e), 5000);
      }
    }
    setProgress(prog, null);
    recompute();
  }

  async function handlePdf(f, onProg) {
    const ab = await readFileAs(f, 'array');
    const { pages, pdf } = await App.text.pdfToLines(ab, (p, t) => onProg(p * 0.5, t));
    const chars = pages.reduce((s, p) => s + p.charCount, 0);
    let lines = pages.flatMap((p) => p.lines);
    let method = 'PDF teks';
    let parsed = lines.length ? P.parseLines(lines, { year: userYear() }) : null;
    if (!parsed || parsed.txns.length === 0 || chars < 40 * pages.length) {
      const ok = await confirmBox(`"${f.name}" tampaknya PDF hasil scan (tidak ada teks yang bisa dibaca langsung). Jalankan OCR offline? Proses ±10–30 detik per halaman.`, 'Jalankan OCR');
      if (!ok) return;
      lines = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        onProg(0.5 + (i - 1) / pdf.numPages * 0.5, `OCR halaman ${i}/${pdf.numPages}…`);
        const canvas = await App.text.renderPdfPage(pdf, i, 2.5);
        const r = await App.text.ocrImage(canvas, (m) => onProg(0.5 + ((i - 1) + (m.progress || 0)) / pdf.numPages * 0.5, `OCR halaman ${i}/${pdf.numPages} — ${Math.round((m.progress || 0) * 100)}%`));
        r.lines.forEach((l) => { l.page = i; lines.push(l); });
      }
      parsed = P.parseLines(lines, { year: userYear() });
      method = 'PDF scan (OCR)';
      parsed.warnings.push('Dibaca dengan OCR — periksa baris bertanda "saldo tidak cocok".');
    }
    addAccount(f.name, parsed, method);
  }

  async function handleCsv(f) {
    const text = await readFileAs(f, 'text');
    const rows = parseCSV(text, detectDelimiter(text));
    handleRows(f.name, rows, 'CSV');
  }
  async function handleExcel(f) {
    const ab = await readFileAs(f, 'array');
    const wb = XLSX.read(ab, { type: 'array', cellDates: true });
    let done = false;
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
      if (P.detectMapping(rows)) { handleRows(f.name + (wb.SheetNames.length > 1 ? ' [' + name + ']' : ''), rows, 'Excel'); done = true; }
    }
    if (!done) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
      handleRows(f.name, rows, 'Excel');
    }
  }
  function handleRows(name, rows, method) {
    const det = P.detectMapping(rows);
    if (!det) {
      const lines = rows.map((r) => ({ text: r.map((c) => String(c == null ? '' : c)).join(' ').trim() })).filter((l) => l.text);
      addAccount(name, P.parseLines(lines, { year: userYear() }), method + ' (baca teks)');
      return;
    }
    const acc = addAccount(name, P.parseTable(rows, det.map, { year: userYear() }), method);
    acc.table = { rows, header: det.header, map: det.map };
  }

  function addAccount(fileName, parsed, method) {
    const m = parsed.meta || {};
    const label = [m.bank, m.accountNo].filter(Boolean).join(' ') || fileName.replace(/\.[^.]+$/, '');
    const acc = {
      id: uid(), fileName, label, bank: m.bank, accountNo: m.accountNo, holder: m.holder, period: m.period,
      opening: parsed.opening, closingStated: parsed.closingStated, txns: parsed.txns, warnings: parsed.warnings, method,
      year: parsed.year,
    };
    S.accounts.push(acc);
    return acc;
  }

  /* ---------------------------- Hitung ulang & tampilkan ---------------------------- */
  function recompute() {
    if (!S.accounts.length) {
      S.result = null;
      $('#rk-results').classList.add('hidden');
      renderFiles();
      return;
    }
    S.result = P.analyze(S.accounts, analysisOpts());
    renderFiles();
    renderResults();
  }
  function refreshSummaryOnly() {
    S.result = P.summarize(S.accounts);
    renderResults(true);
  }

  function renderFiles() {
    const wrap = $('#rk-files');
    wrap.innerHTML = '';
    if (!S.accounts.length) return;
    const card = el('div', { class: 'card' }, el('h3', { text: 'File yang dibaca' }));
    for (const acc of S.accounts) {
      const ck = acc.check || { matched: 0, checked: 0 };
      let status;
      if (!acc.txns.length) status = el('span', { class: 'pill bad' }, '✖ tidak ada transaksi');
      else if (!ck.checked) status = el('span', { class: 'pill warn' }, '⚠ tanpa kolom saldo — saldo dihitung dari saldo awal');
      else if (ck.matched === ck.checked) status = el('span', { class: 'pill ok' }, `✓ ${ck.matched}/${ck.checked} saldo cocok`);
      else status = el('span', { class: 'pill warn' }, `⚠ ${ck.checked - ck.matched} dari ${ck.checked} baris saldo tidak cocok`);
      const per = (S.result && S.result.per.find((p) => p.id === acc.id) || {}).period || {};
      const inpLabel = el('input', { value: acc.label, title: 'Nama rekening' });
      inpLabel.addEventListener('change', () => { acc.label = inpLabel.value.trim() || acc.fileName; recompute(); });
      const inpStart = el('input', { type: 'date', value: per.start || '' });
      const inpEnd = el('input', { type: 'date', value: per.end || '' });
      const onPeriod = () => { acc.periodOverride = { start: inpStart.value || null, end: inpEnd.value || null }; recompute(); };
      inpStart.addEventListener('change', onPeriod);
      inpEnd.addEventListener('change', onPeriod);
      const inpOpen = el('input', { 'data-money': '', value: acc.openingUsed != null ? fmt(acc.openingUsed, 2) : '' });
      inpOpen.addEventListener('change', () => { acc.opening = parseMoney(inpOpen.value); recompute(); });
      const openNote = acc.opening != null && !acc.openingDerived ? 'terbaca dari dokumen / diisi' : (acc.openingDerived ? 'diturunkan dari transaksi pertama' : 'tidak terbaca — isi manual');
      const rm = el('button', { class: 'btn danger sm', onclick: () => { S.accounts = S.accounts.filter((a) => a !== acc); recompute(); } }, 'Hapus');
      const box = el('div', { style: { borderTop: '1px solid var(--border)', padding: '12px 0' } },
        el('div', { class: 'row' },
          el('strong', { text: acc.fileName }), el('span', { class: 'pill neutral', text: acc.method }), status,
          el('span', { class: 'muted small', text: acc.txns.length + ' transaksi' }),
          el('div', { class: 'spacer' }), acc.table ? el('button', { class: 'btn secondary sm', onclick: () => editMapping(acc) }, 'Ubah pemetaan kolom') : null, rm),
        el('div', { class: 'grid g4', style: { marginTop: '8px' } },
          el('label', { class: 'f' }, 'Nama rekening', inpLabel),
          el('label', { class: 'f' }, 'Periode mulai', inpStart),
          el('label', { class: 'f' }, 'Periode akhir', inpEnd),
          el('label', { class: 'f' }, el('span', {}, 'Saldo awal ', el('span', { class: 'hint', text: '(' + openNote + ')' })), inpOpen)),
        acc.closingStated != null && acc.closingComputed != null ? el('div', { class: 'small ' + (Math.abs(acc.closingStated - acc.closingComputed) < 1 ? 'muted' : ''), style: { marginTop: '6px' } },
          Math.abs(acc.closingStated - acc.closingComputed) < 1 ? '✓ Saldo akhir dokumen = saldo akhir hasil hitung (' + fmtRp(acc.closingStated, 2) + ')'
            : '⚠ Saldo akhir dokumen ' + fmtRp(acc.closingStated, 2) + ' ≠ hasil hitung ' + fmtRp(acc.closingComputed, 2)) : null,
        acc.warnings && acc.warnings.length ? el('div', { class: 'small', style: { color: 'var(--warn)', marginTop: '6px' } }, acc.warnings.join(' · ')) : null);
      card.appendChild(box);
    }
    wrap.appendChild(card);
    App.bindMoneyInputs(wrap);
  }

  async function editMapping(acc) {
    const { header, map } = acc.table;
    const body = el('div');
    const sels = {};
    const grid = el('div', { class: 'grid g2' });
    P.MAP_FIELDS.forEach(([key, label]) => {
      const s = el('select', {}, el('option', { value: '-1', text: '(tidak ada)' }), header.map((h, i) => el('option', { value: String(i), text: h || ('Kolom ' + (i + 1)) })));
      s.value = String(map[key] == null ? -1 : map[key]);
      sels[key] = s;
      grid.appendChild(el('label', { class: 'f' }, label, s));
    });
    body.appendChild(el('p', { class: 'text-2', text: 'Pilih kolom yang sesuai. Gunakan Debit + Kredit, atau Nominal satu kolom + kolom D/K.' }));
    body.appendChild(grid);
    const r = await App.modal('Pemetaan kolom — ' + acc.fileName, body, [{ label: 'Batal', value: false, cls: 'secondary' }, { label: 'Terapkan', value: true }]);
    if (!r) return;
    const nm = { headerRow: map.headerRow };
    Object.keys(sels).forEach((k) => { nm[k] = +sels[k].value; });
    const parsed = P.parseTable(acc.table.rows, nm, { year: userYear() });
    acc.table.map = nm;
    acc.txns = parsed.txns;
    acc.opening = parsed.opening;
    acc.warnings = parsed.warnings;
    recompute();
  }

  function scopeSummary() {
    if (!S.result) return null;
    if (S.scope === '__all' || S.accounts.length === 1) return S.accounts.length === 1 ? S.result.per[0] : S.result.combined;
    return S.result.per.find((p) => p.id === S.scope) || S.result.combined;
  }
  function scopeTxns() {
    if (S.scope === '__all') return S.accounts.flatMap((a) => a.txns.map((t) => [a, t]));
    const a = S.accounts.find((x) => x.id === S.scope);
    return a ? a.txns.map((t) => [a, t]) : [];
  }

  function renderResults(summaryOnly) {
    $('#rk-results').classList.remove('hidden');
    const scopeSel = $('#rk-scope');
    if (!summaryOnly) {
      scopeSel.innerHTML = '';
      if (S.accounts.length > 1) scopeSel.appendChild(el('option', { value: '__all', text: 'Gabungan semua rekening' }));
      S.accounts.forEach((a) => scopeSel.appendChild(el('option', { value: a.id, text: a.label })));
      if (![...scopeSel.options].some((o) => o.value === S.scope)) S.scope = scopeSel.options[0].value;
      scopeSel.value = S.scope;
    }
    const s = scopeSummary();
    const t = s && s.totals;
    const stats = $('#rk-stats');
    stats.innerHTML = '';
    if (!t) { stats.appendChild(el('p', { class: 'muted', text: 'Belum ada data.' })); return; }
    const txs = scopeTxns();
    const ck = S.scope === '__all' ? S.accounts.reduce((a, x) => ({ m: a.m + (x.check ? x.check.matched : 0), c: a.c + (x.check ? x.check.checked : 0) }), { m: 0, c: 0 })
      : (() => { const a = S.accounts.find((x) => x.id === S.scope) || S.accounts[0]; return { m: a.check.matched, c: a.check.checked }; })();
    const nReview = txs.filter(([, x]) => x.flags && x.flags.length && !P.effContra(x)).length;
    const basis = t.usedFullOnly ? `rata-rata ${t.monthsUsed} bulan penuh` : `rata-rata ${t.monthsUsed} bulan`;
    const tile = (lbl, val, sub) => el('div', { class: 'stat' }, el('div', { class: 'lbl', text: lbl }), el('div', { class: 'val', text: val }), sub ? el('div', { class: 'sub', text: sub }) : null);
    stats.append(
      tile('Kredit bersih (omzet) / bulan', fmtRp(t.avgCrNet), basis),
      tile('Rata-rata saldo harian', fmtRp(t.adb), 'seluruh periode'),
      tile('Debit bersih / bulan', fmtRp(t.avgDbNet), basis),
      tile('Omzet disetahunkan', fmtRp(t.avgCrNet * 12), 'kredit bersih/bulan × 12'),
      tile('Kredit contra dikeluarkan', fmtRp(t.crContra), fmtPct(t.crGross ? t.crContra / t.crGross : 0) + ' dari total kredit ' + fmtShort(t.crGross)),
      tile('Kredit bukan omzet', fmtRp(t.crNonOmzet), 'bunga, pencairan kredit, koreksi'),
      tile('Saldo terendah / tertinggi', fmtShort(t.minBal) + ' / ' + fmtShort(t.maxBal), 'saldo akhir hari'),
      tile('Validasi saldo', ck.c ? `${ck.m}/${ck.c} cocok` : 'tanpa saldo', nReview ? `${nReview} transaksi perlu dicek` : 'tidak ada transaksi bertanda'));
    renderChart($('#rk-chart'), s.months);
    renderMonthly($('#rk-monthly'), s.months, t);
    if (!summaryOnly) renderTxns();
  }

  function renderMonthly(wrap, months, t) {
    const cols = ['Bulan', 'Hari data', 'Saldo awal', 'Kredit (total)', 'Kredit contra', 'Bukan omzet', 'Kredit bersih (omzet)', 'Frek. kredit', 'Debit (total)', 'Debit contra', 'Debit bersih', 'Frek. debit', 'Saldo akhir', 'Rata-rata saldo harian', 'Saldo min', 'Saldo maks'];
    const tb = el('table', { class: 't' });
    tb.appendChild(el('thead', {}, el('tr', {}, cols.map((c, i) => el('th', { class: i ? 'num' : '', text: c })))));
    const body = el('tbody');
    months.forEach((m) => {
      const partial = m.days < m.fullDays;
      body.appendChild(el('tr', {},
        el('td', { class: 'nowrap', text: fmtMonth(m.key) + (partial ? ' *' : '') }),
        el('td', { class: 'num', text: m.days + '/' + m.fullDays }),
        ...[m.saldoAwal, m.crGross, m.crContra, m.crNonOmzet, m.crNet].map((v) => el('td', { class: 'num', text: fmt(v) })),
        el('td', { class: 'num', text: m.crNetCount }),
        ...[m.dbGross, m.dbContra, m.dbNet].map((v) => el('td', { class: 'num', text: fmt(v) })),
        el('td', { class: 'num', text: m.dbNetCount }),
        ...[m.saldoAkhir, m.adb, m.minBal, m.maxBal].map((v) => el('td', { class: 'num', text: fmt(v) }))));
    });
    tb.appendChild(body);
    tb.appendChild(el('tfoot', {}, el('tr', {},
      el('td', { text: 'Rata-rata/bln' }), el('td', {}), el('td', {}),
      el('td', { class: 'num', text: fmt(t.avgCrGross) }), el('td', {}), el('td', {}),
      el('td', { class: 'num', text: fmt(t.avgCrNet) }), el('td', {}), el('td', {}), el('td', {}),
      el('td', { class: 'num', text: fmt(t.avgDbNet) }), el('td', {}), el('td', {}),
      el('td', { class: 'num', text: fmt(t.adb) }), el('td', {}), el('td', {}))));
    wrap.innerHTML = '';
    wrap.appendChild(tb);
    if (months.some((m) => m.days < m.fullDays)) wrap.appendChild(el('div', { class: 'small muted', style: { padding: '6px 8px' }, text: '* bulan tidak penuh. ' + (t.usedFullOnly ? 'Rata-rata kredit/debit per bulan dihitung dari bulan penuh saja.' : '') }));
  }

  function renderTxns() {
    const wrap = $('#rk-txns');
    const multi = S.accounts.length > 1;
    const q = S.search.trim().toUpperCase();
    let rows = scopeTxns();
    rows = rows.filter(([, t]) => {
      if (q && !t.desc.toUpperCase().includes(q)) return false;
      switch (S.filter) {
        case 'cr': return t.credit > 0;
        case 'db': return t.debit > 0;
        case 'contra': return P.effContra(t);
        case 'review': return t.flags && t.flags.length > 0;
        case 'mismatch': return t.mismatch;
        default: return true;
      }
    });
    if (S.scope === '__all' && multi) rows.sort((a, b) => a[1].date.localeCompare(b[1].date));
    const LIMIT = 2000;
    const tb = el('table', { class: 't' });
    tb.appendChild(el('thead', {}, el('tr', {},
      el('th', { text: 'Tanggal' }), multi ? el('th', { text: 'Rekening' }) : null, el('th', { text: 'Keterangan' }),
      el('th', { class: 'num', text: 'Debit' }), el('th', { class: 'num', text: 'Kredit' }), el('th', { class: 'num', text: 'Saldo' }),
      el('th', { text: 'Kategori' }), el('th', { text: 'Contra' }), el('th', { text: 'Catatan' }))));
    const body = el('tbody');
    rows.slice(0, LIMIT).forEach(([acc, t]) => {
      const contra = P.effContra(t);
      const tr = el('tr', { class: contra ? 'row-contra' : (t.mismatch ? 'row-mismatch' : (t.flags && t.flags.length ? 'row-review' : '')) });
      const cats = t.credit > 0 ? P.CATEGORIES_CR : P.CATEGORIES_DB;
      const sel = el('select', { class: 'in-cell' }, cats.map((c) => el('option', { value: c, text: c })));
      sel.value = P.effCat(t);
      sel.addEventListener('change', () => { t.userCat = sel.value === t.autoCat ? null : sel.value; refreshSummaryOnly(); });
      const cb = el('input', { type: 'checkbox' });
      cb.checked = contra;
      cb.addEventListener('change', () => {
        t.userContra = cb.checked === t.autoContra ? null : cb.checked;
        tr.className = cb.checked ? 'row-contra' : '';
        refreshSummaryOnly();
      });
      const notes = [];
      if (t.contraReason) notes.push('Contra: ' + t.contraReason);
      (t.flags || []).forEach((f) => notes.push('⚠ ' + f));
      if (t.userContra != null || t.userCat) notes.push('✎ diubah manual');
      tr.append(
        el('td', { class: 'nowrap', text: fmtDate(t.date) }),
        multi ? el('td', { class: 'nowrap small', text: acc.label }) : null,
        el('td', { class: 'desc', text: t.desc }),
        el('td', { class: 'num', text: t.debit ? fmt(t.debit, 2) : '' }),
        el('td', { class: 'num', text: t.credit ? fmt(t.credit, 2) : '' }),
        el('td', { class: 'num', text: fmt(t.balance != null ? t.balance : t.runBal, 2) }),
        el('td', {}, sel), el('td', { style: { textAlign: 'center' } }, cb),
        el('td', { class: 'small', style: { minWidth: '200px' }, text: notes.join(' · ') }));
      body.appendChild(tr);
    });
    tb.appendChild(body);
    wrap.innerHTML = '';
    wrap.appendChild(tb);
    if (rows.length > LIMIT) wrap.appendChild(el('div', { class: 'small muted', style: { padding: '6px' }, text: `Menampilkan ${LIMIT} dari ${rows.length} baris. Gunakan filter/pencarian, atau ekspor Excel untuk melihat semua.` }));
    if (!rows.length) wrap.appendChild(el('div', { class: 'muted', style: { padding: '10px' }, text: 'Tidak ada transaksi untuk filter ini.' }));
  }

  /* ---------------------------- Grafik batang ---------------------------- */
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function renderChart(wrap, months) {
    wrap.innerHTML = '';
    if (!months.length) return;
    const NS = 'http://www.w3.org/2000/svg';
    const W = Math.max(520, wrap.clientWidth || 900), H = 270;
    const m = { l: 70, r: 16, t: 22, b: 34 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const max = niceMax(Math.max(...months.map((x) => Math.max(x.crNet, x.dbNet))) * 1.08);
    const y = (v) => m.t + ih - (v / max) * ih;
    const gw = iw / months.length;
    const bw = Math.max(4, Math.min(30, gw * 0.32));
    const series = [
      { key: 'crNet', name: 'Kredit bersih (omzet)', color: 'var(--series-1)' },
      { key: 'dbNet', name: 'Debit bersih', color: 'var(--series-2)' },
    ];
    const root = el('div', { class: 'viz-root' });
    root.appendChild(el('div', { class: 'viz-legend' }, series.map((s) => el('span', {}, el('span', { class: 'key', style: { background: s.color } }), s.name))));
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Grafik batang kredit bersih dan debit bersih per bulan');
    const mk = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); if (text != null) e.textContent = text; svg.appendChild(e); return e; };
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, yy = y(v);
      mk('line', { x1: m.l, x2: W - m.r, y1: yy, y2: yy, stroke: i === 0 ? '#c9d0d6' : '#e7eaee', 'stroke-width': 1 });
      mk('text', { x: m.l - 8, y: yy + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#52514e' }, fmtShort(v));
    }
    const tip = el('div', { class: 'viz-tip' });
    const barPath = (x, top, w, base) => {
      const h = base - top;
      if (h <= 0) return '';
      const r = Math.min(4, w / 2, h);
      return `M${x},${base} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + w - r},${top} Q${x + w},${top} ${x + w},${top + r} L${x + w},${base} Z`;
    };
    months.forEach((mo, i) => {
      const cx = m.l + gw * i + gw / 2;
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'bar-group');
      svg.appendChild(g);
      series.forEach((s, si) => {
        const x = cx - bw - 1 + si * (bw + 2);
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', barPath(x, y(mo[s.key]), bw, y(0)));
        p.setAttribute('fill', s.color);
        p.setAttribute('class', 'bar');
        g.appendChild(p);
        if (i === months.length - 1 && mo[s.key] > 0) {
          const tx = document.createElementNS(NS, 'text');
          tx.setAttribute('x', x + bw / 2); tx.setAttribute('y', y(mo[s.key]) - 5);
          tx.setAttribute('text-anchor', 'middle'); tx.setAttribute('font-size', 10.5); tx.setAttribute('fill', '#14202b');
          tx.textContent = fmtShort(mo[s.key]);
          g.appendChild(tx);
        }
      });
      const lbl = document.createElementNS(NS, 'text');
      lbl.setAttribute('x', cx); lbl.setAttribute('y', H - m.b + 18); lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('font-size', 11); lbl.setAttribute('fill', '#52514e');
      lbl.textContent = fmtMonth(mo.key) + (mo.days < mo.fullDays ? '*' : '');
      g.appendChild(lbl);
      const hit = document.createElementNS(NS, 'rect');
      hit.setAttribute('x', m.l + gw * i); hit.setAttribute('y', m.t); hit.setAttribute('width', gw); hit.setAttribute('height', ih);
      hit.setAttribute('fill', 'transparent'); hit.setAttribute('tabindex', '0'); hit.setAttribute('class', 'bar-hit');
      hit.setAttribute('aria-label', `${fmtMonth(mo.key)}: kredit bersih ${fmtRp(mo.crNet)}, debit bersih ${fmtRp(mo.dbNet)}`);
      const show = () => {
        tip.innerHTML = '';
        tip.appendChild(el('div', { class: 'tl', style: { marginBottom: '4px' }, text: fmtMonth(mo.key) + (mo.days < mo.fullDays ? ` (${mo.days}/${mo.fullDays} hari)` : '') }));
        series.forEach((s) => tip.appendChild(el('div', {}, el('span', { class: 'tk', style: { background: s.color } }), el('span', { class: 'tv', text: fmtRp(mo[s.key]) }), ' ', el('span', { class: 'tl', text: s.name }))));
        tip.appendChild(el('div', { class: 'tl', style: { marginTop: '4px' }, text: 'Rata-rata saldo harian: ' + fmtRp(mo.adb) }));
        tip.style.display = 'block';
        const left = (cx / W) * wrap.clientWidth;
        tip.style.left = Math.min(Math.max(0, left - 90), wrap.clientWidth - 200) + 'px';
        tip.style.top = '30px';
      };
      hit.addEventListener('pointermove', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
      hit.addEventListener('blur', () => { tip.style.display = 'none'; });
      g.appendChild(hit);
    });
    root.appendChild(svg);
    root.appendChild(tip);
    wrap.appendChild(root);
  }

  /* ---------------------------- Ekspor & integrasi ---------------------------- */
  function summaryText() {
    const s = scopeSummary();
    if (!s || !s.totals) return '';
    const t = s.totals;
    const nama = $('#rk-nama').value.trim();
    const first = s.months[0], last = s.months[s.months.length - 1];
    const lines = [
      'REKAP MUTASI REKENING' + (nama ? ' — ' + nama : ''),
      'Cakupan: ' + (S.scope === '__all' && S.accounts.length > 1 ? 'gabungan ' + S.accounts.length + ' rekening (' + S.accounts.map((a) => a.label).join(', ') + ')' : s.label),
      'Periode: ' + fmtMonth(first.key) + ' s/d ' + fmtMonth(last.key),
      'Rata-rata kredit bersih (omzet)/bulan: ' + fmtRp(t.avgCrNet),
      'Rata-rata debit bersih/bulan: ' + fmtRp(t.avgDbNet),
      'Rata-rata saldo harian: ' + fmtRp(t.adb),
      'Kredit contra dikeluarkan: ' + fmtRp(t.crContra) + ' (' + fmtPct(t.crGross ? t.crContra / t.crGross : 0) + ')',
      'Kredit bukan omzet (bunga/pencairan/koreksi): ' + fmtRp(t.crNonOmzet),
      '',
      'Per bulan (kredit bersih | debit bersih | rata-rata saldo):',
      ...s.months.map((m) => `- ${fmtMonth(m.key)}${m.days < m.fullDays ? '*' : ''}: ${fmtRp(m.crNet)} | ${fmtRp(m.dbNet)} | ${fmtRp(m.adb)}`),
    ];
    return lines.join('\n');
  }

  function exportExcel() {
    if (!S.result) return;
    const nama = $('#rk-nama').value.trim();
    const monthRows = (s) => [
      ['Bulan', 'Hari data', 'Hari kalender', 'Saldo awal', 'Kredit (total)', 'Kredit contra', 'Kredit bukan omzet', 'Kredit bersih (omzet)', 'Frek. kredit bersih', 'Debit (total)', 'Debit contra', 'Debit bersih', 'Frek. debit bersih', 'Saldo akhir', 'Rata-rata saldo harian', 'Saldo min', 'Saldo maks'],
      ...s.months.map((m) => [fmtMonth(m.key), m.days, m.fullDays, m.saldoAwal, m.crGross, m.crContra, m.crNonOmzet, m.crNet, m.crNetCount, m.dbGross, m.dbContra, m.dbNet, m.dbNetCount, m.saldoAkhir, Math.round(m.adb * 100) / 100, m.minBal, m.maxBal]),
    ];
    const sheets = [];
    const main = S.accounts.length > 1 ? S.result.combined : S.result.per[0];
    const t = main.totals;
    sheets.push({ name: 'Ringkasan', cols: [44, 22], rows: [
      ['Rekap Mutasi Rekening Koran', nama],
      ['Dibuat', new Date().toLocaleString('id-ID')],
      ['Rekening', S.accounts.map((a) => a.label).join('; ')],
      [],
      ['Rata-rata kredit bersih (omzet) per bulan', Math.round(t.avgCrNet)],
      ['Rata-rata debit bersih per bulan', Math.round(t.avgDbNet)],
      ['Rata-rata saldo harian', Math.round(t.adb)],
      ['Omzet disetahunkan', Math.round(t.avgCrNet * 12)],
      ['Total kredit', t.crGross], ['Total kredit contra', t.crContra], ['Total kredit bukan omzet', t.crNonOmzet], ['Total kredit bersih', t.crNet],
      ['Total debit', t.dbGross], ['Total debit contra', t.dbContra], ['Total debit bersih', t.dbNet],
      ['Basis rata-rata bulanan', t.usedFullOnly ? `${t.monthsUsed} bulan penuh` : `${t.monthsUsed} bulan`],
    ] });
    sheets.push({ name: S.accounts.length > 1 ? 'Rekap Bulanan (Gabungan)' : 'Rekap Bulanan', rows: monthRows(main), cols: [12, 10, 12, 16, 16, 16, 16, 18, 10, 16, 16, 16, 10, 16, 18, 16, 16] });
    if (S.accounts.length > 1) S.result.per.forEach((p, i) => sheets.push({ name: ('Bulanan ' + (i + 1) + ' ' + p.label).slice(0, 31), rows: monthRows(p) }));
    const txRows = [['Tanggal', 'Rekening', 'Keterangan', 'Debit', 'Kredit', 'Saldo', 'Kategori', 'Contra', 'Alasan contra', 'Catatan / perlu cek', 'Diubah manual']];
    S.accounts.forEach((a) => a.txns.forEach((x) => txRows.push([fmtDate(x.date), a.label, x.desc, x.debit || 0, x.credit || 0, x.balance != null ? x.balance : x.runBal, P.effCat(x), P.effContra(x) ? 'YA' : '', x.contraReason || '', (x.flags || []).join('; '), (x.userContra != null || x.userCat) ? 'YA' : ''])));
    sheets.push({ name: 'Transaksi', rows: txRows, cols: [11, 18, 60, 16, 16, 18, 24, 8, 40, 50, 8] });
    const dates = Array.from(main.daily.keys()).sort();
    const dRows = [['Tanggal', ...S.result.per.map((p) => p.label), ...(S.accounts.length > 1 ? ['Total'] : [])]];
    dates.forEach((d) => dRows.push([fmtDate(d), ...S.result.per.map((p) => (p.daily.has(d) ? p.daily.get(d) : '')), ...(S.accounts.length > 1 ? [main.daily.get(d)] : [])]));
    sheets.push({ name: 'Saldo Harian', rows: dRows, cols: [12, 18, 18, 18] });
    exportXlsx('Rekap Rekening Koran - ' + App.safeFileName(nama || S.accounts[0].label) + '.xlsx', sheets);
  }

  function sendToNak() {
    const s = scopeSummary();
    if (!s || !s.totals) return;
    const t = s.totals;
    App.modules.docgen.receive({
      rk_rata_omzet: Math.round(t.avgCrNet),
      rk_rata_debit: Math.round(t.avgDbNet),
      rk_rata_saldo: Math.round(t.adb),
      rk_periode: fmtMonth(s.months[0].key) + ' s/d ' + fmtMonth(s.months[s.months.length - 1].key),
      rk_rekening: S.accounts.map((a) => a.label).join(', '),
    }, 'data rekening koran');
  }

  /* ---------------------------- Contoh data fiktif ---------------------------- */
  function sampleLines() {
    // Dua rekening fiktif milik "CV CONTOH SEJAHTERA" — termasuk transfer antar rekening sendiri (contra).
    const out1 = [], out2 = [];
    let bal1 = 85000000, bal2 = 12000000;
    const f = (n) => fmt(n, 2).replace(/\./g, '#').replace(/,/g, '.').replace(/#/g, ','); // format 1,234.00
    const y = new Date().getFullYear() - (new Date().getMonth() < 3 ? 1 : 0);
    out1.push({ text: 'BANK CONTOH — REKENING KORAN' }, { text: 'NO. REKENING : 7001234567' }, { text: 'NAMA : CV CONTOH SEJAHTERA' }, { text: `PERIODE : 01/01/${y} - 31/03/${y}` },
      { text: 'TANGGAL KETERANGAN MUTASI SALDO' }, { text: `01/01 SALDO AWAL ${f(bal1)}` });
    out2.push({ text: 'BANK LAIN — MUTASI REKENING' }, { text: 'NO. REKENING : 9998887776' }, { text: `PERIODE : 01/01/${y} - 31/03/${y}` },
      { text: 'Tanggal Keterangan Debit Kredit Saldo' }, { text: `01/01/${y} Saldo Awal ${f(bal2)}` });
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let mo = 1; mo <= 3; mo++) {
      for (let d = 2; d <= 28; d += 2) {
        const dd = String(d).padStart(2, '0') + '/' + String(mo).padStart(2, '0');
        const cr = Math.round((15 + rnd() * 35) * 1e5) * 10;
        bal1 += cr; out1.push({ text: `${dd} TRSF E-BANKING CR PEMBAYARAN INV-${mo}${d} TOKO PELANGGAN ${String.fromCharCode(65 + (d % 6))} ${f(cr)} ${f(bal1)}` });
        if (d % 4 === 0) { const db = Math.round((20 + rnd() * 40) * 1e5) * 10; bal1 -= db; out1.push({ text: `${dd} TRSF E-BANKING DB PEMBELIAN BAHAN BAKU SUPPLIER ${f(db)} DB ${f(bal1)}` }); }
      }
      const tf = 25000000;
      const dd = '15/' + String(mo).padStart(2, '0');
      bal1 -= tf; out1.push({ text: `${dd} PINDAH BUKU KE 9998887776 CV CONTOH SEJAHTERA ${f(tf)} DB ${f(bal1)}` });
      bal2 += tf; out2.push({ text: `16/${String(mo).padStart(2, '0')}/${y} TRANSFER MASUK DARI 7001234567 0 ${f(tf)} ${f(bal2)}` });
      const gaji = 18000000; bal2 -= gaji; out2.push({ text: `25/${String(mo).padStart(2, '0')}/${y} TRANSFER GAJI KARYAWAN ${f(gaji)} 0 ${f(bal2)}` });
      const bunga = 21500 + mo * 300; bal1 += bunga; out1.push({ text: `${daysEnd(y, mo)}/${String(mo).padStart(2, '0')} BUNGA ${f(bunga)} ${f(bal1)}` });
      const pajak = Math.round(bunga * 0.2); bal1 -= pajak; out1.push({ text: `${daysEnd(y, mo)}/${String(mo).padStart(2, '0')} PAJAK BUNGA ${f(pajak)} DB ${f(bal1)}` });
      const adm = 15000; bal1 -= adm; out1.push({ text: `${daysEnd(y, mo)}/${String(mo).padStart(2, '0')} BIAYA ADM ${f(adm)} DB ${f(bal1)}` });
    }
    out1.push({ text: `SALDO AKHIR ${f(bal1)}` });
    return [out1, out2];
  }
  function daysEnd(y, m) { return String(App.daysInMonth(y, m)); }

  /* ---------------------------- Init ---------------------------- */
  function init() {
    setupDrop($('#rk-drop'), $('#rk-file'), handleFiles);
    const saved = store.get('rk.form', {});
    if (saved.own) $('#rk-own').value = saved.own;
    if (saved.window != null) $('#rk-window').value = saved.window;
    const saveForm = () => store.set('rk.form', { own: $('#rk-own').value, window: $('#rk-window').value });
    ['#rk-own', '#rk-window', '#rk-nama', '#rk-pair-same'].forEach((s) => $(s).addEventListener('change', () => { saveForm(); if (S.accounts.length) recompute(); }));
    $('#rk-year').addEventListener('change', () => toast('Tahun baru berlaku untuk file yang diunggah berikutnya.'));
    $('#rk-scope').addEventListener('change', (e) => { S.scope = e.target.value; renderResults(); });
    $('#rk-filter').addEventListener('change', (e) => { S.filter = e.target.value; renderTxns(); });
    let st = null;
    $('#rk-search').addEventListener('input', (e) => { clearTimeout(st); st = setTimeout(() => { S.search = e.target.value; renderTxns(); }, 200); });
    $('#rk-export').addEventListener('click', exportExcel);
    $('#rk-copy').addEventListener('click', () => copyText(summaryText()));
    $('#rk-to-nak').addEventListener('click', sendToNak);
    $('#rk-clear').addEventListener('click', () => { S.accounts = []; recompute(); });
    $('#rk-sample').addEventListener('click', () => {
      const [a, b] = sampleLines();
      if (!$('#rk-nama').value) $('#rk-nama').value = 'CV Contoh Sejahtera';
      addAccount('contoh-rekening-1.pdf', P.parseLines(a, {}), 'contoh');
      addAccount('contoh-rekening-2.pdf', P.parseLines(b, {}), 'contoh');
      recompute();
      toast('Contoh data fiktif dimuat');
    });
    window.addEventListener('resize', () => { if (S.result && !$('#page-rk').classList.contains('hidden')) renderChart($('#rk-chart'), (scopeSummary() || {}).months || []); });
  }

  App.modules.statement = { init, S, parseCSV, onShow: () => { if (S.result) renderChart($('#rk-chart'), (scopeSummary() || {}).months || []); } };
})();
