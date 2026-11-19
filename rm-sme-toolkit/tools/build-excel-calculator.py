"""
Membuat excel/Kalkulator-Kelayakan.xlsx — versi kalkulator untuk dibuka di Excel Mobile (HP/tablet).
Rumus sama dengan tab "Kalkulator Kelayakan" di aplikasi. Sel input berwarna kuning.

Jalankan: python3 tools/build-excel-calculator.py   (butuh: openpyxl)
"""
import os

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "excel")
os.makedirs(OUT, exist_ok=True)

INPUT = PatternFill("solid", fgColor="FFF4C2")
HEAD = PatternFill("solid", fgColor="006B73")
RES = PatternFill("solid", fgColor="E3F2F3")
thin = Side(style="thin", color="C8D1D9")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
RP = '"Rp" #,##0'

wb = Workbook()
ws = wb.active
ws.title = "Kalkulator"
pr = wb.create_sheet("Parameter")

# ---- Parameter (sesuaikan dengan ketentuan yang berlaku)
pr["A1"] = "Parameter (contoh — sesuaikan dengan ketentuan kredit yang berlaku)"
pr["A1"].font = Font(bold=True)
pr["A3"], pr["B3"] = "Jenis agunan", "LTV maks (%)"
for c in ("A3", "B3"):
    pr[c].font = Font(bold=True, color="FFFFFF")
    pr[c].fill = HEAD
ltv = [("Tanah & Bangunan (SHM/SHGB)", 80), ("Tanah kosong", 70), ("Kendaraan", 70), ("Mesin & peralatan", 60),
       ("Persediaan / piutang (fidusia)", 50), ("Deposito / tabungan (cash collateral)", 95)]
for i, (j, v) in enumerate(ltv, start=4):
    pr.cell(i, 1, j)
    pr.cell(i, 2, v).fill = INPUT
pr["A12"], pr["B12"] = "Pembulatan plafon ke bawah (Rp)", 1000000
pr["B12"].fill = INPUT
pr["B12"].number_format = RP
pr.column_dimensions["A"].width = 38
pr.column_dimensions["B"].width = 16

# ---- Kalkulator
ws.column_dimensions["A"].width = 2
ws.column_dimensions["B"].width = 42
ws.column_dimensions["C"].width = 20
ws.column_dimensions["D"].width = 10
ws.column_dimensions["E"].width = 18
ws["B1"] = "KALKULATOR KELAYAKAN KREDIT (INDIKATIF)"
ws["B1"].font = Font(bold=True, size=13, color="006B73")
ws["B2"] = "Isi sel berwarna kuning. Hasil adalah indikasi awal, bukan keputusan kredit."
ws["B2"].font = Font(italic=True, size=9, color="666666")


def label(row, text, bold=False):
    c = ws.cell(row, 2, text)
    c.font = Font(bold=bold)
    return c


def inp(row, value, fmt=None):
    c = ws.cell(row, 3, value)
    c.fill = INPUT
    c.border = BOX
    if fmt:
        c.number_format = fmt
    return c


def section(row, text):
    c = ws.cell(row, 2, text)
    c.font = Font(bold=True, color="FFFFFF")
    for col in range(2, 6):
        ws.cell(row, col).fill = HEAD


section(4, "FASILITAS")
label(5, "Jenis kredit"); inp(5, "Anuitas")
dv = DataValidation(type="list", formula1='"Anuitas,KMK Revolving"', allow_blank=False)
ws.add_data_validation(dv); dv.add("C5")
label(6, "Suku bunga (% p.a.)"); inp(6, 11, "0.00")
label(7, "Tenor (bulan)"); inp(7, 60, "0")
label(8, "Plafon diajukan (Rp) — opsional"); inp(8, 0, RP)

section(10, "KEMAMPUAN BAYAR")
label(11, "Laba bersih per bulan (Rp)"); inp(11, 0, RP)
label(12, "Penyusutan per bulan (Rp)"); inp(12, 0, RP)
label(13, "Angsuran pinjaman existing per bulan (Rp)"); inp(13, 0, RP)
label(14, "DSCR minimum"); inp(14, 1.25, "0.00")

section(16, "KEBUTUHAN MODAL KERJA (KMK)")
label(17, "Omzet per bulan (Rp)"); inp(17, 0, RP)
label(18, "Margin laba kotor (%)"); inp(18, 20, "0.0")
label(19, "Trade cycle (hari)"); inp(19, 60, "0")
label(20, "Porsi pembiayaan bank (%)"); inp(20, 70, "0")
label(21, "KMK existing di bank lain (Rp)"); inp(21, 0, RP)

