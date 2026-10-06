"""Generates SYNTHETIC test PDFs (no real patient data). Output: supabase/functions/_fixtures/*.pdf"""
import io, os, sys
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'supabase', 'functions', '_fixtures')
os.makedirs(OUT, exist_ok=True)

def lab(name, date_label, hba1c, ldl, patient='Asha Synthetic', dob='12 Apr 1985'):
    c = canvas.Canvas(os.path.join(OUT, name), pagesize=A4, invariant=1)
    y = 800
    for line in [
        'SYNTHETIC DIAGNOSTICS LAB - TEST DATA ONLY',
        f'Patient: {patient}', f'DOB: {dob}', f'Collection date: {date_label}',
        'Test Result Unit Reference',
        f'HbA1c {hba1c} % 4.0 - 5.6',
        f'LDL Cholesterol {ldl} mg/dL < 100',
    ]:
        c.drawString(60, y, line); y -= 22
    c.save()

lab('report_a.pdf', '15 Jan 2026', '5.8', '120')
lab('report_b.pdf', '15 Apr 2026', '6.1', '135')
lab('report_c.pdf', '15 Jul 2026', '5.9', '128')
lab('wrong_patient.pdf', '15 Jan 2026', '5.8', '120', patient='Ravi Notyou', dob='03 Nov 1971')

# Ambiguous value + ambiguous date + missing value on one page
c = canvas.Canvas(os.path.join(OUT, 'ambiguous.pdf'), pagesize=A4, invariant=1)
y = 800
for line in ['SYNTHETIC DIAGNOSTICS LAB - TEST DATA ONLY', 'Patient: Asha Synthetic', 'Collection date: 05/06/2026',
             'HbA1c 5.8-6.1 % 4.0 - 5.6', 'LDL Cholesterol - mg/dL < 100']:
    c.drawString(60, y, line); y -= 22
c.save()

# Image-only (scanned) PDF: a raster image of text, no text layer.
img = Image.new('RGB', (1240, 1754), 'white')
d = ImageDraw.Draw(img)
d.text((100, 100), 'SYNTHETIC SCANNED REPORT  HbA1c 5.8 %', fill='black')
buf = io.BytesIO(); img.save(buf, 'JPEG')
buf.seek(0)
c = canvas.Canvas(os.path.join(OUT, 'scanned.pdf'), pagesize=A4, invariant=1)
from reportlab.lib.utils import ImageReader
c.drawImage(ImageReader(buf), 0, 0, width=595, height=842)
c.save()

# Malformed: truncated PDF header + junk
with open(os.path.join(OUT, 'malformed.pdf'), 'wb') as f:
    f.write(b'%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\nthis is not a valid pdf body\n')
print('ok')

# Password-protected PDF
import pikepdf
with pikepdf.open(os.path.join(OUT, 'report_a.pdf')) as pdf:
    pdf.save(os.path.join(OUT, 'encrypted.pdf'), encryption=pikepdf.Encryption(owner='o', user='u'))
