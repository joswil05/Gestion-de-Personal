import pandas as pd

df = pd.read_excel("Base de Datos.xlsx", sheet_name="Puestos Fijos")
df = df.dropna(subset=["IdPuesto"]) # drop NaN rows

df["Line"] = df["IdPuesto"].apply(lambda x: str(x)[:3])

print("Puestos per Line and PerfilRequerido:")
pivot = pd.crosstab(df["Line"], df["PerfilRequerido"], margins=True)
print(pivot)
