import pandas as pd
import os

excel_file = "Base de Datos.xlsx"
if not os.path.exists(excel_file):
    print(f"Error: {excel_file} not found!")
    exit(1)

xl = pd.ExcelFile(excel_file)
print("Sheet Names in Excel:", xl.sheet_names)

for sheet in xl.sheet_names:
    print("\n" + "="*50)
    print(f"SHEET: {sheet}")
    print("="*50)
    df = xl.parse(sheet)
    print(f"Shape: {df.shape[0]} rows, {df.shape[1]} columns")
    print("Columns:", list(df.columns))
    print("\nFirst 5 rows:")
    print(df.head(5).to_string())
