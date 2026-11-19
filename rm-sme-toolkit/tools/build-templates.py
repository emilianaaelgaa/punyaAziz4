"""
Membuat templat Word bawaan (templates/*.docx) dan js/templates-data.js.

Templat memakai tag docxtemplater: {nama_tag}, perulangan baris tabel {#pengurus}...{/pengurus}.
Anda bebas mengedit .docx hasilnya di Word (atau membuat templat sendiri) selama tag tidak diubah.

Jalankan:  python3 tools/build-templates.py   (butuh: pip install python-docx)
"""
import base64
import json
import os

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "templates")
os.makedirs(OUT_DIR, exist_ok=True)

TEAL = RGBColor(0x00, 0x52, 0x5A)


def base_doc(title):
    doc = Document()
    sec = doc.sections[0]
    sec.page_height, sec.page_width = Cm(29.7), Cm(21.0)
    sec.left_margin = sec.right_margin = Cm(2.2)
    sec.top_margin = sec.bottom_margin = Cm(2.0)
    st = doc.styles["Normal"]
    st.font.name = "Arial"
    st.font.size = Pt(10)
    st.element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
    st.paragraph_format.space_after = Pt(3)
    for name, size in (("Heading 1", 13), ("Heading 2", 11)):
        h = doc.styles[name]
        h.font.name = "Arial"
        h.font.size = Pt(size)
        h.font.bold = True
        h.font.color.rgb = TEAL
        h.element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
        h.paragraph_format.space_before = Pt(10)
        h.paragraph_format.space_after = Pt(4)
    hdr = sec.header.paragraphs[0]
    hdr.text = "DRAF — {nama_perusahaan} — untuk direviu sebelum digunakan"
    hdr.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    hdr.runs[0].font.size = Pt(8)
    hdr.runs[0].font.color.rgb = RGBColor(0x88, 0x88, 0x88)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(title)
    r.bold = True
    r.font.size = Pt(15)
    r.font.color.rgb = TEAL
    return doc


