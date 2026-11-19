/* Inisialisasi aplikasi: navigasi tab, beranda, lencana offline */
'use strict';
(function () {
  const { $, $$, el } = App;

  function show(page) {
    $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
    $$('section.page').forEach((s) => s.classList.toggle('active', s.id === 'page-' + page));
    if (location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
    window.scrollTo(0, 0);
    if (page === 'rk') App.modules.statement.onShow();
    if (page === 'reminder') App.modules.reminder.render();
    if (page === 'settings') App.modules.settings.usage();
  }

  App.modules.home = {
    refresh() {
      const wrap = $('#home-alerts');
      if (!wrap || !App.modules.reminder) return;
      const c = App.modules.reminder.counts();
      wrap.innerHTML = '';
      if (c.overdue || c.d30 || c.d60) {
        wrap.appendChild(el('div', { class: 'alert ' + (c.overdue ? 'bad' : 'warn') },
          el('strong', { text: 'Pengingat: ' }),
          `${c.overdue ? '⛔ ' + c.overdue + ' item lewat/jatuh tempo hari ini · ' : ''}⚠ ${c.d30} item ≤ 30 hari · 🔔 ${c.d60} item 31–60 hari. `,
          el('a', { href: '#reminder', onclick: (e) => { e.preventDefault(); show('reminder'); } }, 'Lihat daftar →')));
      }
    },
  };

  function init() {
    const missing = ['pdfjsLib', 'XLSX', 'PizZip', 'docxtemplater', 'Tesseract'].filter((g) => !window[g]);
    if (missing.length) {
      document.querySelector('main').prepend(el('div', { class: 'alert bad', text: 'Sebagian pustaka gagal dimuat (' + missing.join(', ') + '). Pastikan seluruh folder aplikasi (termasuk folder "vendor") tersalin utuh.' }));
    }
    $$('#tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.page)));
    $$('[data-goto]').forEach((c) => c.addEventListener('click', () => show(c.dataset.goto)));
    ['statement', 'reminder', 'docgen', 'calculator', 'legal', 'settings'].forEach((m) => {
      try { App.modules[m].init(); } catch (e) { console.error('Gagal memulai modul ' + m, e); }
    });
    App.modules.home.refresh();
    $('#offline-badge').addEventListener('click', async () => {
      show('settings');
      const ok = await App.modules.settings.netTest();
      App.toast(ok ? 'Uji isolasi jaringan: semua koneksi keluar diblokir ✓' : 'Peringatan: ada koneksi yang tidak terblokir', 4000);
    });
    const start = (location.hash || '').slice(1);
    if (start && $('#page-' + start)) show(start);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
