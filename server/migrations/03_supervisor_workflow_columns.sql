-- =========================================
-- Script de Migración 03: Columnas para el flujo real de Supervisor
-- (asignación, liberación, baja temporal, relevos ergonómicos y despacho
-- entre líneas) — reemplaza el comportamiento que antes vivía únicamente
-- en el mock de Firestore.
-- =========================================
USE SmartAssignDB;
GO

-- 1. Tabla Puestos: reloj de fatiga, bandera de relevo solicitado,
--    blacklist de relevistas que ya rechazaron ese puesto, y tipo de puesto
--    (fijo/crítico vs. vario) para que el frontend pueda agrupar sin adivinar
--    por nombre.
IF COL_LENGTH('Puestos', 'AssignedAt') IS NULL
BEGIN
    ALTER TABLE Puestos ADD AssignedAt DATETIME2 NULL;
END
GO

IF COL_LENGTH('Puestos', 'RelevoSolicitado') IS NULL
BEGIN
    ALTER TABLE Puestos ADD RelevoSolicitado BIT NOT NULL DEFAULT 0;
END
GO

IF COL_LENGTH('Puestos', 'RejectedWorkerIdsJson') IS NULL
BEGIN
    ALTER TABLE Puestos ADD RejectedWorkerIdsJson NVARCHAR(MAX) NULL;
END
GO

IF COL_LENGTH('Puestos', 'TipoPuesto') IS NULL
BEGIN
    ALTER TABLE Puestos ADD TipoPuesto NVARCHAR(50) NULL;
END
GO

-- 2. Tabla Operarios: ubicación física real, puesto actual, y campos de
--    tránsito (despacho hacia otra línea / puesto destino).
IF COL_LENGTH('Operarios', 'CurrentSlotId') IS NULL
BEGIN
    ALTER TABLE Operarios ADD CurrentSlotId INT NULL;
    ALTER TABLE Operarios ADD CONSTRAINT FK_Operarios_CurrentSlot FOREIGN KEY (CurrentSlotId) REFERENCES Puestos(Id);
END
GO

IF COL_LENGTH('Operarios', 'PhysicalLineLocation') IS NULL
BEGIN
    ALTER TABLE Operarios ADD PhysicalLineLocation NVARCHAR(50) NULL;
END
GO

IF COL_LENGTH('Operarios', 'LineaDestinoId') IS NULL
BEGIN
    ALTER TABLE Operarios ADD LineaDestinoId NVARCHAR(50) NULL;
END
GO

IF COL_LENGTH('Operarios', 'TargetSlotId') IS NULL
BEGIN
    ALTER TABLE Operarios ADD TargetSlotId INT NULL;
    ALTER TABLE Operarios ADD CONSTRAINT FK_Operarios_TargetSlot FOREIGN KEY (TargetSlotId) REFERENCES Puestos(Id);
END
GO

-- 3. Normalizar el default roto de EstadoActual ('Activo' no es un estado
--    válido de la máquina de 6 estados: INACTIVO, POOL_ARRANQUE, ASIGNADO,
--    EN_TRANSITO, DISPONIBLE_BOLSON, BAJA_TEMPORAL).
IF EXISTS (
    SELECT * FROM sys.default_constraints dc
    JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
    WHERE dc.parent_object_id = OBJECT_ID('Operarios') AND c.name = 'EstadoActual'
)
BEGIN
    DECLARE @dfName NVARCHAR(200);
    SELECT @dfName = dc.name
    FROM sys.default_constraints dc
    JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
    WHERE dc.parent_object_id = OBJECT_ID('Operarios') AND c.name = 'EstadoActual';

    EXEC('ALTER TABLE Operarios DROP CONSTRAINT ' + @dfName);
END
GO

ALTER TABLE Operarios ADD CONSTRAINT DF_Operarios_EstadoActual DEFAULT 'INACTIVO' FOR EstadoActual;
GO

UPDATE Operarios SET EstadoActual = 'INACTIVO' WHERE EstadoActual = 'Activo';
GO

-- 4. Normalizar el vocabulario de estados de Puestos ('disponible'/'ocupado'
--    en español-minúscula → VACANTE/ASIGNADO, el enum que SlotCard.jsx y el
--    resto de la UI de Supervisor ya interpretan para colores/micro-copia).
UPDATE Puestos SET Estado = 'VACANTE' WHERE Estado = 'disponible';
UPDATE Puestos SET Estado = 'ASIGNADO' WHERE Estado = 'ocupado';
GO

IF EXISTS (
    SELECT * FROM sys.default_constraints dc
    JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
    WHERE dc.parent_object_id = OBJECT_ID('Puestos') AND c.name = 'Estado'
)
BEGIN
    DECLARE @dfNamePuestos NVARCHAR(200);
    SELECT @dfNamePuestos = dc.name
    FROM sys.default_constraints dc
    JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
    WHERE dc.parent_object_id = OBJECT_ID('Puestos') AND c.name = 'Estado';

    EXEC('ALTER TABLE Puestos DROP CONSTRAINT ' + @dfNamePuestos);
END
GO

ALTER TABLE Puestos ADD CONSTRAINT DF_Puestos_Estado DEFAULT 'VACANTE' FOR Estado;
GO
