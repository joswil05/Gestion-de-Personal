import pandas as pd

df = pd.read_excel("Base de Datos.xlsx", sheet_name="Puestos Fijos")
print("Total rows:", len(df))
print("\nUnique PerfilRequerido:")
print(df["PerfilRequerido"].value_counts(dropna=False))

print("\nUnique SexoPreferente:")
print(df["SexoPreferente"].value_counts(dropna=False))

print("\nUnique NombrePuesto (First 20):")
print(df["NombrePuesto"].value_counts(dropna=False).head(20))

print("\nIdPuesto prefix structure:")
print(df["IdPuesto"].apply(lambda x: str(x)[:3]).value_counts())

print("\nSample records:")
print(df[["IdPuesto", "NombrePuesto", "SexoPreferente", "PerfilRequerido"]].head(15))