def shade(cell, hex_color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    tcPr.append(shd)


def set_cell(cell, text, bold=False, align=None, size=None):
    cell.text = ""
    p = cell.paragraphs[0]
    run = p.add_run(text)
    run.bold = bold
    if size:
        run.font.size = Pt(size)
    if align == "right":
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    elif align == "center":
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER


def kv_table(doc, rows, w1=5.5, w2=11.1):
    t = doc.add_table(rows=0, cols=2)
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for k, v in rows:
        c = t.add_row().cells
        set_cell(c[0], k)
        shade(c[0], "EEF4F5")
        set_cell(c[1], v)
        c[0].width, c[1].width = Cm(w1), Cm(w2)
    doc.add_paragraph()
    return t


def grid_table(doc, header, rows, widths=None, align_right_from=1, size=None, align_right_to=None):
    t = doc.add_table(rows=1, cols=len(header))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(header):
        set_cell(t.rows[0].cells[i], h, bold=True, align="center" if i else None, size=size)
        shade(t.rows[0].cells[i], "D9EAEC")
    for row in rows:
        c = t.add_row().cells
        for i, v in enumerate(row):
            right = i >= align_right_from and (align_right_to is None or i <= align_right_to)
            set_cell(c[i], v, align="right" if right else None, size=size)
    if widths:
        for r in t.rows:
            for i, w in enumerate(widths):
                r.cells[i].width = Cm(w)
    doc.add_paragraph()
    return t


def para(doc, text, bold_label=None):
    p = doc.add_paragraph()
    if bold_label:
        p.add_run(bold_label).bold = True
    p.add_run(text)
    return p


def signoff(doc):
    doc.add_paragraph()
    t = doc.add_table(rows=1, cols=2)
    c = t.rows[0].cells
    set_cell(c[0], "")
    c[1].text = ""
    p = c[1].paragraphs[0]
    p.add_run("{unit_kerja}, {tgl_dokumen}\nDisusun oleh,\n\n\n\n")
    p.add_run("{nama_rm}").bold = True
    p.add_run("\n{jabatan_rm}")


# ----------------------------------------------------------------- Call Report
def call_report():
    doc = base_doc("LAPORAN KUNJUNGAN NASABAH (CALL REPORT)")
    doc.add_heading("A. Data Kunjungan", level=2)
    kv_table(doc, [
        ("Nama debitur / calon debitur", "{nama_perusahaan}"),
        ("Bidang usaha", "{bidang_usaha}"),
        ("Alamat usaha", "{alamat_usaha}"),
        ("Tanggal kunjungan", "{tgl_kunjungan}"),
        ("Lokasi kunjungan", "{lokasi_kunjungan}"),
        ("Pihak yang ditemui", "{pihak_ditemui}"),
        ("Tujuan kunjungan", "{tujuan_kunjungan}"),
        ("Fasilitas eksisting / diusulkan", "{jenis_fasilitas} {plafon}"),
    ])
    doc.add_heading("B. Hasil Kunjungan", level=2)
    doc.add_paragraph("{hasil_kunjungan}")
    doc.add_heading("C. Kondisi Usaha", level=2)
    doc.add_paragraph("{kondisi_usaha}")
    doc.add_heading("D. Ringkasan Mutasi Rekening", level=2)
    kv_table(doc, [
        ("Rekening yang dianalisa", "{rk_rekening}"),
        ("Periode", "{rk_periode}"),
        ("Rata-rata kredit bersih (omzet) / bulan", "{rk_rata_omzet}"),
        ("Rata-rata debit bersih / bulan", "{rk_rata_debit}"),
        ("Rata-rata saldo harian", "{rk_rata_saldo}"),
    ])
    doc.add_heading("E. Tindak Lanjut", level=2)
    doc.add_paragraph("{tindak_lanjut}")
    signoff(doc)
    return doc


# ----------------------------------------------------------------- Kerangka NAK
def nak():
    doc = base_doc("KERANGKA NOTA ANALISA KREDIT")
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run("{nama_perusahaan} — {jenis_permohonan} {jenis_fasilitas}").italic = True

    doc.add_heading("I. Latar Belakang Permohonan", level=1)
    doc.add_paragraph("{latar_belakang}")

    doc.add_heading("II. Identitas Debitur", level=1)
    kv_table(doc, [
        ("Nama debitur", "{nama_perusahaan}"),
        ("Bentuk usaha", "{bentuk_usaha}"),
        ("Bidang usaha / KBLI", "{bidang_usaha} / {kbli}"),
        ("Alamat usaha", "{alamat_usaha}"),
        ("Berdiri sejak", "{tahun_berdiri}"),
        ("Telepon", "{telepon}"),
        ("CIF", "{cif}"),
        ("Grup usaha", "{grup_usaha}"),
    ])

    doc.add_heading("III. Legalitas", level=1)
    kv_table(doc, [
        ("NPWP", "{npwp}"),
        ("NIB", "{nib}"),
        ("Akta pendirian", "No. {no_akta_pendirian} tanggal {tgl_akta_pendirian}, Notaris {notaris_pendirian}"),
        ("Pengesahan Kemenkumham", "{sk_kemenkumham}"),
        ("Akta perubahan terakhir", "{akta_perubahan_terakhir}"),
        ("Izin lainnya", "{izin_lain}"),
    ])

    doc.add_heading("IV. Pengurus dan Pemegang Saham", level=1)
    grid_table(doc, ["No", "Nama", "Jabatan", "NIK", "Kepemilikan"],
               [["{#pengurus}{no}", "{nama}", "{jabatan}", "{nik}", "{saham}{/pengurus}"]],
               widths=[1.0, 5.2, 4.0, 4.0, 2.4], align_right_from=4)

    doc.add_heading("V. Fasilitas yang Diusulkan", level=1)
    kv_table(doc, [
        ("Jenis permohonan", "{jenis_permohonan}"),
        ("Jenis fasilitas", "{jenis_fasilitas}"),
        ("Plafon", "{plafon}\n({plafon_terbilang})"),
        ("Jangka waktu", "{tenor_bulan} bulan"),
        ("Suku bunga", "{suku_bunga}% p.a."),
        ("Pola pembayaran", "{pola_angsuran}"),
        ("Angsuran / bunga per bulan", "{angsuran_baru}"),
        ("Tujuan penggunaan", "{tujuan_penggunaan}"),
        ("Sumber pembayaran", "{sumber_pembayaran}"),
    ])

    doc.add_heading("VI. Analisa Keuangan", level=1)
    items = [("Penjualan", "penjualan"), ("HPP", "hpp"), ("Laba kotor", "laba_kotor"), ("Beban operasional", "biaya_operasional"),
             ("Laba usaha (EBIT)", "laba_usaha"), ("Beban bunga", "biaya_bunga"), ("Penyusutan", "penyusutan"), ("Beban pajak", "pajak"),
             ("Laba bersih", "laba_bersih"), ("EBITDA", "ebitda"), ("Kas & setara kas", "kas"), ("Piutang usaha", "piutang"),
             ("Persediaan", "persediaan"), ("Aset lancar", "aset_lancar"), ("Aset tetap", "aset_tetap"), ("Total aset", "total_aset"),
             ("Utang dagang", "utang_dagang"), ("Liabilitas jangka pendek", "utang_lancar"), ("Utang bank", "utang_bank"),
             ("Total liabilitas", "total_utang"), ("Ekuitas", "ekuitas"), ("Kewajiban bank existing / tahun", "kewajiban_bank_tahunan")]
    p = doc.add_paragraph()
    p.add_run("Neraca & laba rugi (Rp)").bold = True
    grid_table(doc, ["Pos", "{periode_1}", "{periode_2}", "{periode_3}"],
               [[lbl, "{%s_1}" % k, "{%s_2}" % k, "{%s_3}" % k] for lbl, k in items], widths=[5.6, 3.7, 3.7, 3.7], size=9)
    p = doc.add_paragraph()
    p.add_run("Penilaian rasio kredit").bold = True
    p.add_run(" (status berdasarkan periode {periode_terbaru})")
    grid_table(doc, ["Kelompok", "Rasio", "{periode_1}", "{periode_2}", "{periode_3}", "Acuan", "Status"],
               [["{#penilaian}{kelompok}", "{rasio}", "{p1}", "{p2}", "{p3}", "{acuan}", "{status}{/penilaian}"]],
               widths=[2.6, 3.9, 2.0, 2.0, 2.0, 1.8, 2.3], align_right_from=2, align_right_to=4, size=8)
    para(doc, "{ringkasan_penilaian}", "Kesimpulan rasio: ")
    p = doc.add_paragraph()
    p.add_run("Proforma setelah fasilitas diusulkan").bold = True
    grid_table(doc, ["Rasio", "Nilai", "Acuan", "Status"],
               [["{#proforma}{rasio}", "{nilai}", "{acuan}", "{status}{/proforma}"]], widths=[7.6, 3.2, 2.6, 3.2], align_right_from=1, align_right_to=1, size=9)

    doc.add_heading("VII. Analisa Mutasi Rekening", level=1)
    kv_table(doc, [
        ("Rekening yang dianalisa", "{rk_rekening}"),
        ("Periode", "{rk_periode}"),
        ("Rata-rata kredit bersih (omzet) / bulan", "{rk_rata_omzet}"),
        ("Rata-rata debit bersih / bulan", "{rk_rata_debit}"),
        ("Rata-rata saldo harian", "{rk_rata_saldo}"),
    ])

    doc.add_heading("VIII. Analisa 5C", level=1)
    for label, tag in (("Character", "analisa_karakter"), ("Capacity", "analisa_kapasitas"), ("Capital", "analisa_kapital"),
                       ("Condition of economy", "analisa_kondisi"), ("Collateral", "analisa_kolateral")):
        doc.add_heading(label, level=2)
        doc.add_paragraph("{" + tag + "}")

    doc.add_heading("IX. Agunan", level=1)
    kv_table(doc, [
        ("Jenis & bukti kepemilikan", "{agunan}"),
        ("Nilai agunan", "{nilai_agunan}"),
        ("Pengikatan", "{pengikatan_agunan}"),
        ("Loan to value (LTV)", "{ltv} (acuan {acuan_ltv}) {status_ltv}"),
        ("Coverage agunan terhadap plafon", "{coverage_agunan}"),
    ])

    doc.add_heading("X. Risiko dan Mitigasi", level=1)
    doc.add_paragraph("{risiko_mitigasi}")

    doc.add_heading("XI. Kesimpulan dan Rekomendasi", level=1)
    doc.add_paragraph("{rekomendasi}")
    signoff(doc)
    return doc


TEMPLATES = [
    ("callreport", "Call Report (bawaan)", "Templat-Call-Report.docx", call_report),
    ("nak", "Kerangka NAK (bawaan)", "Templat-Kerangka-NAK.docx", nak),
]

data = []
for tid, name, fname, fn in TEMPLATES:
    path = os.path.join(OUT_DIR, fname)
    fn().save(path)
    with open(path, "rb") as f:
        data.append({"id": tid, "name": name, "file": fname, "b64": base64.b64encode(f.read()).decode()})
    print("OK", path)

with open(os.path.join(ROOT, "js", "templates-data.js"), "w") as f:
    f.write("/* Dibuat otomatis oleh tools/build-templates.py — jangan diedit manual. */\n")
    f.write("window.BUILTIN_TEMPLATES = " + json.dumps(data) + ";\n")
print("OK js/templates-data.js")
