import pypdf
import os

pdf_path = "Plan_Maestro_Coordinacion.pdf"
txt_path = "scratch/Plan_Maestro_Coordinacion.txt"

if not os.path.exists(pdf_path):
    print("PDF not found!")
else:
    reader = pypdf.PdfReader(pdf_path)
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(f"Pages: {len(reader.pages)}\n")
        for i, page in enumerate(reader.pages):
            f.write(f"\n--- PAGE {i+1} ---\n")
            f.write(page.extract_text())
    print("Success! PDF text written to", txt_path)
