-- =========================================
-- Script de Migración 05: Columnas para datos reales de planta
-- Habilita la siembra completa de Puestos reales (ver
-- server/migrate_real_data_fase3.js y src/dev/realDataSeed.js).
-- =========================================
USE SmartAssignDB;
GO

-- Titular persistente del puesto (Rastro Dual): quién "es dueño" de esta
-- máquina cuando está presente. Antes no existía este dato; ahora sí, viene
-- de REAL_PUESTOS.idWorkerOriginal.
IF COL_LENGTH('Puestos', 'IdWorkerOriginal') IS NULL
BEGIN
    ALTER TABLE Puestos ADD IdWorkerOriginal INT NULL;
    ALTER TABLE Puestos ADD CONSTRAINT FK_Puestos_IdWorkerOriginal FOREIGN KEY (IdWorkerOriginal) REFERENCES Operarios(Id);
END
GO

-- Puesto vario que solo se activa para ciertos SKU (ver REAL_SKU_SLOTS).
IF COL_LENGTH('Puestos', 'IsSkuDependent') IS NULL
BEGIN
    ALTER TABLE Puestos ADD IsSkuDependent BIT NOT NULL DEFAULT 0;
END
GO

IF COL_LENGTH('Puestos', 'RequiredSkusJson') IS NULL
BEGIN
    ALTER TABLE Puestos ADD RequiredSkusJson NVARCHAR(MAX) NULL;
END
GO

-- Clave natural para poder re-sembrar Puestos de forma idempotente (mismo
-- patrón que Operarios.LegacyWorkerId).
IF COL_LENGTH('Puestos', 'LegacyPuestoId') IS NULL
BEGIN
    ALTER TABLE Puestos ADD LegacyPuestoId NVARCHAR(50) NULL;
END
GO
