/* Modul 4 — Kalkulator Kelayakan & Simulasi Angsuran */
'use strict';
(function () {
  const { $, el, store, fmt, fmtRp, fmtX, parseMoney, copyText, exportXlsx } = App;

  let agunan = [];
  const IDS = ['kc-jenis', 'kc-bunga', 'kc-tenor', 'kc-diajukan', 'kc-laba', 'kc-susut', 'kc-existing', 'kc-dscr', 'kc-omzet', 'kc-margin', 'kc-tc', 'kc-porsi', 'kc-kmk-existing'];

  function annuity(P, r, n) { return r > 0 ? P * r / (1 - Math.pow(1 + r, -n)) : P / n; }
  function pvAnnuity(A, r, n) { return r > 0 ? A * (1 - Math.pow(1 + r, -n)) / r : A * n; }
  const num = (id) => parseFloat(String($('#' + id).value).replace(',', '.')) || 0;
  const money = (id) => parseMoney($('#' + id).value);

  function inputs() {
    const p = App.params();
    return {
      jenis: $('#kc-jenis').value, bunga: num('kc-bunga'), tenor: Math.max(1, Math.round(num('kc-tenor')) || 1), diajukan: money('kc-diajukan'),
      laba: money('kc-laba'), susut: money('kc-susut'), existing: money('kc-existing'), dscr: num('kc-dscr') || p.dscr,
      omzet: money('kc-omzet'), margin: num('kc-margin'), tc: num('kc-tc'), porsi: num('kc-porsi') || p.porsi, kmkExisting: money('kc-kmk-existing'),
      round: p.round || 1, agunan: agunan.map((a) => ({ ...a, nilai: parseMoney(a.nilai), ltv: parseFloat(String(a.ltv).replace(',', '.')) || 0 })),
    };
  }

  function calc(x) {
    const r = x.bunga / 100 / 12;
    const cfads = x.laba + x.susut;
    const maxTotal = x.dscr > 0 ? cfads / x.dscr : 0;
    const maxNew = Math.max(0, maxTotal - x.existing);
    const limits = [];
    let plafonDSCR;
    if (x.jenis === 'kmk') plafonDSCR = r > 0 ? maxNew / r : Infinity;
    else plafonDSCR = pvAnnuity(maxNew, r, x.tenor);
    if (cfads > 0) limits.push({ key: 'dscr', label: 'Kemampuan bayar (DSCR ≥ ' + fmt(x.dscr, 2) + ')', value: plafonDSCR, note: `Angsuran baru maks. ${fmtRp(maxNew)}/bln` });
    const nilaiPasar = x.agunan.reduce((s, a) => s + a.nilai, 0);
    const nilaiLTV = x.agunan.reduce((s, a) => s + a.nilai * a.ltv / 100, 0);
    if (nilaiPasar > 0) limits.push({ key: 'agunan', label: 'Agunan (nilai × LTV)', value: nilaiLTV, note: `Nilai taksiran ${fmtRp(nilaiPasar)}` });
    let kebutuhanMK = null;
    if (x.jenis === 'kmk' && x.omzet > 0) {
      const hppTahun = x.omzet * 12 * (1 - x.margin / 100);
      kebutuhanMK = hppTahun * x.tc / 365;
      limits.push({ key: 'mk', label: 'Kebutuhan modal kerja × porsi bank ' + fmt(x.porsi, 0) + '%', value: Math.max(0, kebutuhanMK * x.porsi / 100 - x.kmkExisting), note: `Kebutuhan MK ${fmtRp(kebutuhanMK)}` });
    }
    const finite = limits.filter((l) => isFinite(l.value));
    let result = finite.length ? Math.min(...finite.map((l) => l.value)) : 0;
    result = Math.max(0, Math.floor(result / x.round) * x.round);
    const binding = finite.length ? finite.reduce((a, b) => (b.value < a.value ? b : a)) : null;
    // Uji plafon yang diajukan
    let test = null;
    if (x.diajukan > 0) {
      const angs = x.jenis === 'kmk' ? x.diajukan * r : annuity(x.diajukan, r, x.tenor);
      const dscrRes = (x.existing + angs) > 0 ? cfads / (x.existing + angs) : null;
      test = {
        angs, dscr: dscrRes, dscrOk: dscrRes != null && dscrRes >= x.dscr,
        coverage: nilaiLTV > 0 ? nilaiLTV / x.diajukan : null, coverageOk: nilaiLTV >= x.diajukan,
        ltv: nilaiPasar > 0 ? x.diajukan / nilaiPasar : null,
        mkOk: kebutuhanMK == null ? null : x.diajukan <= kebutuhanMK * x.porsi / 100 - x.kmkExisting,
      };
    }
    return { r, cfads, maxTotal, maxNew, limits, result, binding, nilaiPasar, nilaiLTV, kebutuhanMK, test };
  }

  function render() {
    const x = inputs();
    const c = calc(x);
    $('#kc-omzet-card').style.opacity = x.jenis === 'kmk' ? '1' : '.55';
    $('#kc-result').textContent = fmtRp(c.result);
    $('#kc-binding').textContent = c.binding ? 'Pembatas: ' + c.binding.label : 'Isi laba bersih dan/atau nilai agunan untuk melihat hasil.';
    const ul = $('#kc-breakdown');
    ul.innerHTML = '';
    c.limits.forEach((l) => ul.appendChild(el('li', {},
      el('span', {}, el('span', { text: (c.binding && l.key === c.binding.key ? '▶ ' : '') + l.label }), el('br'), el('span', { class: 'small muted', text: l.note })),
      el('strong', { class: 'num', text: isFinite(l.value) ? fmtRp(l.value) : 'tidak membatasi' }))));
    if (x.jenis === 'kmk' && c.limits.some((l) => l.key === 'dscr')) ul.appendChild(el('li', { class: 'small muted', text: 'KMK revolving: DSCR dihitung terhadap bunga bulanan saja; pokok dibayar dari perputaran usaha di akhir periode.' }));
    const tw = $('#kc-test');
    tw.innerHTML = '';
    if (c.test) {
      const t = c.test;
      const row = (label, val, ok) => el('li', {}, el('span', { text: label }), el('span', {}, el('strong', { class: 'num', text: val + ' ' }),
        ok == null ? null : el('span', { class: 'pill ' + (ok ? 'ok' : 'bad'), text: ok ? '✓ memenuhi' : '✗ tidak memenuhi' })));
      tw.append(el('h4', { text: 'Uji plafon diajukan ' + fmtRp(x.diajukan) }), el('ul', { class: 'check-list' },
        row(x.jenis === 'kmk' ? 'Bunga per bulan' : 'Angsuran per bulan', fmtRp(t.angs), null),
        row('DSCR', t.dscr != null ? fmtX(t.dscr) : '-', t.dscr != null ? t.dscrOk : null),
        t.coverage != null ? row('Coverage agunan (nilai × LTV ÷ plafon)', fmt(t.coverage * 100, 1) + '%', t.coverageOk) : null,
        t.ltv != null ? row('Plafon ÷ nilai taksiran agunan', fmt(t.ltv * 100, 1) + '%', null) : null,
        t.mkOk != null ? row('Dalam batas kebutuhan modal kerja', t.mkOk ? 'ya' : 'tidak', t.mkOk) : null));
    }
    if (!$('#kc-schedule').classList.contains('hidden')) renderSchedule();
    save();
    return { x, c };
  }

  function schedule(P, x) {
    const r = x.bunga / 100 / 12;
    const rows = [];
    let sisa = P;
    if (x.jenis === 'kmk') {
      for (let i = 1; i <= x.tenor; i++) {
        const bunga = sisa * r;
        const pokok = i === x.tenor ? sisa : 0;
        rows.push([i, bunga + pokok, bunga, pokok, sisa - pokok]);
        sisa -= pokok;
      }
    } else {
      const A = annuity(P, r, x.tenor);
      for (let i = 1; i <= x.tenor; i++) {
        const bunga = sisa * r;
        const pokok = i === x.tenor ? sisa : A - bunga;
        sisa -= pokok;
        rows.push([i, bunga + pokok, bunga, pokok, Math.max(0, sisa)]);
      }
    }
    return rows;
  }
  function renderSchedule() {
    const x = inputs();
    const c = calc(x);
    const P = x.diajukan || c.result;
    const box = $('#kc-schedule');
    box.innerHTML = '';
    box.appendChild(el('h3', { text: `Tabel angsuran — plafon ${fmtRp(P)}, ${x.tenor} bulan, ${fmt(x.bunga, 2)}% p.a. (${x.jenis === 'kmk' ? 'bunga bulanan, pokok di akhir' : 'anuitas'})` }));
    if (!P) { box.appendChild(el('p', { class: 'muted', text: 'Isi plafon diajukan atau lengkapi data agar ada plafon indikatif.' })); return; }
    const rows = schedule(P, x);
    const tb = el('table', { class: 't' });
    tb.appendChild(el('thead', {}, el('tr', {}, ['Bulan ke', 'Angsuran', 'Bunga', 'Pokok', 'Sisa pokok'].map((h, i) => el('th', { class: i ? 'num' : '', text: h })))));
    tb.appendChild(el('tbody', {}, rows.map((r) => el('tr', {}, r.map((v, i) => el('td', { class: i ? 'num' : '', text: i ? fmt(v) : String(v) }))))));
    const tot = rows.reduce((a, r) => [a[0] + r[1], a[1] + r[2], a[2] + r[3]], [0, 0, 0]);
    tb.appendChild(el('tfoot', {}, el('tr', {}, el('td', { text: 'Total' }), tot.map((v) => el('td', { class: 'num', text: fmt(v) })), el('td', {}))));
    box.appendChild(el('div', { class: 'table-wrap' }, tb));
  }

  function summaryText() {
    const { x, c } = render();
    const lines = [
      'SIMULASI KELAYAKAN (INDIKATIF)',
      `Jenis: ${x.jenis === 'kmk' ? 'KMK revolving' : 'Angsuran tetap (anuitas)'} · bunga ${fmt(x.bunga, 2)}% p.a. · tenor ${x.tenor} bln`,
      `Laba bersih/bln: ${fmtRp(x.laba)} · penyusutan/bln: ${fmtRp(x.susut)} · angsuran existing/bln: ${fmtRp(x.existing)}`,
      ...c.limits.map((l) => `- ${l.label}: ${isFinite(l.value) ? fmtRp(l.value) : 'tidak membatasi'} (${l.note})`),
      `PLAFON INDIKATIF: ${fmtRp(c.result)}${c.binding ? ' — pembatas: ' + c.binding.label : ''}`,
    ];
    if (c.test) lines.push(`Uji plafon ${fmtRp(x.diajukan)}: angsuran ${fmtRp(c.test.angs)}/bln, DSCR ${c.test.dscr != null ? fmtX(c.test.dscr) : '-'}${c.test.coverage != null ? ', coverage agunan ' + fmt(c.test.coverage * 100, 1) + '%' : ''}`);
    lines.push('Catatan: indikasi awal, bukan keputusan kredit.');
    return lines.join('\n');
  }

  function exportExcel() {
    const { x, c } = render();
    const P = x.diajukan || c.result;
    exportXlsx('Simulasi Kelayakan ' + App.todayISO() + '.xlsx', [
      { name: 'Ringkasan', cols: [48, 22], rows: [
        ['Simulasi kelayakan kredit (indikatif)'], [],
        ['Jenis kredit', x.jenis === 'kmk' ? 'KMK revolving (bunga bulanan, pokok di akhir)' : 'Angsuran tetap (anuitas)'],
        ['Suku bunga (% p.a.)', x.bunga], ['Tenor (bulan)', x.tenor], ['Laba bersih per bulan', x.laba], ['Penyusutan per bulan', x.susut],
        ['Angsuran existing per bulan', x.existing], ['DSCR minimum', x.dscr], ['Omzet per bulan', x.omzet], ['Margin laba kotor (%)', x.margin],
        ['Trade cycle (hari)', x.tc], ['Porsi pembiayaan bank (%)', x.porsi], [],
        ['Agunan', 'Nilai taksiran', 'LTV %', 'Nilai × LTV'], ...x.agunan.map((a) => [a.jenis, a.nilai, a.ltv, a.nilai * a.ltv / 100]), [],
        ...c.limits.map((l) => [l.label, isFinite(l.value) ? Math.round(l.value) : 'tidak membatasi']),
        ['PLAFON INDIKATIF', c.result], ['Pembatas', c.binding ? c.binding.label : '-'],
        ...(c.test ? [[], ['Plafon diajukan', x.diajukan], ['Angsuran/bunga per bulan', Math.round(c.test.angs)], ['DSCR hasil', c.test.dscr != null ? Math.round(c.test.dscr * 100) / 100 : '-']] : []),
      ] },
      { name: 'Tabel Angsuran', cols: [10, 18, 18, 18, 18], rows: [['Bulan ke', 'Angsuran', 'Bunga', 'Pokok', 'Sisa pokok'], ...(P ? schedule(P, x).map((r) => r.map((v, i) => (i ? Math.round(v) : v))) : [])] },
    ]);
  }

  function renderAgunan() {
    const p = App.params();
    const wrap = $('#kc-agunan');
    wrap.innerHTML = '';
    if (!agunan.length) wrap.appendChild(el('p', { class: 'small muted', text: 'Belum ada agunan. Klik "+ Agunan".' }));
    agunan.forEach((a, i) => {
      const sel = el('select', {}, p.ltv.map((l) => el('option', { value: l.jenis, text: l.jenis })));
      sel.value = a.jenis;
      const nilai = el('input', { 'data-money': '', inputmode: 'numeric', value: a.nilai ? fmt(parseMoney(a.nilai)) : '', placeholder: 'Nilai taksiran (Rp)' });
      const ltv = el('input', { type: 'number', step: '1', value: a.ltv, style: { width: '80px' } });
      sel.addEventListener('change', () => { a.jenis = sel.value; const d = p.ltv.find((l) => l.jenis === sel.value); if (d) { a.ltv = d.ltv; ltv.value = d.ltv; } render(); });
      nilai.addEventListener('input', () => { a.nilai = nilai.value; render(); });
      ltv.addEventListener('input', () => { a.ltv = ltv.value; render(); });
      wrap.appendChild(el('div', { class: 'row', style: { marginBottom: '8px', flexWrap: 'nowrap' } },
        el('div', { style: { flex: 2 } }, sel), el('div', { style: { flex: 2 } }, nilai),
        el('label', { class: 'f', style: { flexDirection: 'row', alignItems: 'center', gap: '4px' } }, 'LTV', ltv, '%'),
        el('button', { class: 'btn ghost sm', onclick: () => { agunan.splice(i, 1); renderAgunan(); render(); } }, '✕')));
    });
    App.bindMoneyInputs(wrap);
  }

  function save() {
    const f = {};
    IDS.forEach((id) => { f[id] = $('#' + id).value; });
    store.set('kc.form', { f, agunan });
  }
  function applyParams() {
    const p = App.params();
    const saved = store.get('kc.form', null);
    if (!saved || !saved.f || !saved.f['kc-dscr']) $('#kc-dscr').value = p.dscr;
    if (!saved || !saved.f || !saved.f['kc-porsi']) $('#kc-porsi').value = p.porsi;
    renderAgunan();
    render();
  }

  function init() {
    const p = App.params();
    const saved = store.get('kc.form', null);
    if (saved) {
      IDS.forEach((id) => { if (saved.f && saved.f[id] != null && saved.f[id] !== '') $('#' + id).value = saved.f[id]; });
      agunan = saved.agunan || [];
    } else {
      $('#kc-bunga').value = p.bunga;
      agunan = [{ jenis: p.ltv[0].jenis, nilai: '', ltv: p.ltv[0].ltv }];
    }
    if (!$('#kc-dscr').value) $('#kc-dscr').value = p.dscr;
    if (!$('#kc-porsi').value) $('#kc-porsi').value = p.porsi;
    App.bindMoneyInputs($('#page-calc'));
    IDS.forEach((id) => $('#' + id).addEventListener('input', render));
    $('#kc-add-agunan').addEventListener('click', () => { const q = App.params(); agunan.push({ jenis: q.ltv[0].jenis, nilai: '', ltv: q.ltv[0].ltv }); renderAgunan(); });
    $('#kc-copy').addEventListener('click', () => copyText(summaryText()));
    $('#kc-export').addEventListener('click', exportExcel);
    $('#kc-schedule-btn').addEventListener('click', () => { const b = $('#kc-schedule'); b.classList.toggle('hidden'); if (!b.classList.contains('hidden')) { renderSchedule(); b.scrollIntoView({ behavior: 'smooth' }); } });
    renderAgunan();
    render();
  }

  App.modules.calculator = { init, calc, annuity, pvAnnuity, applyParams };
})();
