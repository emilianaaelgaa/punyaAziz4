"""
Membuat file contoh FIKTIF di folder contoh/ untuk mencoba aplikasi:
 - 3 rekening koran PDF dengan tata letak berbeda (gaya A, B, C)
 - 1 rekening koran PDF hasil "scan" (gambar, untuk uji OCR)
 - 1 CSV mutasi (pemisah titik koma, format angka Indonesia)
 - 1 foto dokumen NIB fiktif (PNG, untuk uji OCR)
Semua nama, nomor, dan angka adalah rekaan.

Jalankan: python3 tools/make-samples.py   (butuh: reportlab, pillow, pypdfium2 opsional)
"""
import csv
import os
import random
from datetime import date, timedelta

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "contoh")
os.makedirs(OUT, exist_ok=True)
random.seed(42)
Y = 2026


def en(n):
    return f"{n:,.2f}"


def idn(n):
    return f"{n:,.2f}".replace(",", "#").replace(".", ",").replace("#", ".")


def gen_txns(start_bal, months=(1, 2, 3), own_out=None, own_in=None):
    """Transaksi fiktif: penjualan masuk, pembelian keluar, biaya, bunga, contra antar rekening."""
    rows = []
    bal = start_bal
    for m in months:
        d = date(Y, m, 1)
        while d.month == m:
            if d.weekday() < 5:
                if random.random() < 0.55:
                    amt = random.randrange(5_000_000, 60_000_000, 50_000)
                    bal += amt
                    rows.append((d, ["TRSF E-BANKING CR", f"{d.day:02d}{m:02d}/FTSCY/WS9{random.randint(1000, 9999)}", f"PELUNASAN INV {random.randint(100, 999)}", f"TOKO PELANGGAN {random.choice('ABCDEFG')}"], 0, amt, bal))
                if random.random() < 0.3:
                    amt = random.randrange(8_000_000, 45_000_000, 25_000)
                    bal -= amt
                    rows.append((d, ["TRSF E-BANKING DB", f"{d.day:02d}{m:02d}/FTSCY/WS9{random.randint(1000, 9999)}", "PEMBELIAN BAHAN BAKU", "PT PEMASOK CONTOH"], amt, 0, bal))
                if random.random() < 0.08:
                    amt = random.randrange(1_000_000, 5_000_000, 100_000)
                    bal -= amt
                    rows.append((d, ["TARIKAN ATM", f"{d.day:02d}/{m:02d} 10:2{random.randint(0, 9)}"], amt, 0, bal))
            if d.day == 10 and own_out:
                amt = 30_000_000
                bal -= amt
                rows.append((d, ["PINDAH BUKU", f"KE {own_out}", "CV CONTOH SEJAHTERA"], amt, 0, bal))
            if d.day == 11 and own_in:
                amt = 30_000_000
                bal += amt
                rows.append((d, ["TRANSFER MASUK", f"DARI {own_in}", "CV CONTOH SEJAHTERA"], 0, amt, bal))
            d += timedelta(days=1)
        last = date(Y, m + 1, 1) - timedelta(days=1) if m < 12 else date(Y, 12, 31)
        b = round(bal * 0.0001 / 12 * 100) / 100 + 15000
        bal += b
        rows.append((last, ["BUNGA"], 0, b, bal))
        tx = round(b * 0.2, 2)
        bal -= tx
        rows.append((last, ["PAJAK BUNGA"], tx, 0, bal))
        bal -= 17500
        rows.append((last, ["BIAYA ADM"], 17500, 0, bal))
    return rows


# ------------------------------------------------------------------ Gaya A
def style_a(path, rows, opening, acc):
    c = canvas.Canvas(path, pagesize=A4)
    W, H = A4

    def header(page):
        c.setFont("Helvetica-Bold", 11)
        c.drawString(40, H - 40, "BANK CONTOH NUSANTARA")
        c.setFont("Helvetica", 8.5)
        c.drawString(40, H - 56, "REKENING GIRO")
        c.drawString(40, H - 70, "CV CONTOH SEJAHTERA")
        c.drawString(330, H - 56, f"NO. REKENING : {acc}")
        c.drawString(330, H - 70, f"HALAMAN : {page}")
        c.drawString(330, H - 84, f"PERIODE : JANUARI {Y} - MARET {Y}")
        c.drawString(330, H - 98, "MATA UANG : IDR")
        c.setFont("Helvetica-Bold", 8.5)
        for x, t in ((40, "TANGGAL"), (95, "KETERANGAN"), (300, "CBG"), (400, "MUTASI"), (500, "SALDO")):
            c.drawString(x, H - 125, t)
        c.line(40, H - 130, 560, H - 130)
        return H - 145

    page = 1
    y = header(page)
    c.setFont("Helvetica", 8)
    c.drawString(40, y, "01/01")
    c.drawString(95, y, "SALDO AWAL")
    c.drawRightString(560, y, en(opening))
    y -= 13
    for d, desc, db, cr, bal in rows:
        need = 11 * len(desc) + 4
        if y - need < 60:
            c.drawString(40, 40, "Bersambung ke halaman berikut")
            c.showPage()
            page += 1
            y = header(page)
            c.setFont("Helvetica", 8)
        c.drawString(40, y, d.strftime("%d/%m"))
        c.drawString(95, y, desc[0])
        c.drawString(300, y, "0938")
        amt = db or cr
        c.drawRightString(445, y, en(amt))
        if db:
            c.drawString(448, y, "DB")
        c.drawRightString(560, y, en(bal))
        for i, extra in enumerate(desc[1:]):
            c.drawString(95, y - 11 * (i + 1), extra)
        y -= need
    y -= 10
    tot_cr = sum(r[3] for r in rows)
    tot_db = sum(r[2] for r in rows)
    for lbl, v in (("SALDO AWAL", opening), ("MUTASI CR", tot_cr), ("MUTASI DB", tot_db), ("SALDO AKHIR", rows[-1][4])):
        if y < 60:
            c.showPage()
            y = H - 60
            c.setFont("Helvetica", 8)
        c.drawString(330, y, lbl + " :")
        c.drawRightString(560, y, en(v))
        y -= 12
    c.save()


