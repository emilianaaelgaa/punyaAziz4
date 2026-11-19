/* Modul 3 — Generator Draf NAK & Call Report (docxtemplater, offline) */
'use strict';
(function () {
  const { $, el, toast, store, fmt, fmtRp, fmtDateLong, todayISO, parseMoney, parseDate, readFileAs, b64ToBytes, bytesToB64, exportXlsx, confirmBox, safeFileName } = App;

  /* ---------------------------- Definisi field ---------------------------- */
  // [tag, label, tipe] — tipe: text | ta (textarea) | money | num | date | select:opsi1|opsi2
  const GROUPS = [
    { title: 'Identitas debitur', open: true, fields: [
      ['nama_perusahaan', 'Nama debitur / perusahaan'], ['bentuk_usaha', 'Bentuk usaha', 'select:PT|CV|UD|Firma|Koperasi|Perorangan'],
      ['bidang_usaha', 'Bidang usaha'], ['kbli', 'KBLI'], ['alamat_usaha', 'Alamat usaha', 'ta'], ['tahun_berdiri', 'Berdiri sejak (tahun)'],
      ['telepon', 'Telepon'], ['cif', 'CIF'], ['grup_usaha', 'Grup usaha / afiliasi'],
    ] },
    { title: 'Legalitas', fields: [
      ['npwp', 'NPWP'], ['nib', 'NIB'], ['no_akta_pendirian', 'No. akta pendirian'], ['tgl_akta_pendirian', 'Tanggal akta pendirian'],
      ['notaris_pendirian', 'Notaris akta pendirian'], ['sk_kemenkumham', 'SK Kemenkumham'], ['akta_perubahan_terakhir', 'Akta perubahan terakhir'],
      ['izin_lain', 'Izin lainnya (PBG/SLF, izin lingkungan, dll.)', 'ta'],
    ] },
    { title: 'Pengurus & pemegang saham', pengurus: true },
    { title: 'Fasilitas yang diusulkan', fields: [
      ['jenis_permohonan', 'Jenis permohonan', 'select:Baru|Perpanjangan|Tambahan|Perpanjangan & Tambahan|Restrukturisasi'],
      ['jenis_fasilitas', 'Jenis fasilitas (mis. KMK Revolving)'], ['plafon', 'Plafon (Rp)', 'money'], ['tenor_bulan', 'Jangka waktu (bulan)', 'num'],
      ['suku_bunga', 'Suku bunga (% p.a.)', 'num'], ['tujuan_penggunaan', 'Tujuan penggunaan', 'ta'], ['sumber_pembayaran', 'Sumber pembayaran', 'ta'],
      ['agunan', 'Agunan (jenis & bukti kepemilikan)', 'ta'], ['nilai_agunan', 'Nilai agunan (Rp)', 'money'], ['pengikatan_agunan', 'Pengikatan agunan'],
    ] },
    { title: 'Keuangan & rasio (dihitung otomatis)', keuangan: true },
    { title: 'Ringkasan rekening koran', fields: [
      ['rk_rekening', 'Rekening yang dianalisa'], ['rk_periode', 'Periode'], ['rk_rata_omzet', 'Rata-rata kredit bersih (omzet)/bulan', 'money'],
      ['rk_rata_debit', 'Rata-rata debit bersih/bulan', 'money'], ['rk_rata_saldo', 'Rata-rata saldo harian', 'money'],
    ] },
    { title: 'Call report (kunjungan)', fields: [
      ['tgl_kunjungan', 'Tanggal kunjungan', 'date'], ['lokasi_kunjungan', 'Lokasi'], ['pihak_ditemui', 'Pihak yang ditemui'],
      ['tujuan_kunjungan', 'Tujuan kunjungan'], ['hasil_kunjungan', 'Hasil kunjungan', 'ta'], ['kondisi_usaha', 'Kondisi usaha', 'ta'], ['tindak_lanjut', 'Tindak lanjut', 'ta'],
    ] },
    { title: 'Analisa (narasi NAK)', fields: [
      ['latar_belakang', 'Latar belakang permohonan', 'ta'], ['analisa_karakter', 'Character', 'ta'], ['analisa_kapasitas', 'Capacity', 'ta'],
      ['analisa_kapital', 'Capital', 'ta'], ['analisa_kondisi', 'Condition of economy', 'ta'], ['analisa_kolateral', 'Collateral', 'ta'],
      ['risiko_mitigasi', 'Risiko & mitigasi', 'ta'], ['rekomendasi', 'Kesimpulan & rekomendasi', 'ta'],
    ] },
    { title: 'Penyusun', fields: [
      ['nama_rm', 'Nama RM'], ['jabatan_rm', 'Jabatan'], ['unit_kerja', 'Unit / cabang'], ['tgl_dokumen', 'Tanggal dokumen', 'date'],
    ] },
  ];
  const FIN_ITEMS = [
    ['penjualan', 'Penjualan'], ['hpp', 'HPP'], ['biaya_operasional', 'Biaya operasional'], ['biaya_bunga', 'Biaya bunga'], ['penyusutan', 'Penyusutan'],
    ['laba_bersih', 'Laba bersih'], ['kas', 'Kas & setara kas'], ['piutang', 'Piutang usaha'], ['persediaan', 'Persediaan'], ['aset_lancar', 'Aset lancar'],
    ['aset_tetap', 'Aset tetap'], ['total_aset', 'Total aset'], ['utang_dagang', 'Utang dagang'], ['utang_lancar', 'Utang lancar'], ['utang_bank', 'Utang bank'],
    ['total_utang', 'Total utang'], ['ekuitas', 'Ekuitas'], ['kewajiban_bank_tahunan', 'Kewajiban bank/tahun (pokok+bunga)'],
  ];
  const RATIOS = [
    ['laba_kotor', 'Laba kotor', 'money'], ['growth', 'Pertumbuhan penjualan', 'pct'], ['gpm', 'Gross profit margin', 'pct'], ['npm', 'Net profit margin', 'pct'],
    ['current_ratio', 'Current ratio', 'x'], ['quick_ratio', 'Quick ratio', 'x'], ['der', 'DER (total utang/ekuitas)', 'x'], ['roa', 'ROA', 'pct'], ['roe', 'ROE', 'pct'],
    ['dso', 'Hari piutang (DSO)', 'days'], ['dio', 'Hari persediaan (DIO)', 'days'], ['dpo', 'Hari utang dagang (DPO)', 'days'], ['trade_cycle', 'Trade cycle (hari)', 'days'],
    ['ebitda', 'EBITDA (pendekatan)', 'money'], ['dscr', 'DSCR', 'x'],
  ];
  const ALL_FIELDS = GROUPS.flatMap((g) => g.fields || []);
  const MONEY = new Set(ALL_FIELDS.filter((f) => f[2] === 'money').map((f) => f[0]));
  const DATES = new Set(ALL_FIELDS.filter((f) => f[2] === 'date').map((f) => f[0]));

  let data = {};
  const blank = () => ({ pengurus: [], keu: { periode: ['', '', ''], bulan: [12, 12, 12] }, tgl_dokumen: todayISO() });

  /* ---------------------------- Perhitungan rasio ---------------------------- */
  function computeRatios(keu) {
    const out = [];
    for (let i = 0; i < 3; i++) {
      const g = (k) => parseMoney((keu[k] || [])[i]);
      const has = (k) => String((keu[k] || [])[i] == null ? '' : (keu[k] || [])[i]).trim() !== '';
      const div = (a, b) => (b ? a / b : null);
      const ann = 12 / (+keu.bulan[i] || 12);
      const r = {};
      if (has('penjualan')) {
        if (has('hpp')) r.laba_kotor = g('penjualan') - g('hpp');
        if (has('hpp')) r.gpm = div(g('penjualan') - g('hpp'), g('penjualan'));
        if (has('laba_bersih')) r.npm = div(g('laba_bersih'), g('penjualan'));
        if (i > 0 && parseMoney((keu.penjualan || [])[i - 1])) {
          const prev = parseMoney(keu.penjualan[i - 1]) * (12 / (+keu.bulan[i - 1] || 12));
          r.growth = (g('penjualan') * ann) / prev - 1;
        }
        if (has('piutang')) r.dso = div(g('piutang'), g('penjualan') * ann) * 365;
      }
      if (has('hpp')) {
        if (has('persediaan')) r.dio = div(g('persediaan'), g('hpp') * ann) * 365;
        if (has('utang_dagang')) r.dpo = div(g('utang_dagang'), g('hpp') * ann) * 365;
      }
      if (r.dso != null || r.dio != null) r.trade_cycle = (r.dso || 0) + (r.dio || 0) - (r.dpo || 0);
      if (has('aset_lancar') && g('utang_lancar')) { r.current_ratio = div(g('aset_lancar'), g('utang_lancar')); r.quick_ratio = div(g('aset_lancar') - g('persediaan'), g('utang_lancar')); }
      if (has('total_utang') && g('ekuitas')) r.der = div(g('total_utang'), g('ekuitas'));
      if (has('laba_bersih')) {
        if (g('total_aset')) r.roa = div(g('laba_bersih') * ann, g('total_aset'));
        if (g('ekuitas')) r.roe = div(g('laba_bersih') * ann, g('ekuitas'));
        r.ebitda = g('laba_bersih') + g('biaya_bunga') + g('penyusutan');
        if (g('kewajiban_bank_tahunan')) r.dscr = div(r.ebitda * ann, g('kewajiban_bank_tahunan'));
      }
      out.push(r);
    }
    return out;
  }
  function fmtRatio(v, type) {
    if (v == null || !isFinite(v)) return '-';
    switch (type) {
      case 'pct': return fmt(v * 100, 1) + '%';
      case 'x': return fmt(v, 2) + 'x';
      case 'days': return fmt(v, 0);
      default: return fmt(v, 0);
    }
  }

  function terbilang(n) {
    n = Math.floor(Math.abs(n));
    const s = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
    const t = (x) => {
      if (x < 12) return s[x];
      if (x < 20) return t(x - 10) + ' belas';
      if (x < 100) return t(Math.floor(x / 10)) + ' puluh' + (x % 10 ? ' ' + t(x % 10) : '');
      if (x < 200) return 'seratus' + (x - 100 ? ' ' + t(x - 100) : '');
      if (x < 1000) return t(Math.floor(x / 100)) + ' ratus' + (x % 100 ? ' ' + t(x % 100) : '');
      if (x < 2000) return 'seribu' + (x - 1000 ? ' ' + t(x - 1000) : '');
      if (x < 1e6) return t(Math.floor(x / 1000)) + ' ribu' + (x % 1000 ? ' ' + t(x % 1000) : '');
      if (x < 1e9) return t(Math.floor(x / 1e6)) + ' juta' + (x % 1e6 ? ' ' + t(x % 1e6) : '');
      if (x < 1e12) return t(Math.floor(x / 1e9)) + ' miliar' + (x % 1e9 ? ' ' + t(x % 1e9) : '');
      return t(Math.floor(x / 1e12)) + ' triliun' + (x % 1e12 ? ' ' + t(x % 1e12) : '');
    };
    if (n === 0) return 'Nol rupiah';
    const w = t(n).replace(/\s+/g, ' ').trim();
    return w.charAt(0).toUpperCase() + w.slice(1) + ' rupiah';
  }

  /** Data untuk templat Word: semua tag sudah diformat. */
  function templateData() {
    const d = {};
    ALL_FIELDS.forEach(([k]) => {
      const v = data[k];
      if (MONEY.has(k)) d[k] = v !== '' && v != null ? fmtRp(parseMoney(v)) : '';
      else if (DATES.has(k)) d[k] = v ? fmtDateLong(v) : '';
      else d[k] = v == null ? '' : String(v);
    });
    d.plafon_terbilang = data.plafon ? terbilang(parseMoney(data.plafon)) : '';
    const plafon = parseMoney(data.plafon), nilai = parseMoney(data.nilai_agunan);
    d.coverage_agunan = plafon && nilai ? fmt((nilai / plafon) * 100, 1) + '%' : '';
    d.pengurus = (data.pengurus || []).filter((p) => p.nama).map((p, i) => ({
      no: String(i + 1), nama: p.nama || '', jabatan: p.jabatan || '', nik: p.nik || '',
      saham: p.saham !== '' && p.saham != null ? fmt(parseFloat(String(p.saham).replace(',', '.')), 2).replace(/,00$/, '') + '%' : '-',
    }));
    const keu = data.keu || blank().keu;
    for (let i = 0; i < 3; i++) d['periode_' + (i + 1)] = keu.periode[i] || ('Periode ' + (i + 1));
    FIN_ITEMS.forEach(([k]) => { for (let i = 0; i < 3; i++) { const v = (keu[k] || [])[i]; d[k + '_' + (i + 1)] = v !== '' && v != null ? fmt(parseMoney(v)) : '-'; } });
    const rs = computeRatios(keu);
    RATIOS.forEach(([k, , type]) => { for (let i = 0; i < 3; i++) d[k + '_' + (i + 1)] = fmtRatio(rs[i][k], type); });
    d.tanggal_cetak = fmtDateLong(todayISO());
    return d;
  }

  /* ---------------------------- Form ---------------------------- */
  function input(tag, label, type) {
    let node;
    const val = data[tag] == null ? '' : data[tag];
    if (type === 'ta') { node = el('textarea', { rows: 3 }); node.value = val; } else if (type && type.startsWith('select:')) {
      node = el('select', {}, el('option', { value: '', text: '—' }), type.slice(7).split('|').map((o) => el('option', { value: o, text: o })));
      node.value = val;
    } else if (type === 'date') node = el('input', { type: 'date', value: val });
    else if (type === 'money') node = el('input', { 'data-money': '', inputmode: 'numeric', value: val !== '' ? fmt(parseMoney(val)) : '' });
    else if (type === 'num') node = el('input', { type: 'number', step: 'any', value: val });
    else node = el('input', { value: val });
    node.addEventListener('change', () => { data[tag] = type === 'money' ? (node.value.trim() ? parseMoney(node.value) : '') : node.value; persist(); });
    return el('label', { class: 'f', style: type === 'ta' ? { gridColumn: '1 / -1' } : null }, label, node);
  }

  function renderForm() {
    const wrap = $('#dg-form');
    const openState = Array.from(wrap.querySelectorAll('details')).map((d) => d.open);
    wrap.innerHTML = '';
    GROUPS.forEach((g, gi) => {
      const det = el('details', { class: 'card', style: { padding: '12px 16px' } });
      det.open = openState.length ? openState[gi] : !!g.open;
      det.appendChild(el('summary', { style: { cursor: 'pointer', fontWeight: 600, fontSize: '1.02rem' }, text: g.title }));
      const body = el('div', { style: { marginTop: '12px' } });
      if (g.fields) body.appendChild(el('div', { class: 'grid g3' }, g.fields.map(([k, l, t]) => input(k, l, t))));
      if (g.pengurus) body.appendChild(pengurusTable());
      if (g.keuangan) body.appendChild(keuanganTable());
      det.appendChild(body);
      wrap.appendChild(det);
    });
    App.bindMoneyInputs(wrap);
  }

  function pengurusTable() {
    const box = el('div');
    const tb = el('table', { class: 't' });
    tb.appendChild(el('thead', {}, el('tr', {}, ['Nama', 'Jabatan', 'NIK', 'Kepemilikan saham (%)', ''].map((h) => el('th', { text: h })))));
    const body = el('tbody');
    (data.pengurus || []).forEach((p, i) => {
      const cell = (k, attrs = {}) => {
        const inp = el('input', Object.assign({ class: 'in-cell', value: p[k] == null ? '' : p[k] }, attrs));
        inp.addEventListener('change', () => { p[k] = inp.value; persist(); });
        return el('td', {}, inp);
      };
      body.appendChild(el('tr', {}, cell('nama'), cell('jabatan', { list: 'dg-jabatan' }), cell('nik'), cell('saham', { inputmode: 'decimal' }),
        el('td', {}, el('button', { class: 'btn ghost sm', onclick: () => { data.pengurus.splice(i, 1); persist(); renderForm(); } }, 'Hapus'))));
    });
    tb.appendChild(body);
    const tot = (data.pengurus || []).reduce((s, p) => s + (parseFloat(String(p.saham || '').replace(',', '.')) || 0), 0);
    box.append(
      el('datalist', { id: 'dg-jabatan' }, ['Direktur Utama', 'Direktur', 'Komisaris Utama', 'Komisaris', 'Pemegang Saham', 'Persero Aktif', 'Persero Pasif', 'Pemilik'].map((j) => el('option', { value: j }))),
      el('div', { class: 'table-wrap' }, tb),
      el('div', { class: 'row', style: { marginTop: '8px' } },
        el('button', { class: 'btn secondary sm', onclick: () => { data.pengurus = data.pengurus || []; data.pengurus.push({ nama: '', jabatan: '', nik: '', saham: '' }); persist(); renderForm(); } }, '+ Tambah baris'),
        el('span', { class: 'small ' + (tot && Math.abs(tot - 100) > 0.01 ? '' : 'muted'), style: tot && Math.abs(tot - 100) > 0.01 ? { color: 'var(--warn)' } : null, text: tot ? `Total kepemilikan: ${fmt(tot, 2)}%` + (Math.abs(tot - 100) > 0.01 ? ' (≠ 100%)' : ' ✓') : '' })));
    return box;
  }

  function keuanganTable() {
    const keu = data.keu = data.keu || blank().keu;
    const box = el('div');
    box.appendChild(el('p', { class: 'small muted', text: 'Kolom 1 = periode terlama, kolom 3 = terbaru. Untuk periode tidak setahun penuh (mis. interim 6 bulan), isi jumlah bulan agar rasio disetahunkan.' }));
    const tb = el('table', { class: 't' });
    const head = el('tr', {}, el('th', { text: 'Pos (Rp)' }));
    for (let i = 0; i < 3; i++) {
      const p = el('input', { class: 'in-cell', value: keu.periode[i] || '', placeholder: ['mis. 2024', 'mis. 2025', 'mis. Jun 2026'][i] });
      p.addEventListener('change', () => { keu.periode[i] = p.value; persist(); });
      const b = el('input', { class: 'in-cell', type: 'number', min: 1, max: 12, value: keu.bulan[i] || 12, style: { width: '60px' }, title: 'Jumlah bulan' });
      b.addEventListener('change', () => { keu.bulan[i] = +b.value || 12; persist(); renderRatios(); });
      head.appendChild(el('th', {}, p, el('div', { class: 'row', style: { gap: '4px', marginTop: '4px', fontWeight: 400 } }, b, el('span', { class: 'small', text: 'bulan' }))));
    }
    tb.appendChild(el('thead', {}, head));
    const body = el('tbody');
    FIN_ITEMS.forEach(([k, l]) => {
      keu[k] = keu[k] || ['', '', ''];
      const tr = el('tr', {}, el('td', { class: 'nowrap', text: l }));
      for (let i = 0; i < 3; i++) {
        const inp = el('input', { class: 'in-cell num', 'data-money': '', inputmode: 'numeric', value: keu[k][i] !== '' && keu[k][i] != null ? fmt(parseMoney(keu[k][i])) : '' });
        inp.addEventListener('change', () => { keu[k][i] = inp.value.trim() ? parseMoney(inp.value) : ''; persist(); renderRatios(); });
        tr.appendChild(el('td', {}, inp));
      }
      body.appendChild(tr);
    });
    tb.appendChild(body);
    box.appendChild(el('div', { class: 'table-wrap', style: { maxHeight: 'none' } }, tb));
    box.appendChild(el('h4', { style: { marginTop: '14px' }, text: 'Rasio (otomatis)' }));
    box.appendChild(el('div', { class: 'table-wrap', id: 'dg-ratios', style: { maxHeight: 'none' } }));
    setTimeout(renderRatios, 0);
    return box;
  }
  function renderRatios() {
    const wrap = $('#dg-ratios');
    if (!wrap) return;
    const keu = data.keu;
    const rs = computeRatios(keu);
    const tb = el('table', { class: 't' });
    tb.appendChild(el('thead', {}, el('tr', {}, el('th', { text: 'Rasio' }), [0, 1, 2].map((i) => el('th', { class: 'num', text: keu.periode[i] || 'Periode ' + (i + 1) })))));
    tb.appendChild(el('tbody', {}, RATIOS.map(([k, l, t]) => el('tr', {}, el('td', { text: l }), [0, 1, 2].map((i) => el('td', { class: 'num', text: fmtRatio(rs[i][k], t) }))))));
    wrap.innerHTML = '';
    wrap.appendChild(tb);
  }

  /* ---------------------------- Simpan / profil ---------------------------- */
  function persist() { store.set('dg.current', data); }
  function profiles() { return store.get('dg.profiles', {}); }
  function renderProfiles(selected) {
    const sel = $('#dg-profiles');
    sel.innerHTML = '';
    sel.appendChild(el('option', { value: '', text: '— data saat ini (belum disimpan sebagai profil) —' }));
    Object.keys(profiles()).sort().forEach((n) => sel.appendChild(el('option', { value: n, text: n })));
    sel.value = selected || '';
  }

  /* ---------------------------- Templat ---------------------------- */
  function customTemplates() { return store.get('dg.templates', []); }
  function allTemplates() { return (window.BUILTIN_TEMPLATES || []).map((t) => ({ ...t, builtin: true })).concat(customTemplates()); }
  function renderTemplates(selected) {
    const sel = $('#dg-template');
    sel.innerHTML = '';
    allTemplates().forEach((t) => sel.appendChild(el('option', { value: t.id, text: t.name })));
    if (selected) sel.value = selected;
  }
  function currentTemplate() { return allTemplates().find((t) => t.id === $('#dg-template').value); }

  function generate() {
    const t = currentTemplate();
    if (!t) return;
    try {
      const zip = new PizZip(b64ToBytes(t.b64));
      const doc = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
      doc.render(templateData());
      const blob = doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const base = t.name.replace(/\s*\(bawaan\)\s*/, '').replace(/\.docx$/i, '');
      App.downloadBlob(blob, safeFileName(`${base} - ${data.nama_perusahaan || 'debitur'} - ${todayISO()}`) + '.docx');
      toast('Dokumen Word dibuat — cek folder Unduhan');
    } catch (e) {
      console.error(e);
      const errs = (e.properties && e.properties.errors) ? e.properties.errors.map((x) => (x.properties && x.properties.explanation) || x.message) : [e.message];
      App.modal('Templat bermasalah', el('div', {}, el('p', { text: 'Periksa penulisan tag di templat Word (kurung kurawal harus berpasangan, contoh {nama_perusahaan}):' }),
        el('ul', {}, errs.slice(0, 10).map((m) => el('li', { text: m })))), [{ label: 'Tutup', value: true }]);
    }
  }

  async function uploadTemplate(file) {
    const ab = await readFileAs(file, 'array');
    const bytes = new Uint8Array(ab);
    try {
      const doc = new window.docxtemplater(new PizZip(bytes), { paragraphLoop: true, linebreaks: true });
      void doc;
    } catch (e) {
      const errs = (e.properties && e.properties.errors) ? e.properties.errors.map((x) => (x.properties && x.properties.explanation) || x.message) : [e.message];
      App.modal('Templat tidak valid', el('ul', {}, errs.slice(0, 10).map((m) => el('li', { text: m }))), [{ label: 'Tutup', value: true }]);
      return;
    }
    const list = customTemplates();
    const t = { id: 'c_' + App.uid(), name: file.name.replace(/\.docx$/i, ''), b64: bytesToB64(bytes) };
    list.push(t);
    if (store.set('dg.templates', list)) { renderTemplates(t.id); toast('Templat "' + t.name + '" ditambahkan'); }
  }

  function tagList() {
    const wrap = $('#dg-tags');
    wrap.innerHTML = '';
    const sec = (title, tags) => el('div', { style: { marginBottom: '10px' } }, el('h4', { text: title }), el('div', { class: 'tag-list' }, tags.map((t) => el('code', { title: t[1], text: '{' + t[0] + '}' }))));
    wrap.append(
      el('p', { class: 'small text-2', text: 'Ketik tag ini di dokumen Word Anda (persis, termasuk kurung kurawal). Untuk tabel pengurus: di satu baris tabel, tulis {#pengurus} di sel pertama sebelum {nama}, dan {/pengurus} di sel terakhir setelah {saham}. Arahkan kursor ke tag untuk melihat artinya.' }),
      ...GROUPS.filter((g) => g.fields).map((g) => sec(g.title, g.fields.map(([k, l]) => [k, l]))),
      sec('Tambahan', [['plafon_terbilang', 'Plafon dalam huruf'], ['coverage_agunan', 'Nilai agunan / plafon'], ['tanggal_cetak', 'Tanggal hari ini']]),
      sec('Pengurus (di dalam {#pengurus}…{/pengurus})', [['no', 'Nomor urut'], ['nama', 'Nama'], ['jabatan', 'Jabatan'], ['nik', 'NIK'], ['saham', 'Kepemilikan %']]),
      sec('Keuangan — akhiran _1, _2, _3 = kolom periode', [['periode_1', 'Label periode']].concat(FIN_ITEMS.map(([k, l]) => [k + '_1', l]))),
      sec('Rasio — akhiran _1, _2, _3', RATIOS.map(([k, l]) => [k + '_1', l])));
  }

  /* ---------------------------- Excel ringkasan ---------------------------- */
  function downloadXlsxTemplate() {
    const rows = [['Tag (jangan diubah)', 'Keterangan', 'Nilai']];
    GROUPS.filter((g) => g.fields).forEach((g) => {
      rows.push(['', '— ' + g.title.toUpperCase() + ' —', '']);
      g.fields.forEach(([k, l, t]) => {
        let v = data[k] == null ? '' : data[k];
        if (t === 'date' && v) v = App.fmtDate(v);
        rows.push([k, l + (t === 'date' ? ' (dd/mm/yyyy)' : ''), v]);
      });
    });
    const keu = data.keu || blank().keu;
    const krows = [['Tag (jangan diubah)', 'Pos', 'Periode 1 (terlama)', 'Periode 2', 'Periode 3 (terbaru)'], ['periode', 'Label periode', ...keu.periode], ['bulan', 'Jumlah bulan', ...keu.bulan]];
    FIN_ITEMS.forEach(([k, l]) => krows.push([k, l, ...(keu[k] || ['', '', ''])]));
    const prow = [['Nama', 'Jabatan', 'NIK', 'Kepemilikan saham (%)'], ...(data.pengurus || []).map((p) => [p.nama, p.jabatan, p.nik, p.saham])];
    exportXlsx('Lembar Ringkasan Debitur' + (data.nama_perusahaan ? ' - ' + safeFileName(data.nama_perusahaan) : '') + '.xlsx', [
      { name: 'Data Debitur', rows, cols: [24, 44, 60] },
      { name: 'Keuangan', rows: krows, cols: [24, 34, 20, 20, 20] },
      { name: 'Pengurus', rows: prow, cols: [32, 22, 22, 22] },
    ]);
  }
  async function importXlsx(file) {
    const wb = XLSX.read(await readFileAs(file, 'array'), { type: 'array', cellDates: true });
    const sheet = (re) => wb.SheetNames.find((n) => re.test(n));
    const known = new Set(ALL_FIELDS.map((f) => f[0]));
    let n = 0;
    const sd = sheet(/data/i) || wb.SheetNames[0];
    XLSX.utils.sheet_to_json(wb.Sheets[sd], { header: 1, raw: true, defval: '' }).forEach((r) => {
      const k = String(r[0] || '').trim();
      if (!known.has(k)) return;
      let v = r[2];
      if (DATES.has(k)) v = parseDate(v) || '';
      else if (MONEY.has(k)) v = v === '' ? '' : parseMoney(v);
      else v = String(v == null ? '' : v);
      data[k] = v;
      n++;
    });
    const sk = sheet(/keuangan/i);
    if (sk) {
      const keu = data.keu = data.keu || blank().keu;
      XLSX.utils.sheet_to_json(wb.Sheets[sk], { header: 1, raw: true, defval: '' }).forEach((r) => {
        const k = String(r[0] || '').trim();
        if (k === 'periode') keu.periode = [r[2], r[3], r[4]].map((x) => String(x || ''));
        else if (k === 'bulan') keu.bulan = [r[2], r[3], r[4]].map((x) => +x || 12);
        else if (FIN_ITEMS.some((f) => f[0] === k)) keu[k] = [r[2], r[3], r[4]].map((x) => (x === '' ? '' : parseMoney(x)));
      });
    }
    const sp = sheet(/pengurus/i);
    if (sp) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sp], { header: 1, raw: true, defval: '' }).slice(1).filter((r) => String(r[0]).trim());
      if (rows.length) data.pengurus = rows.map((r) => ({ nama: String(r[0]).trim(), jabatan: String(r[1] || ''), nik: String(r[2] || ''), saham: r[3] === '' ? '' : String(r[3]) }));
    }
    persist();
    renderForm();
    toast(`${n} isian diimpor dari Excel`);
  }

  /** Terima data dari modul lain (rekening koran / legalitas). */
  function receive(obj, source) {
    Object.entries(obj).forEach(([k, v]) => {
      if (k === 'pengurus') {
        if (!v || !v.length) return;
        data.pengurus = data.pengurus || [];
        v.forEach((p) => {
          const ex = data.pengurus.find((x) => x.nama && x.nama.toUpperCase() === p.nama.toUpperCase());
          if (ex) { if (p.jabatan && !ex.jabatan) ex.jabatan = p.jabatan; if (p.saham !== '' && p.saham != null) ex.saham = p.saham; if (p.nik && !ex.nik) ex.nik = p.nik; } else data.pengurus.push({ nama: p.nama, jabatan: p.jabatan || '', nik: p.nik || '', saham: p.saham == null ? '' : p.saham });
        });
      } else if (v !== '' && v != null) data[k] = v;
    });
    persist();
    renderForm();
    toast(`${source} diterima di Generator NAK (tab 3)`, 3500);
  }

  function init() {
    data = Object.assign(blank(), store.get('dg.current', {}));
    renderProfiles();
    renderTemplates();
    renderForm();
    $('#dg-profiles').addEventListener('change', (e) => {
      const p = profiles()[e.target.value];
      if (p) { data = Object.assign(blank(), JSON.parse(JSON.stringify(p))); persist(); renderForm(); toast('Profil dimuat'); }
    });
    $('#dg-new').addEventListener('click', async () => {
      if (!(await confirmBox('Kosongkan formulir untuk debitur baru? (Data saat ini yang belum disimpan sebagai profil akan hilang.)', 'Kosongkan'))) return;
      data = blank(); persist(); renderProfiles(); renderForm();
    });
    $('#dg-save').addEventListener('click', async () => {
      const inp = el('input', { value: data.nama_perusahaan || $('#dg-profiles').value || '' });
      const r = await App.modal('Simpan profil debitur', el('label', { class: 'f' }, 'Nama profil', inp), [{ label: 'Batal', value: false, cls: 'secondary' }, { label: 'Simpan', value: true }]);
      if (!r || !inp.value.trim()) return;
      const all = profiles();
      all[inp.value.trim()] = data;
      if (store.set('dg.profiles', all)) { renderProfiles(inp.value.trim()); toast('Profil disimpan'); }
    });
    $('#dg-delete').addEventListener('click', async () => {
      const n = $('#dg-profiles').value;
      if (!n) { toast('Pilih profil yang akan dihapus'); return; }
      if (!(await confirmBox(`Hapus profil "${n}"?`, 'Hapus'))) return;
      const all = profiles(); delete all[n]; store.set('dg.profiles', all); renderProfiles();
    });
    $('#dg-xlsx-template').addEventListener('click', downloadXlsxTemplate);
    $('#dg-xlsx-import').addEventListener('click', () => $('#dg-xlsx-file').click());
    $('#dg-xlsx-file').addEventListener('change', async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) { try { await importXlsx(f); } catch (err) { toast('Gagal impor: ' + err.message, 5000); } } });
    $('#dg-generate').addEventListener('click', generate);
    $('#dg-download-template').addEventListener('click', () => {
      const t = currentTemplate();
      if (t) App.downloadBlob(new Blob([b64ToBytes(t.b64)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), (t.file || safeFileName(t.name) + '.docx'));
    });
    $('#dg-upload-template').addEventListener('change', async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) await uploadTemplate(f); });
    $('#dg-remove-template').addEventListener('click', async () => {
      const t = currentTemplate();
      if (!t || t.builtin) { toast('Templat bawaan tidak bisa dihapus'); return; }
      if (!(await confirmBox(`Hapus templat "${t.name}"?`, 'Hapus'))) return;
      store.set('dg.templates', customTemplates().filter((x) => x.id !== t.id));
      renderTemplates();
    });
    $('#dg-show-tags').addEventListener('click', () => { const w = $('#dg-tags'); if (w.classList.toggle('hidden')) return; tagList(); });
  }

  App.modules.docgen = { init, receive, terbilang, computeRatios, templateData, reload: () => { data = Object.assign(blank(), store.get('dg.current', {})); renderProfiles(); renderTemplates(); renderForm(); } };
})();
