-- =========================================
-- Script de Migración 11: Doble Turno + Eventos de Producción
-- Habilita, contra tablas reales, las últimas rutas de escritura que
-- todavía dependían del mock de Firestore (ver AUDIT_REPORT.md, Fase 1
-- paso 1.5, Grupo B):
--   - PATCH /api/operarios/:id/doble-turno (marca previa a Cierre de Turno)
--   - POST  /api/lineas/:lineId/sku-finalizado (registro de fin de corrida,
--     alimenta GET /api/config/production_reports para el panel del
--     Coordinador, que hasta ahora leía un doc de Firestore huérfano)
-- =========================================
USE SmartAssignDB;
GO

IF COL_LENGTH('Operarios', 'DobleTurnoActivo') IS NULL
BEGIN
    ALTER TABLE Operarios ADD DobleTurnoActivo BIT NOT NULL DEFAULT 0;
END
GO

IF OBJECT_ID('EventosProduccion', 'U') IS NULL
BEGIN
    CREATE TABLE EventosProduccion (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        LineId NVARCHAR(10) NOT NULL,
        Sku NVARCHAR(100) NOT NULL,
        EventType NVARCHAR(50) NOT NULL DEFAULT 'SKU_FINALIZADO',
        CreatedBy INT NULL REFERENCES Usuarios(Id),
        Timestamp DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_EventosProduccion_Timestamp ON EventosProduccion(Timestamp DESC);
END
GO
