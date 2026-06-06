import pandas as pd

df = pd.read_excel("Base de Datos.xlsx", sheet_name="Puestos Fijos")
print(f"Total Rows: {len(df)}")
print(df.info())

# Let's inspect the unique values of some fields to understand the data
print("\nUnique NombrePuesto count:", df['NombrePuesto'].nunique())
print("Unique SexoPreferente values:", df['SexoPreferente'].unique())
print("Unique PerfilRequerido values:", df['PerfilRequerido'].unique())

# Let's see some samples of the data
print("\nFirst 30 rows:")
print(df[['IdPuesto', 'NombrePuesto', 'SexoPreferente', 'TiempoEnPuesto', 'TiempoMinRecuperacion', 'PerfilRequerido']].head(30).to_string())
