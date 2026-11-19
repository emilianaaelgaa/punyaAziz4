/* RM SME Toolkit — utilitas bersama (format angka/tanggal, penyimpanan, unduhan, UI kecil) */
'use strict';

const App = window.App = { modules: {} };

/* ---------------------------- DOM helpers ---------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return e;
}

let toastTimer = null;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

function modal(title, bodyNode, buttons = []) {
  return new Promise((resolve) => {
    const bg = el('div', { class: 'modal-bg' });
    const close = (val) => { bg.remove(); resolve(val); };
    const box = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      el('h3', { text: title }), bodyNode,
      el('div', { class: 'row end', style: { marginTop: '16px' } },
        buttons.map((b) => el('button', { class: 'btn ' + (b.cls || ''), onclick: () => close(b.value) }, b.label))));
    bg.appendChild(box);
    bg.addEventListener('click', (e) => { if (e.target === bg) close(null); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(null); }
    });
    document.body.appendChild(bg);
    const first = box.querySelector('input,select,textarea');
    if (first) first.focus();
  });
}
async function confirmBox(msg, okLabel = 'Ya, lanjutkan') {
  const r = await modal('Konfirmasi', el('p', { text: msg }), [
    { label: 'Batal', value: false, cls: 'secondary' }, { label: okLabel, value: true, cls: 'danger' }]);
  return !!r;
}

/* ---------------------------- Penyimpanan lokal ---------------------------- */
const STORE_PREFIX = 'rmsme.';
const store = {
  get(key, def) {
    try {
      const raw = localStorage.getItem(STORE_PREFIX + key);
      return raw == null ? def : JSON.parse(raw);
    } catch (e) { return def; }
  },
  set(key, val) {
    try { localStorage.setItem(STORE_PREFIX + key, JSON.stringify(val)); return true; } catch (e) {
      toast('Gagal menyimpan: penyimpanan browser penuh atau dinonaktifkan.');
      return false;
    }
  },
  remove(key) { try { localStorage.removeItem(STORE_PREFIX + key); } catch (e) { /* abaikan */ } },
  keys() {
    const out = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(STORE_PREFIX)) out.push(k.slice(STORE_PREFIX.length)); } } catch (e) { /* abaikan */ }
    return out;
  },
};

/* ---------------------------- Pengaturan bawaan ---------------------------- */
const DEFAULT_PARAMS = {
  dscr: 1.25,
  porsi: 70,
  round: 1000000,
  bunga: 11,
  ltv: [
    { jenis: 'Tanah & Bangunan (SHM/SHGB)', ltv: 80 },
    { jenis: 'Tanah kosong', ltv: 70 },
    { jenis: 'Kendaraan', ltv: 70 },
    { jenis: 'Mesin & peralatan', ltv: 60 },
    { jenis: 'Persediaan / piutang (fidusia)', ltv: 50 },
    { jenis: 'Deposito / tabungan (cash collateral)', ltv: 95 },
  ],
};
const DEFAULT_KW = {
  contra: ['PINDAH BUKU', 'PINDAHBUKU', 'PEMINDAHBUKUAN', 'OVERBOOK', 'OVERBOOKING', 'OVB', 'BOOK TRANSFER', 'REK SENDIRI', 'REKENING SENDIRI', 'ANTAR REKENING'],
  bunga: ['BUNGA', 'JASA GIRO', 'INTEREST', 'BAGI HASIL', 'BNGA'],
  cair: ['PENCAIRAN', 'DROPPING', 'REALISASI KREDIT', 'REALISASI PINJAMAN', 'LOAN DISB', 'DISBURSEMENT'],
  koreksi: ['KOREKSI', 'REVERSAL', 'REVERSE', 'RETUR', 'REFUND', 'PEMBATALAN', 'CANCEL', 'BATAL'],
};
App.params = () => Object.assign({}, DEFAULT_PARAMS, store.get('params', {}));
App.keywords = () => Object.assign({}, DEFAULT_KW, store.get('keywords', {}));
App.DEFAULT_PARAMS = DEFAULT_PARAMS;
App.DEFAULT_KW = DEFAULT_KW;

