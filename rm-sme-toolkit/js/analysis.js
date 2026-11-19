/* Modul 6 — Analisa Keuangan & Rasio Kredit (memakai data debitur yang sama dengan Generator NAK) */
'use strict';
(function () {
  const { $, el, toast, fmt, fmtRp, parseMoney, readFileAs, setupDrop, setProgress, exportXlsx, copyText, safeFileName } = App;
  const R = () => App.ratios;
  const D = () => App.modules.docgen.getData();
  const save = () => App.modules.docgen.save();

  function keu() {
    const d = D();
    d.keu = d.keu || { periode: ['', '', ''], bulan: [12, 12, 12] };
    d.keu.periode = d.keu.periode || ['', '', ''];
    d.keu.bulan = d.keu.bulan || [12, 12, 12];
    return d.keu;
  }

  /* ---------------------------- Tabel input keuangan ---------------------------- */
  function renderInput() {
    const k = keu();
    const wrap = $('#an-input');
    wrap.innerHTML = '';
    const tb = el('table', { class: 't' });
    const head = el('tr', {}, el('th', { text: 'Pos (Rp)' }));
    for (let i = 0; i < 3; i++) {
      const p = el('input', { class: 'in-cell', value: k.periode[i] || '', placeholder: ['mis. 2024', 'mis. 2025', 'mis. Jun 2026'][i] });
      p.addEventListener('change', () => { k.periode[i] = p.value; save(); renderEval(); });
      const b = el('input', { class: 'in-cell', type: 'number', min: 1, max: 12, value: k.bulan[i] || 12, style: { width: '60px' }, title: 'Jumlah bulan dalam periode' });
      b.addEventListener('change', () => { k.bulan[i] = +b.value || 12; save(); renderEval(); });
      head.appendChild(el('th', { style: { minWidth: '170px' } }, p, el('div', { class: 'row', style: { gap: '4px', marginTop: '4px', fontWeight: 400 } }, b, el('span', { class: 'small', text: 'bulan' }))));
    }
    tb.appendChild(el('thead', {}, head));
    const body = el('tbody');
    let section = '';
    R().FIN_ITEMS.forEach(([key, label, sec]) => {
      if (sec !== section) { section = sec; body.appendChild(el('tr', {}, el('td', { colspan: 4, style: { background: '#f6f8f9', fontWeight: 600, color: 'var(--text-2)' }, text: sec }))); }
      k[key] = k[key] || ['', '', ''];
      const tr = el('tr', {}, el('td', { text: label }));
      for (let i = 0; i < 3; i++) {
        const v = k[key][i];
        const inp = el('input', { class: 'in-cell num', 'data-money': '', inputmode: 'numeric', value: v !== '' && v != null ? fmt(parseMoney(v)) : '' });
        inp.addEventListener('change', () => { k[key][i] = inp.value.trim() ? parseMoney(inp.value) : ''; save(); renderEval(); });
        tr.appendChild(el('td', {}, inp));
      }
      body.appendChild(tr);
    });
    tb.appendChild(body);
    wrap.appendChild(el('div', { class: 'table-wrap', style: { maxHeight: 'none' } }, tb));
    App.bindMoneyInputs(wrap);
  }

  /* ---------------------------- Input fasilitas (proforma) ---------------------------- */
  const PF_FIELDS = [
    ['jenis_fasilitas', 'Jenis fasilitas', 'text'], ['plafon', 'Plafon diusulkan (Rp)', 'money'],
    ['pola_angsuran', 'Pola pembayaran', 'select:Anuitas (angsuran tetap)|Bunga saja (revolving)'], ['tenor_bulan', 'Tenor (bulan)', 'num'],
    ['suku_bunga', 'Suku bunga (% p.a.)', 'num'], ['nilai_agunan', 'Nilai agunan (Rp)', 'money'],
    ['os_lama', 'Outstanding fasilitas lama yang digantikan (Rp)', 'money'], ['kewajiban_lama', 'Kewajiban/tahun fasilitas lama yang digantikan (Rp)', 'money'],
    ['rk_rata_omzet', 'Rata-rata kredit bersih rek. koran/bulan (Rp)', 'money'], ['rk_rata_saldo', 'Rata-rata saldo harian rek. koran (Rp)', 'money'],
  ];
  function renderPfInputs() {
    const d = D();
    const wrap = $('#an-pf-input');
    wrap.innerHTML = '';
    const grid = el('div', { class: 'grid g3' });
    PF_FIELDS.forEach(([key, label, type]) => {
      let node;
      const v = d[key] == null ? '' : d[key];
      if (type.startsWith('select:')) { node = el('select', {}, el('option', { value: '', text: '— otomatis dari jenis fasilitas —' }), type.slice(7).split('|').map((o) => el('option', { value: o, text: o }))); node.value = v; } else if (type === 'money') node = el('input', { 'data-money': '', inputmode: 'numeric', value: v !== '' ? fmt(parseMoney(v)) : '' });
      else if (type === 'num') node = el('input', { type: 'number', step: 'any', value: v });
      else node = el('input', { value: v, placeholder: key === 'jenis_fasilitas' ? 'mis. KMK Revolving / KI' : '' });
      node.addEventListener('change', () => { d[key] = type === 'money' ? (node.value.trim() ? parseMoney(node.value) : '') : node.value; save(); renderEval(); });
      grid.appendChild(el('label', { class: 'f' }, label, node));
    });
    wrap.append(grid, el('p', { class: 'small muted', style: { marginTop: '8px' }, text: 'Untuk perpanjangan/take over, isi outstanding dan kewajiban fasilitas lama yang akan digantikan agar tidak terhitung dua kali. Kolom rekening koran terisi otomatis dari modul 1 (tombol "Kirim ke Generator NAK").' }));
    App.bindMoneyInputs(wrap);
  }

  /* ---------------------------- Penilaian ---------------------------- */
  function pill(status) {
    const s = R().STATUS[status];
    return el('span', { class: 'pill ' + s.cls, text: s.icon + ' ' + s.text });
  }
  function renderEval() {
    const d = D();
    const ev = R().evaluate(d);
    const k = keu();
    $('#an-summary').innerHTML = '';
    $('#an-summary').append(
      el('div', { class: 'grid g4' },
        tile('Memenuhi acuan', String(ev.ok), 'rasio', 'ok'),
        tile('Di bawah acuan', String(ev.fail), 'rasio — lihat daftar', ev.fail ? 'bad' : 'ok'),
        tile('Data kurang', String(ev.na), 'belum dapat dihitung', 'neutral'),
        tile('Periode dinilai', ev.latest >= 0 ? (k.periode[ev.latest] || 'Kolom ' + (ev.latest + 1)) : '-', 'kolom terbaru yang terisi', 'info')),
      el('div', { class: 'alert ' + (ev.latest < 0 ? 'info' : ev.fail ? 'warn' : 'ok'), style: { marginTop: '12px' }, text: ev.summary }));
    const cons = R().consistency(k);
    if (cons.length) $('#an-summary').appendChild(el('div', { class: 'alert bad' }, el('strong', { text: '⚠ Cek konsistensi angka: ' }), cons.join(' · ')));

    const tb = el('table', { class: 't' });
    tb.appendChild(el('thead', {}, el('tr', {}, el('th', { text: 'Rasio' }), [0, 1, 2].map((i) => el('th', { class: 'num', text: k.periode[i] || 'Kolom ' + (i + 1) })),
      el('th', { text: 'Acuan' }), el('th', { text: 'Status (terbaru)' }), el('th', { text: 'Tren' }))));
    const body = el('tbody');
    let group = '';
    ev.rows.forEach((r) => {
      if (r.def.group !== group) { group = r.def.group; body.appendChild(el('tr', {}, el('td', { colspan: 7, style: { background: '#f6f8f9', fontWeight: 600, color: 'var(--text-2)' }, text: group }))); }
      body.appendChild(el('tr', {},
        el('td', {}, el('div', { text: r.def.label }), el('div', { class: 'small muted', text: r.def.formula })),
        r.values.map((v, i) => el('td', { class: 'num', style: i === ev.latest ? { fontWeight: 700 } : null, text: R().fmtVal(v, r.def.type) })),
        el('td', { class: 'nowrap', text: R().ruleText(r.rule, r.def.type) || '—' }),
        el('td', {}, r.status === 'info' ? el('span', { class: 'small muted', text: 'informasi' }) : pill(r.status)),
        el('td', { class: 'small nowrap', text: r.trend })));
    });
    tb.appendChild(body);
    $('#an-ratios').innerHTML = '';
    $('#an-ratios').appendChild(el('div', { class: 'table-wrap', style: { maxHeight: 'none' } }, tb));

    const tp = el('table', { class: 't' });
    tp.appendChild(el('thead', {}, el('tr', {}, ['Rasio', 'Nilai', 'Acuan', 'Status', 'Rumus'].map((h, i) => el('th', { class: i === 1 ? 'num' : '', text: h })))));
    tp.appendChild(el('tbody', {}, ev.pfRows.map((r) => el('tr', {},
      el('td', { text: r.def.label }), el('td', { class: 'num', style: { fontWeight: 700 }, text: r.def.type === 'money' && r.value != null ? fmtRp(r.value) : R().fmtVal(r.value, r.def.type) }),
      el('td', { class: 'nowrap', text: R().ruleText(r.rule, r.def.type) || '—' }),
      el('td', {}, r.status === 'info' ? el('span', { class: 'small muted', text: 'informasi' }) : pill(r.status)),
      el('td', { class: 'small muted', text: r.def.formula })))));
    $('#an-pf').innerHTML = '';
    $('#an-pf').appendChild(el('div', { class: 'table-wrap', style: { maxHeight: 'none' } }, tp));
    $('#an-debitur').textContent = d.nama_perusahaan ? 'Debitur: ' + d.nama_perusahaan : 'Debitur belum diberi nama (isi di tab 3)';
  }
  function tile(lbl, val, sub, cls) {
    return el('div', { class: 'stat' }, el('div', { class: 'lbl' }, el('span', { class: 'pill ' + cls, text: lbl })), el('div', { class: 'val', text: val }), el('div', { class: 'sub', text: sub }));
  }

  /* ---------------------------- Baca laporan keuangan ---------------------------- */
  function directFromTemplate(aoa) {
    const keys = new Set(R().FIN_ITEMS.map((f) => f[0]));
    const out = { items: {}, periode: null, bulan: null };
    aoa.forEach((r) => {
      const k = String(r[0] || '').trim();
      if (k === 'periode') out.periode = [r[2], r[3], r[4]].map((x) => String(x == null ? '' : x));
      else if (k === 'bulan') out.bulan = [r[2], r[3], r[4]].map((x) => +x || 12);
      else if (keys.has(k)) out.items[k] = [r[2], r[3], r[4]].map((x) => (x === '' || x == null ? '' : parseMoney(x)));
    });
    return Object.keys(out.items).length >= 3 ? out : null;
  }

  function merge(results) {
    const best = results.slice().sort((a, b) => b.periods.length - a.periods.length)[0];
    const items = {};
    results.forEach((r) => Object.entries(r.items).forEach(([k, v]) => {
      if (r.periods.length !== best.periods.length) return;
      if (!items[k] || v.prio < items[k].prio) items[k] = v;
    }));
    return { ...best, items, unit: results.find((r) => r.unit !== 1) ? results.find((r) => r.unit !== 1).unit : 1 };
  }

  async function handleFiles(files) {
    const prog = $('#an-progress');
    const results = [];
    for (let fi = 0; fi < files.length; fi++) {
      const f = files[fi];
      const tag = `(${fi + 1}/${files.length}) ${f.name}`;
      try {
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        if (['xlsx', 'xls', 'csv'].includes(ext)) {
          const wb = ext === 'csv' ? XLSX.read(await readFileAs(f, 'text'), { type: 'string', raw: true }) : XLSX.read(await readFileAs(f, 'array'), { type: 'array', cellDates: true });
          for (const name of wb.SheetNames) {
            const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
            const direct = directFromTemplate(aoa);
            if (direct) { applyDirect(direct); setProgress(prog, null); return; }
            const text = aoa.map((r) => r.join(' ')).join('\n');
            const res = App.finReader.extract(App.finReader.rowsFromSheet(aoa), text);
            if (Object.keys(res.items).length) results.push(res);
          }
        } else if (ext === 'pdf') {
          const { pages, pdf } = await App.text.pdfToLines(await readFileAs(f, 'array'), (p, t) => setProgress(prog, p * 0.4, tag + ' — ' + t));
          let lines = [];
          for (let i = 0; i < pages.length; i++) {
            if (pages[i].charCount >= 40) { lines = lines.concat(pages[i].lines); continue; }
            setProgress(prog, 0.4 + (i / pages.length) * 0.6, `${tag} — OCR halaman ${i + 1}/${pages.length}`);
            const r = await App.text.ocrImage(await App.text.renderPdfPage(pdf, i + 1, 2.5), (m) => setProgress(prog, 0.4 + ((i + (m.progress || 0)) / pages.length) * 0.6, `${tag} — OCR halaman ${i + 1}/${pages.length} (${Math.round((m.progress || 0) * 100)}%)`));
            lines = lines.concat(r.lines);
          }
          results.push(App.finReader.extract(App.finReader.rowsFromLines(lines), lines.map((l) => l.text).join('\n')));
        } else {
          const r = await App.text.ocrImage(f, (m) => setProgress(prog, m.progress || 0, `${tag} — OCR ${Math.round((m.progress || 0) * 100)}%`));
          results.push(App.finReader.extract(App.finReader.rowsFromLines(r.lines), r.text));
        }
      } catch (e) {
        console.error(e);
        toast('Gagal membaca ' + f.name + ': ' + (e.message || e), 5000);
      }
    }
    setProgress(prog, null);
    const ok = results.filter((r) => Object.keys(r.items).length);
    if (!ok.length) { toast('Tidak ada pos laporan keuangan yang dikenali. Isi manual atau gunakan templat Excel.', 5000); return; }
    await review(merge(ok));
  }

  function applyDirect(direct) {
    const k = keu();
    if (direct.periode) k.periode = direct.periode;
    if (direct.bulan) k.bulan = direct.bulan;
    Object.entries(direct.items).forEach(([key, v]) => { k[key] = v; });
    save();
    render();
    toast('Templat Excel keuangan diimpor');
  }

  async function review(res) {
    const RD = R();
    const state = { unit: res.unit, newestFirst: res.newestFirst, clear: true, use: {} };
    Object.keys(res.items).forEach((k) => { state.use[k] = true; });
    const bulan = res.periods.map((p) => p.bulan || 12);
    const body = el('div');
    const draw = () => {
      body.innerHTML = '';
      const order = res.periods.map((p, i) => i);
      const ordered = state.newestFirst ? order.slice().reverse() : order; // terlama → terbaru
      const used = ordered.slice(-3);
      const unitSel = el('select', { style: { width: 'auto' } }, [[1, 'Rupiah penuh'], [1e3, 'Ribuan rupiah'], [1e6, 'Jutaan rupiah']].map(([v, t]) => el('option', { value: String(v), text: t })));
      unitSel.value = String(state.unit);
      unitSel.addEventListener('change', () => { state.unit = +unitSel.value; draw(); });
      const ordSel = el('select', { style: { width: 'auto' } }, el('option', { value: '1', text: 'Kolom kiri = periode terbaru' }), el('option', { value: '0', text: 'Kolom kiri = periode terlama' }));
      ordSel.value = state.newestFirst ? '1' : '0';
      ordSel.addEventListener('change', () => { state.newestFirst = ordSel.value === '1'; draw(); });
      const clr = el('input', { type: 'checkbox' });
      clr.checked = state.clear;
      clr.addEventListener('change', () => { state.clear = clr.checked; });
      body.append(
        el('p', { class: 'text-2', text: `Ditemukan ${Object.keys(res.items).length} pos dari ${res.rowsCount} baris berangka, ${res.periods.length} periode. Periksa lalu terapkan. Pos yang tidak ditemukan bisa diisi manual.` }),
        el('div', { class: 'row', style: { marginBottom: '10px' } }, el('label', { class: 'f', style: { flexDirection: 'row', alignItems: 'center', gap: '6px' } }, 'Satuan angka:', unitSel), ordSel,
          el('label', { class: 'check' }, clr, 'Kosongkan kolom lain')));
      const tb = el('table', { class: 't' });
      tb.appendChild(el('thead', {}, el('tr', {}, el('th', { text: '' }), el('th', { text: 'Pos' }), el('th', { text: 'Akun di laporan' }),
        res.periods.map((p, i) => {
          const b = el('input', { type: 'number', min: 1, max: 12, value: bulan[i], class: 'in-cell', style: { width: '56px' }, title: 'jumlah bulan' });
          b.addEventListener('change', () => { bulan[i] = +b.value || 12; });
          return el('th', { class: 'num' }, el('div', { text: p.label + (used.includes(i) ? ' → kolom ' + (3 - used.length + used.indexOf(i) + 1) : ' (tidak dipakai)') }), el('div', { class: 'row', style: { gap: '4px', justifyContent: 'flex-end', fontWeight: 400 } }, b, el('span', { class: 'small', text: 'bln' })));
        }))));
      const tbody = el('tbody');
      RD.FIN_ITEMS.forEach(([key, label]) => {
        const it = res.items[key];
        const cb = el('input', { type: 'checkbox', disabled: !it });
        cb.checked = !!(it && state.use[key]);
        cb.addEventListener('change', () => { state.use[key] = cb.checked; });
        tbody.appendChild(el('tr', { style: it ? null : { color: 'var(--muted)' } }, el('td', {}, cb), el('td', { text: label }), el('td', { class: 'small', text: it ? it.label : '— tidak ditemukan —' }),
          res.periods.map((p, i) => el('td', { class: 'num', text: it && it.values[i] != null ? fmt(it.values[i] * state.unit) : '' }))));
      });
      tb.appendChild(tbody);
      // cek konsistensi atas angka kandidat
      const tmp = { periode: ['', '', ''], bulan: [12, 12, 12] };
      used.forEach((pi, j) => {
        const col = 3 - used.length + j;
        tmp.periode[col] = res.periods[pi].label;
        Object.entries(res.items).forEach(([key, it]) => { if (state.use[key] && !key.startsWith('_')) { tmp[key] = tmp[key] || ['', '', '']; if (it.values[pi] != null) tmp[key][col] = it.values[pi] * state.unit; } });
      });
      const cons = RD.consistency(tmp);
      if (cons.length) body.appendChild(el('div', { class: 'alert bad' }, el('strong', { text: '⚠ Periksa angka berikut (kemungkinan salah baca): ' }), cons.join(' · ')));
      body.appendChild(el('div', { class: 'table-wrap', style: { maxHeight: '420px' } }, tb));
      state.used = used;
    };
    draw();
    const ok = await App.modal('Hasil baca laporan keuangan', body, [{ label: 'Batal', value: false, cls: 'secondary' }, { label: 'Terapkan ke tabel', value: true }]);
    if (!ok) return;
    const k = keu();
    const used = state.used;
    const offset = 3 - used.length;
    if (state.clear) {
      RD.FIN_ITEMS.forEach(([key]) => { if (key !== 'kewajiban_bank_tahunan') k[key] = ['', '', '']; });
      k.periode = ['', '', ''];
      k.bulan = [12, 12, 12];
    }
    used.forEach((pi, j) => {
      const col = offset + j;
      k.periode[col] = res.periods[pi].label;
      k.bulan[col] = bulan[pi] || 12;
      Object.entries(res.items).forEach(([key, it]) => {
        if (!state.use[key] || key.startsWith('_')) return;
        k[key] = k[key] || ['', '', ''];
        if (it.values[pi] != null) k[key][col] = Math.round(it.values[pi] * state.unit);
      });
    });
    save();
    render();
    toast('Laporan keuangan diterapkan — cek kembali angkanya');
  }

  /* ---------------------------- Ekspor ---------------------------- */
  function exportAll() {
    const d = D();
    const k = keu();
    const ev = R().evaluate(d);
    const RD = R();
    const per = [0, 1, 2].map((i) => k.periode[i] || 'Kolom ' + (i + 1));
    exportXlsx('Analisa Rasio Kredit - ' + safeFileName(d.nama_perusahaan || 'debitur') + '.xlsx', [
      { name: 'Ringkasan', cols: [40, 90], rows: [['Analisa rasio kredit', d.nama_perusahaan || ''], ['Dibuat', new Date().toLocaleString('id-ID')], [],
        ['Kesimpulan', ev.summary], ['Rasio memenuhi acuan', ev.ok], ['Rasio di bawah acuan', ev.fail], ['Data kurang', ev.na],
        [], ['Catatan', 'Acuan adalah nilai yang diatur di menu Pengaturan; sesuaikan dengan ketentuan kredit yang berlaku.']] },
      { name: 'Laporan Keuangan', cols: [44, 18, 18, 18], rows: [['Pos (Rp)', ...per], ['Jumlah bulan', ...k.bulan], ...RD.FIN_ITEMS.map(([key, label]) => [label, ...[0, 1, 2].map((i) => { const v = (k[key] || [])[i]; return v === '' || v == null ? '' : parseMoney(v); })])] },
      { name: 'Rasio', cols: [28, 36, 14, 14, 14, 12, 16, 22, 50], rows: [['Kelompok', 'Rasio', ...per, 'Acuan', 'Status', 'Tren', 'Rumus'],
        ...ev.rows.map((r) => [r.def.group, r.def.label, ...r.values.map((v) => RD.fmtVal(v, r.def.type)), RD.ruleText(r.rule, r.def.type), r.status === 'info' ? '' : RD.STATUS[r.status].text, r.trend, r.def.formula])] },
      { name: 'Proforma', cols: [44, 18, 12, 16, 70], rows: [['Rasio', 'Nilai', 'Acuan', 'Status', 'Rumus'], ...ev.pfRows.map((r) => [r.def.label, RD.fmtVal(r.value, r.def.type), RD.ruleText(r.rule, r.def.type), r.status === 'info' ? '' : RD.STATUS[r.status].text, r.def.formula]),
        [], ['Plafon', parseMoney(d.plafon)], ['Tenor (bulan)', d.tenor_bulan || ''], ['Suku bunga (% p.a.)', d.suku_bunga || ''], ['Nilai agunan', parseMoney(d.nilai_agunan)]] },
    ]);
  }
  function downloadTemplate() {
    const k = keu();
    const rows = [['Tag (jangan diubah)', 'Pos', 'Periode 1 (terlama)', 'Periode 2', 'Periode 3 (terbaru)'], ['periode', 'Label periode', ...k.periode], ['bulan', 'Jumlah bulan', ...k.bulan]];
    R().FIN_ITEMS.forEach(([key, label]) => rows.push([key, label, ...((k[key] || ['', '', '']).map((v) => (v === '' || v == null ? '' : parseMoney(v))))]));
    exportXlsx('Templat Laporan Keuangan.xlsx', [{ name: 'Keuangan', rows, cols: [24, 60, 20, 20, 20] }]);
  }

  function render() { renderInput(); renderPfInputs(); renderEval(); }

  function init() {
    setupDrop($('#an-drop'), $('#an-file'), handleFiles);
    $('#an-template').addEventListener('click', downloadTemplate);
    $('#an-export').addEventListener('click', exportAll);
    $('#an-copy').addEventListener('click', () => {
      const d = D(), ev = R().evaluate(d), RD = R();
      const li = ev.latest;
      const lines = ['PENILAIAN RASIO KREDIT' + (d.nama_perusahaan ? ' — ' + d.nama_perusahaan : ''), ev.summary, ''];
      ev.rows.filter((r) => li >= 0 && r.values[li] != null).forEach((r) => lines.push(`- ${r.def.label}: ${RD.fmtVal(r.values[li], r.def.type)}${r.rule && r.rule.val != null ? ' (acuan ' + RD.ruleText(r.rule, r.def.type) + ') ' + RD.STATUS[r.status].icon : ''}`));
      const pf = ev.pfRows.filter((r) => r.value != null);
      if (pf.length) { lines.push('', 'Proforma:'); pf.forEach((r) => lines.push(`- ${r.def.label}: ${RD.fmtVal(r.value, r.def.type)}${r.rule ? ' (acuan ' + RD.ruleText(r.rule, r.def.type) + ') ' + RD.STATUS[r.status].icon : ''}`)); }
      copyText(lines.join('\n'));
    });
    render();
  }

  App.modules.analysis = { init, render, onShow: render };
})();
