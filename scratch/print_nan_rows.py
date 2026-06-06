import pandas as pd

df = pd.read_excel("Base de Datos.xlsx", sheet_name="Puestos Fijos")
print(df[df["IdPuesto"].isna() | df["NombrePuesto"].isna()])