/* ---------------------------- Angka ---------------------------- */
const nfCache = {};
function fmt(n, dec = 0) {
  if (n == null || n === '' || isNaN(n)) return '';
  const key = dec;
  nfCache[key] = nfCache[key] || new Intl.NumberFormat('id-ID', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return nfCache[key].format(n);
}
function fmtRp(n, dec = 0) { return (n == null || isNaN(n)) ? '' : 'Rp ' + fmt(n, dec); }
function fmtPct(n, dec = 1) { return (n == null || !isFinite(n)) ? '-' : fmt(n * 100, dec) + '%'; }
function fmtX(n, dec = 2) { return (n == null || !isFinite(n)) ? '-' : fmt(n, dec) + 'x'; }
/** Ringkas: 1,25 M / 350 jt */
function fmtShort(n) {
  if (n == null || isNaN(n)) return '';
  const a = Math.abs(n);
  if (a >= 1e12) return fmt(n / 1e12, 2) + ' T';
  if (a >= 1e9) return fmt(n / 1e9, 2) + ' M';
  if (a >= 1e6) return fmt(n / 1e6, 1) + ' jt';
  if (a >= 1e3) return fmt(n / 1e3, 0) + ' rb';
  return fmt(n, 0);
}

/**
 * Parse angka nominal dari teks rekening koran. Mendukung format Indonesia (1.234.567,89),
 * format internasional (1,234,567.89), tanda minus/kurung, dan akhiran DB/CR/D/K.
 * decimalHint: ',' atau '.' bila format dokumen sudah diketahui.
 * Mengembalikan { value, marker } atau null.
 */
function parseAmount(raw, decimalHint) {
  if (raw == null) return null;
  if (typeof raw === 'number') return isFinite(raw) ? { value: raw, marker: null } : null;
  let s = String(raw).trim().replace(/ /g, ' ');
  if (!s) return null;
  let marker = null;
  const mk = s.match(/\s*(CR|DB|DR|CREDIT|DEBIT|D|K|C)\.?$/i);
  if (mk && /\d/.test(s.slice(0, mk.index))) {
    const m = mk[1].toUpperCase();
    marker = (m === 'CR' || m === 'K' || m === 'C' || m === 'CREDIT') ? 'CR' : 'DB';
    s = s.slice(0, mk.index).trim();
  }
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/^(Rp\.?|IDR)\s*/i, '');
  if (/^-/.test(s)) { neg = true; s = s.slice(1); }
  if (/-$/.test(s) && !/,-$/.test(s)) { neg = true; s = s.slice(0, -1); }
  s = s.replace(/,-$/, '').replace(/\.-$/, '').replace(/\s/g, '');
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
  let dec = null;
  if (lastDot >= 0 && lastComma >= 0) dec = lastDot > lastComma ? '.' : ',';
  else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const count = s.split(sep).length - 1;
    const tail = s.length - s.lastIndexOf(sep) - 1;
    if (count > 1) dec = tail === 3 ? null : sep; // 1.234.567 → ribuan; 1.234.567.89 (salah baca OCR) → desimal terakhir
    else if (tail === 3) dec = decimalHint === sep ? sep : null; // 1.234 → ribuan kecuali dokumen memakai titik desimal
    else dec = sep;
  }
  let num;
  if (dec === null) num = parseFloat(s.replace(/[.,]/g, ''));
  else if (lastDot < 0 || lastComma < 0) {
    const i = s.lastIndexOf(dec);
    num = parseFloat(s.slice(0, i).replace(/[.,]/g, '') + '.' + s.slice(i + 1));
  } else {
    const th = dec === '.' ? ',' : '.';
    num = parseFloat(s.split(th).join('').replace(dec, '.'));
  }
  if (!isFinite(num)) return null;
  return { value: neg ? -num : num, marker };
}
/** Parse input uang dari form (mis. "1.500.000" atau "1,5 M"). */
function parseMoney(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim().toLowerCase();
  if (!s) return 0;
  let mult = 1;
  const m = s.match(/\s*(t|m|jt|juta|rb|ribu|miliar|milyar|triliun)$/);
  if (m) {
    mult = { t: 1e12, triliun: 1e12, m: 1e9, miliar: 1e9, milyar: 1e9, jt: 1e6, juta: 1e6, rb: 1e3, ribu: 1e3 }[m[1]];
    s = s.slice(0, m.index).trim();
    const p = parseAmount(s.replace(/\./g, ',').replace(/,(?=.*,)/g, ''), ',');
    return p ? p.value * mult : 0;
  }
  const p = parseAmount(s, ',');
  return p ? p.value : 0;
}
/** Input uang otomatis diberi pemisah ribuan saat kehilangan fokus. */
function bindMoneyInputs(root = document) {
  $$('input[data-money]', root).forEach((inp) => {
    if (inp.dataset.bound) return;
    inp.dataset.bound = '1';
    inp.addEventListener('blur', () => {
      if (inp.value.trim() === '') return;
      inp.value = fmt(parseMoney(inp.value));
    });
  });
}

