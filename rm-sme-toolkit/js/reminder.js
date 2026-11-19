/* Modul 2 — Pengingat Jatuh Tempo & Kelengkapan Dokumen */
'use strict';
(function () {
  const { $, el, toast, store, fmtDate, fmtDateLong, todayISO, daysBetween, addDays, parseDate, uid, exportXlsx, copyText, confirmBox, readFileAs } = App;

  const JENIS = [
    'Jatuh Tempo Fasilitas Kredit',
    'Asuransi Agunan',
    'Asuransi Jiwa / Kredit',
    'Covenant / Syarat Kredit',
    'Dokumen Legalitas (NIB / Izin Usaha)',
    'Penilaian Ulang Agunan (Appraisal)',
    'Laporan Keuangan Berkala',
    'Kunjungan / Call Report',
    'Lainnya',
  ];

  let items = [];
  const load = () => { items = store.get('reminders', []); };
  const save = () => store.set('reminders', items);

  function daysLeft(it) { return daysBetween(todayISO(), it.tanggal); }
  function statusOf(it) {
    if (it.status === 'selesai') return { cls: 'neutral', icon: '✓', text: 'Selesai', rank: 9 };
    const d = daysLeft(it);
    if (d < 0) return { cls: 'bad', icon: '⛔', text: `Lewat ${-d} hari`, rank: 0 };
    if (d === 0) return { cls: 'bad', icon: '⛔', text: 'Hari ini', rank: 0 };
    if (d <= 30) return { cls: 'warn', icon: '⚠', text: `H-${d}`, rank: 1 };
    if (d <= 60) return { cls: 'info', icon: '🔔', text: `H-${d}`, rank: 2 };
    return { cls: 'ok', icon: '✓', text: `H-${d}`, rank: 3 };
  }

  function counts() {
    const c = { overdue: 0, d30: 0, d60: 0, active: 0 };
    items.forEach((it) => {
      if (it.status === 'selesai') return;
      c.active++;
      const d = daysLeft(it);
      if (d <= 0) c.overdue++; else if (d <= 30) c.d30++; else if (d <= 60) c.d60++;
    });
    return c;
  }

  function filtered() {
    const q = $('#rm-search').value.trim().toUpperCase();
    const j = $('#rm-f-jenis').value;
    const r = $('#rm-f-range').value;
    return items.filter((it) => {
      if (q && !(it.debitur + ' ' + it.keterangan + ' ' + (it.catatan || '')).toUpperCase().includes(q)) return false;
      if (j && it.jenis !== j) return false;
      const d = daysLeft(it);
      switch (r) {
        case 'open': return it.status !== 'selesai';
        case 'overdue': return it.status !== 'selesai' && d <= 0;
        case '30': case '60': case '90': return it.status !== 'selesai' && d <= +r;
        case 'done': return it.status === 'selesai';
        default: return true;
      }
    }).sort((a, b) => (a.status === 'selesai') - (b.status === 'selesai') || a.tanggal.localeCompare(b.tanggal));
  }

  function render() {
    const c = counts();
    const stats = $('#rm-stats');
    stats.innerHTML = '';
    const tile = (lbl, val, sub, cls) => el('div', { class: 'stat' }, el('div', { class: 'lbl' }, el('span', { class: 'pill ' + cls, text: lbl })), el('div', { class: 'val', text: String(val) }), el('div', { class: 'sub', text: sub }));
    stats.append(
      tile('⛔ Lewat / hari ini', c.overdue, 'segera tindak lanjuti', 'bad'),
      tile('⚠ ≤ 30 hari', c.d30, 'H-30 sampai H-1', 'warn'),
      tile('🔔 31–60 hari', c.d60, 'H-60 sampai H-31', 'info'),
      tile('Total aktif', c.active, items.length - c.active + ' selesai', 'neutral'));

    const list = filtered();
    const tb = el('table', { class: 't' });
    tb.appendChild(el('thead', {}, el('tr', {}, ['Status', 'Jatuh tempo', 'Debitur', 'Jenis', 'Keterangan', 'Catatan', ''].map((h) => el('th', { text: h })))));
    const body = el('tbody');
    list.forEach((it) => {
      const st = statusOf(it);
      body.appendChild(el('tr', {},
        el('td', {}, el('span', { class: 'pill ' + st.cls, text: st.icon + ' ' + st.text })),
        el('td', { class: 'nowrap', text: fmtDate(it.tanggal) }),
        el('td', { text: it.debitur }),
        el('td', { class: 'small', text: it.jenis }),
        el('td', { text: it.keterangan || '' }),
        el('td', { class: 'small text-2', text: it.catatan || '' }),
        el('td', { class: 'nowrap' },
          el('button', { class: 'btn ghost sm', onclick: () => edit(it) }, 'Ubah'),
          it.status === 'selesai'
            ? el('button', { class: 'btn ghost sm', onclick: () => { it.status = 'aktif'; save(); render(); } }, 'Aktifkan')
            : el('button', { class: 'btn ghost sm', onclick: () => done(it) }, 'Selesai'),
          el('button', { class: 'btn ghost sm', onclick: () => remove(it) }, 'Hapus'))));
    });
    tb.appendChild(body);
    const wrap = $('#rm-table');
    wrap.innerHTML = '';
    wrap.appendChild(tb);
    if (!list.length) wrap.appendChild(el('div', { class: 'muted', style: { padding: '14px' }, text: items.length ? 'Tidak ada item untuk filter ini.' : 'Belum ada data. Klik "+ Tambah item" atau impor dari Excel (unduh templatnya dulu).' }));
    App.modules.home && App.modules.home.refresh();
  }

  function form(it) {
    const names = Array.from(new Set(items.map((x) => x.debitur))).sort();
    const dl = el('datalist', { id: 'rm-names' }, names.map((n) => el('option', { value: n })));
    const f = {
      debitur: el('input', { value: it.debitur || '', list: 'rm-names', placeholder: 'Nama debitur' }),
      jenis: el('select', {}, JENIS.map((j) => el('option', { value: j, text: j }))),
      keterangan: el('input', { value: it.keterangan || '', placeholder: 'mis. KMK Rp 2 M / Polis no. … / Covenant laporan keuangan audited' }),
      tanggal: el('input', { type: 'date', value: it.tanggal || '' }),
      catatan: el('textarea', { rows: 2 }),
    };
    f.jenis.value = it.jenis || JENIS[0];
    f.catatan.value = it.catatan || '';
    const body = el('div', { class: 'grid g2' }, dl,
      el('label', { class: 'f' }, 'Debitur', f.debitur), el('label', { class: 'f' }, 'Jenis', f.jenis),
      el('label', { class: 'f' }, 'Keterangan', f.keterangan), el('label', { class: 'f' }, 'Tanggal jatuh tempo / tenggat', f.tanggal),
      el('label', { class: 'f', style: { gridColumn: '1 / -1' } }, 'Catatan', f.catatan));
    return { f, body };
  }

  async function edit(it) {
    const isNew = !it;
    it = it || {};
    const { f, body } = form(it);
    const r = await App.modal(isNew ? 'Tambah item pengingat' : 'Ubah item', body, [{ label: 'Batal', value: false, cls: 'secondary' }, { label: 'Simpan', value: true }]);
    if (!r) return;
    if (!f.debitur.value.trim() || !f.tanggal.value) { toast('Debitur dan tanggal wajib diisi'); return; }
    Object.assign(it, { debitur: f.debitur.value.trim(), jenis: f.jenis.value, keterangan: f.keterangan.value.trim(), tanggal: f.tanggal.value, catatan: f.catatan.value.trim() });
    if (isNew) { it.id = uid(); it.status = 'aktif'; items.push(it); }
    save();
    render();
  }

  async function done(it) {
    const next = el('input', { type: 'date', value: addDays(it.tanggal, 365) });
    const renew = el('input', { type: 'checkbox' });
    renew.checked = /Fasilitas|Asuransi|Legalitas|Appraisal|Laporan/.test(it.jenis);
    const body = el('div', {},
      el('p', { text: `Tandai "${it.jenis} — ${it.debitur}" selesai.` }),
      el('label', { class: 'check' }, renew, 'Buat item baru untuk periode berikutnya'),
      el('label', { class: 'f', style: { marginTop: '8px' } }, 'Tanggal jatuh tempo berikutnya', next));
    const r = await App.modal('Selesai', body, [{ label: 'Batal', value: false, cls: 'secondary' }, { label: 'Simpan', value: true }]);
    if (!r) return;
    it.status = 'selesai';
    it.selesaiTgl = todayISO();
    if (renew.checked && next.value) items.push({ ...it, id: uid(), status: 'aktif', tanggal: next.value, selesaiTgl: null });
    save();
    render();
  }

  async function remove(it) {
    if (!(await confirmBox(`Hapus "${it.jenis} — ${it.debitur}"?`, 'Hapus'))) return;
    items = items.filter((x) => x !== it);
    save();
    render();
  }

  /* ---------------------------- Excel ---------------------------- */
  const HEAD = ['Nama Debitur', 'Jenis', 'Keterangan', 'Tanggal Jatuh Tempo', 'Status', 'Catatan'];
  function downloadTemplate() {
    const y = new Date().getFullYear();
    exportXlsx('Templat Pengingat Jatuh Tempo.xlsx', [
      { name: 'Pengingat', cols: [30, 34, 40, 20, 10, 40], rows: [HEAD,
        ['CV Contoh Sejahtera', JENIS[0], 'KMK revolving Rp 2.000.000.000', `${y + 1}-03-31`, 'aktif', 'Siapkan usulan perpanjangan'],
        ['CV Contoh Sejahtera', JENIS[1], 'Polis kebakaran ruko — agunan SHGB', `${y + 1}-01-15`, 'aktif', ''],
        ['PT Contoh Makmur', JENIS[3], 'Laporan keuangan audited tahun berjalan', `${y + 1}-04-30`, 'aktif', 'Covenant PK'],
      ] },
      { name: 'Daftar Jenis', cols: [40], rows: [['Pilihan kolom "Jenis"'], ...JENIS.map((j) => [j])] },
    ]);
  }
  async function importExcel(file) {
    const ab = await readFileAs(file, 'array');
    const wb = XLSX.read(ab, { type: 'array', cellDates: true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
    let hr = -1, idx = {};
    for (let r = 0; r < Math.min(rows.length, 20); r++) {
      const h = rows[r].map((c) => String(c).toUpperCase());
      const find = (re) => h.findIndex((x) => re.test(x));
      const cand = { debitur: find(/DEBITUR|NAMA|NASABAH/), jenis: find(/JENIS|KATEGORI|TIPE/), ket: find(/KETERANGAN|FASILITAS|URAIAN|DESKRIPSI/), tgl: find(/TANGGAL|TGL|JATUH TEMPO|DUE|TENGGAT|EXPIRED|KEDALUWARSA/), status: find(/STATUS/), cat: find(/CATATAN|NOTE/) };
      if (cand.debitur >= 0 && cand.tgl >= 0) { hr = r; idx = cand; break; }
    }
    if (hr < 0) { toast('Kolom "Nama Debitur" dan "Tanggal Jatuh Tempo" tidak ditemukan. Gunakan templat Excel.', 5000); return; }
    let added = 0, skipped = 0;
    const key = (x) => [x.debitur, x.jenis, x.keterangan, x.tanggal].join('|').toUpperCase();
    const existing = new Set(items.map(key));
    for (const r of rows.slice(hr + 1)) {
      const debitur = String(r[idx.debitur] || '').trim();
      const tanggal = parseDate(r[idx.tgl]);
      if (!debitur || !tanggal) { if (debitur || r[idx.tgl]) skipped++; continue; }
      let jenis = idx.jenis >= 0 ? String(r[idx.jenis] || '').trim() : '';
      const jm = JENIS.find((j) => j.toUpperCase() === jenis.toUpperCase()) || JENIS.find((j) => jenis && j.toUpperCase().includes(jenis.toUpperCase().split(/[ /]/)[0]));
      jenis = jm || (jenis ? 'Lainnya' : JENIS[0]);
      const it = {
        id: uid(), debitur, jenis, tanggal,
        keterangan: idx.ket >= 0 ? String(r[idx.ket] || '').trim() : '',
        status: idx.status >= 0 && /SELESAI|DONE|CLOSE/i.test(String(r[idx.status])) ? 'selesai' : 'aktif',
        catatan: idx.cat >= 0 ? String(r[idx.cat] || '').trim() : '',
      };
      if (existing.has(key(it))) { skipped++; continue; }
      existing.add(key(it));
      items.push(it);
      added++;
    }
    save();
    render();
    toast(`${added} item ditambahkan` + (skipped ? `, ${skipped} dilewati (duplikat/tanggal tidak valid)` : ''), 4000);
  }
  function exportExcel() {
    exportXlsx('Pengingat Jatuh Tempo ' + todayISO() + '.xlsx', [{
      name: 'Pengingat', cols: [30, 34, 40, 18, 10, 12, 16, 40],
      rows: [[...HEAD.slice(0, 5), 'Sisa hari', 'Status waktu', 'Catatan'],
        ...items.slice().sort((a, b) => a.tanggal.localeCompare(b.tanggal)).map((it) => [it.debitur, it.jenis, it.keterangan, it.tanggal, it.status, daysLeft(it), statusOf(it).text, it.catatan || ''])],
    }]);
  }

  /* ---------------------------- Kalender Outlook (.ics) ---------------------------- */
  function icsEscape(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function icsFold(line) {
    const out = [];
    let cur = '';
    let bytes = 0;
    for (const ch of line) {
      const b = new TextEncoder().encode(ch).length;
      if (bytes + b > 73) { out.push(cur); cur = ' '; bytes = 1; }
      cur += ch;
      bytes += b;
    }
    out.push(cur);
    return out.join('\r\n');
  }
  function offsets() {
    const v = $('#rm-offsets').value.split(/[,; ]+/).map((x) => parseInt(x, 10)).filter((x) => x >= 0 && x <= 365);
    return Array.from(new Set(v.length ? v : [60, 30])).sort((a, b) => b - a);
  }
  function exportIcs() {
    const offs = offsets();
    const time = ($('#rm-time').value || '08:00').replace(':', '') + '00';
    const t = todayISO();
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RM SME Toolkit//Pengingat//ID', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Pengingat RM SME'];
    let n = 0;
    items.filter((it) => it.status !== 'selesai').forEach((it) => {
      offs.forEach((o) => {
        const day = addDays(it.tanggal, -o);
        if (day < t) return;
        const dt = day.replace(/-/g, '');
        const endMin = String(+time.slice(2, 4) + 15).padStart(2, '0');
        const tag = o === 0 ? 'JATUH TEMPO HARI INI' : `H-${o}`;
        L.push('BEGIN:VEVENT',
          `UID:${it.id}-h${o}@rm-sme-toolkit.local`,
          `DTSTAMP:${stamp}`,
          `DTSTART:${dt}T${time}`,
          `DTEND:${dt}T${time.slice(0, 2)}${endMin > '59' ? '59' : endMin}00`,
          icsFold(`SUMMARY:${icsEscape(`[${tag}] ${it.jenis} — ${it.debitur}`)}`),
          icsFold(`DESCRIPTION:${icsEscape(`${it.jenis}\nDebitur: ${it.debitur}\nKeterangan: ${it.keterangan || '-'}\nJatuh tempo: ${fmtDateLong(it.tanggal)}\nCatatan: ${it.catatan || '-'}\n\n(Dibuat oleh RM SME Toolkit)`)}`),
          'CATEGORIES:RM SME', 'TRANSP:TRANSPARENT', 'X-MICROSOFT-CDO-BUSYSTATUS:FREE',
          'BEGIN:VALARM', 'ACTION:DISPLAY', icsFold(`DESCRIPTION:${icsEscape(`[${tag}] ${it.debitur}`)}`), 'TRIGGER:-PT5M', 'END:VALARM',
          'END:VEVENT');
        n++;
      });
    });
    L.push('END:VCALENDAR');
    if (!n) { toast('Tidak ada pengingat yang akan datang untuk diekspor.'); return; }
    App.downloadBlob(new Blob([L.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' }), 'Pengingat RM SME ' + t + '.ics');
    App.modal('File kalender dibuat', el('div', {},
      el('p', { text: `${n} pengingat (${offs.map((o) => (o ? 'H-' + o : 'hari-H')).join(', ')}) disimpan ke file .ics di folder Unduhan.` }),
      el('p', {}, el('strong', { text: 'Cara memasukkan ke Outlook:' })),
      el('ul', {},
        el('li', { text: 'Outlook klasik (desktop): File → Open & Export → Import/Export → "Import an iCalendar (.ics)" → pilih file → Import.' }),
        el('li', { text: 'Outlook baru / Outlook Web: Kalender → Tambahkan kalender → Unggah dari file → pilih file → pilih kalender Anda.' }),
        el('li', { text: 'Pengingat akan muncul di laptop dan aplikasi Outlook di HP (tersinkron lewat akun Exchange kantor).' })),
      el('p', { class: 'small muted', text: 'Mengimpor ulang setelah data berubah aman: tiap pengingat memiliki ID tetap. Item yang sudah dihapus/selesai perlu dihapus manual dari kalender.' })),
    [{ label: 'Mengerti', value: true }]);
  }

  /* ---------------------------- Ringkasan teks ---------------------------- */
  function summaryText(maxLen) {
    const act = items.filter((it) => it.status !== 'selesai').sort((a, b) => a.tanggal.localeCompare(b.tanggal));
    const grp = (f) => act.filter(f).map((it) => `• ${fmtDate(it.tanggal)} (${statusOf(it).text}) — ${it.debitur}: ${it.jenis}${it.keterangan ? ' — ' + it.keterangan : ''}`);
    const parts = [`Ringkasan jatuh tempo per ${fmtDateLong(todayISO())}`];
    const o = grp((it) => daysLeft(it) <= 0), a = grp((it) => daysLeft(it) > 0 && daysLeft(it) <= 30), b = grp((it) => daysLeft(it) > 30 && daysLeft(it) <= 60);
    parts.push('', `LEWAT / HARI INI (${o.length})`, ...(o.length ? o : ['-']));
    parts.push('', `≤ 30 HARI (${a.length})`, ...(a.length ? a : ['-']));
    parts.push('', `31–60 HARI (${b.length})`, ...(b.length ? b : ['-']));
    let s = parts.join('\n');
    if (maxLen && s.length > maxLen) s = s.slice(0, maxLen) + '\n… (selengkapnya lihat RM SME Toolkit)';
    return s;
  }

  function paGuide() {
    return el('div', { class: 'small' },
      el('p', { text: 'Gunakan cara ini bila Anda ingin notifikasi Teams/email terkirim otomatis setiap pagi walau laptop mati. Seluruhnya berjalan di tenant Microsoft 365 kantor (bukan layanan publik). Pastikan sesuai kebijakan TI unit Anda.' }),
      el('ol', {},
        el('li', { text: 'Klik "Ekspor Excel" di atas, simpan file ke OneDrive for Business kantor. Di Excel, blok data → Insert → Table (centang "My table has headers"), beri nama tabel "Pengingat".' }),
        el('li', { text: 'Buka Power Automate → Create → Scheduled cloud flow → ulangi setiap 1 hari pukul 07:00.' }),
        el('li', { text: 'Tambah aksi "Excel Online (Business) – List rows present in a table" → pilih file & tabel "Pengingat". Di Advanced parameters, set DateTime Format = ISO 8601.' }),
        el('li', {}, 'Tambah aksi "Filter array" dengan From = value, mode lanjutan: ',
          el('code', { text: "@and(equals(item()?['Status'],'aktif'), or(equals(div(sub(ticks(item()?['Tanggal Jatuh Tempo']),ticks(startOfDay(utcNow()))),864000000000),60), equals(div(sub(ticks(item()?['Tanggal Jatuh Tempo']),ticks(startOfDay(utcNow()))),864000000000),30)))" })),
        el('li', { text: 'Tambah "Condition": length(body(\'Filter_array\')) is greater than 0 → If yes: "Create HTML table" dari hasil filter, lalu "Post message in a chat or channel" (Teams, Flow bot → chat dengan Anda) atau "Send an email (V2)" ke alamat Anda sendiri.' }),
        el('li', { text: 'Simpan dan uji (Test → Manually). Setiap ada perubahan data, cukup perbarui tabel di Excel OneDrive tersebut.' })));
  }

  function init() {
    load();
    JENIS.forEach((j) => $('#rm-f-jenis').appendChild(el('option', { value: j, text: j })));
    const cfg = store.get('rm.cfg', {});
    if (cfg.offsets) $('#rm-offsets').value = cfg.offsets;
    if (cfg.time) $('#rm-time').value = cfg.time;
    const saveCfg = () => store.set('rm.cfg', { offsets: $('#rm-offsets').value, time: $('#rm-time').value });
    $('#rm-offsets').addEventListener('change', saveCfg);
    $('#rm-time').addEventListener('change', saveCfg);
    $('#rm-add').addEventListener('click', () => edit(null));
    $('#rm-template').addEventListener('click', downloadTemplate);
    $('#rm-export').addEventListener('click', exportExcel);
    $('#rm-import').addEventListener('click', () => $('#rm-file').click());
    $('#rm-file').addEventListener('change', async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) { try { await importExcel(f); } catch (err) { toast('Gagal impor: ' + err.message, 5000); } } });
    $('#rm-ics').addEventListener('click', exportIcs);
    $('#rm-copy').addEventListener('click', () => copyText(summaryText()));
    $('#rm-mail').addEventListener('click', () => {
      const body = summaryText(1500);
      window.location.href = 'mailto:?subject=' + encodeURIComponent('Ringkasan jatuh tempo debitur ' + fmtDate(todayISO())) + '&body=' + encodeURIComponent(body);
    });
    ['#rm-search', '#rm-f-jenis', '#rm-f-range'].forEach((s) => $(s).addEventListener('input', render));
    $('#rm-pa-guide').appendChild(paGuide());
    render();
  }

  App.modules.reminder = { init, render, counts, reload: () => { load(); render(); }, JENIS };
})();
