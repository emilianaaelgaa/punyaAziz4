/* Modul 5 — Ekstraksi Data Dokumen Legalitas (PDF teks + OCR offline) */
'use strict';
(function () {
  const { $, el, toast, fmt, readFileAs, setupDrop, setProgress, uid, exportXlsx, copyText } = App;

  const S = { docs: [], result: { fields: [], pengurus: [], saham: [] } };

  async function handleFiles(files) {
    const prog = $('#lg-progress');
    const force = $('#lg-force-ocr').checked;
    for (let fi = 0; fi < files.length; fi++) {
      const f = files[fi];
      const tag = `(${fi + 1}/${files.length}) ${f.name}`;
      try {
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        if (ext === 'pdf') {
          const ab = await readFileAs(f, 'array');
          const { pages, pdf } = await App.text.pdfToLines(ab, (p, t) => setProgress(prog, p * 0.3, tag + ' — ' + t));
          const parts = [];
          let ocrPages = 0, conf = [];
          for (let i = 0; i < pages.length; i++) {
            if (!force && pages[i].charCount >= 30) { parts.push(pages[i].lines.map((l) => l.text).join('\n')); continue; }
            ocrPages++;
            setProgress(prog, 0.3 + (i / pages.length) * 0.7, `${tag} — OCR halaman ${i + 1}/${pages.length}…`);
            const canvas = await App.text.renderPdfPage(pdf, i + 1, 2.5);
            const r = await App.text.ocrImage(canvas, (m) => setProgress(prog, 0.3 + ((i + (m.progress || 0)) / pages.length) * 0.7, `${tag} — OCR halaman ${i + 1}/${pages.length} (${Math.round((m.progress || 0) * 100)}%)`));
            parts.push(r.text);
            conf.push(r.confidence);
          }
          S.docs.push({ id: uid(), name: f.name, text: parts.join('\n\n'), method: ocrPages ? `OCR ${ocrPages}/${pages.length} hlm` : 'PDF teks', confidence: conf.length ? conf.reduce((a, b) => a + b, 0) / conf.length : null });
        } else {
          setProgress(prog, 0.05, tag + ' — menyiapkan OCR…');
          const r = await App.text.ocrImage(f, (m) => setProgress(prog, (m.progress || 0), `${tag} — ${m.status === 'recognizing text' ? 'membaca teks' : 'memuat mesin OCR'} ${Math.round((m.progress || 0) * 100)}%`));
          S.docs.push({ id: uid(), name: f.name, text: r.text, method: 'OCR foto', confidence: r.confidence });
        }
      } catch (e) {
        console.error(e);
        toast('Gagal membaca ' + f.name + ': ' + (e.message || e), 5000);
      }
    }
    setProgress(prog, null);
    renderDocs();
    parseAll();
  }

  function renderDocs() {
    const wrap = $('#lg-docs');
    wrap.innerHTML = '';
    S.docs.forEach((d) => {
      const ta = el('textarea', { rows: 8, style: { fontFamily: 'Consolas, monospace', fontSize: '.8rem' } });
      ta.value = d.text;
      ta.addEventListener('change', () => { d.text = ta.value; });
      const det = el('details', { class: 'box' },
        el('summary', {}, d.name + ' ', el('span', { class: 'pill neutral', text: d.method }),
          d.confidence != null ? el('span', { class: 'pill ' + (d.confidence > 80 ? 'ok' : d.confidence > 60 ? 'warn' : 'bad'), style: { marginLeft: '6px' }, text: 'keyakinan OCR ' + Math.round(d.confidence) + '%' }) : null),
        el('p', { class: 'small muted', text: 'Teks hasil baca (boleh dikoreksi, lalu klik "Baca ulang teks"):' }), ta,
        el('div', { class: 'row end', style: { marginTop: '6px' } }, el('button', { class: 'btn danger sm', onclick: () => { S.docs = S.docs.filter((x) => x !== d); renderDocs(); parseAll(); } }, 'Hapus dokumen')));
      wrap.appendChild(det);
    });
  }

  function parseAll() {
    const res = { fields: [], pengurus: [], saham: [] };
    S.docs.forEach((d) => {
      const r = App.legal.extract(d.text);
      r.fields.forEach((f) => {
        if (f.key === 'jenis_dokumen') { res.fields.push({ ...f, label: 'Jenis dokumen — ' + d.name, source: d.name }); return; }
        const ex = res.fields.find((x) => x.key === f.key);
        if (ex && ex.value === f.value) { if (!ex.source.includes(d.name)) ex.source += ', ' + d.name; return; }
        if (ex && /^akta_/.test(f.key)) { res.fields.push({ ...f, key: f.key + '_' + d.id, source: d.name }); return; }
        if (ex) { res.fields.push({ ...f, label: f.label + ' (alternatif)', key: f.key + '_alt_' + d.id, source: d.name }); return; }
        res.fields.push({ ...f, source: d.name });
      });
      r.pengurus.forEach((p) => { if (!res.pengurus.some((x) => x.nama === p.nama)) res.pengurus.push({ ...p, source: d.name }); });
      r.saham.forEach((s) => { if (!res.saham.some((x) => x.nama === s.nama)) res.saham.push({ ...s, source: d.name }); });
    });
    S.result = res;
    renderResult();
  }

  function renderResult() {
    const wrap = $('#lg-result');
    wrap.innerHTML = '';
    const r = S.result;
    if (!S.docs.length) { wrap.appendChild(el('p', { class: 'muted', text: 'Belum ada dokumen.' })); return; }
    const edit = (obj, key, attrs = {}) => {
      const i = el('input', Object.assign({ class: 'in-cell', value: obj[key] == null ? '' : obj[key] }, attrs));
      i.addEventListener('change', () => { obj[key] = i.value; });
      return i;
    };
    // Data utama
    const t1 = el('table', { class: 't kv' });
    t1.appendChild(el('thead', {}, el('tr', {}, el('th', { text: 'Data' }), el('th', { text: 'Nilai' }), el('th', { text: 'Sumber' }))));
    t1.appendChild(el('tbody', {}, r.fields.map((f) => el('tr', {}, el('td', { text: f.label }), el('td', {}, edit(f, 'value')), el('td', { class: 'small muted', text: f.source })))));
    wrap.append(el('h4', { text: 'Data utama' }), el('div', { class: 'table-wrap', style: { maxHeight: 'none' } }, t1));
    if (!r.fields.filter((f) => f.key !== 'jenis_dokumen').length) wrap.appendChild(el('p', { class: 'small', style: { color: 'var(--warn)' }, text: 'Tidak ada data yang dikenali. Periksa teks hasil baca di kiri — bila OCR buram, coba foto/scan ulang dengan pencahayaan lebih baik (minimal 300 dpi).' }));
    // Pengurus
    const t2 = el('table', { class: 't' });
    t2.appendChild(el('thead', {}, el('tr', {}, ['Nama', 'Jabatan', 'Sumber', ''].map((h) => el('th', { text: h })))));
    t2.appendChild(el('tbody', {}, r.pengurus.map((p, i) => el('tr', {}, el('td', {}, edit(p, 'nama')), el('td', {}, edit(p, 'jabatan')), el('td', { class: 'small muted', text: p.source || 'manual' }),
      el('td', {}, el('button', { class: 'btn ghost sm', onclick: () => { r.pengurus.splice(i, 1); renderResult(); } }, '✕'))))));
    wrap.append(el('div', { class: 'row', style: { marginTop: '14px' } }, el('h4', { style: { margin: 0 }, text: 'Pengurus' }), el('div', { class: 'spacer' }),
      el('button', { class: 'btn secondary sm', onclick: () => { r.pengurus.push({ nama: '', jabatan: '' }); renderResult(); } }, '+ Baris')),
    el('div', { class: 'table-wrap', style: { maxHeight: 'none', marginTop: '6px' } }, t2));
    // Saham
    const t3 = el('table', { class: 't' });
    t3.appendChild(el('thead', {}, el('tr', {}, ['Pemegang saham', 'Lembar', 'Nominal (Rp)', '%', ''].map((h, i) => el('th', { class: i && i < 4 ? 'num' : '', text: h })))));
    t3.appendChild(el('tbody', {}, r.saham.map((s, i) => el('tr', {}, el('td', {}, edit(s, 'nama')),
      el('td', {}, edit(s, 'lembar', { class: 'in-cell num' })), el('td', {}, edit(s, 'nominal', { class: 'in-cell num' })), el('td', {}, edit(s, 'persen', { class: 'in-cell num', style: { width: '80px' } })),
      el('td', {}, el('button', { class: 'btn ghost sm', onclick: () => { r.saham.splice(i, 1); renderResult(); } }, '✕'))))));
    const tot = r.saham.reduce((a, s) => a + (parseFloat(String(s.persen).replace(',', '.')) || 0), 0);
    wrap.append(el('div', { class: 'row', style: { marginTop: '14px' } }, el('h4', { style: { margin: 0 }, text: 'Komposisi saham' }), el('div', { class: 'spacer' }),
      el('button', { class: 'btn secondary sm', onclick: () => { r.saham.push({ nama: '', lembar: '', nominal: '', persen: '' }); renderResult(); } }, '+ Baris')),
    el('div', { class: 'table-wrap', style: { maxHeight: 'none', marginTop: '6px' } }, t3),
    r.saham.length ? el('p', { class: 'small ' + (Math.abs(tot - 100) > 0.05 ? '' : 'muted'), style: Math.abs(tot - 100) > 0.05 ? { color: 'var(--warn)' } : null, text: `Total: ${fmt(tot, 2)}%` + (Math.abs(tot - 100) > 0.05 ? ' — tidak 100%, periksa kembali' : ' ✓') }) : null);
  }

  function fieldVal(key) { const f = S.result.fields.find((x) => x.key === key); return f ? f.value : ''; }
  function tsv() {
    const r = S.result;
    const rows = [['Data', 'Nilai', 'Sumber'], ...r.fields.map((f) => [f.label, f.value, f.source]), [], ['Pengurus', 'Jabatan'], ...r.pengurus.map((p) => [p.nama, p.jabatan]), [], ['Pemegang saham', 'Lembar', 'Nominal', '%'], ...r.saham.map((s) => [s.nama, s.lembar, s.nominal, s.persen])];
    return rows.map((x) => x.map((c) => String(c == null ? '' : c).replace(/\t|\n/g, ' ')).join('\t')).join('\n');
  }
  function sendToNak() {
    const r = S.result;
    const pengurus = r.pengurus.filter((p) => p.nama).map((p) => ({ nama: p.nama, jabatan: p.jabatan, saham: '' }));
    r.saham.filter((s) => s.nama).forEach((s) => {
      const ex = pengurus.find((p) => p.nama.toUpperCase() === s.nama.toUpperCase());
      if (ex) ex.saham = s.persen == null ? '' : String(s.persen);
      else pengurus.push({ nama: s.nama, jabatan: 'Pemegang Saham', saham: s.persen == null ? '' : String(s.persen) });
    });
    const tglAkta = fieldVal('tgl_akta');
    App.modules.docgen.receive({
      nama_perusahaan: fieldVal('nama_perusahaan'), bentuk_usaha: fieldVal('bentuk_usaha'), npwp: fieldVal('npwp'), nib: fieldVal('nib'),
      no_akta_pendirian: fieldVal('no_akta'), tgl_akta_pendirian: tglAkta, notaris_pendirian: fieldVal('notaris'), sk_kemenkumham: fieldVal('sk_kemenkumham'),
      alamat_usaha: fieldVal('alamat'), kbli: fieldVal('kbli'), pengurus,
    }, 'Data legalitas');
  }

  const SAMPLE = `AKTA PENDIRIAN PERSEROAN TERBATAS
PT CONTOH MAKMUR SENTOSA
NOMOR : 12
Pada hari ini, Senin, tanggal 08-03-2021 (delapan Maret dua ribu dua puluh satu), menghadap kepada saya, RINA KARTIKA, S.H., M.Kn., Notaris di Kota Contoh.
Modal dasar Perseroan berjumlah Rp 2.000.000.000,- (dua miliar rupiah) terbagi atas 2.000 (dua ribu) saham, masing-masing saham bernilai nominal Rp 1.000.000,-
Modal ditempatkan dan disetor penuh sebesar Rp 1.000.000.000,- dengan susunan pemegang saham sebagai berikut:
1. Tuan ANDI PRATAMA sebanyak 600 (enam ratus) saham, dengan nilai nominal seluruhnya sebesar Rp 600.000.000,-
2. Nyonya DEWI LESTARI sebanyak 400 (empat ratus) saham, dengan nilai nominal seluruhnya sebesar Rp 400.000.000,-
Susunan anggota Direksi dan Dewan Komisaris:
- Direktur Utama : Tuan ANDI PRATAMA, tersebut;
- Komisaris : Nyonya DEWI LESTARI, tersebut;
Akta ini telah mendapat pengesahan berdasarkan Keputusan Menteri Hukum dan Hak Asasi Manusia Nomor AHU-0012345.AH.01.01.TAHUN 2021 tanggal 10 Maret 2021.

--- (NIB, contoh fiktif) ---
PERIZINAN BERUSAHA BERBASIS RISIKO
NOMOR INDUK BERUSAHA: 9120000000000
Nama Pelaku Usaha : PT CONTOH MAKMUR SENTOSA
Alamat Kantor : Jl. Contoh Raya No. 1, RT 001/RW 002
Kel. Contoh, Kec. Contoh, Kota Contoh
NPWP : 01.000.000.0-000.000
KBLI :
1. 46900 Perdagangan Besar Berbagai Macam Barang
2. 10794 Industri Kerupuk, Keripik, Peyek dan Sejenisnya
Diterbitkan di Jakarta, tanggal: 15 Maret 2021`;

  function init() {
    setupDrop($('#lg-drop'), $('#lg-file'), handleFiles);
    $('#lg-clear').addEventListener('click', () => { S.docs = []; renderDocs(); parseAll(); });
    $('#lg-reparse').addEventListener('click', parseAll);
    $('#lg-copy').addEventListener('click', () => copyText(tsv()));
    $('#lg-export').addEventListener('click', () => {
      const r = S.result;
      exportXlsx('Ekstraksi Legalitas ' + App.safeFileName(fieldVal('nama_perusahaan') || App.todayISO()) + '.xlsx', [
        { name: 'Data Utama', cols: [34, 60, 30], rows: [['Data', 'Nilai', 'Sumber'], ...r.fields.map((f) => [f.label, f.value, f.source])] },
        { name: 'Pengurus', cols: [34, 24], rows: [['Nama', 'Jabatan'], ...r.pengurus.map((p) => [p.nama, p.jabatan])] },
        { name: 'Saham', cols: [34, 12, 18, 8], rows: [['Pemegang saham', 'Lembar', 'Nominal', '%'], ...r.saham.map((s) => [s.nama, s.lembar, s.nominal, s.persen])] },
      ]);
    });
    $('#lg-to-nak').addEventListener('click', sendToNak);
    $('#lg-sample').addEventListener('click', () => {
      S.docs.push({ id: uid(), name: 'contoh-akta-dan-nib.txt', text: SAMPLE, method: 'contoh fiktif', confidence: null });
      renderDocs();
      parseAll();
    });
    renderResult();
  }

  App.modules.legal = { init, S, SAMPLE };
})();