/* ---------------------------- Tanggal ---------------------------- */
const MONTHS = {
  JAN: 1, JANUARI: 1, JANUARY: 1, FEB: 2, FEBRUARI: 2, FEBRUARY: 2, PEB: 2, MAR: 3, MARET: 3, MARCH: 3,
  APR: 4, APRIL: 4, MEI: 5, MAY: 5, JUN: 6, JUNI: 6, JUNE: 6, JUL: 7, JULI: 7, JULY: 7,
  AGU: 8, AGT: 8, AGS: 8, AGUSTUS: 8, AUG: 8, AUGUST: 8, SEP: 9, SEPT: 9, SEPTEMBER: 9,
  OKT: 10, OKTOBER: 10, OCT: 10, OCTOBER: 10, NOV: 11, NOPEMBER: 11, NOVEMBER: 11, DES: 12, DESEMBER: 12, DEC: 12, DECEMBER: 12,
};
const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTH_RE = '(JANUARI|JANUARY|FEBRUARI|FEBRUARY|MARET|MARCH|APRIL|MEI|MAY|JUNI|JUNE|JULI|JULY|AGUSTUS|AUGUST|SEPTEMBER|OKTOBER|OCTOBER|NOPEMBER|NOVEMBER|DESEMBER|DECEMBER|JAN|FEB|PEB|MAR|APR|JUN|JUL|AGU|AGT|AGS|AUG|SEPT|SEP|OKT|OCT|NOV|DES|DEC)';

/** Tanggal disimpan sebagai string ISO 'YYYY-MM-DD' agar bebas zona waktu. */
function isoDate(y, m, d) {
  if (!(y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function fixYear(y) { y = +y; return y < 100 ? 2000 + y : y; }
/**
 * Parse tanggal dari teks. order: 'dmy' (default Indonesia) atau 'mdy'.
 * defaultYear dipakai bila tanggal tanpa tahun (mis. "05/01").
 */
function parseDate(raw, opts = {}) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) return isNaN(raw) ? null : isoDate(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
  if (typeof raw === 'number') { // serial Excel
    if (raw > 20000 && raw < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(raw) * 86400000);
      return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    return null;
  }
  const s = String(raw).trim().toUpperCase();
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return isoDate(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/))) {
    let a = +m[1], b = +m[2];
    if (opts.order === 'mdy') [a, b] = [b, a];
    return isoDate(fixYear(m[3]), b, a);
  }
  if ((m = s.match(new RegExp('^(\\d{1,2})[\\s\\-/.]*' + MONTH_RE + '[\\s\\-/.,]*(\\d{2,4})?\\b')))) {
    const y = m[3] ? fixYear(m[3]) : opts.defaultYear;
    return y ? isoDate(y, MONTHS[m[2]], +m[1]) : null;
  }
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?![/.-]?\d)/))) {
    if (!opts.defaultYear) return null;
    let a = +m[1], b = +m[2];
    if (opts.order === 'mdy') [a, b] = [b, a];
    return isoDate(opts.defaultYear, b, a);
  }
  return null;
}
function todayISO() { const d = new Date(); return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
function dateToUTC(iso) { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); }
function daysBetween(a, b) { return Math.round((dateToUTC(b) - dateToUTC(a)) / 86400000); }
function addDays(iso, n) { const d = new Date(dateToUTC(iso) + n * 86400000); return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
function fmtDate(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
function fmtDateLong(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTH_NAMES[m - 1]} ${y}`; }
function monthKey(iso) { return iso.slice(0, 7); }
function fmtMonth(key) { const [y, m] = key.split('-').map(Number); return `${MONTH_SHORT[m - 1]} ${y}`; }
function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

/* ---------------------------- File & unduhan ---------------------------- */
function readFileAs(file, how) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    if (how === 'text') r.readAsText(file);
    else if (how === 'dataurl') r.readAsDataURL(file);
    else r.readAsArrayBuffer(file);
  });
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function safeFileName(s) { return String(s || 'dokumen').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'dokumen'; }
function b64ToBytes(b64) {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function bytesToB64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = el('textarea', { style: { position: 'fixed', left: '-9999px' } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Tersalin ke clipboard');
}
/** Tulis workbook Excel. sheets: [{ name, rows: [[...]], cols?: [lebar] }] */
function exportXlsx(filename, sheets) {
  const wb = XLSX.utils.book_new();
  for (const sh of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sh.rows);
    if (sh.cols) ws['!cols'] = sh.cols.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}
function setupDrop(zone, input, onFiles) {
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
  });
  input.addEventListener('change', () => { if (input.files.length) onFiles(Array.from(input.files)); input.value = ''; });
}
function setProgress(wrap, frac, text) {
  if (!wrap) return;
  wrap.classList.toggle('hidden', frac == null);
  if (frac == null) return;
  wrap.querySelector('.progress > div').style.width = Math.round(frac * 100) + '%';
  const t = wrap.querySelector('small');
  if (t) t.textContent = text || '';
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function linesOf(text) { return String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean); }

Object.assign(App, {
  $, $$, esc, el, toast, modal, confirmBox, store, fmt, fmtRp, fmtPct, fmtX, fmtShort, parseAmount, parseMoney, bindMoneyInputs,
  parseDate, isoDate, todayISO, daysBetween, addDays, fmtDate, fmtDateLong, monthKey, fmtMonth, daysInMonth, dateToUTC,
  MONTHS, MONTH_RE, MONTH_NAMES, readFileAs, downloadBlob, safeFileName, b64ToBytes, bytesToB64, copyText, exportXlsx,
  setupDrop, setProgress, uid, linesOf,
});
