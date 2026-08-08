-- =========================================
-- Script de Migración 04: Configuración real de Línea/SKU/Turno
-- Reemplaza los documentos 'config/line_{lineId}', 'config/global_priority'
-- y 'config/shift_status' (hasta ahora simulados por el mock de Firestore)
-- por tablas reales en SQL Server. Base del Motor 1 (inyección de turno).
-- =========================================
USE SmartAssignDB;
GO

-- 1. Tabla Lineas (una fila por línea de producción, estado + SKU del día)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Lineas')
BEGIN
    CREATE TABLE Lineas (
        LineId NVARCHAR(50) PRIMARY KEY,
        -- NOTA: el default es INACTIVA (no PREPARACION). HudPlanta.jsx dispara
        -- auto-asignación de fijos si status es PREPARACION o vacío; con
        -- INACTIVA como reposo real evitamos ese disparo antes de que el
        -- Coordinador corra el Motor 1.
        Status NVARCHAR(50) NOT NULL DEFAULT 'INACTIVA',
        Sku NVARCHAR(100) NULL,
        FijosAssigned BIT NOT NULL DEFAULT 0,
        TurnStartTimestamp DATETIME2 NULL,
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    PRINT 'Tabla Lineas creada correctamente.';
END
GO

IF NOT EXISTS (SELECT * FROM Lineas)
BEGIN
    INSERT INTO Lineas (LineId) VALUES
    ('L1'), ('L2'), ('L3'), ('L4'), ('L5'), ('L6'), ('L7'), ('L8'), ('L9'), ('L10');
END
GO

-- 2. Tabla ConfiguracionGlobal (fila única: prioridad de planta + estado de turno)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ConfiguracionGlobal')
BEGIN
    CREATE TABLE ConfiguracionGlobal (
        Id INT NOT NULL PRIMARY KEY CHECK (Id = 1),
        PriorityOrderJson NVARCHAR(MAX) NOT NULL,
        ShiftStatus NVARCHAR(50) NOT NULL DEFAULT 'PREPARACION',
        ShiftStartTimestamp DATETIME2 NULL,
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    PRINT 'Tabla ConfiguracionGlobal creada correctamente.';
END
GO

IF NOT EXISTS (SELECT * FROM ConfiguracionGlobal)
BEGIN
    INSERT INTO ConfiguracionGlobal (Id, PriorityOrderJson) VALUES
    (1, N'["L4","L1","L2","L6","L7","L5","L3","L8","L9","L10"]');
END
GO
