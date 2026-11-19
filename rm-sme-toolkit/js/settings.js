/* Pengaturan, backup/restore, dan uji isolasi jaringan */
'use strict';
(function () {
  const { $, el, toast, store, fmt, parseMoney, confirmBox, readFileAs, linesOf } = App;

  function renderParams() {
    const p = App.params();
    $('#st-dscr').value = p.dscr;
    $('#st-porsi').value = p.porsi;
    $('#st-round').value = fmt(p.round);
    $('#st-bunga').value = p.bunga;
    const wrap = $('#st-ltv');
    wrap.innerHTML = '';
    p.ltv.forEach((l, i) => {
      wrap.appendChild(el('div', { class: 'row', style: { flexWrap: 'nowrap' } },
        el('input', { value: l.jenis, 'data-i': i, 'data-k': 'jenis', style: { flex: 3 } }),
        el('input', { type: 'number', value: l.ltv, 'data-i': i, 'data-k': 'ltv', style: { flex: 1, minWidth: '70px' } }), '%'));
    });
    wrap.appendChild(el('button', { class: 'btn ghost sm', onclick: () => { const q = App.params(); q.ltv.push({ jenis: 'Jenis agunan baru', ltv: 50 }); store.set('params', q); renderParams(); } }, '+ Jenis agunan'));
    App.bindMoneyInputs($('#page-settings'));
  }
  function saveParams() {
    const ltv = [];
    $('#st-ltv').querySelectorAll('input[data-k="jenis"]').forEach((inp) => {
      const i = inp.dataset.i;
      const v = $('#st-ltv').querySelector(`input[data-k="ltv"][data-i="${i}"]`).value;
      if (inp.value.trim()) ltv.push({ jenis: inp.value.trim(), ltv: parseFloat(v) || 0 });
    });
    store.set('params', { dscr: parseFloat($('#st-dscr').value) || 1.25, porsi: parseFloat($('#st-porsi').value) || 70, round: parseMoney($('#st-round').value) || 1, bunga: parseFloat($('#st-bunga').value) || 0, ltv });
    toast('Parameter disimpan');
    App.modules.calculator.applyParams();
    App.modules.analysis.render();
  }
  function renderRules() {
    const RD = App.ratios;
    const wrap = $('#st-rules');
    wrap.innerHTML = '';
    const tb = el('table', { class: 't' });
    tb.appendChild(el('thead', {}, el('tr', {}, el('th', { text: 'Rasio' }), el('th', { text: 'Syarat' }), el('th', { text: 'Nilai acuan' }))));
    const body = el('tbody');
    RD.ALL_RULE_DEFS.forEach((d) => {
      if (d.rule && d.rule.fromParams) {
        body.appendChild(el('tr', {}, el('td', { text: d.label }), el('td', { text: '≥' }), el('td', { class: 'small muted', text: 'ikut "DSCR minimum"' })));
        return;
      }
      const r = RD.rule(d.key);
      const op = el('select', { class: 'in-cell', 'data-key': d.key, 'data-k': 'op', style: { width: '70px' } }, ['>=', '>', '<=', '<'].map((o) => el('option', { value: o, text: { '>=': '≥', '>': '>', '<=': '≤', '<': '<' }[o] })));
      op.value = r.op;
      const shown = d.type === 'pct' ? Math.round(r.val * 10000) / 100 : r.val;
      const v = el('input', { class: 'in-cell num', type: 'number', step: 'any', value: shown, 'data-key': d.key, 'data-k': 'val', 'data-type': d.type, style: { width: '90px' } });
      body.appendChild(el('tr', {}, el('td', { text: d.label }), el('td', {}, op), el('td', { class: 'nowrap' }, v, ' ', { pct: '%', x: 'x', money: 'Rp', days: 'hari' }[d.type] || '')));
    });
    tb.appendChild(body);
    wrap.appendChild(el('div', { class: 'table-wrap', style: { maxHeight: '360px' } }, tb));
  }
  function saveRules() {
    const out = {};
    $('#st-rules').querySelectorAll('select[data-k="op"]').forEach((sel) => {
      const key = sel.dataset.key;
      const inp = $('#st-rules').querySelector(`input[data-key="${key}"]`);
      let val = parseFloat(inp.value);
      if (isNaN(val)) return;
      if (inp.dataset.type === 'pct') val /= 100;
      out[key] = { op: sel.value, val };
    });
    store.set('ratioRules', out);
    toast('Acuan rasio disimpan');
    App.modules.analysis.render();
  }
  function renderKw() {
    const k = App.keywords();
    $('#st-kw-contra').value = k.contra.join('\n');
    $('#st-kw-bunga').value = k.bunga.join('\n');
    $('#st-kw-cair').value = k.cair.join('\n');
    $('#st-kw-koreksi').value = k.koreksi.join('\n');
  }
  function saveKw() {
    store.set('keywords', { contra: linesOf($('#st-kw-contra').value), bunga: linesOf($('#st-kw-bunga').value), cair: linesOf($('#st-kw-cair').value), koreksi: linesOf($('#st-kw-koreksi').value) });
    toast('Kata kunci disimpan — unggah ulang/klik ulang rekening koran untuk menerapkan');
  }
  function usage() {
    let bytes = 0;
    store.keys().forEach((k) => { bytes += (localStorage.getItem('rmsme.' + k) || '').length * 2; });
    $('#st-usage').textContent = `Penyimpanan terpakai ± ${fmt(bytes / 1024, 0)} KB (batas browser ± 5.000 KB).`;
  }

  async function netTest() {
    const out = $('#st-nettest-result');
    out.innerHTML = '';
    const results = [];
    const probe = async (label, fn) => {
      try { await fn(); results.push([label, false, 'permintaan TIDAK diblokir']); } catch (e) { results.push([label, true, 'diblokir ✓']); }
    };
    await probe('fetch() ke https://example.com', () => fetch('https://example.com/', { mode: 'no-cors', cache: 'no-store' }));
    await probe('XMLHttpRequest ke https://example.com', () => new Promise((res, rej) => { const x = new XMLHttpRequest(); x.onload = res; x.onerror = rej; try { x.open('GET', 'https://example.com/'); x.send(); } catch (e) { rej(e); } }));
    await probe('WebSocket ke wss://example.com', () => new Promise((res, rej) => { try { const w = new WebSocket('wss://example.com/'); w.onopen = res; w.onerror = rej; } catch (e) { rej(e); } }));
    const okAll = results.every((r) => r[1]);
    out.appendChild(el('div', { class: 'alert ' + (okAll ? 'ok' : 'bad') }, okAll ? '✓ Semua jalur koneksi keluar diblokir. Data tidak dapat terkirim dari aplikasi ini.' : '✗ Ada jalur yang tidak terblokir — jangan gunakan untuk data nasabah dan hubungi pembuat aplikasi.'));
    out.appendChild(el('ul', { class: 'small' }, results.map((r) => el('li', { text: `${r[0]}: ${r[2]}` }))));
    return okAll;
  }

  function init() {
    renderParams();
    renderKw();
    renderRules();
    usage();
    $('#st-save-rules').addEventListener('click', saveRules);
    $('#st-reset-rules').addEventListener('click', () => { store.remove('ratioRules'); renderRules(); App.modules.analysis.render(); toast('Acuan bawaan dipulihkan'); });
    $('#st-save-params').addEventListener('click', saveParams);
    $('#st-reset-params').addEventListener('click', () => { store.remove('params'); renderParams(); App.modules.calculator.applyParams(); toast('Parameter bawaan dipulihkan'); });
    $('#st-save-kw').addEventListener('click', saveKw);
    $('#st-reset-kw').addEventListener('click', () => { store.remove('keywords'); renderKw(); toast('Kata kunci bawaan dipulihkan'); });
    $('#st-backup').addEventListener('click', () => {
      const dump = { app: 'rm-sme-toolkit', version: 1, created: new Date().toISOString(), data: {} };
      store.keys().forEach((k) => { dump.data[k] = store.get(k); });
      App.downloadBlob(new Blob([JSON.stringify(dump, null, 1)], { type: 'application/json' }), 'Backup RM SME Toolkit ' + App.todayISO() + '.json');
    });
    $('#st-restore').addEventListener('click', () => $('#st-restore-file').click());
    $('#st-restore-file').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const dump = JSON.parse(await readFileAs(f, 'text'));
        if (dump.app !== 'rm-sme-toolkit' || !dump.data) throw new Error('bukan file backup aplikasi ini');
        if (!(await confirmBox('Pulihkan backup? Data saat ini akan diganti isi backup.', 'Pulihkan'))) return;
        Object.entries(dump.data).forEach(([k, v]) => store.set(k, v));
        toast('Backup dipulihkan');
        setTimeout(() => location.reload(), 600);
      } catch (err) { toast('Gagal memulihkan: ' + err.message, 5000); }
    });
    $('#st-wipe').addEventListener('click', async () => {
      if (!(await confirmBox('Hapus SEMUA data aplikasi di browser ini (pengingat, profil debitur, templat sendiri, pengaturan)? Tindakan ini tidak bisa dibatalkan. Sebaiknya ekspor backup dulu.', 'Hapus semua'))) return;
      store.keys().forEach((k) => store.remove(k));
      toast('Semua data dihapus');
      setTimeout(() => location.reload(), 600);
    });
    $('#st-nettest').addEventListener('click', netTest);
  }

  App.modules.settings = { init, netTest, usage };
})();
