import pandas as pd

excel_file = "Base de Datos.xlsx"
df = pd.read_excel(excel_file, sheet_name="Programa")
print("Columns:", df.columns.tolist())
print("Total rows:", len(df))
print(df.to_string())
