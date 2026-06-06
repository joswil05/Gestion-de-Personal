import pandas as pd

excel_file = "Base de Datos.xlsx"
df = pd.read_excel(excel_file, sheet_name="Programa")

# Keep only non-empty columns
df = df.dropna(how='all', axis=1)

print("Non-empty columns:", df.columns.tolist())
print(f"Total rows: {len(df)}")
print("\nUnique dates in Programa:")
print(df['FechaProd'].unique())

print("\nAll Production Orders in Excel:")
for idx, row in df.iterrows():
    print(f"Row {idx+1}: Date: {row['FechaProd']} | Line: {row['Linea']} | Order: {row['OrdenProceso']} | Item/SKU: {row['Item']} | Cajas: {row['Cajas']} | Botellas: {row['Botellas']} | Comentario: {row['Comentario']}")