section(23, "AGUNAN")
for col, t in ((2, "Jenis agunan"), (3, "Nilai taksiran (Rp)"), (4, "LTV %"), (5, "Nilai × LTV")):
    ws.cell(24, col, t).font = Font(bold=True)
dv2 = DataValidation(type="list", formula1="=Parameter!$A$4:$A$9", allow_blank=True)
ws.add_data_validation(dv2)
for r in range(25, 29):
    c = ws.cell(r, 2, ltv[0][0] if r == 25 else None)
    c.fill = INPUT
    c.border = BOX
    dv2.add(c.coordinate)
    inp(r, 0, RP)
    d = ws.cell(r, 4, f'=IF(B{r}="","",IFERROR(VLOOKUP(B{r},Parameter!$A$4:$B$9,2,FALSE),0))')
    d.number_format = "0"
    e = ws.cell(r, 5, f'=IF(B{r}="",0,C{r}*D{r}/100)')
    e.number_format = RP

section(30, "HASIL")
rows = [
    (31, "Angsuran baru maksimal per bulan", "=MAX(0,(C11+C12)/C14-C13)"),
    (32, "Plafon menurut kemampuan bayar (DSCR)", '=IF(C11+C12<=0,0,IF(C5="KMK Revolving",IF(C6>0,C31/(C6/1200),0),IF(C6>0,PV(C6/1200,C7,-C31),C31*C7)))'),
    (33, "Plafon menurut agunan (nilai × LTV)", "=SUM(E25:E28)"),
    (34, "Kebutuhan modal kerja", "=C17*12*(1-C18/100)*C19/365"),
    (35, "Plafon menurut kebutuhan modal kerja", '=IF(AND(C5="KMK Revolving",C17>0),MAX(0,C34*C20/100-C21),0)'),
]
for r, t, f in rows:
    label(r, t)
    c = ws.cell(r, 3, f)
    c.number_format = RP
    c.border = BOX
label(37, "PLAFON MAKSIMAL INDIKATIF", bold=True)
big = ws.cell(37, 3, '=IFERROR(ROUNDDOWN(MIN(IF(C32>0,C32,9E+99),IF(C33>0,C33,9E+99),IF(AND(C5="KMK Revolving",C17>0),C35,9E+99))/Parameter!B12,0)*Parameter!B12,0)*(MIN(IF(C32>0,C32,9E+99),IF(C33>0,C33,9E+99),IF(AND(C5="KMK Revolving",C17>0),C35,9E+99))<9E+98)')
big.number_format = RP
big.font = Font(bold=True, size=13, color="006B73")
big.fill = RES
big.border = BOX
label(38, "Pembatas")
ws.cell(38, 3, '=IF(C37=0,"-",IF(AND(C32>0,C32<=IF(C33>0,C33,9E+99),C32<=IF(AND(C5="KMK Revolving",C17>0),C35,9E+99)),"Kemampuan bayar",IF(AND(C33>0,C33<=IF(AND(C5="KMK Revolving",C17>0),C35,9E+99)),"Agunan","Kebutuhan modal kerja")))')

section(40, "UJI PLAFON DIAJUKAN")
tests = [
    (41, "Angsuran / bunga per bulan", '=IF(C8<=0,0,IF(C5="KMK Revolving",C8*C6/1200,IF(C6>0,PMT(C6/1200,C7,-C8),C8/C7)))', RP),
    (42, "DSCR hasil", '=IF(C8<=0,"-",IFERROR((C11+C12)/(C13+C41),"-"))', "0.00"),
    (43, "DSCR memenuhi?", '=IF(C8<=0,"-",IF(C42>=C14,"YA","TIDAK"))', None),
    (44, "Coverage agunan (nilai × LTV ÷ plafon)", '=IF(OR(C8<=0,C33<=0),"-",C33/C8)', "0.0%"),
    (45, "Coverage memenuhi (≥ 100%)?", '=IF(OR(C8<=0,C33<=0),"-",IF(C33>=C8,"YA","TIDAK"))', None),
]
for r, t, f, fmt in tests:
    label(r, t)
    c = ws.cell(r, 3, f)
    c.border = BOX
    if fmt:
        c.number_format = fmt
ws["B47"] = "Catatan: hasil bersifat indikatif untuk diskusi awal; keputusan kredit tetap melalui analisa & persetujuan sesuai ketentuan."
ws["B47"].font = Font(italic=True, size=9, color="666666")
ws["B47"].alignment = Alignment(wrap_text=True)
ws.freeze_panes = "A4"
wb.calculation.fullCalcOnLoad = True
path = os.path.join(OUT, "Kalkulator-Kelayakan.xlsx")
wb.save(path)
print("OK", path)
