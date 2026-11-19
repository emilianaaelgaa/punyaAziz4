/*
 * Mesin baca rekening koran (generik, tidak terikat format satu bank).
 *  - parseLines(): untuk PDF e-statement / teks / hasil OCR (baris + posisi x token)
 *  - parseTable(): untuk CSV/Excel dengan pemetaan kolom
 *  - analyze():    kategori, deteksi contra, rekonsiliasi saldo, rekap bulanan & saldo harian
 * Prinsip utama: arah debit/kredit diverifikasi dengan selisih saldo berjalan,
 * sehingga hasil tetap akurat walau format kolom tiap bank berbeda.
 */
'use strict';
(function () {
  const { parseAmount, parseDate, MONTHS, MONTH_RE, isoDate, addDays, daysBetween, monthKey, daysInMonth } = App;

  const TOL = 0.51; // toleransi selisih saldo (Rp)

  /* ---------------------------- Pola teks ---------------------------- */
  const RE_AMOUNT = /^\(?-?(?:RP\.?)?(?:\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+[.,]\d{2})\)?-?(?:CR|DB|DR|D|K|C)?\.?$/i;
  const RE_MARKER = /^(CR|DB|DR|D|K|C|CREDIT|DEBIT)\.?$/i;
  const RE_OPENING = /SALDO\s*AWAL|SALDO\s*SEBELUMNYA|SALDO\s*LALU|SALDO\s*PEMBUKAAN|OPENING\s*BAL|BEGINNING\s*BAL|PREVIOUS\s*BAL|BALANCE\s*(B\/F|FORWARD|BROUGHT)|SALDO\s*BULAN\s*LALU/i;
  const RE_CLOSING = /SALDO\s*AKHIR|CLOSING\s*BAL|ENDING\s*BAL|SALDO\s*PENUTUP/i;
  const RE_SUMMARY = /^(TOTAL|JUMLAH|SUB\s*TOTAL)\b|TOTAL\s*MUTASI|MUTASI\s*(CR|DB|DEBET|DEBIT|KREDIT|CREDIT)\s*[:\d]|SALDO\s*RATA|AVERAGE\s*BAL|TOTAL\s*(DEBET|DEBIT|KREDIT|CREDIT)|^(DEBET|KREDIT)\s*:|BERSAMBUNG|HALAMAN\s*\d|PAGE\s*\d+\s*(OF|DARI)|^\d+\s*(\/|DARI|OF)\s*\d+$/i;
  const HEADER_KW = [
    ['date', /^(TANGGAL|TGL\.?|DATE|POST(ING)?)$/i],
    ['desc', /^(KETERANGAN|URAIAN|DESKRIPSI|DESCRIPTION|REMARKS?|TRANSAKSI|NARASI|DETAIL)$/i],
    ['debit', /^(DEBET|DEBIT|DB|PENARIKAN|WITHDRAWALS?)$/i],
    ['credit', /^(KREDIT|CREDIT|CR|SETORAN|DEPOSITS?)$/i],
    ['saldo', /^(SALDO|BALANCE)$/i],
    ['mutasi', /^(MUTASI|AMOUNT|JUMLAH|NOMINAL)$/i],
  ];
  const BANKS = ['BCA', 'MANDIRI', 'BRI', 'BNI', 'BSI', 'BTN', 'CIMB', 'DANAMON', 'PERMATA', 'OCBC', 'MAYBANK', 'PANIN', 'MEGA', 'BJB', 'BUKOPIN', 'KB BANK', 'SINARMAS', 'UOB', 'HSBC', 'DBS', 'JAGO', 'SEABANK', 'BANK DKI', 'BPD', 'JATIM', 'JATENG', 'MUAMALAT', 'NOBU', 'SAQU', 'BLU'];

  function isAmountTok(t) { return RE_AMOUNT.test(t.replace(/^RP/i, '')); }
  function markerOf(t) {
    const m = t.match(RE_MARKER);
    if (!m) return null;
    const v = m[1].toUpperCase();
    return (v === 'CR' || v === 'K' || v === 'C' || v === 'CREDIT') ? 'CR' : 'DB';
  }

  /* ---------------------------- Deteksi metadata ---------------------------- */
  function detectDecimal(allText) {
    const en = (allText.match(/\d{1,3}(?:,\d{3})+\.\d{2}\b/g) || []).length;
    const id = (allText.match(/\d{1,3}(?:\.\d{3})+,\d{2}\b/g) || []).length;
    if (en === 0 && id === 0) {
      const en2 = (allText.match(/\b\d+\.\d{2}\b/g) || []).length;
      const id2 = (allText.match(/\b\d+,\d{2}\b/g) || []).length;
      return id2 > en2 ? ',' : '.';
    }
    return id > en ? ',' : '.';
  }
  function detectDateOrder(lines) {
    let dmy = 0, mdy = 0;
    for (const l of lines) {
      const m = l.text.match(/^(?:\d{1,4}\.?\s+)?(\d{1,2})[/.-](\d{1,2})\b/);
      if (!m) continue;
      if (+m[1] > 12) dmy++;
      if (+m[2] > 12) mdy++;
    }
    return mdy > dmy ? 'mdy' : 'dmy';
  }
  function detectYear(lines) {
    const periodYears = [], all = {};
    lines.slice(0, 80).forEach((l) => {
      const ys = (l.text.match(/\b(20\d{2})\b/g) || []).map(Number);
      if (/PERIOD/i.test(l.text)) periodYears.push(...ys);
      ys.forEach((y) => { all[y] = (all[y] || 0) + 1; });
    });
    if (periodYears.length) return Math.min(...periodYears);
    const best = Object.entries(all).sort((a, b) => b[1] - a[1])[0];
    return best ? +best[0] : new Date().getFullYear();
  }
  function detectMeta(lines, opts) {
    const meta = { bank: '', accountNo: '', holder: '', period: null };
    const head = lines.slice(0, 60);
    const joined = head.map((l) => l.text).join('\n').toUpperCase();
    for (const b of BANKS) {
      if (new RegExp('\\b' + b.replace(' ', '\\s+') + '\\b').test(joined)) { meta.bank = b; break; }
    }
    if (!meta.bank && /CENTRAL ASIA/.test(joined)) meta.bank = 'BCA';
    if (!meta.bank && /RAKYAT INDONESIA/.test(joined)) meta.bank = 'BRI';
    let m = joined.match(/(?:NO\.?|NOMOR|NOMER)\s*(?:REKENING|REK\.?|ACCOUNT|A\/C)\s*[:.]?\s*([\d][\d\-. ]{5,24}\d)/) ||
      joined.match(/ACCOUNT\s*(?:NO\.?|NUMBER)\s*[:.]?\s*([\d][\d\-. ]{5,24}\d)/) ||
      joined.match(/REKENING\s*[:.]\s*([\d][\d\-. ]{5,24}\d)/);
    if (m) meta.accountNo = m[1].replace(/[^\d]/g, '');
    m = joined.match(/(?:^|\n)\s*(?:NAMA(?:\s*NASABAH)?|NAME|ACCOUNT\s*NAME)\s*[:.]\s*([^\n]{3,60})/);
    if (m) meta.holder = m[1].replace(/\s{2,}.*$/, '').trim();
    // Periode
    for (const l of head) {
      const t = l.text.toUpperCase();
      if (!/PERIOD/.test(t)) continue;
      const ds = [];
      const reFull = new RegExp('(\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\s*' + MONTH_RE + '\\s*\\d{4})', 'g');
      let mm;
      while ((mm = reFull.exec(t))) { const d = parseDate(mm[1], { order: opts.order }); if (d) ds.push(d); }
      if (ds.length >= 2) { meta.period = { start: ds[0], end: ds[ds.length - 1] }; break; }
      const mo = t.match(new RegExp(MONTH_RE + '\\s*(\\d{4})'));
      if (mo) {
        const mon = MONTHS[mo[1]], y = +mo[2];
        meta.period = { start: isoDate(y, mon, 1), end: isoDate(y, mon, daysInMonth(y, mon)) };
        const mo2 = t.slice(mo.index + mo[0].length).match(new RegExp(MONTH_RE + '\\s*(\\d{4})'));
        if (mo2) { const m2 = MONTHS[mo2[1]], y2 = +mo2[2]; meta.period.end = isoDate(y2, m2, daysInMonth(y2, m2)); }
        break;
      }
    }
    return meta;
  }

  /* ---------------------------- Tanggal di awal baris ---------------------------- */
  const RE_LEAD_DATES = [
    /^(\d{4})-(\d{2})-(\d{2})/,
    /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/,
    new RegExp('^(\\d{1,2})[\\s\\-/.]?' + MONTH_RE + '(?:[\\s\\-/.,]?(\\d{4}|\\d{2}(?!\\d)))?'),
    /^(\d{1,2})[/-](\d{1,2})(?![/.-]?\d)/,
  ];
  function matchDateAt(s, opts) {
    for (let i = 0; i < RE_LEAD_DATES.length; i++) {
      const m = s.match(RE_LEAD_DATES[i]);
      if (!m) continue;
      let d = null;
      if (i === 0) d = isoDate(+m[1], +m[2], +m[3]);
      else if (i === 1) d = parseDate(m[0], { order: opts.order });
      else if (i === 2) d = (m[3] || opts.year) ? isoDate(m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : opts.year, MONTHS[m[2]], +m[1]) : null;
      else d = parseDate(m[0], { order: opts.order, defaultYear: opts.year });
      if (d) return { date: d, len: m[0].length, hasYear: i !== 3 && !(i === 2 && !m[3]) };
    }
    return null;
  }
  /** Cari tanggal di token awal baris. Mengembalikan { date, consumed, hasYear } atau null. */
  function leadingDate(tokens, opts) {
    let start = 0;
    for (const skip of [0, 1]) {
      if (skip && !(tokens.length > 2 && /^\d{1,4}\.?$/.test(tokens[0].t))) continue;
      start = skip;
      const take = tokens.slice(start, start + 4);
      let s = '';
      const ends = [];
      take.forEach((t, i) => { s += (i ? ' ' : '') + t.t.toUpperCase(); ends.push(s.length); });
      const md = matchDateAt(s, opts);
      if (!md) continue;
      let consumed = ends.findIndex((e) => e >= md.len) + 1;
      if (consumed === 0) consumed = take.length;
      if (ends[consumed - 1] !== md.len && ends[consumed - 1] > md.len) {
        // tanggal menempel dengan kata berikutnya, mis. "01/01TRSF" — pisahkan
        const tok = tokens[start + consumed - 1];
        const cut = md.len - (consumed > 1 ? ends[consumed - 2] + 1 : 0);
        if (/^\d/.test(tok.t.slice(cut))) continue; // bagian dari angka lain, bukan tanggal
        tokens.splice(start + consumed, 0, { t: tok.t.slice(cut), x0: tok.x0, x1: tok.x1 });
      }
      let idx = start + consumed;
      // lewati tanggal kedua (tanggal valuta) dan jam
      for (let k = 0; k < 2 && idx < tokens.length; k++) {
        const t = tokens[idx].t.toUpperCase();
        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) { idx++; continue; }
        const md2 = matchDateAt(t, opts);
        if (md2 && md2.len === t.length) { idx++; continue; }
        break;
      }
      return { date: md.date, consumed: idx, hasYear: md.hasYear };
    }
    return null;
  }

  /** Ambil nominal di ujung kanan baris. */
  function trailingAmounts(tokens, from, dec) {
    const amounts = [];
    let i = tokens.length - 1, pending = null;
    while (i >= from) {
      const t = tokens[i].t;
      const mk = markerOf(t);
      if (mk && i > from && isAmountTok(tokens[i - 1].t)) { pending = mk; i--; continue; }
      if (isAmountTok(t)) {
        const p = parseAmount(t, dec);
        if (!p) break;
        amounts.unshift({ value: p.value, marker: pending || p.marker, x0: tokens[i].x0, x1: tokens[i].x1 });
        pending = null;
        i--;
        continue;
      }
      if ((t === '-' || t === '0' || t === '0,00' || t === '0.00') && amounts.length > 0 && amounts.length < 3) {
        amounts.unshift({ value: 0, marker: null, placeholder: true, x0: tokens[i].x0, x1: tokens[i].x1 });
        i--;
        continue;
      }
      break;
    }
    // placeholder di paling kiri tanpa nominal berarti setelahnya tidak relevan
    while (amounts.length && amounts[0].placeholder && amounts.length === 1) amounts.shift();
    return { amounts, descEnd: i + 1 };
  }

  function headerColumns(tokens) {
    const found = {};
    for (const tok of tokens) {
      const t = tok.t.replace(/[:.]/g, '');
      for (const [key, re] of HEADER_KW) {
        if (re.test(t) && found[key] == null) found[key] = { cx: (tok.x0 + tok.x1) / 2, x1: tok.x1 };
      }
    }
    return found;
  }
  function isHeaderLine(text) {
    let n = 0;
    const T = text.toUpperCase();
    if (/\b(TANGGAL|TGL|DATE)\b/.test(T)) n++;
    if (/\b(KETERANGAN|URAIAN|DESKRIPSI|DESCRIPTION|REMARKS?|TRANSAKSI)\b/.test(T)) n++;
    if (/\b(DEBET|DEBIT)\b/.test(T)) n++;
    if (/\b(KREDIT|CREDIT)\b/.test(T)) n++;
    if (/\b(SALDO|BALANCE)\b/.test(T)) n++;
    if (/\bMUTASI\b/.test(T)) n++;
    return n >= 3 || (n >= 2 && T.length < 90 && !/\d{1,3}[.,]\d{3}/.test(T));
  }

  const KW_CR_GUESS = /SETOR|TRANSFER MASUK|TRF MASUK|TRSF.*CR|\bCR\b|KLIRING MASUK|INCOMING|BUNGA|JASA GIRO|DARI\b|PENERIMAAN|INKASO/i;
  const KW_DB_GUESS = /TARIK|BIAYA|\bADM|PAJAK|TRANSFER KE|TRF KE|\bKE\b|PEMBAYARAN|PAYMENT|DEBET|\bDB\b|CHARGE|FEE|PEMBELIAN|OUTGOING/i;

  /**
   * Parse baris teks (PDF/OCR/teks) menjadi transaksi.
   * lines: [{ text, tokens:[{t,x0,x1}], page? }]
   */
  /** Rapikan salah baca OCR pada angka: "1.000,.00" → "1.000,00", "1O.5OO,00" → "10.500,00". */
  function normTok(t) {
    let s = t.replace(/(\d)[.,]{2,}(?=\d)/g, (m, d) => d + m[1]);
    if (/^[\dOoIl.,]+(CR|DB|D|K)?$/.test(s) && (s.match(/\d/g) || []).length >= 3 && /[.,]/.test(s)) s = s.replace(/[Oo]/g, '0').replace(/[Il]/g, '1');
    return s;
  }
  function parseLines(lines, userOpts = {}) {
    lines = lines.map((l) => ({ ...l, tokens: (l.tokens && l.tokens.length ? l.tokens : l.text.split(/\s+/).filter(Boolean).map((t) => ({ t, x0: null, x1: null }))).map((t) => ({ ...t, t: normTok(t.t) })) }));
    const allText = lines.map((l) => l.text).join('\n');
    const opts = {
      dec: userOpts.decimal || detectDecimal(allText),
      order: detectDateOrder(lines),
      year: userOpts.year || detectYear(lines),
    };
    const meta = detectMeta(lines, opts);
    const txns = [];
    const warnings = [];
    let cols = null, opening = null, closingStated = null, cur = null, ended = true, lastPage = null, lastMonth = null, yearShift = 0;

    for (const line of lines) {
      const tokens = line.tokens;
      if (!tokens.length) continue;
      const text = tokens.map((t) => t.t).join(' ');
      const T = text.toUpperCase();
      if (line.page != null && line.page !== lastPage) { ended = true; lastPage = line.page; }

      const ld = leadingDate(tokens, { order: opts.order, year: opts.year + yearShift });
      if (!ld && isHeaderLine(text) && !/\d{1,3}[.,]\d{3}[.,]\d/.test(text)) {
        const hc = headerColumns(tokens);
        if (hc.debit && hc.credit && hc.debit.cx != null && !isNaN(hc.debit.cx)) cols = hc;
        ended = true;
        continue;
      }

      const startIdx = ld ? ld.consumed : 0;
      const { amounts, descEnd } = trailingAmounts(tokens, startIdx, opts.dec);
      const descTokens = tokens.slice(startIdx, descEnd).map((t) => t.t);
      const desc = descTokens.join(' ').trim();

      if (RE_OPENING.test(T) && amounts.length) {
        if (opening == null && txns.length === 0) {
          const a = amounts[amounts.length - 1];
          opening = a.marker === 'DB' ? -Math.abs(a.value) : a.value;
        }
        ended = true;
        continue;
      }
      if (RE_CLOSING.test(T)) {
        if (amounts.length) { const a = amounts[amounts.length - 1]; closingStated = a.marker === 'DB' ? -Math.abs(a.value) : a.value; }
        ended = true;
        continue;
      }
      if (RE_SUMMARY.test(T.trim()) && !ld) { ended = true; continue; }

      let date = ld ? ld.date : null;
      if (date && ld && !ld.hasYear) {
        // rollover tahun (mis. Desember → Januari) untuk tanggal tanpa tahun
        const mon = +date.slice(5, 7);
        if (lastMonth != null && mon < lastMonth - 6) { yearShift++; date = (opts.year + yearShift) + date.slice(4); }
        lastMonth = +date.slice(5, 7);
      } else if (date) lastMonth = +date.slice(5, 7);

      const hasMarker = amounts.some((a) => a.marker);
      const looksTxn = amounts.length >= 1 && (date || (cur && (amounts.length >= 2 || hasMarker)));
      if (looksTxn) {
        const pend = cur && cur.pendingAmount && !date ? cur : null;
        const tx = buildTxn(date || cur.date, pend ? (pend.desc + ' ' + desc).trim() : desc, amounts, cols, line.page);
        if (!tx) { ended = true; continue; }
        txns.push(tx);
        cur = tx;
        ended = false;
        continue;
      }
      if (date && amounts.length === 0 && desc) {
        // baris bertanggal tanpa nominal: keterangan, nominal mungkin di baris berikutnya
        cur = { date, desc, page: line.page, pendingAmount: true };
        ended = false;
        continue;
      }
      if (cur && !ended && text && cur.desc.length < 300) cur.desc = (cur.desc + ' ' + text).trim();
    }

    // Urutan terbaru-di-atas → balik agar kronologis.
    if (txns.length > 1 && txns[0].date > txns[txns.length - 1].date) txns.reverse();
    // Tentukan arah (debit/kredit) dengan saldo berjalan.
    resolveDirections(txns, opening);
    if (!txns.length) warnings.push('Tidak ada baris transaksi yang dikenali.');
    return { meta, opening, closingStated, txns, warnings, decimal: opts.dec, year: opts.year, source: 'text' };
  }

  function buildTxn(date, desc, amounts, cols, page) {
    const tx = { date, desc: desc || '(tanpa keterangan)', debit: 0, credit: 0, balance: null, page, cands: null, review: [] };
    const real = amounts;
    // 1) Penempatan berdasarkan posisi kolom header (Debit | Kredit | Saldo)
    if (cols && real.every((a) => a.x0 != null) && real.length >= 2) {
      const assign = {};
      let ok = true;
      for (const a of real) {
        const cx = (a.x0 + a.x1) / 2;
        let best = null, bd = Infinity;
        for (const key of ['debit', 'credit', 'saldo']) {
          if (!cols[key]) continue;
          const d = Math.min(Math.abs(cx - cols[key].cx), Math.abs(a.x1 - cols[key].x1));
          if (d < bd) { bd = d; best = key; }
        }
        if (!best || assign[best]) { ok = false; break; }
        assign[best] = a;
      }
      if (ok && assign.saldo && (assign.debit || assign.credit)) {
        tx.debit = assign.debit ? Math.abs(assign.debit.value) : 0;
        tx.credit = assign.credit ? Math.abs(assign.credit.value) : 0;
        tx.balance = signedBalance(assign.saldo);
        tx.dirSource = 'kolom';
        tx.cands = [[tx.debit, tx.credit], [tx.credit, tx.debit]];
        return tx;
      }
    }
    // 2) Posisi urutan
    const vals = real;
    if (vals.length === 1) {
      const a = vals[0];
      tx.amount = Math.abs(a.value);
      if (a.marker) { tx.dir = a.marker; tx.dirSource = 'penanda'; } else if (a.value < 0) { tx.dir = 'DB'; tx.dirSource = 'tanda minus'; }
    } else if (vals.length === 2) {
      const a = vals[0];
      tx.amount = Math.abs(a.value);
      tx.balance = signedBalance(vals[1]);
      if (a.marker) { tx.dir = a.marker; tx.dirSource = 'penanda'; } else if (a.value < 0) { tx.dir = 'DB'; tx.dirSource = 'tanda minus'; }
    } else {
      const [d, c, s] = vals.slice(-3);
      tx.balance = signedBalance(s);
      tx.cands = [[Math.abs(d.value), Math.abs(c.value)], [Math.abs(c.value), Math.abs(d.value)]];
      [tx.debit, tx.credit] = tx.cands[0];
      tx.dirSource = 'kolom';
    }
    if (tx.amount != null && tx.amount === 0 && tx.balance == null) return null;
    return tx;
  }
  function signedBalance(a) {
    if (!a) return null;
    if (a.marker === 'DB') return -Math.abs(a.value);
    return a.value;
  }

  function resolveDirections(txns, opening) {
    let prev = opening;
    for (let i = 0; i < txns.length; i++) {
      const tx = txns[i];
      delete tx.pendingAmount;
      if (tx.amount != null) {
        const amt = tx.amount;
        if (tx.dir) {
          // penanda eksplisit; cek konsistensi dengan saldo
          if (prev != null && tx.balance != null) {
            const expCr = prev + amt, expDb = prev - amt;
            if (tx.dir === 'CR' && Math.abs(expCr - tx.balance) > TOL && Math.abs(expDb - tx.balance) <= TOL) { tx.dir = 'DB'; tx.dirSource = 'saldo'; }
            if (tx.dir === 'DB' && Math.abs(expDb - tx.balance) > TOL && Math.abs(expCr - tx.balance) <= TOL) { tx.dir = 'CR'; tx.dirSource = 'saldo'; }
          }
        } else if (prev != null && tx.balance != null) {
          if (Math.abs(prev + amt - tx.balance) <= TOL) { tx.dir = 'CR'; tx.dirSource = 'saldo'; } else if (Math.abs(prev - amt - tx.balance) <= TOL) { tx.dir = 'DB'; tx.dirSource = 'saldo'; }
        }
        if (!tx.dir && tx.balance != null && i + 1 < txns.length && prev == null) {
          // transaksi pertama tanpa saldo awal: tidak bisa diverifikasi
        }
        if (!tx.dir) {
          const cr = KW_CR_GUESS.test(tx.desc), db = KW_DB_GUESS.test(tx.desc);
          tx.dir = db && !cr ? 'DB' : 'CR';
          tx.dirSource = 'tebakan';
          tx.review.push('arah debit/kredit ditebak dari keterangan');
        }
        tx.debit = tx.dir === 'DB' ? amt : 0;
        tx.credit = tx.dir === 'CR' ? amt : 0;
        delete tx.amount;
        delete tx.dir;
      } else if (tx.cands && prev != null && tx.balance != null) {
        const [d1, c1] = tx.cands[0];
        if (Math.abs(prev - d1 + c1 - tx.balance) > TOL) {
          const [d2, c2] = tx.cands[1];
          if (Math.abs(prev - d2 + c2 - tx.balance) <= TOL) { tx.debit = d2; tx.credit = c2; tx.dirSource = 'saldo'; }
        }
      }
      delete tx.cands;
      if (tx.balance != null) prev = tx.balance;
      else if (prev != null) prev = prev + tx.credit - tx.debit;
    }
  }

  /* ---------------------------- Tabel (CSV/Excel) ---------------------------- */
  const MAP_FIELDS = [
    ['date', 'Tanggal', /^(TANGGAL|TGL|DATE|POST|TRANSACTION DATE|TANGGAL TRANSAKSI|TRX DATE|VALUE DATE)/],
    ['desc', 'Keterangan', /(KETERANGAN|URAIAN|DESKRIPSI|DESCRIPTION|REMARK|NARASI|DETAIL|TRANSAKSI|BERITA)/],
    ['debit', 'Debit', /^(DEBET|DEBIT|DB|MUTASI DEBET|MUTASI DEBIT|PENARIKAN|WITHDRAWAL|KELUAR|DR)\b/],
    ['credit', 'Kredit', /^(KREDIT|CREDIT|CR|MUTASI KREDIT|SETORAN|DEPOSIT|MASUK)\b/],
    ['amount', 'Nominal (satu kolom)', /^(MUTASI|AMOUNT|JUMLAH|NOMINAL|NILAI)$/],
    ['dk', 'Kolom D/K', /^(D\/K|DB\/CR|D\/C|CR\/DB|DK|TIPE|TYPE|JENIS|DC)$/],
    ['balance', 'Saldo', /(SALDO|BALANCE)/],
  ];
  function findHeaderRow(rows) {
    let best = -1, bestScore = 0;
    for (let r = 0; r < Math.min(rows.length, 40); r++) {
      const row = rows[r] || [];
      let score = 0;
      const seen = new Set();
      row.forEach((c) => {
        const t = String(c == null ? '' : c).trim().toUpperCase();
        if (!t || t.length > 40) return;
        MAP_FIELDS.forEach(([key, , re]) => { if (re.test(t) && !seen.has(key)) { seen.add(key); score++; } });
      });
      if (score > bestScore) { best = r; bestScore = score; }
    }
    return bestScore >= 2 ? best : -1;
  }
  function detectMapping(rows) {
    const hr = findHeaderRow(rows);
    if (hr < 0) return null;
    const header = rows[hr].map((c) => String(c == null ? '' : c).trim());
    const map = { headerRow: hr };
    const used = new Set();
    MAP_FIELDS.forEach(([key, , re]) => {
      const idx = header.findIndex((h, i) => re.test(h.toUpperCase()) && !used.has(i));
      map[key] = idx;
      if (idx >= 0) used.add(idx);
    });
    if (map.debit >= 0 || map.credit >= 0) map.amount = -1;
    return { header, map };
  }
  function parseTable(rows, map, userOpts = {}) {
    const hr = map.headerRow;
    const body = rows.slice(hr + 1);
    const sample = body.slice(0, 200).map((r) => r.map((c) => (typeof c === 'string' ? c : '')).join(' ')).join('\n');
    const dec = userOpts.decimal || detectDecimal(sample);
    const dateLines = body.slice(0, 200).map((r) => ({ text: String(r[map.date] == null ? '' : r[map.date]) }));
    const order = detectDateOrder(dateLines);
    const year = userOpts.year || detectYear(rows.slice(0, hr + 1).map((r) => ({ text: r.join(' ') }))) || new Date().getFullYear();
    const num = (v) => {
      if (v == null || v === '') return null;
      const p = parseAmount(typeof v === 'number' ? v : String(v), dec);
      return p;
    };
    const txns = [];
    let opening = null;
    for (const r of body) {
      if (!r || !r.length) continue;
      const desc = map.desc >= 0 ? String(r[map.desc] == null ? '' : r[map.desc]).trim() : '';
      const date = parseDate(r[map.date], { order, defaultYear: year });
      const bal = map.balance >= 0 ? num(r[map.balance]) : null;
      if (!date) {
        if (RE_OPENING.test(desc + ' ' + String(r[map.date] || '')) && bal) opening = bal.marker === 'DB' ? -Math.abs(bal.value) : bal.value;
        continue;
      }
      if (RE_OPENING.test(desc) && bal && txns.length === 0) { opening = bal.marker === 'DB' ? -Math.abs(bal.value) : bal.value; continue; }
      const tx = { date, desc: desc || '(tanpa keterangan)', debit: 0, credit: 0, balance: bal ? (bal.marker === 'DB' ? -Math.abs(bal.value) : bal.value) : null, review: [] };
      if (map.debit >= 0 || map.credit >= 0) {
        const d = map.debit >= 0 ? num(r[map.debit]) : null;
        const c = map.credit >= 0 ? num(r[map.credit]) : null;
        tx.debit = d ? Math.abs(d.value) : 0;
        tx.credit = c ? Math.abs(c.value) : 0;
        tx.dirSource = 'kolom';
        if (map.debit >= 0 && map.credit < 0 && d && d.value > 0 && d.marker === 'CR') { tx.credit = tx.debit; tx.debit = 0; }
      } else if (map.amount >= 0) {
        const a = num(r[map.amount]);
        if (!a) continue;
        tx.amount = Math.abs(a.value);
        let dir = null;
        if (map.dk >= 0) {
          const v = String(r[map.dk] || '').trim().toUpperCase();
          if (/^(D|DB|DR|DEBET|DEBIT|-)/.test(v)) dir = 'DB';
          else if (/^(K|C|CR|KREDIT|CREDIT|\+)/.test(v)) dir = 'CR';
        }
        if (!dir && a.marker) dir = a.marker;
        if (!dir && a.value < 0) dir = 'DB';
        if (dir) { tx.dir = dir; tx.dirSource = map.dk >= 0 ? 'kolom D/K' : 'penanda'; }
      } else continue;
      if (tx.debit === 0 && tx.credit === 0 && tx.amount == null) continue;
      txns.push(tx);
    }
    if (txns.length > 1 && txns[0].date > txns[txns.length - 1].date) txns.reverse();
    resolveDirections(txns, opening);
    return { meta: { bank: '', accountNo: '', holder: '', period: null }, opening, closingStated: null, txns, warnings: txns.length ? [] : ['Tidak ada baris transaksi yang dikenali.'], decimal: dec, year, source: 'table' };
  }

  /* ---------------------------- Analisis ---------------------------- */
  function hasAny(textU, list) { return list.find((k) => k && textU.includes(k.toUpperCase())); }

  function autoCategory(tx, kw) {
    const d = tx.desc.toUpperCase();
    if (tx.credit > 0) {
      if (hasAny(d, kw.koreksi)) return 'Koreksi/Reversal';
      if (hasAny(d, kw.bunga)) return 'Bunga/Jasa Giro';
      if (hasAny(d, kw.cair)) return 'Pencairan Kredit';
      if (/SETOR|SETORAN|CASH DEPOSIT|\bCDM\b|TUNAI/.test(d)) return 'Setoran Tunai';
      if (/TRSF|TRANSFER|\bTRF\b|KLIRING|RTGS|\bSKN\b|BI[- ]?FAST|\bLLG\b|INCOMING|TRANSFER MASUK|INKASO|PB\b|PINDAH/.test(d)) return 'Transfer/Kliring Masuk';
      return 'Kredit Lainnya';
    }
    if (/PAJAK|\bTAX\b|\bPPH\b|\bPPN\b/.test(d)) return 'Pajak';
    if (/BIAYA|\bADM|ADMIN|CHARGE|\bFEE\b|PROVISI|MATERAI|METERAI|IURAN/.test(d)) return 'Biaya Bank';
    if (/ANGSURAN|CICILAN|BUNGA PINJAMAN|ANGS\b|LOAN REPAY|PEMBAYARAN KREDIT|PEMBAYARAN PINJAMAN/.test(d)) return 'Angsuran Pinjaman';
    if (/TARIK|TARIKAN|PENARIKAN|\bATM\b|CASH WITHDRAWAL|TUNAI/.test(d)) return 'Tarik Tunai';
    if (/TRSF|TRANSFER|\bTRF\b|KLIRING|RTGS|\bSKN\b|BI[- ]?FAST|\bLLG\b|PEMBAYARAN|PAYMENT|DEBET|PEMBELIAN|PURCHASE|PB\b|PINDAH/.test(d)) return 'Transfer/Pembayaran Keluar';
    return 'Debit Lainnya';
  }
  const CATEGORIES_CR = ['Transfer/Kliring Masuk', 'Setoran Tunai', 'Kredit Lainnya', 'Bunga/Jasa Giro', 'Pencairan Kredit', 'Koreksi/Reversal'];
  const CATEGORIES_DB = ['Transfer/Pembayaran Keluar', 'Tarik Tunai', 'Angsuran Pinjaman', 'Biaya Bank', 'Pajak', 'Debit Lainnya'];
  const NON_OMZET = new Set(['Bunga/Jasa Giro', 'Pencairan Kredit', 'Koreksi/Reversal']);

  /**
   * accounts: [{ id, label, opening, txns, period }]
   * opts: { own: [string], windowDays, pairSame, kw }
   * Menulis tx.autoCat, tx.autoContra, tx.contraReason, tx.flags; menghasilkan ringkasan.
   */
  function analyze(accounts, opts) {
    const kw = opts.kw;
    const own = (opts.own || []).map((s) => s.trim().toUpperCase()).filter((s) => s.length >= 4);
    const ownDigits = own.map((s) => s.replace(/\D/g, '')).filter((s) => s.length >= 6);
    const all = [];
    for (const acc of accounts) {
      reconcile(acc);
      acc.txns.forEach((tx, i) => {
        tx.acc = acc.id;
        tx.idx = i;
        tx.autoCat = autoCategory(tx, kw);
        tx.autoContra = false;
        tx.contraReason = '';
        tx.flags = (tx.review || []).slice();
        if (tx.mismatch) tx.flags.push('saldo tidak cocok dengan baris sebelumnya — cek baris hilang/terbaca salah (selisih saldo: ' + App.fmt(tx.suggest, 2) + ')');
        const d = tx.desc.toUpperCase();
        const hit = own.find((o) => d.includes(o));
        const dDigits = d.replace(/\D/g, '');
        const hitNo = !hit && ownDigits.find((o) => dDigits.includes(o));
        if (hit || hitNo) { tx.autoContra = true; tx.contraReason = 'memuat nama/rekening sendiri: ' + (hit || hitNo); }
        const k = hasAny(d, kw.contra);
        if (k && !tx.autoContra) tx.flags.push('kata kunci "' + k + '" — cek apakah antar rekening sendiri');
        all.push(tx);
      });
    }
    // Pencocokan pasangan contra: nilai sama, arah berlawanan, dalam jendela hari.
    const win = Math.max(0, +opts.windowDays || 0);
    const used = new Set();
    const credits = all.filter((t) => t.credit > 0), debits = all.filter((t) => t.debit > 0);
    const byAmt = new Map();
    debits.forEach((t) => { const k = Math.round(t.debit); if (!byAmt.has(k)) byAmt.set(k, []); byAmt.get(k).push(t); });
    for (const pass of ['cross', 'same']) {
      for (const c of credits) {
        if (used.has(c)) continue;
        const list = byAmt.get(Math.round(c.credit)) || [];
        let best = null, bd = Infinity;
        for (const d of list) {
          if (used.has(d)) continue;
          if (pass === 'cross' ? d.acc === c.acc : d.acc !== c.acc) continue;
          if (pass === 'same' && c.credit < 1000000) continue;
          const dd = Math.abs(daysBetween(c.date, d.date));
          if (dd <= win && dd < bd) { best = d; bd = dd; }
        }
        if (!best) continue;
        used.add(c); used.add(best);
        if (pass === 'cross') {
          const accName = (id) => (accounts.find((a) => a.id === id) || {}).label || id;
          c.autoContra = true; best.autoContra = true;
          c.contraReason = c.contraReason || 'pasangan transfer dari rekening sendiri (' + accName(best.acc) + ')';
          best.contraReason = best.contraReason || 'pasangan transfer ke rekening sendiri (' + accName(c.acc) + ')';
        } else {
          const msg = 'pasangan masuk–keluar bernilai sama dalam ' + win + ' hari (cek window dressing)';
          [c, best].forEach((t) => {
            if (opts.pairSame) { t.autoContra = true; t.contraReason = t.contraReason || msg; } else if (!t.autoContra) t.flags.push(msg);
          });
        }
      }
    }
    return summarize(accounts);
  }

  function effContra(tx) { return tx.userContra != null ? tx.userContra : tx.autoContra; }
  function effCat(tx) { return tx.userCat || tx.autoCat; }

  /** Rekonsiliasi saldo: hitung saldo berjalan & tandai ketidakcocokan. */
  function reconcile(acc) {
    let opening = acc.opening;
    if (opening == null) {
      const f = acc.txns.find((t) => t.balance != null);
      if (f) {
        // turunkan saldo awal dari transaksi pertama yang memiliki saldo
        let bal = f.balance;
        for (let i = acc.txns.indexOf(f); i >= 0; i--) bal = bal - acc.txns[i].credit + acc.txns[i].debit;
        opening = bal;
        acc.openingDerived = true;
      } else opening = acc.openingManual || 0;
    }
    acc.openingUsed = opening;
    let prev = opening, matched = 0, checked = 0;
    acc.txns.forEach((tx) => {
      const exp = prev + tx.credit - tx.debit;
      tx.mismatch = false;
      if (tx.balance != null) {
        checked++;
        if (Math.abs(exp - tx.balance) <= TOL) matched++;
        else { tx.mismatch = true; tx.suggest = Math.abs(tx.balance - prev); }
        prev = tx.balance;
      } else prev = exp;
      tx.runBal = prev;
    });
    acc.check = { matched, checked, hasBalance: checked > 0 };
    acc.closingComputed = prev;
  }

  function periodOf(acc) {
    const t = acc.txns;
    if (!t.length) return null;
    const first = t.reduce((m, x) => (x.date < m ? x.date : m), t[0].date);
    const last = t.reduce((m, x) => (x.date > m ? x.date : m), t[0].date);
    const p = acc.periodOverride || acc.period || {};
    let start = p.start || (acc.opening != null ? first.slice(0, 8) + '01' : first);
    let end = p.end || last;
    if (start > first) start = first;
    if (end < last) end = last;
    return { start, end };
  }

  function emptyMonth(key) {
    return { key, days: 0, fullDays: 0, saldoAwal: null, saldoAkhir: null, sumBal: 0, minBal: Infinity, maxBal: -Infinity,
      crGross: 0, crContra: 0, crNonOmzet: 0, crNet: 0, crCount: 0, crNetCount: 0,
      dbGross: 0, dbContra: 0, dbNet: 0, dbCount: 0, dbNetCount: 0 };
  }
  function addTxToMonth(m, tx) {
    const contra = effContra(tx), cat = effCat(tx);
    if (tx.credit > 0) {
      m.crGross += tx.credit; m.crCount++;
      if (contra) m.crContra += tx.credit;
      else if (NON_OMZET.has(cat)) m.crNonOmzet += tx.credit;
      else { m.crNet += tx.credit; m.crNetCount++; }
    }
    if (tx.debit > 0) {
      m.dbGross += tx.debit; m.dbCount++;
      if (contra) m.dbContra += tx.debit; else { m.dbNet += tx.debit; m.dbNetCount++; }
    }
  }

  function summarizeAccount(acc) {
    const period = periodOf(acc);
    const months = new Map();
    const daily = new Map();
    if (!period) return { id: acc.id, label: acc.label, months: [], daily, period: null };
    const byDate = new Map();
    acc.txns.forEach((tx) => { if (!byDate.has(tx.date)) byDate.set(tx.date, []); byDate.get(tx.date).push(tx); });
    let bal = acc.openingUsed;
    let d = period.start;
    const nDays = daysBetween(period.start, period.end);
    for (let i = 0; i <= nDays; i++) {
      const k = monthKey(d);
      if (!months.has(k)) { const m = emptyMonth(k); m.saldoAwal = bal; months.set(k, m); }
      const m = months.get(k);
      const list = byDate.get(d);
      if (list) { list.forEach((tx) => addTxToMonth(m, tx)); bal = list[list.length - 1].runBal; }
      daily.set(d, bal);
      m.days++; m.sumBal += bal; m.minBal = Math.min(m.minBal, bal); m.maxBal = Math.max(m.maxBal, bal); m.saldoAkhir = bal;
      d = addDays(d, 1);
    }
    for (const m of months.values()) {
      const [y, mo] = m.key.split('-').map(Number);
      m.fullDays = daysInMonth(y, mo);
      m.adb = m.days ? m.sumBal / m.days : 0;
    }
    return { id: acc.id, label: acc.label, months: Array.from(months.values()), daily, period };
  }

  function combine(list) {
    const months = new Map();
    const daily = new Map();
    for (const s of list) {
      for (const m of s.months) {
        if (!months.has(m.key)) months.set(m.key, Object.assign(emptyMonth(m.key), { saldoAwal: 0, saldoAkhir: 0, fullDays: m.fullDays }));
        const c = months.get(m.key);
        ['crGross', 'crContra', 'crNonOmzet', 'crNet', 'crCount', 'crNetCount', 'dbGross', 'dbContra', 'dbNet', 'dbCount', 'dbNetCount', 'saldoAwal', 'saldoAkhir'].forEach((f) => { c[f] += m[f] || 0; });
        c.days = Math.max(c.days, m.days);
      }
      for (const [d, b] of s.daily) daily.set(d, (daily.get(d) || 0) + b);
    }
    for (const c of months.values()) {
      let sum = 0, n = 0, mn = Infinity, mx = -Infinity;
      for (const [d, b] of daily) if (d.startsWith(c.key)) { sum += b; n++; mn = Math.min(mn, b); mx = Math.max(mx, b); }
      c.adb = n ? sum / n : 0; c.minBal = mn; c.maxBal = mx; c.days = n;
    }
    const arr = Array.from(months.values()).sort((a, b) => a.key.localeCompare(b.key));
    return { id: '__all', label: 'Gabungan semua rekening', months: arr, daily };
  }

  function totals(s) {
    const ms = s.months;
    const full = ms.filter((m) => m.days >= m.fullDays);
    const base = full.length ? full : ms;
    const avg = (f) => (base.length ? base.reduce((a, m) => a + m[f], 0) / base.length : 0);
    let sum = 0, n = 0;
    for (const b of s.daily.values()) { sum += b; n++; }
    const tot = (f) => ms.reduce((a, m) => a + m[f], 0);
    return {
      monthsAll: ms.length, monthsUsed: base.length, usedFullOnly: full.length > 0 && full.length < ms.length,
      avgCrNet: avg('crNet'), avgDbNet: avg('dbNet'), avgCrGross: avg('crGross'), adb: n ? sum / n : 0,
      crGross: tot('crGross'), crContra: tot('crContra'), crNonOmzet: tot('crNonOmzet'), crNet: tot('crNet'),
      dbGross: tot('dbGross'), dbContra: tot('dbContra'), dbNet: tot('dbNet'),
      minBal: Math.min(...ms.map((m) => m.minBal)), maxBal: Math.max(...ms.map((m) => m.maxBal)),
    };
  }

  function summarize(accounts) {
    const per = accounts.map((a) => summarizeAccount(a));
    per.forEach((s) => { s.totals = s.months.length ? totals(s) : null; });
    const combined = combine(per);
    combined.totals = combined.months.length ? totals(combined) : null;
    return { per, combined };
  }

  App.stmt = {
    parseLines, parseTable, detectMapping, MAP_FIELDS, analyze, summarize, reconcile, effContra, effCat,
    CATEGORIES_CR, CATEGORIES_DB, NON_OMZET,
  };
})();
