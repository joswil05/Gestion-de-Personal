import pandas as pd

df = pd.read_excel("Base de Datos.xlsx", sheet_name="Puestos Fijos")
df = df.dropna(subset=["IdPuesto"])

print(df[df["IdPuesto"].str.startswith("L07")])
