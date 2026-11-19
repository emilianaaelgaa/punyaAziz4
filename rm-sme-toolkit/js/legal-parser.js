/*
 * Ekstraksi data dari teks dokumen legalitas (NIB, NPWP, akta, SK Kemenkumham, KTP).
 * Berbasis pola teks (regex) — hasil harus dicek ulang terhadap dokumen asli.
 */
'use strict';
(function () {
  const { MONTH_RE, parseDate, fmtDateLong, parseAmount } = App;

  const DATE_RE = '(\\d{1,2}[\\s\\-/.]+(?:' + MONTH_RE.slice(1, -1) + '|\\d{1,2})[\\s\\-/.,]+\\d{4}|\\d{4}-\\d{2}-\\d{2})';
  const TITLE = '(?:TUAN|NYONYA|NONA|SDR\\.?|SAUDARA|SAUDARI|BAPAK|IBU|NY\\.?|TN\\.?|BPK\\.?)';
  const NAME = "([A-Z][A-Z.'’`]*(?:\\s+[A-Z][A-Z.'’`]*){0,5})";
  const JABATAN = '(DIREKTUR\\s+UTAMA|PRESIDEN\\s+DIREKTUR|WAKIL\\s+DIREKTUR\\s+UTAMA|WAKIL\\s+DIREKTUR|DIREKTUR|KOMISARIS\\s+UTAMA|PRESIDEN\\s+KOMISARIS|WAKIL\\s+KOMISARIS\\s+UTAMA|WAKIL\\s+KOMISARIS|KOMISARIS|PERSERO\\s+PENGURUS|PE?RSERO\\s+AKTIF|PE?RSERO\\s+KOMANDITER|PE?RSERO\\s+PASIF|PEMILIK|PENANGGUNG\\s+JAWAB)';
  const NAME_STOP = /\s+(TERSEBUT|LAHIR|BERTEMPAT|WARGA|PEMEGANG|SELAKU|SEBAGAI|DAN|YANG|NIK|NOMOR|BERALAMAT|DI|DALAM|MENJABAT|SEBANYAK|SEJUMLAH|PEKERJAAN|KEWARGANEGARAAN|ATAS|DENGAN|UNTUK|SAHAM|LEMBAR|S\.?H|M\.?KN)\b.*$/;
  const NOT_NAME = /^(MODAL|SAHAM|NILAI|JUMLAH|SELURUHNYA|TOTAL|DITEMPATKAN|DISETOR|DASAR|TERDIRI|ATAS|PERSEROAN|DIREKSI|DEWAN|KOMISARIS|DIREKTUR|PARA|SUSUNAN|ANGGOTA|PASAL|AKTA|NOTARIS|NAMA|JABATAN|TANGGAL|NOMOR|RP|SEBANYAK|YAITU|ADALAH|SEBESAR|DARI|MASING|KEPADA|OLEH|BERSAMA|DENGAN|TENTANG|BAHWA|DEMIKIAN|PADA|HARI|INI|MENGHADAP|KEPEMILIKAN|SEBAGAI|SELAKU|BERIKUT|TELAH|DIAMBIL|BAGIAN|PENGURUS|TERBAGI|MASING|SELURUH|BERNILAI|NOMINAL|PENUH|SETIAP|TIAP|SEBAGAIMANA|TERSEBUT)\b/;

  function cleanName(s) {
    if (!s) return '';
    let n = s.replace(/\s+/g, ' ').trim().replace(NAME_STOP, '').replace(/[,.;:]+$/, '').trim();
    n = n.replace(new RegExp('^' + TITLE + '\\s+'), '').trim();
    if (n.length < 3 || NOT_NAME.test(n)) return '';
    return n;
  }
  function digits(s) { return String(s || '').replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/\D/g, ''); }
  function normDate(s) {
    if (!s) return '';
    const d = parseDate(s.replace(/\s+/g, ' ').replace(/,/g, ' ').trim());
    return d ? fmtDateLong(d) : s.trim();
  }

  function guessDocType(U) {
    const t = [];
    if (/NOMOR\s+INDUK\s+BERUSAHA|\bNIB\b/.test(U)) t.push('NIB');
    if (/\bNPWP\b|NOMOR\s+POKOK\s+WAJIB\s+PAJAK/.test(U)) t.push('NPWP');
    if (/\bAKTA\b/.test(U) && /NOTARIS/.test(U)) t.push('Akta Notaris');
    if (/KEPUTUSAN\s+MENTERI\s+HUKUM|AHU-/.test(U)) t.push('SK Kemenkumham');
    if (/\bNIK\b/.test(U) && /(PROVINSI|GOL\.?\s*DARAH|BERLAKU\s+HINGGA|KEWARGANEGARAAN)/.test(U)) t.push('KTP');
    return t;
  }

  function extract(text) {
    const src = String(text || '').replace(/\r/g, '').replace(/[ \t ]+/g, ' ');
    const U = src.toUpperCase();
    const flat = U.replace(/\s*\n\s*/g, ' ');
    const fields = [];
    const add = (key, label, value) => { if (value && !fields.some((f) => f.key === key && f.value === value)) fields.push({ key, label, value }); };
    let m;

    add('jenis_dokumen', 'Jenis dokumen terdeteksi', guessDocType(U).join(', '));

    // Nama perusahaan
    const names = {};
    const bump = (n, w) => { n = n.replace(/\s+/g, ' ').replace(/["“”]/g, '').replace(/[,.;:]+$/, '').trim(); if (n.length > 4) names[n] = (names[n] || 0) + w; };
    const reLabel = /NAMA\s+(?:PERUSAHAAN|PELAKU\s+USAHA|BADAN\s+USAHA|WAJIB\s+PAJAK|PERSEROAN)\s*[:.]?\s*([^\n]{3,80})/g;
    while ((m = reLabel.exec(U))) bump(m[1].split(/\s{2,}|\s+(?:NIB|NPWP|ALAMAT)\b/)[0], 3);
    const reEnt = /\b(PT\.?|CV\.?|PERSEROAN\s+TERBATAS|PERSEKUTUAN\s+KOMANDITER|PERSEROAN\s+KOMANDITER)\s*["“]?\s*((?:PT\.?|CV\.?)?\s*[A-Z0-9][A-Z0-9&'.\-]*(?:\s+[A-Z0-9][A-Z0-9&'.\-]*){0,6})/g;
    while ((m = reEnt.exec(flat))) {
      let n = m[2].replace(/\s+(BERKEDUDUKAN|BERALAMAT|DENGAN|YANG|DI|SELANJUTNYA|DALAM|TERSEBUT|BERTEMPAT|NOMOR|TANGGAL|SEBAGAI|ATAU|DAN|NIB|NPWP)\b.*$/, '').trim();
      let pre = m[1].replace(/\.$/, '').replace(/PERSEROAN\s+TERBATAS/, 'PT').replace(/PERSE(KUTUAN|ROAN)\s+KOMANDITER/, 'CV');
      if (/^(PT|CV)\b/.test(n)) { pre = ''; n = n.replace(/^(PT|CV)\.?\s*/, (x) => x.replace('.', '').trim() + ' '); }
      if (n.split(' ').length >= 1 && !/^(TERSEBUT|INI|ITU)$/.test(n)) bump((pre ? pre + ' ' : '') + n, 1);
    }
    const bestName = Object.entries(names).sort((a, b) => b[1] - a[1])[0];
    if (bestName) {
      add('nama_perusahaan', 'Nama perusahaan', bestName[0]);
      const bu = bestName[0].match(/^(PT|CV|UD|FIRMA|KOPERASI)\b/);
      if (bu) add('bentuk_usaha', 'Bentuk usaha', bu[1]);
    }

    // NIB
    if ((m = U.match(/(?:\bNIB\b|NOMOR\s+INDUK\s+BERUSAHA)\s*(?:\(NIB\))?\s*[:.]?\s*([0-9OIl][0-9OIl \-]{11,20})/))) {
      const d = digits(m[1]);
      if (d.length >= 13) add('nib', 'NIB', d.slice(0, 13));
    }
    // NPWP (15 digit format lama atau 16 digit)
    const npwpLabel = U.match(/(?:NPWP|NOMOR\s+POKOK\s+WAJIB\s+PAJAK)\s*(?:\(16\s*DIGIT\)|16\s*DIGIT)?\s*[:.]?\s*([0-9OI][0-9OI .,\-]{14,24})/);
    const fmtNpwp = (d) => (d.length === 15 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}.${d.slice(8, 9)}-${d.slice(9, 12)}.${d.slice(12)}` : d);
    if (npwpLabel) {
      const d = digits(npwpLabel[1]);
      if (d.length >= 16 && !/[.\-]/.test(npwpLabel[1].slice(0, 6))) add('npwp', 'NPWP', d.slice(0, 16));
      else if (d.length >= 15) add('npwp', 'NPWP', fmtNpwp(d.slice(0, 15)));
    }
    if (!fields.some((f) => f.key === 'npwp') && (m = U.match(/\b(\d{2})\s?\.\s?(\d{3})\s?\.\s?(\d{3})\s?\.\s?(\d)\s?-\s?(\d{3})\s?\.\s?(\d{3})\b/))) add('npwp', 'NPWP', fmtNpwp(m.slice(1).join('')));
    // NIK (KTP)
    const reNik = /\bNIK\s*[:.]?\s*([0-9OIl][0-9OIl ]{15,20})/g;
    while ((m = reNik.exec(U))) { const d = digits(m[1]); if (d.length >= 16) add('nik', 'NIK', d.slice(0, 16)); }
    if ((m = U.match(/\bNAMA\s*[:.]\s*([A-Z][A-Z .,'’]{2,60})\n/)) && guessDocType(U).includes('KTP')) add('nama_ktp', 'Nama (KTP)', cleanName(m[1]) || m[1].trim());

    // Akta
    const aktas = [];
    const reAkta = new RegExp('AKTA\\s*(PENDIRIAN|PERUBAHAN|PERNYATAAN\\s+KEPUTUSAN[A-Z ]{0,40}|BERITA\\s+ACARA[A-Z ]{0,40})?[^.;]{0,60}?(?:NOMOR|NO\\.?)\\s*[:.]?\\s*(\\d{1,4})\\s*(?:\\([^)]{0,40}\\))?\\s*,?\\s*(?:TANGGAL|TGL\\.?)\\s*[:.]?\\s*' + DATE_RE, 'g');
    while ((m = reAkta.exec(flat))) {
      const after = flat.slice(m.index + m[0].length, m.index + m[0].length + 160);
      const nt = after.match(/(?:DIBUAT\s+(?:DI\s*)?HADAPAN\s+|OLEH\s+|NOTARIS\s+)([A-Z][A-Z.'’ ]{2,50}?(?:\s*,\s*(?:S\.?\s?H|M\.?\s?KN|M\.?\s?H|SP\.?N|S\.?E|M\.?M)\.?)*)(?=\s*,?\s*(?:NOTARIS|DI\b|YANG|BERKEDUDUKAN|DAN|;|\.|$))/);
      aktas.push({ jenis: m[1] ? m[1].split(/\s+/).slice(0, 2).join(' ') : '', nomor: m[2], tanggal: normDate(m[3]), notaris: nt ? nt[1].trim() : '' });
    }
    // Kepala akta: "NOMOR : 15" + "Pada hari ini ... tanggal ..."
    if (/\bAKTA\b/.test(U) && /NOTARIS/.test(U)) {
      const hn = U.match(/^\s*(?:NOMOR|NO\.?)\s*[:.]?\s*(\d{1,4})\s*\.?\s*$/m);
      const hd = flat.match(new RegExp('PADA\\s+HARI\\s+INI[^.]{0,40}?(?:TANGGAL\\s*[:.]?\\s*)?' + DATE_RE));
      if (hn && !aktas.some((a) => a.nomor === hn[1])) {
        const title = U.match(/\bAKTA\s+(PENDIRIAN|PERUBAHAN|PERNYATAAN\s+KEPUTUSAN)/);
        aktas.unshift({ jenis: title ? title[1].split(/\s+/)[0] : '(dokumen ini)', nomor: hn[1], tanggal: hd ? normDate(hd[1]) : '', notaris: '' });
      }
    }
    // Notaris (umum)
    let notaris = '';
    const reNotA = /([A-Z][A-Z.'’]+(?:\s+[A-Z][A-Z.'’]+){0,4}(?:\s*,\s*(?:S\.?\s?H|M\.?\s?KN|M\.?\s?H|SP\.?N|S\.?E|M\.?M)\.?)+)\s*,?\s*NOTARIS\b/;
    const reNotB = /NOTARIS\s*[:.]?\s*(?!DI\b|DAN\b|YANG\b|TERSEBUT\b)([A-Z][A-Z.'’]+(?:\s+[A-Z][A-Z.'’]+){0,4}(?:\s*,\s*(?:S\.?\s?H|M\.?\s?KN|M\.?\s?H|SP\.?N|S\.?E|M\.?M)\.?)*)/;
    if ((m = flat.match(reNotA))) notaris = m[1];
    else if ((m = flat.match(reNotB))) notaris = m[1].replace(/\s+(DI|BERKEDUDUKAN|YANG|DAN)\b.*$/, '');
    notaris = notaris.replace(/^(DIBUAT\s+DI\s*HADAPAN|DI\s*HADAPAN|HADAPAN|SAYA|OLEH)\s+/, '').trim();
    aktas.forEach((a) => { if (!a.notaris && notaris) a.notaris = notaris; });
    aktas.forEach((a, i) => {
      const lbl = 'Akta ' + (a.jenis ? a.jenis.toLowerCase() : (i + 1));
      add('akta_' + i, lbl, `No. ${a.nomor}${a.tanggal ? ' tanggal ' + a.tanggal : ''}${a.notaris ? ', Notaris ' + fixTitles(a.notaris) : ''}`);
    });
    const pend = aktas.find((a) => /PENDIRIAN/.test(a.jenis)) || aktas[0];
    if (pend) { add('no_akta', 'No. akta (utama)', pend.nomor); add('tgl_akta', 'Tanggal akta (utama)', pend.tanggal); }
    if (notaris) add('notaris', 'Notaris', fixTitles(notaris));

    // SK Kemenkumham
    const reSk = /(AHU-\d[A-Z0-9.\-]*?\.?\s*TAHUN\s*\d{4}|AHU-[A-Z0-9][A-Z0-9.\-]*[A-Z0-9])/g;
    while ((m = reSk.exec(flat))) {
      const after = flat.slice(m.index + m[0].length, m.index + m[0].length + 60);
      const dt = after.match(new RegExp('(?:TANGGAL|TGL\\.?)\\s*[:.]?\\s*' + DATE_RE));
      add('sk_kemenkumham', 'SK Kemenkumham', m[1].replace(/\s+/g, ' ').trim() + (dt ? ' tanggal ' + normDate(dt[1]) : ''));
    }
    // Tanggal terbit NIB
    if ((m = flat.match(new RegExp('DITERBITKAN\\s+(?:DI\\s+[A-Z ]{2,30}?\\s*,?\\s*)?(?:PADA\\s+)?(?:TANGGAL|TGL\\.?)?\\s*[:.]?\\s*' + DATE_RE)))) add('tgl_terbit', 'Tanggal terbit', normDate(m[1]));
    // KBLI
    const kbli = new Set();
    const lines = U.split('\n');
    lines.forEach((ln, i) => {
      if (!/KBLI/.test(ln)) return;
      (ln.match(/\b\d{5}\b/g) || []).forEach((k) => kbli.add(k));
      for (let j = i + 1; j < Math.min(lines.length, i + 25); j++) {
        const mm = lines[j].match(/^\s*(?:\d{1,2}[.)]\s*)?(\d{5})\s*[-–:.]?\s+[A-Z]/);
        if (mm && !/KODE\s*POS/.test(lines[j])) kbli.add(mm[1]);
      }
    });
    if (kbli.size) add('kbli', 'KBLI', Array.from(kbli).join(', '));
    // Alamat
    if ((m = src.match(/ALAMAT(?:\s+(?:KANTOR|USAHA|PERUSAHAAN|LENGKAP|KEDUDUKAN))?\s*[:.]\s*([^\n]{5,160})(\n[^\n]{3,120})?/i))) {
      let a = m[1].trim();
      if (m[2] && /\b(RT|RW|KEL|KEC|KOTA|KAB|DESA|PROV|KODE\s*POS)\b/i.test(m[2])) a += ', ' + m[2].trim();
      add('alamat', 'Alamat', a.replace(/\s{2,}/g, ' '));
    }
    // Modal
    const money = (s) => { const p = parseAmount(s, ','); return p ? p.value : null; };
    if ((m = flat.match(/MODAL\s+DASAR[^.]{0,80}?RP\.?\s*([\d.,]+)/))) add('modal_dasar', 'Modal dasar', 'Rp ' + m[1].replace(/[.,]-?$/, ''));
    if ((m = flat.match(/MODAL\s+(?:YANG\s+)?(?:DITEMPATKAN|DISETOR)[^.]{0,80}?RP\.?\s*([\d.,]+)/))) add('modal_disetor', 'Modal ditempatkan/disetor', 'Rp ' + m[1].replace(/[.,]-?$/, ''));
    let nominalPerSaham = null;
    if ((m = flat.match(/(?:NILAI\s+NOMINAL|BERNILAI\s+NOMINAL)[^.]{0,40}?RP\.?\s*([\d.,]+)/))) nominalPerSaham = money(m[1].replace(/,-$/, ''));

    // Pengurus
    const pengurus = [];
    const addP = (nama, jabatan) => {
      nama = cleanName(nama);
      if (!nama) return;
      jabatan = jabatan.replace(/\s+/g, ' ').replace(/^PE?RSERO/, 'PERSERO');
      const ex = pengurus.find((p) => p.nama === nama);
      if (ex) { if (!ex.jabatan.includes(jabatan) && jabatan) ex.jabatan = ex.jabatan; return; }
      pengurus.push({ nama, jabatan: titleCase(jabatan) });
    };
    const reA = new RegExp('(?:^|\\n)[\\s\\-•*\\d.)]*' + JABATAN + '\\s*[:\\-–]\\s*(?:' + TITLE + '\\s+)?' + NAME, 'g');
    while ((m = reA.exec(U))) addP(m[2], m[1]);
    const reB = new RegExp(TITLE + '\\s+' + NAME + '\\s*,?[^.;\\n]{0,120}?(?:SELAKU|SEBAGAI|MENJABAT\\s+SEBAGAI|DALAM\\s+JABATANNYA\\s+SEBAGAI)\\s+' + JABATAN, 'g');
    while ((m = reB.exec(flat))) addP(m[1], m[2]);
    const reC = new RegExp('(?:^|\\n)\\s*\\d{1,2}[.)]?\\s+' + NAME + '\\s+' + JABATAN + '\\b', 'g');
    while ((m = reC.exec(U))) addP(m[1], m[2]);
    const reD = new RegExp('(?:^|\\n)\\s*NAMA\\s*[:.]?\\s*' + NAME + '\\s*\\n\\s*JABATAN\\s*[:.]?\\s*' + JABATAN, 'g');
    while ((m = reD.exec(U))) addP(m[1], m[2]);

    // Pemegang saham
    const saham = [];
    const reS1 = new RegExp('(?:' + TITLE + '\\s+|\\b(?:PT|CV)\\.?\\s+)?' + NAME + '\\s*,?\\s*(?:SEBANYAK|SEJUMLAH|MEMILIKI|:|-)?\\s*(\\d{1,3}(?:[.,]\\d{3})+|\\d+)\\s*(?:\\([^)]{0,90}\\)\\s*)?(?:LEMBAR\\s+)?SAHAM', 'g');
    while ((m = reS1.exec(flat))) {
      const nama = cleanName(m[1]);
      if (!nama) continue;
      const lembar = money(m[2]);
      if (!lembar) continue;
      const after = flat.slice(m.index + m[0].length, m.index + m[0].length + 160);
      const nm = after.match(/^[^;]{0,100}?RP\.?\s*([\d.,]+)/);
      const pc = after.match(/^[^;]{0,60}?\(?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*%/);
      if (!saham.some((s) => s.nama === nama)) saham.push({ nama, lembar, nominal: nm ? money(nm[1].replace(/,-$/, '')) : (nominalPerSaham ? lembar * nominalPerSaham : null), persen: pc ? parseFloat(pc[1].replace(',', '.')) : null });
    }
    const reS2 = new RegExp(NAME + '\\s*[:\\-]?\\s*(\\d{1,3}(?:[.,]\\d{1,2})?)\\s*%', 'g');
    if (/SAHAM|KEPEMILIKAN/.test(U)) {
      while ((m = reS2.exec(flat))) {
        const nama = cleanName(m[1]);
        if (!nama || saham.some((s) => s.nama === nama)) continue;
        saham.push({ nama, lembar: null, nominal: null, persen: parseFloat(m[2].replace(',', '.')) });
      }
    }
    const totL = saham.reduce((s, x) => s + (x.lembar || 0), 0);
    saham.forEach((s) => { if (s.persen == null && s.lembar && totL) s.persen = Math.round((s.lembar / totL) * 10000) / 100; });

    return { fields, pengurus, saham };
  }

  /** Rapikan gelar yang ikut menjadi huruf besar: M.KN. → M.Kn., SP.N. → Sp.N. */
  function fixTitles(s) {
    return s.replace(/\bM\.?\s?KN\b\.?/g, 'M.Kn.').replace(/\bSP\.?N\b\.?/g, 'Sp.N.').replace(/\bS\.?H\b\.?(?!\w)/g, 'S.H.').replace(/\bM\.?H\b\.?(?!\w)/g, 'M.H.').replace(/\.\./g, '.').replace(/\s+,/g, ',').trim();
  }
  function titleCase(s) { return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); }

  App.legal = { extract, digits };
})();