# ------------------------------------------------------------------ Gaya B
def style_b(path, rows, opening, acc, raster=False):
    c = canvas.Canvas(path, pagesize=A4)
    W, H = A4

    def header():
        c.setFont("Helvetica-Bold", 12)
        c.drawString(40, H - 40, "Laporan Mutasi Rekening")
        c.setFont("Helvetica", 9)
        c.drawString(40, H - 58, "Nama : CV CONTOH SEJAHTERA")
        c.drawString(40, H - 72, f"Nomor Rekening : {acc}")
        c.drawString(40, H - 86, f"Periode : 01/01/{Y} - 31/03/{Y}")
        c.setFont("Helvetica-Bold", 9)
        for x, t, right in ((40, "Tanggal", False), (110, "Keterangan", False), (395, "Debit", True), (475, "Kredit", True), (560, "Saldo", True)):
            (c.drawRightString if right else c.drawString)(x, H - 110, t)
        c.line(40, H - 114, 560, H - 114)
        return H - 128

    y = header()
    c.setFont("Helvetica", 8.5)
    c.drawString(40, y, f"01/01/{Y}")
    c.drawString(110, y, "Saldo Awal")
    c.drawRightString(560, y, idn(opening))
    y -= 14
    for d, desc, db, cr, bal in rows:
        lines = [" ".join(desc[:2]), " ".join(desc[2:])] if len(desc) > 2 else [" ".join(desc)]
        need = 11 * len(lines) + 4
        if y - need < 50:
            c.setFont("Helvetica", 7)
            c.drawString(40, 30, "Dokumen ini dicetak secara elektronik")
            c.showPage()
            y = header()
            c.setFont("Helvetica", 8.5)
        c.drawString(40, y, d.strftime("%d/%m/%Y"))
        c.drawString(110, y, lines[0][:52])
        if db:
            c.drawRightString(395, y, idn(db))
        if cr:
            c.drawRightString(475, y, idn(cr))
        c.drawRightString(560, y, idn(bal))
        for i, extra in enumerate(lines[1:]):
            c.drawString(110, y - 11 * (i + 1), extra[:52])
        y -= need
    c.drawString(40, y - 10, f"Saldo Akhir {idn(rows[-1][4])}")
    c.save()
    if raster:
        rasterize(path)


def rasterize(path):
    """Ubah PDF menjadi PDF berisi gambar (simulasi hasil scan)."""
    import pypdfium2 as pdfium
    from PIL import Image, ImageFilter

    pdf = pdfium.PdfDocument(path)
    imgs = []
    for i in range(len(pdf)):
        img = pdf[i].render(scale=2.2).to_pil().convert("L")
        img = img.rotate(0.4, expand=False, fillcolor=255).filter(ImageFilter.GaussianBlur(0.4))
        imgs.append(img.convert("RGB"))
    imgs[0].save(path, save_all=True, append_images=imgs[1:], resolution=200)


