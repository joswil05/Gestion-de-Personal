import pandas as pd

df = pd.read_excel("Base de Datos.xlsx", sheet_name="Puestos Fijos")
df = df.dropna(subset=["IdPuesto"])

print("Non-null TiempoEnPuesto:")
print(df[df["TiempoEnPuesto"].notna()][["IdPuesto", "NombrePuesto", "TiempoEnPuesto"]])

print("\nNon-null TiempoMinRecuperacion:")
print(df[df["TiempoMinRecuperacion"].notna()][["IdPuesto", "NombrePuesto", "TiempoMinRecuperacion"]])
