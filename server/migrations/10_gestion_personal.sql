-- =========================================
-- Script de Migración 10: Gestión de Personal (CRUD real de Operarios)
-- Habilita alta/edición/baja lógica de trabajadores desde el Coordinador.
-- La baja es lógica (Activo=0), no DELETE: Operarios(Id) tiene 4 FK
-- entrantes sin cascada (Puestos.OperarioAsignadoId, Puestos.IdWorkerOriginal,
-- Ausencias.OperarioId, LineasAsignacion.OperarioId) y además hay un ciclo
-- de FK Operarios<->Puestos (CurrentSlotId/TargetSlotId), así que un DELETE
-- real fallaría o perdería historial.
-- =========================================
USE SmartAssignDB;
GO

-- NOTA: Operarios.UpdatedAt ya existe físicamente en la base (DATETIME
-- NULL) — server.js la selecciona desde antes de esta migración, pero
-- ningún script versionado la había creado. Se documenta aquí para que el
-- esquema sea reproducible desde cero.
IF COL_LENGTH('Operarios', 'UpdatedAt') IS NULL
BEGIN
    ALTER TABLE Operarios ADD UpdatedAt DATETIME NULL;
END
GO

IF COL_LENGTH('Operarios', 'Activo') IS NULL
BEGIN
    ALTER TABLE Operarios ADD Activo BIT NOT NULL DEFAULT 1;
END
GO

IF COL_LENGTH('Operarios', 'FechaBaja') IS NULL
BEGIN
    ALTER TABLE Operarios ADD FechaBaja DATETIME2 NULL;
END
GO

IF COL_LENGTH('Operarios', 'MotivoBaja') IS NULL
BEGIN
    ALTER TABLE Operarios ADD MotivoBaja NVARCHAR(255) NULL;
END
GO