# ------------------------------------------------------------------ Gaya C
def style_c(path, rows, opening, acc):
    c = canvas.Canvas(path, pagesize=A4)
    W, H = A4
    c.setFont("Helvetica-Bold", 11)
    c.drawString(40, H - 40, "LAPORAN TRANSAKSI FINANSIAL")
    c.setFont("Helvetica", 8.5)
    c.drawString(40, H - 56, f"No. Rekening : {acc}      Nama Produk : TABUNGAN BISNIS")
    c.drawString(40, H - 70, f"Periode Transaksi : 01/01/{Y} - 31/03/{Y}")
    c.setFont("Helvetica-Bold", 8)
    for x, t, right in ((40, "Tanggal Transaksi", False), (140, "Uraian Transaksi", False), (330, "Teller", False), (420, "Debet", True), (490, "Kredit", True), (560, "Saldo", True)):
        (c.drawRightString if right else c.drawString)(x, H - 92, t)
    y = H - 106
    c.setFont("Helvetica", 7.5)
    c.drawString(40, y, "Saldo Awal")
    c.drawRightString(560, y, en(opening))
    y -= 12
    for d, desc, db, cr, bal in rows:
        if y < 50:
            c.showPage()
            y = H - 50
            c.setFont("Helvetica", 7.5)
        c.drawString(40, y, d.strftime("%d/%m/%y") + f" {random.randint(8, 16):02d}:{random.randint(0, 59):02d}:{random.randint(0, 59):02d}")
        c.drawString(140, y, " ".join(desc)[:40])
        c.drawString(330, y, "8888" + str(random.randint(100, 999)))
        c.drawRightString(420, y, en(db))
        c.drawRightString(490, y, en(cr))
        c.drawRightString(560, y, en(bal))
        y -= 12
    c.save()


def nib_image(path):
    from PIL import Image, ImageDraw, ImageFont
    import glob

    fonts = [f for f in glob.glob("/usr/share/fonts/**/*.ttf", recursive=True) if "Liberation" in f and "Regular" in f and "Sans" in f]
    fb = [f for f in glob.glob("/usr/share/fonts/**/*.ttf", recursive=True) if "LiberationSans-Bold.ttf" in f]
    f = ImageFont.truetype(fonts[0], 30)
    b = ImageFont.truetype(fb[0] if fb else fonts[0], 34)
    img = Image.new("RGB", (1650, 1500), (250, 250, 247))
    d = ImageDraw.Draw(img)
    y = 70
    for txt, font in (("PERIZINAN BERUSAHA BERBASIS RISIKO", b), ("NOMOR INDUK BERUSAHA: 9120000000000", b), ("", f),
                      ("Nama Pelaku Usaha : PT CONTOH MAKMUR SENTOSA", f), ("Alamat Kantor : Jl. Contoh Raya No. 1, RT 001/RW 002", f),
                      ("Kel. Contoh, Kec. Contoh, Kota Contoh", f), ("NPWP : 01.000.000.0-000.000", f), ("Status Penanaman Modal : PMDN", f), ("", f),
                      ("KBLI :", f), ("1. 46900 Perdagangan Besar Berbagai Macam Barang", f), ("2. 10794 Industri Kerupuk, Keripik dan Sejenisnya", f), ("", f),
                      ("Diterbitkan di Jakarta, tanggal: 15 Maret 2021", f), ("", f), ("DOKUMEN CONTOH FIKTIF - BUKAN DOKUMEN ASLI", b)):
        d.text((90, y), txt, fill=(25, 25, 25), font=font)
        y += 62
    img = img.rotate(0.6, expand=False, fillcolor=(250, 250, 247))
    img.save(path)


if __name__ == "__main__":
    open1 = 150_000_000.0
    rows_a = gen_txns(open1, own_out="9001112223")
    style_a(os.path.join(OUT, "contoh-rk-gaya-A.pdf"), rows_a, open1, "7001234567")
    open2 = 40_000_000.0
    rows_b = gen_txns(open2, own_in="7001234567")
    style_b(os.path.join(OUT, "contoh-rk-gaya-B.pdf"), rows_b, open2, "9001112223")
    open3 = 25_000_000.0
    random.seed(7)
    rows_c = gen_txns(open3)
    style_c(os.path.join(OUT, "contoh-rk-gaya-C.pdf"), rows_c, open3, "0123-01-000111-50-9")
    random.seed(9)
    rows_s = gen_txns(60_000_000.0, months=(1,))
    style_b(os.path.join(OUT, "contoh-rk-hasil-scan.pdf"), rows_s, 60_000_000.0, "5550001112", raster=True)
    with open(os.path.join(OUT, "contoh-mutasi.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, delimiter=";")
        w.writerow(["Tanggal Transaksi", "Keterangan", "Debet", "Kredit", "Saldo"])
        bal = 20_000_000.0
        w.writerow(["", "SALDO AWAL", "", "", idn(bal)])
        for d, desc, db, cr, b in gen_txns(bal, months=(1, 2)):
            w.writerow([d.strftime("%d/%m/%Y"), " ".join(desc), idn(db) if db else "", idn(cr) if cr else "", idn(b)])
    nib_image(os.path.join(OUT, "contoh-foto-nib.png"))
    # Kunci jawaban untuk uji otomatis
    import json
    def summ(rows, opening):
        return {"n": len(rows), "opening": opening, "closing": round(rows[-1][4], 2), "cr": round(sum(r[3] for r in rows), 2), "db": round(sum(r[2] for r in rows), 2)}
    with open(os.path.join(ROOT, "tools", "samples-expected.json"), "w") as fh:
        json.dump({"A": summ(rows_a, open1), "B": summ(rows_b, open2), "C": summ(rows_c, open3), "scan": summ(rows_s, 60_000_000.0)}, fh, indent=1)
    print("OK", sorted(os.listdir(OUT)))
