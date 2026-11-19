/*
 * Membuat vendor/ocr-engine.js — paket mesin OCR Tesseract yang bisa jalan
 * dari file:// (tanpa server, tanpa internet).
 *
 * Browser memblokir fetch()/importScripts() dari file://, jadi seluruh mesin
 * (kode worker + core WebAssembly + data bahasa Indonesia) dibungkus menjadi
 * satu string JavaScript. Aplikasi lalu membuat Worker dari Blob URL.
 *
 * Pemakaian (sekali saja, di komputer pengembang yang punya internet):
 *   npm install tesseract.js@5 tesseract.js-core@5 @tesseract.js-data/ind
 *   node tools/build-ocr-engine.js <path/ke/node_modules>
 */
const fs = require('fs');
const path = require('path');

const nm = process.argv[2] || path.join(__dirname, 'node_modules');
const out = path.join(__dirname, '..', 'vendor', 'ocr-engine.js');

const workerSrc = fs.readFileSync(path.join(nm, 'tesseract.js/dist/worker.min.js'), 'utf8');
const coreSrc = fs.readFileSync(path.join(nm, 'tesseract.js-core/tesseract-core-lstm.wasm.js'), 'utf8');
const langB64 = fs.readFileSync(path.join(nm, '@tesseract.js-data/ind/4.0.0_best_int/ind.traineddata.gz')).toString('base64');

// Shim: semua fetch() di dalam worker dicegat. Permintaan data bahasa dilayani
// dari memori; permintaan lain DITOLAK — mesin OCR tidak pernah mengakses jaringan.
const shim = `
(function(){
  var LANG_B64 = ${JSON.stringify(langB64)};
  self.fetch = function(url){
    if (String(url).indexOf('offline-lang/ind.traineddata') !== -1) {
      var bin = atob(LANG_B64), u = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return Promise.resolve(new Response(u, { status: 200 }));
    }
    return Promise.reject(new Error('Akses jaringan dinonaktifkan (mode offline): ' + url));
  };
})();
`;

const engine = shim + '\n;\n' + coreSrc + '\n;\n' + workerSrc;
const js = '/* Dibuat otomatis oleh tools/build-ocr-engine.js — jangan diedit manual. */\n'
  + 'window.__OCR_ENGINE_SRC = ' + JSON.stringify(engine) + ';\n';
fs.writeFileSync(out, js);
console.log('OK:', out, (js.length / 1e6).toFixed(1) + ' MB');
